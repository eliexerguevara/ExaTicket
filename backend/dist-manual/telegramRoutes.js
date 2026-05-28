"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const isAuth_1 = __importDefault(require("../middleware/isAuth"));
const TelegramController = require("../controllers/TelegramController");

const telegramRoutes = (0, express_1.Router)();

telegramRoutes.get("/telegram", isAuth_1.default, TelegramController.index);
telegramRoutes.post("/telegram", isAuth_1.default, TelegramController.store);
telegramRoutes.put("/telegram/:id", isAuth_1.default, TelegramController.update);
telegramRoutes.delete("/telegram/:id", isAuth_1.default, TelegramController.remove);
telegramRoutes.post("/telegram/:id/connect", isAuth_1.default, TelegramController.connect);
telegramRoutes.post("/telegram/:id/disconnect", isAuth_1.default, TelegramController.disconnect);

exports.default = telegramRoutes;
