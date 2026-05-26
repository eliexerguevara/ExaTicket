import { QueryInterface } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.bulkInsert(
      "Settings",
      [
        {
          key: "splynxEnabled",
          value: "disabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "splynxApiUrl",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "splynxApiKey",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "splynxApiSecret",
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
        key: ["splynxEnabled", "splynxApiUrl", "splynxApiKey", "splynxApiSecret"]
      },
      {}
    );
  }
};
