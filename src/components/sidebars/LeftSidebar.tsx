"use client";

import {
  ArrowTypeSelector,
  EdgeStyleSelector,
  FillPalette,
  LayerActions,
  OpacityControl,
  PenBackgroundSelector,
  SloppinessSelector,
  StrokePalette,
  StrokeStyleSelector,
  StrokeWidthSelector,
  TextFormattingControls,
} from "./left";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";

const STROKE_COLORS = ["#1f2937", "#e03131", "#2f9e44", "#1971c2", "#f59f00", "#ae3ec9", "#f4f4f5"];
const FILL_COLORS = ["#f4f4f5", "#fde68a", "#fbcfe8", "#bbf7d0", "#bae6fd", "#fecaca"];
const PEN_BACKGROUND_COLORS = ["#fde68a", "#bbf7d0", "#bae6fd", "#fbcfe8", "#fecaca"];
const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8];

const TOOL_EMPTY_STATE: Record<string, string> = {
  select: "Select an element to view its settings.",
  pan: "Switch to a drawing tool to access its options.",
  eraser: "The eraser does not have configurable settings.",
};

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
    arrowStyle,
    setArrowStyle,
    opacity,
    setOpacity,
    rectangleCornerStyle,
    setRectangleCornerStyle,
    penBackground,
    setPenBackground,
    textFontFamily,
    setTextFontFamily,
    textFontSize,
    setTextFontSize,
    textAlign,
    setTextAlign,
    selectedIds,
    bringToFront,
    sendToBack,
  } = useWhiteboardStore();

  const hasSelection = selectedIds.length > 0;

  const renderSections = () => {
    switch (activeTool) {
      case "rectangle":
        return (
          <>
            <StrokePalette colors={STROKE_COLORS} value={strokeColor} onChange={setStrokeColor} />
            <FillPalette colors={FILL_COLORS} value={fillColor} onChange={setFillColor} />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <StrokeStyleSelector value={strokeStyle} onChange={setStrokeStyle} />
            <EdgeStyleSelector value={rectangleCornerStyle} onChange={setRectangleCornerStyle} />
            <SloppinessSelector value={sloppiness} onChange={setSloppiness} />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "diamond":
      case "ellipse":
        return (
          <>
            <StrokePalette colors={STROKE_COLORS} value={strokeColor} onChange={setStrokeColor} />
            <FillPalette colors={FILL_COLORS} value={fillColor} onChange={setFillColor} />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <StrokeStyleSelector value={strokeStyle} onChange={setStrokeStyle} />
            <SloppinessSelector value={sloppiness} onChange={setSloppiness} />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "line":
        return (
          <>
            <StrokePalette colors={STROKE_COLORS} value={strokeColor} onChange={setStrokeColor} />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <StrokeStyleSelector value={strokeStyle} onChange={setStrokeStyle} />
            <SloppinessSelector value={sloppiness} onChange={setSloppiness} />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "arrow":
        return (
          <>
            <StrokePalette colors={STROKE_COLORS} value={strokeColor} onChange={setStrokeColor} />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <StrokeStyleSelector value={strokeStyle} onChange={setStrokeStyle} />
            <ArrowTypeSelector
              type={arrowType}
              onTypeChange={setArrowType}
              style={arrowStyle}
              onStyleChange={setArrowStyle}
            />
            <SloppinessSelector value={sloppiness} onChange={setSloppiness} />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "pen":
        return (
          <>
            <StrokePalette colors={STROKE_COLORS} value={strokeColor} onChange={setStrokeColor} />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <SloppinessSelector value={sloppiness} onChange={setSloppiness} />
            <PenBackgroundSelector
              colors={PEN_BACKGROUND_COLORS}
              value={penBackground}
              onChange={setPenBackground}
            />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "text":
        return (
          <>
            <StrokePalette colors={STROKE_COLORS} value={strokeColor} onChange={setStrokeColor} />
            <TextFormattingControls
              fontFamily={textFontFamily}
              onFontFamilyChange={setTextFontFamily}
              fontSize={textFontSize}
              onFontSizeChange={setTextFontSize}
              alignment={textAlign}
              onAlignmentChange={setTextAlign}
            />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      default: {
        const message = TOOL_EMPTY_STATE[activeTool];
        return message ? (
          <p className="rounded-md border border-dashed border-sidebar-border bg-sidebar/50 p-4 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null;
      }
    }
  };

  return (
    <div
      className="floating-panel flex w-[320px] flex-col"
      style={{ height: "min(720px, calc(100vh - 5rem))" }}
    >
      <div className="border-b border-sidebar-border px-4 py-3">
        <h3 className="text-sm font-semibold text-sidebar-foreground">Tool Settings</h3>
        <p className="text-xs text-muted-foreground">Fine-tune the active tool without leaving the canvas.</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-4 py-4">
          {renderSections()}

          <LayerActions
            disabled={!hasSelection}
            onBringToFront={bringToFront}
            onSendToBack={sendToBack}
          />
        </div>
      </ScrollArea>
    </div>
  );
};
