import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";
import User from "../models/User";

interface RequestingUser {
  id: string | number;
  profile: string;
}

/**
 * Un ticket es visible/editable por un agente si:
 *  - es admin/superadmin (ven todo, igual que showAll=true en ListTicketsService), o
 *  - el ticket ya esta asignado a el, o
 *  - el ticket esta "pending" (sin asignar) y esta en una cola a la que
 *    tiene acceso (o el ticket no tiene cola asignada)
 * Misma regla que ya aplica ListTicketsService para el listado - esto la
 * hace cumplir tambien al leer/escribir un ticket puntual por ID.
 */
const EnsureTicketAccess = async (
  ticket: Ticket,
  requestingUser: RequestingUser
): Promise<void> => {
  if (
    requestingUser.profile === "admin" ||
    requestingUser.profile === "superadmin"
  ) {
    return;
  }

  if (
    ticket.userId &&
    String(ticket.userId) === String(requestingUser.id)
  ) {
    return;
  }

  if (ticket.status === "pending") {
    if (!ticket.queueId) return;

    const user = await User.findByPk(requestingUser.id, {
      include: ["queues"]
    });
    const allowedQueueIds = (user?.queues || []).map(q => q.id);

    if (allowedQueueIds.includes(ticket.queueId)) return;
  }

  throw new AppError("ERR_NO_PERMISSION", 403);
};

export default EnsureTicketAccess;
