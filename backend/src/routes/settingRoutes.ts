import { Router } from "express";
import isAuth from "../middleware/isAuth";

import * as SettingController from "../controllers/SettingController";
import * as SplynxController from "../controllers/SplynxController";
import * as ZabbixController from "../controllers/ZabbixController";
import * as EmailController from "../controllers/EmailController";

const settingRoutes = Router();

settingRoutes.get("/settings", isAuth, SettingController.index);
settingRoutes.get("/settings/crm-status", isAuth, SettingController.crmStatus);

// change setting key to key in future
settingRoutes.put("/settings/:settingKey", isAuth, SettingController.update);

// Splynx
settingRoutes.post("/splynx/test-connection", isAuth, SplynxController.testConnection);

// Zabbix
settingRoutes.post("/zabbix/test-connection", isAuth, ZabbixController.testConnection);

// Email SMTP test
settingRoutes.post("/settings/test-email", isAuth, EmailController.testEmail);

export default settingRoutes;
