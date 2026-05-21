import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import { randomBytes } from "crypto";
import * as Sentry from "@sentry/node";

import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import { debounce } from "../helpers/Debounce";
import formatBody from "../helpers/Mustache";

import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Message from "../models/Message";

import CreateMessageService, {
  MessageData
} from "../services/MessageServices/CreateMessageService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import CreateContactService from "../services/ContactServices/CreateContactService";
import { getAIResponse } from "../services/AIServices/GetAIResponse";
import CheckSettings from "../helpers/CheckSettings";

import { whatsappProvider } from "../providers/WhatsApp/whatsappProvider";
import { MessageType, MessageAck } from "../providers/WhatsApp/types";

const writeFileAsync = promisify(writeFile);

export interface ContactPayload {
  name: string;
  number: string;
  lid?: string;
  profilePicUrl?: string;
  isGroup: boolean;
}

export interface MessagePayload {
  id: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  type: MessageType;
  timestamp: number;
  from: string;
  to: string;
  hasQuotedMsg?: boolean;
  quotedMsgId?: string;
  mediaUrl?: string;
  mediaType?: string;
  ack?: MessageAck;
}

export interface MediaPayload {
  filename: string;
  mimetype: string;
  data: string;
}

export interface WhatsappContextPayload {
  whatsappId: number;
  unreadMessages: number;
  groupContact?: ContactPayload;
}

const makeRandomId = (length: number): string =>
  randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);

const saveMediaFile = async (mediaPayload: MediaPayload): Promise<string> => {
  const randomId = makeRandomId(5);
  const { filename: originalFilename } = mediaPayload;

  let filename: string;
  if (!originalFilename) {
    const [extension] = mediaPayload.mimetype.split("/")[1].split(";");
    filename = `${randomId}-${new Date().getTime()}.${extension}`;
  } else {
    const baseName = originalFilename.split(".").slice(0, -1).join(".");
    const extension = originalFilename.split(".").slice(-1)[0];
    filename = `${baseName}.${randomId}.${extension}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "public", filename),
      mediaPayload.data,
      "base64"
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }

  return filename;
};

const processVcardMessage = async (
  messagePayload: MessagePayload
): Promise<void> => {
  if (messagePayload.type !== "vcard") return;

  try {
    const array = messagePayload.body.split("\n");
    const phoneNumbers: Array<{ number: string }> = [];
    let contactName = "";

    array.forEach(line => {
      const values = line.split(":");
      values.forEach((value, index) => {
        if (value.indexOf("+") !== -1) {
          phoneNumbers.push({ number: value });
        }
        if (value.indexOf("FN") !== -1 && values[index + 1]) {
          contactName = values[index + 1];
        }
      });
    });

    await Promise.all(
      phoneNumbers.map(({ number }) =>
        CreateContactService({
          name: contactName,
          number: number.replace(/\D/g, "")
        })
      )
    );
  } catch (error) {
    logger.error("Error processing vcard message:", error);
  }
};

const handleQueueLogic = async (
  whatsappId: number,
  messageBody: string,
  ticket: Ticket,
  contactPayload: ContactPayload
): Promise<void> => {
  const { queues, greetingMessage } = await ShowWhatsAppService(whatsappId);

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });
    return;
  }

  const selectedOption = messageBody;
  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {
    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id
    });

    const body = formatBody(
      `\u200e${choosenQueue.greetingMessage}`,
      contactPayload as any
    );

    try {
      await whatsappProvider.sendMessage(
        whatsappId,
        `${contactPayload.number}@c.us`,
        body
      );
    } catch (error) {
      logger.error("Error sending queue greeting message:", error);
    }
  } else {
    let options = "";
    queues.forEach((queue, index) => {
      options += `*${index + 1}* - ${queue.name}\n`;
    });

    const body = formatBody(
      `\u200e${greetingMessage}\n${options}`,
      contactPayload as any
    );

    const debouncedSentMessage = debounce(
      async () => {
        try {
          await whatsappProvider.sendMessage(
            whatsappId,
            `${contactPayload.number}@c.us`,
            body
          );
        } catch (error) {
          logger.error("Error sending queue options message:", error);
        }
      },
      3000,
      ticket.id
    );

    debouncedSentMessage();
  }
};

const HUMAN_REQUEST_KEYWORDS = [
  "quiero hablar con",
  "necesito un operador",
  "con un agente",
  "hablar con alguien",
  "operador humano",
  "persona real",
  "hablar con una persona",
  "agente humano",
  "un humano",
  "want to speak",
  "speak to agent",
  "human agent",
  "real person",
  "talk to someone"
];

const escalateToHuman = async (
  ticket: Ticket,
  whatsappId: number,
  contactNumber: string,
  reason: string
): Promise<void> => {
  logger.info(`Escalating ticket ${ticket.id} to human operator. Reason: ${reason}`);

  let escalationMsg = "Voy a transferirte con un agente. Por favor espera.";
  try {
    escalationMsg = await CheckSettings("aiEscalationMessage");
  } catch {
    // use default
  }

  await ticket.update({ aiActive: false });

  const io = getIO();
  io.to("notification").to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  try {
    await whatsappProvider.sendMessage(
      whatsappId,
      `${contactNumber}@c.us`,
      escalationMsg
    );
  } catch (err) {
    logger.error(err, "Error sending escalation message");
  }
};

const handleAISupport = async (
  ticket: Ticket,
  messageBody: string,
  whatsappId: number,
  contactNumber: string
): Promise<void> => {
  const lowerBody = messageBody.toLowerCase();
  const userWantsHuman = HUMAN_REQUEST_KEYWORDS.some(kw =>
    lowerBody.includes(kw)
  );

  if (userWantsHuman) {
    await escalateToHuman(ticket, whatsappId, contactNumber, "user_request");
    return;
  }

  let maxAttempts = 10;
  try {
    maxAttempts = parseInt(await CheckSettings("aiMaxAttempts"), 10) || 10;
  } catch {
    // use default
  }

  if (ticket.aiAttempts >= maxAttempts) {
    await escalateToHuman(ticket, whatsappId, contactNumber, "max_attempts");
    return;
  }

  let systemPrompt = "Eres un asistente de soporte técnico.";
  try {
    systemPrompt = await CheckSettings("aiSystemPrompt");
  } catch {
    // use default
  }

  const { response, shouldEscalate } = await getAIResponse(
    ticket.id,
    systemPrompt
  );

  if (shouldEscalate) {
    if (response) {
      try {
        await whatsappProvider.sendMessage(
          whatsappId,
          `${contactNumber}@c.us`,
          response
        );
      } catch (err) {
        logger.error(err, "Error sending AI escalation message");
      }
    }
    await escalateToHuman(ticket, whatsappId, contactNumber, "ai_decision");
    return;
  }

  if (response) {
    await whatsappProvider.sendMessage(
      whatsappId,
      `${contactNumber}@c.us`,
      response
    );
  }

  await ticket.update({ aiAttempts: ticket.aiAttempts + 1 });
};

export const handleMessage = async (
  messagePayload: MessagePayload,
  contactPayload: ContactPayload,
  contextPayload: WhatsappContextPayload,
  mediaPayload?: MediaPayload
): Promise<void> => {
  try {
    const contact = await CreateOrUpdateContactService({
      name: contactPayload.name,
      number: contactPayload.number,
      lid: contactPayload.lid,
      profilePicUrl: contactPayload.profilePicUrl,
      isGroup: contactPayload.isGroup
    });

    let groupContact: Contact | undefined;
    if (contextPayload.groupContact) {
      groupContact = await CreateOrUpdateContactService({
        name: contextPayload.groupContact.name,
        number: contextPayload.groupContact.number,
        lid: contextPayload.groupContact.lid,
        profilePicUrl: contextPayload.groupContact.profilePicUrl,
        isGroup: contextPayload.groupContact.isGroup
      });
    }

    const whatsapp = await ShowWhatsAppService(contextPayload.whatsappId);
    if (
      contextPayload.unreadMessages === 0 &&
      whatsapp.farewellMessage &&
      formatBody(whatsapp.farewellMessage, contact) === messagePayload.body
    ) {
      return;
    }

    const ticket = await FindOrCreateTicketService(
      contact,
      contextPayload.whatsappId,
      contextPayload.unreadMessages,
      groupContact
    );

    const messageData: MessageData = {
      id: messagePayload.id,
      ticketId: ticket.id,
      contactId: messagePayload.fromMe ? undefined : contact.id,
      body: messagePayload.body,
      fromMe: messagePayload.fromMe,
      read: messagePayload.fromMe,
      mediaType: messagePayload.type,
      quotedMsgId: messagePayload.quotedMsgId,
      ack: messagePayload.ack !== undefined ? messagePayload.ack : 0
    };

    if (mediaPayload && messagePayload.hasMedia) {
      const filename = await saveMediaFile(mediaPayload);
      messageData.mediaUrl = filename;
      messageData.body = messagePayload.body || filename;
      const [mediaType] = mediaPayload.mimetype.split("/");
      messageData.mediaType = mediaType;
    }

    let lastMessageText = "";
    if (messagePayload.type === "location") {
      lastMessageText = messagePayload.body.includes("Localization")
        ? messagePayload.body
        : "Localization";
    } else {
      lastMessageText = messagePayload.body || mediaPayload?.filename || "";
    }

    await ticket.update({ lastMessage: lastMessageText });

    await CreateMessageService({ messageData });

    await processVcardMessage(messagePayload);

    if (
      !ticket.queue &&
      !contextPayload.groupContact &&
      !messagePayload.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1
    ) {
      await handleQueueLogic(
        contextPayload.whatsappId,
        messagePayload.body,
        ticket,
        contactPayload
      );
    }

    if (!messagePayload.fromMe && !contextPayload.groupContact) {
      try {
        const aiEnabled = await CheckSettings("aiEnabled").catch(() => "disabled");
        if (aiEnabled === "enabled" && ticket.aiActive) {
          await handleAISupport(
            ticket,
            messagePayload.body,
            contextPayload.whatsappId,
            contactPayload.number
          );
        }
      } catch (err) {
        logger.error(err, "Error in AI support handling");
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error({
      info: "Error handling message",
      err,
      messagePayload,
      contactPayload,
      contextPayload,
      mediaPayload
    });
  }
};

const findMessageWithRetry = async (
  messageId: string
): Promise<Message | null> => {
  const include = [
    "contact",
    { model: Message, as: "quotedMsg", include: ["contact"] }
  ];

  const message = await Message.findByPk(messageId, { include });
  if (message) return message;

  await new Promise(r => setTimeout(r, 500));
  return Message.findByPk(messageId, { include });
};

export const handleMessageAck = async (
  messageId: string,
  ack: MessageAck
): Promise<void> => {
  const io = getIO();

  try {
    const messageToUpdate = await findMessageWithRetry(messageId);

    if (!messageToUpdate) return;

    await messageToUpdate.update({ ack });

    io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
      action: "update",
      message: messageToUpdate
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack: ${err}`);
  }
};
