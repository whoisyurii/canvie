"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Text, Group } from "react-konva";
import type { User } from "@/lib/store/useWhiteboardStore";

interface UserCursorProps {
  user: User;
  pan: { x: number; y: number };
  zoom: number;
}

const FADE_DURATION = 4000;

export const UserCursor = ({ user, pan, zoom }: UserCursorProps) => {
  const [opacity, setOpacity] = useState(1);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (user.isConnected) {
      setOpacity(1);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const start = user.lastActive;
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / FADE_DURATION);
      setOpacity(1 - progress);
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [user.isConnected, user.lastActive]);

  const x = (user.cursorX - pan.x) / zoom;
  const y = (user.cursorY - pan.y) / zoom;

  return (
    <Group x={x} y={y} opacity={opacity}>
      <Circle radius={6} fill={user.color} shadowBlur={4} shadowOpacity={0.5} />
      <Text
        text={`${user.name}${user.tool ? ` · ${user.tool}` : ""}`}
        x={10}
        y={-5}
        fontSize={12}
        fill={user.color}
        fontStyle="bold"
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={2}
      />
    </Group>
  );
};
