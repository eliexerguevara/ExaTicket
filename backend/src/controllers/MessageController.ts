import { randomBytes } from "crypto";
import { Request, Response } from "express";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import EnsureTicketAccess from "../helpers/EnsureTicketAccess";
import { getIO } from "../libs/socket";
import Message from "../models/Message";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import EditWhatsAppMessage from "../services/WbotServices/EditWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import { sendTelegramMessage } from "../services/TelegramService/TelegramBotService";
import { getAgentAdvice } from "../services/AIServices/GetAIResponse";
import { logger } from "../utils/logger";

type IndexQuery = {
  pageNumber: string;
};

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber } = req.query as IndexQuery;

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId
  });

  await EnsureTicketAccess(ticket, req.user);

  SetTicketMessagesAsRead(ticket);

  return res.json({ count, messages, ticket, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  const ticket = await ShowTicketService(ticketId);

  await EnsureTicketAccess(ticket, req.user);

  SetTicketMessagesAsRead(ticket);

  // ── Telegram ticket ──────────────────────────────────────────────────────────
  if (ticket.telegramId) {
    if (medias) {
      // Telegram media not supported via agent UI yet — send text notification
      return res.status(400).json({ error: "El envío de archivos por Telegram no está soportado aún desde el panel." });
    }
    try {
      const chatId = ticket.contact.number; // stored as Telegram user/chat ID string
      await sendTelegramMessage(ticket.telegramId, chatId, body);

      // CreateMessageService saves to DB AND emits the socket event with full message
      const msgId = `tg-agent-${chatId}-${Date.now()}`;
      await CreateMessageService({
        messageData: {
          id: msgId,
          ticketId: ticket.id,
          body,
          fromMe: true,
          read: true,
          ack: 2
        }
      });
    } catch (err) {
      logger.error(err, `MessageController: error sending Telegram message for ticket ${ticketId}`);
      return res.status(500).json({ error: "Error al enviar mensaje por Telegram" });
    }
    return res.send();
  }

  // ── WhatsApp ticket ──────────────────────────────────────────────────────────
  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ media, ticket });
      })
    );
  } else {
    await SendWhatsAppMessage({ body, ticket, quotedMsg });
  }

  return res.send();
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;
  // ?scope=me → local delete only | ?scope=everyone (default) → delete on WhatsApp too
  const scope = (req.query.scope as string) === "me" ? "me" : "everyone";

  const message = await DeleteWhatsAppMessage(messageId, scope, req.user);

  const io = getIO();
  io.to(message.ticketId.toString()).emit("appMessage", {
    action: "update",
    message
  });

  return res.send();
};

export const edit = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;
  const { body: newBody } = req.body;

  if (!newBody || !newBody.trim()) {
    return res.status(400).json({ error: "body is required" });
  }

  const message = await EditWhatsAppMessage(messageId, newBody.trim(), req.user);

  const io = getIO();
  io.to(message.ticketId.toString()).emit("appMessage", {
    action: "update",
    message
  });

  return res.json(message);
};

// ─── Agent asks AI about a ticket ─────────────────────────────────────────────

export const agentAsk = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { question } = req.body as { question: string };

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "La pregunta no puede estar vacía" });
  }

  const ticket = await ShowTicketService(ticketId);
  await EnsureTicketAccess(ticket, req.user);

  try {
    const { response } = await getAgentAdvice(Number(ticketId), question.trim());

    // Save as an internal message so it's visible in the ticket chat
    const noteId = `agent-ai-${ticketId}-${randomBytes(6).toString("hex")}`;
    await CreateMessageService({
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
  } catch (err) {
    logger.error(err, "Error in agentAsk endpoint");
    return res.status(500).json({ error: "Error al consultar a la IA" });
  }
};
