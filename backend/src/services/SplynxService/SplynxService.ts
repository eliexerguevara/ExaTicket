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

const getAuthToken = async (
  apiUrl: string,
  apiKey: string,
  apiSecret: string
): Promise<string> => {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const resp = await axios.post(
    `${apiUrl}/api/2.0/auth/tokens`,
    { auth_type: "api_key", key: apiKey, secret: apiSecret },
    { timeout: 10000 }
  );

  const token: string =
    resp.data?.access_token || resp.data?.response?.access_token || "";
  if (!token) throw new Error("Splynx: no access_token in auth response");

  // Cache 23 h (tokens are usually valid 24 h)
  _tokenCache = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return token;
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
  try {
    apiUrl = (await CheckSettings("splynxApiUrl")).replace(/\/$/, "");
    apiKey = await CheckSettings("splynxApiKey");
    apiSecret = await CheckSettings("splynxApiSecret");
  } catch {
    return null;
  }

  if (!apiUrl || !apiKey || !apiSecret) return null;

  const token = await getAuthToken(apiUrl, apiKey, apiSecret);

  return axios.create({
    baseURL: `${apiUrl}/api/2.0`,
    headers: {
      Authorization: `Splynx-EA ${token}`,
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
      const { data } = await client.get("/customers/customer", {
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

    const { data } = await client.get("/customers/customer", {
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
      `/customers/customer/${customerId}/internet-service`
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

    const { data } = await client.get("/helpdesk/tickets", {
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

/** Check if there is an open "Falla General" ticket in Splynx */
export const checkGeneralOutage = async (): Promise<SplynxTicket | null> => {
  try {
    const client = await buildClient();
    if (!client) return null;

    const { data } = await client.get("/helpdesk/tickets", {
      params: {
        "search[status]": "open",
        "search[type]": "Falla General",
        items_per_page: 5
      }
    });
    const list: SplynxTicket[] = unwrap(data);
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
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
  priority: "low" | "medium" | "high" | "critical" = "medium"
): Promise<SplynxTicket | null> => {
  try {
    const client = await buildClient();
    if (!client) return null;

    const { data } = await client.post("/helpdesk/tickets", {
      customer_id: customerId,
      subject,
      message,
      priority,
      status: "open"
    });
    const ticket = unwrap(data);
    logger.info(`Splynx: ticket created id=${ticket?.id} for customer ${customerId}`);
    return ticket || null;
  } catch (err) {
    logger.error(err, "Splynx: createSplynxTicket error");
    return null;
  }
};

// ─── Context builder for AI ───────────────────────────────────────────────────

/**
 * Builds a structured text block with all Splynx data about the caller.
 * This is injected into the AI system prompt before each response.
 */
export const buildSplynxContext = async (phone: string): Promise<string> => {
  try {
    const customer = await findCustomerByPhone(phone);

    if (!customer) {
      return (
        "=== SPLYNX ===\n" +
        "Cliente NO encontrado por número de teléfono.\n" +
        "INSTRUCCIÓN: Solicitar el número de teléfono registrado en el contrato o el nombre completo del titular antes de continuar.\n" +
        "=== FIN SPLYNX ==="
      );
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

    // General outage block
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
    return lines.join("\n");
  } catch (err) {
    logger.error(err, "Splynx: buildSplynxContext error");
    return "";
  }
};

/** Test connectivity: authenticate and return customer count */
export const testConnection = async (
  apiUrl: string,
  apiKey: string,
  apiSecret: string
): Promise<{ ok: boolean; message: string }> => {
  try {
    invalidateToken();
    const token = await getAuthToken(
      apiUrl.replace(/\/$/, ""),
      apiKey,
      apiSecret
    );
    if (!token) return { ok: false, message: "Sin token en la respuesta" };

    const client = axios.create({
      baseURL: `${apiUrl.replace(/\/$/, "")}/api/2.0`,
      headers: { Authorization: `Splynx-EA ${token}` },
      timeout: 8000
    });

    const { data } = await client.get("/customers/customer", {
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
