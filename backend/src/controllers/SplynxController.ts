import { Request, Response } from "express";
import { testConnection as splynxTestConnection } from "../services/SplynxService/SplynxService";
import { logger } from "../utils/logger";

export const testConnection = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { apiUrl, apiKey, apiSecret } = req.body as {
    apiUrl: string;
    apiKey: string;
    apiSecret: string;
  };

  if (!apiUrl || !apiKey || !apiSecret) {
    return res
      .status(400)
      .json({ ok: false, message: "Faltan campos: apiUrl, apiKey, apiSecret" });
  }

  try {
    const result = await splynxTestConnection(apiUrl, apiKey, apiSecret);
    return res.json(result);
  } catch (err) {
    logger.error(err, "SplynxController: testConnection error");
    return res.status(500).json({ ok: false, message: "Error interno" });
  }
};
