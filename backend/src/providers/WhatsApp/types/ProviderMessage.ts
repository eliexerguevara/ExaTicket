export type MessageType =
  | "chat"
  | "audio"
  | "ptt"
  | "video"
  | "image"
  | "document"
  | "vcard"
  | "sticker"
  | "location";

export type MessageAck = 0 | 1 | 2 | 3 | 4; // PENDING, SERVER, DEVICE, READ, PLAYED

export interface ProviderMessage {
  id: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  type: MessageType;
  timestamp: number;
  from: string;
  to: string;
  hasQuotedMsg?: boolean;
  ack?: MessageAck;
}
