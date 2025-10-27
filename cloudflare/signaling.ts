/// <reference types="@cloudflare/workers-types" />

import { SignalingRoom } from "./do_SignalingRoom";

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_ROOM_ID = "global";

interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_WS_ORIGINS?: string;
  STATS_ENABLED?: string;
  ADMIN_TOKEN?: string;
  MAX_CONNECTIONS_PER_IP?: string;
}

type AllowedOrigin = {
  protocol: string;
  hostPattern: string;
  hasWildcard: boolean;
};

function parseAllowedOrigins(value: string | undefined): AllowedOrigin[] {
  if (!value) {
    return [];
  }

  const parsed: AllowedOrigin[] = [];

  for (const entry of value.split(",")) {
    const origin = entry.trim();
    if (!origin) {
      continue;
    }

    if (origin === "*") {
      parsed.push({ protocol: "*", hostPattern: "*", hasWildcard: true });
      continue;
    }

    const separatorIndex = origin.indexOf("://");
    if (separatorIndex === -1) {
      continue;
    }

    const protocol = origin.slice(0, separatorIndex).toLowerCase();
    let hostPattern = origin.slice(separatorIndex + 3);
    const slashIndex = hostPattern.indexOf("/");
    if (slashIndex !== -1) {
      hostPattern = hostPattern.slice(0, slashIndex);
    }

    const hasWildcard = hostPattern.startsWith("*.");

    parsed.push({ protocol, hostPattern, hasWildcard });
  }

  return parsed;
}

function isOriginAllowed(originHeader: string | null, allowedOrigins: AllowedOrigin[]): boolean {
  if (allowedOrigins.length === 0) {
    return true;
  }

  if (!originHeader) {
    return false;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return false;
  }

  return allowedOrigins.some((allowed) => {
    if (allowed.protocol === "*" || `${allowed.protocol}:` === originUrl.protocol) {
      if (allowed.hostPattern === "*") {
        return true;
      }

      if (allowed.hasWildcard) {
        const suffix = allowed.hostPattern.slice(2);
        if (suffix.length === 0) {
          return false;
        }
        return (
          originUrl.hostname === suffix || originUrl.hostname.endsWith(`.${suffix}`)
        );
      }

      return originUrl.host === allowed.hostPattern || originUrl.hostname === allowed.hostPattern;
    }

    return false;
  });
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return value.toLowerCase() === "true";
}

function parseMaxConnections(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
  const headers = new Headers(request.headers);
  const clientIp = request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-forwarded-for");
  const maxConnectionsPerIp = parseMaxConnections(env.MAX_CONNECTIONS_PER_IP);

  if (clientIp) {
    headers.set("X-Client-IP", clientIp);
  }

  if (maxConnectionsPerIp !== null) {
    headers.set("X-Max-Connections-Per-IP", String(maxConnectionsPerIp));
  }

  const forwardedRequest = new Request(request, { headers });
  return await stub.fetch(forwardedRequest);
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
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_WS_ORIGINS);
    const statsEnabled = parseBoolean(env.STATS_ENABLED);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/stats") {
      if (!statsEnabled) {
        return new Response("Not found", { status: 404 });
      }

      if (env.ADMIN_TOKEN) {
        const token = request.headers.get("X-Admin-Token");
        if (!token || token !== env.ADMIN_TOKEN) {
          return new Response("unauthorized", { status: 401 });
        }
      }

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
      if (!isOriginAllowed(request.headers.get("Origin"), allowedOrigins)) {
        return new Response("origin not allowed", { status: 403 });
      }

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
