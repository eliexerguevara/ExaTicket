import {
  Table,
  Column,
  Model,
  ForeignKey,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Label from "./Label";
import Ticket from "./Ticket";

@Table
class TicketLabel extends Model<TicketLabel> {
  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @ForeignKey(() => Label)
  @Column
  labelId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TicketLabel;
