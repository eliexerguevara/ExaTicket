import { Request, Response } from "express";
import { testConnection as splynxTestConnection } from "../services/SplynxService/SplynxService";
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
