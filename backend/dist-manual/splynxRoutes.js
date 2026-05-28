"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const isAuth_1 = __importDefault(require("../middleware/isAuth"));
const SplynxController = require("../controllers/SplynxController");

const splynxRoutes = (0, express_1.Router)();

// GET /splynx/customers/search?name=xxx
splynxRoutes.get("/splynx/customers/search", isAuth_1.default, SplynxController.searchCustomers);

// POST /splynx/document/:ticketId  { splynxCustomerId }
splynxRoutes.post("/splynx/document/:ticketId", isAuth_1.default, SplynxController.documentTicket);

// POST /splynx/test-connection
splynxRoutes.post("/splynx/test-connection", isAuth_1.default, SplynxController.testConnection);

exports.default = splynxRoutes;
