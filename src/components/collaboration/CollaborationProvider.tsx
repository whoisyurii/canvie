"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { Awareness } from "y-protocols/awareness";
import { IndexeddbPersistence } from "y-indexeddb";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type { CanvasElement, SharedFile, Tool, User } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import { resolveCollaborationTransport } from "@/lib/collaboration/room";
import { FileSyncManager } from "@/lib/collaboration/fileSync";

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
  const fileSyncManagerRef = useRef<FileSyncManager | null>(null);
  const userIdRef = useRef<string | null>(null);
  const userColorRef = useRef<string | null>(null);
  const userNameRef = useRef<string | null>(null);
  const lastCursorUpdateRef = useRef(0);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const remoteUsersRef = useRef(new Map<string, User>());
  const removalTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const previousRoomIdRef = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [debugStats, setDebugStats] = useState<DebugStats>(INITIAL_DEBUG_STATS);
  const transport = resolveCollaborationTransport();

  // Initialize user data only on client to prevent hydration mismatch
  if (typeof window !== "undefined") {
    if (userIdRef.current === null) {
      userIdRef.current = nanoid();
    }
    if (userColorRef.current === null) {
      userColorRef.current = generateRandomColor();
    }
    if (userNameRef.current === null) {
      userNameRef.current = `Guest ${Math.floor(Math.random() * 99) + 1}`.padStart(8, "0");
    }
  }

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
    setRoomId(roomId);
    if (typeof window !== "undefined") {
      const origin = window.location?.origin ?? "";
      const inviteUrl = origin && roomId ? `${origin}/r/${roomId}` : window.location.href;
      setShareUrl(inviteUrl);
    } else {
      setShareUrl(null);
    }

    return () => {
      setRoomId(null);
      setShareUrl(null);
    };
  }, [roomId, setRoomId, setShareUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (ydocRef.current && previousRoomIdRef.current === roomId) {
      return;
    }

    previousRoomIdRef.current = roomId;
    setConnectionStatus("connecting");
    if (IS_DEV) {
      setDebugStats(INITIAL_DEBUG_STATS);
    }

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
          id: userIdRef.current ?? "",
          name: userNameRef.current ?? "Guest",
          color: userColorRef.current ?? "#888888",
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

    let webrtcProvider: WebrtcProvider | null = null;
    const appendRoomToSignalingUrl = (url: string) => {
      if (typeof window === "undefined") {
        return url;
      }

      try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.pathname.endsWith("/signaling")) {
          parsed.searchParams.set("roomId", roomId);
          return parsed.toString();
        }
      } catch {
        if (url.includes("/signaling")) {
          const separator = url.includes("?") ? "&" : "?";
          return `${url}${separator}roomId=${encodeURIComponent(roomId)}`;
        }
        return url;
      }

      return url;
    };

    const setupWebrtcProvider = () => {
      if (transport !== "webrtc") {
        console.error(`[CollaborationProvider] Unsupported transport "${transport}".`);
        return;
      }

      const signalingEnv = process.env.NEXT_PUBLIC_WEBRTC_SIGNALING_URLS ?? "";
      const signaling = signalingEnv
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
      const enrichedSignaling = signaling.map(appendRoomToSignalingUrl);
      const password = process.env.NEXT_PUBLIC_WEBRTC_ROOM_KEY?.trim();

      webrtcProvider = new WebrtcProvider(roomId, ydoc, {
        awareness,
        signaling: enrichedSignaling.length > 0 ? enrichedSignaling : undefined,
        password: password && password.length > 0 ? password : undefined,
      });

      webrtcProviderRef.current = webrtcProvider;
      setLocalState();

      if (IS_DEV) {
        console.info("[CollaborationProvider] WebRTC provider initialized", {
          roomId,
          signaling: signaling.length > 0 ? signaling : "default",
        });
      }

      const statusHandler = (event: { status: "connected" | "disconnected" }) => {
        setConnectionStatus(event.status === "connected" ? "connected" : "disconnected");
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
        persistence = new IndexeddbPersistence(`realitea-canvas-${roomId}`, ydoc);
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
      fileSyncManager: null, // Will be set after WebRTC provider is ready
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
        id: userIdRef.current ?? "",
        name: userNameRef.current ?? "Guest",
        color: userColorRef.current ?? "#888888",
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

    // Initialize file sync manager for P2P file sharing
    let fileSyncManager: FileSyncManager | null = null;
    if (webrtcProviderRef.current && awarenessInstance) {
      fileSyncManager = new FileSyncManager(awarenessInstance, webrtcProviderRef.current, {
        onFileAvailable: (fileId) => {
          if (IS_DEV) {
            console.info(`[FileSync] File ${fileId} now available`);
          }
        },
        onFileDownloadStart: (fileId) => {
          if (IS_DEV) {
            console.info(`[FileSync] Starting download of ${fileId}`);
          }
        },
        onFileDownloadProgress: (fileId, progress, total) => {
          if (IS_DEV) {
            console.info(`[FileSync] ${fileId}: ${progress}/${total}`);
          }
        },
        onFileDownloadComplete: (fileId) => {
          if (IS_DEV) {
            console.info(`[FileSync] Download complete: ${fileId}`);
          }
        },
        onFileDownloadError: (fileId, error) => {
          console.error(`[FileSync] Error downloading ${fileId}:`, error);
        },
      });

      fileSyncManagerRef.current = fileSyncManager;

      // Update collaboration binding with file sync manager
      setCollaboration({
        ydoc,
        elements: yElements,
        files: yFiles,
        historyEntries: yHistoryEntries,
        historyMeta: yHistoryMeta,
        fileSyncManager,
      });

      // Listen for file transfer messages in awareness
      const fileMessageHandler = () => {
        const state = awarenessInstance.getLocalState() as any;
        const allStates = awarenessInstance.getStates();

        allStates.forEach((peerState: any, clientId: number) => {
          if (clientId === awarenessInstance.clientID) {
            return;
          }

          const fileMessage = peerState?._fileMessage;
          if (fileMessage && fileMessage.targetPeer === awarenessInstance.clientID.toString()) {
            fileSyncManager?.handleIncomingMessage(fileMessage);
          }
        });
      };

      awarenessInstance.on("change", fileMessageHandler);
    }

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

      awarenessInstance.off("change", awarenessChangeHandler);
      yElements.unobserve(syncElements);
      yFiles.unobserve(syncFiles);
      yHistoryEntries.unobserve(syncHistory);
      yHistoryMeta.unobserve(syncHistory);

      // Cleanup file sync manager
      if (fileSyncManagerRef.current) {
        fileSyncManagerRef.current.cleanup();
        fileSyncManagerRef.current = null;
      }

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
    roomId,
    setCollaboration,
    setElementsFromDoc,
    setUploadedFilesFromDoc,
    setHistoryFromDoc,
    setUsers,
    setCurrentUser,
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
              <dd className="font-mono">{roomId}</dd>
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
              <dt className="text-muted-foreground">Peers</dt>
              <dd className="font-mono">{Number.isFinite(debugStats.peers) ? debugStats.peers : 0}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Updates</dt>
              <dd className="font-mono">{Number.isFinite(debugStats.updates) ? debugStats.updates : 0}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Awareness</dt>
              <dd className="font-mono">{Number.isFinite(debugStats.awarenessChanges) ? debugStats.awarenessChanges : 0}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </>
  );
};
