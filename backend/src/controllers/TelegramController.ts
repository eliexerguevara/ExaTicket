import { Request, Response } from "express";
import Telegram from "../models/Telegram";
import {
  startTelegramBot,
  stopTelegramBot
} from "../services/TelegramService/TelegramBotService";
import { logger } from "../utils/logger";

/** GET /telegram — list all configured bots */
export const index = async (req: Request, res: Response): Promise<Response> => {
  const telegrams = await Telegram.findAll({ order: [["name", "ASC"]] });
  return res.json(telegrams);
};

/** POST /telegram — add a new bot */
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { name, botToken, greetingMessage } = req.body;

  if (!name || !botToken) {
    return res.status(400).json({ error: "name y botToken son requeridos" });
  }

  const existing = await Telegram.findOne({ where: { botToken } });
  if (existing) {
    return res.status(400).json({ error: "Este token ya está registrado" });
  }

  const telegram = await Telegram.create({
    name,
    botToken,
    greetingMessage: greetingMessage || null,
    status: "disconnected"
  });

  // Auto-start the bot
  try {
    await startTelegramBot(telegram);
  } catch (err) {
    logger.warn({ info: `Telegram: bot "${name}" created but failed to start: ${err}` });
  }

  return res.status(201).json(telegram);
};

/** PUT /telegram/:id — update bot settings */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { name, greetingMessage } = req.body;

  const telegram = await Telegram.findByPk(id);
  if (!telegram) return res.status(404).json({ error: "Bot not found" });

  await telegram.update({
    ...(name && { name }),
    greetingMessage: greetingMessage ?? telegram.greetingMessage
  });

  return res.json(telegram);
};

/** DELETE /telegram/:id — remove bot */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const telegram = await Telegram.findByPk(id);
  if (!telegram) return res.status(404).json({ error: "Bot not found" });

  await stopTelegramBot(Number(id));
  await telegram.destroy();
  return res.status(200).json({ message: "Bot removed" });
};

/** POST /telegram/:id/connect — start polling */
export const connect = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const telegram = await Telegram.findByPk(id);
  if (!telegram) return res.status(404).json({ error: "Bot not found" });

  try {
    await startTelegramBot(telegram);
    return res.json({ status: "connected" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to connect" });
  }
};

/** POST /telegram/:id/disconnect — stop polling */
export const disconnect = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  await stopTelegramBot(Number(id));
  return res.json({ status: "disconnected" });
};
