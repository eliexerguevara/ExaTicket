"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const isAuth_1 = __importDefault(require("../middleware/isAuth"));
const LabelController = __importStar(require("../controllers/LabelController"));
const labelRoutes = (0, express_1.Router)();
// CRUD for labels (admin)
labelRoutes.get("/labels", isAuth_1.default, LabelController.index);
labelRoutes.post("/labels", isAuth_1.default, LabelController.store);
labelRoutes.put("/labels/:id", isAuth_1.default, LabelController.update);
labelRoutes.delete("/labels/:id", isAuth_1.default, LabelController.remove);
// Add/remove label from a ticket
labelRoutes.post("/tickets/:ticketId/labels/:labelId", isAuth_1.default, LabelController.addToTicket);
labelRoutes.delete("/tickets/:ticketId/labels/:labelId", isAuth_1.default, LabelController.removeFromTicket);
// Broadcast message to all tickets with a label
labelRoutes.post("/labels/:labelId/broadcast", isAuth_1.default, LabelController.broadcast);
exports.default = labelRoutes;
