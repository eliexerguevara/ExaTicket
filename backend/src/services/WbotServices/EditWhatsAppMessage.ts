import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { whatsappProvider } from "../../providers/WhatsApp";
import GetWhatsappChatId from "../../helpers/GetWhatsappChatId";

const EditWhatsAppMessage = async (
  messageId: string,
  newBody: string
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
