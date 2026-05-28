import axios, { AxiosInstance } from "axios";
import CheckSettings from "../../helpers/CheckSettings";
import { logger } from "../../utils/logger";
import { checkHostPing } from "../ZabbixService/ZabbixService";

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

/**
 * Strict phone comparison — guards against Splynx's partial/LIKE match returning
 * unrelated customers.
 * Two numbers match when one is a suffix of the other AND the overlap is ≥ 8 digits.
 * e.g.:  "18095551234" matches "8095551234" (country-code stripped)
 *        "8095551234"  does NOT match "8095559999" (different number)
 */
const phonesMatch = (a: string, b: string): boolean => {
  const na = a.replace(/\D/g, "");
  const nb = b.replace(/\D/g, "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [longer, shorter] = na.length >= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 8 && longer.endsWith(shorter);
};

/** Search a customer by phone number (tries full and last-10-digits) */
export const findCustomerByPhone = async (
  phone: string
): Promise<SplynxCustomer | null> => {
  try {
    const client = await buildClient();
    if (!client) return null;

    const clean = phone.replace(/\D/g, "");

    /**
     * Ask Splynx for candidates, then validate each result against the
     * searched number. Splynx uses a LIKE/partial match internally, so it can
     * return customers whose number merely *contains* the digits — we must
     * confirm the match ourselves.
     */
    const trySearch = async (q: string): Promise<SplynxCustomer | null> => {
      const { data } = await client.get("/admin/customers/customer", {
        params: { "search[phone]": q, items_per_page: 10 }
      });
      const list: SplynxCustomer[] = unwrap(data);
      if (!Array.isArray(list)) return null;

      // Return the FIRST candidate whose stored phone actually matches
      return list.find(c => phonesMatch(c.phone || "", q)) || null;
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

/**
 * Find a customer by any free-form input — phone number or full/partial name.
 * If input contains ≥7 digits → treated as phone and searched via findCustomerByPhone.
 * Otherwise → searched by name via findCustomersByName.
 * Returns the first match, or null if none found.
 */
export const findCustomerByInput = async (
  input: string
): Promise<SplynxCustomer | null> => {
  const digits = input.replace(/\D/g, "");
  if (digits.length >= 7) {
    return findCustomerByPhone(digits);
  }
  const trimmed = input.trim();
  if (!trimmed) return null;

  const results = await findCustomersByName(trimmed);
  if (results.length === 0) return null;

  // Guard: verify the returned customer name actually matches the query.
  // Splynx may return unfiltered results when the search param isn't recognised,
  // which would let any random text pass verification.
  const query = trimmed.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words  = query.split(/\s+/).filter(w => w.length >= 3);

  const match = results.find(c => {
    const cname = (c.name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    // Accept if: stored name contains the query, query contains the stored name,
    // or at least one meaningful word from the query appears in the stored name.
    return (
      cname.includes(query) ||
      query.includes(cname) ||
      words.some(w => cname.includes(w))
    );
  });

  return match ?? null;
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

/**
 * Ping a customer IP via the Splynx server's netcheck.php endpoint.
 * Requires the SPLYNX_PING_TOKEN env variable.
 * Returns null when the token is missing, IP is empty, or the request fails.
 */
export const checkCustomerOnline = async (
  ip: string,
  splynxBaseUrl: string
): Promise<{ online: boolean; latency: string | null } | null> => {
  const token = process.env.SPLYNX_PING_TOKEN;
  if (!token || !ip || !splynxBaseUrl) return null;

  try {
    const base = splynxBaseUrl.replace(/\/$/, "");
    const { data } = await axios.get(`${base}/netcheck.php`, {
      params: { token, ip },
      timeout: 8000
    });
    if (typeof data?.online !== "boolean") return null;
    return { online: data.online, latency: data.latency ?? null };
  } catch (err) {
    logger.warn({ info: `Splynx: ping check failed for IP ${ip}` });
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

/** Create a support ticket in Splynx via the PHP bridge (bypasses broken REST API v2) */
export const createSplynxTicket = async (
  customerId: number,
  subject: string,
  message: string,
  priority: "low" | "medium" | "high" | "critical" = "medium",
  status: "new" | "open" | "solved" | "closed" | "wip" | "resolved" = "new"
): Promise<{ id: number } | null> => {
  try {
    let enabled = false;
    try { enabled = (await CheckSettings("splynxEnabled")) === "enabled"; } catch { return null; }
    if (!enabled) return null;

    let apiUrl = "";
    try { apiUrl = ((await CheckSettings("splynxApiUrl")) || "").replace(/\/$/, ""); } catch { return null; }
    if (!apiUrl) return null;

    // Map status string → status_id integer for the bridge
    const statusMap: Record<string, number> = {
      new: 1, open: 1, wip: 2, work_in_progress: 2,
      waiting_customer: 4, waiting_agent: 5,
      closed: 3, resolved: 3, solved: 3
    };
    const status_id = statusMap[status] !== undefined ? statusMap[status] : 3;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const https = require("https");
    const agent = new https.Agent({ rejectUnauthorized: false });

    const formData = new URLSearchParams();
    formData.append("token", "exaticket-splynx-bridge-4f8a2c9e");
    formData.append("customer_id", String(customerId));
    formData.append("subject", subject);
    formData.append("message", message || "");
    formData.append("priority", priority);
    formData.append("status_id", String(status_id));
    formData.append("admin_id", "10");

    const bridgeUrl = `${apiUrl}/exaticket_ticket.php`;
    logger.info({ customer_id: customerId, subject, priority, status, status_id, bridgeUrl }, "Splynx: creating ticket via bridge");

    const { data } = await axios.post(bridgeUrl, formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      httpsAgent: agent,
      timeout: 10000
    });

    if (data && data.success && data.ticket_id) {
      logger.info(`Splynx: ticket created via bridge id=${data.ticket_id} status_id=${status_id} for customer ${customerId}`);
      return { id: data.ticket_id };
    }
    logger.warn({ data }, "Splynx: bridge returned unexpected response");
    return null;
  } catch (err: any) {
    logger.error(
      { msg: err?.message, httpStatus: err?.response?.status, bridgeError: err?.response?.data },
      "Splynx: createSplynxTicket bridge error"
    );
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

    // Fetch all data in parallel (apiUrl needed for ping endpoint)
    const [services, tickets, generalOutage, apiUrl] = await Promise.all([
      getCustomerServices(customer.id),
      getCustomerTickets(customer.id),
      checkGeneralOutage(),
      CheckSettings("splynxApiUrl").catch(() => "")
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

        // Run router lookup and ping check in parallel.
        // Ping strategy: try Zabbix first (reads cached monitoring data, ~100 ms),
        // fall back to netcheck.php on the Splynx server if Zabbix is not configured
        // or does not monitor this IP.
        const pingStrategy = async () => {
          if (!svc.ipv4) return null;
          const zabbix = await checkHostPing(svc.ipv4).catch(() => null);
          if (zabbix !== null) return zabbix;
          // Fallback: live ping via netcheck.php
          if (apiUrl) {
            return checkCustomerOnline(svc.ipv4, apiUrl).catch(() => null);
          }
          return null;
        };

        const [router, pingResult] = await Promise.all([
          (svc.router_id && svc.router_id > 0)
            ? getRouter(svc.router_id).catch(() => null)
            : Promise.resolve(null),
          pingStrategy()
        ]);

        let routerInfo = "";
        if (router) {
          routerInfo = `${router.title || "Nodo desconocido"}` +
            (router.ip ? ` (IP: ${router.ip})` : "");
        }
        if (!routerInfo && sector) {
          routerInfo = `Sector ${sector}`;
        }

        // Build ping status line
        let pingLine = "";
        if (pingResult !== null) {
          pingLine = pingResult.online
            ? `  🟢 PING ONLINE — equipo respondiendo en red (latencia: ${pingResult.latency || "N/A"})`
            : `  🔴 PING: Sin respuesta — equipo posiblemente offline o sin señal`;
        }

        const diagLines = [
          "DIAGNÓSTICO:",
          `  ✅ Servicio ACTIVO en Splynx — el servicio está habilitado y configurado.`,
          routerInfo ? `  Nodo/Router del cliente: ${routerInfo}` : "",
          pingLine
        ].filter(Boolean);

        if (pingResult !== null && !pingResult.online) {
          diagLines.push(
            `  INSTRUCCIÓN: El equipo del cliente NO responde ping desde la red.`,
            `  Posibles causas: equipo apagado, cable desconectado, o falla en la última milla.`,
            `  Pide al cliente que revise si el router/ONT tiene luz encendida y reinicia el equipo.`
          );
        } else {
          diagLines.push(
            `  INSTRUCCIÓN: El servicio está activo en nuestra red. El problema está del lado del cliente`,
            `  (equipo del cliente, cables, WiFi, configuración del router doméstico).`,
            `  Continúa con troubleshooting del equipo del cliente.`
          );
        }
        diagLines.push("");
        lines.push(...diagLines);
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
