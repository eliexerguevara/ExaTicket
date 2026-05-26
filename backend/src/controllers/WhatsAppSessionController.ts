import { Request, Response } from "express";
import { whatsappProvider } from "../providers/WhatsApp";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import { requestPairingCode } from "../providers/WhatsApp/Implementations/whaileys";
import { logger } from "../utils/logger";

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  StartWhatsAppSession(whatsapp);

  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;

  const { whatsapp } = await UpdateWhatsAppService({
    whatsappId,
    whatsappData: { session: "" }
  });

  StartWhatsAppSession(whatsapp);

  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  await whatsappProvider.logout(whatsapp.id);

  return res.status(200).json({ message: "Session disconnected." });
};

const pairingCode = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "phoneNumber is required" });
  }

  try {
    const code = await requestPairingCode(Number(whatsappId), String(phoneNumber));
    // Format as XXXX-XXXX for display
    const formatted = code.length === 8
      ? `${code.slice(0, 4)}-${code.slice(4)}`
      : code;
    return res.status(200).json({ code: formatted });
  } catch (err) {
    logger.error(err, "Error requesting pairing code");
    return res.status(500).json({ error: "Failed to generate pairing code. Make sure the session is active (qrcode state)." });
  }
};

export default { store, remove, update, pairingCode };
