"use client";

import {
  ArrowheadControls,
  FillPalette,
  LayerActions,
  OpacityControl,
  SloppinessSelector,
  StrokePalette,
  StrokeStyleSelector,
  StrokeWidthSelector,
} from "./left";
import { useWhiteboardStore, Tool } from "@/lib/store/useWhiteboardStore";

const STROKE_COLORS = ["#1f2937", "#e03131", "#2f9e44", "#1971c2", "#f59f00", "#ae3ec9", "#f4f4f5"];
const FILL_COLORS = ["#e03131", "#2f9e44", "#1971c2", "#f59f00", "#ae3ec9", "#f4f4f5"];
const STROKE_WIDTHS = [1, 2, 4, 8];

const STROKE_TOOLS: Tool[] = ["rectangle", "ellipse", "line", "arrow", "pen", "text"];
const FILL_TOOLS: Tool[] = ["rectangle", "ellipse"];
const WIDTH_TOOLS: Tool[] = ["rectangle", "ellipse", "line", "arrow", "pen"];
const STYLE_TOOLS: Tool[] = ["rectangle", "ellipse", "line", "arrow"];
const SLOPPINESS_TOOLS: Tool[] = ["rectangle", "ellipse", "line", "arrow", "pen"];
const ARROW_TOOLS: Tool[] = ["arrow"];
const OPACITY_TOOLS: Tool[] = ["rectangle", "ellipse", "line", "arrow", "pen", "text"];

export const LeftSidebar = () => {
  const {
    activeTool,
    strokeColor,
    setStrokeColor,
    fillColor,
    setFillColor,
    strokeWidth,
    setStrokeWidth,
    strokeStyle,
    setStrokeStyle,
    sloppiness,
    setSloppiness,
    arrowType,
    setArrowType,
    opacity,
    setOpacity,
    selectedIds,
    bringToFront,
    sendToBack,
  } = useWhiteboardStore();

  const supportsStroke = STROKE_TOOLS.includes(activeTool);
  const supportsFill = FILL_TOOLS.includes(activeTool);
  const supportsWidth = WIDTH_TOOLS.includes(activeTool);
  const supportsStyle = STYLE_TOOLS.includes(activeTool);
  const supportsSloppiness = SLOPPINESS_TOOLS.includes(activeTool);
  const supportsArrowheads = ARROW_TOOLS.includes(activeTool);
  const supportsOpacity = OPACITY_TOOLS.includes(activeTool);
  const hasSelection = selectedIds.length > 0;

  return (
    <div className="floating-panel p-4 space-y-4 max-w-[260px]">
      <div>
        <h3 className="text-sm font-semibold text-sidebar-foreground">Tool Settings</h3>
        <p className="text-xs text-muted-foreground">
          Options adapt to the active tool and canvas selection.
        </p>
      </div>

      <StrokePalette
        colors={STROKE_COLORS}
        value={strokeColor}
        onChange={setStrokeColor}
        disabled={!supportsStroke}
      />

      <FillPalette
        colors={FILL_COLORS}
        value={fillColor}
        onChange={setFillColor}
        disabled={!supportsFill}
      />

      <StrokeWidthSelector
        widths={STROKE_WIDTHS}
        value={strokeWidth}
        onChange={setStrokeWidth}
        disabled={!supportsWidth}
      />

      <StrokeStyleSelector
        value={strokeStyle}
        onChange={setStrokeStyle}
        disabled={!supportsStyle}
      />

      <SloppinessSelector
        value={sloppiness}
        onChange={setSloppiness}
        disabled={!supportsSloppiness}
      />

      <ArrowheadControls
        value={arrowType}
        onChange={setArrowType}
        disabled={!supportsArrowheads}
      />

      <OpacityControl
        value={opacity}
        onChange={setOpacity}
        disabled={!supportsOpacity}
      />

      <LayerActions
        disabled={!hasSelection}
        onBringToFront={bringToFront}
        onSendToBack={sendToBack}
      />
    </div>
  );
};
