"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.handleMessageAck = exports.handleMessage = void 0;
const path_1 = require("path");
const util_1 = require("util");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const Sentry = __importStar(require("@sentry/node"));
const socket_1 = require("../libs/socket");
const logger_1 = require("../utils/logger");
const Debounce_1 = require("../helpers/Debounce");
const Mustache_1 = __importDefault(require("../helpers/Mustache"));
const sequelize_1 = require("sequelize");
const Label_1 = __importDefault(require("../models/Label"));
const Queue_1 = __importDefault(require("../models/Queue"));
const Ticket_1 = __importDefault(require("../models/Ticket"));
const TicketLabel_1 = __importDefault(require("../models/TicketLabel"));
const Message_1 = __importDefault(require("../models/Message"));
const CreateMessageService_1 = __importDefault(require("../services/MessageServices/CreateMessageService"));
const CreateOrUpdateContactService_1 = __importDefault(require("../services/ContactServices/CreateOrUpdateContactService"));
const FindOrCreateTicketService_1 = __importDefault(require("../services/TicketServices/FindOrCreateTicketService"));
const ShowWhatsAppService_1 = __importDefault(require("../services/WhatsappService/ShowWhatsAppService"));
const UpdateTicketService_1 = __importDefault(require("../services/TicketServices/UpdateTicketService"));
const CreateContactService_1 = __importDefault(require("../services/ContactServices/CreateContactService"));
const GetAIResponse_1 = require("../services/AIServices/GetAIResponse");
const CheckSettings_1 = __importDefault(require("../helpers/CheckSettings"));
/** Lazy-load Splynx so the backend doesn't crash if the module isn't compiled yet.
 *  isFirstMessage=true adds the "Encontré tu servicio" greeting instruction. */
const getSplynxInfo = (phone, isFirstMessage = false) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { buildSplynxContext } = require("../services/SplynxService/SplynxService");
        return yield buildSplynxContext(phone, isFirstMessage);
    }
    catch (_a) {
        return { context: "", hasOutage: false, customerId: null };
    }
});
/** Search Splynx for a customer using free-form input (phone number or name). */
const verifySplynxCustomer = (input) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { findCustomerByInput } = require("../services/SplynxService/SplynxService");
        const customer = yield findCustomerByInput(input);
        if (customer)
            return { customerId: customer.id, name: customer.name };
    }
    catch (_v) { /* ignore */ }
    return { customerId: null, name: null };
});
/**
 * Create a Splynx ticket recording the resolved WhatsApp conversation.
 * Called automatically when AI or keyword detection marks a case as resolved.
 */
const createSplynxResolutionTicket = (customerId, ticketId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createSplynxTicket } = require("../services/SplynxService/SplynxService");
        const summary = yield (0, GetAIResponse_1.getTicketSummary)(ticketId);
        const dateStr = new Date().toLocaleDateString("es", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
        const subject = `Soporte WhatsApp ${dateStr}`;
        const body = summary
            ? `Caso resuelto vía soporte WhatsApp.\n\nResumen:\n${summary}`
            : "Caso resuelto vía soporte WhatsApp.";
        const result = yield createSplynxTicket(customerId, subject, body, "low", "closed");
        if (result && result.id) {
            logger_1.logger.info(`Splynx resolution ticket created (id=${result.id}) for customer ${customerId} (exaticket ${ticketId})`);
        } else {
            logger_1.logger.warn(`Splynx: createSplynxResolutionTicket returned null for customer ${customerId} (exaticket ${ticketId})`);
        }
    }
    catch (err) {
        logger_1.logger.error(err, `Error creating Splynx resolution ticket for ticket ${ticketId}`);
    }
});
const whatsappProvider_1 = require("../providers/WhatsApp/whatsappProvider");
const writeFileAsync = (0, util_1.promisify)(fs_1.writeFile);
const makeRandomId = (length) => (0, crypto_1.randomBytes)(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
const saveMediaFile = (mediaPayload) => __awaiter(void 0, void 0, void 0, function* () {
    const randomId = makeRandomId(5);
    const { filename: originalFilename } = mediaPayload;
    let filename;
    if (!originalFilename) {
        const [extension] = mediaPayload.mimetype.split("/")[1].split(";");
        filename = `${randomId}-${new Date().getTime()}.${extension}`;
    }
    else {
        const baseName = originalFilename.split(".").slice(0, -1).join(".");
        const extension = originalFilename.split(".").slice(-1)[0];
        filename = `${baseName}.${randomId}.${extension}`;
    }
    try {
        yield writeFileAsync((0, path_1.join)(__dirname, "..", "..", "public", filename), mediaPayload.data, "base64");
    }
    catch (err) {
        Sentry.captureException(err);
        logger_1.logger.error(err);
    }
    return filename;
});
const processVcardMessage = (messagePayload) => __awaiter(void 0, void 0, void 0, function* () {
    if (messagePayload.type !== "vcard")
        return;
    try {
        const array = messagePayload.body.split("\n");
        const phoneNumbers = [];
        let contactName = "";
        array.forEach(line => {
            const values = line.split(":");
            values.forEach((value, index) => {
                if (value.indexOf("+") !== -1) {
                    phoneNumbers.push({ number: value });
                }
                if (value.indexOf("FN") !== -1 && values[index + 1]) {
                    contactName = values[index + 1];
                }
            });
        });
        yield Promise.all(phoneNumbers.map(({ number }) => (0, CreateContactService_1.default)({
            name: contactName,
            number: number.replace(/\D/g, "")
        })));
    }
    catch (error) {
        logger_1.logger.error("Error processing vcard message:", error);
    }
});
const handleQueueLogic = (whatsappId, messageBody, ticket, contactPayload) => __awaiter(void 0, void 0, void 0, function* () {
    const { queues, greetingMessage } = yield (0, ShowWhatsAppService_1.default)(whatsappId);
    if (queues.length === 1) {
        yield (0, UpdateTicketService_1.default)({
            ticketData: { queueId: queues[0].id },
            ticketId: ticket.id
        });
        return;
    }
    const selectedOption = messageBody;
    const choosenQueue = queues[+selectedOption - 1];
    if (choosenQueue) {
        yield (0, UpdateTicketService_1.default)({
            ticketData: { queueId: choosenQueue.id },
            ticketId: ticket.id
        });
        const body = (0, Mustache_1.default)(`\u200e${choosenQueue.greetingMessage}`, contactPayload);
        try {
            yield whatsappProvider_1.whatsappProvider.sendMessage(whatsappId, `${contactPayload.number}@c.us`, body);
        }
        catch (error) {
            logger_1.logger.error("Error sending queue greeting message:", error);
        }
    }
    else {
        let options = "";
        queues.forEach((queue, index) => {
            options += `*${index + 1}* - ${queue.name}\n`;
        });
        const body = (0, Mustache_1.default)(`\u200e${greetingMessage}\n${options}`, contactPayload);
        const debouncedSentMessage = (0, Debounce_1.debounce)(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield whatsappProvider_1.whatsappProvider.sendMessage(whatsappId, `${contactPayload.number}@c.us`, body);
            }
            catch (error) {
                logger_1.logger.error("Error sending queue options message:", error);
            }
        }), 3000, ticket.id);
        debouncedSentMessage();
    }
});
// ─── Routing constants ────────────────────────────────────────────────────────
const AI_ROUTING_QUESTION = "¡Hola! 👋 ¿Con qué departamento deseas comunicarte?\n\n" +
    "*1* - Administración\n" +
    "*2* - Ventas\n" +
    "*3* - Soporte técnico";
const AI_ROUTING_INVALID = "Por favor responde *1*, *2* o *3*:\n\n" +
    "*1* - Administración\n" +
    "*2* - Ventas\n" +
    "*3* - Soporte técnico";
/** Normalize accents and lowercase for comparison */
const normalize = (s) => s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
const parseRoutingChoice = (body) => {
    const t = normalize(body);
    if (t === "1" || t.includes("admin"))
        return "administracion";
    if (t === "2" || t.includes("venta"))
        return "ventas";
    if (t === "3" ||
        t.includes("soporte") ||
        t.includes("tecnico") ||
        t.includes("ayuda") ||
        t.includes("internet") ||
        t.includes("fibra") ||
        t.includes("antena") ||
        t.includes("wifi") ||
        t.includes("tele") ||
        t.includes("cable") ||
        t.includes("luz") ||
        t.includes("router"))
        return "soporte";
    return null;
};
/** Find a queue whose name contains the given keyword (case-insensitive) */
const findQueueByName = (keyword) => __awaiter(void 0, void 0, void 0, function* () { return Queue_1.default.findOne({ where: { name: { [sequelize_1.Op.like]: `%${keyword}%` } } }); });
/** Apply a label by name to a ticket (creates label if missing, skips if already applied) */
const autoApplyLabel = (ticketId, labelName, color = "#ef4444") => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [label] = yield Label_1.default.findOrCreate({
            where: { name: labelName },
            defaults: { name: labelName, color }
        });
        yield TicketLabel_1.default.findOrCreate({
            where: { ticketId, labelId: label.id }
        });
        // Emit socket update so frontend refreshes immediately
        const io = (0, socket_1.getIO)();
        const ticket = yield Ticket_1.default.findByPk(ticketId, {
            include: [{ model: Label_1.default, as: "labels" }]
        });
        if (ticket) {
            io.to("notification")
                .to(ticket.status)
                .to(ticketId.toString())
                .emit("ticket", { action: "update", ticket });
        }
    }
    catch (err) {
        logger_1.logger.error(err, `autoApplyLabel error: ticketId=${ticketId} label=${labelName}`);
    }
});
// ─── Resolution keywords (safety-net for AI [RESUELTO] detection) ─────────────
// Only phrases that unambiguously mean "service is working RIGHT NOW"
const RESOLUTION_KEYWORDS = [
    "ya funciona",
    "ya tengo internet",
    "tengo internet ya",
    "volvió el internet",
    "volvio el internet",
    "ya volvio",
    "ya volvió",
    "se solucionó",
    "se soluciono",
    "ya está funcionando",
    "ya esta funcionando",
    "ya conecté",
    "ya me conecte",
    "ya me conecté",
    "ya hay internet",
    "ya hay señal",
    "ya tengo señal",
    "problema resuelto",
    "listo funciona",
    "solucionado",
    "gracias ya funciona",
    "gracias funciona",
    "ya me funciona"
];
/** Returns true only when the client explicitly confirms service is working NOW */
const clientConfirmsResolution = (body) => {
    const lower = normalize(body);
    return RESOLUTION_KEYWORDS.some(kw => lower.includes(normalize(kw)));
};
// ─── Human-request keywords ────────────────────────────────────────────────────
const HUMAN_REQUEST_KEYWORDS = [
    "quiero hablar con",
    "necesito un operador",
    "con un agente",
    "hablar con alguien",
    "operador humano",
    "persona real",
    "hablar con una persona",
    "agente humano",
    "un humano",
    "want to speak",
    "speak to agent",
    "human agent",
    "real person",
    "talk to someone"
];
const escalateToHuman = (ticket, whatsappId, contactNumber, reason) => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.logger.info(`Escalating ticket ${ticket.id} to human operator. Reason: ${reason}`);
    let escalationMsg = "Voy a conectarte con un agente ahora. Un momento por favor.";
    try {
        escalationMsg = yield (0, CheckSettings_1.default)("aiEscalationMessage");
    }
    catch (_b) {
        // use default
    }
    // Assign to Soporte queue so agents can see it
    const supportQueue = yield findQueueByName("oporte");
    const updateData = { aiActive: false };
    if (supportQueue && !ticket.queueId) {
        updateData.queueId = supportQueue.id;
    }
    yield ticket.update(updateData);
    const io = (0, socket_1.getIO)();
    io.to("notification").to(ticket.status).emit("ticket", {
        action: "update",
        ticket
    });
    try {
        yield whatsappProvider_1.whatsappProvider.sendMessage(whatsappId, `${contactNumber}@c.us`, escalationMsg);
    }
    catch (err) {
        logger_1.logger.error(err, "Error sending escalation message");
    }
    // Generate and save internal AI summary note for the agent
    try {
        const summary = yield (0, GetAIResponse_1.getTicketSummary)(ticket.id);
        if (summary) {
            const noteId = `internal-${ticket.id}-${Date.now()}`;
            yield (0, CreateMessageService_1.default)({
                messageData: {
                    id: noteId,
                    ticketId: ticket.id,
                    body: `*Resumen IA del caso:*\n${summary}`,
                    fromMe: true,
                    read: true,
                    isInternal: true,
                    ack: 2
                }
            });
            logger_1.logger.debug(`Internal AI note created for ticket ${ticket.id}`);
        }
    }
    catch (err) {
        logger_1.logger.error(err, "Error creating internal AI summary note");
    }
});
const typingDelay = (text) => new Promise(r => setTimeout(r, Math.min(4000, 1200 + text.length * 28) + Math.floor(Math.random() * 900)));
const sendMsg = (whatsappId, contactNumber, text) => __awaiter(void 0, void 0, void 0, function* () {
    yield typingDelay(text);
    try {
        yield whatsappProvider_1.whatsappProvider.sendMessage(whatsappId, `${contactNumber}@c.us`, text);
    }
    catch (err) {
        logger_1.logger.error(err, "Error sending message");
    }
});
const handleAISupport = (ticket, messageBody, whatsappId, contactNumber) => __awaiter(void 0, void 0, void 0, function* () {
    // Always allow user to request a human agent
    const lowerBody = messageBody.toLowerCase();
    const userWantsHuman = HUMAN_REQUEST_KEYWORDS.some(kw => lowerBody.includes(kw));
    if (userWantsHuman) {
        yield escalateToHuman(ticket, whatsappId, contactNumber, "user_request");
        return;
    }
    // ── PHASE 1: First contact — send department routing question ──────────────
    if (ticket.aiAttempts === 0) {
        yield sendMsg(whatsappId, contactNumber, AI_ROUTING_QUESTION);
        yield ticket.update({ aiAttempts: 1 });
        return;
    }
    // ── PHASE 2: Process department selection ─────────────────────────────────
    if (ticket.aiAttempts === 1) {
        const choice = parseRoutingChoice(messageBody);
        // Route to Administración or Ventas queue
        if (choice === "administracion" || choice === "ventas") {
            const keyword = choice === "administracion" ? "dmin" : "enta"; // matches "Administración" / "Ventas"
            const queue = yield findQueueByName(keyword);
            if (queue) {
                yield (0, UpdateTicketService_1.default)({
                    ticketData: { queueId: queue.id, aiActive: false },
                    ticketId: ticket.id
                });
                yield sendMsg(whatsappId, contactNumber, `Un momento, te conectamos con ${queue.name}. 🙏`);
            }
            else {
                // Queue not configured — send to any available operator
                yield escalateToHuman(ticket, whatsappId, contactNumber, "queue_not_found");
            }
            return;
        }
        // Route to AI support
        if (choice === "soporte") {
            // ── Verify customer in Splynx before opening support ──────────────────
            let splynxEnabled = false;
            try { splynxEnabled = (yield (0, CheckSettings_1.default)("splynxEnabled")) === "enabled"; } catch (_e) { /* ignore */ }
            if (splynxEnabled) {
                // For WhatsApp the contactNumber IS the real phone — likely to find a match
                const check = yield getSplynxInfo(contactNumber, false);
                if (check.customerId) {
                    // Found — skip verification phase, go straight to support
                    yield ticket.update({ aiAttempts: 3 });
                    yield sendMsg(whatsappId, contactNumber, "Con gusto te ayudo. ¿Cuál es el problema técnico?");
                }
                else {
                    // Not found — enter verification phase
                    yield ticket.update({ aiAttempts: 2 });
                    yield sendMsg(whatsappId, contactNumber, "Para brindarte soporte, primero necesito verificar que eres cliente. 🔍\n\nNo encontré tu número en nuestro sistema. Por favor indícame tu *nombre completo* o el *número de teléfono* con el que tienes el servicio.");
                }
            }
            else {
                // Splynx not enabled — skip verification
                yield ticket.update({ aiAttempts: 3 });
                yield sendMsg(whatsappId, contactNumber, "Con gusto te ayudo. ¿Cuál es el problema técnico?");
            }
            return;
        }
        // Unrecognized response — ask again
        yield sendMsg(whatsappId, contactNumber, AI_ROUTING_INVALID);
        return;
    }
    // ── PHASE 2.5: Customer identity verification ─────────────────────────────
    // Reached only when Splynx is enabled and the customer was NOT found by phone.
    if (ticket.aiAttempts === 2) {
        const { customerId: foundId, name: foundName } = yield verifySplynxCustomer(messageBody);
        if (foundId) {
            // Persist the verified Splynx customer ID so Phase 3 can create the resolution ticket
            yield ticket.update({ aiAttempts: 3, splynxCustomerId: foundId });
            yield sendMsg(whatsappId, contactNumber, `¡Te encontré en el sistema${foundName ? `, *${foundName}*` : ""}! ✅ Con gusto te ayudamos. ¿Cuál es el problema técnico?`);
        }
        else {
            yield sendMsg(whatsappId, contactNumber, "Lo siento, no encontré esa información en nuestro sistema. 😕\n\nSi crees que hay un error o aún no eres cliente, comúnicatenos directamente. ¡Gracias!");
            yield (0, UpdateTicketService_1.default)({ ticketData: { aiActive: false, status: "closed" }, ticketId: ticket.id });
        }
        return;
    }
    // ── PHASE 3: AI-driven support (aiAttempts >= 3, customer verified) ──────
    let maxAttempts = 10;
    try {
        maxAttempts = parseInt(yield (0, CheckSettings_1.default)("aiMaxAttempts"), 10) || 10;
    }
    catch (_c) {
        // use default
    }
    if (ticket.aiAttempts >= maxAttempts) {
        yield escalateToHuman(ticket, whatsappId, contactNumber, "max_attempts");
        return;
    }
    let systemPrompt = `Eres un asistente de soporte técnico de una empresa de telecomunicaciones/internet.

REGLA MÁS IMPORTANTE — ADAPTA TU LENGUAJE AL CLIENTE:
- Si el cliente usa términos técnicos (IP, DNS, router, firmware, ping, latencia, puerto, modem, ONT, fibra óptica, etc.), respóndele de forma técnica y directa.
- Si el cliente NO usa términos técnicos o parece no entender (dice cosas como "no funciona el wifi", "el aparato parpadeando", "no tengo internet", "se fue la señal"), usa lenguaje MUY sencillo, sin jerga, con instrucciones tipo paso a paso como si hablaras con alguien que nunca ha tocado un router. Ejemplo: "Busca el aparato negro o blanco que tiene lucecitas, desenchúfalo de la corriente, espera 30 segundos y vuelve a enchufarlo."

Reglas adicionales:
- Sé amable y paciente siempre.
- Respuestas cortas y claras. Máximo 3-4 pasos a la vez.
- Si el problema no se resuelve en 2-3 intentos, escala al humano.
- Nunca des información que no sea de soporte técnico.`;
    try {
        systemPrompt = yield (0, CheckSettings_1.default)("aiSystemPrompt");
    }
    catch (_d) {
        // use default
    }
    // Fetch Splynx customer context and metadata (non-blocking).
    // isFirstMessage=true on the first verified support interaction (aiAttempts===3).
    const isFirstSupportMsg = ticket.aiAttempts === 3;
    const splynxInfo = yield getSplynxInfo(contactNumber, isFirstSupportMsg);
    // If phone lookup didn't find the customer but we verified by name in Phase 2.5,
    // use the persisted splynxCustomerId so the resolution ticket is still created.
    if (!splynxInfo.customerId && ticket.splynxCustomerId) {
        splynxInfo.customerId = ticket.splynxCustomerId;
    }
    // Auto-apply "Falla General" label ONLY when Splynx explicitly confirmed an active outage.
    // Using the structured flag instead of a regex avoids false positives from ticket history.
    if (splynxInfo.hasOutage) {
        yield autoApplyLabel(ticket.id, "Falla General", "#ef4444");
    }
    // ── Safety net: keyword-based resolution detection ─────────────────────────
    // If the client's message clearly indicates service is working NOW, resolve
    // immediately without waiting for the AI to emit [RESUELTO].
    if (clientConfirmsResolution(messageBody)) {
        const closingMsg = "¡Me alegra que tu servicio esté funcionando! 😊 " +
            "Tu caso ha quedado registrado. ¡Que tengas un excelente día!";
        yield sendMsg(whatsappId, contactNumber, closingMsg);
        // Create Splynx ticket recording the resolved conversation
        if (splynxInfo.customerId) {
            yield createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
        }
        try {
            yield (0, UpdateTicketService_1.default)({
                ticketData: { status: "closed" },
                ticketId: ticket.id
            });
            logger_1.logger.info(`Ticket ${ticket.id} auto-resolved by keyword detection (client confirmed service OK)`);
        }
        catch (err) {
            logger_1.logger.error(err, `Error auto-resolving ticket ${ticket.id}`);
        }
        return;
    }
    // ── AI-driven response ─────────────────────────────────────────────────────
    const { response, shouldEscalate, shouldResolve } = yield (0, GetAIResponse_1.getAIResponse)(ticket.id, systemPrompt, splynxInfo.context || undefined);
    if (shouldEscalate) {
        if (response) {
            yield sendMsg(whatsappId, contactNumber, response);
        }
        yield escalateToHuman(ticket, whatsappId, contactNumber, "ai_decision");
        return;
    }
    if (shouldResolve) {
        if (response) {
            yield sendMsg(whatsappId, contactNumber, response);
        }
        // Create Splynx ticket recording the resolved conversation
        if (splynxInfo.customerId) {
            yield createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
        }
        // Close ExaTicket
        try {
            yield (0, UpdateTicketService_1.default)({
                ticketData: { status: "closed" },
                ticketId: ticket.id
            });
            logger_1.logger.info(`Ticket ${ticket.id} auto-resolved by AI [RESUELTO] marker`);
        }
        catch (err) {
            logger_1.logger.error(err, `Error auto-resolving ticket ${ticket.id}`);
        }
        return;
    }
    if (response) {
        yield sendMsg(whatsappId, contactNumber, response);
    }
    yield ticket.update({ aiAttempts: ticket.aiAttempts + 1 });
});
const handleMessage = (messagePayload, contactPayload, contextPayload, mediaPayload) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const contact = yield (0, CreateOrUpdateContactService_1.default)({
            name: contactPayload.name,
            number: contactPayload.number,
            lid: contactPayload.lid,
            profilePicUrl: contactPayload.profilePicUrl,
            isGroup: contactPayload.isGroup
        });
        let groupContact;
        if (contextPayload.groupContact) {
            groupContact = yield (0, CreateOrUpdateContactService_1.default)({
                name: contextPayload.groupContact.name,
                number: contextPayload.groupContact.number,
                lid: contextPayload.groupContact.lid,
                profilePicUrl: contextPayload.groupContact.profilePicUrl,
                isGroup: contextPayload.groupContact.isGroup
            });
        }
        const whatsapp = yield (0, ShowWhatsAppService_1.default)(contextPayload.whatsappId);
        if (contextPayload.unreadMessages === 0 &&
            whatsapp.farewellMessage &&
            (0, Mustache_1.default)(whatsapp.farewellMessage, contact) === messagePayload.body) {
            return;
        }
        const ticket = yield (0, FindOrCreateTicketService_1.default)(contact, contextPayload.whatsappId, contextPayload.unreadMessages, groupContact);
        const messageData = {
            id: messagePayload.id,
            ticketId: ticket.id,
            contactId: messagePayload.fromMe ? undefined : contact.id,
            body: messagePayload.body,
            fromMe: messagePayload.fromMe,
            read: messagePayload.fromMe,
            mediaType: messagePayload.type,
            quotedMsgId: messagePayload.quotedMsgId,
            ack: messagePayload.ack !== undefined ? messagePayload.ack : 0
        };
        if (mediaPayload && messagePayload.hasMedia) {
            const filename = yield saveMediaFile(mediaPayload);
            messageData.mediaUrl = filename;
            messageData.body = messagePayload.body || filename;
            const [mediaType] = mediaPayload.mimetype.split("/");
            messageData.mediaType = mediaType;
        }
        let lastMessageText = "";
        if (messagePayload.type === "location") {
            lastMessageText = messagePayload.body.includes("Localization")
                ? messagePayload.body
                : "Localization";
        }
        else {
            lastMessageText = messagePayload.body || (mediaPayload === null || mediaPayload === void 0 ? void 0 : mediaPayload.filename) || "";
        }
        yield ticket.update({ lastMessage: lastMessageText });
        yield (0, CreateMessageService_1.default)({ messageData });
        yield processVcardMessage(messagePayload);
        // Resolve AI state once, reused for both queue-logic and AI-support checks
        // Groups never get AI responses — double-guard beyond contextPayload.groupContact check
        const aiEnabled = yield (0, CheckSettings_1.default)("aiEnabled").catch(() => "disabled");
        const aiIsActive = aiEnabled === "enabled" && ticket.aiActive && !ticket.isGroup;
        // Skip legacy queue-selection logic when AI is handling routing
        if (!ticket.queue &&
            !contextPayload.groupContact &&
            !messagePayload.fromMe &&
            !ticket.userId &&
            whatsapp.queues.length >= 1 &&
            !aiIsActive) {
            yield handleQueueLogic(contextPayload.whatsappId, messagePayload.body, ticket, contactPayload);
        }
        if (!messagePayload.fromMe && !contextPayload.groupContact) {
            try {
                if (aiIsActive) {
                    yield handleAISupport(ticket, messagePayload.body, contextPayload.whatsappId, contactPayload.number);
                }
            }
            catch (err) {
                logger_1.logger.error(err, "Error in AI support handling");
            }
        }
    }
    catch (err) {
        Sentry.captureException(err);
        logger_1.logger.error({
            info: "Error handling message",
            err,
            messagePayload,
            contactPayload,
            contextPayload,
            mediaPayload
        });
    }
});
exports.handleMessage = handleMessage;
const findMessageWithRetry = (messageId) => __awaiter(void 0, void 0, void 0, function* () {
    const include = [
        "contact",
        { model: Message_1.default, as: "quotedMsg", include: ["contact"] }
    ];
    const message = yield Message_1.default.findByPk(messageId, { include });
    if (message)
        return message;
    yield new Promise(r => setTimeout(r, 500));
    return Message_1.default.findByPk(messageId, { include });
});
const handleMessageAck = (messageId, ack) => __awaiter(void 0, void 0, void 0, function* () {
    const io = (0, socket_1.getIO)();
    try {
        const messageToUpdate = yield findMessageWithRetry(messageId);
        if (!messageToUpdate)
            return;
        yield messageToUpdate.update({ ack });
        io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
            action: "update",
            message: messageToUpdate
        });
    }
    catch (err) {
        Sentry.captureException(err);
        logger_1.logger.error(`Error handling message ack: ${err}`);
    }
});
exports.handleMessageAck = handleMessageAck;
