import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { whatsappProvider } from "../../providers/WhatsApp";
import GetWhatsappChatId from "../../helpers/GetWhatsappChatId";
import EnsureTicketAccess from "../../helpers/EnsureTicketAccess";

interface RequestingUser {
  id: string | number;
  profile: string;
}

/**
 * scope = "me"       → mark deleted in DB only (client keeps the message on their phone)
 * scope = "everyone" → attempt to delete on WhatsApp for both parties, then mark deleted in DB
 */
const DeleteWhatsAppMessage = async (
  messageId: string,
  scope: "me" | "everyone" = "everyone",
  requestingUser?: RequestingUser
): Promise<Message> => {
  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: ["contact"]
      }
    ]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  if (requestingUser && message.ticket) {
    await EnsureTicketAccess(message.ticket, requestingUser);
  }

  if (scope === "everyone" && message.ticket?.whatsappId) {
    try {
      const { ticket } = message;
      const chatId = GetWhatsappChatId(ticket);
      await whatsappProvider.deleteMessage(
        ticket.whatsappId,
        chatId,
        message.id,
        message.fromMe
      );
    } catch (_err) {
      // WhatsApp API may fail for old messages, broadcast synthetic IDs, or
      // messages outside the deletion window. Fall through — still mark deleted locally.
    }
  }

  await message.update({ isDeleted: true });

  return message;
};

export default DeleteWhatsAppMessage;
