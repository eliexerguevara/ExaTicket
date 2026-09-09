import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { whatsappProvider } from "../../providers/WhatsApp";
import { logger } from "../../utils/logger";

const GetProfilePicUrl = async (number: string): Promise<string> => {
  const defaultWhatsapp = await GetDefaultWhatsApp();

  try {
    const profilePicUrl = await whatsappProvider.getProfilePicUrl(
      defaultWhatsapp.id,
      number
    );

    return profilePicUrl;
  } catch (err) {
    // No dejar que un fallo al traer la foto de perfil (ej. bug de LID en
    // whatsapp-web.js) bloquee la creación/actualización del contacto.
    logger.warn(err, `Could not fetch profile picture for ${number}`);
    return "";
  }
};

export default GetProfilePicUrl;
