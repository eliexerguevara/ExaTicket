import { Router } from "express";
import isAuth from "../middleware/isAuth";

import * as SettingController from "../controllers/SettingController";
import * as SplynxController from "../controllers/SplynxController";

const settingRoutes = Router();

settingRoutes.get("/settings", isAuth, SettingController.index);

// change setting key to key in future
settingRoutes.put("/settings/:settingKey", isAuth, SettingController.update);

// Splynx
settingRoutes.post("/splynx/test-connection", isAuth, SplynxController.testConnection);

export default settingRoutes;
