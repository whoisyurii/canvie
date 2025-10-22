import { useEffect, useMemo, useRef } from "react";
import { Layer, Line, Circle, Label, Tag, Text as KonvaText } from "react-konva";
import Konva from "konva";

export type RulerMeasurement = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  deltaX: number;
  deltaY: number;
  distance: number;
  angle: number;
};

type LabelAnchor =
  | "center"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

type MeasurementLabelProps = {
  x: number;
  y: number;
  text: string;
  zoom: number;
  anchor?: LabelAnchor;
};

const formatDelta = (value: number) => {
  const sign = value >= 0 ? "+" : "\u2212";
  return `${sign}${Math.abs(value).toFixed(1)} px`;
};

const computeAnchorOffset = (width: number, height: number, anchor: LabelAnchor) => {
  switch (anchor) {
    case "left":
      return { offsetX: 0, offsetY: height / 2 };
    case "right":
      return { offsetX: width, offsetY: height / 2 };
    case "top":
      return { offsetX: width / 2, offsetY: 0 };
    case "bottom":
      return { offsetX: width / 2, offsetY: height };
    case "topLeft":
      return { offsetX: 0, offsetY: 0 };
    case "topRight":
      return { offsetX: width, offsetY: 0 };
    case "bottomLeft":
      return { offsetX: 0, offsetY: height };
    case "bottomRight":
      return { offsetX: width, offsetY: height };
    case "center":
    default:
      return { offsetX: width / 2, offsetY: height / 2 };
  }
};

const MeasurementLabel = ({ x, y, text, zoom, anchor = "center" }: MeasurementLabelProps) => {
  const labelRef = useRef<Konva.Label>(null);
  const scale = 1 / Math.max(zoom, 0.0001);
  const fontSize = Math.max(12 * scale, 10);
  const padding = Math.max(6 * scale, 4);
  const cornerRadius = Math.max(6 * scale, 3);
  const strokeWidth = Math.max(scale, 0.75);

  useEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const textNode = label.getText();
    const tagNode = label.getTag();
    if (!textNode) return;

    const width = textNode.width();
    const height = textNode.height();
    const { offsetX, offsetY } = computeAnchorOffset(width, height, anchor);

    label.offsetX(offsetX);
    label.offsetY(offsetY);

    if (tagNode) {
      tagNode.offsetX(offsetX);
      tagNode.offsetY(offsetY);
    }
  }, [anchor, text, zoom]);

  return (
    <Label x={x} y={y} listening={false} ref={labelRef}>
      <Tag
        fill="rgba(14, 165, 233, 0.16)"
        stroke="#0284c7"
        strokeWidth={strokeWidth}
        cornerRadius={cornerRadius}
      />
      <KonvaText
        text={text}
        fontSize={fontSize}
        fill="#0f172a"
        padding={padding}
        align="center"
      />
    </Label>
  );
};

type RulerOverlayProps = {
  measurement: RulerMeasurement | null;
  zoom: number;
};

export const RulerOverlay = ({ measurement, zoom }: RulerOverlayProps) => {
  const data = useMemo(() => {
    if (!measurement) {
      return null;
    }

    const { start, end, deltaX, deltaY, distance, angle } = measurement;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const scale = 1 / Math.max(zoom, 0.0001);

    const margin = 12 * scale;
    const horizontalY = deltaY >= 0 ? minY - margin : maxY + margin;
    const horizontalAnchor: LabelAnchor = deltaY >= 0 ? "bottom" : "top";
    const verticalX = deltaX >= 0 ? maxX + margin : minX - margin;
    const verticalAnchor: LabelAnchor = deltaX >= 0 ? "left" : "right";

    const angleRadians = Math.atan2(deltaY, deltaX);
    const normalOffset = 16 * scale;
    const distanceLabelX = centerX + Math.sin(angleRadians) * normalOffset;
    const distanceLabelY = centerY - Math.cos(angleRadians) * normalOffset;

    return {
      start,
      end,
      deltaX,
      deltaY,
      distance,
      angle,
      minX,
      maxX,
      minY,
      maxY,
      horizontalY,
      horizontalAnchor,
      verticalX,
      verticalAnchor,
      distanceLabelX,
      distanceLabelY,
      scale,
    };
  }, [measurement, zoom]);

  if (!data) {
    return null;
  }

  const {
    start,
    end,
    deltaX,
    deltaY,
    distance,
    angle,
    minX,
    maxX,
    minY,
    maxY,
    horizontalY,
    horizontalAnchor,
    verticalX,
    verticalAnchor,
    distanceLabelX,
    distanceLabelY,
    scale,
  } = data;

  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);

  const strokeColor = "#0284c7";
  const guideStroke = "rgba(2, 132, 199, 0.65)";
  const fillColor = "rgba(14, 165, 233, 0.12)";
  const strokeWidth = Math.max(2 * scale, 1);
  const guideWidth = Math.max(1.5 * scale, 0.75);
  const dash = [8 * scale, 8 * scale];
  const handleRadius = Math.max(5 * scale, 3);

  return (
    <Layer listening={false}>
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        dash={dash}
        lineCap="round"
        lineJoin="round"
      />
      {absDeltaX > 0.5 && (
        <Line
          points={[start.x, start.y, end.x, start.y]}
          stroke={guideStroke}
          strokeWidth={guideWidth}
          dash={dash}
          lineCap="round"
          lineJoin="round"
        />
      )}
      {absDeltaY > 0.5 && (
        <Line
          points={[end.x, start.y, end.x, end.y]}
          stroke={guideStroke}
          strokeWidth={guideWidth}
          dash={dash}
          lineCap="round"
          lineJoin="round"
        />
      )}
      <Circle
        x={start.x}
        y={start.y}
        radius={handleRadius}
        fill="#ffffff"
        stroke={strokeColor}
        strokeWidth={Math.max(scale, 0.75)}
      />
      <Circle
        x={end.x}
        y={end.y}
        radius={handleRadius}
        fill="#ffffff"
        stroke={strokeColor}
        strokeWidth={Math.max(scale, 0.75)}
      />
      <Line
        points={[minX, minY, maxX, minY, maxX, maxY, minX, maxY, minX, minY]}
        stroke={fillColor}
        strokeWidth={Math.max(scale, 0.5)}
        dash={[4 * scale, 12 * scale]}
        lineCap="round"
        lineJoin="round"
        opacity={0.45}
      />
      <MeasurementLabel
        x={distanceLabelX}
        y={distanceLabelY}
        text={`Distance ${distance.toFixed(1)} px\n\u03B8 ${angle.toFixed(1)}\u00B0`}
        zoom={zoom}
      />
      {absDeltaX > 0.5 && (
        <MeasurementLabel
          x={(minX + maxX) / 2}
          y={horizontalY}
          text={`\u0394x ${formatDelta(deltaX)}`}
          zoom={zoom}
          anchor={horizontalAnchor}
        />
      )}
      {absDeltaY > 0.5 && (
        <MeasurementLabel
          x={verticalX}
          y={(minY + maxY) / 2}
          text={`\u0394y ${formatDelta(deltaY)}`}
          zoom={zoom}
          anchor={verticalAnchor}
        />
      )}
    </Layer>
  );
};
