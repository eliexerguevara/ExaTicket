import { QueryInterface } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.bulkInsert(
      "Settings",
      [
        {
          key: "uispEnabled",
          value: "disabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "uispApiUrl",
          value: "",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "uispApiKey",
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
      { key: ["uispEnabled", "uispApiUrl", "uispApiKey"] },
      {}
    );
  }
};
