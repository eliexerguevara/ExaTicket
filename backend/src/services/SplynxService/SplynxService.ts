import axios, { AxiosInstance } from "axios";
import CheckSettings from "../../helpers/CheckSettings";
import { logger } from "../../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SplynxCustomer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  status: string; // active | inactive | blocked | lead
}

export interface SplynxInternetService {
  id: number;
  customer_id: number;
  login?: string;
  status: string; // active | inactive | disabled
  tariff_plan?: string;
  ipv4?: string;
  mac?: string;
  online?: boolean;
  last_online?: string;
  router_mac?: string;
}

export interface SplynxTicket {
  id: number;
  subject: string;
  status: string; // open | pending | solved | closed
  priority: string; // low | medium | high | critical
  type?: string;
  message?: string;
  created_at: string;
  last_activity?: string;
  customer_id?: number;
}

// ─── Token cache ──────────────────────────────────────────────────────────────

let _tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Try multiple auth strategies in order until one returns a token.
 * 1. api_key (addon key)
 * 2. administrator (admin login/password)
 */
const getAuthToken = async (
  apiUrl: string,
  apiKey: string,
  apiSecret: string,
  adminLogin?: string,
  adminPassword?: string
): Promise<string> => {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  // Splynx API v2 token endpoint is admin/auth/tokens (NOT auth/tokens)
  const endpoint = `${apiUrl}/api/2.0/admin/auth/tokens`;

  const strategies: Array<{ label: string; body: Record<string, string> }> = [];

  if (apiKey && apiSecret) {
    strategies.push({
      label: "api_key",
      body: { auth_type: "api_key", key: apiKey, secret: apiSecret }
    });
  }
  if (adminLogin && adminPassword) {
    strategies.push({
      // auth_type must be "admin" NOT "administrator" in Splynx API v2
      label: "admin",
      body: { auth_type: "admin", login: adminLogin, password: adminPassword }
    });
  }

  let lastError: Error | null = null;
  for (const { label, body } of strategies) {
    try {
      const resp = await axios.post(endpoint, body, { timeout: 10000 });
      const token: string =
        resp.data?.access_token || resp.data?.response?.access_token || "";
      if (token) {
        logger.info({ info: `Splynx auth OK via ${label}` });
        _tokenCache = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
        return token;
      }
    } catch (e: any) {
      lastError = e;
      logger.warn({ info: `Splynx auth ${label} failed`, msg: e?.message });
    }
  }

  throw lastError || new Error("Splynx: all auth strategies failed");
};

// Invalidate cache so next request forces a re-auth
const invalidateToken = () => {
  _tokenCache = null;
};

// ─── HTTP client factory ──────────────────────────────────────────────────────

const buildClient = async (): Promise<AxiosInstance | null> => {
  let enabled = false;
  try {
    enabled = (await CheckSettings("splynxEnabled")) === "enabled";
  } catch {
    return null;
  }
  if (!enabled) return null;

  let apiUrl = "";
  let apiKey = "";
  let apiSecret = "";
  let adminLogin = "";
  let adminPassword = "";
  try {
    apiUrl        = (await CheckSettings("splynxApiUrl")).replace(/\/$/, "");
    apiKey        = await CheckSettings("splynxApiKey").catch(() => "");
    apiSecret     = await CheckSettings("splynxApiSecret").catch(() => "");
    adminLogin    = await CheckSettings("splynxAdminLogin").catch(() => "");
    adminPassword = await CheckSettings("splynxAdminPassword").catch(() => "");
  } catch {
    return null;
  }

  if (!apiUrl) return null;
  if (!apiKey && !adminLogin) return null;

  const token = await getAuthToken(apiUrl, apiKey, apiSecret, adminLogin, adminPassword);

  // Splynx API v2 expects: Authorization: Splynx-EA (access_token=TOKEN)
  return axios.create({
    baseURL: `${apiUrl}/api/2.0`,
    headers: {
      Authorization: `Splynx-EA (access_token=${token})`,
      "Content-Type": "application/json"
    },
    timeout: 10000
  });
};

/** Unwrap Splynx response (can be in .response or directly in .data) */
const unwrap = (data: any): any => {
  if (Array.isArray(data)) return data;
  if (data?.response !== undefined) return data.response;
  return data;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/** Search a customer by phone number (tries full and last-10-digits) */
export const findCustomerByPhone = async (
  phone: string
): Promise<SplynxCustomer | null> => {
  try {
    const client = await buildClient();
    if (!client) return null;

    const clean = phone.replace(/\D/g, "");

    const trySearch = async (q: string): Promise<SplynxCustomer | null> => {
      const { data } = await client.get("/admin/customers/customer", {
        params: { "search[phone]": q, items_per_page: 5 }
      });
      const list: SplynxCustomer[] = unwrap(data);
      return Array.isArray(list) && list.length > 0 ? list[0] : null;
    };

    const found = await trySearch(clean);
    if (found) return found;

    // Retry with last 10 digits (strips country prefix)
    if (clean.length > 10) {
      return trySearch(clean.slice(-10));
    }
    return null;
  } catch (err) {
    logger.error(err, "Splynx: findCustomerByPhone error");
    return null;
  }
};

/** Search customers by full or partial name */
export const findCustomersByName = async (
  name: string
): Promise<SplynxCustomer[]> => {
  try {
    const client = await buildClient();
    if (!client) return [];

    const { data } = await client.get("/admin/customers/customer", {
      params: { "search[name]": name, items_per_page: 10 }
    });
    const list = unwrap(data);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    logger.error(err, "Splynx: findCustomersByName error");
    return [];
  }
};

/** Get all internet services for a customer */
export const getCustomerServices = async (
  customerId: number
): Promise<SplynxInternetService[]> => {
  try {
    const client = await buildClient();
    if (!client) return [];

    const { data } = await client.get(
      `/admin/customers/customer/${customerId}/internet-services`
    );
    const list = unwrap(data);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    logger.error(err, "Splynx: getCustomerServices error");
    return [];
  }
};

/** Get recent tickets for a customer (last 10, newest first) */
export const getCustomerTickets = async (
  customerId: number
): Promise<SplynxTicket[]> => {
  try {
    const client = await buildClient();
    if (!client) return [];

    const { data } = await client.get("/admin/support/tickets", {
      params: {
        customer_id: customerId,
        items_per_page: 10,
        "sort[created_at]": "desc"
      }
    });
    const list = unwrap(data);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    logger.error(err, "Splynx: getCustomerTickets error");
    return [];
  }
};

/** Check if there is an active "Falla General" ticket in Splynx.
 *  Validates client-side to avoid false positives when the API
 *  doesn't support or ignores the subject filter. */
export const checkGeneralOutage = async (): Promise<SplynxTicket | null> => {
  try {
    const client = await buildClient();
    if (!client) return null;

    const { data } = await client.get("/admin/support/tickets", {
      params: {
        "search[subject]": "Falla General",
        items_per_page: 20
      }
    });
    const list: SplynxTicket[] = unwrap(data);
    if (!Array.isArray(list)) return null;

    // Client-side validation: only treat as outage if the ticket subject
    // actually contains outage keywords AND has an active status.
    // This guards against the API returning unrelated tickets.
    const ACTIVE_STATUSES = ["new", "open", "work in progress", "wait for response"];
    const outage = list.find(t => {
      const isOutageSubject = /falla\s+general|corte\s+general|avería\s+masiva/i.test(
        t.subject || ""
      );
      const statusLower = (t.status || "").toLowerCase();
      const isActive =
        ACTIVE_STATUSES.some(s => statusLower.includes(s)) ||
        !["solved", "closed"].includes(statusLower);
      return isOutageSubject && isActive;
    });

    return outage || null;
  } catch (err) {
    logger.error(err, "Splynx: checkGeneralOutage error");
    return null;
  }
};

/** Create a support ticket in Splynx */
export const createSplynxTicket = async (
  customerId: number,
  subject: string,
  message: string,
  priority: "low" | "medium" | "high" | "critical" = "medium",
  status: "open" | "solved" | "closed" = "open"
): Promise<SplynxTicket | null> => {
  try {
    const client = await buildClient();
    if (!client) return null;

    const { data } = await client.post("/admin/support/tickets", {
      customer_id: customerId,
      subject,
      message,
      priority,
      status
    });
    const ticket = unwrap(data);
    logger.info(
      `Splynx: ticket created id=${ticket?.id} status=${status} for customer ${customerId}`
    );
    return ticket || null;
  } catch (err) {
    logger.error(err, "Splynx: createSplynxTicket error");
    return null;
  }
};

// ─── Context builder for AI ───────────────────────────────────────────────────

/** Structured result from buildSplynxContext */
export interface SplynxContextResult {
  /** Full text block injected into AI system prompt */
  context: string;
  /** True only when a REAL "Falla General" ticket is active in Splynx */
  hasOutage: boolean;
  /** Splynx customer ID (null if not found) */
  customerId: number | null;
}

/**
 * Builds a structured text block with all Splynx data about the caller.
 * Returns metadata alongside the context string so callers can
 * react to outage / customer-id without re-parsing the text.
 */
export const buildSplynxContext = async (
  phone: string
): Promise<SplynxContextResult> => {
  try {
    const customer = await findCustomerByPhone(phone);

    if (!customer) {
      return {
        context:
          "=== SPLYNX ===\n" +
          "Cliente NO encontrado por número de teléfono.\n" +
          "INSTRUCCIÓN: Solicitar el número de teléfono registrado en el contrato o el nombre completo del titular antes de continuar.\n" +
          "=== FIN SPLYNX ===",
        hasOutage: false,
        customerId: null
      };
    }

    // Fetch all data in parallel
    const [services, tickets, generalOutage] = await Promise.all([
      getCustomerServices(customer.id),
      getCustomerTickets(customer.id),
      checkGeneralOutage()
    ]);

    const lines: string[] = [
      "=== DATOS DEL CLIENTE (SPLYNX) ===",
      `Nombre: ${customer.name}`,
      `ID Splynx: ${customer.id}`,
      `Teléfono: ${customer.phone}`,
      `Estado cuenta: ${customer.status}`,
      ""
    ];

    // General outage block — only added when checkGeneralOutage returned a real outage
    if (generalOutage) {
      lines.push(
        "⚠️  FALLA GENERAL ACTIVA EN EL SISTEMA:",
        `  Asunto: ${generalOutage.subject}`,
        `  Estado: ${generalOutage.status}`,
        `  Creado: ${generalOutage.created_at}`,
        "  INSTRUCCIÓN CRÍTICA: Informar al cliente sobre la falla general. NO crear tickets individuales. NO hacer troubleshooting.",
        ""
      );
    }

    // Services block
    if (services.length > 0) {
      lines.push("SERVICIOS DE INTERNET:");
      services.forEach(s => {
        const onlineStr = s.online ? "🟢 ONLINE" : "🔴 OFFLINE";
        lines.push(
          `  • Plan: ${s.tariff_plan || "N/A"} | Estado: ${s.status} | ${onlineStr}`
        );
        if (s.last_online) lines.push(`    Última conexión: ${s.last_online}`);
        if (s.ipv4) lines.push(`    IP asignada: ${s.ipv4}`);
        if (s.login) lines.push(`    Login PPPoE: ${s.login}`);
      });
      lines.push("");
    } else {
      lines.push("SERVICIOS: Sin servicios activos registrados.", "");
    }

    // Ticket history block
    if (tickets.length > 0) {
      lines.push(`HISTORIAL DE TICKETS (últimos ${tickets.length}):`);
      tickets.forEach(t => {
        lines.push(`  [${t.created_at}] ${t.subject} — ${t.status} (${t.priority})`);
      });
      lines.push("");
    }

    lines.push("=== FIN DATOS SPLYNX ===");

    return {
      context: lines.join("\n"),
      hasOutage: !!generalOutage,
      customerId: customer.id
    };
  } catch (err) {
    logger.error(err, "Splynx: buildSplynxContext error");
    return { context: "", hasOutage: false, customerId: null };
  }
};

/** Test connectivity: authenticate and return customer count */
export const testConnection = async (
  apiUrl: string,
  apiKey: string,
  apiSecret: string,
  adminLogin?: string,
  adminPassword?: string
): Promise<{ ok: boolean; message: string }> => {
  try {
    invalidateToken();
    const token = await getAuthToken(
      apiUrl.replace(/\/$/, ""),
      apiKey,
      apiSecret,
      adminLogin,
      adminPassword
    );
    if (!token) return { ok: false, message: "Sin token en la respuesta" };

    const client = axios.create({
      baseURL: `${apiUrl.replace(/\/$/, "")}/api/2.0`,
      headers: { Authorization: `Splynx-EA (access_token=${token})` },
      timeout: 8000
    });

    const { data } = await client.get("/admin/customers/customer", {
      params: { items_per_page: 1 }
    });
    const list = unwrap(data);
    const count = Array.isArray(list) ? list.length : "?";
    return { ok: true, message: `Conexión exitosa. Clientes accesibles: ${count}+` };
  } catch (err: any) {
    invalidateToken();
    const msg =
      err?.response?.data?.message ||
      err?.response?.statusText ||
      err?.message ||
      "Error de conexión";
    return { ok: false, message: msg };
  }
};
