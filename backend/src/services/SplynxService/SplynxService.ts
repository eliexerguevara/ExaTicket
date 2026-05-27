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
  login?: string;         // PPPoE login — format often "user@SECTOR"
  status: string;         // active | inactive | disabled
  description?: string;   // tariff/plan description (actual API field)
  tariff_plan?: string;   // alias — kept for backward compat
  ipv4?: string;
  mac?: string;
  router_id?: number;     // NAS/router ID (0 or absent if unassigned)
}

/** Network device (MikroTik, CCR, etc.) that serves the customer */
export interface SplynxRouter {
  id: number;
  title?: string;   // human name, e.g. "MAVILLA SITE 6"
  ip?: string;      // management IP
  nas_ip?: string;
  model?: string;
  status?: string | null;
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

/** Get a single router/NAS device by its Splynx ID */
export const getRouter = async (routerId: number): Promise<SplynxRouter | null> => {
  if (!routerId || routerId <= 0) return null;
  try {
    const client = await buildClient();
    if (!client) return null;
    const { data } = await client.get(`/admin/networking/routers/${routerId}`);
    const r = unwrap(data);
    return r && typeof r === "object" && r.id ? (r as SplynxRouter) : null;
  } catch (err) {
    logger.error(err, `Splynx: getRouter(${routerId}) error`);
    return null;
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

/** Extract the sector/site from a PPPoE login string (e.g. "user@VAPUEBLO-SEC02" → "VAPUEBLO-SEC02") */
const parseSector = (login?: string): string | null => {
  if (!login) return null;
  const parts = login.split("@");
  return parts.length > 1 ? parts[1].trim() : null;
};

/**
 * Builds a structured text block with all Splynx data about the caller.
 * Returns metadata alongside the context string so callers can
 * react to outage / customer-id without re-parsing the text.
 *
 * @param phone           - Customer phone number to look up
 * @param isFirstMessage  - True only on the FIRST AI message in Phase 3.
 *                          Adds the "Encontré tu servicio" greeting instruction.
 */
export const buildSplynxContext = async (
  phone: string,
  isFirstMessage = false
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

    // ── Greeting instruction (first message only) ──────────────────────────────
    if (isFirstMessage) {
      lines.push(
        `INSTRUCCIÓN DE SALUDO (solo en ESTA respuesta):`,
        `  Di exactamente: "Hola ${customer.name}, encontré tu servicio en el sistema."`,
        `  Luego continúa con el diagnóstico indicado abajo.`,
        ""
      );
    }

    // ── General outage block ───────────────────────────────────────────────────
    if (generalOutage) {
      lines.push(
        "⚠️  FALLA GENERAL ACTIVA EN EL SISTEMA:",
        `  Asunto: ${generalOutage.subject}`,
        `  Estado: ${generalOutage.status}`,
        `  Creado: ${generalOutage.created_at}`,
        "  INSTRUCCIÓN CRÍTICA: Informar al cliente sobre la falla general. NO hacer troubleshooting individual.",
        ""
      );
    }

    // ── Service status diagnosis ───────────────────────────────────────────────
    const activeServices = services.filter(s => s.status === "active");
    const primaryService = services[0]; // first service regardless of status

    if (services.length === 0) {
      lines.push("SERVICIOS: Sin servicios registrados.", "");
    } else {
      lines.push("SERVICIOS DE INTERNET:");
      for (const s of services) {
        const planName = s.description || s.tariff_plan || "N/A";
        const sector = parseSector(s.login);
        lines.push(`  • Plan: ${planName} | Estado: ${s.status}`);
        if (s.ipv4) lines.push(`    IP asignada: ${s.ipv4}`);
        if (s.login) lines.push(`    Login PPPoE: ${s.login}`);
        if (sector) lines.push(`    Sector/Nodo: ${sector}`);
      }
      lines.push("");

      // ── Diagnosis block ──────────────────────────────────────────────────────
      if (activeServices.length > 0) {
        // Service is active (enabled in Splynx)
        const svc = activeServices[0];
        const sector = parseSector(svc.login);

        // Try to get router info for context
        let routerInfo = "";
        if (svc.router_id && svc.router_id > 0) {
          try {
            const router = await getRouter(svc.router_id);
            if (router) {
              routerInfo = `${router.title || "Nodo desconocido"}` +
                (router.ip ? ` (IP: ${router.ip})` : "");
            }
          } catch {
            // ignore
          }
        }
        if (!routerInfo && sector) {
          routerInfo = `Sector ${sector}`;
        }

        lines.push(
          "DIAGNÓSTICO:",
          `  ✅ Servicio ACTIVO en Splynx — el servicio está habilitado y configurado.`,
          routerInfo
            ? `  Nodo/Router del cliente: ${routerInfo}`
            : "",
          `  INSTRUCCIÓN: El servicio está activo en nuestra red. El problema está del lado del cliente`,
          `  (equipo del cliente, cables, WiFi, configuración del router doméstico).`,
          `  Continúa con troubleshooting del equipo del cliente.`,
          ""
        );
      } else if (primaryService) {
        // Service exists but is disabled/inactive
        const svc = primaryService;
        const sector = parseSector(svc.login);

        // Get router details to check if the issue is on the router side
        let routerName = "desconocido";
        let routerIp = "";
        if (svc.router_id && svc.router_id > 0) {
          try {
            const router = await getRouter(svc.router_id);
            if (router) {
              routerName = router.title || "Nodo desconocido";
              routerIp = router.ip || router.nas_ip || "";
            }
          } catch {
            // ignore
          }
        }
        const routerLabel = routerName !== "desconocido"
          ? `${routerName}${routerIp ? ` (${routerIp})` : ""}${sector ? `, sector ${sector}` : ""}`
          : sector
            ? `Sector ${sector}`
            : "no identificado";

        lines.push(
          "DIAGNÓSTICO:",
          `  🔴 Servicio ${svc.status.toUpperCase()} en Splynx — el servicio no está activo.`,
          `  Nodo/Router asignado: ${routerLabel}`,
          `  INSTRUCCIÓN: El servicio está deshabilitado o suspendido en el sistema.`,
          `  Puede ser por suspensión por pago, desactivación manual u otro motivo administrativo.`,
          `  Di al cliente: "Veo que tu servicio aparece como ${svc.status} en nuestro sistema."`,
          `  Luego pregunta si hubo alguna notificación de suspensión o si tiene adeudo.`,
          ""
        );
      }
    }

    // ── Ticket history ─────────────────────────────────────────────────────────
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
