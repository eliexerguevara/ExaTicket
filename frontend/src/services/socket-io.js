import openSocket from "socket.io-client";
import { getSocketUrl } from "../config";

function connectToSocket() {
    const token = localStorage.getItem("token");
    return openSocket(getSocketUrl(), {
      transports: ["websocket", "polling", "flashsocket"],
      query: {
        token: JSON.parse(token),
      },
    });
}

export default connectToSocket;