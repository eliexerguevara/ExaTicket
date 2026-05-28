"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_typescript_1 = require("sequelize-typescript");
const User_1 = __importDefault(require("../models/User"));
const Setting_1 = __importDefault(require("../models/Setting"));
const Contact_1 = __importDefault(require("../models/Contact"));
const Ticket_1 = __importDefault(require("../models/Ticket"));
const Whatsapp_1 = __importDefault(require("../models/Whatsapp"));
const ContactCustomField_1 = __importDefault(require("../models/ContactCustomField"));
const Message_1 = __importDefault(require("../models/Message"));
const Queue_1 = __importDefault(require("../models/Queue"));
const WhatsappQueue_1 = __importDefault(require("../models/WhatsappQueue"));
const UserQueue_1 = __importDefault(require("../models/UserQueue"));
const QuickAnswer_1 = __importDefault(require("../models/QuickAnswer"));
const WppKey_1 = __importDefault(require("../models/WppKey"));
const Label_1 = __importDefault(require("../models/Label"));
const TicketLabel_1 = __importDefault(require("../models/TicketLabel"));
const Telegram_1 = __importDefault(require("../models/Telegram"));
// eslint-disable-next-line
const dbConfig = require("../config/database");
// import dbConfig from "../config/database";
const sequelize = new sequelize_typescript_1.Sequelize(dbConfig);
const models = [
    User_1.default,
    Contact_1.default,
    Ticket_1.default,
    Message_1.default,
    Whatsapp_1.default,
    ContactCustomField_1.default,
    Setting_1.default,
    Queue_1.default,
    WhatsappQueue_1.default,
    UserQueue_1.default,
    QuickAnswer_1.default,
    WppKey_1.default,
    Label_1.default,
    TicketLabel_1.default,
    Telegram_1.default
];
sequelize.addModels(models);
exports.default = sequelize;
