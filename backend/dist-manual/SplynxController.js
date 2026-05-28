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
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentTicket = exports.searchCustomers = exports.testConnection = void 0;

const SplynxService = require("../services/SplynxService/SplynxService");
const GetAIResponse = require("../services/AIServices/GetAIResponse");
const UpdateTicketService = require("../services/TicketServices/UpdateTicketService");
const logger_1 = require("../utils/logger");

const testConnection = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { apiUrl, apiKey, apiSecret, adminLogin, adminPassword } = req.body;
    if (!apiUrl) {
        return res.status(400).json({ ok: false, message: "Falta el campo: apiUrl" });
    }
    if (!apiKey && !adminLogin) {
        return res.status(400).json({ ok: false, message: "Proporciona apiKey+apiSecret o adminLogin+adminPassword" });
    }
    try {
        const result = yield SplynxService.testConnection(apiUrl, apiKey || "", apiSecret || "", adminLogin, adminPassword);
        return res.json(result);
    } catch (err) {
        logger_1.logger.error(err, "SplynxController: testConnection error");
        return res.status(500).json({ ok: false, message: "Error interno" });
    }
});
exports.testConnection = testConnection;

/** Search Splynx customers by partial name */
const searchCustomers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name } = req.query;
    if (!name || String(name).trim().length < 2) {
        return res.json([]);
    }
    try {
        const results = yield SplynxService.findCustomersByName(String(name).trim());
        return res.json(results || []);
    } catch (err) {
        logger_1.logger.error(err, "SplynxController: searchCustomers error");
        return res.status(500).json({ error: "Error buscando clientes" });
    }
});
exports.searchCustomers = searchCustomers;

/** Generate AI summary and create Splynx ticket, then close the ExaTicket */
const documentTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const ticketId = Number(req.params.ticketId);
    const { splynxCustomerId } = req.body;
    if (!ticketId || !splynxCustomerId) {
        return res.status(400).json({ error: "ticketId y splynxCustomerId son requeridos" });
    }
    try {
        // 1. AI summary (last 12 hours only)
        const summaryResult = yield GetAIResponse.getTicketSummary(ticketId);
        const summary = (summaryResult === null || summaryResult === void 0 ? void 0 : summaryResult.summary) || null;
        const reportTime = (summaryResult === null || summaryResult === void 0 ? void 0 : summaryResult.reportTime) || null;
        const now = new Date();
        const dateStr = now.toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" });
        const timeStr = now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false });
        const subject = `Soporte ${dateStr} ${timeStr}`;
        const reportLine = reportTime ? `\nHora de reporte: ${reportTime}` : "";
        const message = summary
            ? `Caso resuelto vía ExaTicket.${reportLine}\n\nResumen:\n${summary}`
            : `Caso resuelto vía ExaTicket.${reportLine}`;
        // 2. Create Splynx ticket via bridge
        const splynxResult = yield SplynxService.createSplynxTicket(splynxCustomerId, subject, message, "low", "closed");
        if (!(splynxResult === null || splynxResult === void 0 ? void 0 : splynxResult.id)) {
            logger_1.logger.warn({ ticketId, splynxCustomerId }, "SplynxController: documentTicket - bridge returned no id");
            return res.status(500).json({ error: "No se pudo crear el ticket en Splynx" });
        }
        // 3. Close the ExaTicket
        yield (0, UpdateTicketService.default)({ ticketData: { status: "closed" }, ticketId });
        logger_1.logger.info({ ticketId, splynxTicketId: splynxResult.id, splynxCustomerId }, "SplynxController: ticket documented and closed");
        return res.json({ success: true, splynxTicketId: splynxResult.id });
    } catch (err) {
        logger_1.logger.error(err, "SplynxController: documentTicket error");
        return res.status(500).json({ error: "Error al documentar el ticket" });
    }
});
exports.documentTicket = documentTicket;
