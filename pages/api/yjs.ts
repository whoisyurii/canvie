import type { NextApiRequest } from "next";
import type { NextApiResponse } from "next";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";

const WS_PATH_PREFIX = "/api/yjs";

const getOrCreateWSS = (res: NextApiResponse) => {
  const server = res.socket?.server as any;
  if (!server) {
    throw new Error("WebSocket server is not available on this platform.");
  }

  if (!server.wss) {
    const wss = new WebSocketServer({ noServer: true });
    server.wss = wss;

    server.on("upgrade", (request: any, socket: any, head: Buffer) => {
      const { pathname } = new URL(request.url ?? "", `http://${request.headers.host}`);
      if (!pathname.startsWith(WS_PATH_PREFIX)) {
        return;
      }

      const room = decodeURIComponent(pathname.slice(WS_PATH_PREFIX.length).replace(/^\//, "")) || "default";

      wss.handleUpgrade(request, socket, head, (ws: any) => {
        console.info(`[api/yjs] client joined room "${room}"`);
        setupWSConnection(ws, request, { docName: room, gc: true });
      });
    });
  }

  return server.wss;
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    getOrCreateWSS(res);
    res.status(200).end("ready");
  } catch (error) {
    console.error("[api/yjs] Failed to initialize WebSocket server", error);
    res.status(500).end("WebSocket server unavailable");
  }
}
