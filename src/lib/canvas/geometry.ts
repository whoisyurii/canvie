import type { ArrowStyle } from "@/lib/store/useWhiteboardStore";
import { normalizeRectBounds } from "./bounds";

const computeCurveControlPoint = (
  startX: number,
  startY: number,
  endX: number,
  endY: number
) => {
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  return { x: midX, y: midY };
};

export const ensureCurvePoints = (points: number[] | undefined) => {
  if (!points || points.length < 4) {
    return points ? [...points] : [];
  }

  const [startX = 0, startY = 0] = points;
  const endX = points[points.length - 2] ?? startX;
  const endY = points[points.length - 1] ?? startY;

  if (points.length >= 6) {
    const controlX = points[2] ?? startX;
    const controlY = points[3] ?? startY;
    return [startX, startY, controlX, controlY, endX, endY];
  }

  const { x: controlX, y: controlY } = computeCurveControlPoint(
    startX,
    startY,
    endX,
    endY
  );

  return [startX, startY, controlX, controlY, endX, endY];
};

export const flattenCurvePoints = (points: number[] | undefined) => {
  if (!points || points.length < 4) {
    return points ? [...points] : [];
  }

  const [startX = 0, startY = 0] = points;
  const endX = points[points.length - 2] ?? startX;
  const endY = points[points.length - 1] ?? startY;
  return [startX, startY, endX, endY];
};

export const getDefaultCurveControlPoint = (
  startX: number,
  startY: number,
  endX: number,
  endY: number
) => computeCurveControlPoint(startX, startY, endX, endY);

export const getDiamondShape = (x: number, y: number, width = 0, height = 0) => {
  const bounds = normalizeRectBounds(x, y, width, height);
  const drawWidth = bounds.maxX - bounds.minX;
  const drawHeight = bounds.maxY - bounds.minY;

  return {
    x: bounds.minX,
    y: bounds.minY,
    points: [
      drawWidth / 2,
      0,
      drawWidth,
      drawHeight / 2,
      drawWidth / 2,
      drawHeight,
      0,
      drawHeight / 2,
    ],
  };
};

export const getArrowRenderConfig = (
  points: number[] | undefined,
  style: ArrowStyle | undefined
) => {
  if (!points || points.length < 4) {
    return { points: points ?? [], bezier: false };
  }

  if (style !== "curve") {
    return { points, bezier: false };
  }

  const [
    startX = 0,
    startY = 0,
    controlX = 0,
    controlY = 0,
    endX = 0,
    endY = 0,
  ] = ensureCurvePoints(points);

  return {
    bezier: true,
    points: [
      startX,
      startY,
      controlX,
      controlY,
      controlX,
      controlY,
      endX,
      endY,
    ],
  };
};
