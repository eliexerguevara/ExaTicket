import express from "express";
import isAuth from "../middleware/isAuth";
import * as SplynxController from "../controllers/SplynxController";

const splynxRoutes = express.Router();

// GET /splynx/customers/search?name=xxx
splynxRoutes.get("/splynx/customers/search", isAuth, SplynxController.searchCustomers);

// POST /splynx/document/:ticketId  { splynxCustomerId }
splynxRoutes.post("/splynx/document/:ticketId", isAuth, SplynxController.documentTicket);

// POST /splynx/test-connection  (existing, moved from whatsapp routes)
splynxRoutes.post("/splynx/test-connection", isAuth, SplynxController.testConnection);

export default splynxRoutes;
