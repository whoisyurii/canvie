import type { CanvasElement } from "@/lib/store/useWhiteboardStore";

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export const normalizeRectBounds = (
  x: number,
  y: number,
  width = 0,
  height = 0
): Bounds => {
  const minX = width >= 0 ? x : x + width;
  const minY = height >= 0 ? y : y + height;
  const maxX = width >= 0 ? x + width : x;
  const maxY = height >= 0 ? y + height : y;
  return { minX, minY, maxX, maxY };
};

export const getElementBounds = (element: CanvasElement): Bounds => {
  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "image":
    case "file": {
      return normalizeRectBounds(
        element.x,
        element.y,
        element.width ?? 0,
        element.height ?? 0
      );
    }
    case "line":
    case "arrow": {
      if (element.points && element.points.length >= 2) {
        let minX = element.x;
        let minY = element.y;
        let maxX = element.x;
        let maxY = element.y;
        for (let index = 0; index < element.points.length; index += 2) {
          const px = element.x + (element.points[index] ?? 0);
          const py = element.y + (element.points[index + 1] ?? 0);
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        return { minX, minY, maxX, maxY };
      }
      return {
        minX: element.x,
        minY: element.y,
        maxX: element.x,
        maxY: element.y,
      };
    }
    case "pen": {
      if (element.points && element.points.length >= 2) {
        let minX = element.x;
        let minY = element.y;
        let maxX = element.x;
        let maxY = element.y;
        for (let index = 0; index < element.points.length; index += 2) {
          const px = element.x + (element.points[index] ?? 0);
          const py = element.y + (element.points[index + 1] ?? 0);
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        return { minX, minY, maxX, maxY };
      }
      return {
        minX: element.x,
        minY: element.y,
        maxX: element.x,
        maxY: element.y,
      };
    }
    case "text": {
      const approxWidth = Math.max(
        120,
        Math.min((element.text?.length ?? 0) * 10, 320)
      );
      const approxHeight = 32;
      return normalizeRectBounds(
        element.x,
        element.y,
        approxWidth,
        approxHeight
      );
    }
    default:
      return {
        minX: element.x,
        minY: element.y,
        maxX: element.x,
        maxY: element.y,
      };
  }
};

export const isElementWithinSelection = (
  element: CanvasElement,
  selection: Bounds
) => {
  const bounds = getElementBounds(element);
  return (
    bounds.maxX >= selection.minX &&
    bounds.minX <= selection.maxX &&
    bounds.maxY >= selection.minY &&
    bounds.minY <= selection.maxY
  );
};
