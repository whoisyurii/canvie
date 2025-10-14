"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import type { SignalingConn } from "y-webrtc";
import { Awareness } from "y-protocols/awareness";
import { IndexeddbPersistence } from "y-indexeddb";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type { CanvasElement, SharedFile, Tool, User } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import { resolveCollaborationTransport, validateRoomId } from "@/lib/collaboration/room";

interface CollaborationProviderProps {
  roomId: string;
  children: React.ReactNode;
}

const generateRandomColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 50%)`;
};

const CURSOR_THROTTLE_MS = 40;
const CURSOR_FADE_MS = 4000;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const DEFAULT_SIGNALING_URLS = ["wss://y-webrtc-eu.fly.dev"];

interface ParsedSignalingConfig {
  urls: string[];
  rejected: string[];
  usedFallback: boolean;
}

const normalizeSignalingUrl = (value: string): string | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const isSecureContext =
      typeof window !== "undefined" ? window.location.protocol === "https:" : process.env.NODE_ENV !== "development";

    if (protocol === "ws:") {
      if (isSecureContext) {
        return null;
      }
    } else if (protocol !== "wss:") {
      return null;
    }

    parsed.hash = "";
    const normalized = parsed.href.replace(/\/$/, "");
    return normalized;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[CollaborationProvider] Invalid signaling URL skipped", value, error);
    }
    return null;
  }
};

const parseSignalingConfig = (): ParsedSignalingConfig => {
  const raw = process.env.NEXT_PUBLIC_WEBRTC_SIGNALING_URLS ?? "";
  const candidates = raw
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  const seen = new Set<string>();
  const accepted: string[] = [];
  const rejected: string[] = [];

  candidates.forEach((candidate) => {
    const normalized = normalizeSignalingUrl(candidate);
    if (!normalized) {
      rejected.push(candidate);
      return;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      accepted.push(normalized);
    }
  });

  if (rejected.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn("[CollaborationProvider] Ignored signaling URLs", rejected);
  }

  if (accepted.length === 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      "[CollaborationProvider] NEXT_PUBLIC_WEBRTC_SIGNALING_URLS is empty; falling back to public signaling. Configure dedicated servers for production reliability.",
    );
  }

  return {
    urls: accepted.length > 0 ? accepted : DEFAULT_SIGNALING_URLS,
    rejected,
    usedFallback: accepted.length === 0,
  };
};

const parseIceServers = (): RTCIceServer[] => {
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("ICE servers configuration must be a JSON array.");
    }

    return parsed.filter((entry): entry is RTCIceServer => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const candidate = entry as RTCIceServer;
      return typeof candidate.urls === "string" || Array.isArray(candidate.urls);
    });
  } catch (error) {
    console.warn("[CollaborationProvider] Failed to parse NEXT_PUBLIC_ICE_SERVERS", error);
    return [];
  }
};

const formatRelativeTime = (timestamp: number | null): string => {
  if (!timestamp) {
    return "—";
  }

  const delta = Date.now() - timestamp;
  if (delta < 1000) {
    return "just now";
  }
  if (delta < 60_000) {
    return `${Math.round(delta / 1000)}s ago`;
  }
  if (delta < 3_600_000) {
    return `${Math.round(delta / 60_000)}m ago`;
  }
  return `${Math.round(delta / 3_600_000)}h ago`;
};

const buildRemoteUser = (params: {
  id: string;
  name?: string;
  color?: string;
  cursorX?: number;
  cursorY?: number;
  tool?: Tool;
  strokeColor?: string;
  isConnected?: boolean;
}): User => ({
  id: params.id,
  name: params.name ?? "Guest",
  color: params.color ?? "#888888",
  cursorX: params.cursorX ?? 0,
  cursorY: params.cursorY ?? 0,
  tool: params.tool,
  strokeColor: params.strokeColor,
  isConnected: params.isConnected ?? true,
  lastActive: Date.now(),
});

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface SignalingDiagnostic {
  url: string;
  status: ConnectionStatus;
  lastMessage: number | null;
  retries: number;
}

interface DebugStats {
  updates: number;
  awarenessChanges: number;
  peers: number;
}

const INITIAL_DEBUG_STATS: DebugStats = {
  updates: 0,
  awarenessChanges: 0,
  peers: 0,
};

const IS_DEV = process.env.NODE_ENV === "development";

export const CollaborationProvider = ({ roomId, children }: CollaborationProviderProps) => {
  const ydocRef = useRef<Y.Doc | null>(null);
  const webrtcProviderRef = useRef<WebrtcProvider | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const userIdRef = useRef(nanoid());
  const userColorRef = useRef(generateRandomColor());
  const userNameRef = useRef(
    `Guest ${Math.floor(Math.random() * 99) + 1}`.padStart(8, "0"),
  );
  const lastCursorUpdateRef = useRef(0);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const remoteUsersRef = useRef(new Map<string, User>());
  const removalTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const previousRoomIdRef = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [debugStats, setDebugStats] = useState<DebugStats>(INITIAL_DEBUG_STATS);
  const [signalingDiagnostics, setSignalingDiagnostics] = useState<SignalingDiagnostic[]>([]);
  const [lastStatusChangeAt, setLastStatusChangeAt] = useState<number | null>(null);
  const transport = resolveCollaborationTransport();
  const signalingConfig = useMemo(() => parseSignalingConfig(), []);
  const signalingUrls = signalingConfig.urls;
  const isUsingFallbackSignalers = signalingConfig.usedFallback;
  const iceServers = useMemo(() => parseIceServers(), []);
  const sanitizedRoomId = useMemo(() => validateRoomId(roomId) ?? null, [roomId]);
  const signalingTeardownRef = useRef<(() => void)[]>([]);
  const combinedSignalingRows = useMemo(() => {
    const byUrl = new Map(signalingDiagnostics.map((entry) => [entry.url, entry]));
    const rows: SignalingDiagnostic[] = signalingUrls.map((url) => {
      const diagnostic = byUrl.get(url);
      if (diagnostic) {
        return diagnostic;
      }
      return {
        url,
        status: "connecting",
        lastMessage: null,
        retries: 0,
      };
    });

    signalingDiagnostics.forEach((entry) => {
      if (!signalingUrls.includes(entry.url)) {
        rows.push(entry);
      }
    });

    return rows;
  }, [signalingDiagnostics, signalingUrls]);

  const setUsers = useWhiteboardStore((state) => state.setUsers);
  const setCollaboration = useWhiteboardStore((state) => state.setCollaboration);
  const setElementsFromDoc = useWhiteboardStore((state) => state.setElementsFromDoc);
  const setUploadedFilesFromDoc = useWhiteboardStore((state) => state.setUploadedFilesFromDoc);
  const setHistoryFromDoc = useWhiteboardStore((state) => state.setHistoryFromDoc);
  const setCurrentUser = useWhiteboardStore((state) => state.setCurrentUser);
  const setRoomId = useWhiteboardStore((state) => state.setRoomId);
  const setShareUrl = useWhiteboardStore((state) => state.setShareUrl);
  const activeTool = useWhiteboardStore((state) => state.activeTool);
  const strokeColor = useWhiteboardStore((state) => state.strokeColor);

  useEffect(() => {
    if (!IS_DEV || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem("log", "y-webrtc");
    } catch (error) {
      console.warn("[CollaborationProvider] Failed to enable y-webrtc debug logging", error);
    }
  }, []);

  useEffect(() => {
    if (!sanitizedRoomId) {
      setRoomId(null);
      setShareUrl(null);
      return () => {
        setRoomId(null);
        setShareUrl(null);
      };
    }

    setRoomId(sanitizedRoomId);
    if (typeof window !== "undefined") {
      const origin = window.location?.origin ?? "";
      const inviteUrl = origin ? `${origin}/r/${sanitizedRoomId}` : window.location.href;
      setShareUrl(inviteUrl);
    } else {
      setShareUrl(null);
    }

    return () => {
      setRoomId(null);
      setShareUrl(null);
    };
  }, [sanitizedRoomId, setRoomId, setShareUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!sanitizedRoomId) {
      setConnectionStatus("disconnected");
      setCollaboration(null);
      setUsers([]);
      setElementsFromDoc([]);
      setUploadedFilesFromDoc([]);
      setHistoryFromDoc([[]], 0);
      setCurrentUser(null);
      setSignalingDiagnostics([]);
      return;
    }

    if (ydocRef.current && previousRoomIdRef.current === sanitizedRoomId) {
      return;
    }

    previousRoomIdRef.current = sanitizedRoomId;
    setConnectionStatus("connecting");
    setLastStatusChangeAt(Date.now());
    if (IS_DEV) {
      setDebugStats(INITIAL_DEBUG_STATS);
    }
    setSignalingDiagnostics([]);

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const awareness = new Awareness(ydoc);
    awarenessRef.current = awareness;

    const awarenessInstance = awarenessRef.current;
    if (!awarenessInstance) {
      return () => undefined;
    }

    const setLocalState = (overrides: Record<string, unknown> = {}) => {
      const { activeTool: currentTool, strokeColor: currentStrokeColor } = useWhiteboardStore.getState();
      const next = {
        user: {
          id: userIdRef.current,
          name: userNameRef.current,
          color: userColorRef.current,
          cursorX: 0,
          cursorY: 0,
          cursor: { x: 0, y: 0 },
          tool: currentTool,
          strokeColor: currentStrokeColor,
          lastUpdated: Date.now(),
          ...overrides,
        },
      };
      awarenessInstance.setLocalState(next);
    };

    const createDiagnostic = (conn: SignalingConn): SignalingDiagnostic => ({
      url: conn.url,
      status: conn.connected ? "connected" : conn.connecting ? "connecting" : "disconnected",
      lastMessage:
        typeof conn.lastMessageReceived === "number" && Number.isFinite(conn.lastMessageReceived) && conn.lastMessageReceived > 0
          ? conn.lastMessageReceived
          : null,
      retries: typeof conn.unsuccessfulReconnects === "number" ? conn.unsuccessfulReconnects : 0,
    });

    const updateSignalingState = (provider: WebrtcProvider | null) => {
      if (!provider) {
        setSignalingDiagnostics([]);
        return;
      }

      const diagnostics = provider.signalingConns.map((conn) => createDiagnostic(conn));
      setSignalingDiagnostics(diagnostics);
    };

    const attachSignalingListeners = (provider: WebrtcProvider | null) => {
      signalingTeardownRef.current.forEach((dispose) => dispose());
      signalingTeardownRef.current = [];

      if (!provider) {
        setSignalingDiagnostics([]);
        return;
      }

      const disposers = provider.signalingConns.map((conn) => {
        const handler = () => updateSignalingState(provider);
        conn.on("connect", handler);
        conn.on("disconnect", handler);
        conn.on("message", handler);
        return () => {
          conn.off("connect", handler);
          conn.off("disconnect", handler);
          conn.off("message", handler);
        };
      });

      signalingTeardownRef.current = disposers;
      updateSignalingState(provider);
    };

    let webrtcProvider: WebrtcProvider | null = null;
    const setupWebrtcProvider = () => {
      if (transport !== "webrtc") {
        console.error(`[CollaborationProvider] Unsupported transport "${transport}".`);
        return;
      }

      const password = process.env.NEXT_PUBLIC_WEBRTC_ROOM_KEY?.trim();

      const webrtcOptions: Parameters<typeof WebrtcProvider>[2] = {
        awareness,
        signaling: signalingUrls,
        password: password && password.length > 0 ? password : undefined,
      };

      if (iceServers.length > 0) {
        webrtcOptions.peerOpts = { config: { iceServers } };
      }

      webrtcProvider = new WebrtcProvider(sanitizedRoomId, ydoc, webrtcOptions);

      webrtcProviderRef.current = webrtcProvider;
      setLocalState();
      attachSignalingListeners(webrtcProvider);

      if (IS_DEV) {
        console.info("[CollaborationProvider] WebRTC provider initialized", {
          roomId: sanitizedRoomId,
          signaling: signalingUrls,
          iceServersConfigured: iceServers.length,
          usingFallbackSignalers: isUsingFallbackSignalers,
        });
      }

      const statusHandler = (event: { status: "connected" | "disconnected" }) => {
        setConnectionStatus(event.status === "connected" ? "connected" : "disconnected");
        setLastStatusChangeAt(Date.now());
        updateSignalingState(webrtcProvider);
        if (IS_DEV) {
          console.info(`[CollaborationProvider] transport status: ${event.status}`);
        }
      };

      const peersHandler = (event: { webrtcPeers: Map<number, unknown>; bcPeers: Set<number> }) => {
        if (IS_DEV) {
          const peerCount = event.webrtcPeers.size + event.bcPeers.size;
          console.info("[CollaborationProvider] peer update", {
            webrtcPeers: event.webrtcPeers.size,
            broadcastPeers: event.bcPeers.size,
          });
          setDebugStats((stats) => ({ ...stats, peers: peerCount }));
        }
      };

      webrtcProvider.on("status", statusHandler);
      webrtcProvider.on("peers", peersHandler);

      return () => {
        setConnectionStatus("disconnected");
        setLastStatusChangeAt(Date.now());
        attachSignalingListeners(null);
        if (webrtcProvider) {
          webrtcProvider.off("status", statusHandler);
          webrtcProvider.off("peers", peersHandler);
        }
      };
    };

    const teardownTransport = setupWebrtcProvider();

    let persistence: IndexeddbPersistence | null = null;
    let persistenceError: unknown = null;

    if (typeof indexedDB !== "undefined") {
      try {
        persistence = new IndexeddbPersistence(`realitea-canvas-${sanitizedRoomId}`, ydoc);
        persistenceRef.current = persistence;
      } catch (error) {
        persistenceError = error;
        persistenceRef.current = null;
      }
    } else {
      persistenceError = new Error("IndexedDB is not available in this environment.");
      persistenceRef.current = null;
    }

    const yElements = ydoc.getArray<CanvasElement>("elements");
    const yFiles = ydoc.getArray<SharedFile>("files");
    const yHistoryEntries = ydoc.getArray<CanvasElement[]>("historyEntries");
    const yHistoryMeta = ydoc.getMap("historyMeta");
    if (!yHistoryMeta.has("index")) {
      const initialIndex = yHistoryEntries.length > 0 ? yHistoryEntries.length - 1 : 0;
      yHistoryMeta.set("index", initialIndex);
    }

    setCollaboration({
      ydoc,
      elements: yElements,
      files: yFiles,
      historyEntries: yHistoryEntries,
      historyMeta: yHistoryMeta,
    });

    const syncElements = () => {
      setElementsFromDoc(clone(yElements.toArray()));
    };
    const syncFiles = () => {
      setUploadedFilesFromDoc(clone(yFiles.toArray()));
    };
    const syncHistory = () => {
      const entries = yHistoryEntries
        .toArray()
        .map((entry) => clone(entry as CanvasElement[]));
      const index = (yHistoryMeta.get("index") as number | undefined) ?? (entries.length > 0 ? entries.length - 1 : 0);
      setHistoryFromDoc(entries, index);
    };

    const runFullSync = () => {
      syncElements();
      syncFiles();
      syncHistory();
    };

    runFullSync();

    if (persistence) {
      persistence
        .whenSynced
        .then(runFullSync)
        .catch(() => {
          // Ignore IndexedDB sync errors; the observers will continue to receive
          // updates from connected peers.
        });
    } else if (persistenceError) {
      console.warn(
        "[CollaborationProvider] IndexedDB persistence disabled; falling back to peer updates only.",
        persistenceError,
      );
    }

    yElements.observe(syncElements);
    yFiles.observe(syncFiles);
    yHistoryEntries.observe(syncHistory);
    yHistoryMeta.observe(syncHistory);

    setLocalState();
    setCurrentUser(
      buildRemoteUser({
        id: userIdRef.current,
        name: userNameRef.current,
        color: userColorRef.current,
        cursorX: 0,
        cursorY: 0,
      }),
    );

    const cleanupTimers = removalTimersRef.current;
    const remoteUsers = remoteUsersRef.current;

    const publishUsers = () => {
      const now = Date.now();
      const visibleUsers = Array.from(remoteUsers.values()).filter((user) => {
        if (user.isConnected) {
          return true;
        }
        return now - user.lastActive < CURSOR_FADE_MS;
      });
      setUsers(visibleUsers);
    };

    const scheduleRemoval = (id: string) => {
      if (cleanupTimers.has(id)) {
        clearTimeout(cleanupTimers.get(id)!);
      }
      const timeout = setTimeout(() => {
        cleanupTimers.delete(id);
        const existing = remoteUsers.get(id);
        if (existing && !existing.isConnected && Date.now() - existing.lastActive >= CURSOR_FADE_MS) {
          remoteUsers.delete(id);
          publishUsers();
        }
      }, CURSOR_FADE_MS);
      cleanupTimers.set(id, timeout);
    };

    const awarenessChangeHandler = () => {
      const states = awarenessInstance.getStates();
      const connectedIds = new Set<string>();

      states.forEach((state: any) => {
        const user = state?.user;
        if (!user || user.id === userIdRef.current) {
          return;
        }

        connectedIds.add(user.id);
        const nextUser = buildRemoteUser({
          id: user.id,
          name: user.name,
          color: user.color,
          cursorX: user.cursor?.x ?? user.cursorX,
          cursorY: user.cursor?.y ?? user.cursorY,
          tool: user.tool as Tool | undefined,
          strokeColor: user.strokeColor,
          isConnected: true,
        });
        remoteUsers.set(user.id, nextUser);
        if (cleanupTimers.has(user.id)) {
          clearTimeout(cleanupTimers.get(user.id)!);
          cleanupTimers.delete(user.id);
        }
      });

      remoteUsers.forEach((existing, id) => {
        if (!connectedIds.has(id) && existing.isConnected) {
          const fadedUser = { ...existing, isConnected: false, lastActive: Date.now() };
          remoteUsers.set(id, fadedUser);
          scheduleRemoval(id);
        }
      });

      publishUsers();
      if (IS_DEV) {
        setDebugStats((stats) => ({ ...stats, awarenessChanges: stats.awarenessChanges + 1 }));
      }
    };

    awarenessInstance.on("change", awarenessChangeHandler);

    const updateHandler = () => {
      if (IS_DEV) {
        setDebugStats((stats) => ({ ...stats, updates: stats.updates + 1 }));
      }
    };

    ydoc.on("update", updateHandler);

    const flushCursorUpdate = () => {
      const coords = pendingCursorRef.current;
      if (!coords) {
        return;
      }
      const currentState = awarenessInstance.getLocalState();
      if (!currentState?.user) {
        return;
      }
      pendingCursorRef.current = null;
      const nextUserState = {
        ...currentState.user,
        cursorX: coords.x,
        cursorY: coords.y,
        cursor: { x: coords.x, y: coords.y },
        lastUpdated: Date.now(),
      };
      awarenessInstance.setLocalState({
        user: nextUserState,
      });
      setCurrentUser(
        buildRemoteUser({
          id: nextUserState.id,
          name: nextUserState.name,
          color: nextUserState.color,
          cursorX: nextUserState.cursorX,
          cursorY: nextUserState.cursorY,
          tool: nextUserState.tool as Tool | undefined,
          strokeColor: nextUserState.strokeColor,
        }),
      );
      lastCursorUpdateRef.current = performance.now();
    };

    const handleMouseMove = (event: MouseEvent) => {
      pendingCursorRef.current = { x: event.clientX, y: event.clientY };
      const now = performance.now();
      const elapsed = now - lastCursorUpdateRef.current;

      if (elapsed >= CURSOR_THROTTLE_MS) {
        flushCursorUpdate();
      } else if (!cursorTimeoutRef.current) {
        cursorTimeoutRef.current = setTimeout(() => {
          cursorTimeoutRef.current = null;
          flushCursorUpdate();
        }, CURSOR_THROTTLE_MS - elapsed);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
        cursorTimeoutRef.current = null;
      }

      signalingTeardownRef.current.forEach((dispose) => dispose());
      signalingTeardownRef.current = [];
      setSignalingDiagnostics([]);

      awarenessInstance.off("change", awarenessChangeHandler);
      yElements.unobserve(syncElements);
      yFiles.unobserve(syncFiles);
      yHistoryEntries.unobserve(syncHistory);
      yHistoryMeta.unobserve(syncHistory);

      cleanupTimers.forEach((timeout) => clearTimeout(timeout));
      cleanupTimers.clear();
      remoteUsers.clear();
      setUsers([]);
      setElementsFromDoc([]);
      setUploadedFilesFromDoc([]);
      setHistoryFromDoc([[]], 0);
      setCollaboration(null);
      setCurrentUser(null);
      webrtcProviderRef.current = null;
      awarenessRef.current = null;
      ydocRef.current = null;
      const persistenceInstance = persistenceRef.current;
      persistenceRef.current = null;
      previousRoomIdRef.current = null;

      if (teardownTransport) {
        teardownTransport();
      }
      if (webrtcProvider) {
        webrtcProvider.destroy();
      }
      ydoc.off("update", updateHandler);
      ydoc.destroy();
      if (persistenceInstance) {
        persistenceInstance.destroy();
      }
    };
  }, [
    sanitizedRoomId,
    setCollaboration,
    setElementsFromDoc,
    setUploadedFilesFromDoc,
    setHistoryFromDoc,
    setUsers,
    setCurrentUser,
    signalingUrls,
    iceServers,
    isUsingFallbackSignalers,
    transport,
  ]);

  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness) {
      return;
    }
    const currentState = awareness.getLocalState();
    if (!currentState?.user) {
      return;
    }

    const updatedUser = {
      ...currentState.user,
      tool: activeTool,
      strokeColor,
    };
    awareness.setLocalState({
      user: updatedUser,
    });
    const existing = useWhiteboardStore.getState().currentUser;
    if (existing) {
      setCurrentUser({ ...existing, tool: activeTool, strokeColor });
    }
  }, [activeTool, setCurrentUser, strokeColor]);

  return (
    <>
      {children}
      {IS_DEV ? (
        <div className="fixed bottom-4 left-4 z-[100] max-w-xs rounded-md border border-border/60 bg-background/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
          <p className="font-semibold">Collaboration Debug</p>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Room</dt>
              <dd className="font-mono">{sanitizedRoomId ?? roomId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Transport</dt>
              <dd className="font-medium capitalize">{transport}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium capitalize">{connectionStatus}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Last change</dt>
              <dd className="font-mono">{formatRelativeTime(lastStatusChangeAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Peers</dt>
              <dd className="font-mono">{debugStats.peers}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Updates</dt>
              <dd className="font-mono">{debugStats.updates}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Awareness</dt>
              <dd className="font-mono">{debugStats.awarenessChanges}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">ICE</dt>
              <dd className="font-medium">{iceServers.length > 0 ? `${iceServers.length} servers` : "none"}</dd>
            </div>
          </dl>
          <div className="mt-3 border-t border-border/50 pt-2">
            <p className="font-semibold">Signaling</p>
            <p className="text-[11px] text-muted-foreground">
              {signalingUrls.length} endpoint{signalingUrls.length === 1 ? "" : "s"}
              {isUsingFallbackSignalers ? " (public fallback)" : ""}
            </p>
            <ul className="mt-2 space-y-2">
              {combinedSignalingRows.length > 0 ? (
                combinedSignalingRows.map((row) => (
                  <li key={row.url} className="rounded-md border border-border/40 p-2">
                    <p className="truncate font-mono text-[11px]">{row.url}</p>
                    <div className="mt-1 flex flex-wrap justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="capitalize">{row.status}</span>
                      <span>last {formatRelativeTime(row.lastMessage)}</span>
                      <span>retries {row.retries}</span>
                    </div>
                  </li>
                ))
              ) : (
                <li className="rounded-md border border-dashed border-border/40 p-2 text-[11px] text-muted-foreground">
                  Awaiting signaling activity
                </li>
              )}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Debug logs: localStorage.log = 'y-webrtc'</p>
          </div>
        </div>
      ) : null}
    </>
  );
};
