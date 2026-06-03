import openSocket from "socket.io-client";
import { getSocketUrl } from "../config";

function connectToSocket() {
    const token = localStorage.getItem("token");
    const socket = openSocket(getSocketUrl(), {
      transports: ["websocket", "polling", "flashsocket"],
      query: {
        token: JSON.parse(token),
      },
    });

    // Before each automatic reconnect attempt, refresh the token from
    // localStorage so that an already-refreshed API token is used instead
    // of the stale one stored in the initial query object.
    socket.io.on("reconnect_attempt", () => {
      const freshToken = localStorage.getItem("token");
      if (freshToken) {
        try {
          socket.io.opts.query = { token: JSON.parse(freshToken) };
        } catch (_) {
          // ignore JSON parse errors
        }
      }
    });

    return socket;
}

export default connectToSocket;