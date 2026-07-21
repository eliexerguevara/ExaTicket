import express from "express";
import isAuth from "../middleware/isAuth";
import * as UISPController from "../controllers/UISPController";

const uispRoutes = express.Router();

uispRoutes.post("/uisp/test-connection", isAuth, UISPController.testConnection);
uispRoutes.get("/uisp/clients/search", isAuth, UISPController.searchClients);
uispRoutes.post("/uisp/document/:ticketId", isAuth, UISPController.documentTicket);

export default uispRoutes;
