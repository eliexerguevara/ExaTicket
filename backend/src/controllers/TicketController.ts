import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import formatBody from "../helpers/Mustache";
import EnsureTicketAccess from "../helpers/EnsureTicketAccess";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date: string;
  showAll: string;
  withUnreadMessages: string;
  queueIds: string;
  isGroup: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    withUnreadMessages,
    isGroup
  } = req.query as IndexQuery;

  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  // showAll quita el filtro por usuario/cola - solo admin/superadmin pueden
  // usarlo, sin importar lo que venga en el query string.
  const canShowAll =
    req.user.profile === "admin" || req.user.profile === "superadmin";

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    pageNumber,
    status,
    date,
    showAll: canShowAll ? showAll : "false",
    userId,
    queueIds,
    withUnreadMessages,
    isGroup
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId }: TicketData = req.body;

  const ticket = await CreateTicketService({ contactId, status, userId });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const contact = await ShowTicketService(ticketId);
  await EnsureTicketAccess(contact, req.user);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const ticketData: TicketData = req.body;

  const existingTicket = await ShowTicketService(ticketId);
  await EnsureTicketAccess(existingTicket, req.user);

  const { ticket } = await UpdateTicketService({
    ticketData,
    ticketId
  });

  // Only send WhatsApp farewell for WhatsApp tickets (Telegram tickets have no whatsappId)
  if (ticket.status === "closed" && ticket.whatsappId) {
    try {
      const whatsapp = await ShowWhatsAppService(ticket.whatsappId);
      const { farewellMessage } = whatsapp;
      if (farewellMessage) {
        await SendWhatsAppMessage({
          body: formatBody(farewellMessage, ticket.contact),
          ticket
        });
      }
    } catch (err) {
      logger.warn({ ticketId, err }, "TicketController: could not send farewell message, ignoring");
    }
  }

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  // Borrar tickets es accion de admin/superadmin (ver rules.js:
  // "ticket-options:deleteTicket"), no solo de quien tiene el ticket asignado.
  if (req.user.profile !== "admin" && req.user.profile !== "superadmin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  io.to(ticket.status).to(ticketId).to("notification").emit("ticket", {
    action: "delete",
    ticketId: +ticketId
  });

  return res.status(200).json({ message: "ticket deleted" });
};
