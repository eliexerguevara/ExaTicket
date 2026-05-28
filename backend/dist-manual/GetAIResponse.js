"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicketSummary = exports.getAgentAdvice = exports.getAIResponse = void 0;

const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const Message_1 = __importDefault(require("../../models/Message"));
const logger_1 = require("../../utils/logger");

const ESCALATION_MARKER = "[ESCALAR]";
const RESUELTO_MARKER = "[RESUELTO]";

const buildConversation = (messages) => {
    const filtered = messages.filter(
        m => m.body && !m.body.startsWith("data:") && !m.isDeleted && !m.isInternal
    );
    const pairs = [];
    for (const msg of filtered) {
        const role = msg.fromMe ? "assistant" : "user";
        const last = pairs[pairs.length - 1];
        if (last && last.role === role) {
            last.content += `\n${msg.body}`;
        } else {
            pairs.push({ role, content: msg.body });
        }
    }
    const firstUserIdx = pairs.findIndex(m => m.role === "user");
    return firstUserIdx >= 0 ? pairs.slice(firstUserIdx) : [];
};

// ─── Main AI response ────────────────────────────────────────────────────────
const getAIResponse = (ticketId, systemPrompt, splynxContext) => __awaiter(void 0, void 0, void 0, function* () {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const messages = yield Message_1.default.findAll({
        where: { ticketId },
        order: [["createdAt", "ASC"]],
        limit: 50
    });
    const conversation = buildConversation(messages);
    if (conversation.length === 0) {
        return { response: "", shouldEscalate: false, shouldResolve: false };
    }
    const fullSystem = splynxContext
        ? `${systemPrompt}\n\nCONTEXTO SPLYNX DEL CLIENTE:\n${splynxContext}`
        : systemPrompt;
    const result = yield client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: fullSystem,
        messages: conversation
    });
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    const shouldEscalate = text.includes(ESCALATION_MARKER);
    const shouldResolve = text.includes(RESUELTO_MARKER);
    const response = text
        .replace(ESCALATION_MARKER, "")
        .replace(RESUELTO_MARKER, "")
        .trim();
    return { response, shouldEscalate, shouldResolve };
});
exports.getAIResponse = getAIResponse;

// ─── Agent advice ────────────────────────────────────────────────────────────
const getAgentAdvice = (ticketId, agentQuestion) => __awaiter(void 0, void 0, void 0, function* () {
    if (!process.env.ANTHROPIC_API_KEY) return { response: "" };
    const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const messages = yield Message_1.default.findAll({
        where: { ticketId },
        order: [["createdAt", "ASC"]],
        limit: 30
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
    const conversationSummary = conversation.length > 0
        ? `\nHistorial del ticket:\n${conversation.map(m => `[${m.role === "user" ? "Cliente" : "Agente/Bot"}]: ${m.content}`).join("\n")}\n`
        : "";
    const userContent = `${conversationSummary}\nPregunta del agente: ${agentQuestion}`;
    try {
        const result = yield client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }]
        });
        const text = result.content[0].type === "text" ? result.content[0].text : "";
        return { response: text };
    } catch (err) {
        logger_1.logger.error(err, "Error calling Claude AI API for agent advice");
        throw err;
    }
});
exports.getAgentAdvice = getAgentAdvice;

// ─── Ticket summary (last 12 hours, includes report time) ────────────────────
const getTicketSummary = (ticketId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    try {
        const { Op } = require("sequelize");
        const client = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });

        // Only messages from the last 12 hours
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

        const messages = yield Message_1.default.findAll({
            where: {
                ticketId,
                createdAt: { [Op.gte]: twelveHoursAgo }
            },
            order: [["createdAt", "ASC"]],
            limit: 30
        });

        // Filter out media, deleted and internal messages
        const filtered = messages.filter(
            m => m.body && !m.body.startsWith("data:") && !m.isDeleted && !m.isInternal
        );
        if (filtered.length < 2) return null;

        // First client message = report time
        const firstClientMsg = filtered.find(m => !m.fromMe);
        const reportTime = firstClientMsg
            ? new Date(firstClientMsg.createdAt).toLocaleTimeString("es", {
                hour: "2-digit", minute: "2-digit", hour12: false
              })
            : null;

        // Build conversation text with timestamps
        const conversationText = filtered
            .map(m => {
                const time = new Date(m.createdAt).toLocaleTimeString("es", {
                    hour: "2-digit", minute: "2-digit", hour12: false
                });
                const role = m.fromMe ? "Agente/Bot" : "Cliente";
                return `[${time} - ${role}]: ${m.body}`;
            })
            .join("\n");

        const result = yield client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 250,
            system: "Eres un asistente de soporte técnico. Resume en 2-3 líneas el problema que reportó el cliente, la hora en que lo reportó y cómo se resolvió. Sin encabezados ni listas. Directo y conciso. En español.",
            messages: [
                {
                    role: "user",
                    content: `Conversación de las últimas 12 horas:\n${conversationText}\n\nResume el caso incluyendo la hora del reporte:`
                }
            ]
        });

        const summary = result.content[0].type === "text" ? result.content[0].text : null;
        return { summary, reportTime };
    } catch (err) {
        logger_1.logger.error(err, "Error generating ticket summary");
        return null;
    }
});
exports.getTicketSummary = getTicketSummary;
