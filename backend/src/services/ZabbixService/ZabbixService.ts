/**
 * ZabbixService.ts
 *
 * Queries an existing Zabbix monitoring server to check whether a customer's
 * CPE (router/ONT) is currently reachable, using the icmpping / icmppingsec
 * items that Zabbix already polls every minute.
 *
 * This is faster and lighter than triggering a new ping:
 *   netcheck.php → waits ~2–4 s for live ping
 *   Zabbix API   → reads cached value from last monitoring cycle (<100 ms)
 *
 * ── Credentials source ───────────────────────────────────────────────────────
 *   Credentials are stored in the Settings table (configured via the Settings UI).
 *   Keys: zabbixEnabled, zabbixApiUrl, zabbixApiToken, zabbixApiUser, zabbixApiPassword
 *
 * ── Auth modes ───────────────────────────────────────────────────────────────
 *   Option A (preferred): API Token  — set zabbixApiToken in Settings
 *     Works with Zabbix 5.4 and above.
 *     Generate in Zabbix UI: Administration → API tokens → Create API token.
 *
 *   Option B: User / Password — set zabbixApiUser + zabbixApiPassword in Settings
 *     Works with all Zabbix versions.
 *     Use a read-only user with access to the relevant host groups.
 */

import axios from "axios";
import CheckSettings from "../../helpers/CheckSettings";
import { logger } from "../../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZabbixPingResult {
  /** Whether the host responded to ICMP ping in the last Zabbix check cycle */
  online: boolean;
  /**
   * Round-trip latency from Zabbix icmppingsec item, converted to ms string.
   * null if the item does not exist or the host is offline.
   */
  latency: string | null;
  /** Unix timestamp (ms) when Zabbix last updated the icmpping value */
  checkedAt?: number;
}

// ─── Auth session cache ───────────────────────────────────────────────────────

let _sessionCache: { token: string; expiresAt: number } | null = null;

const invalidateSession = () => { _sessionCache = null; };

/**
 * Authenticate with Zabbix user.login and cache the session token.
 * Not called when API token auth is used.
 */
const getSessionToken = async (
  apiUrl: string,
  user: string,
  password: string
): Promise<string> => {
  if (_sessionCache && Date.now() < _sessionCache.expiresAt) {
    return _sessionCache.token;
  }

  const { data } = await axios.post(
    apiUrl,
    {
      jsonrpc: "2.0",
      method: "user.login",
      params: { user, password },
      id: 1
    },
    { timeout: 10_000 }
  );

  const token: string = data?.result;
  if (!token || typeof token !== "string") {
    throw new Error(`Zabbix auth failed: ${JSON.stringify(data?.error)}`);
  }

  // Cache for 22 hours (refresh conservatively before the session expires)
  _sessionCache = { token, expiresAt: Date.now() + 22 * 60 * 60 * 1000 };
  return token;
};

// ─── JSON-RPC helper ──────────────────────────────────────────────────────────

/**
 * Send a single Zabbix API JSON-RPC request.
 * Handles both auth styles: Bearer token (header) and session token (JSON body).
 */
const zabbixCall = async (
  apiUrl: string,
  auth: string,
  isBearer: boolean,
  method: string,
  params: object,
  id: number
): Promise<any> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (isBearer) {
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const body: Record<string, any> = { jsonrpc: "2.0", method, params, id };
  if (!isBearer) {
    body.auth = auth;
  }

  const { data } = await axios.post(apiUrl, body, { headers, timeout: 8_000 });

  if (data?.error) {
    throw new Error(
      `Zabbix API error [${data.error.code}]: ${data.error.data || data.error.message}`
    );
  }

  return data?.result;
};

// ─── Credential loader ────────────────────────────────────────────────────────

interface ZabbixCreds {
  apiUrl: string;
  apiToken: string;
  apiUser: string;
  apiPassword: string;
}

const loadCreds = async (): Promise<ZabbixCreds | null> => {
  try {
    const enabled = await CheckSettings("zabbixEnabled").catch(() => "disabled");
    if (enabled !== "enabled") return null;

    const [apiUrl, apiToken, apiUser, apiPassword] = await Promise.all([
      CheckSettings("zabbixApiUrl").catch(() => ""),
      CheckSettings("zabbixApiToken").catch(() => ""),
      CheckSettings("zabbixApiUser").catch(() => ""),
      CheckSettings("zabbixApiPassword").catch(() => "")
    ]);

    const url = apiUrl.trim();
    const tok = apiToken.trim();
    const usr = apiUser.trim();
    const pwd = apiPassword.trim();

    if (!url || !/^https?:\/\//i.test(url)) return null;
    if (!tok && !(usr && pwd)) return null;

    return { apiUrl: url, apiToken: tok, apiUser: usr, apiPassword: pwd };
  } catch {
    return null;
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a CPE with the given IP address is online, according to
 * Zabbix's last ICMP ping cycle.
 *
 * Returns null when:
 *  - Zabbix is disabled or not configured in Settings
 *  - The IP is not found in Zabbix (host not monitored → caller can fall back)
 *  - The API call fails for any reason
 *
 * @param ip  IPv4 address assigned to the customer's service
 */
export const checkHostPing = async (
  ip: string
): Promise<ZabbixPingResult | null> => {
  if (!ip) return null;

  const creds = await loadCreds();
  if (!creds) return null;

  const { apiUrl, apiToken, apiUser, apiPassword } = creds;

  try {
    const isBearer = !!apiToken;
    const auth = isBearer
      ? apiToken
      : await getSessionToken(apiUrl, apiUser, apiPassword);

    // ── Step 1: find the Zabbix host by interface IP ──────────────────────────
    const hosts = await zabbixCall(
      apiUrl, auth, isBearer,
      "host.get",
      {
        output: ["hostid", "host", "name"],
        selectInterfaces: ["ip", "type"],
        filter: { ip: [ip] }
      },
      2
    );

    if (!Array.isArray(hosts) || hosts.length === 0) {
      // IP not monitored in Zabbix — not an error, just not found
      return null;
    }

    const hostId = hosts[0].hostid;

    // ── Step 2: fetch icmpping + icmppingsec items ────────────────────────────
    const items = await zabbixCall(
      apiUrl, auth, isBearer,
      "item.get",
      {
        output: ["key_", "lastvalue", "lastclock"],
        hostids: [hostId],
        search: { key_: "icmpping" },
        searchWildcardsEnabled: false,
        sortfield: "key_"
      },
      3
    );

    if (!Array.isArray(items) || items.length === 0) return null;

    const pingItem    = items.find((i: any) => i.key_ === "icmpping");
    const pingSecItem = items.find((i: any) => i.key_ === "icmppingsec");

    if (!pingItem) return null;

    const online = pingItem.lastvalue === "1";

    let latency: string | null = null;
    if (online && pingSecItem?.lastvalue) {
      const secs = parseFloat(pingSecItem.lastvalue);
      if (!isNaN(secs) && secs > 0) {
        latency = `${(secs * 1000).toFixed(1)}ms`;
      }
    }

    const checkedAt = pingItem.lastclock
      ? parseInt(pingItem.lastclock, 10) * 1000
      : undefined;

    return { online, latency, checkedAt };
  } catch (err: any) {
    invalidateSession();
    logger.warn({ info: `Zabbix: checkHostPing failed for IP ${ip} — ${err?.message}` });
    return null;
  }
};

/**
 * Test Zabbix API connectivity using the provided credentials.
 * Credentials are passed directly (not read from DB) so the controller
 * can test values before they are saved.
 */
export const testZabbixConnection = async (
  apiUrl: string,
  apiToken: string,
  apiUser: string,
  apiPassword: string
): Promise<{ ok: boolean; message: string; version?: string }> => {
  const url   = apiUrl.trim();
  const tok   = apiToken.trim();
  const usr   = apiUser.trim();
  const pwd   = apiPassword.trim();

  if (!url) return { ok: false, message: "Falta el campo: URL del servidor Zabbix" };

  // Validate URL format — must start with http:// or https://
  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      message: `La URL debe comenzar con https:// o http://\nEj: https://zabbix.tuisp.com/api_jsonrpc.php`
    };
  }

  if (!tok && !(usr && pwd)) {
    return { ok: false, message: "Proporciona un API Token o Usuario + Contraseña" };
  }

  try {
    // Always get Zabbix version first (no auth required)
    const versionResp = await axios.post(
      url,
      { jsonrpc: "2.0", method: "apiinfo.version", params: {}, id: 1 },
      { timeout: 8_000 }
    );
    const version: string = versionResp.data?.result || "unknown";

    // Authenticate
    const isBearer = !!tok;
    let auth: string;
    if (isBearer) {
      auth = tok;
    } else {
      // Temp cache invalidation so the test doesn't use a stale session
      invalidateSession();
      auth = await getSessionToken(url, usr, pwd);
    }

    // Verify read access by fetching one host
    const hosts = await zabbixCall(url, auth, isBearer, "host.get", {
      output: ["hostid"],
      limit: 1
    }, 2);

    const count = Array.isArray(hosts) ? hosts.length : 0;

    return {
      ok: true,
      message: `Conexión exitosa. Zabbix v${version}. Hosts accesibles: ${count}+`,
      version
    };
  } catch (err: any) {
    invalidateSession();
    const msg =
      err?.response?.data?.error?.data ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "Error de conexión con Zabbix";
    return { ok: false, message: msg };
  }
};
