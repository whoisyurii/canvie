"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";

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
  const [isCollapsed, setIsCollapsed] = useState(false);
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
      className={cn(
        "floating-panel group relative flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-[288px]"
      )}
      style={{ height: "min(720px, calc(100vh - 5rem))" }}
    >
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border",
          isCollapsed ? "justify-center px-0 py-2" : "justify-between px-3 py-3"
        )}
      >
        {!isCollapsed ? (
          <div>
            <h3 className="text-sm font-semibold text-sidebar-foreground">Tool Settings</h3>
            <p className="text-xs text-muted-foreground">Fine-tune the active tool without leaving the canvas.</p>
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 shrink-0 text-muted-foreground transition-transform",
            isCollapsed ? "translate-x-0" : "-mx-1"
          )}
          onClick={() => setIsCollapsed((current) => !current)}
          aria-label={isCollapsed ? "Expand tool settings" : "Collapse tool settings"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <ScrollArea
        className={cn(
          "flex-1 transition-opacity duration-200 ease-in-out",
          isCollapsed ? "pointer-events-none opacity-0" : "opacity-100"
        )}
      >
        <div className="space-y-4 px-3 py-4">
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
