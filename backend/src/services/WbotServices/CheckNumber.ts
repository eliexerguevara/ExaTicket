import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { whatsappProvider } from "../../providers/WhatsApp";

const CheckContactNumber = async (number: string): Promise<string> => {
  const defaultWhatsapp = await GetDefaultWhatsApp();

  const validNumber = await whatsappProvider.checkNumber(
    defaultWhatsapp.id,
    number
  );
  return validNumber;
};

export default CheckContactNumber;
