"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
exports.default = {
    up: (queryInterface) =>
        queryInterface.addColumn("Tickets", "splynxCustomerId", {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null
        }),
    down: (queryInterface) =>
        queryInterface.removeColumn("Tickets", "splynxCustomerId")
};
