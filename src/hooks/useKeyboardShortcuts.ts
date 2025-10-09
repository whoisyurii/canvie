"use client";

import { useEffect } from "react";
import { useWhiteboardStore, Tool } from "@/lib/store/useWhiteboardStore";

const toolShortcuts: Record<string, Tool> = {
  v: "select",
  h: "pan",
  r: "rectangle",
  o: "ellipse",
  a: "arrow",
  l: "line",
  t: "text",
  p: "pen",
  e: "eraser",
};

export const useKeyboardShortcuts = () => {
  const { setActiveTool, undo, redo } = useWhiteboardStore();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();

      // Tool shortcuts
      if (toolShortcuts[key] && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setActiveTool(toolShortcuts[key]);
        return;
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTool, undo, redo]);
};
