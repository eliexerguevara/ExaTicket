import { Request, Response } from "express";
import { Op } from "sequelize";

import Label from "../models/Label";
import Ticket from "../models/Ticket";
import TicketLabel from "../models/TicketLabel";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { getIO } from "../libs/socket";
import { whatsappProvider } from "../providers/WhatsApp/whatsappProvider";
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
  return res.json(label);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const label = await Label.findByPk(id);
  if (!label) return res.status(404).json({ error: "Label not found" });
  await label.destroy();
  return res.status(200).json({ message: "Label deleted" });
};

// ── Ticket-label association ──────────────────────────────────────────────────

export const addToTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId, labelId } = req.params;

  await TicketLabel.findOrCreate({
    where: { ticketId: Number(ticketId), labelId: Number(labelId) }
  });

  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      { model: Label, as: "labels" },
      { model: Contact, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["name"] }
    ]
  });

  const io = getIO();
  io.to("notification")
    .to(ticket?.status || "")
    .to(ticketId.toString())
    .emit("ticket", { action: "update", ticket });

  return res.json(ticket);
};

export const removeFromTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId, labelId } = req.params;

  await TicketLabel.destroy({
    where: { ticketId: Number(ticketId), labelId: Number(labelId) }
  });

  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      { model: Label, as: "labels" },
      { model: Contact, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["name"] }
    ]
  });

  const io = getIO();
  io.to("notification")
    .to(ticket?.status || "")
    .to(ticketId.toString())
    .emit("ticket", { action: "update", ticket });

  return res.json(ticket);
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

  // Find all open/pending tickets with this label
  const ticketLabels = await TicketLabel.findAll({
    where: { labelId: Number(labelId) },
    include: [
      {
        model: Ticket,
        as: "ticket",
        where: { status: { [Op.in]: ["open", "pending"] } },
        include: [
          { model: Contact, as: "contact" },
          { model: Whatsapp, as: "whatsapp" }
        ]
      }
    ]
  });

  let sent = 0;
  const total = ticketLabels.length;
  const errors: string[] = [];

  for (const tl of ticketLabels as any[]) {
    const ticket: Ticket = tl.ticket;
    if (!ticket) continue;

    const contact: any = (ticket as any).contact;
    const contactNumber: string = contact?.number;
    if (!contactNumber || !ticket.whatsappId) continue;

    try {
      await whatsappProvider.sendMessage(
        ticket.whatsappId,
        `${contactNumber}@c.us`,
        message
      );

      // Save the broadcast message in the ticket so agents can see it
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
