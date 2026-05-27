import { QueryInterface } from "sequelize";

/**
 * Seed: add Zabbix integration settings.
 * These keys are managed from the Settings UI (Administration → Settings → Zabbix).
 */
module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.bulkInsert(
      "Settings",
      [
        {
          key: "zabbixEnabled",
          value: "disabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "zabbixApiUrl",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        // API Token auth (Zabbix 5.4+) — preferred
        {
          key: "zabbixApiToken",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        // User / Password auth (all Zabbix versions)
        {
          key: "zabbixApiUser",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "zabbixApiPassword",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      {}
    );
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.bulkDelete(
      "Settings",
      {
        key: [
          "zabbixEnabled",
          "zabbixApiUrl",
          "zabbixApiToken",
          "zabbixApiUser",
          "zabbixApiPassword"
        ]
      },
      {}
    );
  }
};
