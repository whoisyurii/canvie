import { useEffect, useMemo, useRef } from "react";
import { Group, Line, Text as KonvaText } from "react-konva";
import Konva from "konva";

export type RulerMeasurement = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  deltaX: number;
  deltaY: number;
  distance: number;
  angle: number;
};

type MeasurementLabelProps = {
  x: number;
  y: number;
  text: string;
  zoom: number;
};

const MeasurementLabel = ({ x, y, text, zoom }: MeasurementLabelProps) => {
  const textRef = useRef<Konva.Text>(null);
  const scale = 1 / Math.max(zoom, 0.0001);
  const fontSize = Math.max(12 * scale, 10);
  const padding = Math.max(4 * scale, 2);

  useEffect(() => {
    const textNode = textRef.current;
    if (!textNode) return;

    const width = textNode.width();
    const height = textNode.height();

    textNode.offsetX(width / 2);
    textNode.offsetY(height / 2);
  }, [text, zoom]);

  return (
    <Group x={x} y={y} listening={false}>
      <KonvaText
        ref={textRef}
        text={text}
        fontSize={fontSize}
        fontStyle="600"
        fill="#0369a1"
        padding={padding}
        align="center"
      />
    </Group>
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

    const { start, end, deltaX, deltaY, distance } = measurement;
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const scale = 1 / Math.max(zoom, 0.0001);

    const angleRadians = Math.atan2(deltaY, deltaX);
    const normalOffset = 16 * scale;
    const labelX = centerX + Math.sin(angleRadians) * normalOffset;
    const labelY = centerY - Math.cos(angleRadians) * normalOffset;

    return {
      start,
      end,
      distance,
      labelX,
      labelY,
      scale,
    };
  }, [measurement, zoom]);

  if (!data) {
    return null;
  }

  const { start, end, distance, labelX, labelY, scale } = data;

  const strokeColor = "rgba(14, 165, 233, 0.75)";
  const strokeWidth = Math.max(2 * scale, 1);
  const dash = [10 * scale, 8 * scale];

  return (
    <Group listening={false}>
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        dash={dash}
        lineCap="round"
        lineJoin="round"
        opacity={0.9}
      />
      <MeasurementLabel x={labelX} y={labelY} text={`${distance.toFixed(1)} px`} zoom={zoom} />
    </Group>
  );
};
