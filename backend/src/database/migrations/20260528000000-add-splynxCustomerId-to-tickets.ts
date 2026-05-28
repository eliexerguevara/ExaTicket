import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: (queryInterface: QueryInterface) =>
    queryInterface.addColumn("Tickets", "splynxCustomerId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    }),

  down: (queryInterface: QueryInterface) =>
    queryInterface.removeColumn("Tickets", "splynxCustomerId")
};
