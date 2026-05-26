import express from "express";
import isAuth from "../middleware/isAuth";
import * as LabelController from "../controllers/LabelController";

const labelRoutes = express.Router();

// CRUD for labels (admin)
labelRoutes.get("/labels", isAuth, LabelController.index);
labelRoutes.post("/labels", isAuth, LabelController.store);
labelRoutes.put("/labels/:id", isAuth, LabelController.update);
labelRoutes.delete("/labels/:id", isAuth, LabelController.remove);

// Add/remove label from a ticket
labelRoutes.post("/tickets/:ticketId/labels/:labelId", isAuth, LabelController.addToTicket);
labelRoutes.delete("/tickets/:ticketId/labels/:labelId", isAuth, LabelController.removeFromTicket);

// Broadcast message to all tickets with a label
labelRoutes.post("/labels/:labelId/broadcast", isAuth, LabelController.broadcast);

export default labelRoutes;
