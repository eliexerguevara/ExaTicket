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
 * ── Auth modes ──────────────────────────────────────────────────────────────
 *   Option A (preferred): API Token — set ZABBIX_API_TOKEN
 *     Works with Zabbix 5.4 and above.
 *     Generate in Zabbix UI: Administration → API tokens → Create API token.
 *
 *   Option B: User / Password — set ZABBIX_API_USER + ZABBIX_API_PASSWORD
 *     Works with all Zabbix versions.
 *     Use a read-only user with access to the relevant host groups.
 *
 * ── Required env vars ───────────────────────────────────────────────────────
 *   ZABBIX_API_URL      https://zabbix.domain.com/api_jsonrpc.php
 *   ZABBIX_API_TOKEN    (Option A — preferred)
 *   ZABBIX_API_USER     (Option B — with password)
 *   ZABBIX_API_PASSWORD (Option B — with user)
 */

import axios from "axios";
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

// ─── Auth token cache ─────────────────────────────────────────────────────────

let _sessionCache: { token: string; expiresAt: number } | null = null;

const invalidateSession = () => { _sessionCache = null; };

/**
 * Authenticate with Zabbix user.login and cache the session token.
 * Not used when ZABBIX_API_TOKEN is set.
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

  // Cache for 22 hours (Zabbix default session timeout is 30 days,
  // but we refresh conservatively to avoid surprise expirations).
  _sessionCache = { token, expiresAt: Date.now() + 22 * 60 * 60 * 1000 };
  return token;
};

// ─── JSON-RPC helper ──────────────────────────────────────────────────────────

/**
 * Send a single Zabbix API JSON-RPC request.
 * Handles both authentication styles transparently.
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
    // Zabbix 5.4+ token: send as Authorization header
    headers["Authorization"] = `Bearer ${auth}`;
  }

  const body: Record<string, any> = {
    jsonrpc: "2.0",
    method,
    params,
    id
  };

  // For session tokens (user.login), include auth in JSON body
  if (!isBearer) {
    body.auth = auth;
  }

  const { data } = await axios.post(apiUrl, body, {
    headers,
    timeout: 8_000
  });

  if (data?.error) {
    throw new Error(
      `Zabbix API error [${data.error.code}]: ${data.error.data || data.error.message}`
    );
  }

  return data?.result;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a CPE with the given IP address is online, according to
 * Zabbix's last ICMP ping cycle.
 *
 * Returns null when:
 *  - Zabbix is not configured (env vars missing)
 *  - The IP is not found in Zabbix (host not monitored)
 *  - The API call fails (network error, auth error, etc.)
 *
 * @param ip  IPv4 address assigned to the customer's service
 */
export const checkHostPing = async (
  ip: string
): Promise<ZabbixPingResult | null> => {
  const apiUrl   = process.env.ZABBIX_API_URL?.trim();
  const apiToken = process.env.ZABBIX_API_TOKEN?.trim();
  const apiUser  = process.env.ZABBIX_API_USER?.trim();
  const apiPass  = process.env.ZABBIX_API_PASSWORD?.trim();

  if (!apiUrl || !ip) return null;

  // Require at least one auth method
  if (!apiToken && !(apiUser && apiPass)) {
    logger.warn({ info: "Zabbix: no auth credentials configured (ZABBIX_API_TOKEN or USER+PASSWORD)" });
    return null;
  }

  try {
    // Resolve auth token (Bearer API token OR user.login session)
    const isBearer = !!apiToken;
    const auth = isBearer
      ? apiToken!
      : await getSessionToken(apiUrl, apiUser!, apiPass!);

    // ── Step 1: find the Zabbix host by interface IP ──────────────────────────
    const hosts = await zabbixCall(
      apiUrl, auth, isBearer,
      "host.get",
      {
        output: ["hostid", "host", "name"],
        selectInterfaces: ["ip", "type"],
        // Filter by any interface IP matching the customer IP
        filter: { ip: [ip] }
      },
      2
    );

    if (!Array.isArray(hosts) || hosts.length === 0) {
      // IP not monitored in Zabbix — silently return null (not an error)
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
        // Zabbix built-in ICMP ping template items
        // icmpping   → 0 (offline) or 1 (online)
        // icmppingsec → round-trip time in seconds (e.g. 0.002)
        search: { key_: "icmpping" },
        searchWildcardsEnabled: false,
        sortfield: "key_"
      },
      3
    );

    if (!Array.isArray(items) || items.length === 0) {
      // Host exists but has no ICMP ping items — Zabbix template not assigned
      return null;
    }

    const pingItem    = items.find((i: any) => i.key_ === "icmpping");
    const pingSecItem = items.find((i: any) => i.key_ === "icmppingsec");

    if (!pingItem) return null;

    const online = pingItem.lastvalue === "1";

    // Convert icmppingsec (seconds) → milliseconds string
    let latency: string | null = null;
    if (online && pingSecItem?.lastvalue) {
      const secs = parseFloat(pingSecItem.lastvalue);
      if (!isNaN(secs) && secs > 0) {
        latency = `${(secs * 1000).toFixed(1)}ms`;
      }
    }

    // lastclock is a Unix timestamp string
    const checkedAt = pingItem.lastclock
      ? parseInt(pingItem.lastclock, 10) * 1000
      : undefined;

    return { online, latency, checkedAt };
  } catch (err: any) {
    // Invalidate session on any error so next call retries auth
    invalidateSession();
    logger.warn({ info: `Zabbix: checkHostPing failed for IP ${ip} — ${err?.message}` });
    return null;
  }
};

/**
 * Test Zabbix API connectivity and return the Zabbix server version.
 * Useful for the settings/test connection UI.
 */
export const testZabbixConnection = async (): Promise<{
  ok: boolean;
  message: string;
  version?: string;
}> => {
  const apiUrl   = process.env.ZABBIX_API_URL?.trim();
  const apiToken = process.env.ZABBIX_API_TOKEN?.trim();
  const apiUser  = process.env.ZABBIX_API_USER?.trim();
  const apiPass  = process.env.ZABBIX_API_PASSWORD?.trim();

  if (!apiUrl) return { ok: false, message: "ZABBIX_API_URL no configurado" };
  if (!apiToken && !(apiUser && apiPass)) {
    return { ok: false, message: "Sin credenciales Zabbix (token o usuario/contraseña)" };
  }

  try {
    invalidateSession();

    const isBearer = !!apiToken;
    const auth = isBearer
      ? apiToken!
      : await getSessionToken(apiUrl, apiUser!, apiPass!);

    // apiinfo.version does not require auth
    const versionData = await axios.post(
      apiUrl,
      { jsonrpc: "2.0", method: "apiinfo.version", params: {}, id: 1 },
      { timeout: 8_000 }
    );
    const version: string = versionData.data?.result || "unknown";

    // Verify we can read hosts (basic access check)
    const hosts = await zabbixCall(
      apiUrl, auth, isBearer,
      "host.get",
      { output: ["hostid"], limit: 1 },
      2
    );
    const count = Array.isArray(hosts) ? hosts.length : 0;

    return {
      ok: true,
      message: `Conexión exitosa. Zabbix v${version}. Hosts accesibles: ${count}+`,
      version
    };
  } catch (err: any) {
    invalidateSession();
    return {
      ok: false,
      message: err?.message || "Error de conexión con Zabbix"
    };
  }
};
