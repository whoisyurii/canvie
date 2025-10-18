import type { ArrowStyle } from "@/lib/store/useWhiteboardStore";
import { normalizeRectBounds } from "./bounds";

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

  const [startX, startY, endX, endY] = points;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const offset = Math.min(120, length * 0.3);
  const controlX = midX + normalX * offset;
  const controlY = midY + normalY * offset;

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
