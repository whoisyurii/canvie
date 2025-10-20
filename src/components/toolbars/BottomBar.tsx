"use client";

import { Minus, Plus, Undo2, Redo2 } from "lucide-react";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const BottomBar = () => {
  const { zoom, setZoom, undo, redo, historyIndex, history } = useWhiteboardStore();

  const zoomIn = () => setZoom(zoom * 1.2);
  const zoomOut = () => setZoom(zoom / 1.2);
  const resetZoom = () => setZoom(1);

  return (
    <div className="floating-panel flex items-center gap-1.5 px-2.5 py-1.5">
      {/* Undo/Redo */}
      <Button
        variant="ghost"
        size="icon"
        className="tool-button"
        onClick={undo}
        disabled={historyIndex <= 0}
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="tool-button"
        onClick={redo}
        disabled={historyIndex >= history.length - 1}
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="toolbar-separator" />

      {/* Zoom Controls */}
      <Button variant="ghost" size="icon" className="tool-button" onClick={zoomOut}>
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        className="tool-button min-w-[56px] text-sidebar-foreground"
        onClick={resetZoom}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button variant="ghost" size="icon" className="tool-button" onClick={zoomIn}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
};
