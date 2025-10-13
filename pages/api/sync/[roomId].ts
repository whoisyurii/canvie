import type { NextApiRequest, NextApiResponse } from "next";
import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";

const API_ROUTE_PREFIX = "/api/sync/";

export const config = {
  api: {
    bodyParser: false,
  },
};

function extractDocName(pathname: string) {
  if (!pathname.startsWith(API_ROUTE_PREFIX)) {
    return "default";
  }
  const value = pathname.slice(API_ROUTE_PREFIX.length);
  return value ? decodeURIComponent(value) : "default";
}

export default function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", ["GET"]);
    response.status(405).end("Method Not Allowed");
    return;
  }

  const server = response.socket.server as typeof response.socket.server & {
    __yjsWss?: WebSocketServer;
    __yjsUpgradeAttached?: boolean;
  };

  if (!server.__yjsWss) {
    server.__yjsWss = new WebSocketServer({ noServer: true });
  }

  if (!server.__yjsUpgradeAttached) {
    server.__yjsUpgradeAttached = true;

    server.on("upgrade", (upgradeRequest: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = upgradeRequest.url ? new URL(upgradeRequest.url, "http://localhost") : null;
      const pathname = url?.pathname ?? "";
      if (!pathname.startsWith(API_ROUTE_PREFIX)) {
        return;
      }

      const docName = extractDocName(pathname);
      server.__yjsWss!.handleUpgrade(upgradeRequest, socket, head, (ws) => {
        setupWSConnection(ws, upgradeRequest, { docName });
      });
    });
  }

  response.status(200).end("yjs websocket ready");
}
