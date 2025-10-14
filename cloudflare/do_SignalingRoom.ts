/// <reference types="@cloudflare/workers-types" />

const STALE_SOCKET_TIMEOUT_MS = 60_000;
const CLEANUP_INTERVAL_MS = 30_000;
const decoder = new TextDecoder();

interface PeerSession {
  id: string;
  socket: WebSocket;
  topics: Set<string>;
  lastSeen: number;
}

/**
 * Durable Object that fans out y-webrtc signaling messages between peers.
 */
export class SignalingRoom {
  private readonly state: DurableObjectState;
  private readonly peers = new Map<string, PeerSession>();
  private readonly topics = new Map<string, Set<string>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId") ?? crypto.randomUUID();
    const webSocket = (request as unknown as { webSocket?: WebSocket }).webSocket;
    if (!webSocket) {
      return new Response("Missing WebSocket", { status: 400 });
    }

    this.state.acceptWebSocket(webSocket, [clientId]);
    webSocket.accept();

    const session: PeerSession = {
      id: clientId,
      socket: webSocket,
      topics: new Set<string>(),
      lastSeen: Date.now(),
    };

    this.peers.set(clientId, session);
    this.ensureCleanupTimer();

    webSocket.addEventListener("message", (event: MessageEvent) => {
      this.handleMessage(session, event.data);
    });

    const closeHandler = () => this.dropPeer(session.id);
    webSocket.addEventListener("close", closeHandler);
    webSocket.addEventListener("error", closeHandler);

    return new Response(null, { status: 101 });
  }

  private handleMessage(session: PeerSession, raw: string | ArrayBuffer | null) {
    session.lastSeen = Date.now();

    if (raw === null) {
      return;
    }

    let message: any;
    try {
      const text = typeof raw === "string" ? raw : decoder.decode(raw);
      message = JSON.parse(text);
    } catch {
      return;
    }

    if (!message || typeof message.type !== "string") {
      return;
    }

    switch (message.type) {
      case "subscribe":
        this.subscribe(session, message.topics);
        break;
      case "unsubscribe":
        this.unsubscribe(session, message.topics);
        break;
      case "publish":
        this.publish(session, message);
        break;
      case "ping":
      case "heartbeat":
        this.safeSend(session, JSON.stringify({ type: "pong", ts: Date.now() }));
        break;
      default:
        break;
    }
  }

  private subscribe(session: PeerSession, topics: unknown) {
    if (!Array.isArray(topics)) {
      return;
    }

    topics
      .map((topic) => (typeof topic === "string" ? topic : null))
      .filter((topic): topic is string => Boolean(topic))
      .forEach((topic) => {
        session.topics.add(topic);
        const subscribers = this.topics.get(topic) ?? new Set<string>();
        subscribers.add(session.id);
        this.topics.set(topic, subscribers);
      });
  }

  private unsubscribe(session: PeerSession, topics: unknown) {
    if (!Array.isArray(topics)) {
      return;
    }

    topics
      .map((topic) => (typeof topic === "string" ? topic : null))
      .filter((topic): topic is string => Boolean(topic))
      .forEach((topic) => {
        session.topics.delete(topic);
        const subscribers = this.topics.get(topic);
        if (!subscribers) {
          return;
        }
        subscribers.delete(session.id);
        if (subscribers.size === 0) {
          this.topics.delete(topic);
        }
      });
  }

  private publish(session: PeerSession, payload: any) {
    const topic = typeof payload.topic === "string" ? payload.topic : null;
    if (!topic) {
      return;
    }

    const subscribers = this.topics.get(topic);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const enriched = JSON.stringify({ ...payload, clients: subscribers.size });
    subscribers.forEach((peerId) => {
      const peer = this.peers.get(peerId);
      if (!peer) {
        return;
      }
      this.safeSend(peer, enriched);
    });
  }

  private safeSend(peer: PeerSession, data: string) {
    try {
      peer.socket.send(data);
    } catch {
      this.dropPeer(peer.id);
    }
  }

  private dropPeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }

    this.peers.delete(peerId);

    peer.topics.forEach((topic) => {
      const subscribers = this.topics.get(topic);
      if (!subscribers) {
        return;
      }
      subscribers.delete(peerId);
      if (subscribers.size === 0) {
        this.topics.delete(topic);
      }
    });

    try {
      peer.socket.close(1000, "peer disconnected");
    } catch {
      // Ignore close errors.
    }

    if (this.peers.size === 0) {
      this.clearCleanupTimer();
    }
  }

  private ensureCleanupTimer() {
    if (this.cleanupTimer) {
      return;
    }
    this.cleanupTimer = setInterval(() => this.sweepStalePeers(), CLEANUP_INTERVAL_MS);
  }

  private clearCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private sweepStalePeers() {
    const threshold = Date.now() - STALE_SOCKET_TIMEOUT_MS;
    this.peers.forEach((peer, peerId) => {
      if (peer.lastSeen < threshold) {
        this.dropPeer(peerId);
      }
    });

    if (this.peers.size === 0) {
      this.clearCleanupTimer();
    }
  }
}
