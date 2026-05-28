/**
 * TelegramBotService.ts
 *
 * Manages Telegram bot instances (polling) and processes incoming messages
 * through the same AI pipeline used for WhatsApp.
 *
 * Each bot entry in the `Telegrams` DB table corresponds to one bot token.
 * Bots use long-polling (no webhook needed).
 *
 * Message flow:
 *   Telegram update → handleTelegramMessage()
 *     → CreateOrUpdateContact  (number = chatId string)
 *     → FindOrCreateTelegramTicketService
 *     → CreateMessageService
 *     → handleAIForTelegram  (same phases as WhatsApp, sendFn = bot.sendMessage)
 */

import TelegramBot from "node-telegram-bot-api";
import { Op } from "sequelize";
import { subHours } from "date-fns";
import { randomBytes } from "crypto";

import Telegram from "../../models/Telegram";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Label from "../../models/Label";
import Queue from "../../models/Queue";
import TicketLabel from "../../models/TicketLabel";

import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { getAIResponse, getTicketSummary } from "../AIServices/GetAIResponse";
import CheckSettings from "../../helpers/CheckSettings";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

// ─── Bot instance registry ────────────────────────────────────────────────────

const _bots = new Map<number, TelegramBot>();

export const getBotInstance = (telegramId: number): TelegramBot | undefined =>
  _bots.get(telegramId);

// ─── Routing constants (same as WhatsApp) ────────────────────────────────────

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

const HUMAN_REQUEST_KEYWORDS = [
  "quiero hablar con", "necesito un operador", "con un agente",
  "hablar con alguien", "operador humano", "persona real",
  "hablar con una persona", "agente humano", "un humano"
];

const RESOLUTION_KEYWORDS = [
  "ya funciona", "ya tengo internet", "tengo internet ya",
  "volvió el internet", "volvio el internet", "ya volvio", "ya volvió",
  "se solucionó", "se soluciono", "ya está funcionando", "ya esta funcionando",
  "ya conecté", "ya me conecte", "ya me conecté", "ya hay internet",
  "ya hay señal", "ya tengo señal", "problema resuelto", "listo funciona",
  "solucionado", "gracias ya funciona", "gracias funciona", "ya me funciona"
];

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

type RoutingChoice = "administracion" | "ventas" | "soporte" | null;

const parseRoutingChoice = (body: string): RoutingChoice => {
  const t = normalize(body);
  if (t === "1" || t.includes("admin")) return "administracion";
  if (t === "2" || t.includes("venta")) return "ventas";
  if (t === "3" || t.includes("soporte") || t.includes("tecnico") ||
      t.includes("ayuda") || t.includes("internet") || t.includes("fibra") ||
      t.includes("wifi") || t.includes("router") || t.includes("antena"))
    return "soporte";
  return null;
};

const clientConfirmsResolution = (body: string): boolean => {
  const lower = normalize(body);
  return RESOLUTION_KEYWORDS.some(kw => lower.includes(normalize(kw)));
};

const findQueueByName = async (keyword: string): Promise<Queue | null> =>
  Queue.findOne({ where: { name: { [Op.like]: `%${keyword}%` } } });

// ─── Typing simulation for Telegram ──────────────────────────────────────────

const sendWithTyping = async (
  bot: TelegramBot,
  chatId: string,
  text: string,
  ticketId?: number
): Promise<void> => {
  // Show "typing..." indicator in Telegram (real feature, not just delay)
  try {
    await bot.sendChatAction(chatId, "typing");
  } catch {
    // ignore if fails
  }

  // Delay that scales with message length — same formula as WhatsApp
  const ms = Math.min(4000, 1200 + text.length * 28) + Math.floor(Math.random() * 900);
  await new Promise(r => setTimeout(r, ms));

  let sentMsgId: number | undefined;
  try {
    const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    sentMsgId = sentMsg?.message_id;
  } catch {
    // fallback without markdown
    const sentMsg = await bot.sendMessage(chatId, text);
    sentMsgId = sentMsg?.message_id;
  }

  // Save outgoing message to DB so agents can see it in the ticket view
  if (ticketId) {
    const msgId = `tg-out-${chatId}-${sentMsgId ?? Date.now()}`;
    try {
      await CreateMessageService({
        messageData: {
          id: msgId,
          ticketId,
          body: text,
          fromMe: true,
          read: true,
          ack: 2
        }
      });
    } catch (err) {
      logger.error(err, `Telegram: failed to save outgoing message for ticket ${ticketId}`);
    }
  }
};

// ─── Splynx context (lazy-loaded to avoid crash if not compiled) ──────────────

const getSplynxInfo = async (
  phone: string,
  isFirstMessage = false
): Promise<{ context: string; hasOutage: boolean; customerId: number | null }> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildSplynxContext } = require("../SplynxService/SplynxService");
    return await buildSplynxContext(phone, isFirstMessage);
  } catch {
    return { context: "", hasOutage: false, customerId: null };
  }
};

/** Search Splynx for a customer using free-form input (phone or name). */
const verifySplynxCustomer = async (
  input: string
): Promise<{ customerId: number | null; name: string | null }> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { findCustomerByInput } = require("../SplynxService/SplynxService");
    const customer = await findCustomerByInput(input);
    if (customer) return { customerId: customer.id, name: customer.name };
  } catch { /* ignore */ }
  return { customerId: null, name: null };
};

const createSplynxResolutionTicket = async (
  customerId: number,
  ticketId: number
): Promise<void> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createSplynxTicket } = require("../SplynxService/SplynxService");
    const summary = await getTicketSummary(ticketId);
    const dateStr = new Date().toLocaleDateString("es", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    await createSplynxTicket(
      customerId,
      `Soporte Telegram ${dateStr}`,
      summary ? `Caso resuelto vía Telegram.\n\nResumen:\n${summary}` : "Caso resuelto vía Telegram.",
      "low",
      "solved"
    );
  } catch (err) {
    logger.error(err, `Error creating Splynx resolution ticket for Telegram ticket ${ticketId}`);
  }
};

// ─── Auto-apply label ─────────────────────────────────────────────────────────

const autoApplyLabel = async (ticketId: number, labelName: string, color = "#ef4444") => {
  try {
    const [label] = await Label.findOrCreate({
      where: { name: labelName },
      defaults: { name: labelName, color }
    });
    await TicketLabel.findOrCreate({ where: { ticketId, labelId: label.id } });
    const io = getIO();
    const ticket = await Ticket.findByPk(ticketId, {
      include: [{ model: Label, as: "labels" }]
    });
    if (ticket) {
      io.to("notification").to(ticket.status).to(ticketId.toString())
        .emit("ticket", { action: "update", ticket });
    }
  } catch (err) {
    logger.error(err, `autoApplyLabel Telegram: ticketId=${ticketId} label=${labelName}`);
  }
};

// ─── Find or create Telegram ticket ──────────────────────────────────────────

const findOrCreateTelegramTicket = async (
  contact: Contact,
  telegramId: number,
  unreadMessages: number
): Promise<Ticket> => {
  let ticket = await Ticket.findOne({
    where: {
      status: { [Op.or]: ["open", "pending"] },
      contactId: contact.id,
      telegramId
    }
  });

  if (ticket) {
    await ticket.update({ unreadMessages, isGroup: false });
  }

  if (!ticket) {
    ticket = await Ticket.findOne({
      where: {
        updatedAt: { [Op.between]: [+subHours(new Date(), 2), +new Date()] },
        contactId: contact.id,
        telegramId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      await ticket.update({
        status: "pending",
        isGroup: false,
        userId: null,
        unreadMessages,
        aiActive: true,
        aiAttempts: 0
      });
    }
  }

  if (!ticket) {
    ticket = await Ticket.create({
      contactId: contact.id,
      status: "pending",
      isGroup: false,
      aiActive: true,
      unreadMessages,
      telegramId
    });
  }

  return ShowTicketService(ticket.id);
};

// ─── Escalate to human ────────────────────────────────────────────────────────

const escalateToHuman = async (
  bot: TelegramBot,
  ticket: Ticket,
  chatId: string,
  reason: string
): Promise<void> => {
  logger.info(`Telegram: escalating ticket ${ticket.id} to human. Reason: ${reason}`);

  let msg = "Voy a conectarte con un agente ahora. Un momento por favor.";
  try { msg = await CheckSettings("aiEscalationMessage"); } catch { /* default */ }

  const supportQueue = await findQueueByName("oporte");
  const updateData: { aiActive: boolean; queueId?: number } = { aiActive: false };
  if (supportQueue && !ticket.queueId) updateData.queueId = supportQueue.id;
  await ticket.update(updateData);

  const io = getIO();
  io.to("notification").to(ticket.status).emit("ticket", { action: "update", ticket });

  await sendWithTyping(bot, chatId, msg, ticket.id);

  // Internal AI summary for agents
  try {
    const summary = await getTicketSummary(ticket.id);
    if (summary) {
      await CreateMessageService({
        messageData: {
          id: `tg-internal-${ticket.id}-${Date.now()}`,
          ticketId: ticket.id,
          body: `*Resumen IA del caso (Telegram):*\n${summary}`,
          fromMe: true, read: true, isInternal: true, ack: 2
        }
      });
    }
  } catch (err) {
    logger.error(err, "Telegram: error creating internal summary");
  }
};

// ─── AI support handler ───────────────────────────────────────────────────────

const handleAIForTelegram = async (
  bot: TelegramBot,
  ticket: Ticket,
  messageBody: string,
  chatId: string,
  contactNumber: string
): Promise<void> => {
  const lowerBody = messageBody.toLowerCase();

  // Always allow human escalation request
  if (HUMAN_REQUEST_KEYWORDS.some(kw => lowerBody.includes(kw))) {
    await escalateToHuman(bot, ticket, chatId, "user_request");
    return;
  }

  // ── Phase 1: Routing question ─────────────────────────────────────────────
  if (ticket.aiAttempts === 0) {
    await sendWithTyping(bot, chatId, AI_ROUTING_QUESTION, ticket.id);
    await ticket.update({ aiAttempts: 1 });
    return;
  }

  // ── Phase 2: Department selection ────────────────────────────────────────
  if (ticket.aiAttempts === 1) {
    const choice = parseRoutingChoice(messageBody);

    if (choice === "administracion" || choice === "ventas") {
      const keyword = choice === "administracion" ? "dmin" : "enta";
      const queue = await findQueueByName(keyword);
      if (queue) {
        await UpdateTicketService({
          ticketData: { queueId: queue.id, aiActive: false },
          ticketId: ticket.id
        });
        await sendWithTyping(bot, chatId, `Un momento, te conectamos con ${queue.name}. 🙏`, ticket.id);
      } else {
        await escalateToHuman(bot, ticket, chatId, "queue_not_found");
      }
      return;
    }

    if (choice === "soporte") {
      // ── Verify customer in Splynx before opening support ──────────────────
      let splynxEnabled = false;
      try { splynxEnabled = (await CheckSettings("splynxEnabled")) === "enabled"; } catch { /* ignore */ }

      if (splynxEnabled) {
        // contactNumber for Telegram = Telegram user ID (not a real phone),
        // so direct phone lookup almost always returns null → ask to identify
        const check = await getSplynxInfo(contactNumber, false);

        if (check.customerId) {
          // Found by phone — skip verification and go straight to support
          await ticket.update({ aiAttempts: 3 });
          await sendWithTyping(bot, chatId, "Con gusto te ayudo. ¿Cuál es el problema técnico?", ticket.id);
        } else {
          // Not found — enter verification phase
          await ticket.update({ aiAttempts: 2 });
          await sendWithTyping(
            bot, chatId,
            "Para brindarte soporte, primero necesito verificar que eres cliente. 🔍\n\n" +
            "No encontré tu número en nuestro sistema. Por favor indícame tu *nombre completo* " +
            "o el *número de teléfono* con el que tienes el servicio.",
            ticket.id
          );
        }
      } else {
        // Splynx not enabled — skip verification, go to support directly
        await ticket.update({ aiAttempts: 3 });
        await sendWithTyping(bot, chatId, "Con gusto te ayudo. ¿Cuál es el problema técnico?", ticket.id);
      }
      return;
    }

    await sendWithTyping(bot, chatId, AI_ROUTING_INVALID, ticket.id);
    return;
  }

  // ── Phase 2.5: Customer identity verification ─────────────────────────────
  // Reached only when Splynx is enabled and the customer was NOT found by phone.
  // The user's message contains the name or phone number they provided.
  if (ticket.aiAttempts === 2) {
    const { customerId: foundId, name: foundName } = await verifySplynxCustomer(messageBody);

    if (foundId) {
      await ticket.update({ aiAttempts: 3 });
      await sendWithTyping(
        bot, chatId,
        `¡Te encontré en el sistema${foundName ? `, *${foundName}*` : ""}! ✅ Con gusto te ayudamos. ¿Cuál es el problema técnico?`,
        ticket.id
      );
    } else {
      await sendWithTyping(
        bot, chatId,
        "Lo siento, no encontré esa información en nuestro sistema. 😕\n\n" +
        "Si crees que hay un error o aún no eres cliente, comunícate con nosotros directamente. ¡Gracias!",
        ticket.id
      );
      await ticket.update({ aiActive: false });
      await UpdateTicketService({ ticketData: { status: "closed" }, ticketId: ticket.id });
    }
    return;
  }

  // ── Phase 3: AI-driven support (aiAttempts >= 3, customer verified) ────────
  let maxAttempts = 10;
  try {
    maxAttempts = parseInt(await CheckSettings("aiMaxAttempts"), 10) || 10;
  } catch { /* default */ }

  if (ticket.aiAttempts >= maxAttempts) {
    await escalateToHuman(bot, ticket, chatId, "max_attempts");
    return;
  }

  let systemPrompt = `Eres un asistente de soporte técnico de una empresa de telecomunicaciones/internet.
Adapta tu lenguaje al nivel del cliente. Si usa términos técnicos, responde técnicamente.
Si no los usa, explica paso a paso de forma sencilla.
Respuestas cortas y claras. Máximo 3-4 pasos a la vez. Sé amable y paciente.
El cliente está escribiendo por Telegram.`;
  try { systemPrompt = await CheckSettings("aiSystemPrompt"); } catch { /* default */ }

  const isFirstSupportMsg = ticket.aiAttempts === 3; // 3 = first verified support msg
  const splynxInfo = await getSplynxInfo(contactNumber, isFirstSupportMsg);

  if (splynxInfo.hasOutage) {
    await autoApplyLabel(ticket.id, "Falla General", "#ef4444");
  }

  if (clientConfirmsResolution(messageBody)) {
    const closingMsg =
      "¡Me alegra que tu servicio esté funcionando! 😊 " +
      "Tu caso ha quedado registrado. ¡Que tengas un excelente día!";
    await sendWithTyping(bot, chatId, closingMsg, ticket.id);
    if (splynxInfo.customerId) {
      await createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
    }
    await UpdateTicketService({ ticketData: { status: "closed" }, ticketId: ticket.id });
    return;
  }

  const { response, shouldEscalate, shouldResolve } = await getAIResponse(
    ticket.id,
    systemPrompt,
    splynxInfo.context || undefined
  );

  if (shouldEscalate) {
    if (response) await sendWithTyping(bot, chatId, response, ticket.id);
    await escalateToHuman(bot, ticket, chatId, "ai_decision");
    return;
  }

  if (shouldResolve) {
    if (response) await sendWithTyping(bot, chatId, response, ticket.id);
    if (splynxInfo.customerId) {
      await createSplynxResolutionTicket(splynxInfo.customerId, ticket.id);
    }
    await UpdateTicketService({ ticketData: { status: "closed" }, ticketId: ticket.id });
    return;
  }

  if (response) await sendWithTyping(bot, chatId, response, ticket.id);
  await ticket.update({ aiAttempts: ticket.aiAttempts + 1 });
};

// ─── Core message handler ─────────────────────────────────────────────────────

const handleTelegramMessage = async (
  bot: TelegramBot,
  telegramRecord: Telegram,
  msg: TelegramBot.Message
): Promise<void> => {
  if (!msg.text || msg.from?.is_bot) return;

  const chatId = String(msg.chat.id);
  const fromId = String(msg.from?.id || msg.chat.id);
  const firstName = msg.from?.first_name || "";
  const lastName = msg.from?.last_name || "";
  const username = msg.from?.username || "";
  const contactName = [firstName, lastName].filter(Boolean).join(" ") ||
    username || `Telegram ${chatId}`;

  try {
    const contact = await CreateOrUpdateContactService({
      name: contactName,
      number: fromId,
      isGroup: false
    });

    const ticket = await findOrCreateTelegramTicket(contact, telegramRecord.id, 1);

    // Save incoming message
    const msgId = `tg-${fromId}-${msg.message_id}`;
    await CreateMessageService({
      messageData: {
        id: msgId,
        ticketId: ticket.id,
        contactId: contact.id,
        body: msg.text,
        fromMe: false,
        read: true,
        ack: 2
      }
    });

    // Emit to frontend so agents see the message in real-time
    const io = getIO();
    io.to("notification").to(ticket.status).to(String(ticket.id))
      .emit("ticket", { action: "update", ticket });

    // Run AI pipeline if active
    if (ticket.aiActive && !ticket.userId) {
      await handleAIForTelegram(bot, ticket, msg.text, chatId, fromId);
    }

  } catch (err) {
    logger.error(err, `Telegram: error handling message from chat ${chatId}`);
  }
};

// ─── Bot lifecycle ────────────────────────────────────────────────────────────

export const startTelegramBot = async (telegramRecord: Telegram): Promise<void> => {
  const { id, botToken, name } = telegramRecord;

  if (_bots.has(id)) {
    logger.info(`Telegram: bot "${name}" (id=${id}) is already running`);
    return;
  }

  try {
    const bot = new TelegramBot(botToken, { polling: true });

    bot.on("message", async (msg) => {
      await handleTelegramMessage(bot, telegramRecord, msg);
    });

    bot.on("polling_error", (err) => {
      logger.error(err, `Telegram: polling error for bot "${name}" (id=${id})`);
    });

    _bots.set(id, bot);
    await telegramRecord.update({ status: "connected" });
    logger.info(`Telegram: bot "${name}" (id=${id}) started polling`);

  } catch (err) {
    await telegramRecord.update({ status: "error" });
    logger.error(err, `Telegram: failed to start bot "${name}" (id=${id})`);
    throw err;
  }
};

export const stopTelegramBot = async (telegramId: number): Promise<void> => {
  const bot = _bots.get(telegramId);
  if (!bot) return;
  await bot.stopPolling();
  _bots.delete(telegramId);
  await Telegram.update({ status: "disconnected" }, { where: { id: telegramId } });
  logger.info(`Telegram: bot id=${telegramId} stopped`);
};

export const startAllTelegramBots = async (): Promise<void> => {
  try {
    const telegrams = await Telegram.findAll();
    for (const t of telegrams) {
      startTelegramBot(t).catch(err =>
        logger.error(err, `Telegram: failed to start bot id=${t.id}`)
      );
    }
    logger.info(`Telegram: started ${telegrams.length} bot(s)`);
  } catch (err) {
    logger.error(err, "Telegram: startAllTelegramBots error");
  }
};

// ─── Send a reply to Telegram from an agent (used by MessageController) ───────

export const sendTelegramMessage = async (
  telegramId: number,
  chatId: string,
  text: string
): Promise<void> => {
  const bot = _bots.get(telegramId);
  if (!bot) throw new Error(`Telegram bot id=${telegramId} not running`);
  await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
};
