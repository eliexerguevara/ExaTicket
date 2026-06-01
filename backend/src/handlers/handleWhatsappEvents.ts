import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import { randomBytes } from "crypto";
import * as Sentry from "@sentry/node";

import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import { debounce } from "../helpers/Debounce";
import formatBody from "../helpers/Mustache";

import { Op } from "sequelize";
import Contact from "../models/Contact";
import Label from "../models/Label";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import TicketLabel from "../models/TicketLabel";
import Message from "../models/Message";

import CreateMessageService, {
  MessageData
} from "../services/MessageServices/CreateMessageService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import CreateContactService from "../services/ContactServices/CreateContactService";
import { getAIResponse, getTicketSummary } from "../services/AIServices/GetAIResponse";
import CheckSettings from "../helpers/CheckSettings";

/** Lazy-load Splynx so the backend doesn't crash if the module isn't compiled yet.
 *  isFirstMessage=true adds the "Encontré tu servicio" greeting instruction. */
const getSplynxInfo = async (
  phone: string,
  isFirstMessage = false
): Promise<{ context: string; hasOutage: boolean; customerId: number | null }> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildSplynxContext } = require("../services/SplynxService/SplynxService");
    return await buildSplynxContext(phone, isFirstMessage);
  } catch {
    return { context: "", hasOutage: false, customerId: null };
  }
};

/** Search Splynx for a customer using free-form input (phone number or name). */
const verifySplynxCustomer = async (
  input: string
): Promise<{ customerId: number | null; name: string | null }> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { findCustomerByInput } = require("../services/SplynxService/SplynxService");
    const customer = await findCustomerByInput(input);
    if (customer) return { customerId: customer.id, name: customer.name };
  } catch { /* ignore */ }
  return { customerId: null, name: null };
};

/**
 * Create a Splynx ticket recording the resolved WhatsApp conversation.
 * Called automatically when AI or keyword detection marks a case as resolved.
 */
const createSplynxResolutionTicket = async (
  customerId: number,
  ticketId: number
): Promise<void> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSplynxTicket } = require("../services/SplynxService/SplynxService");
    const summary = await getTicketSummary(ticketId);
    const dateStr = new Date().toLocaleDateString("es", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    const subject = `Soporte WhatsApp ${dateStr}`;
    const body = summary
      ? `Caso resuelto vía soporte WhatsApp.\n\nResumen:\n${summary}`
      : "Caso resuelto vía soporte WhatsApp.";
    const result = await createSplynxTicket(customerId, subject, body, "low", "closed");
    if (result?.id) {
      logger.info(
        `Splynx resolution ticket created (id=${result.id}) for customer ${customerId} (exaticket ${ticketId})`
      );
    } else {
      logger.warn(
        `Splynx: createSplynxResolutionTicket returned null for customer ${customerId} (exaticket ${ticketId})`
      );
    }
  } catch (err) {
    logger.error(err, `Error creating Splynx resolution ticket for ticket ${ticketId}`);
  }
};

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

// ─── Routing constants ────────────────────────────────────────────────────────

const AI_ROUTING_QUESTION =
  "¡Hola! 👋 ¿Con qué departamento deseas comunicarte?\n\n" +
  "*1* - Administración\n" +
  "*2* - Ventas\n" +
  "*3* - Soporte técnico";

const AI_ROUTING_INVALID =
  "Por favor responde *1*, *2* o *3*:\n\n" +
  "*1* - Administración\n" +
  "*2* - Ventas\n" +
  "*3* - Soporte técnico";

/** Normalize accents and lowercase for comparison */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

type RoutingChoice = "administracion" | "ventas" | "soporte" | null;

const parseRoutingChoice = (body: string): RoutingChoice => {
  const t = normalize(body);

  if (t === "1" || t.includes("admin")) return "administracion";
  if (t === "2" || t.includes("venta")) return "ventas";
  if (
    t === "3" ||
    t.includes("soporte") ||
    t.includes("tecnico") ||
    t.includes("ayuda") ||
    t.includes("internet") ||
    t.includes("fibra") ||
    t.includes("antena") ||
    t.includes("wifi") ||
    t.includes("tele") ||
    t.includes("cable") ||
    t.includes("luz") ||
    t.includes("router")
  )
    return "soporte";

  return null;
};

/** Find a queue whose name contains the given keyword (case-insensitive) */
const findQueueByName = async (keyword: string): Promise<Queue | null> =>
  Queue.findOne({ where: { name: { [Op.like]: `%${keyword}%` } } });

/** Apply a label by name to a ticket (creates label if missing, skips if already applied) */
const autoApplyLabel = async (
  ticketId: number,
  labelName: string,
  color = "#ef4444"
): Promise<void> => {
  try {
    const [label] = await Label.findOrCreate({
      where: { name: labelName },
      defaults: { name: labelName, color }
    });
    await TicketLabel.findOrCreate({
      where: { ticketId, labelId: label.id }
    });
    // Emit socket update so frontend refreshes with complete ticket (labels, user, queue, etc.)
    const io = getIO();
    const ticket = await ShowTicketService(ticketId);
    if (ticket) {
      io.to("notification")
        .to(ticket.status)
        .to(ticketId.toString())
        .emit("ticket", { action: "update", ticket });
    }
  } catch (err) {
    logger.error(err, `autoApplyLabel error: ticketId=${ticketId} label=${labelName}`);
  }
};

// ─── Resolution keywords (safety-net for AI [RESUELTO] detection) ─────────────
// Only phrases that unambiguously mean "service is working RIGHT NOW"
const RESOLUTION_KEYWORDS = [
  "ya funciona",
  "ya tengo internet",
  "tengo internet ya",
  "volvió el internet",
  "volvio el internet",
  "ya volvio",
  "ya volvió",
  "se solucionó",
  "se soluciono",
  "ya está funcionando",
  "ya esta funcionando",
  "ya conecté",
  "ya me conecte",
  "ya me conecté",
  "ya hay internet",
  "ya hay señal",
  "ya tengo señal",
  "problema resuelto",
  "listo funciona",
  "solucionado",
  "gracias ya funciona",
  "gracias funciona",
  "ya me funciona"
];

/** Returns true only when the client explicitly confirms service is working NOW */
const clientConfirmsResolution = (body: string): boolean => {
  const lower = normalize(body);
  return RESOLUTION_KEYWORDS.some(kw => lower.includes(normalize(kw)));
};

// ─── Human-request keywords ────────────────────────────────────────────────────

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

  let escalationMsg = "Voy a conectarte con un agente ahora. Un momento por favor.";
  try {
    escalationMsg = await CheckSettings("aiEscalationMessage");
  } catch {
    // use default
  }

  // Assign to Soporte queue so agents can see it — always override queue on escalation
  const supportQueue = await findQueueByName("oporte");
  const updateData: { aiActive: boolean; queueId?: number } = { aiActive: false };
  if (supportQueue) {
    updateData.queueId = supportQueue.id;
  }
  await ticket.update(updateData);

  // Apply "Soporte Tecnico" label so escalated tickets are easily identified
  // autoApplyLabel already emits the full ticket via ShowTicketService — no extra emit needed
  await autoApplyLabel(ticket.id, "Soporte Tecnico", "#ef4444");

  try {
    await whatsappProvider.sendMessage(
      whatsappId,
      `${contactNumber}@c.us`,
      escalationMsg
    );
  } catch (err) {
    logger.error(err, "Error sending escalation message");
  }

  // Generate and save internal AI summary note for the agent
  try {
    const summaryResult = await getTicketSummary(ticket.id);
    if (summaryResult?.summary) {
      const noteId = `internal-${ticket.id}-${Date.now()}`;
      await CreateMessageService({
        messageData: {
          id: noteId,
          ticketId: ticket.id,
          body: `*Resumen IA del caso:*\n${summaryResult.summary}`,
          fromMe: true,
          read: true,
          isInternal: true,
          ack: 2
        }
      });
      logger.debug(`Internal AI note created for ticket ${ticket.id}`);
    }
  } catch (err) {
    logger.error(err, "Error creating internal AI summary note");
  }
};

/**
 * Simulate human typing delay before sending a WhatsApp message.
 * This avoids the instant-bot pattern that WhatsApp flags for suspicious activity.
 * Delay = 1200 ms base + ~28 ms/char (capped at 4 s) + 0–900 ms random jitter.
 */
const typingDelay = (text: string): Promise<void> => {
  const ms = Math.min(4000, 1200 + text.length * 28) + Math.floor(Math.random() * 900);
  return new Promise(r => setTimeout(r, ms));
};

const sendMsg = async (
  whatsappId: number,
  contactNumber: string,
  text: string
): Promise<void> => {
  await typingDelay(text);
  try {
    await whatsappProvider.sendMessage(
      whatsappId,
      `${contactNumber}@c.us`,
      text
    );
  } catch (err) {
    logger.error(err, "Error sending message");
  }
};

const handleAISupport = async (
  ticket: Ticket,
  messageBody: string,
  whatsappId: number,
  contactNumber: string
): Promise<void> => {
  // Always allow user to request a human agent
  const lowerBody = messageBody.toLowerCase();
  const userWantsHuman = HUMAN_REQUEST_KEYWORDS.some(kw =>
    lowerBody.includes(kw)
  );
  if (userWantsHuman) {
    await escalateToHuman(ticket, whatsappId, contactNumber, "user_request");
    return;
  }

  // ── Helper: execute routing once a choice is known ───────────────────────
  const applyRoutingChoice = async (choice: RoutingChoice): Promise<boolean> => {
    if (choice === "administracion" || choice === "ventas") {
      const keyword = choice === "administracion" ? "dmin" : "enta";
      const queue = await findQueueByName(keyword);
      if (queue) {
        await UpdateTicketService({
          ticketData: { queueId: queue.id, aiActive: false },
          ticketId: ticket.id
        });
        await sendMsg(
          whatsappId,
          contactNumber,
          `Un momento, te conectamos con ${queue.name}. 🙏`
        );
      } else {
        await escalateToHuman(ticket, whatsappId, contactNumber, "queue_not_found");
      }
      return true;
    }

    if (choice === "soporte") {
      let splynxEnabled = false;
      try { splynxEnabled = (await CheckSettings("splynxEnabled")) === "enabled"; } catch { /* ignore */ }

      if (splynxEnabled) {
        const check = await getSplynxInfo(contactNumber, false);
        if (check.customerId) {
          await ticket.update({ aiAttempts: 3 });
          await sendMsg(whatsappId, contactNumber, "Con gusto te ayudo. ¿Cuál es el problema técnico?");
        } else {
          await ticket.update({ aiAttempts: 2 });
          await sendMsg(
            whatsappId,
            contactNumber,
            "Para brindarte soporte, primero necesito verificar que eres cliente. 🔍\n\n" +
            "No encontré tu número en nuestro sistema. Por favor indícame tu *nombre completo* " +
            "o el *número de teléfono* con el que tienes el servicio."
          );
        }
      } else {
        await ticket.update({ aiAttempts: 3 });
        await sendMsg(whatsappId, contactNumber, "Con gusto te ayudo. ¿Cuál es el problema técnico?");
      }
      return true;
    }

    return false; // choice is null — not detected
  };

  // ── PHASE 1: First contact — try to auto-detect department from message ───
  if (ticket.aiAttempts === 0) {
    await ticket.update({ aiAttempts: 1 });

    const autoChoice = parseRoutingChoice(messageBody);
    if (autoChoice !== null) {
      // Detected from first message — route automatically without showing menu
      logger.info(`Ticket ${ticket.id}: auto-routed to "${autoChoice}" from first message`);
      await applyRoutingChoice(autoChoice);
    } else {
      // Cannot detect — ask user to pick
      await sendMsg(whatsappId, contactNumber, AI_ROUTING_QUESTION);
    }
    return;
  }

  // ── PHASE 2: Process department selection (user replied to menu) ──────────
  if (ticket.aiAttempts === 1) {
    const choice = parseRoutingChoice(messageBody);
    const routed = await applyRoutingChoice(choice);
    if (!routed) {
      // Unrecognized response — ask again (don't increment aiAttempts)
      await sendMsg(whatsappId, contactNumber, AI_ROUTING_INVALID);
    }
    return;
  }

  // ── PHASE 2.5: Customer identity verification ─────────────────────────────
  // Reached only when Splynx is enabled and the customer was NOT found by phone.
  // The client's message contains the name or phone number they provided.
  if (ticket.aiAttempts === 2) {
    const { customerId: foundId, name: foundName } = await verifySplynxCustomer(messageBody);

    if (foundId) {
      // Persist the verified Splynx customer ID so Phase 3 can create the resolution ticket
      await ticket.update({ aiAttempts: 3, splynxCustomerId: foundId });
      await sendMsg(
        whatsappId,
        contactNumber,
        `¡Te encontré en el sistema${foundName ? `, *${foundName}*` : ""}! ✅ Con gusto te ayudamos. ¿Cuál es el problema técnico?`
      );
    } else {
      await sendMsg(
        whatsappId,
        contactNumber,
        "Lo siento, no encontré esa información en nuestro sistema. 😕\n\n" +
        "Si crees que hay un error o aún no eres cliente, comunícate con nosotros directamente. ¡Gracias!"
      );
      await UpdateTicketService({ ticketData: { aiActive: false, status: "closed" }, ticketId: ticket.id });
    }
    return;
  }

  // ── PHASE 3: AI-driven support (aiAttempts >= 3, customer verified) ────────
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

  let systemPrompt = `Eres un asistente de soporte técnico de una empresa de telecomunicaciones/internet.

REGLA MÁS IMPORTANTE — ADAPTA TU LENGUAJE AL CLIENTE:
- Si el cliente usa términos técnicos (IP, DNS, router, firmware, ping, latencia, puerto, modem, ONT, fibra óptica, etc.), respóndele de forma técnica y directa.
- Si el cliente NO usa términos técnicos o parece no entender (dice cosas como "no funciona el wifi", "el aparato parpadeando", "no tengo internet", "se fue la señal"), usa lenguaje MUY sencillo, sin jerga, con instrucciones tipo paso a paso como si hablaras con alguien que nunca ha tocado un router. Ejemplo: "Busca el aparato negro o blanco que tiene lucecitas, desenchúfalo de la corriente, espera 30 segundos y vuelve a enchufarlo."

Reglas adicionales:
- Sé amable y paciente siempre.
- Respuestas cortas y claras. Máximo 3-4 pasos a la vez.
- Si el problema no se resuelve en 2-3 intentos, escala al humano.
- Nunca des información que no sea de soporte técnico.`;
  try {
    systemPrompt = await CheckSettings("aiSystemPrompt");
  } catch {
    // use default
  }

  // Fetch Splynx customer context and metadata (non-blocking).
  // isFirstMessage=true on the first verified support interaction (aiAttempts===3).
  const isFirstSupportMsg = ticket.aiAttempts === 3; // was 2 before verification phase
  const splynxInfo = await getSplynxInfo(contactNumber, isFirstSupportMsg);
  // If phone lookup didn't find the customer but we verified by name in Phase 2.5,
  // use the persisted splynxCustomerId so the resolution ticket is still created.
  if (!splynxInfo.customerId && ticket.splynxCustomerId) {
    splynxInfo.customerId = ticket.splynxCustomerId;
  }

  // Auto-apply "Falla General" label ONLY when Splynx explicitly confirmed an active outage.
  // Using the structured flag instead of a regex avoids false positives from ticket history.
  if (splynxInfo.hasOutage) {
    await autoApplyLabel(ticket.id, "Falla General", "#ef4444");
  }

  // ── Safety net: keyword-based resolution detection ─────────────────────────
  // If the client's message clearly indicates service is working NOW, resolve
  // immediately without waiting for the AI to emit [RESUELTO].
  if (clientConfirmsResolution(messageBody)) {
    const closingMsg =
      "¡Me alegra que tu servicio esté funcionando! 😊 " +
      "Tu caso ha quedado registrado. ¡Que tengas un excelente día!";
    await sendMsg(whatsappId, contactNumber, closingMsg);

    // Create Splynx ticket recording the resolved conversation
    if (splynxInfo.customerId) {
      await createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
    }

    try {
      await UpdateTicketService({
        ticketData: { status: "closed" },
        ticketId: ticket.id
      });
      logger.info(
        `Ticket ${ticket.id} auto-resolved by keyword detection (client confirmed service OK)`
      );
    } catch (err) {
      logger.error(err, `Error auto-resolving ticket ${ticket.id}`);
    }
    return;
  }

  // ── AI-driven response ─────────────────────────────────────────────────────
  const { response, shouldEscalate, shouldResolve } = await getAIResponse(
    ticket.id,
    systemPrompt,
    splynxInfo.context || undefined
  );

  if (shouldEscalate) {
    if (response) {
      await sendMsg(whatsappId, contactNumber, response);
    }
    await escalateToHuman(ticket, whatsappId, contactNumber, "ai_decision");
    return;
  }

  if (shouldResolve) {
    if (response) {
      await sendMsg(whatsappId, contactNumber, response);
    }

    // Create Splynx ticket recording the resolved conversation
    if (splynxInfo.customerId) {
      await createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
    }

    // Close ExaTicket
    try {
      await UpdateTicketService({
        ticketData: { status: "closed" },
        ticketId: ticket.id
      });
      logger.info(
        `Ticket ${ticket.id} auto-resolved by AI [RESUELTO] marker`
      );
    } catch (err) {
      logger.error(err, `Error auto-resolving ticket ${ticket.id}`);
    }
    return;
  }

  if (response) {
    await sendMsg(whatsappId, contactNumber, response);
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

    // Resolve AI state once, reused for both queue-logic and AI-support checks
    // Groups never get AI responses — double-guard beyond contextPayload.groupContact check
    const aiEnabled = await CheckSettings("aiEnabled").catch(() => "disabled");
    const aiIsActive = aiEnabled === "enabled" && ticket.aiActive && !ticket.isGroup;

    // Skip legacy queue-selection logic when AI is handling routing
    if (
      !ticket.queue &&
      !contextPayload.groupContact &&
      !messagePayload.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1 &&
      !aiIsActive
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
        if (aiIsActive) {
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
