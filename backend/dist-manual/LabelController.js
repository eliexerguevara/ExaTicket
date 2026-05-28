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
exports.broadcast = exports.removeFromTicket = exports.addToTicket = exports.remove = exports.update = exports.store = exports.index = void 0;
const sequelize_1 = require("sequelize");
const Label_1 = __importDefault(require("../models/Label"));
const Ticket_1 = __importDefault(require("../models/Ticket"));
const TicketLabel_1 = __importDefault(require("../models/TicketLabel"));
const UpdateTicketService_1 = __importDefault(require("../services/TicketServices/UpdateTicketService"));
const socket_1 = require("../libs/socket");
const whatsappProvider_1 = require("../providers/WhatsApp/whatsappProvider");
const Contact_1 = __importDefault(require("../models/Contact"));
const Whatsapp_1 = __importDefault(require("../models/Whatsapp"));
const logger_1 = require("../utils/logger");
const CreateMessageService_1 = __importDefault(require("../services/MessageServices/CreateMessageService"));
// ── CRUD ──────────────────────────────────────────────────────────────────────
const index = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const labels = yield Label_1.default.findAll({ order: [["name", "ASC"]] });
    return res.json(labels);
});
exports.index = index;
const store = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, color } = req.body;
    if (!name || !color) {
        return res.status(400).json({ error: "name and color are required" });
    }
    const label = yield Label_1.default.create({ name, color });
    return res.status(201).json(label);
});
exports.store = store;
const update = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, color } = req.body;
    const label = yield Label_1.default.findByPk(id);
    if (!label)
        return res.status(404).json({ error: "Label not found" });
    yield label.update(Object.assign(Object.assign({}, (name && { name })), (color && { color })));
    return res.json(label);
});
exports.update = update;
const remove = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const label = yield Label_1.default.findByPk(id);
    if (!label)
        return res.status(404).json({ error: "Label not found" });
    yield label.destroy();
    return res.status(200).json({ message: "Label deleted" });
});
exports.remove = remove;
// ── Ticket-label association ──────────────────────────────────────────────────
const addToTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId, labelId } = req.params;
    yield TicketLabel_1.default.findOrCreate({
        where: { ticketId: Number(ticketId), labelId: Number(labelId) }
    });
    const ticket = yield Ticket_1.default.findByPk(ticketId, {
        include: [
            { model: Label_1.default, as: "labels" },
            { model: Contact_1.default, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
            { model: Whatsapp_1.default, as: "whatsapp", attributes: ["name"] }
        ]
    });
    const io = (0, socket_1.getIO)();
    io.to("notification")
        .to((ticket === null || ticket === void 0 ? void 0 : ticket.status) || "")
        .to(ticketId.toString())
        .emit("ticket", { action: "update", ticket });
    return res.json(ticket);
});
exports.addToTicket = addToTicket;
const removeFromTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId, labelId } = req.params;
    yield TicketLabel_1.default.destroy({
        where: { ticketId: Number(ticketId), labelId: Number(labelId) }
    });
    const ticket = yield Ticket_1.default.findByPk(ticketId, {
        include: [
            { model: Label_1.default, as: "labels" },
            { model: Contact_1.default, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
            { model: Whatsapp_1.default, as: "whatsapp", attributes: ["name"] }
        ]
    });
    const io = (0, socket_1.getIO)();
    io.to("notification")
        .to((ticket === null || ticket === void 0 ? void 0 : ticket.status) || "")
        .to(ticketId.toString())
        .emit("ticket", { action: "update", ticket });
    return res.json(ticket);
});
exports.removeFromTicket = removeFromTicket;
// ── Broadcast ─────────────────────────────────────────────────────────────────
const broadcast = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { labelId } = req.params;
    const { message, resolveTickets } = req.body;
    if (!message) {
        return res.status(400).json({ error: "message is required" });
    }
    const ticketLabels = yield TicketLabel_1.default.findAll({
        where: { labelId: Number(labelId) },
        include: [
            {
                model: Ticket_1.default,
                as: "ticket",
                where: { status: { [sequelize_1.Op.in]: ["open", "pending"] } },
                include: [
                    { model: Contact_1.default, as: "contact" },
                    { model: Whatsapp_1.default, as: "whatsapp" }
                ]
            }
        ]
    });
    let sent = 0;
    const total = ticketLabels.length;
    const errors = [];
    for (const tl of ticketLabels) {
        const ticket = tl.ticket;
        if (!ticket)
            continue;
        const contact = ticket.contact;
        const contactNumber = contact === null || contact === void 0 ? void 0 : contact.number;
        if (!contactNumber || !ticket.whatsappId)
            continue;
        try {
            yield whatsappProvider_1.whatsappProvider.sendMessage(ticket.whatsappId, `${contactNumber}@c.us`, message);
            const msgId = `broadcast-${ticket.id}-${Date.now()}`;
            yield (0, CreateMessageService_1.default)({
                messageData: {
                    id: msgId,
                    ticketId: ticket.id,
                    body: message,
                    fromMe: true,
                    read: true,
                    isInternal: false,
                    ack: 2
                }
            });
            sent++;
            if (resolveTickets) {
                yield (0, UpdateTicketService_1.default)({
                    ticketData: { status: "closed" },
                    ticketId: ticket.id
                });
            }
        }
        catch (err) {
            logger_1.logger.error(err, `Broadcast error on ticket ${ticket.id}`);
            errors.push(`ticket ${ticket.id}: ${String(err)}`);
        }
    }
    logger_1.logger.info(`Broadcast label ${labelId}: sent=${sent}/${total}`);
    return res.json({ sent, total, errors: errors.length ? errors : undefined });
});
exports.broadcast = broadcast;
