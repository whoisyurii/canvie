import { Fragment } from "react";
import { Arrow, Ellipse, Line, Rect } from "react-konva";

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
  getStrokeDash,
} from "@/lib/canvas";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";

import {
  PEN_TENSION,
  STROKE_BACKGROUND_PADDING,
  getSafeCornerRadius,
} from "./constants";

interface CurrentShapePreviewProps {
  currentShape: CanvasElement | null;
}

export const CurrentShapePreview = ({
  currentShape,
}: CurrentShapePreviewProps) => {
  if (!currentShape) {
    return null;
  }

  if (currentShape.type === "rectangle") {
    const safeCornerRadius = getSafeCornerRadius(
      currentShape.width,
      currentShape.height,
      currentShape.cornerRadius
    );
    const outlinePoints = getRectangleOutlinePoints(
      currentShape.width ?? 0,
      currentShape.height ?? 0,
      safeCornerRadius
    );
    const layers = createSloppyStrokeLayers(outlinePoints, {
      sloppiness: currentShape.sloppiness,
      strokeWidth: currentShape.strokeWidth,
      seed: `${currentShape.id}-preview-rect`,
      closed: true,
    });

    return (
      <>
        <Rect
          x={currentShape.x}
          y={currentShape.y}
          width={currentShape.width}
          height={currentShape.height}
          stroke={getColorWithOpacity(
            currentShape.strokeColor,
            currentShape.strokeOpacity
          )}
          strokeWidth={currentShape.strokeWidth}
          dash={getStrokeDash(currentShape.strokeStyle)}
          fill={getColorWithOpacity(
            currentShape.fillColor,
            currentShape.fillOpacity
          )}
          opacity={currentShape.opacity * 0.7}
          cornerRadius={safeCornerRadius}
          strokeEnabled={currentShape.sloppiness === "smooth"}
          hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
        />
        {layers.map((layer, index) => (
          <Line
            key={`${currentShape.id}-preview-rect-${index}`}
            x={currentShape.x}
            y={currentShape.y}
            points={layer.points}
            stroke={getColorWithOpacity(
              currentShape.strokeColor,
              currentShape.strokeOpacity
            )}
            strokeWidth={layer.strokeWidth}
            dash={getStrokeDash(currentShape.strokeStyle)}
            opacity={currentShape.opacity * 0.7 * layer.opacity}
            lineCap="round"
            lineJoin="round"
            closed
            listening={false}
          />
        ))}
      </>
    );
  }

  if (currentShape.type === "diamond") {
    const diamond = getDiamondShape(
      currentShape.x,
      currentShape.y,
      currentShape.width ?? 0,
      currentShape.height ?? 0
    );
    const layers = createSloppyStrokeLayers(diamond.points, {
      sloppiness: currentShape.sloppiness,
      strokeWidth: currentShape.strokeWidth,
      seed: `${currentShape.id}-preview-diamond`,
      closed: true,
    });

    return (
      <>
        <Line
          x={diamond.x}
          y={diamond.y}
          points={diamond.points}
          stroke={getColorWithOpacity(
            currentShape.strokeColor,
            currentShape.strokeOpacity
          )}
          strokeWidth={currentShape.strokeWidth}
          dash={getStrokeDash(currentShape.strokeStyle)}
          fill={getColorWithOpacity(
            currentShape.fillColor,
            currentShape.fillOpacity
          )}
          opacity={currentShape.opacity * 0.7}
          closed
          lineJoin="round"
          strokeEnabled={currentShape.sloppiness === "smooth"}
          hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
        />
        {layers.map((layer, index) => (
          <Line
            key={`${currentShape.id}-preview-diamond-${index}`}
            x={diamond.x}
            y={diamond.y}
            points={layer.points}
            stroke={getColorWithOpacity(
              currentShape.strokeColor,
              currentShape.strokeOpacity
            )}
            strokeWidth={layer.strokeWidth}
            dash={getStrokeDash(currentShape.strokeStyle)}
            opacity={currentShape.opacity * 0.7 * layer.opacity}
            closed
            lineJoin="round"
            listening={false}
          />
        ))}
      </>
    );
  }

  if (currentShape.type === "ellipse") {
    const outline = getEllipseOutlinePoints(
      currentShape.width ?? 0,
      currentShape.height ?? 0
    );
    const layers = createSloppyStrokeLayers(outline, {
      sloppiness: currentShape.sloppiness,
      strokeWidth: currentShape.strokeWidth,
      seed: `${currentShape.id}-preview-ellipse`,
      closed: true,
    });
    const centerX = currentShape.x + (currentShape.width ?? 0) / 2;
    const centerY = currentShape.y + (currentShape.height ?? 0) / 2;

    return (
      <>
        <Ellipse
          x={centerX}
          y={centerY}
          radiusX={Math.abs((currentShape.width ?? 0) / 2)}
          radiusY={Math.abs((currentShape.height ?? 0) / 2)}
          stroke={getColorWithOpacity(
            currentShape.strokeColor,
            currentShape.strokeOpacity
          )}
          strokeWidth={currentShape.strokeWidth}
          dash={getStrokeDash(currentShape.strokeStyle)}
          fill={getColorWithOpacity(
            currentShape.fillColor,
            currentShape.fillOpacity
          )}
          opacity={currentShape.opacity * 0.7}
          strokeEnabled={currentShape.sloppiness === "smooth"}
          hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
        />
        {layers.map((layer, index) => (
          <Line
            key={`${currentShape.id}-preview-ellipse-${index}`}
            x={centerX}
            y={centerY}
            points={layer.points}
            stroke={getColorWithOpacity(
              currentShape.strokeColor,
              currentShape.strokeOpacity
            )}
            strokeWidth={layer.strokeWidth}
            dash={getStrokeDash(currentShape.strokeStyle)}
            opacity={currentShape.opacity * 0.7 * layer.opacity}
            closed
            lineJoin="round"
            listening={false}
          />
        ))}
      </>
    );
  }

  if (currentShape.type === "line") {
    const { points: linePoints, bezier } = getArrowRenderConfig(
      currentShape.points,
      currentShape.arrowStyle
    );
    const overlayPoints = bezier
      ? sampleCurvePoints(linePoints)
      : linePoints;
    const layers = createSloppyStrokeLayers(overlayPoints, {
      sloppiness: currentShape.sloppiness,
      strokeWidth: currentShape.strokeWidth,
      seed: `${currentShape.id}-preview-line`,
    });
    const hasBackground =
      currentShape.penBackground &&
      currentShape.penBackground !== "transparent";
    const backgroundOpacity = currentShape.opacity * 0.4 + 0.2;
    const baseBackgroundOpacity = Math.min(1, backgroundOpacity);
    const backgroundStrokeWidth =
      currentShape.strokeWidth + STROKE_BACKGROUND_PADDING;
    const showBaseStroke = currentShape.sloppiness === "smooth";

    return (
      <>
        {hasBackground && showBaseStroke ? (
          <Line
            x={currentShape.x}
            y={currentShape.y}
            points={linePoints}
            stroke={currentShape.penBackground}
            strokeWidth={backgroundStrokeWidth}
            dash={getStrokeDash(currentShape.strokeStyle)}
            opacity={baseBackgroundOpacity}
            lineCap="round"
            lineJoin="round"
            bezier={bezier}
            tension={bezier ? 0.4 : 0}
            listening={false}
          />
        ) : null}
        <Line
          x={currentShape.x}
          y={currentShape.y}
          points={linePoints}
          stroke={getColorWithOpacity(
            currentShape.strokeColor,
            currentShape.strokeOpacity
          )}
          strokeWidth={currentShape.strokeWidth}
          dash={getStrokeDash(currentShape.strokeStyle)}
          opacity={currentShape.opacity * 0.7}
          lineCap="round"
          lineJoin="round"
          bezier={bezier}
          tension={bezier ? 0.4 : 0}
          strokeEnabled={currentShape.sloppiness === "smooth"}
          hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
        />
        {layers.map((layer, index) => {
          const layerOpacity = currentShape.opacity * 0.7 * layer.opacity;
          const layerBackgroundOpacity = Math.min(
            1,
            backgroundOpacity * layer.opacity
          );

          return (
            <Fragment key={`${currentShape.id}-preview-line-${index}`}>
              {hasBackground ? (
                <Line
                  x={currentShape.x}
                  y={currentShape.y}
                  points={layer.points}
                  stroke={currentShape.penBackground}
                  strokeWidth={layer.strokeWidth + STROKE_BACKGROUND_PADDING}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  opacity={layerBackgroundOpacity}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              ) : null}
              <Line
                x={currentShape.x}
                y={currentShape.y}
                points={layer.points}
                stroke={getColorWithOpacity(
                  currentShape.strokeColor,
                  currentShape.strokeOpacity
                )}
                strokeWidth={layer.strokeWidth}
                dash={getStrokeDash(currentShape.strokeStyle)}
                opacity={layerOpacity}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            </Fragment>
          );
        })}
      </>
    );
  }

  if (currentShape.type === "arrow") {
    const { points: arrowPoints, bezier } = getArrowRenderConfig(
      currentShape.points,
      currentShape.arrowStyle
    );
    const pointerAtBeginning =
      currentShape.arrowType === "arrow-start" ||
      currentShape.arrowType === "arrow-both";
    const pointerAtEnding =
      currentShape.arrowType === "arrow-end" ||
      currentShape.arrowType === "arrow-both";
    const overlayPoints = bezier
      ? sampleCurvePoints(arrowPoints)
      : arrowPoints;
    const layers = createSloppyStrokeLayers(overlayPoints, {
      sloppiness: currentShape.sloppiness,
      strokeWidth: currentShape.strokeWidth,
      seed: `${currentShape.id}-preview-arrow`,
    });
    const [primaryLayer, ...extraLayers] = layers;
    const hasBackground =
      currentShape.penBackground &&
      currentShape.penBackground !== "transparent";
    const backgroundOpacity = currentShape.opacity * 0.4 + 0.2;
    const baseBackgroundOpacity = Math.min(1, backgroundOpacity);
    const backgroundStrokeWidth =
      currentShape.strokeWidth + STROKE_BACKGROUND_PADDING;
    const pointerBackgroundSize = 12 + STROKE_BACKGROUND_PADDING;
    const showBaseStroke = currentShape.sloppiness === "smooth";

    return (
      <>
        {hasBackground && showBaseStroke ? (
          <Arrow
            x={currentShape.x}
            y={currentShape.y}
            points={arrowPoints}
            stroke={currentShape.penBackground}
            strokeWidth={backgroundStrokeWidth}
            dash={getStrokeDash(currentShape.strokeStyle)}
            opacity={baseBackgroundOpacity}
            pointerLength={pointerBackgroundSize}
            pointerWidth={pointerBackgroundSize}
            pointerAtBeginning={pointerAtBeginning}
            pointerAtEnding={pointerAtEnding}
            bezier={bezier}
            tension={bezier ? 0.4 : 0}
            listening={false}
          />
        ) : null}
        <Arrow
          x={currentShape.x}
          y={currentShape.y}
          points={arrowPoints}
          stroke={getColorWithOpacity(
            currentShape.strokeColor,
            currentShape.strokeOpacity
          )}
          strokeWidth={currentShape.strokeWidth}
          dash={getStrokeDash(currentShape.strokeStyle)}
          opacity={currentShape.opacity * 0.7}
          pointerLength={12}
          pointerWidth={12}
          pointerAtBeginning={pointerAtBeginning}
          pointerAtEnding={pointerAtEnding}
          bezier={bezier}
          tension={bezier ? 0.4 : 0}
          strokeEnabled={currentShape.sloppiness === "smooth"}
          hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
        />
        {primaryLayer ? (
          <Fragment>
            {hasBackground ? (
              <Arrow
                key={`${currentShape.id}-preview-arrow-background`}
                x={currentShape.x}
                y={currentShape.y}
                points={primaryLayer.points}
                stroke={currentShape.penBackground}
                strokeWidth={
                  primaryLayer.strokeWidth + STROKE_BACKGROUND_PADDING
                }
                dash={getStrokeDash(currentShape.strokeStyle)}
                opacity={Math.min(
                  1,
                  backgroundOpacity * primaryLayer.opacity
                )}
                pointerLength={pointerBackgroundSize}
                pointerWidth={pointerBackgroundSize}
                pointerAtBeginning={pointerAtBeginning}
                pointerAtEnding={pointerAtEnding}
                bezier={false}
                tension={0}
                listening={false}
              />
            ) : null}
            <Arrow
              key={`${currentShape.id}-preview-arrow-primary`}
              x={currentShape.x}
              y={currentShape.y}
              points={primaryLayer.points}
              stroke={getColorWithOpacity(
                currentShape.strokeColor,
                currentShape.strokeOpacity
              )}
              strokeWidth={primaryLayer.strokeWidth}
              dash={getStrokeDash(currentShape.strokeStyle)}
              opacity={currentShape.opacity * 0.7 * primaryLayer.opacity}
              pointerLength={12}
              pointerWidth={12}
              pointerAtBeginning={pointerAtBeginning}
              pointerAtEnding={pointerAtEnding}
              bezier={false}
              tension={0}
              listening={false}
            />
          </Fragment>
        ) : null}
        {extraLayers.map((layer, index) => {
          const layerOpacity = currentShape.opacity * 0.7 * layer.opacity;
          const layerBackgroundOpacity = Math.min(
            1,
            backgroundOpacity * layer.opacity
          );

          return (
            <Fragment key={`${currentShape.id}-preview-arrow-${index}`}>
              {hasBackground ? (
                <Line
                  x={currentShape.x}
                  y={currentShape.y}
                  points={layer.points}
                  stroke={currentShape.penBackground}
                  strokeWidth={layer.strokeWidth + STROKE_BACKGROUND_PADDING}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  opacity={layerBackgroundOpacity}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              ) : null}
              <Line
                x={currentShape.x}
                y={currentShape.y}
                points={layer.points}
                stroke={getColorWithOpacity(
                  currentShape.strokeColor,
                  currentShape.strokeOpacity
                )}
                strokeWidth={layer.strokeWidth}
                dash={getStrokeDash(currentShape.strokeStyle)}
                opacity={layerOpacity}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            </Fragment>
          );
        })}
      </>
    );
  }

  if (currentShape.type === "pen") {
    const hasBackground =
      currentShape.penBackground &&
      currentShape.penBackground !== "transparent";
    const backgroundOpacity = currentShape.opacity * 0.4 + 0.2;
    const lineTension = PEN_TENSION;

    return (
      <>
        {hasBackground ? (
          <Line
            x={currentShape.x}
            y={currentShape.y}
            points={currentShape.points}
            stroke={currentShape.penBackground}
            strokeWidth={currentShape.strokeWidth + 12}
            opacity={Math.min(1, backgroundOpacity)}
            lineCap="round"
            lineJoin="round"
            tension={lineTension}
            listening={false}
          />
        ) : null}
        <Line
          x={currentShape.x}
          y={currentShape.y}
          points={currentShape.points}
          stroke={getColorWithOpacity(
            currentShape.strokeColor,
            currentShape.strokeOpacity
          )}
          strokeWidth={currentShape.strokeWidth}
          opacity={currentShape.opacity * 0.7}
          lineCap="round"
          lineJoin="round"
          tension={lineTension}
          hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
        />
      </>
    );
  }

  return null;
};
