"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testConnection = exports.buildSplynxContext = exports.createSplynxTicket = exports.checkGeneralOutage = exports.checkCustomerOnline = exports.getRouter = exports.getCustomerTickets = exports.getCustomerServices = exports.findCustomerByInput = exports.findCustomersByName = exports.findCustomerByPhone = void 0;
const axios_1 = __importDefault(require("axios"));
const CheckSettings_1 = __importDefault(require("../../helpers/CheckSettings"));
const logger_1 = require("../../utils/logger");
const ZabbixService_1 = require("../ZabbixService/ZabbixService");
// ─── Token cache ──────────────────────────────────────────────────────────────
let _tokenCache = null;
/**
 * Try multiple auth strategies in order until one returns a token.
 * 1. api_key (addon key)
 * 2. administrator (admin login/password)
 */
const getAuthToken = (apiUrl, apiKey, apiSecret, adminLogin, adminPassword) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
        return _tokenCache.token;
    }
    // Splynx API v2 token endpoint is admin/auth/tokens (NOT auth/tokens)
    const endpoint = `${apiUrl}/api/2.0/admin/auth/tokens`;
    const strategies = [];
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
    let lastError = null;
    for (const { label, body } of strategies) {
        try {
            const resp = yield axios_1.default.post(endpoint, body, { timeout: 10000 });
            const token = ((_a = resp.data) === null || _a === void 0 ? void 0 : _a.access_token) || ((_c = (_b = resp.data) === null || _b === void 0 ? void 0 : _b.response) === null || _c === void 0 ? void 0 : _c.access_token) || "";
            if (token) {
                logger_1.logger.info({ info: `Splynx auth OK via ${label}` });
                _tokenCache = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
                return token;
            }
        }
        catch (e) {
            lastError = e;
            logger_1.logger.warn({ info: `Splynx auth ${label} failed`, msg: e === null || e === void 0 ? void 0 : e.message });
        }
    }
    throw lastError || new Error("Splynx: all auth strategies failed");
});
// Invalidate cache so next request forces a re-auth
const invalidateToken = () => {
    _tokenCache = null;
};
// ─── HTTP client factory ──────────────────────────────────────────────────────
const buildClient = () => __awaiter(void 0, void 0, void 0, function* () {
    let enabled = false;
    try {
        enabled = (yield (0, CheckSettings_1.default)("splynxEnabled")) === "enabled";
    }
    catch (_d) {
        return null;
    }
    if (!enabled)
        return null;
    let apiUrl = "";
    let apiKey = "";
    let apiSecret = "";
    let adminLogin = "";
    let adminPassword = "";
    try {
        apiUrl = (yield (0, CheckSettings_1.default)("splynxApiUrl")).replace(/\/$/, "");
        apiKey = yield (0, CheckSettings_1.default)("splynxApiKey").catch(() => "");
        apiSecret = yield (0, CheckSettings_1.default)("splynxApiSecret").catch(() => "");
        adminLogin = yield (0, CheckSettings_1.default)("splynxAdminLogin").catch(() => "");
        adminPassword = yield (0, CheckSettings_1.default)("splynxAdminPassword").catch(() => "");
    }
    catch (_e) {
        return null;
    }
    if (!apiUrl)
        return null;
    if (!apiKey && !adminLogin)
        return null;
    const token = yield getAuthToken(apiUrl, apiKey, apiSecret, adminLogin, adminPassword);
    // Splynx API v2 expects: Authorization: Splynx-EA (access_token=TOKEN)
    return axios_1.default.create({
        baseURL: `${apiUrl}/api/2.0`,
        headers: {
            Authorization: `Splynx-EA (access_token=${token})`,
            "Content-Type": "application/json"
        },
        timeout: 10000
    });
});
/** Unwrap Splynx response (can be in .response or directly in .data) */
const unwrap = (data) => {
    if (Array.isArray(data))
        return data;
    if ((data === null || data === void 0 ? void 0 : data.response) !== undefined)
        return data.response;
    return data;
};
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Strict phone comparison — guards against Splynx LIKE-match returning wrong customers.
 * Matches when one number is a suffix of the other AND overlap >= 8 digits.
 */
const phonesMatch = (a, b) => {
    const na = a.replace(/\D/g, "");
    const nb = b.replace(/\D/g, "");
    if (!na || !nb) return false;
    if (na === nb) return true;
    const longer = na.length >= nb.length ? na : nb;
    const shorter = na.length >= nb.length ? nb : na;
    return shorter.length >= 8 && longer.endsWith(shorter);
};
/** Search a customer by phone number (tries full and last-10-digits) */
const findCustomerByPhone = (phone) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const client = yield buildClient();
        if (!client)
            return null;
        const clean = phone.replace(/\D/g, "");
        const trySearch = (q) => __awaiter(void 0, void 0, void 0, function* () {
            const { data } = yield client.get("/admin/customers/customer", {
                params: { "search[phone]": q, items_per_page: 10 }
            });
            const list = unwrap(data);
            if (!Array.isArray(list)) return null;
            return list.find(c => phonesMatch(c.phone || "", q)) || null;
        });
        const found = yield trySearch(clean);
        if (found)
            return found;
        // Retry with last 10 digits (strips country prefix)
        if (clean.length > 10) {
            return trySearch(clean.slice(-10));
        }
        return null;
    }
    catch (err) {
        logger_1.logger.error(err, "Splynx: findCustomerByPhone error");
        return null;
    }
});
exports.findCustomerByPhone = findCustomerByPhone;
/** Search customers by full or partial name */
const findCustomersByName = (name) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const client = yield buildClient();
        if (!client)
            return [];
        const { data } = yield client.get("/admin/customers/customer", {
            params: { "search[name]": name, items_per_page: 10 }
        });
        const list = unwrap(data);
        return Array.isArray(list) ? list : [];
    }
    catch (err) {
        logger_1.logger.error(err, "Splynx: findCustomersByName error");
        return [];
    }
});
exports.findCustomersByName = findCustomersByName;
/**
 * Find a customer by free-form input — phone number or full/partial name.
 * If input contains >= 7 digits, treated as phone. Otherwise searched by name.
 * Returns the first match, or null if none found.
 */
const findCustomerByInput = (input) => __awaiter(void 0, void 0, void 0, function* () {
    const digits = input.replace(/\D/g, "");
    if (digits.length >= 7) {
        return findCustomerByPhone(digits);
    }
    const trimmed = input.trim();
    if (!trimmed)
        return null;
    const results = yield findCustomersByName(trimmed);
    if (results.length === 0)
        return null;
    // Guard: verify the returned customer name actually matches the query.
    // Splynx may return unfiltered results when the search param isn't recognised,
    // which would let any random text pass verification.
    const query = trimmed.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const words = query.split(/\s+/).filter(w => w.length >= 3);
    const match = results.find(c => {
        const cname = (c.name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        return (cname.includes(query) ||
            query.includes(cname) ||
            words.some(w => cname.includes(w)));
    });
    return match !== null && match !== void 0 ? match : null;
});
exports.findCustomerByInput = findCustomerByInput;
/** Get all internet services for a customer */
const getCustomerServices = (customerId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const client = yield buildClient();
        if (!client)
            return [];
        const { data } = yield client.get(`/admin/customers/customer/${customerId}/internet-services`);
        const list = unwrap(data);
        return Array.isArray(list) ? list : [];
    }
    catch (err) {
        logger_1.logger.error(err, "Splynx: getCustomerServices error");
        return [];
    }
});
exports.getCustomerServices = getCustomerServices;
/** Get recent tickets for a customer (last 10, newest first) */
const getCustomerTickets = (customerId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const client = yield buildClient();
        if (!client)
            return [];
        const { data } = yield client.get("/admin/support/tickets", {
            params: {
                customer_id: customerId,
                items_per_page: 10,
                "sort[created_at]": "desc"
            }
        });
        const list = unwrap(data);
        return Array.isArray(list) ? list : [];
    }
    catch (err) {
        logger_1.logger.error(err, "Splynx: getCustomerTickets error");
        return [];
    }
});
exports.getCustomerTickets = getCustomerTickets;
/** Get a single router/NAS device by its Splynx ID */
const getRouter = (routerId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!routerId || routerId <= 0)
        return null;
    try {
        const client = yield buildClient();
        if (!client)
            return null;
        const { data } = yield client.get(`/admin/networking/routers/${routerId}`);
        const r = unwrap(data);
        return r && typeof r === "object" && r.id ? r : null;
    }
    catch (err) {
        logger_1.logger.error(err, `Splynx: getRouter(${routerId}) error`);
        return null;
    }
});
exports.getRouter = getRouter;
/**
 * Ping a customer IP via the Splynx server's netcheck.php endpoint.
 * Requires the SPLYNX_PING_TOKEN env variable.
 * Returns null when the token is missing, IP is empty, or the request fails.
 */
const checkCustomerOnline = (ip, splynxBaseUrl) => __awaiter(void 0, void 0, void 0, function* () {
    var _f;
    const token = process.env.SPLYNX_PING_TOKEN;
    if (!token || !ip || !splynxBaseUrl)
        return null;
    try {
        const base = splynxBaseUrl.replace(/\/$/, "");
        const { data } = yield axios_1.default.get(`${base}/netcheck.php`, {
            params: { token, ip },
            timeout: 8000
        });
        if (typeof (data === null || data === void 0 ? void 0 : data.online) !== "boolean")
            return null;
        return { online: data.online, latency: (_f = data.latency) !== null && _f !== void 0 ? _f : null };
    }
    catch (err) {
        logger_1.logger.warn({ info: `Splynx: ping check failed for IP ${ip}` });
        return null;
    }
});
exports.checkCustomerOnline = checkCustomerOnline;
/** Check if there is an active "Falla General" ticket in Splynx.
 *  Validates client-side to avoid false positives when the API
 *  doesn't support or ignores the subject filter. */
const checkGeneralOutage = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const client = yield buildClient();
        if (!client)
            return null;
        const { data } = yield client.get("/admin/support/tickets", {
            params: {
                "search[subject]": "Falla General",
                items_per_page: 20
            }
        });
        const list = unwrap(data);
        if (!Array.isArray(list))
            return null;
        // Client-side validation: only treat as outage if the ticket subject
        // actually contains outage keywords AND has an active status.
        // This guards against the API returning unrelated tickets.
        const ACTIVE_STATUSES = ["new", "open", "work in progress", "wait for response"];
        const outage = list.find(t => {
            const isOutageSubject = /falla\s+general|corte\s+general|avería\s+masiva/i.test(t.subject || "");
            const statusLower = (t.status || "").toLowerCase();
            const isActive = ACTIVE_STATUSES.some(s => statusLower.includes(s)) ||
                !["solved", "closed"].includes(statusLower);
            return isOutageSubject && isActive;
        });
        return outage || null;
    }
    catch (err) {
        logger_1.logger.error(err, "Splynx: checkGeneralOutage error");
        return null;
    }
});
exports.checkGeneralOutage = checkGeneralOutage;
/** Create a support ticket in Splynx via the PHP bridge (bypasses broken REST API v2) */
const createSplynxTicket = (customerId, subject, message, priority = "medium", status = "new") => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let enabled = false;
        try {
            enabled = (yield (0, CheckSettings_1.default)("splynxEnabled")) === "enabled";
        }
        catch (_a) { return null; }
        if (!enabled) return null;
        let apiUrl = "";
        try {
            apiUrl = ((yield (0, CheckSettings_1.default)("splynxApiUrl")) || "").replace(/\/$/, "");
        }
        catch (_b) { return null; }
        if (!apiUrl) return null;
        // Map status string → status_id integer for the bridge
        const statusMap = { "new": 1, "open": 1, "wip": 2, "work_in_progress": 2, "waiting_customer": 4, "waiting_agent": 5, "closed": 3, "resolved": 3, "solved": 3 };
        const status_id = statusMap[status] !== undefined ? statusMap[status] : 3;
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
        logger_1.logger.info({ customer_id: customerId, subject, priority, status, status_id, bridgeUrl }, "Splynx: creating ticket via bridge");
        const { data } = yield axios_1.default.post(bridgeUrl, formData, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            httpsAgent: agent,
            timeout: 10000
        });
        if (data && data.success && data.ticket_id) {
            logger_1.logger.info(`Splynx: ticket created via bridge id=${data.ticket_id} status_id=${status_id} for customer ${customerId}`);
            return { id: data.ticket_id };
        }
        logger_1.logger.warn({ data }, "Splynx: bridge returned unexpected response");
        return null;
    }
    catch (err) {
        var _resp = err === null || err === void 0 ? void 0 : err.response;
        logger_1.logger.error({
            msg: err === null || err === void 0 ? void 0 : err.message,
            httpStatus: _resp === null || _resp === void 0 ? void 0 : _resp.status,
            bridgeError: _resp === null || _resp === void 0 ? void 0 : _resp.data
        }, "Splynx: createSplynxTicket bridge error");
        return null;
    }
});
exports.createSplynxTicket = createSplynxTicket;
/** Extract the sector/site from a PPPoE login string (e.g. "user@VAPUEBLO-SEC02" → "VAPUEBLO-SEC02") */
const parseSector = (login) => {
    if (!login)
        return null;
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
const buildSplynxContext = (phone, isFirstMessage = false) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const customer = yield (0, exports.findCustomerByPhone)(phone);
        if (!customer) {
            return {
                context: "=== SPLYNX ===\n" +
                    "Cliente NO encontrado por número de teléfono.\n" +
                    "INSTRUCCIÓN: Solicitar el número de teléfono registrado en el contrato o el nombre completo del titular antes de continuar.\n" +
                    "=== FIN SPLYNX ===",
                hasOutage: false,
                customerId: null
            };
        }
        // Fetch all data in parallel (apiUrl needed for ping endpoint)
        const [services, tickets, generalOutage, apiUrl] = yield Promise.all([
            (0, exports.getCustomerServices)(customer.id),
            (0, exports.getCustomerTickets)(customer.id),
            (0, exports.checkGeneralOutage)(),
            (0, CheckSettings_1.default)("splynxApiUrl").catch(() => "")
        ]);
        const lines = [
            "=== DATOS DEL CLIENTE (SPLYNX) ===",
            `Nombre: ${customer.name}`,
            `ID Splynx: ${customer.id}`,
            `Teléfono: ${customer.phone}`,
            `Estado cuenta: ${customer.status}`,
            ""
        ];
        // ── Greeting instruction (first message only) ──────────────────────────────
        if (isFirstMessage) {
            lines.push(`INSTRUCCIÓN DE SALUDO (solo en ESTA respuesta):`, `  Di exactamente: "Hola ${customer.name}, encontré tu servicio en el sistema."`, `  Luego continúa con el diagnóstico indicado abajo.`, "");
        }
        // ── General outage block ───────────────────────────────────────────────────
        if (generalOutage) {
            lines.push("⚠️  FALLA GENERAL ACTIVA EN EL SISTEMA:", `  Asunto: ${generalOutage.subject}`, `  Estado: ${generalOutage.status}`, `  Creado: ${generalOutage.created_at}`, "  INSTRUCCIÓN CRÍTICA: Informar al cliente sobre la falla general. NO hacer troubleshooting individual.", "");
        }
        // ── Service status diagnosis ───────────────────────────────────────────────
        const activeServices = services.filter(s => s.status === "active");
        const primaryService = services[0]; // first service regardless of status
        if (services.length === 0) {
            lines.push("SERVICIOS: Sin servicios registrados.", "");
        }
        else {
            lines.push("SERVICIOS DE INTERNET:");
            for (const s of services) {
                const planName = s.description || s.tariff_plan || "N/A";
                const sector = parseSector(s.login);
                lines.push(`  • Plan: ${planName} | Estado: ${s.status}`);
                if (s.ipv4)
                    lines.push(`    IP asignada: ${s.ipv4}`);
                if (s.login)
                    lines.push(`    Login PPPoE: ${s.login}`);
                if (sector)
                    lines.push(`    Sector/Nodo: ${sector}`);
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
                const pingStrategy = () => __awaiter(void 0, void 0, void 0, function* () {
                    if (!svc.ipv4)
                        return null;
                    const zabbix = yield (0, ZabbixService_1.checkHostPing)(svc.ipv4).catch(() => null);
                    if (zabbix !== null)
                        return zabbix;
                    // Fallback: live ping via netcheck.php
                    if (apiUrl) {
                        return (0, exports.checkCustomerOnline)(svc.ipv4, apiUrl).catch(() => null);
                    }
                    return null;
                });
                const [router, pingResult] = yield Promise.all([
                    (svc.router_id && svc.router_id > 0)
                        ? (0, exports.getRouter)(svc.router_id).catch(() => null)
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
                    diagLines.push(`  INSTRUCCIÓN: El equipo del cliente NO responde ping desde la red.`, `  Posibles causas: equipo apagado, cable desconectado, o falla en la última milla.`, `  Pide al cliente que revise si el router/ONT tiene luz encendida y reinicia el equipo.`);
                }
                else {
                    diagLines.push(`  INSTRUCCIÓN: El servicio está activo en nuestra red. El problema está del lado del cliente`, `  (equipo del cliente, cables, WiFi, configuración del router doméstico).`, `  Continúa con troubleshooting del equipo del cliente.`);
                }
                diagLines.push("");
                lines.push(...diagLines);
            }
            else if (primaryService) {
                // Service exists but is disabled/inactive
                const svc = primaryService;
                const sector = parseSector(svc.login);
                // Get router details to check if the issue is on the router side
                let routerName = "desconocido";
                let routerIp = "";
                if (svc.router_id && svc.router_id > 0) {
                    try {
                        const router = yield (0, exports.getRouter)(svc.router_id);
                        if (router) {
                            routerName = router.title || "Nodo desconocido";
                            routerIp = router.ip || router.nas_ip || "";
                        }
                    }
                    catch (_g) {
                        // ignore
                    }
                }
                const routerLabel = routerName !== "desconocido"
                    ? `${routerName}${routerIp ? ` (${routerIp})` : ""}${sector ? `, sector ${sector}` : ""}`
                    : sector
                        ? `Sector ${sector}`
                        : "no identificado";
                lines.push("DIAGNÓSTICO:", `  🔴 Servicio ${svc.status.toUpperCase()} en Splynx — el servicio no está activo.`, `  Nodo/Router asignado: ${routerLabel}`, `  INSTRUCCIÓN: El servicio está deshabilitado o suspendido en el sistema.`, `  Puede ser por suspensión por pago, desactivación manual u otro motivo administrativo.`, `  Di al cliente: "Veo que tu servicio aparece como ${svc.status} en nuestro sistema."`, `  Luego pregunta si hubo alguna notificación de suspensión o si tiene adeudo.`, "");
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
    }
    catch (err) {
        logger_1.logger.error(err, "Splynx: buildSplynxContext error");
        return { context: "", hasOutage: false, customerId: null };
    }
});
exports.buildSplynxContext = buildSplynxContext;
/** Test connectivity: authenticate and return customer count */
const testConnection = (apiUrl, apiKey, apiSecret, adminLogin, adminPassword) => __awaiter(void 0, void 0, void 0, function* () {
    var _h, _j, _k;
    try {
        invalidateToken();
        const token = yield getAuthToken(apiUrl.replace(/\/$/, ""), apiKey, apiSecret, adminLogin, adminPassword);
        if (!token)
            return { ok: false, message: "Sin token en la respuesta" };
        const client = axios_1.default.create({
            baseURL: `${apiUrl.replace(/\/$/, "")}/api/2.0`,
            headers: { Authorization: `Splynx-EA (access_token=${token})` },
            timeout: 8000
        });
        const { data } = yield client.get("/admin/customers/customer", {
            params: { items_per_page: 1 }
        });
        const list = unwrap(data);
        const count = Array.isArray(list) ? list.length : "?";
        return { ok: true, message: `Conexión exitosa. Clientes accesibles: ${count}+` };
    }
    catch (err) {
        invalidateToken();
        const msg = ((_j = (_h = err === null || err === void 0 ? void 0 : err.response) === null || _h === void 0 ? void 0 : _h.data) === null || _j === void 0 ? void 0 : _j.message) ||
            ((_k = err === null || err === void 0 ? void 0 : err.response) === null || _k === void 0 ? void 0 : _k.statusText) ||
            (err === null || err === void 0 ? void 0 : err.message) ||
            "Error de conexión";
        return { ok: false, message: msg };
    }
});
exports.testConnection = testConnection;
