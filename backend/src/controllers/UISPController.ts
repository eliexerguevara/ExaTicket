import { Request, Response } from "express";
import {
  testConnection as uispTestConnection,
  findClientsByName,
  createUISPTicket,
  addUISPTicketComment
} from "../services/UISPService/UISPService";
import { getTicketSummary, getTicketImages } from "../services/AIServices/GetAIResponse";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { logger } from "../utils/logger";

/** Validate UISP credentials */
export const testConnection = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { apiUrl, apiKey } = req.body as { apiUrl: string; apiKey: string };

  if (!apiUrl || !apiKey) {
    return res.status(400).json({ ok: false, message: "Faltan campos: apiUrl y apiKey" });
  }

  try {
    const result = await uispTestConnection(apiUrl, apiKey);
    return res.json(result);
  } catch (err) {
    logger.error(err, "UISPController: testConnection error");
    return res.status(500).json({ ok: false, message: "Error interno" });
  }
};

/** Search UISP clients by partial name */
export const searchClients = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name } = req.query as { name?: string };
  if (!name || String(name).trim().length < 2) {
    return res.json([]);
  }
  try {
    const results = await findClientsByName(String(name).trim());
    return res.json(results || []);
  } catch (err) {
    logger.error(err, "UISPController: searchClients error");
    return res.status(500).json({ error: "Error buscando clientes en UISP" });
  }
};

/** Generate AI summary and create UISP ticket, then close the ExaTicket */
export const documentTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  const { uispClientId } = req.body as { uispClientId?: number };

  if (!ticketId || !uispClientId) {
    return res.status(400).json({ error: "ticketId y uispClientId son requeridos" });
  }

  try {
    // 1. AI summary + client images in parallel
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

    // 2. Create UISP ticket (status=3 Closed)
    const uispResult = await createUISPTicket(uispClientId, subject, message, 3);

    if (!uispResult?.id) {
      logger.warn({ ticketId, uispClientId }, "UISPController: documentTicket - no ticket id returned");
      return res.status(500).json({ error: "No se pudo crear el ticket en UISP" });
    }

    // 3. Upload client images as ticket comment attachments
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
          logger.warn(e, `UISPController: could not read file ${img.filename}`);
        }
      }

      if (fileBuffers.length > 0) {
        await addUISPTicketComment(uispResult.id, "", fileBuffers);
      }
    }

    // 4. Close the ExaTicket
    await UpdateTicketService({ ticketData: { status: "closed" }, ticketId });

    logger.info(
      { ticketId, uispTicketId: uispResult.id, uispClientId },
      "UISPController: ticket documented and closed"
    );
    return res.json({ success: true, uispTicketId: uispResult.id });
  } catch (err) {
    logger.error(err, "UISPController: documentTicket error");
    return res.status(500).json({ error: "Error al documentar el ticket en UISP" });
  }
};
