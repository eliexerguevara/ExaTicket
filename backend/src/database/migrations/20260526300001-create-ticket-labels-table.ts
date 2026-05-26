import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("TicketLabels", {
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      labelId: {
        type: DataTypes.INTEGER,
        references: { model: "Labels", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.addConstraint("TicketLabels", {
      fields: ["ticketId", "labelId"],
      type: "unique",
      name: "ticket_label_unique"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("TicketLabels");
  }
};
