import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  HasMany,
  Default,
  AllowNull
} from "sequelize-typescript";
import Ticket from "./Ticket";

@Table
class Telegram extends Model<Telegram> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  botToken: string;

  @Default("disconnected")
  @Column
  status: string; // connected | disconnected | error

  @AllowNull(true)
  @Column
  greetingMessage: string;

  @HasMany(() => Ticket)
  tickets: Ticket[];
}

export default Telegram;
