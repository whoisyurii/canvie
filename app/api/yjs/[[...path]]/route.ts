export const runtime = "edge";

import { NextRequest } from "next/server";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

interface WebSocketPairLike {
  0: WebSocket;
  1: WebSocket;
}

declare const WebSocketPair: { new (): WebSocketPairLike };

const messageSync = 0;
const messageAwareness = 1;

const IDLE_ROOM_TTL_MS = 1000 * 60 * 30; // 30 minutes

interface Room {
  doc: Y.Doc;
  awareness: Awareness;
  connections: Map<WebSocket, Set<number>>;
  lastActive: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

type RoomsMap = Map<string, Room>;

declare global {
  var __yjsRooms: RoomsMap | undefined;
}

const getRooms = (): RoomsMap => {
  if (!globalThis.__yjsRooms) {
    globalThis.__yjsRooms = new Map();
  }
  return globalThis.__yjsRooms;
};

const rooms = getRooms();

const getRoomIdFromRequest = (request: NextRequest): string => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/api\/yjs\/?/, "");
  return pathname.length > 0 ? decodeURIComponent(pathname) : "default";
};

const toUint8Array = async (data: unknown): Promise<Uint8Array | null> => {
  if (!data) {
    return null;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const buffer = await data.arrayBuffer();
    return new Uint8Array(buffer);
  }

  return null;
};

const ensureRoom = (roomId: string): Room => {
  const existing = rooms.get(roomId);
  if (existing) {
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer);
      existing.cleanupTimer = null;
    }
    existing.lastActive = Date.now();
    return existing;
  }

  const doc = new Y.Doc({ gc: true });
  const awareness = new Awareness(doc);
  awareness.setLocalState(null);
  const connections = new Map<WebSocket, Set<number>>();
  const room: Room = {
    doc,
    awareness,
    connections,
    lastActive: Date.now(),
    cleanupTimer: null,
  };

  const broadcastUpdate = (update: Uint8Array) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    broadcast(room, message);
  };

  doc.on("update", broadcastUpdate);

  awareness.on("update", ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    if (origin) {
      const tracked = room.connections.get(origin as WebSocket);
      if (tracked) {
        added.forEach((clientId) => tracked.add(clientId));
        removed.forEach((clientId) => tracked.delete(clientId));
      }
    }

    if (changed.length === 0) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(awareness, changed));
    broadcast(room, encoding.toUint8Array(encoder));
  });

  rooms.set(roomId, room);
  return room;
};

const destroyRoomIfIdle = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  if (room.connections.size > 0) {
    return;
  }
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
  }
  room.cleanupTimer = setTimeout(() => {
    const current = rooms.get(roomId);
    if (!current || current.connections.size > 0) {
      return;
    }
    current.doc.destroy();
    rooms.delete(roomId);
  }, IDLE_ROOM_TTL_MS);
};

const send = (room: Room, socket: WebSocket, data: Uint8Array) => {
  if (socket.readyState !== WebSocket.OPEN) {
    room.connections.delete(socket);
    return;
  }
  try {
    socket.send(data);
  } catch {
    room.connections.delete(socket);
    socket.close();
  }
};

const broadcast = (room: Room, data: Uint8Array) => {
  room.connections.forEach((_, socket) => {
    send(room, socket, data);
  });
};

const handleMessage = (room: Room, socket: WebSocket, data: Uint8Array) => {
  const decoder = decoding.createDecoder(data);
  const encoder = encoding.createEncoder();
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync: {
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket);
      if (encoding.length(encoder) > 1) {
        send(room, socket, encoding.toUint8Array(encoder));
      }
      break;
    }
    case messageAwareness: {
      const update = decoding.readVarUint8Array(decoder);
      applyAwarenessUpdate(room.awareness, update, socket);
      break;
    }
    default: {
      break;
    }
  }
};

const setupConnection = (roomId: string, socket: WebSocket) => {
  const room = ensureRoom(roomId);
  if ("binaryType" in socket) {
    try {
      (socket as WebSocket).binaryType = "arraybuffer";
    } catch {
      // Ignore environments that do not support reconfiguring the binary type.
    }
  }
  room.connections.set(socket, new Set());
  room.lastActive = Date.now();

  const sendSync = () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    send(room, socket, encoding.toUint8Array(encoder));
  };

  const sendAwareness = () => {
    const states = room.awareness.getStates();
    if (states.size === 0) {
      return;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
    send(room, socket, encoding.toUint8Array(encoder));
  };

  socket.addEventListener("message", (event) => {
    void toUint8Array(event.data).then((buffer) => {
      if (!buffer) {
        return;
      }
      handleMessage(room, socket, buffer);
    });
  });

  socket.addEventListener("close", () => {
    const tracked = room.connections.get(socket);
    room.connections.delete(socket);
    if (tracked && tracked.size > 0) {
      removeAwarenessStates(room.awareness, Array.from(tracked), socket);
    }
    destroyRoomIfIdle(roomId);
  });

  socket.addEventListener("error", () => {
    socket.close();
  });

  sendSync();
  sendAwareness();
};

const upgradeWebSocket = (request: NextRequest): { client: WebSocket; server: WebSocket } => {
  const upgradeHeader = request.headers.get("upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    throw new Error("Invalid WebSocket upgrade request");
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  if (typeof (server as any).accept === "function") {
    (server as any).accept();
  }
  return { client, server };
};

export function GET(request: NextRequest): Response {
  const roomId = getRoomIdFromRequest(request);

  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    const body = JSON.stringify({ status: "ready", roomId });
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }

  const { client, server } = upgradeWebSocket(request);
  setupConnection(roomId, server);
  return new Response(null, {
    status: 101,
    webSocket: client,
  } as unknown as ResponseInit);
}
