import { Request, Response } from "express";
import { Op } from "sequelize";

import Label from "../models/Label";
import Ticket from "../models/Ticket";
import TicketLabel from "../models/TicketLabel";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import { getIO } from "../libs/socket";
import { whatsappProvider } from "../providers/WhatsApp/whatsappProvider";
import { getBotInstance } from "../services/TelegramService/TelegramBotService";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";
import CreateMessageService from "../services/MessageServices/CreateMessageService";

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const index = async (req: Request, res: Response): Promise<Response> => {
  const labels = await Label.findAll({ order: [["name", "ASC"]] });
  return res.json(labels);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { name, color } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: "name and color are required" });
  }
  const label = await Label.create({ name, color });
  return res.status(201).json(label);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { name, color } = req.body;
  const label = await Label.findByPk(id);
  if (!label) return res.status(404).json({ error: "Label not found" });
  await label.update({ ...(name && { name }), ...(color && { color }) });

  // Notify frontend so live ticket views show the new name/color immediately
  const affectedTicketLabels = await TicketLabel.findAll({
    where: { labelId: Number(id) }
  });
  if (affectedTicketLabels.length > 0) {
    const io = getIO();
    for (const tl of affectedTicketLabels) {
      try {
        const ticket = await ShowTicketService(tl.ticketId);
        io.to("notification")
          .to(ticket.status)
          .to(tl.ticketId.toString())
          .emit("ticket", { action: "update", ticket });
      } catch {
        // ticket may have been closed; skip silently
      }
    }
  }

  return res.json(label);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const label = await Label.findByPk(id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  // Find affected tickets BEFORE destroying (CASCADE will remove TicketLabel rows)
  const affectedTicketLabels = await TicketLabel.findAll({
    where: { labelId: Number(id) }
  });
  const affectedTicketIds = affectedTicketLabels.map(tl => tl.ticketId);

  await label.destroy();

  // Notify frontend so live ticket views refresh and remove the deleted chip
  if (affectedTicketIds.length > 0) {
    const io = getIO();
    for (const ticketId of affectedTicketIds) {
      try {
        const ticket = await ShowTicketService(ticketId);
        io.to("notification")
          .to(ticket.status)
          .to(ticketId.toString())
          .emit("ticket", { action: "update", ticket });
      } catch {
        // ticket may have been closed; skip silently
      }
    }
  }

  return res.status(200).json({ message: "Label deleted" });
};

// ── Ticket-label association ──────────────────────────────────────────────────

export const addToTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId, labelId } = req.params;
  try {
    await TicketLabel.findOrCreate({
      where: { ticketId: Number(ticketId), labelId: Number(labelId) }
    });

    // Use ShowTicketService so the socket event always carries the full ticket
    // (labels, user, queue, contact, whatsapp) — prevents fields from disappearing
    const ticket = await ShowTicketService(ticketId);

    const io = getIO();
    io.to("notification")
      .to(ticket.status)
      .to(ticketId.toString())
      .emit("ticket", { action: "update", ticket });

    return res.json(ticket);
  } catch (err) {
    logger.error(err, `addToTicket error: ticketId=${ticketId} labelId=${labelId}`);
    return res.status(500).json({ error: "Failed to add label to ticket" });
  }
};

export const removeFromTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId, labelId } = req.params;
  try {
    await TicketLabel.destroy({
      where: { ticketId: Number(ticketId), labelId: Number(labelId) }
    });

    // Use ShowTicketService so the socket event always carries the full ticket
    const ticket = await ShowTicketService(ticketId);

    const io = getIO();
    io.to("notification")
      .to(ticket.status)
      .to(ticketId.toString())
      .emit("ticket", { action: "update", ticket });

    return res.json(ticket);
  } catch (err) {
    logger.error(err, `removeFromTicket error: ticketId=${ticketId} labelId=${labelId}`);
    return res.status(500).json({ error: "Failed to remove label from ticket" });
  }
};

// ── Broadcast ─────────────────────────────────────────────────────────────────

export const broadcast = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { labelId } = req.params;
  const { message, resolveTickets } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // Step 1: get ticketIds (TicketLabel has no BelongsTo assoc → no join possible)
  const ticketLabelRows = await TicketLabel.findAll({
    where: { labelId: Number(labelId) }
  });
  const ticketIds = ticketLabelRows.map(tl => tl.ticketId);

  if (ticketIds.length === 0) {
    return res.json({ sent: 0, total: 0 });
  }

  // Step 2: fetch open/pending tickets with contact + whatsapp
  const tickets = await Ticket.findAll({
    where: {
      id: { [Op.in]: ticketIds },
      status: { [Op.in]: ["open", "pending"] }
    },
    include: [
      { model: Contact, as: "contact" },
      { model: Whatsapp, as: "whatsapp" }
    ]
  });

  let sent = 0;
  const total = tickets.length;
  const errors: string[] = [];

  for (const ticket of tickets) {
    const contact: any = (ticket as any).contact;
    const contactNumber: string = contact?.number;
    // Must have contact number and at least one channel (WhatsApp or Telegram)
    if (!contactNumber || (!ticket.whatsappId && !ticket.telegramId)) continue;

    try {
      if (ticket.whatsappId) {
        // WhatsApp broadcast — the WhatsApp message_create event handler
        // (handleWhatsappEvents) already listens for outgoing messages and
        // calls CreateMessageService automatically. Do NOT call it here too,
        // or the message will be saved (and delivered to the client) twice.
        await whatsappProvider.sendMessage(
          ticket.whatsappId,
          `${contactNumber}@c.us`,
          message
        );
      } else if (ticket.telegramId) {
        // Telegram broadcast — contactNumber IS the Telegram chat ID.
        // No outgoing-message listener on the Telegram side, so we must
        // save the message manually so agents can see it in the ticket.
        const bot = getBotInstance(ticket.telegramId);
        if (!bot) {
          errors.push(`ticket ${ticket.id}: Telegram bot not available (id=${ticket.telegramId})`);
          continue;
        }
        await (bot as any).sendMessage(Number(contactNumber), message, { parse_mode: "Markdown" });

        const msgId = `broadcast-${ticket.id}-${Date.now()}`;
        await CreateMessageService({
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
      }

      sent++;

      if (resolveTickets) {
        await UpdateTicketService({
          ticketData: { status: "closed" },
          ticketId: ticket.id
        });
      }
    } catch (err) {
      logger.error(err, `Broadcast error on ticket ${ticket.id}`);
      errors.push(`ticket ${ticket.id}: ${String(err)}`);
    }
  }

  logger.info(`Broadcast label ${labelId}: sent=${sent}/${total}`);
  return res.json({ sent, total, errors: errors.length ? errors : undefined });
};
