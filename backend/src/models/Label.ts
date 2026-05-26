import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  BelongsToMany,
  Default
} from "sequelize-typescript";
import Ticket from "./Ticket";
import TicketLabel from "./TicketLabel";

@Table
class Label extends Model<Label> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Unique
  @Column
  name: string;

  @AllowNull(false)
  @Default("#6b7280")
  @Column
  color: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsToMany(() => Ticket, () => TicketLabel)
  tickets: Array<Ticket & { TicketLabel: TicketLabel }>;
}

export default Label;
