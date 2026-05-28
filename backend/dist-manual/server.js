"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_graceful_shutdown_1 = __importDefault(require("http-graceful-shutdown"));
const app_1 = __importDefault(require("./app"));
const socket_1 = require("./libs/socket");
const logger_1 = require("./utils/logger");
const redisStore_1 = require("./libs/redisStore");
const StartAllWhatsAppsSessions_1 = require("./services/WbotServices/StartAllWhatsAppsSessions");
const TelegramBotService_1 = require("./services/TelegramService/TelegramBotService");
const server = app_1.default.listen(process.env.PORT, () => {
    logger_1.logger.info(`Server started on port: ${process.env.PORT}`);
});
(0, socket_1.initIO)(server);
(0, redisStore_1.initRedis)();
(0, StartAllWhatsAppsSessions_1.StartAllWhatsAppsSessions)();
(0, TelegramBotService_1.startAllTelegramBots)();
(0, http_graceful_shutdown_1.default)(server);
process.on("uncaughtException", err => {
    logger_1.logger.error({ info: "Global uncaught exception", err });
});
process.on("unhandledRejection", err => {
    if (err)
        logger_1.logger.error({ info: "Global unhandled rejection", err });
});
