import { Request, Response } from "express";
import nodemailer from "nodemailer";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";

export const testEmail = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, testTo } = req.body;

  if (!smtpHost || !smtpUser || !smtpPass || !testTo) {
    throw new AppError("ERR_SMTP_FIELDS_REQUIRED", 400);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort) || 587,
      secure: Number(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from: smtpFrom || smtpUser,
      to: testTo,
      subject: "✅ Correo de prueba — ExaTicket",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1976d2;">✅ Correo de prueba exitoso</h2>
          <p>Este correo confirma que la configuración SMTP de <strong>ExaTicket</strong> funciona correctamente.</p>
          <table style="border-collapse:collapse; width:100%; font-size:13px; margin-top:16px;">
            <tr><td style="padding:6px;color:#666;width:120px;">Servidor</td><td style="padding:6px;font-weight:600;">${smtpHost}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px;color:#666;">Puerto</td><td style="padding:6px;font-weight:600;">${smtpPort || 587}</td></tr>
            <tr><td style="padding:6px;color:#666;">Usuario</td><td style="padding:6px;font-weight:600;">${smtpUser}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:6px;color:#666;">Remitente</td><td style="padding:6px;font-weight:600;">${smtpFrom || smtpUser}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#aaa;font-size:11px;">ExaTicket — Sistema de atención</p>
        </div>
      `
    });

    logger.info(`Test email sent to ${testTo} via ${smtpHost}`);
    return res.status(200).json({ ok: true, message: `Correo enviado correctamente a ${testTo}` });

  } catch (err: any) {
    logger.error(err, "testEmail error");
    return res.status(200).json({ ok: false, message: err.message || "Error al enviar el correo" });
  }
};
