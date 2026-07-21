import axios, { AxiosInstance } from "axios";
import CheckSettings from "../../helpers/CheckSettings";
import { logger } from "../../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UISPClient {
  id: number;
  userIdent?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  clientType?: number; // 1=Residential, 2=Company
}

export interface UISPContact {
  id: number;
  clientId: number;
  name?: string;
  email?: string;
  phone?: string;
  isContact: boolean;
  isBilling: boolean;
}

export interface UISPService {
  id: number;
  status: number; // 0=Prepared, 1=Active, 2=Ended, 3=Suspended
  name?: string;
  servicePlanName?: string;
  price?: number;
  invoicingStart?: string;
  note?: string;
}

export interface UISPTicket {
  id: number;
  subject: string;
  status: number; // 0=New, 1=InProgress, 2=Solved, 3=Closed
  clientId?: number;
  createdDate?: string;
  lastActivity?: string;
}

export interface UISPCustomer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  isActive: boolean;
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

const getAxios = (apiUrl: string, apiKey: string): AxiosInstance =>
  axios.create({
    baseURL: apiUrl.replace(/\/$/, ""),
    timeout: 10000,
    headers: {
      "X-Auth-App-Key": apiKey,
      "Content-Type": "application/json"
    }
  });

// ─── Normalize ───────────────────────────────────────────────────────────────

const clientDisplayName = (c: UISPClient): string => {
  if (c.clientType === 2 && c.companyName) return c.companyName;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : c.username || c.userIdent || `#${c.id}`;
};

const normalizePhone = (p: string): string =>
  p.replace(/\D/g, "").replace(/^0+/, "").replace(/^(\d{10,})$/, "$1");

const phoneMatch = (a: string, b: string): boolean => {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length >= 7 && (na === nb || na.endsWith(nb) || nb.endsWith(na));
};

// ─── Connection test ──────────────────────────────────────────────────────────

export const testConnection = async (
  apiUrl: string,
  apiKey: string
): Promise<{ ok: boolean; message: string; clientCount?: number }> => {
  try {
    const http = getAxios(apiUrl, apiKey);
    const resp = await http.get("/api/v1.0/clients?limit=1");
    const count = Array.isArray(resp.data) ? resp.data.length : "?";
    return {
      ok: true,
      message: `Conexión exitosa con UISP/UCRM`,
      clientCount: typeof count === "number" ? count : undefined
    };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      return { ok: false, message: "API Key inválida o sin permisos" };
    }
    logger.error(err, "UISP testConnection error");
    return { ok: false, message: err?.message || "No se pudo conectar con UISP" };
  }
};

// ─── Customer lookup ──────────────────────────────────────────────────────────

/** Fetch all active clients (pagination-aware) */
const fetchAllClients = async (http: AxiosInstance): Promise<UISPClient[]> => {
  let page = 1;
  const limit = 100;
  const results: UISPClient[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await http.get(`/api/v1.0/clients`, {
      params: { limit, offset: (page - 1) * limit }
    });
    const batch: UISPClient[] = Array.isArray(resp.data) ? resp.data : [];
    results.push(...batch);
    if (batch.length < limit) break;
    page++;
    if (page > 10) break; // safety cap at 1000 clients
  }

  return results;
};

/** Find a client by phone — checks primary phone + contacts */
export const findClientByPhone = async (
  phone: string
): Promise<UISPCustomer | null> => {
  try {
    const apiUrl = await CheckSettings("uispApiUrl");
    const apiKey = await CheckSettings("uispApiKey");
    if (!apiUrl || !apiKey) return null;

    const http = getAxios(apiUrl, apiKey);

    // 1. Try to filter directly (works on some UISP versions)
    try {
      const resp = await http.get("/api/v1.0/clients", {
        params: { phone, limit: 5 }
      });
      const clients: UISPClient[] = Array.isArray(resp.data) ? resp.data : [];
      for (const c of clients) {
        if (c.phone && phoneMatch(phone, c.phone)) {
          return {
            id: c.id,
            name: clientDisplayName(c),
            phone: c.phone,
            email: c.email,
            isActive: c.isActive
          };
        }
      }
    } catch {
      // param not supported — fall through to full scan
    }

    // 2. Full scan with contact check
    const all = await fetchAllClients(http);
    for (const c of all) {
      if (c.phone && phoneMatch(phone, c.phone)) {
        return {
          id: c.id,
          name: clientDisplayName(c),
          phone: c.phone,
          email: c.email,
          isActive: c.isActive
        };
      }

      // Check additional contacts
      try {
        const cResp = await http.get(`/api/v1.0/clients/${c.id}/contacts`);
        const contacts: UISPContact[] = Array.isArray(cResp.data) ? cResp.data : [];
        for (const contact of contacts) {
          if (contact.phone && phoneMatch(phone, contact.phone)) {
            return {
              id: c.id,
              name: clientDisplayName(c),
              phone: contact.phone,
              email: c.email || contact.email,
              isActive: c.isActive
            };
          }
        }
      } catch {
        // contacts endpoint not available for this client
      }
    }

    return null;
  } catch (err) {
    logger.error(err, "UISP findClientByPhone error");
    return null;
  }
};

/** Find clients by partial name */
export const findClientsByName = async (
  query: string
): Promise<UISPCustomer[]> => {
  try {
    const apiUrl = await CheckSettings("uispApiUrl");
    const apiKey = await CheckSettings("uispApiKey");
    if (!apiUrl || !apiKey) return [];

    const http = getAxios(apiUrl, apiKey);
    const q = query.toLowerCase().trim();

    // Fetch all and filter by name
    const all = await fetchAllClients(http);
    return all
      .filter(c => {
        const name = clientDisplayName(c).toLowerCase();
        const username = (c.username || "").toLowerCase();
        const ident = (c.userIdent || "").toLowerCase();
        return name.includes(q) || username.includes(q) || ident.includes(q);
      })
      .slice(0, 20)
      .map(c => ({
        id: c.id,
        name: clientDisplayName(c),
        phone: c.phone || "",
        email: c.email,
        isActive: c.isActive
      }));
  } catch (err) {
    logger.error(err, "UISP findClientsByName error");
    return [];
  }
};

/** Find a client by free-form input (phone or name) */
export const findClientByInput = async (
  input: string
): Promise<UISPCustomer | null> => {
  const cleanedInput = input.replace(/\D/g, "");
  if (cleanedInput.length >= 7) {
    const byPhone = await findClientByPhone(cleanedInput);
    if (byPhone) return byPhone;
  }
  const byName = await findClientsByName(input);
  return byName[0] || null;
};

// ─── Services ─────────────────────────────────────────────────────────────────

const SERVICE_STATUS: Record<number, string> = {
  0: "Preparado",
  1: "Activo",
  2: "Finalizado",
  3: "Suspendido"
};

const getClientServices = async (
  http: AxiosInstance,
  clientId: number
): Promise<UISPService[]> => {
  try {
    const resp = await http.get(`/api/v1.0/clients/${clientId}/services`);
    return Array.isArray(resp.data) ? resp.data : [];
  } catch {
    return [];
  }
};

// ─── Ticket history ───────────────────────────────────────────────────────────

const TICKET_STATUS: Record<number, string> = {
  0: "Nuevo",
  1: "En progreso",
  2: "Resuelto",
  3: "Cerrado"
};

const getClientTickets = async (
  http: AxiosInstance,
  clientId: number
): Promise<UISPTicket[]> => {
  try {
    const resp = await http.get(`/api/v1.0/tickets`, {
      params: { clientId, limit: 5, "sorting[createdDate]": "DESC" }
    });
    return Array.isArray(resp.data) ? resp.data : [];
  } catch {
    return [];
  }
};

// ─── Context builder ──────────────────────────────────────────────────────────

export const buildUISPContext = async (
  phone: string,
  isFirstMessage = false
): Promise<{ context: string; customerId: number | null }> => {
  try {
    const apiUrl = await CheckSettings("uispApiUrl");
    const apiKey = await CheckSettings("uispApiKey");
    if (!apiUrl || !apiKey) return { context: "", customerId: null };

    const client = await findClientByPhone(phone);
    if (!client) return { context: "", customerId: null };

    const http = getAxios(apiUrl, apiKey);

    const [services, tickets] = await Promise.all([
      getClientServices(http, client.id),
      getClientTickets(http, client.id)
    ]);

    const activeServices = services.filter(s => s.status === 1);
    const statusTag = client.isActive ? "ACTIVO" : "INACTIVO/SUSPENDIDO";

    let ctx = `--- DATOS DEL CLIENTE (UISP/UCRM) ---\n`;
    ctx += `Cliente: ${client.name} | Estado: ${statusTag}\n`;
    if (client.email) ctx += `Email: ${client.email}\n`;
    ctx += `ID UISP: ${client.id}\n`;

    if (activeServices.length > 0) {
      ctx += `\nServicios activos (${activeServices.length}):\n`;
      for (const svc of activeServices.slice(0, 3)) {
        const plan = svc.servicePlanName || svc.name || `Servicio #${svc.id}`;
        const price = svc.price ? ` — $${svc.price}/mes` : "";
        ctx += `  • ${plan}${price}\n`;
      }
    } else {
      ctx += `\nSin servicios activos en UISP.\n`;
    }

    if (tickets.length > 0) {
      ctx += `\nÚltimos tickets en UISP:\n`;
      for (const t of tickets.slice(0, 3)) {
        const st = TICKET_STATUS[t.status] ?? "Desconocido";
        const date = t.createdDate
          ? new Date(t.createdDate).toLocaleDateString("es")
          : "";
        ctx += `  • [${st}] ${t.subject}${date ? ` (${date})` : ""}\n`;
      }
    }

    if (!client.isActive) {
      ctx += `\n⚠️ CUENTA INACTIVA O SUSPENDIDA — verifica antes de dar soporte técnico.\n`;
    }

    ctx += `--- FIN DATOS UISP ---`;

    const greeting = isFirstMessage
      ? `\n\nSi encontraste el cliente en UISP, salúdalo por su nombre: ${client.name}.`
      : "";

    return { context: ctx + greeting, customerId: client.id };
  } catch (err) {
    logger.error(err, "UISP buildUISPContext error");
    return { context: "", customerId: null };
  }
};

// ─── Ticket creation ──────────────────────────────────────────────────────────

export const createUISPTicket = async (
  clientId: number,
  subject: string,
  message: string,
  status: 0 | 1 | 2 | 3 = 3
): Promise<{ id: number } | null> => {
  try {
    const apiUrl = await CheckSettings("uispApiUrl");
    const apiKey = await CheckSettings("uispApiKey");
    if (!apiUrl || !apiKey) return null;

    const http = getAxios(apiUrl, apiKey);

    // UCRM 4.4.30: ticket body/comment endpoints return 404 via app-key auth.
    // Use brief subject for the ticket title; full detail goes to client-log (Activity tab).
    const resp = await http.post("/api/v1.0/ticketing/tickets", {
      clientId,
      subject,
      public: false
    });
    const id = resp.data?.id;
    if (!id) return null;

    // Close the ticket if requested
    if (status === 3) {
      try {
        await http.patch(`/api/v1.0/ticketing/tickets/${id}`, { status: 3 });
      } catch (patchErr) {
        logger.warn({ patchErr, id }, "UISP: could not close ticket");
      }
    }

    // Full detail to client-log (no length limit, appears in Actividad tab)
    if (message) {
      try {
        const logText = `${subject}\n\n${message}`;
        await http.post("/api/v1.0/client-logs", { clientId, message: logText });
      } catch (logErr) {
        logger.warn(logErr, "UISP: could not add client log");
      }
    }

    logger.info(`UISP ticket created: id=${id} for clientId=${clientId}`);
    return { id };
  } catch (err: any) {
    logger.error(err, "UISP createUISPTicket error");
    return null;
  }
};

/** Add a comment (with optional attachment) to an existing UISP ticket */
export const addUISPTicketComment = async (
  ticketId: number,
  message: string,
  files: Array<{ filename: string; buffer: Buffer; mimeType: string }>
): Promise<void> => {
  try {
    const apiUrl = await CheckSettings("uispApiUrl");
    const apiKey = await CheckSettings("uispApiKey");
    if (!apiUrl || !apiKey) return;

    const http = getAxios(apiUrl, apiKey);

    if (message) {
      await http.post("/api/v1.0/ticket-comments", {
        ticketId,
        message,
        public: false
      });
    }

    // Upload each file as a separate attachment comment
    for (const file of files) {
      try {
        const FormData = require("form-data");
        const form = new FormData();
        form.append("ticketId", String(ticketId));
        form.append("file", file.buffer, {
          filename: file.filename,
          contentType: file.mimeType
        });

        await axios.post(`${apiUrl.replace(/\/$/, "")}/api/v1.0/ticket-comments`, form, {
          headers: {
            "X-Auth-App-Key": apiKey,
            ...form.getHeaders()
          },
          timeout: 30000
        });
      } catch (attachErr) {
        logger.warn(attachErr, `UISP: could not upload attachment ${file.filename}`);
      }
    }
  } catch (err) {
    logger.error(err, "UISP addUISPTicketComment error");
  }
};
