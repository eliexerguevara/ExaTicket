import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import CheckSettings from "../../helpers/CheckSettings";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import Ticket from "../../models/Ticket";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowTicketService from "./ShowTicketService";
import { getTicketSummary, getTicketImages } from "../AIServices/GetAIResponse";

interface TicketData {
  status?: string;
  userId?: number;
  queueId?: number;
  whatsappId?: number;
  aiActive?: boolean;
}

interface Request {
  ticketData: TicketData;
  ticketId: string | number;
}

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

const UpdateTicketService = async ({
  ticketData,
  ticketId
}: Request): Promise<Response> => {
  const { status, userId, queueId, whatsappId, aiActive } = ticketData;

  const ticket = await ShowTicketService(ticketId);
  await SetTicketMessagesAsRead(ticket);

  if (whatsappId && ticket.whatsappId !== whatsappId) {
    await CheckContactOpenTickets(ticket.contactId, whatsappId);
  }

  const oldStatus = ticket.status;
  const oldUserId = ticket.user?.id;

  if (oldStatus === "closed") {
    await CheckContactOpenTickets(ticket.contact.id, ticket.whatsappId);
  }

  await ticket.update({
    status,
    queueId,
    userId,
    ...(aiActive !== undefined && { aiActive })
  });

  if (whatsappId) {
    await ticket.update({
      whatsappId
    });
  }

  // When an agent manually closes a ticket and AI is globally disabled,
  // document the case in Splynx automatically (fire-and-forget, non-blocking).
  if (status === "closed" && oldStatus !== "closed" && ticket.splynxCustomerId) {
    const aiEnabled = await CheckSettings("aiEnabled").catch(() => "disabled");
    if (aiEnabled !== "enabled") {
      setImmediate(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { createSplynxTicket } = require("../SplynxService/SplynxService");
          const [summaryResult, images] = await Promise.all([
            getTicketSummary(Number(ticketId)),
            getTicketImages(Number(ticketId))
          ]);
          const summary = summaryResult?.summary ?? null;
          const dateStr = new Date().toLocaleDateString("es", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });
          const subject = `Soporte WhatsApp ${dateStr}`;
          let body = summary
            ? `Caso cerrado por agente.\n\nResumen:\n${summary}`
            : "Caso cerrado por agente.";
          const clientImages = images.filter((img: any) => !img.fromMe);
          if (clientImages.length > 0) {
            body += `\n\nImágenes enviadas por el cliente (${clientImages.length}):`;
            clientImages.forEach((img: any, i: number) => {
              body += `\n• Imagen ${i + 1}: ${img.url}`;
            });
          }
          const result = await createSplynxTicket(ticket.splynxCustomerId, subject, body, "low", "closed");
          if (result?.id) {
            logger.info(
              `UpdateTicketService: Splynx ticket created (id=${result.id}) on manual close of ticket ${ticketId}`
            );
          }
        } catch (err) {
          logger.error(err, `UpdateTicketService: error creating Splynx ticket on manual close of ticket ${ticketId}`);
        }
      });
    }
  }

  // Re-fetch with all associations (labels, contact, queue, user…) so the
  // socket event always carries the complete ticket — prevents labels from
  // disappearing when the frontend receives the update.
  const updatedTicket = await ShowTicketService(ticketId);

  const io = getIO();

  if (updatedTicket.status !== oldStatus || updatedTicket.user?.id !== oldUserId) {
    io.to(oldStatus).emit("ticket", {
      action: "delete",
      ticketId: updatedTicket.id
    });
  }

  io.to(updatedTicket.status)
    .to("notification")
    .to(ticketId.toString())
    .emit("ticket", {
      action: "update",
      ticket: updatedTicket
    });

  return { ticket: updatedTicket, oldStatus, oldUserId };
};

export default UpdateTicketService;
