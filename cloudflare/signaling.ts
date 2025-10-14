/// <reference types="@cloudflare/workers-types" />

import { SignalingRoom } from "./do_SignalingRoom";

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface Env {
  ROOMS: DurableObjectNamespace;
}

function sanitizeRoomId(candidate: string | null | undefined): string | null {
  if (candidate && ROOM_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return null;
}

function roomIdFromPath(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const last = segments[segments.length - 1];
    if (last !== "signaling" && ROOM_ID_PATTERN.test(last)) {
      return last;
    }
  }
  return null;
}

function roomIdFromReferer(request: Request): string | null {
  const referer = request.headers.get("Referer");
  if (!referer) {
    return null;
  }
  try {
    const refererUrl = new URL(referer);
    const queryCandidate = refererUrl.searchParams.get("roomId");
    if (queryCandidate && ROOM_ID_PATTERN.test(queryCandidate)) {
      return queryCandidate;
    }
    const match = refererUrl.pathname.match(/\/r\/([A-Za-z0-9_-]{1,64})/);
    if (match) {
      return match[1];
    }
  } catch {
    return null;
  }
  return null;
}

function resolveRoomId(request: Request, url: URL): string {
  const fromQuery = sanitizeRoomId(url.searchParams.get("roomId"));
  if (fromQuery) {
    return fromQuery;
  }
  const fromPath = sanitizeRoomId(roomIdFromPath(url));
  if (fromPath) {
    return fromPath;
  }
  const fromHeader = sanitizeRoomId(request.headers.get("X-Room-Id"));
  if (fromHeader) {
    return fromHeader;
  }
  const fromReferer = sanitizeRoomId(roomIdFromReferer(request));
  if (fromReferer) {
    return fromReferer;
  }
  return "global";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname.startsWith("/signaling") && request.headers.get("Upgrade") === "websocket") {
      const roomId = resolveRoomId(request, url);
      const clientId = crypto.randomUUID();
      const pair = new WebSocketPair();
      const client = pair[0];
      const durable = pair[1];
      if (!client || !durable) {
        return new Response("Failed to initialize WebSocket", { status: 500 });
      }
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));

      try {
        // TypeScript's RequestInit definition for workers does not expose the `webSocket`
        // property yet, so we cast through `unknown` to satisfy the compiler.
        const init = {
          method: "POST",
          headers: { Upgrade: "websocket" },
          webSocket: durable,
        } as unknown as RequestInit;
        await stub.fetch(`https://internal/${roomId}?clientId=${encodeURIComponent(clientId)}`, init);
      } catch (error) {
        try {
          durable.close(1011, "failed to reach signaling room");
        } catch {
          // ignore
        }
        return new Response("Failed to connect", { status: 500 });
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  },
};

export { SignalingRoom };
