"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type { CanvasElement, SharedFile, Tool, User } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";

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

export const CollaborationProvider = ({ roomId, children }: CollaborationProviderProps) => {
  const ydocRef = useRef<Y.Doc>();
  const providerRef = useRef<WebrtcProvider>();
  const userIdRef = useRef(nanoid());
  const userColorRef = useRef(generateRandomColor());
  const userNameRef = useRef(
    `Guest ${Math.floor(Math.random() * 99) + 1}`.padStart(8, "0"),
  );
  const lastCursorUpdateRef = useRef(0);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const remoteUsersRef = useRef(new Map<string, User>());
  const removalTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const previousRoomIdRef = useRef<string>();

  const {
    setUsers,
    setCollaboration,
    setElementsFromDoc,
    setUploadedFilesFromDoc,
    setHistoryFromDoc,
    setCurrentUser,
  } = useWhiteboardStore((state) => ({
    setUsers: state.setUsers,
    setCollaboration: state.setCollaboration,
    setElementsFromDoc: state.setElementsFromDoc,
    setUploadedFilesFromDoc: state.setUploadedFilesFromDoc,
    setHistoryFromDoc: state.setHistoryFromDoc,
    setCurrentUser: state.setCurrentUser,
  }));
  const activeTool = useWhiteboardStore((state) => state.activeTool);
  const strokeColor = useWhiteboardStore((state) => state.strokeColor);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (providerRef.current && previousRoomIdRef.current === roomId) {
      return;
    }

    previousRoomIdRef.current = roomId;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const provider = new WebrtcProvider(roomId, ydoc, {
      signaling: ["wss://signaling.yjs.dev"],
    });
    providerRef.current = provider;

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

    syncElements();
    syncFiles();
    syncHistory();

    yElements.observe(syncElements);
    yFiles.observe(syncFiles);
    yHistoryEntries.observe(syncHistory);
    yHistoryMeta.observe(syncHistory);

    const awareness = provider.awareness;
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
      awareness.setLocalState(next);
    };

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
      const states = awareness.getStates();
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
    };

    awareness.on("change", awarenessChangeHandler);

    const flushCursorUpdate = () => {
      if (!providerRef.current) {
        return;
      }
      const coords = pendingCursorRef.current;
      if (!coords) {
        return;
      }
      const currentState = awareness.getLocalState();
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
      awareness.setLocalState({
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
          cursorTimeoutRef.current = undefined;
          flushCursorUpdate();
        }, CURSOR_THROTTLE_MS - elapsed);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
        cursorTimeoutRef.current = undefined;
      }

      awareness.off("change", awarenessChangeHandler);
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
      providerRef.current = undefined;
      ydocRef.current = undefined;
      previousRoomIdRef.current = undefined;

      provider.destroy();
      ydoc.destroy();
    };
  }, [
    roomId,
    setCollaboration,
    setElementsFromDoc,
    setUploadedFilesFromDoc,
    setHistoryFromDoc,
    setUsers,
    setCurrentUser,
  ]);

  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) {
      return;
    }
    const awareness = provider.awareness;
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

  return <>{children}</>;
};
