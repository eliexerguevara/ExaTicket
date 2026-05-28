"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnect = exports.connect = exports.remove = exports.update = exports.store = exports.index = void 0;

const Telegram_1 = __importDefault(require("../models/Telegram"));
const TelegramBotService_1 = require("../services/TelegramService/TelegramBotService");
const logger_1 = require("../utils/logger");

/** GET /telegram — list all configured bots */
const index = async (req, res) => {
    const telegrams = await Telegram_1.default.findAll({ order: [["name", "ASC"]] });
    return res.json(telegrams);
};
exports.index = index;

/** POST /telegram — add a new bot */
const store = async (req, res) => {
    const { name, botToken, greetingMessage } = req.body;
    if (!name || !botToken) {
        return res.status(400).json({ error: "name y botToken son requeridos" });
    }
    const existing = await Telegram_1.default.findOne({ where: { botToken } });
    if (existing) {
        return res.status(400).json({ error: "Este token ya está registrado" });
    }
    const telegram = await Telegram_1.default.create({
        name,
        botToken,
        greetingMessage: greetingMessage || null,
        status: "disconnected"
    });
    try {
        await (0, TelegramBotService_1.startTelegramBot)(telegram);
    } catch (err) {
        logger_1.logger.warn({ info: `Telegram: bot "${name}" created but failed to start: ${err}` });
    }
    return res.status(201).json(telegram);
};
exports.store = store;

/** PUT /telegram/:id — update bot settings */
const update = async (req, res) => {
    const { id } = req.params;
    const { name, greetingMessage } = req.body;
    const telegram = await Telegram_1.default.findByPk(id);
    if (!telegram) return res.status(404).json({ error: "Bot not found" });
    await telegram.update({
        ...(name && { name }),
        greetingMessage: greetingMessage !== undefined ? greetingMessage : telegram.greetingMessage
    });
    return res.json(telegram);
};
exports.update = update;

/** DELETE /telegram/:id — remove bot */
const remove = async (req, res) => {
    const { id } = req.params;
    const telegram = await Telegram_1.default.findByPk(id);
    if (!telegram) return res.status(404).json({ error: "Bot not found" });
    await (0, TelegramBotService_1.stopTelegramBot)(Number(id));
    await telegram.destroy();
    return res.status(200).json({ message: "Bot removed" });
};
exports.remove = remove;

/** POST /telegram/:id/connect — start polling */
const connect = async (req, res) => {
    const { id } = req.params;
    const telegram = await Telegram_1.default.findByPk(id);
    if (!telegram) return res.status(404).json({ error: "Bot not found" });
    try {
        await (0, TelegramBotService_1.startTelegramBot)(telegram);
        return res.json({ status: "connected" });
    } catch (err) {
        return res.status(500).json({ error: (err && err.message) || "Failed to connect" });
    }
};
exports.connect = connect;

/** POST /telegram/:id/disconnect — stop polling */
const disconnect = async (req, res) => {
    const { id } = req.params;
    await (0, TelegramBotService_1.stopTelegramBot)(Number(id));
    return res.json({ status: "disconnected" });
};
exports.disconnect = disconnect;
