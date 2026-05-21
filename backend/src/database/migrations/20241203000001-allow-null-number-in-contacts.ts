import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Contacts", "number", {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Contacts", "number", {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    });
  }
};
