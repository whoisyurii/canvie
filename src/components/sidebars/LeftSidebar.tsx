"use client";

import { useMemo, useState } from "react";
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
import { TextAlignment, useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { cn } from "@/lib/utils";

const STROKE_COLORS = [
  "#1f2937",
  "#e03131",
  "#f97316",
  "#f59f00",
  "#2f9e44",
  "#0ea5e9",
  "#1971c2",
  "#6366f1",
  "#ae3ec9",
  "#ec4899",
  "#14b8a6",
  "#f4f4f5",
];
const FILL_COLORS = [
  "#f4f4f5",
  "#e4e4e7",
  "#fde68a",
  "#fef3c7",
  "#fbcfe8",
  "#fecdd3",
  "#bbf7d0",
  "#d9f99d",
  "#bae6fd",
  "#c7d2fe",
  "#e9d5ff",
];
const PEN_BACKGROUND_COLORS = ["#fde68a", "#bbf7d0", "#bae6fd", "#fbcfe8", "#fecaca"];
const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8, 10, 16];

const TOOL_EMPTY_STATE: Record<string, string> = {
  select: "Select an element to view its settings.",
  pan: "Switch to a drawing tool to access its options.",
  eraser: "The eraser does not have configurable settings.",
  ruler: "Use the ruler to measure distances. Hold Shift + Alt to measure without switching tools.",
};

export const LeftSidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const {
    activeTool,
    elements,
    strokeColor,
    setStrokeColor,
    fillColor,
    setFillColor,
    recentStrokeColors,
    recentFillColors,
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
  const selectedElements = useMemo(
    () => elements.filter((element) => selectedIds.includes(element.id)),
    [elements, selectedIds],
  );
  const selectedTextElements = useMemo(
    () => selectedElements.filter((element) => element.type === "text"),
    [selectedElements],
  );
  const hasTextSelection = selectedTextElements.length > 0;
  const firstTextElement = selectedTextElements[0];
  const resolvedFontFamily = hasTextSelection && firstTextElement
    ? selectedTextElements.every((element) => element.fontFamily === firstTextElement.fontFamily)
      ? firstTextElement.fontFamily ?? textFontFamily
      : textFontFamily
    : textFontFamily;
  const firstFontSize = firstTextElement?.fontSize ?? textFontSize;
  const resolvedFontSize = hasTextSelection
    ? selectedTextElements.every(
        (element) => (element.fontSize ?? textFontSize) === firstFontSize,
      )
        ? firstFontSize
        : textFontSize
    : textFontSize;
  const firstAlignment: TextAlignment =
    (firstTextElement?.textAlign as TextAlignment | undefined) ?? textAlign;
  const resolvedAlignment = hasTextSelection
    ? selectedTextElements.every(
        (element) =>
          ((element.textAlign as TextAlignment | undefined) ?? textAlign) === firstAlignment,
      )
        ? firstAlignment
        : textAlign
    : textAlign;

  const renderSections = () => {
    switch (activeTool) {
      case "select": {
        if (!hasSelection) {
          const message = TOOL_EMPTY_STATE.select;
          return message ? (
            <p className="rounded-md border border-dashed border-sidebar-border bg-sidebar/50 p-3 text-sm text-muted-foreground">
              {message}
            </p>
          ) : null;
        }

        if (!hasTextSelection) {
          return (
            <p className="rounded-md border border-dashed border-sidebar-border bg-sidebar/50 p-3 text-sm text-muted-foreground">
              Select a text element to adjust its formatting.
            </p>
          );
        }

        return (
          <TextFormattingControls
            fontFamily={resolvedFontFamily}
            onFontFamilyChange={setTextFontFamily}
            fontSize={resolvedFontSize}
            onFontSizeChange={setTextFontSize}
            alignment={resolvedAlignment}
            onAlignmentChange={setTextAlign}
          />
        );
      }
      case "rectangle":
        return (
          <>
            <StrokePalette
              colors={STROKE_COLORS}
              value={strokeColor}
              onChange={setStrokeColor}
              recentColors={recentStrokeColors}
            />
            <FillPalette
              colors={FILL_COLORS}
              value={fillColor}
              onChange={setFillColor}
              recentColors={recentFillColors}
            />
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
            <StrokePalette
              colors={STROKE_COLORS}
              value={strokeColor}
              onChange={setStrokeColor}
              recentColors={recentStrokeColors}
            />
            <FillPalette
              colors={FILL_COLORS}
              value={fillColor}
              onChange={setFillColor}
              recentColors={recentFillColors}
            />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <StrokeStyleSelector value={strokeStyle} onChange={setStrokeStyle} />
            <SloppinessSelector value={sloppiness} onChange={setSloppiness} />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "line":
        return (
          <>
            <StrokePalette
              colors={STROKE_COLORS}
              value={strokeColor}
              onChange={setStrokeColor}
              recentColors={recentStrokeColors}
            />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <PenBackgroundSelector
              colors={PEN_BACKGROUND_COLORS}
              value={penBackground}
              onChange={setPenBackground}
              title="Stroke Background"
            />
            <StrokeStyleSelector value={strokeStyle} onChange={setStrokeStyle} />
            <SloppinessSelector value={sloppiness} onChange={setSloppiness} />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "arrow":
        return (
          <>
            <StrokePalette
              colors={STROKE_COLORS}
              value={strokeColor}
              onChange={setStrokeColor}
              recentColors={recentStrokeColors}
            />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <PenBackgroundSelector
              colors={PEN_BACKGROUND_COLORS}
              value={penBackground}
              onChange={setPenBackground}
              title="Stroke Background"
            />
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
            <StrokePalette
              colors={STROKE_COLORS}
              value={strokeColor}
              onChange={setStrokeColor}
              recentColors={recentStrokeColors}
            />
            <StrokeWidthSelector widths={STROKE_WIDTHS} value={strokeWidth} onChange={setStrokeWidth} />
            <PenBackgroundSelector
              colors={PEN_BACKGROUND_COLORS}
              value={penBackground}
              onChange={setPenBackground}
              title="Pen Background"
            />
            <OpacityControl value={opacity} onChange={setOpacity} />
          </>
        );
      case "text":
        return (
          <>
            <StrokePalette
              colors={STROKE_COLORS}
              value={strokeColor}
              onChange={setStrokeColor}
              recentColors={recentStrokeColors}
            />
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
      case "ruler": {
        const message = TOOL_EMPTY_STATE.ruler;
        return (
          <p className="rounded-md border border-dashed border-sidebar-border bg-sidebar/50 p-3 text-sm text-muted-foreground">
            {message}
          </p>
        );
      }
      default: {
        const message = TOOL_EMPTY_STATE[activeTool];
        return message ? (
          <p className="rounded-md border border-dashed border-sidebar-border bg-sidebar/50 p-3 text-sm text-muted-foreground">
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
        isCollapsed ? "w-12" : "w-[220px]"
      )}
      style={{ height: "min(640px, calc(100vh - 4rem))" }}
    >
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border",
          isCollapsed ? "justify-center px-0 py-1.5" : "justify-between px-2.5 py-2"
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
            "h-6 w-6 shrink-0 text-muted-foreground transition-transform",
            isCollapsed ? "translate-x-0" : "-mx-0.5"
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
        <div className="space-y-2.5 px-2 py-2.5">
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
