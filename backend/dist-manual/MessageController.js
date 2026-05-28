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
exports.agentAsk = exports.remove = exports.store = exports.index = void 0;
const crypto_1 = require("crypto");
const SetTicketMessagesAsRead_1 = __importDefault(require("../helpers/SetTicketMessagesAsRead"));
const socket_1 = require("../libs/socket");
const ListMessagesService_1 = __importDefault(require("../services/MessageServices/ListMessagesService"));
const CreateMessageService_1 = __importDefault(require("../services/MessageServices/CreateMessageService"));
const ShowTicketService_1 = __importDefault(require("../services/TicketServices/ShowTicketService"));
const DeleteWhatsAppMessage_1 = __importDefault(require("../services/WbotServices/DeleteWhatsAppMessage"));
const SendWhatsAppMedia_1 = __importDefault(require("../services/WbotServices/SendWhatsAppMedia"));
const SendWhatsAppMessage_1 = __importDefault(require("../services/WbotServices/SendWhatsAppMessage"));
const TelegramBotService_1 = require("../services/TelegramService/TelegramBotService");
const GetAIResponse_1 = require("../services/AIServices/GetAIResponse");
const logger_1 = require("../utils/logger");
const index = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId } = req.params;
    const { pageNumber } = req.query;
    const { count, messages, ticket, hasMore } = yield (0, ListMessagesService_1.default)({
        pageNumber,
        ticketId
    });
    (0, SetTicketMessagesAsRead_1.default)(ticket);
    return res.json({ count, messages, ticket, hasMore });
});
exports.index = index;
const store = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId } = req.params;
    const { body, quotedMsg } = req.body;
    const medias = req.files;
    const ticket = yield (0, ShowTicketService_1.default)(ticketId);
    (0, SetTicketMessagesAsRead_1.default)(ticket);
    // ── Telegram ticket ──────────────────────────────────────────────────────────
    if (ticket.telegramId) {
        if (medias) {
            return res.status(400).json({ error: "El envio de archivos por Telegram no esta soportado aun desde el panel." });
        }
        try {
            const chatId = ticket.contact.number;
            yield (0, TelegramBotService_1.sendTelegramMessage)(ticket.telegramId, chatId, body);
            const msgId = `tg-agent-${chatId}-${Date.now()}`;
            yield (0, CreateMessageService_1.default)({
                messageData: {
                    id: msgId,
                    ticketId: ticket.id,
                    body,
                    fromMe: true,
                    read: true,
                    ack: 2
                }
            });
            const io = (0, socket_1.getIO)();
            io.to(ticket.status).to(ticketId).emit("appMessage", {
                action: "create",
                message: { id: msgId, ticketId: ticket.id, body, fromMe: true, read: true, ack: 2 },
                ticket,
                contact: ticket.contact
            });
        }
        catch (err) {
            logger_1.logger.error(err, `MessageController: error sending Telegram message for ticket ${ticketId}`);
            return res.status(500).json({ error: "Error al enviar mensaje por Telegram" });
        }
        return res.send();
    }
    // ── WhatsApp ticket ──────────────────────────────────────────────────────────
    if (medias) {
        yield Promise.all(medias.map((media) => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, SendWhatsAppMedia_1.default)({ media, ticket });
        })));
    }
    else {
        yield (0, SendWhatsAppMessage_1.default)({ body, ticket, quotedMsg });
    }
    return res.send();
});
exports.store = store;
const remove = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { messageId } = req.params;
    const message = yield (0, DeleteWhatsAppMessage_1.default)(messageId);
    const io = (0, socket_1.getIO)();
    io.to(message.ticketId.toString()).emit("appMessage", {
        action: "update",
        message
    });
    return res.send();
});
exports.remove = remove;
// ─── Agent asks AI about a ticket ─────────────────────────────────────────────
const agentAsk = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId } = req.params;
    const { question } = req.body;
    if (!question || !question.trim()) {
        return res.status(400).json({ error: "La pregunta no puede estar vacia" });
    }
    try {
        const { response } = yield (0, GetAIResponse_1.getAgentAdvice)(Number(ticketId), question.trim());
        const noteId = `agent-ai-${ticketId}-${(0, crypto_1.randomBytes)(6).toString("hex")}`;
        yield (0, CreateMessageService_1.default)({
            messageData: {
                id: noteId,
                ticketId: Number(ticketId),
                body: `*Pregunta agente:* ${question.trim()}\n\n*Respuesta IA:*\n${response}`,
                fromMe: true,
                read: true,
                isInternal: true,
                ack: 2
            }
        });
        return res.json({ response });
    }
    catch (err) {
        logger_1.logger.error(err, "Error in agentAsk endpoint");
        return res.status(500).json({ error: "Error al consultar a la IA" });
    }
});
exports.agentAsk = agentAsk;
