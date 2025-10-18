/// <reference types="@cloudflare/workers-types" />

import { SignalingRoom } from "./do_SignalingRoom";

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_ROOM_ID = "global";

interface Env {
  ROOMS: DurableObjectNamespace;
}

function sanitizeRoomId(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }
  const trimmed = candidate.trim();
  return ROOM_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function resolveRoomId(request: Request, url: URL): string {
  const fromQuery = sanitizeRoomId(url.searchParams.get("roomId"));
  if (fromQuery) {
    return fromQuery;
  }

  const headerCandidate = sanitizeRoomId(request.headers.get("X-Room-Id"));
  if (headerCandidate) {
    return headerCandidate;
  }

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererQuery = sanitizeRoomId(refererUrl.searchParams.get("roomId"));
      if (refererQuery) {
        return refererQuery;
      }
      const match = refererUrl.pathname.match(/\/r\/([A-Za-z0-9_-]{1,64})/);
      if (match) {
        return match[1];
      }
    } catch {
      // ignore invalid referer headers
    }
  }

  return DEFAULT_ROOM_ID;
}

async function attachToRoom(env: Env, roomId: string, request: Request) {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  return await stub.fetch(request);
}

async function roomStats(env: Env, roomId: string) {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  const response = await stub.fetch("https://do/stats");
  if (!response.ok) {
    return new Response("failed to read room stats", { status: 502 });
  }
  const payload = await response.text();
  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/stats") {
      const requestedRoomId = sanitizeRoomId(url.searchParams.get("roomId"));
      if (!requestedRoomId) {
        return new Response("roomId required", { status: 400 });
      }
      try {
        return await roomStats(env, requestedRoomId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unable to fetch stats";
        return new Response(message, { status: 502 });
      }
    }

    if (url.pathname === "/signaling" && request.headers.get("Upgrade") === "websocket") {
      const roomId = resolveRoomId(request, url);

      try {
        return await attachToRoom(env, roomId, request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to connect";
        return new Response(message, { status: 502 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};

export { SignalingRoom };
