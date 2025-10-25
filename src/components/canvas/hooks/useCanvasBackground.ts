"use client";

import { useMemo, type CSSProperties } from "react";

import type { CanvasBackground } from "@/lib/store/useWhiteboardStore";

type BackgroundConfig = {
  className: string;
  style: CSSProperties;
};

export const useCanvasBackground = (
  canvasBackground: CanvasBackground,
  pan: { x: number; y: number },
  zoom: number,
) => {
  const safeZoom = zoom || 1;
  const { x: panX, y: panY } = pan;

  return useMemo<BackgroundConfig>(() => {
    const baseSize = Math.max(4, 20 * safeZoom);
    const basePosition = `${panX}px ${panY}px`;

    if (canvasBackground === "none") {
      return {
        className: "",
        style: {
          backgroundImage: "none",
          backgroundSize: undefined,
          backgroundPosition: undefined,
        },
      };
    }

    if (canvasBackground === "technical") {
      const majorSize = baseSize * 5;
      const repeatedPosition = Array(4).fill(basePosition).join(", ");

      return {
        className: "technical-grid",
        style: {
          backgroundSize: `${baseSize}px ${baseSize}px, ${baseSize}px ${baseSize}px, ${majorSize}px ${majorSize}px, ${majorSize}px ${majorSize}px`,
          backgroundPosition: repeatedPosition,
        },
      };
    }

    return {
      className: "dotted-grid",
      style: {
        backgroundSize: `${baseSize}px ${baseSize}px`,
        backgroundPosition: basePosition,
      },
    };
  }, [canvasBackground, panX, panY, safeZoom]);
};
