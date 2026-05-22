import crypto from "crypto";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import sendMail from "../EmailServices/SendMailService";

const ForgotPasswordService = async (email: string): Promise<void> => {
  const user = await User.findOne({ where: { email } });

  // Security: don't reveal whether the email exists or not
  if (!user) {
    logger.info(`ForgotPassword: email not found (${email}) — silently ignored`);
    return;
  }

  const token = crypto.randomBytes(20).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await user.update({
    passwordResetToken: token,
    passwordResetExpires: expires
  });

  const frontendUrl =
    process.env.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${frontendUrl}/reset-password/${token}`;

  await sendMail({
    to: user.email,
    subject: "Recuperación de contraseña — ExaTicket",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1976d2;">Recuperación de contraseña</h2>
        <p>Hola <strong>${user.name}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>ExaTicket</strong>.</p>
        <p>Haz clic en el botón de abajo para crear una nueva contraseña:</p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}"
             style="background-color:#1976d2;color:white;padding:12px 28px;border-radius:4px;
                    text-decoration:none;font-size:15px;font-weight:bold;">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#666;font-size:13px;">
          Este enlace es válido por <strong>1 hora</strong>.<br/>
          Si no solicitaste restablecer tu contraseña, ignora este mensaje — tu contraseña no cambiará.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
        <p style="color:#aaa;font-size:11px;">ExaTicket — Sistema de atención</p>
      </div>
    `
  });
};

export default ForgotPasswordService;
