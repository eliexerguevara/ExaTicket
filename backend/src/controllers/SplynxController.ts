import { Request, Response } from "express";
import {
  testConnection as splynxTestConnection,
  findCustomersByName,
  createSplynxTicket,
  addSplynxTicketAttachments
} from "../services/SplynxService/SplynxService";
import { getTicketSummary, getTicketImages } from "../services/AIServices/GetAIResponse";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { logger } from "../utils/logger";

export const testConnection = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { apiUrl, apiKey, apiSecret, adminLogin, adminPassword } = req.body as {
    apiUrl: string;
    apiKey?: string;
    apiSecret?: string;
    adminLogin?: string;
    adminPassword?: string;
  };

  if (!apiUrl) {
    return res
      .status(400)
      .json({ ok: false, message: "Falta el campo: apiUrl" });
  }
  if (!apiKey && !adminLogin) {
    return res
      .status(400)
      .json({ ok: false, message: "Proporciona apiKey+apiSecret o adminLogin+adminPassword" });
  }

  try {
    const result = await splynxTestConnection(
      apiUrl,
      apiKey || "",
      apiSecret || "",
      adminLogin,
      adminPassword
    );
    return res.json(result);
  } catch (err) {
    logger.error(err, "SplynxController: testConnection error");
    return res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/** Search Splynx customers by partial name */
export const searchCustomers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name } = req.query as { name?: string };
  if (!name || String(name).trim().length < 2) {
    return res.json([]);
  }
  try {
    const results = await findCustomersByName(String(name).trim());
    return res.json(results || []);
  } catch (err) {
    logger.error(err, "SplynxController: searchCustomers error");
    return res.status(500).json({ error: "Error buscando clientes" });
  }
};

/** Generate AI summary for a ticket and create a Splynx ticket, then close the ExaTicket */
export const documentTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  const { splynxCustomerId } = req.body as { splynxCustomerId?: number };

  if (!ticketId || !splynxCustomerId) {
    return res.status(400).json({ error: "ticketId y splynxCustomerId son requeridos" });
  }

  try {
    // 1. AI summary + client images (last 12 hours) in parallel
    const [summaryResult, images] = await Promise.all([
      getTicketSummary(ticketId),
      getTicketImages(ticketId)
    ]);
    const summary = summaryResult?.summary ?? null;
    const reportTime = summaryResult?.reportTime ?? null;

    const now = new Date();
    const dateStr = now.toLocaleDateString("es", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    const timeStr = now.toLocaleTimeString("es", {
      hour: "2-digit", minute: "2-digit", hour12: false
    });
    const subject = `Soporte ${dateStr} ${timeStr}`;

    const reportLine = reportTime ? `\nHora de reporte: ${reportTime}` : "";
    const message = summary
      ? `Caso resuelto vía ExaTicket.${reportLine}\n\nResumen:\n${summary}`
      : `Caso resuelto vía ExaTicket.${reportLine}`;

    const clientImages = images.filter(img => !img.fromMe);

    // 2. Create Splynx ticket via bridge
    const splynxResult = await createSplynxTicket(
      splynxCustomerId, subject, message, "low", "closed"
    );

    if (!splynxResult?.id) {
      logger.warn({ ticketId, splynxCustomerId }, "SplynxController: documentTicket - bridge returned no id");
      return res.status(500).json({ error: "No se pudo crear el ticket en Splynx" });
    }

    // 3. Upload client images as actual file attachments to Splynx
    if (clientImages.length > 0) {
      const { readFile } = require("fs").promises;
      const { join } = require("path");
      const publicDir = join(__dirname, "..", "..", "public");
      const fileBuffers: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];
      for (const img of clientImages) {
        try {
          const buffer = await readFile(join(publicDir, img.filename));
          fileBuffers.push({ filename: img.filename, buffer, mimeType: img.mimeType });
        } catch (e) {
          logger.warn(e, `SplynxController: could not read file ${img.filename}`);
        }
      }
      await addSplynxTicketAttachments(splynxResult.id, fileBuffers);
    }

    // 4. Close the ExaTicket
    await UpdateTicketService({ ticketData: { status: "closed" }, ticketId });

    logger.info(
      { ticketId, splynxTicketId: splynxResult.id, splynxCustomerId },
      "SplynxController: ticket documented and closed"
    );
    return res.json({ success: true, splynxTicketId: splynxResult.id });
  } catch (err) {
    logger.error(err, "SplynxController: documentTicket error");
    return res.status(500).json({ error: "Error al documentar el ticket" });
  }
};
