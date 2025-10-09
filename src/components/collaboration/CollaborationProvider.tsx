"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";

interface CollaborationProviderProps {
  roomId: string;
  children: React.ReactNode;
}

const generateRandomColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 50%)`;
};

export const CollaborationProvider = ({ roomId, children }: CollaborationProviderProps) => {
  const ydocRef = useRef<Y.Doc>();
  const providerRef = useRef<WebrtcProvider>();
  const userIdRef = useRef(nanoid());
  const { setUsers, updateUser } = useWhiteboardStore();

  useEffect(() => {
    // Initialize Y.js document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Create WebRTC provider
    const provider = new WebrtcProvider(roomId, ydoc, {
      signaling: ["wss://signaling.yjs.dev"],
    });
    providerRef.current = provider;

    const awareness = provider.awareness;
    const localState = {
      user: {
        id: userIdRef.current,
        name: `Guest ${Math.floor(Math.random() * 99) + 1}`.padStart(8, "0"),
        color: generateRandomColor(),
        cursorX: 0,
        cursorY: 0,
      },
    };

    awareness.setLocalState(localState);

    // Listen to awareness changes
    const awarenessChangeHandler = () => {
      const states = Array.from(awareness.getStates().values());
      const users = states
        .map((state: any) => state.user)
        .filter((user) => user && user.id !== userIdRef.current);
      setUsers(users);
    };

    awareness.on("change", awarenessChangeHandler);

    // Update cursor position on mouse move
    const handleMouseMove = (e: MouseEvent) => {
      const currentState = awareness.getLocalState();
      if (currentState?.user) {
        awareness.setLocalState({
          user: {
            ...currentState.user,
            cursorX: e.clientX,
            cursorY: e.clientY,
          },
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      awareness.off("change", awarenessChangeHandler);
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId, setUsers]);

  return <>{children}</>;
};
