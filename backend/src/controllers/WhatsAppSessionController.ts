import { Request, Response } from "express";
import { whatsappProvider } from "../providers/WhatsApp";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import { requestPairingCode, hasSession } from "../providers/WhatsApp/Implementations/whaileys";
import { sleep } from "../utils/sleep";
import { logger } from "../utils/logger";
import AppError from "../errors/AppError";

// Iniciar/reiniciar/desconectar la sesion o vincular un nuevo telefono son
// acciones de admin/superadmin - la pagina de Conexiones ya esta oculta para
// "user" en el menu, esto hace que el backend lo exija tambien.
const ensureConnectionsAdmin = (req: Request): void => {
  if (req.user.profile !== "admin" && req.user.profile !== "superadmin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

const store = async (req: Request, res: Response): Promise<Response> => {
  ensureConnectionsAdmin(req);

  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  StartWhatsAppSession(whatsapp);

  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  ensureConnectionsAdmin(req);

  const { whatsappId } = req.params;

  const { whatsapp } = await UpdateWhatsAppService({
    whatsappId,
    whatsappData: { session: "" }
  });

  StartWhatsAppSession(whatsapp);

  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  ensureConnectionsAdmin(req);

  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  await whatsappProvider.logout(whatsapp.id);

  return res.status(200).json({ message: "Session disconnected." });
};

const pairingCode = async (req: Request, res: Response): Promise<Response> => {
  ensureConnectionsAdmin(req);

  const { whatsappId } = req.params;
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "phoneNumber is required" });
  }

  const sessionId = Number(whatsappId);

  try {
    // If the socket is not in memory, start the session and wait for the
    // WebSocket to open before requesting the pairing code.
    if (!hasSession(sessionId)) {
      logger.info({ info: "Pairing code: session not running, starting it", sessionId });
      const whatsapp = await ShowWhatsAppService(whatsappId);
      await StartWhatsAppSession(whatsapp);
      // init() adds the socket to sessions immediately, but the WA WebSocket
      // needs a few seconds to connect to WA servers before we can query.
      await sleep(5000);
    }

    // Retry up to 3 times in case the WS needs a bit more time to open.
    let lastErr: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const code = await requestPairingCode(sessionId, String(phoneNumber));
        // Format as XXXX-XXXX for display
        const formatted = code.length === 8
          ? `${code.slice(0, 4)}-${code.slice(4)}`
          : code;
        return res.status(200).json({ code: formatted });
      } catch (e: any) {
        lastErr = e;
        logger.warn({ info: `Pairing code attempt ${attempt} failed`, err: e?.message, sessionId });
        if (attempt < 3) await sleep(3000);
      }
    }

    throw lastErr;
  } catch (err: any) {
    logger.error(err, "Error requesting pairing code");
    const detail = err?.message || "Unknown error";
    return res.status(500).json({
      error: "Failed to generate pairing code. Please try again.",
      detail
    });
  }
};

export default { store, remove, update, pairingCode };
