import Anthropic from "@anthropic-ai/sdk";
import Message from "../../models/Message";
import { logger } from "../../utils/logger";

export interface AIResponse {
  response: string;
  shouldEscalate: boolean;
}

const ESCALATION_MARKER = "[ESCALAR]";

const buildConversation = (
  messages: Message[]
): Array<{ role: "user" | "assistant"; content: string }> => {
  const filtered = messages.filter(
    m => m.body && !m.body.startsWith("data:") && !m.isDeleted && !m.isInternal
  );

  const pairs: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of filtered) {
    const role = msg.fromMe ? "assistant" : "user";
    const last = pairs[pairs.length - 1];

    if (last && last.role === role) {
      last.content += `\n${msg.body}`;
    } else {
      pairs.push({ role, content: msg.body });
    }
  }

  // Anthropic requires conversation starting with a user message
  const firstUserIdx = pairs.findIndex(m => m.role === "user");
  return firstUserIdx >= 0 ? pairs.slice(firstUserIdx) : [];
};

export const getAIResponse = async (
  ticketId: number,
  systemPrompt: string
): Promise<AIResponse> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "ASC"]],
    limit: 40
  });

  const conversation = buildConversation(messages);

  if (conversation.length === 0) {
    return { response: "", shouldEscalate: false };
  }

  const fullSystem = `${systemPrompt}

INSTRUCCIÓN CRÍTICA: Cuando no puedas resolver el problema o el caso requiera un técnico, escribe exactamente "${ESCALATION_MARKER}" al inicio de tu respuesta seguido de un mensaje breve.

Responde siempre en español, de forma corta y directa.`;

  try {
    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: [
        {
          type: "text",
          text: fullSystem,
          // @ts-ignore — cache_control is supported but may not be in older type defs
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: conversation
    });

    const text =
      result.content[0].type === "text" ? result.content[0].text : "";

    const shouldEscalate = text.trimStart().startsWith(ESCALATION_MARKER);
    const response = shouldEscalate
      ? text.replace(ESCALATION_MARKER, "").trimStart()
      : text;

    logger.debug(
      `AI response for ticket ${ticketId}: shouldEscalate=${shouldEscalate}, tokens_used=${result.usage?.output_tokens}`
    );

    return { response, shouldEscalate };
  } catch (err) {
    logger.error(err, "Error calling Claude AI API");
    throw err;
  }
};

// ─── Agent advice: answers a specific question from an agent about a ticket ──

export const getAgentAdvice = async (
  ticketId: number,
  agentQuestion: string
): Promise<{ response: string }> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "ASC"]],
    limit: 20
  });

  const conversation = buildConversation(messages);

  const systemPrompt = `Eres un asistente técnico experto que ayuda a los agentes de soporte a diagnosticar y resolver problemas.
Tienes acceso al historial de la conversación del cliente.
El agente te hace una pregunta específica sobre el caso para obtener orientación técnica.

Pautas de diagnóstico importantes:
- Router desconfigurado: verificar IP asignada, DNS correcto (8.8.8.8/1.1.1.1), reinicio del equipo, restauración a valores de fábrica, actualización de firmware, revisión del canal WiFi y contraseña.
- Sin internet: revisar luces del modem/router, verificar estado del servicio, comprobar cable físico, reiniciar ONT/modem, revisar configuración PPPoE o DHCP.
- Velocidad lenta: verificar interferencias WiFi, saturación de dispositivos, distancia al router, actualizar drivers de red.
- Intermitencia: revisar niveles de señal, calidad del cableado, interferencias externas, temperatura del equipo.

Responde con pasos concretos, numerados y prácticos. Sé directo y técnico.
Responde SIEMPRE en español.`;

  const conversationSummary =
    conversation.length > 0
      ? `\nHistorial del ticket:\n${conversation
          .map(
            m => `[${m.role === "user" ? "Cliente" : "Agente/Bot"}]: ${m.content}`
          )
          .join("\n")}\n`
      : "";

  const userContent = `${conversationSummary}\nPregunta del agente: ${agentQuestion}`;

  try {
    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    });

    const text =
      result.content[0].type === "text" ? result.content[0].text : "";

    logger.debug(`Agent advice for ticket ${ticketId}: tokens_used=${result.usage?.output_tokens}`);

    return { response: text };
  } catch (err) {
    logger.error(err, "Error calling Claude AI API for agent advice");
    throw err;
  }
};

// ─── Ticket summary: brief AI-generated summary for internal note ─────────────

export const getTicketSummary = async (
  ticketId: number
): Promise<string | null> => {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const messages = await Message.findAll({
      where: { ticketId },
      order: [["createdAt", "ASC"]],
      limit: 20
    });

    const conversation = buildConversation(messages);
    if (conversation.length < 2) return null;

    const conversationText = conversation
      .map(m => `[${m.role === "user" ? "Cliente" : "Bot"}]: ${m.content}`)
      .join("\n");

    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system:
        "Resume en 2-3 líneas qué problema reportó el cliente y qué pasos tomó el bot. Sin encabezados. Directo y conciso. En español.",
      messages: [
        {
          role: "user",
          content: `Conversación:\n${conversationText}\n\nResume el caso:`
        }
      ]
    });

    return result.content[0].type === "text" ? result.content[0].text : null;
  } catch (err) {
    logger.error(err, "Error generating ticket summary");
    return null;
  }
};
