import { Request, Response } from "express";
import { testZabbixConnection } from "../services/ZabbixService/ZabbixService";
import { logger } from "../utils/logger";

export const testConnection = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { apiUrl, apiToken, apiUser, apiPassword } = req.body as {
    apiUrl: string;
    apiToken?: string;
    apiUser?: string;
    apiPassword?: string;
  };

  if (!apiUrl) {
    return res.status(400).json({ ok: false, message: "Falta el campo: apiUrl" });
  }
  if (!apiToken && !apiUser) {
    return res.status(400).json({
      ok: false,
      message: "Proporciona apiToken o apiUser + apiPassword"
    });
  }

  try {
    const result = await testZabbixConnection(
      apiUrl,
      apiToken || "",
      apiUser  || "",
      apiPassword || ""
    );
    return res.json(result);
  } catch (err) {
    logger.error(err, "ZabbixController: testConnection error");
    return res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};
