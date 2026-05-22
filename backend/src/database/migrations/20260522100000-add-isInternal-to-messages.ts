import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Messages", "isInternal", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "isInternal");
  },
};
