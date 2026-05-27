import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as TelegramController from "../controllers/TelegramController";

const telegramRoutes = Router();

telegramRoutes.get("/telegram",           isAuth, TelegramController.index);
telegramRoutes.post("/telegram",          isAuth, TelegramController.store);
telegramRoutes.put("/telegram/:id",       isAuth, TelegramController.update);
telegramRoutes.delete("/telegram/:id",    isAuth, TelegramController.remove);
telegramRoutes.post("/telegram/:id/connect",    isAuth, TelegramController.connect);
telegramRoutes.post("/telegram/:id/disconnect", isAuth, TelegramController.disconnect);

export default telegramRoutes;
