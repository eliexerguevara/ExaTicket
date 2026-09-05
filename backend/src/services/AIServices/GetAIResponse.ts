import Message from "../../models/Message";
import { logger } from "../../utils/logger";

export interface AIResponse {
  response: string;
  shouldEscalate: boolean;
  shouldResolve: boolean;
}

export interface TicketImageResult {
  url: string;
  filename: string;  // raw filename stored in DB (e.g., "abc12.jpeg")
  mimeType: string;  // derived MIME type (e.g., "image/jpeg")
  fromMe: boolean;
  createdAt: Date;
}

const ESCALATION_MARKER = "[ESCALAR]";
const RESUELTO_MARKER = "[RESUELTO]";

// ─── Ollama client ────────────────────────────────────────────────────────────

const getOllamaBaseUrl = (): string =>
  (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");

const getOllamaModel = (): string => process.env.OLLAMA_MODEL || "llama3.2";

type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

interface OllamaChatResult {
  text: string;
  evalCount?: number;
}

const callOllama = async (
  messages: OllamaMessage[],
  maxTokens: number
): Promise<OllamaChatResult> => {
  const res = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getOllamaModel(),
      messages,
      stream: false,
      options: { num_predict: maxTokens }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama request failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  return {
    text: data?.message?.content ?? "",
    evalCount: data?.eval_count
  };
};

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

  // El modelo espera que la conversación empiece con un mensaje del usuario
  const firstUserIdx = pairs.findIndex(m => m.role === "user");
  return firstUserIdx >= 0 ? pairs.slice(firstUserIdx) : [];
};

export const getAIResponse = async (
  ticketId: number,
  systemPrompt: string,
  splynxContext?: string
): Promise<AIResponse> => {
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
    const { text, evalCount } = await callOllama(
      [{ role: "system", content: fullSystem }, ...conversation],
      300
    );

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
      `AI response for ticket ${ticketId}: shouldEscalate=${shouldEscalate}, shouldResolve=${shouldResolve}, tokens_used=${evalCount}`
    );

    return { response, shouldEscalate, shouldResolve };
  } catch (err) {
    logger.error(err, "Error calling Ollama AI API");
    throw err;
  }
};

// ─── Agent advice: answers a specific question from an agent about a ticket ──

export const getAgentAdvice = async (
  ticketId: number,
  agentQuestion: string
): Promise<{ response: string }> => {
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
    const { text, evalCount } = await callOllama(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      500
    );

    logger.debug(`Agent advice for ticket ${ticketId}: tokens_used=${evalCount}`);

    return { response: text };
  } catch (err) {
    logger.error(err, "Error calling Ollama AI API for agent advice");
    throw err;
  }
};

// ─── Ticket summary: brief AI-generated summary for internal note ─────────────

export interface TicketSummaryResult {
  summary: string | null;
  reportTime: string | null;
}

export const getTicketSummary = async (
  ticketId: number
): Promise<TicketSummaryResult | null> => {
  try {
    const { Op } = require("sequelize");

    // Only messages from the last 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const messages = await Message.findAll({
      where: {
        ticketId,
        createdAt: { [Op.gte]: twelveHoursAgo }
      },
      order: [["createdAt", "ASC"]],
      limit: 30
    });

    // Filter out media/deleted/internal
    const filtered = messages.filter(
      (m: any) => m.body && !m.body.startsWith("data:") && !m.isDeleted && !m.isInternal
    );
    if (filtered.length < 2) return null;

    // First client message = report time
    const firstClientMsg = filtered.find((m: any) => !m.fromMe);
    const reportTime = firstClientMsg
      ? new Date(firstClientMsg.createdAt).toLocaleTimeString("es", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })
      : null;

    // Build conversation with timestamps
    const conversationText = filtered
      .map((m: any) => {
        const time = new Date(m.createdAt).toLocaleTimeString("es", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        });
        const role = m.fromMe ? "Agente/Bot" : "Cliente";
        return `[${time} - ${role}]: ${m.body}`;
      })
      .join("\n");

    const { text } = await callOllama(
      [
        {
          role: "system",
          content:
            "Eres un asistente de soporte técnico. Resume en 2-3 líneas el problema que reportó el cliente, la hora en que lo reportó y cómo se resolvió. Sin encabezados ni listas. Directo y conciso. En español."
        },
        {
          role: "user",
          content: `Conversación de las últimas 12 horas:\n${conversationText}\n\nResume el caso incluyendo la hora del reporte:`
        }
      ],
      250
    );

    return { summary: text || null, reportTime };
  } catch (err) {
    logger.error(err, "Error generating ticket summary");
    return null;
  }
};

/**
 * Returns all image messages sent in a ticket during the last 12 hours.
 * Includes images from both the client (fromMe=false) and the agent/bot (fromMe=true).
 */
export const getTicketImages = async (
  ticketId: number
): Promise<TicketImageResult[]> => {
  try {
    const { Op } = require("sequelize");
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // The DB stores mediaType as "image" (WhatsApp) or "image/jpeg" (other sources).
    // Use Op.like "image%" to match both variants.
    const messages = await Message.findAll({
      where: {
        ticketId,
        createdAt: { [Op.gte]: twelveHoursAgo },
        mediaType: { [Op.like]: "image%" }
      },
      order: [["createdAt", "ASC"]],
      limit: 20
    });

    return messages
      .filter((m: any) => m.getDataValue("mediaUrl") && !m.isDeleted)
      .map((m: any) => {
        const rawFilename: string = m.getDataValue("mediaUrl");
        const ext = rawFilename.split(".").pop()?.toLowerCase() || "jpeg";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg",
          png: "image/png", gif: "image/gif",
          webp: "image/webp", heic: "image/heic"
        };
        return {
          url: m.mediaUrl,           // full URL via model getter
          filename: rawFilename,     // raw filename for filesystem access
          mimeType: mimeMap[ext] || "image/jpeg",
          fromMe: m.fromMe,
          createdAt: m.createdAt
        };
      });
  } catch (err) {
    logger.error(err, "Error fetching ticket images");
    return [];
  }
};
