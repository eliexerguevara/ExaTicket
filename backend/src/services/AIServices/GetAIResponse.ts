import Anthropic from "@anthropic-ai/sdk";
import Message from "../../models/Message";
import { logger } from "../../utils/logger";

export interface AIResponse {
  response: string;
  shouldEscalate: boolean;
  shouldResolve: boolean;
}

const ESCALATION_MARKER = "[ESCALAR]";
const RESUELTO_MARKER = "[RESUELTO]";

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
  systemPrompt: string,
  splynxContext?: string
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
    return { response: "", shouldEscalate: false, shouldResolve: false };
  }

  // Prepend Splynx customer data if available
  const splynxBlock = splynxContext
    ? `\n\n${splynxContext}\n\nUSA SIEMPRE EL NOMBRE DEL CLIENTE para saludarlo y personalizar la respuesta.`
    : "";

  const fullSystem = `${systemPrompt}${splynxBlock}

INSTRUCCIONES CRÍTICAS — SIGUE ESTAS REGLAS EXACTAMENTE:

REGLA 1 — ESCALAR:
Si no puedes resolver el problema, el cliente lo pide, o el caso requiere un técnico presencial, escribe literalmente "${ESCALATION_MARKER}" al INICIO de tu respuesta (sin nada antes), seguido del mensaje al cliente.
Ejemplo: "${ESCALATION_MARKER} Voy a transferirte con un agente que puede ayudarte mejor."

REGLA 2 — CASO RESUELTO:
Si el cliente confirma en PRESENTE que su servicio YA está funcionando (ejemplos exactos: "ya funciona", "ya tengo internet", "tengo internet ya", "sí funciona", "ya hay internet", "volvió el internet", "se solucionó", "ya conecté", "ya me conectó", "está funcionando ya", "todo funciona ya", "listo funciona"), escribe literalmente "${RESUELTO_MARKER}" al INICIO de tu respuesta (sin nada antes), seguido de un mensaje de cierre cálido en 1 línea.
Ejemplo correcto: "${RESUELTO_MARKER} ¡Qué bueno que ya tienes internet! Que tengas un excelente día. 😊"
IMPORTANTE: NO uses ${RESUELTO_MARKER} si el cliente usa tiempo pasado sin confirmar que ahora funciona ("tenía internet" = ambiguo, no resolver). Úsalo SOLO cuando es claro que el servicio funciona AHORA.

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

    const trimmed = text.trimStart();
    const shouldEscalate = trimmed.startsWith(ESCALATION_MARKER);
    const shouldResolve = !shouldEscalate && trimmed.startsWith(RESUELTO_MARKER);

    let response = text;
    if (shouldEscalate) {
      response = text.replace(ESCALATION_MARKER, "").trimStart();
    } else if (shouldResolve) {
      response = text.replace(RESUELTO_MARKER, "").trimStart();
    }

    logger.debug(
      `AI response for ticket ${ticketId}: shouldEscalate=${shouldEscalate}, shouldResolve=${shouldResolve}, tokens_used=${result.usage?.output_tokens}`
    );

    return { response, shouldEscalate, shouldResolve };
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
Tienes acceso al historial del ticket. Analiza el lenguaje del cliente para indicar al agente cómo comunicarse:
- Si el cliente usa lenguaje técnico: dile al agente que puede usar términos técnicos con él.
- Si el cliente usa lenguaje básico: advierte al agente que debe usar lenguaje muy simple.

Pautas de diagnóstico:
- Router desconfigurado: verificar IP asignada (debe ser 192.168.x.x), DNS (8.8.8.8 / 1.1.1.1), reset de fábrica (botón trasero 10s), actualización de firmware, canal WiFi (1, 6 o 11), verificar contraseña WPA2.
- Sin internet: revisar LEDs del modem/ONT (LOS rojo = falla fibra), reiniciar ONT 30s, verificar PPPoE credentials, cable UTP cat5e/6, revisar estado del servicio en la zona.
- Velocidad lenta: test en speedtest.net con cable vs WiFi, interferencias 2.4GHz, saturación de NAT, QoS mal configurado, distancia al router.
- Intermitencia: niveles de potencia óptica (entre -8 y -27 dBm), temperatura del equipo, empalmes deteriorados, splitter defectuoso.
- Configuración manual: APN, DNS, gateway por defecto, MTU (1492 para PPPoE).

Responde con pasos técnicos numerados y concretos para el agente. En español.`;

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
