import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "aiActive", {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    });
    await queryInterface.addColumn("Tickets", "aiAttempts", {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "aiActive");
    await queryInterface.removeColumn("Tickets", "aiAttempts");
  }
};
