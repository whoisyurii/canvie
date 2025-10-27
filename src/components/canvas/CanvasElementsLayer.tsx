"use client";

import { Fragment, type RefObject } from "react";
import { Arrow, Circle, Ellipse, Layer, Line, Rect, Text as KonvaText, Transformer } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

import { CurrentShapePreview } from "./CurrentShapePreview";
import { FileElement, ImageElement } from "./elements";
import { RulerOverlay, type RulerMeasurement } from "./RulerOverlay";
import { UserCursor } from "./UserCursor";
import type { CanvasElement, TextAlignment, User } from "@/lib/store/useWhiteboardStore";
import { getColorWithOpacity } from "@/lib/color";
import {
  createSloppyStrokeLayers,
  getEllipseOutlinePoints,
  getRectangleOutlinePoints,
  sampleCurvePoints,
} from "@/lib/canvas/sloppiness";
import {
  getArrowRenderConfig,
  getDiamondShape,
  getFontFamilyCss,
  getLineHeight,
  getStrokeDash,
  normalizeRectBounds,
  ensureCurvePoints,
} from "@/lib/canvas";
import { PEN_TENSION, STROKE_BACKGROUND_PADDING, getSafeCornerRadius } from "./constants";
import type { Bounds } from "@/lib/canvas";
import type { SelectionRect } from "./types";

type InteractionProps = Record<string, unknown>;

const getElementFontStyle = (element: CanvasElement) => {
  const isBold = element.isBold;
  const isItalic = element.isItalic;

  if (isBold && isItalic) {
    return "bold italic" as const;
  }

  if (isBold) {
    return "bold" as const;
  }

  if (isItalic) {
    return "italic" as const;
  }

  return "normal" as const;
};

const getElementTextDecoration = (element: CanvasElement) => {
  const decorations: string[] = [];

  if (element.isUnderline) {
    decorations.push("underline");
  }

  if (element.isStrikethrough) {
    decorations.push("line-through");
  }

  return decorations.length > 0 ? decorations.join(" ") : undefined;
};

export type CanvasElementsLayerProps = {
  visibleElements: CanvasElement[];
  selectedIds: string[];
  focusedElementId: string | null;
  safeZoom: number;
  defaultFontSize: number;
  editingTextId: string | null;
  getInteractionProps: (element: CanvasElement) => InteractionProps;
  selectionRect: SelectionRect | null;
  activeTool: string;
  selectionBounds: Bounds | null;
  onSelectionGroupDragStart: (event: KonvaEventObject<DragEvent>) => void;
  onSelectionGroupDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onSelectionGroupDragEnd: (event: KonvaEventObject<DragEvent>) => void;
  rulerMeasurement: RulerMeasurement | null;
  curveHandleElements: CanvasElement[];
  onCurveHandleDragMove: (
    event: KonvaEventObject<DragEvent>,
    element: CanvasElement,
    handleIndex: number,
  ) => void;
  onCurveHandleDragEnd: (
    event: KonvaEventObject<DragEvent>,
    element: CanvasElement,
    handleIndex: number,
  ) => void;
  currentShape: CanvasElement | null;
  users: User[];
  pan: { x: number; y: number };
  zoom: number;
  transformerRef: RefObject<Konva.Transformer | null>;
};

export const CanvasElementsLayer = ({
  visibleElements,
  selectedIds,
  focusedElementId,
  safeZoom,
  defaultFontSize,
  editingTextId,
  getInteractionProps,
  selectionRect,
  activeTool,
  selectionBounds,
  onSelectionGroupDragStart,
  onSelectionGroupDragMove,
  onSelectionGroupDragEnd,
  rulerMeasurement,
  curveHandleElements,
  onCurveHandleDragMove,
  onCurveHandleDragEnd,
  currentShape,
  users,
  pan,
  zoom,
  transformerRef,
}: CanvasElementsLayerProps) => {
  return (
    <Layer>
      {visibleElements.map((element) => {
        const isSelected = selectedIds.includes(element.id);
        const focusHighlight =
          focusedElementId === element.id
            ? {
                shadowColor: "#38bdf8",
                shadowBlur: 24,
                shadowOpacity: 0.85,
                shadowOffsetX: 0,
                shadowOffsetY: 0,
              }
            : {};
        const selectionHighlight = isSelected
          ? {
              shadowColor: "#0ea5e9",
              shadowBlur: Math.max(18, 12 / safeZoom),
              shadowOpacity: 0.75,
              shadowOffsetX: 0,
              shadowOffsetY: 0,
            }
          : {};
        const highlightProps = {
          ...focusHighlight,
          ...selectionHighlight,
        };
        const interactionProps = getInteractionProps(element);
        const isEditingElement = editingTextId === element.id;

        if (element.type === "rectangle") {
          const rectBounds = normalizeRectBounds(
            element.x,
            element.y,
            element.width ?? 0,
            element.height ?? 0
          );
          const rectWidth = rectBounds.maxX - rectBounds.minX;
          const rectHeight = rectBounds.maxY - rectBounds.minY;
          const rectX = rectBounds.minX;
          const rectY = rectBounds.minY;
          const safeCornerRadius = getSafeCornerRadius(
            rectWidth,
            rectHeight,
            element.cornerRadius
          );
          const hasLabel = Boolean(element.text?.trim());
          const labelFontSize = element.fontSize ?? defaultFontSize;
          const labelLineHeight = labelFontSize
            ? getLineHeight(labelFontSize) / labelFontSize
            : 1.4;
          const labelPadding = 16;
          const labelWidth = Math.max(0, rectWidth - labelPadding * 2);
          const labelHeight = Math.max(0, rectHeight - labelPadding * 2);
          const labelCenterX = rectX + rectWidth / 2;
          const labelCenterY = rectY + rectHeight / 2;
          const rectOutlinePoints = getRectangleOutlinePoints(
            rectWidth,
            rectHeight,
            safeCornerRadius
          );
          const rectSloppyLayers = createSloppyStrokeLayers(rectOutlinePoints, {
            sloppiness: element.sloppiness,
            strokeWidth: element.strokeWidth,
            seed: `${element.id}:rect`,
            closed: true,
          });
          return (
            <Fragment key={element.id}>
              <Rect
                key={element.id}
                id={element.id}
                x={rectX}
                y={rectY}
                width={rectWidth}
                height={rectHeight}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                dash={getStrokeDash(element.strokeStyle)}
                fill={getColorWithOpacity(element.fillColor, element.fillOpacity)}
                opacity={element.opacity}
                rotation={element.rotation}
                cornerRadius={safeCornerRadius}
                strokeEnabled={element.sloppiness === "smooth"}
                hitStrokeWidth={Math.max(12, element.strokeWidth)}
                {...highlightProps}
                {...interactionProps}
              />
              {rectSloppyLayers.map((layer, index) => (
                <Line
                  key={`${element.id}-sloppy-rect-${index}`}
                  x={rectX}
                  y={rectY}
                  points={layer.points}
                  stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                  strokeWidth={layer.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity * layer.opacity}
                  rotation={element.rotation}
                  lineCap="round"
                  lineJoin="round"
                  closed
                  listening={false}
                  {...highlightProps}
                />
              ))}
              {hasLabel && rectWidth > 0 && rectHeight > 0 && labelWidth > 0 && labelHeight > 0 && (
                <KonvaText
                  key={`${element.id}-label`}
                  x={labelCenterX}
                  y={labelCenterY}
                  width={labelWidth}
                  height={labelHeight}
                  text={element.text ?? ""}
                  fontSize={labelFontSize}
                  fontFamily={getFontFamilyCss(element.fontFamily)}
                  fontStyle={getElementFontStyle(element)}
                  textDecoration={getElementTextDecoration(element)}
                  lineHeight={labelLineHeight}
                  align={(element.textAlign as TextAlignment | undefined) ?? "center"}
                  verticalAlign="middle"
                  fill={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                  opacity={element.opacity}
                  offsetX={labelWidth / 2}
                  offsetY={labelHeight / 2}
                  rotation={element.rotation ?? 0}
                  padding={8}
                  wrap="word"
                  listening={false}
                />
              )}
            </Fragment>
          );
        }

        if (element.type === "diamond") {
          const diamond = getDiamondShape(
            element.x,
            element.y,
            element.width ?? 0,
            element.height ?? 0
          );
          const diamondBounds = normalizeRectBounds(
            element.x,
            element.y,
            element.width ?? 0,
            element.height ?? 0
          );
          const diamondWidth = diamondBounds.maxX - diamondBounds.minX;
          const diamondHeight = diamondBounds.maxY - diamondBounds.minY;
          const hasLabel = Boolean(element.text?.trim());
          const labelFontSize = element.fontSize ?? defaultFontSize;
          const labelLineHeight = labelFontSize
            ? getLineHeight(labelFontSize) / labelFontSize
            : 1.4;
          const labelPadding = 18;
          const labelWidth = Math.max(0, diamondWidth - labelPadding * 2);
          const labelHeight = Math.max(0, diamondHeight - labelPadding * 2);
          const labelCenterX = diamondBounds.minX + diamondWidth / 2;
          const labelCenterY = diamondBounds.minY + diamondHeight / 2;
          const diamondSloppyLayers = createSloppyStrokeLayers(diamond.points, {
            sloppiness: element.sloppiness,
            strokeWidth: element.strokeWidth,
            seed: `${element.id}:diamond`,
            closed: true,
          });

          return (
            <Fragment key={element.id}>
              <Line
                key={element.id}
                id={element.id}
                x={diamond.x}
                y={diamond.y}
                points={diamond.points}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                dash={getStrokeDash(element.strokeStyle)}
                fill={getColorWithOpacity(element.fillColor, element.fillOpacity)}
                opacity={element.opacity}
                rotation={element.rotation}
                closed
                lineJoin="round"
                strokeEnabled={element.sloppiness === "smooth"}
                hitStrokeWidth={Math.max(12, element.strokeWidth)}
                {...highlightProps}
                {...interactionProps}
              />
              {diamondSloppyLayers.map((layer, index) => (
                <Line
                  key={`${element.id}-sloppy-diamond-${index}`}
                  x={diamond.x}
                  y={diamond.y}
                  points={layer.points}
                  stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                  strokeWidth={layer.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity * layer.opacity}
                  rotation={element.rotation}
                  closed
                  lineJoin="round"
                  listening={false}
                  {...highlightProps}
                />
              ))}
              {hasLabel &&
                diamondWidth > 0 &&
                diamondHeight > 0 &&
                labelWidth > 0 &&
                labelHeight > 0 && (
                  <KonvaText
                    key={`${element.id}-label`}
                    x={labelCenterX}
                    y={labelCenterY}
                    width={labelWidth}
                    height={labelHeight}
                    text={element.text ?? ""}
                    fontSize={labelFontSize}
                    fontFamily={getFontFamilyCss(element.fontFamily)}
                    fontStyle={getElementFontStyle(element)}
                    textDecoration={getElementTextDecoration(element)}
                    lineHeight={labelLineHeight}
                    align={(element.textAlign as TextAlignment | undefined) ?? "center"}
                    verticalAlign="middle"
                    fill={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                    opacity={element.opacity}
                    offsetX={labelWidth / 2}
                    offsetY={labelHeight / 2}
                    rotation={element.rotation ?? 0}
                    padding={8}
                    wrap="word"
                    listening={false}
                  />
                )}
            </Fragment>
          );
        }

        if (element.type === "ellipse") {
          const ellipseOutlinePoints = getEllipseOutlinePoints(
            element.width ?? 0,
            element.height ?? 0
          );
          const ellipseSloppyLayers = createSloppyStrokeLayers(ellipseOutlinePoints, {
            sloppiness: element.sloppiness,
            strokeWidth: element.strokeWidth,
            seed: `${element.id}:ellipse`,
            closed: true,
          });
          const ellipseCenterX = element.x + (element.width ?? 0) / 2;
          const ellipseCenterY = element.y + (element.height ?? 0) / 2;
          return (
            <Fragment key={element.id}>
              <Ellipse
                key={element.id}
                id={element.id}
                x={ellipseCenterX}
                y={ellipseCenterY}
                radiusX={Math.abs((element.width ?? 0) / 2)}
                radiusY={Math.abs((element.height ?? 0) / 2)}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                dash={getStrokeDash(element.strokeStyle)}
                fill={getColorWithOpacity(element.fillColor, element.fillOpacity)}
                opacity={element.opacity}
                rotation={element.rotation}
                strokeEnabled={element.sloppiness === "smooth"}
                hitStrokeWidth={Math.max(12, element.strokeWidth)}
                {...highlightProps}
                {...interactionProps}
              />
              {ellipseSloppyLayers.map((layer, index) => (
                <Line
                  key={`${element.id}-sloppy-ellipse-${index}`}
                  x={ellipseCenterX}
                  y={ellipseCenterY}
                  points={layer.points}
                  stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                  strokeWidth={layer.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity * layer.opacity}
                  rotation={element.rotation}
                  closed
                  lineJoin="round"
                  listening={false}
                  {...highlightProps}
                />
              ))}
            </Fragment>
          );
        }

        if (element.type === "line") {
          const { points: linePoints, bezier } = getArrowRenderConfig(
            element.points,
            element.arrowStyle
          );
          const lineOverlayPoints = bezier ? sampleCurvePoints(linePoints) : linePoints;
          const lineSloppyLayers = createSloppyStrokeLayers(lineOverlayPoints, {
            sloppiness: element.sloppiness,
            strokeWidth: element.strokeWidth,
            seed: `${element.id}:line`,
          });
          const interactionOpacity =
            element.sloppiness === "smooth" ? element.opacity : 0.001;
          const hasBackground =
            element.penBackground && element.penBackground !== "transparent";
          const backgroundOpacity = element.opacity * 0.4 + 0.2;
          const baseBackgroundOpacity = Math.min(1, backgroundOpacity);
          const backgroundStrokeWidth = element.strokeWidth + STROKE_BACKGROUND_PADDING;
          const showBaseStroke = element.sloppiness === "smooth";

          return (
            <Fragment key={element.id}>
              <Line
                key={`${element.id}-interaction`}
                id={element.id}
                elementId={element.id}
                x={element.x}
                y={element.y}
                points={linePoints}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                dash={getStrokeDash(element.strokeStyle)}
                opacity={interactionOpacity}
                lineCap="round"
                lineJoin="round"
                bezier={bezier}
                tension={0}
                hitStrokeWidth={Math.max(12, element.strokeWidth)}
                {...interactionProps}
              />
              {hasBackground && showBaseStroke && (
                <Line
                  key={`${element.id}-background`}
                  id={`${element.id}-background`}
                  elementId={element.id}
                  x={element.x}
                  y={element.y}
                  points={linePoints}
                  stroke={element.penBackground}
                  strokeWidth={backgroundStrokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={baseBackgroundOpacity}
                  lineCap="round"
                  lineJoin="round"
                  bezier={bezier}
                  tension={0}
                  listening={false}
                />
              )}
              <Line
                key={`${element.id}-visible`}
                elementId={element.id}
                x={element.x}
                y={element.y}
                points={linePoints}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                dash={getStrokeDash(element.strokeStyle)}
                opacity={element.opacity}
                lineCap="round"
                lineJoin="round"
                bezier={bezier}
                tension={0}
                strokeEnabled={element.sloppiness === "smooth"}
                listening={false}
                {...highlightProps}
              />
              {lineSloppyLayers.map((layer, index) => {
                const layerOpacity = element.opacity * layer.opacity;
                const layerBackgroundOpacity = Math.min(1, backgroundOpacity * layer.opacity);
                return (
                  <Fragment key={`${element.id}-sloppy-line-${index}`}>
                    {hasBackground && (
                      <Line
                        key={`${element.id}-sloppy-line-background-${index}`}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={layer.points}
                        stroke={element.penBackground}
                        strokeWidth={layer.strokeWidth + STROKE_BACKGROUND_PADDING}
                        dash={getStrokeDash(element.strokeStyle)}
                        opacity={layerBackgroundOpacity}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                      />
                    )}
                    <Line
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={layer.points}
                      stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                      strokeWidth={layer.strokeWidth}
                      dash={getStrokeDash(element.strokeStyle)}
                      opacity={layerOpacity}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      {...highlightProps}
                    />
                  </Fragment>
                );
              })}
            </Fragment>
          );
        }

        if (element.type === "arrow") {
          const pointerAtBeginning =
            element.arrowType === "arrow-start" || element.arrowType === "arrow-both";
          const pointerAtEnding =
            element.arrowType === "arrow-end" || element.arrowType === "arrow-both";
          const { points: arrowPoints, bezier } = getArrowRenderConfig(
            element.points,
            element.arrowStyle
          );
          const arrowOverlayPoints = bezier ? sampleCurvePoints(arrowPoints) : arrowPoints;
          const arrowSloppyLayers = createSloppyStrokeLayers(arrowOverlayPoints, {
            sloppiness: element.sloppiness,
            strokeWidth: element.strokeWidth,
            seed: `${element.id}:arrow`,
          });
          const [primaryArrowLayer, ...extraArrowLayers] = arrowSloppyLayers;
          const interactionOpacity =
            element.sloppiness === "smooth" ? element.opacity : 0.001;
          const hasBackground =
            element.penBackground && element.penBackground !== "transparent";
          const backgroundOpacity = element.opacity * 0.4 + 0.2;
          const baseBackgroundOpacity = Math.min(1, backgroundOpacity);
          const backgroundStrokeWidth = element.strokeWidth + STROKE_BACKGROUND_PADDING;
          const pointerBackgroundSize = 12 + STROKE_BACKGROUND_PADDING;
          const showBaseStroke = element.sloppiness === "smooth";

          return (
            <Fragment key={element.id}>
              <Arrow
                key={`${element.id}-interaction`}
                id={element.id}
                elementId={element.id}
                x={element.x}
                y={element.y}
                points={arrowPoints}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                dash={getStrokeDash(element.strokeStyle)}
                opacity={interactionOpacity}
                pointerLength={12}
                pointerWidth={12}
                pointerAtBeginning={pointerAtBeginning}
                pointerAtEnding={pointerAtEnding}
                bezier={bezier}
                tension={0}
                hitStrokeWidth={Math.max(12, element.strokeWidth)}
                {...interactionProps}
              />
              {hasBackground && showBaseStroke && (
                <Arrow
                  key={`${element.id}-background`}
                  id={`${element.id}-background`}
                  elementId={element.id}
                  x={element.x}
                  y={element.y}
                  points={arrowPoints}
                  stroke={element.penBackground}
                  strokeWidth={backgroundStrokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={baseBackgroundOpacity}
                  pointerLength={pointerBackgroundSize}
                  pointerWidth={pointerBackgroundSize}
                  pointerAtBeginning={pointerAtBeginning}
                  pointerAtEnding={pointerAtEnding}
                  bezier={bezier}
                  tension={0}
                  listening={false}
                />
              )}
              <Arrow
                key={element.id}
                elementId={element.id}
                x={element.x}
                y={element.y}
                points={arrowPoints}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                dash={getStrokeDash(element.strokeStyle)}
                opacity={element.opacity}
                pointerLength={12}
                pointerWidth={12}
                pointerAtBeginning={pointerAtBeginning}
                pointerAtEnding={pointerAtEnding}
                bezier={bezier}
                tension={0}
                strokeEnabled={element.sloppiness === "smooth"}
                listening={false}
                {...highlightProps}
              />
              {primaryArrowLayer && (
                <Fragment>
                  {hasBackground && (
                    <Arrow
                      key={`${element.id}-sloppy-arrow-background`}
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={primaryArrowLayer.points}
                      stroke={element.penBackground}
                      strokeWidth={
                        primaryArrowLayer.strokeWidth + STROKE_BACKGROUND_PADDING
                      }
                      dash={getStrokeDash(element.strokeStyle)}
                      opacity={Math.min(1, backgroundOpacity * primaryArrowLayer.opacity)}
                      pointerLength={pointerBackgroundSize}
                      pointerWidth={pointerBackgroundSize}
                      pointerAtBeginning={pointerAtBeginning}
                      pointerAtEnding={pointerAtEnding}
                      bezier={false}
                      tension={0}
                      listening={false}
                    />
                  )}
                  <Arrow
                    key={`${element.id}-sloppy-arrow-primary`}
                    elementId={element.id}
                    x={element.x}
                    y={element.y}
                    points={primaryArrowLayer.points}
                    stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                    strokeWidth={primaryArrowLayer.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    opacity={element.opacity * primaryArrowLayer.opacity}
                    pointerLength={12}
                    pointerWidth={12}
                    pointerAtBeginning={pointerAtBeginning}
                    pointerAtEnding={pointerAtEnding}
                    bezier={false}
                    tension={0}
                    listening={false}
                    {...highlightProps}
                  />
                </Fragment>
              )}
              {extraArrowLayers.map((layer, index) => {
                const layerOpacity = element.opacity * layer.opacity;
                const layerBackgroundOpacity = Math.min(1, backgroundOpacity * layer.opacity);
                return (
                  <Fragment key={`${element.id}-sloppy-arrow-extra-${index}`}>
                    {hasBackground && (
                      <Line
                        key={`${element.id}-sloppy-arrow-extra-background-${index}`}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={layer.points}
                        stroke={element.penBackground}
                        strokeWidth={layer.strokeWidth + STROKE_BACKGROUND_PADDING}
                        dash={getStrokeDash(element.strokeStyle)}
                        opacity={layerBackgroundOpacity}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                      />
                    )}
                    <Line
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={layer.points}
                      stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                      strokeWidth={layer.strokeWidth}
                      dash={getStrokeDash(element.strokeStyle)}
                      opacity={layerOpacity}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      {...highlightProps}
                    />
                  </Fragment>
                );
              })}
            </Fragment>
          );
        }

        if (element.type === "pen") {
          const hasBackground =
            element.penBackground && element.penBackground !== "transparent";
          const backgroundOpacity = element.opacity * 0.4 + 0.2;
          const backgroundStrokeWidth = element.strokeWidth + STROKE_BACKGROUND_PADDING;
          const interactionOpacity = element.opacity;
          const lineTension = PEN_TENSION;

          return (
            <Fragment key={element.id}>
              {hasBackground && (
                <Line
                  key={`${element.id}-background`}
                  id={`${element.id}-background`}
                  elementId={element.id}
                  x={element.x}
                  y={element.y}
                  points={element.points}
                  stroke={element.penBackground}
                  strokeWidth={backgroundStrokeWidth}
                  opacity={Math.min(1, backgroundOpacity)}
                  lineCap="round"
                  lineJoin="round"
                  tension={lineTension}
                  listening={false}
                />
              )}
              <Line
                key={`${element.id}-visible`}
                elementId={element.id}
                x={element.x}
                y={element.y}
                points={element.points}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                opacity={element.opacity}
                lineCap="round"
                lineJoin="round"
                tension={lineTension}
                listening={false}
                {...highlightProps}
              />
              <Line
                key={`${element.id}-interaction`}
                id={element.id}
                elementId={element.id}
                x={element.x}
                y={element.y}
                points={element.points}
                stroke={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                strokeWidth={element.strokeWidth}
                opacity={interactionOpacity}
                lineCap="round"
                lineJoin="round"
                tension={lineTension}
                hitStrokeWidth={Math.max(12, element.strokeWidth)}
                {...interactionProps}
              />
            </Fragment>
          );
        }

        if (element.type === "text") {
          if (isEditingElement) {
            return null;
          }
          const elementFontSize = element.fontSize ?? defaultFontSize;
          const lineHeightRatio = elementFontSize
            ? getLineHeight(elementFontSize) / elementFontSize
            : 1.4;

          return (
            <KonvaText
              key={element.id}
              id={element.id}
              x={element.x}
              y={element.y}
              text={element.text || ""}
              fontSize={elementFontSize}
              fontFamily={getFontFamilyCss(element.fontFamily)}
              fontStyle={getElementFontStyle(element)}
              textDecoration={getElementTextDecoration(element)}
              lineHeight={lineHeightRatio}
              align={(element.textAlign as TextAlignment | undefined) ?? "left"}
              fill={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
              opacity={element.opacity}
              width={element.width}
              {...highlightProps}
              {...interactionProps}
            />
          );
        }

        if (element.type === "image") {
          return (
            <ImageElement
              key={element.id}
              element={element}
              highlight={highlightProps}
              interaction={interactionProps}
            />
          );
        }

        if (element.type === "file") {
          return (
            <FileElement
              key={element.id}
              element={element}
              highlight={highlightProps}
              interaction={interactionProps}
            />
          );
        }

        return null;
      })}

      {selectionRect && (() => {
        const bounds = normalizeRectBounds(
          selectionRect.x,
          selectionRect.y,
          selectionRect.width,
          selectionRect.height
        );
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        if (width === 0 && height === 0) {
          return null;
        }
        const strokeWidth = Math.max(1 / safeZoom, 0.5);
        return (
          <Rect
            x={bounds.minX}
            y={bounds.minY}
            width={width}
            height={height}
            stroke="#0ea5e9"
            strokeWidth={strokeWidth}
            dash={[4 / safeZoom, 4 / safeZoom]}
            fill="rgba(14, 165, 233, 0.12)"
            listening={false}
          />
        );
      })()}

      <RulerOverlay measurement={rulerMeasurement} zoom={safeZoom} />

      {activeTool === "select" && selectedIds.length > 1 && selectionBounds && (() => {
        const bounds = selectionBounds as Bounds;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        if (width === 0 && height === 0) {
          return null;
        }
        return (
          <Rect
            id="__selection_group__"
            x={bounds.minX}
            y={bounds.minY}
            width={Math.max(width, 1)}
            height={Math.max(height, 1)}
            fill="rgba(14, 165, 233, 0.0001)"
            draggable
            onDragStart={onSelectionGroupDragStart}
            onDragMove={onSelectionGroupDragMove}
            onDragEnd={onSelectionGroupDragEnd}
          />
        );
      })()}

      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        anchorSize={8}
        anchorFill="#f8fafc"
        anchorStroke="#0ea5e9"
        anchorCornerRadius={3}
        borderStroke="#0ea5e9"
        borderStrokeWidth={1}
        ignoreStroke
      />

      {curveHandleElements.map((element) => {
        const curvePoints = ensureCurvePoints(element.points);
        if (curvePoints.length < 6) {
          return null;
        }

        const handles = [
          {
            x: element.x + (curvePoints[0] ?? 0),
            y: element.y + (curvePoints[1] ?? 0),
          },
          {
            x: element.x + (curvePoints[2] ?? 0),
            y: element.y + (curvePoints[3] ?? 0),
          },
          {
            x: element.x + (curvePoints[4] ?? 0),
            y: element.y + (curvePoints[5] ?? 0),
          },
        ];

        const handleRadius = 8 / safeZoom;
        const handleStrokeWidth = Math.max(1, 2 / safeZoom);
        const connectorPoints = handles.flatMap((point) => [point.x, point.y]);

        return (
          <Fragment key={`${element.id}-curve-handles`}>
            <Line
              points={connectorPoints}
              stroke="#0ea5e9"
              strokeWidth={handleStrokeWidth}
              dash={[12 / safeZoom, 12 / safeZoom]}
              opacity={0.4}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            {handles.map((handle, index) => (
              <Circle
                key={`${element.id}-curve-handle-${index}`}
                x={handle.x}
                y={handle.y}
                radius={handleRadius}
                fill="#f8fafc"
                stroke="#0ea5e9"
                strokeWidth={handleStrokeWidth}
                draggable
                dragOnTop
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                }}
                onDragMove={(event) => onCurveHandleDragMove(event, element, index)}
                onDragEnd={(event) => onCurveHandleDragEnd(event, element, index)}
              />
            ))}
          </Fragment>
        );
      })}

      <CurrentShapePreview currentShape={currentShape} />

      {users.map((user) => (
        <UserCursor key={user.id} user={user} pan={pan} zoom={zoom} />
      ))}
    </Layer>
  );
};
