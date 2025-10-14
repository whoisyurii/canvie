/// <reference types="@cloudflare/workers-types" />

const STALE_SOCKET_TIMEOUT_MS = 60_000;
const CLEANUP_INTERVAL_MS = 20_000;
const RATE_INTERVAL_MS = 1_000;
const MAX_MESSAGES_PER_INTERVAL = 120;

interface PeerSession {
  id: string;
  socket: WebSocket;
  lastSeen: number;
  rateWindowStart: number;
  messagesInWindow: number;
}

interface StatsPayload {
  roomId: string;
  peerCount: number;
  lastActivity: number;
}

export class SignalingRoom {
  private readonly state: DurableObjectState;
  private readonly peers = new Map<string, PeerSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/attach":
        return this.handleAttach(request, url);
      case "/stats":
        return this.handleStats();
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private handleStats(): Response {
    const payload: StatsPayload = {
      roomId: this.state.id.toString(),
      peerCount: this.peers.size,
      lastActivity: this.lastActivity,
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  private handleAttach(request: Request, url: URL): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const webSocket = (request as unknown as { webSocket?: WebSocket }).webSocket;
    if (!webSocket) {
      return new Response("Missing WebSocket", { status: 400 });
    }

    const clientId = url.searchParams.get("clientId") ?? crypto.randomUUID();
    const now = Date.now();

    this.state.acceptWebSocket(webSocket, [clientId]);
    webSocket.accept();

    const session: PeerSession = {
      id: clientId,
      socket: webSocket,
      lastSeen: now,
      rateWindowStart: now,
      messagesInWindow: 0,
    };

    this.peers.set(clientId, session);
    this.lastActivity = now;
    this.ensureCleanupTimer();

    webSocket.addEventListener("message", (event: MessageEvent) => {
      this.handleMessage(session, event.data);
    });

    const handleTermination = () => this.dropPeer(clientId, true);
    webSocket.addEventListener("close", handleTermination);
    webSocket.addEventListener("error", handleTermination);

    return new Response(null, { status: 101 });
  }

  private handleMessage(session: PeerSession, data: string | ArrayBuffer | ArrayBufferView | null) {
    const now = Date.now();
    session.lastSeen = now;
    this.lastActivity = now;

    if (!this.incrementRateCounter(session, now)) {
      this.safeClose(session, 1011, "message rate exceeded");
      return;
    }

    if (data === null) {
      return;
    }

    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed === "ping") {
        this.safeSend(session, "pong");
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          if (parsed.type === "ping") {
            this.safeSend(session, JSON.stringify({ type: "pong", ts: Date.now() }));
            return;
          }
          if (parsed.type === "pong") {
            return;
          }
        }
      } catch {
        // Non-JSON payloads fall through to broadcast.
      }
    }

    this.broadcast(session.id, data);
  }

  private incrementRateCounter(session: PeerSession, now: number): boolean {
    if (now - session.rateWindowStart > RATE_INTERVAL_MS) {
      session.rateWindowStart = now;
      session.messagesInWindow = 0;
    }
    session.messagesInWindow += 1;
    return session.messagesInWindow <= MAX_MESSAGES_PER_INTERVAL;
  }

  private broadcast(senderId: string, payload: string | ArrayBuffer | ArrayBufferView) {
    this.peers.forEach((peer, peerId) => {
      if (peerId === senderId) {
        return;
      }
      const data = this.clonePayload(payload);
      if (data === null) {
        return;
      }
      this.safeSend(peer, data);
    });
  }

  private clonePayload(payload: string | ArrayBuffer | ArrayBufferView): string | ArrayBuffer | null {
    if (typeof payload === "string") {
      return payload;
    }
    if (payload instanceof ArrayBuffer) {
      return payload.slice(0);
    }
    if (ArrayBuffer.isView(payload)) {
      const view = payload as ArrayBufferView;
      const copy = new Uint8Array(view.byteLength);
      copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return copy.buffer;
    }
    return null;
  }

  private safeSend(peer: PeerSession, payload: string | ArrayBuffer) {
    try {
      peer.socket.send(payload);
    } catch {
      this.dropPeer(peer.id, true);
    }
  }

  private safeClose(peer: PeerSession, code: number, reason: string) {
    try {
      peer.socket.close(code, reason);
    } catch {
      // ignore close errors
    }
    this.dropPeer(peer.id, true);
  }

  private dropPeer(peerId: string, fromError: boolean) {
    const session = this.peers.get(peerId);
    if (!session) {
      return;
    }

    this.peers.delete(peerId);

    if (!fromError) {
      try {
        session.socket.close(1000, "peer left");
      } catch {
        // ignore close errors on graceful shutdown
      }
    }

    if (this.peers.size === 0) {
      this.clearCleanupTimer();
    }
  }

  private ensureCleanupTimer() {
    if (this.cleanupTimer) {
      return;
    }
    this.cleanupTimer = setInterval(() => {
      this.sweepStalePeers();
    }, CLEANUP_INTERVAL_MS);
  }

  private clearCleanupTimer() {
    if (!this.cleanupTimer) {
      return;
    }
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private sweepStalePeers() {
    const threshold = Date.now() - STALE_SOCKET_TIMEOUT_MS;
    this.peers.forEach((peer, peerId) => {
      if (peer.lastSeen < threshold) {
        this.safeClose(peer, 1001, "stale connection");
      }
    });

    if (this.peers.size === 0) {
      this.clearCleanupTimer();
    }
  }
}
