import { Request, Response } from "express";

import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";

import UpdateSettingService from "../services/SettingServices/UpdateSettingService";
import ListSettingsService from "../services/SettingServices/ListSettingsService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  if (req.user.profile !== "superadmin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const settings = await ListSettingsService();

  return res.status(200).json(settings);
};

// Subconjunto de settings sin secretos (API keys, contraseñas), seguro para
// cualquier usuario autenticado: solo para saber si mostrar el boton de
// Splynx/UISP en el ticket, sin exponer el resto de la configuracion.
export const crmStatus = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  const settings = await ListSettingsService();
  const find = (key: string): string =>
    settings?.find(s => s.key === key)?.value || "";

  return res.status(200).json({
    uispEnabled: find("uispEnabled") === "enabled",
    splynxEnabled: find("splynxEnabled") === "enabled"
  });
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "superadmin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const { settingKey: key } = req.params;
  const { value } = req.body;

  const setting = await UpdateSettingService({
    key,
    value
  });

  const io = getIO();
  io.emit("settings", {
    action: "update",
    setting
  });

  return res.status(200).json(setting);
};
