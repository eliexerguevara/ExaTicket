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
    m => m.body && !m.body.startsWith("data:") && !m.isDeleted
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

INSTRUCCIÓN CRÍTICA: Cuando no puedas resolver el problema del usuario o cuando el caso requiera intervención humana, escribe exactamente "${ESCALATION_MARKER}" al comienzo de tu respuesta, seguido del mensaje explicando que lo transferirás con un agente.

Responde siempre en el mismo idioma que el usuario. Sé conciso y profesional.`;

  try {
    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
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
