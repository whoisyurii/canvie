/// <reference types="@cloudflare/workers-types" />

// Free tier MVP settings - suitable for 30+ minute sessions
const STALE_SOCKET_TIMEOUT_MS = 600_000; // 10 minutes (increased from 60s)
const CLEANUP_INTERVAL_MS = 20_000;      // 20 seconds
const HEARTBEAT_INTERVAL_MS = 30_000;    // 30 seconds - keeps connections alive
const RATE_INTERVAL_MS = 1_000;          // 1 second
const MAX_MESSAGES_PER_INTERVAL = 120;   // 120 messages per second

interface PeerSession {
  id: string;
  socket: WebSocket;
  lastSeen: number;
  connectedAt: number; // Track connection duration for stats
  rateWindowStart: number;
  messagesInWindow: number;
  ip: string;
}

interface StatsPayload {
  roomId: string;
  peerCount: number;
  lastActivity: number;
  averageSessionDuration?: number; // Average connection duration in ms
  longestSession?: number;          // Longest active session in ms
}

export class SignalingRoom {
  private readonly state: DurableObjectState;
  private readonly peers = new Map<string, PeerSession>();
  private readonly connectionsByIp = new Map<string, number>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();
  private maxConnectionsPerIp = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/signaling" && request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request, url);
    }

    if (url.pathname === "/stats") {
      return this.handleStats();
    }

    return new Response("Not found", { status: 404 });
  }

  private handleWebSocket(request: Request, url: URL): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    this.updateMaxConnections(request);
    const clientIp = this.extractClientIp(request);

    if (!this.tryRegisterIpConnection(clientIp)) {
      return new Response("too many connections from this IP", { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    try {
      server.accept();

      const clientId = crypto.randomUUID();
      const now = Date.now();

      const session: PeerSession = {
        id: clientId,
        socket: server,
        lastSeen: now,
        connectedAt: now,
        rateWindowStart: now,
        messagesInWindow: 0,
        ip: clientIp,
      };

      this.peers.set(clientId, session);
      this.lastActivity = now;
      this.ensureCleanupTimer();
      this.ensureHeartbeatTimer();

      server.addEventListener("message", (event: MessageEvent) => {
        this.handleMessage(session, event.data);
      });

      const handleTermination = () => this.dropPeer(clientId, true);
      server.addEventListener("close", handleTermination);
      server.addEventListener("error", handleTermination);

      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      this.releaseIpConnection(clientIp);
      if (error instanceof Error) {
        return new Response(error.message, { status: 500 });
      }
      return new Response("failed to establish connection", { status: 500 });
    }
  }

  private handleStats(): Response {
    const now = Date.now();
    let totalDuration = 0;
    let longestSession = 0;

    this.peers.forEach((peer) => {
      const duration = now - peer.connectedAt;
      totalDuration += duration;
      if (duration > longestSession) {
        longestSession = duration;
      }
    });

    const payload: StatsPayload = {
      roomId: this.state.id.toString(),
      peerCount: this.peers.size,
      lastActivity: this.lastActivity,
      averageSessionDuration: this.peers.size > 0 ? totalDuration / this.peers.size : undefined,
      longestSession: this.peers.size > 0 ? longestSession : undefined,
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

    this.updateMaxConnections(request);
    const clientIp = this.extractClientIp(request);

    if (!this.tryRegisterIpConnection(clientIp)) {
      return new Response("too many connections from this IP", { status: 429 });
    }

    const clientId = url.searchParams.get("clientId") ?? crypto.randomUUID();
    const now = Date.now();

    const session: PeerSession = {
      id: clientId,
      socket: webSocket,
      lastSeen: now,
      connectedAt: now,
      rateWindowStart: now,
      messagesInWindow: 0,
      ip: clientIp,
    };

    this.peers.set(clientId, session);
    this.lastActivity = now;
    this.ensureCleanupTimer();
    this.ensureHeartbeatTimer();

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
    this.releaseIpConnection(session.ip);

    if (!fromError) {
      try {
        session.socket.close(1000, "peer left");
      } catch {
        // ignore close errors on graceful shutdown
      }
    }

    if (this.peers.size === 0) {
      this.clearCleanupTimer();
      this.clearHeartbeatTimer();
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

  private ensureHeartbeatTimer() {
    if (this.heartbeatTimer) {
      return;
    }
    // Send periodic heartbeat to all connected peers to keep connections alive
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeatTimer() {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendHeartbeat() {
    const pingMessage = JSON.stringify({ type: "ping", ts: Date.now() });
    this.peers.forEach((peer) => {
      try {
        peer.socket.send(pingMessage);
      } catch {
        // If send fails, peer will be cleaned up by sweepStalePeers
      }
    });
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
      this.clearHeartbeatTimer();
    }
  }

  private extractClientIp(request: Request): string {
    return (
      request.headers.get("X-Client-IP") ??
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("x-forwarded-for") ??
      "unknown"
    );
  }

  private updateMaxConnections(request: Request) {
    const header = request.headers.get("X-Max-Connections-Per-IP");
    if (!header) {
      return;
    }
    const parsed = Number.parseInt(header, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      this.maxConnectionsPerIp = parsed;
      if (parsed <= 0) {
        this.connectionsByIp.clear();
      }
    }
  }

  private tryRegisterIpConnection(clientIp: string): boolean {
    if (this.maxConnectionsPerIp <= 0) {
      return true;
    }

    const current = this.connectionsByIp.get(clientIp) ?? 0;
    if (current >= this.maxConnectionsPerIp) {
      return false;
    }

    this.connectionsByIp.set(clientIp, current + 1);
    return true;
  }

  private releaseIpConnection(clientIp: string) {
    const current = this.connectionsByIp.get(clientIp);
    if (current === undefined) {
      return;
    }

    if (current <= 1) {
      this.connectionsByIp.delete(clientIp);
    } else {
      this.connectionsByIp.set(clientIp, current - 1);
    }

    if (this.maxConnectionsPerIp <= 0) {
      this.connectionsByIp.delete(clientIp);
    }
  }
}
