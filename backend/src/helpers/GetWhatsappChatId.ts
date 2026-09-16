import Ticket from "../models/Ticket";

/**
 * Cuando WhatsApp solo nos da el LID de un contacto (identificador interno
 * del nuevo esquema multi-dispositivo) y nunca llega su numero de telefono
 * real, CreateOrUpdateContactService termina guardando los digitos del LID
 * en el campo "number" (ver whaileys.ts, resolucion de contactPayload).
 * Enviarle un mensaje a esos digitos como si fueran un numero real
 * (`@s.whatsapp.net`) no le llega a nadie: WhatsApp lo acepta sin error
 * pero el mensaje se pierde, porque ese numero no corresponde a ninguna
 * cuenta. Hay que mandarlo al JID `@lid` tal cual en ese caso.
 */
const isNumberActuallyLid = (contact: { number: string; lid?: string }): boolean =>
  Boolean(contact.lid) && contact.lid === `${contact.number}@lid`;

const GetWhatsappChatId = (ticket: Ticket): string => {
  if (ticket.isGroup) {
    return `${ticket.contact.number}@g.us`;
  }

  if (
    process.env.WHATSAPP_PROVIDER === "whaileys" &&
    isNumberActuallyLid(ticket.contact)
  ) {
    return ticket.contact.lid;
  }

  return `${ticket.contact.number}@c.us`;
};

export default GetWhatsappChatId;
