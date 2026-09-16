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

const EditWhatsAppMessage = async (
  messageId: string,
  newBody: string,
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

  if (!message.fromMe) {
    throw new AppError("Only your own messages can be edited.", 403);
  }

  const { ticket } = message;

  if (requestingUser && ticket) {
    await EnsureTicketAccess(ticket, requestingUser);
  }

  if (ticket?.whatsappId) {
    try {
      const chatId = GetWhatsappChatId(ticket);
      await whatsappProvider.editMessage(
        ticket.whatsappId,
        chatId,
        message.id,
        newBody
      );
    } catch (_err) {
      // WhatsApp edit may fail for old messages. Update DB regardless.
    }
  }

  await message.update({ body: newBody, isEdited: true });

  return message;
};

export default EditWhatsAppMessage;
