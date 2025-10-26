"use client";

import { useEffect } from "react";
import { useWhiteboardStore, Tool } from "@/lib/store/useWhiteboardStore";

const toolShortcutsByKey: Record<string, Tool> = {
  v: "select",
  h: "pan",
  r: "rectangle",
  d: "diamond",
  o: "ellipse",
  a: "arrow",
  l: "line",
  t: "text",
  p: "pen",
  e: "eraser",
  m: "ruler",
};

const toolShortcutsByCode: Record<string, Tool> = {
  KeyV: "select",
  KeyH: "pan",
  KeyR: "rectangle",
  KeyD: "diamond",
  KeyO: "ellipse",
  KeyA: "arrow",
  KeyL: "line",
  KeyT: "text",
  KeyP: "pen",
  KeyE: "eraser",
  KeyM: "ruler",
};

export const useKeyboardShortcuts = () => {
  const { setActiveTool, undo, redo, deleteSelection, resetView } = useWhiteboardStore();

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

      if (e.target instanceof HTMLElement && e.target.isContentEditable) {
        return;
      }

      if (!e.ctrlKey && !e.metaKey) {
        const toolShortcut = toolShortcutsByCode[e.code] ?? toolShortcutsByKey[key];
        if (toolShortcut) {
          e.preventDefault();
          setActiveTool(toolShortcut);
          return;
        }

        if (key === "delete" || key === "backspace") {
          e.preventDefault();
          deleteSelection();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === "0") {
        e.preventDefault();
        resetView();
        return;
      }

      // Undo/Redo
      if (e.ctrlKey || e.metaKey) {
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }

        if (key === "y") {
          e.preventDefault();
          redo();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelection, resetView, setActiveTool, undo, redo]);
};
