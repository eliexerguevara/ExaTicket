"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramMessage = exports.startAllTelegramBots = exports.stopTelegramBot = exports.startTelegramBot = exports.getBotInstance = void 0;

const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const sequelize_1 = require("sequelize");
const date_fns_1 = require("date-fns");

const Telegram_1 = __importDefault(require("../../models/Telegram"));
const Contact_1 = __importDefault(require("../../models/Contact"));
const Ticket_1 = __importDefault(require("../../models/Ticket"));
const Label_1 = __importDefault(require("../../models/Label"));
const Queue_1 = __importDefault(require("../../models/Queue"));
const TicketLabel_1 = __importDefault(require("../../models/TicketLabel"));

const CreateOrUpdateContactService_1 = __importDefault(require("../ContactServices/CreateOrUpdateContactService"));
const CreateMessageService_1 = __importDefault(require("../MessageServices/CreateMessageService"));
const ShowTicketService_1 = __importDefault(require("../TicketServices/ShowTicketService"));
const UpdateTicketService_1 = __importDefault(require("../TicketServices/UpdateTicketService"));
const GetAIResponse_1 = require("../AIServices/GetAIResponse");
const CheckSettings_1 = __importDefault(require("../../helpers/CheckSettings"));
const socket_1 = require("../../libs/socket");
const logger_1 = require("../../utils/logger");

// ─── Bot instance registry ────────────────────────────────────────────────────
const _bots = new Map();

const getBotInstance = (telegramId) => _bots.get(telegramId);
exports.getBotInstance = getBotInstance;

// ─── Routing constants ────────────────────────────────────────────────────────
const AI_ROUTING_QUESTION =
    "¡Hola! 👋 ¿Con qué departamento deseas comunicarte?\n\n" +
    "*1* - Administración\n" +
    "*2* - Ventas\n" +
    "*3* - Soporte técnico";

const AI_ROUTING_INVALID =
    "Por favor responde *1*, *2* o *3*:\n\n" +
    "*1* - Administración\n" +
    "*2* - Ventas\n" +
    "*3* - Soporte técnico";

const HUMAN_REQUEST_KEYWORDS = [
    "quiero hablar con", "necesito un operador", "con un agente",
    "hablar con alguien", "operador humano", "persona real",
    "hablar con una persona", "agente humano", "un humano"
];

const RESOLUTION_KEYWORDS = [
    "ya funciona", "ya tengo internet", "tengo internet ya",
    "volvió el internet", "volvio el internet", "ya volvio", "ya volvió",
    "se solucionó", "se soluciono", "ya está funcionando", "ya esta funcionando",
    "ya conecté", "ya me conecte", "ya me conecté", "ya hay internet",
    "ya hay señal", "ya tengo señal", "problema resuelto", "listo funciona",
    "solucionado", "gracias ya funciona", "gracias funciona", "ya me funciona"
];

const normalize = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const parseRoutingChoice = (body) => {
    const t = normalize(body);
    if (t === "1" || t.includes("admin")) return "administracion";
    if (t === "2" || t.includes("venta")) return "ventas";
    if (t === "3" || t.includes("soporte") || t.includes("tecnico") ||
        t.includes("ayuda") || t.includes("internet") || t.includes("fibra") ||
        t.includes("wifi") || t.includes("router") || t.includes("antena"))
        return "soporte";
    return null;
};

const clientConfirmsResolution = (body) => {
    const lower = normalize(body);
    return RESOLUTION_KEYWORDS.some(kw => lower.includes(normalize(kw)));
};

const findQueueByName = async (keyword) =>
    Queue_1.default.findOne({ where: { name: { [sequelize_1.Op.like]: `%${keyword}%` } } });

// ─── Typing simulation + save to DB ──────────────────────────────────────────
const sendWithTyping = async (bot, chatId, text, ticketId) => {
    try {
        await bot.sendChatAction(chatId, "typing");
    } catch (_e) {
        // ignore
    }
    const ms = Math.min(4000, 1200 + text.length * 28) + Math.floor(Math.random() * 900);
    await new Promise(r => setTimeout(r, ms));

    let sentMsgId = null;
    try {
        const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
        sentMsgId = sentMsg && sentMsg.message_id;
    } catch (_e) {
        // try without markdown if parsing fails
        const sentMsg = await bot.sendMessage(chatId, text);
        sentMsgId = sentMsg && sentMsg.message_id;
    }

    // Save outgoing message to DB so agents can see it in the ticket view
    if (ticketId) {
        const msgId = `tg-out-${chatId}-${sentMsgId || Date.now()}`;
        try {
            await (0, CreateMessageService_1.default)({
                messageData: {
                    id: msgId,
                    ticketId,
                    body: text,
                    fromMe: true,
                    read: true,
                    ack: 2
                }
            });
        } catch (saveErr) {
            logger_1.logger.error(saveErr, `Telegram: failed to save outgoing message for ticket ${ticketId}`);
        }
    }
};

// ─── Splynx context ───────────────────────────────────────────────────────────
const getSplynxInfo = async (phone, isFirstMessage) => {
    try {
        const { buildSplynxContext } = require("../SplynxService/SplynxService");
        return await buildSplynxContext(phone, isFirstMessage);
    } catch (_e) {
        return { context: "", hasOutage: false, customerId: null };
    }
};

/** Search Splynx for a customer using free-form input (phone or name). */
const verifySplynxCustomer = async (input) => {
    try {
        const { findCustomerByInput } = require("../SplynxService/SplynxService");
        const customer = await findCustomerByInput(input);
        if (customer) return { customerId: customer.id, name: customer.name };
    } catch (_e) { /* ignore */ }
    return { customerId: null, name: null };
};

const createSplynxResolutionTicket = async (customerId, ticketId) => {
    try {
        const { createSplynxTicket } = require("../SplynxService/SplynxService");
        const summary = await (0, GetAIResponse_1.getTicketSummary)(ticketId);
        const dateStr = new Date().toLocaleDateString("es", {
            day: "2-digit", month: "2-digit", year: "numeric"
        });
        await createSplynxTicket(
            customerId,
            `Soporte Telegram ${dateStr}`,
            summary
                ? `Caso resuelto vía Telegram.\n\nResumen:\n${summary}`
                : "Caso resuelto vía Telegram.",
            "low",
            "solved"
        );
    } catch (err) {
        logger_1.logger.error(err, `Error creating Splynx resolution ticket for Telegram ticket ${ticketId}`);
    }
};

// ─── Auto-apply label ─────────────────────────────────────────────────────────
const autoApplyLabel = async (ticketId, labelName, color) => {
    if (!color) color = "#ef4444";
    try {
        const [label] = await Label_1.default.findOrCreate({
            where: { name: labelName },
            defaults: { name: labelName, color }
        });
        await TicketLabel_1.default.findOrCreate({ where: { ticketId, labelId: label.id } });
        const io = (0, socket_1.getIO)();
        const ticket = await Ticket_1.default.findByPk(ticketId, {
            include: [{ model: Label_1.default, as: "labels" }]
        });
        if (ticket) {
            io.to("notification").to(ticket.status).to(ticketId.toString())
                .emit("ticket", { action: "update", ticket });
        }
    } catch (err) {
        logger_1.logger.error(err, `autoApplyLabel Telegram: ticketId=${ticketId} label=${labelName}`);
    }
};

// ─── Find or create Telegram ticket ──────────────────────────────────────────
const findOrCreateTelegramTicket = async (contact, telegramId, unreadMessages) => {
    let ticket = await Ticket_1.default.findOne({
        where: {
            status: { [sequelize_1.Op.or]: ["open", "pending"] },
            contactId: contact.id,
            telegramId
        }
    });

    if (ticket) {
        await ticket.update({ unreadMessages, isGroup: false });
    }

    if (!ticket) {
        ticket = await Ticket_1.default.findOne({
            where: {
                updatedAt: {
                    [sequelize_1.Op.between]: [
                        +(0, date_fns_1.subHours)(new Date(), 2),
                        +new Date()
                    ]
                },
                contactId: contact.id,
                telegramId
            },
            order: [["updatedAt", "DESC"]]
        });

        if (ticket) {
            await ticket.update({
                status: "pending",
                isGroup: false,
                userId: null,
                unreadMessages,
                aiActive: true,
                aiAttempts: 0
            });
        }
    }

    if (!ticket) {
        ticket = await Ticket_1.default.create({
            contactId: contact.id,
            status: "pending",
            isGroup: false,
            aiActive: true,
            unreadMessages,
            telegramId
        });
    }

    return (0, ShowTicketService_1.default)(ticket.id);
};

// ─── Escalate to human ────────────────────────────────────────────────────────
const escalateToHuman = async (bot, ticket, chatId, reason) => {
    logger_1.logger.info(`Telegram: escalating ticket ${ticket.id} to human. Reason: ${reason}`);

    let msg = "Voy a conectarte con un agente ahora. Un momento por favor.";
    try { msg = await (0, CheckSettings_1.default)("aiEscalationMessage"); } catch (_e) { /* default */ }

    const supportQueue = await findQueueByName("oporte");
    const updateData = { aiActive: false };
    if (supportQueue && !ticket.queueId) updateData.queueId = supportQueue.id;
    await ticket.update(updateData);

    const io = (0, socket_1.getIO)();
    io.to("notification").to(ticket.status).emit("ticket", { action: "update", ticket });

    await sendWithTyping(bot, chatId, msg, ticket.id);

    try {
        const summary = await (0, GetAIResponse_1.getTicketSummary)(ticket.id);
        if (summary) {
            await (0, CreateMessageService_1.default)({
                messageData: {
                    id: `tg-internal-${ticket.id}-${Date.now()}`,
                    ticketId: ticket.id,
                    body: `*Resumen IA del caso (Telegram):*\n${summary}`,
                    fromMe: true,
                    read: true,
                    isInternal: true,
                    ack: 2
                }
            });
        }
    } catch (err) {
        logger_1.logger.error(err, "Telegram: error creating internal summary");
    }
};

// ─── AI support handler ───────────────────────────────────────────────────────
const handleAIForTelegram = async (bot, ticket, messageBody, chatId, contactNumber) => {
    const lowerBody = messageBody.toLowerCase();

    if (HUMAN_REQUEST_KEYWORDS.some(kw => lowerBody.includes(kw))) {
        await escalateToHuman(bot, ticket, chatId, "user_request");
        return;
    }

    // Phase 1: Routing question
    if (ticket.aiAttempts === 0) {
        await sendWithTyping(bot, chatId, AI_ROUTING_QUESTION, ticket.id);
        await ticket.update({ aiAttempts: 1 });
        return;
    }

    // Phase 2: Department selection
    if (ticket.aiAttempts === 1) {
        const choice = parseRoutingChoice(messageBody);

        if (choice === "administracion" || choice === "ventas") {
            const keyword = choice === "administracion" ? "dmin" : "enta";
            const queue = await findQueueByName(keyword);
            if (queue) {
                await (0, UpdateTicketService_1.default)({
                    ticketData: { queueId: queue.id, aiActive: false },
                    ticketId: ticket.id
                });
                await sendWithTyping(bot, chatId, `Un momento, te conectamos con ${queue.name}. 🙏`, ticket.id);
            } else {
                await escalateToHuman(bot, ticket, chatId, "queue_not_found");
            }
            return;
        }

        if (choice === "soporte") {
            // ── Verify customer in Splynx before opening support ──────────────────
            let splynxEnabled = false;
            try { splynxEnabled = (await (0, CheckSettings_1.default)("splynxEnabled")) === "enabled"; } catch (_e) { /* ignore */ }

            if (splynxEnabled) {
                const check = await getSplynxInfo(contactNumber, false);
                if (check.customerId) {
                    // Found by phone — skip verification
                    await ticket.update({ aiAttempts: 3 });
                    await sendWithTyping(bot, chatId, "Con gusto te ayudo. ¿Cuál es el problema técnico?", ticket.id);
                } else {
                    // Not found — enter verification phase
                    await ticket.update({ aiAttempts: 2 });
                    await sendWithTyping(bot, chatId,
                        "Para brindarte soporte, primero necesito verificar que eres cliente. 🔍\n\n" +
                        "No encontré tu número en nuestro sistema. Por favor indícame tu *nombre completo* " +
                        "o el *número de teléfono* con el que tienes el servicio.",
                        ticket.id);
                }
            } else {
                // Splynx not enabled — skip verification
                await ticket.update({ aiAttempts: 3 });
                await sendWithTyping(bot, chatId, "Con gusto te ayudo. ¿Cuál es el problema técnico?", ticket.id);
            }
            return;
        }

        await sendWithTyping(bot, chatId, AI_ROUTING_INVALID, ticket.id);
        return;
    }

    // Phase 2.5: Customer identity verification
    // Reached only when Splynx is enabled and the customer was NOT found by phone.
    if (ticket.aiAttempts === 2) {
        const { customerId: foundId, name: foundName } = await verifySplynxCustomer(messageBody);
        if (foundId) {
            // Persist the verified Splynx customer ID so Phase 3 can create the resolution ticket
            await ticket.update({ aiAttempts: 3, splynxCustomerId: foundId });
            await sendWithTyping(bot, chatId,
                `¡Te encontré en el sistema${foundName ? `, *${foundName}*` : ""}! ✅ Con gusto te ayudamos. ¿Cuál es el problema técnico?`,
                ticket.id);
        } else {
            await sendWithTyping(bot, chatId,
                "Lo siento, no encontré esa información en nuestro sistema. 😕\n\n" +
                "Si crees que hay un error o aún no eres cliente, comunícate con nosotros directamente. ¡Gracias!",
                ticket.id);
            await ticket.update({ aiActive: false });
            await (0, UpdateTicketService_1.default)({ ticketData: { status: "closed" }, ticketId: ticket.id });
        }
        return;
    }

    // Phase 3: AI-driven support (aiAttempts >= 3, customer verified)
    let maxAttempts = 10;
    try {
        maxAttempts = parseInt(await (0, CheckSettings_1.default)("aiMaxAttempts"), 10) || 10;
    } catch (_e) { /* default */ }

    if (ticket.aiAttempts >= maxAttempts) {
        await escalateToHuman(bot, ticket, chatId, "max_attempts");
        return;
    }

    let systemPrompt =
        "Eres un asistente de soporte técnico de una empresa de telecomunicaciones/internet.\n" +
        "Adapta tu lenguaje al nivel del cliente. Si usa términos técnicos, responde técnicamente.\n" +
        "Si no los usa, explica paso a paso de forma sencilla.\n" +
        "Respuestas cortas y claras. Máximo 3-4 pasos a la vez. Sé amable y paciente.\n" +
        "El cliente está escribiendo por Telegram.";
    try { systemPrompt = await (0, CheckSettings_1.default)("aiSystemPrompt"); } catch (_e) { /* default */ }

    const isFirstSupportMsg = ticket.aiAttempts === 3; // 3 = first verified support msg
    const splynxInfo = await getSplynxInfo(contactNumber, isFirstSupportMsg);
    // If phone lookup didn't find the customer but we verified by name in Phase 2.5,
    // use the persisted splynxCustomerId so the resolution ticket is still created.
    if (!splynxInfo.customerId && ticket.splynxCustomerId) {
        splynxInfo.customerId = ticket.splynxCustomerId;
    }

    if (splynxInfo.hasOutage) {
        await autoApplyLabel(ticket.id, "Falla General", "#ef4444");
    }

    if (clientConfirmsResolution(messageBody)) {
        const closingMsg =
            "¡Me alegra que tu servicio esté funcionando! 😊 " +
            "Tu caso ha quedado registrado. ¡Que tengas un excelente día!";
        await sendWithTyping(bot, chatId, closingMsg, ticket.id);
        if (splynxInfo.customerId) {
            await createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
        }
        await (0, UpdateTicketService_1.default)({ ticketData: { status: "closed" }, ticketId: ticket.id });
        return;
    }

    const { response, shouldEscalate, shouldResolve } = await (0, GetAIResponse_1.getAIResponse)(
        ticket.id,
        systemPrompt,
        splynxInfo.context || undefined
    );

    if (shouldEscalate) {
        if (response) await sendWithTyping(bot, chatId, response, ticket.id);
        await escalateToHuman(bot, ticket, chatId, "ai_decision");
        return;
    }

    if (shouldResolve) {
        if (response) await sendWithTyping(bot, chatId, response, ticket.id);
        if (splynxInfo.customerId) {
            await createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
        }
        await (0, UpdateTicketService_1.default)({ ticketData: { status: "closed" }, ticketId: ticket.id });
        return;
    }

    if (response) await sendWithTyping(bot, chatId, response, ticket.id);
    await ticket.update({ aiAttempts: ticket.aiAttempts + 1 });
};

// ─── Core message handler ─────────────────────────────────────────────────────
const handleTelegramMessage = async (bot, telegramRecord, msg) => {
    if (!msg.text || (msg.from && msg.from.is_bot)) return;

    const chatId = String(msg.chat.id);
    const fromId = String((msg.from && msg.from.id) || msg.chat.id);
    const firstName = (msg.from && msg.from.first_name) || "";
    const lastName = (msg.from && msg.from.last_name) || "";
    const username = (msg.from && msg.from.username) || "";
    const contactName =
        [firstName, lastName].filter(Boolean).join(" ") ||
        username ||
        `Telegram ${chatId}`;

    try {
        const contact = await (0, CreateOrUpdateContactService_1.default)({
            name: contactName,
            number: fromId,
            isGroup: false
        });

        const ticket = await findOrCreateTelegramTicket(contact, telegramRecord.id, 1);

        const msgId = `tg-${fromId}-${msg.message_id}`;
        await (0, CreateMessageService_1.default)({
            messageData: {
                id: msgId,
                ticketId: ticket.id,
                contactId: contact.id,
                body: msg.text,
                fromMe: false,
                read: true,
                ack: 2
            }
        });

        const io = (0, socket_1.getIO)();
        io.to("notification").to(ticket.status).to(String(ticket.id))
            .emit("ticket", { action: "update", ticket });

        if (ticket.aiActive && !ticket.userId) {
            await handleAIForTelegram(bot, ticket, msg.text, chatId, fromId);
        }
    } catch (err) {
        logger_1.logger.error(err, `Telegram: error handling message from chat ${chatId}`);
    }
};

// ─── Bot lifecycle ────────────────────────────────────────────────────────────
const startTelegramBot = async (telegramRecord) => {
    const { id, botToken, name } = telegramRecord;

    if (_bots.has(id)) {
        logger_1.logger.info(`Telegram: bot "${name}" (id=${id}) is already running`);
        return;
    }

    try {
        const bot = new node_telegram_bot_api_1.default(botToken, { polling: true });

        bot.on("message", async (msg) => {
            await handleTelegramMessage(bot, telegramRecord, msg);
        });

        bot.on("polling_error", (err) => {
            logger_1.logger.error(err, `Telegram: polling error for bot "${name}" (id=${id})`);
        });

        _bots.set(id, bot);
        await telegramRecord.update({ status: "connected" });
        logger_1.logger.info(`Telegram: bot "${name}" (id=${id}) started polling`);

    } catch (err) {
        await telegramRecord.update({ status: "error" });
        logger_1.logger.error(err, `Telegram: failed to start bot "${name}" (id=${id})`);
        throw err;
    }
};
exports.startTelegramBot = startTelegramBot;

const stopTelegramBot = async (telegramId) => {
    const bot = _bots.get(telegramId);
    if (!bot) return;
    await bot.stopPolling();
    _bots.delete(telegramId);
    await Telegram_1.default.update({ status: "disconnected" }, { where: { id: telegramId } });
    logger_1.logger.info(`Telegram: bot id=${telegramId} stopped`);
};
exports.stopTelegramBot = stopTelegramBot;

const startAllTelegramBots = async () => {
    try {
        const telegrams = await Telegram_1.default.findAll();
        for (const t of telegrams) {
            startTelegramBot(t).catch(err =>
                logger_1.logger.error(err, `Telegram: failed to start bot id=${t.id}`)
            );
        }
        logger_1.logger.info(`Telegram: started ${telegrams.length} bot(s)`);
    } catch (err) {
        logger_1.logger.error(err, "Telegram: startAllTelegramBots error");
    }
};
exports.startAllTelegramBots = startAllTelegramBots;

const sendTelegramMessage = async (telegramId, chatId, text) => {
    const bot = _bots.get(telegramId);
    if (!bot) throw new Error(`Telegram bot id=${telegramId} not running`);
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
};
exports.sendTelegramMessage = sendTelegramMessage;
