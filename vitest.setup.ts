import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Provide a very small mock for canvas rendering used by pdf previews in tests.
const canvasContextStub = {
  fillRect: () => undefined,
  clearRect: () => undefined,
  getImageData: () => ({ data: [] } as unknown as ImageData),
  putImageData: () => undefined,
  createImageData: () => ([] as unknown as ImageData),
  setTransform: () => undefined,
  drawImage: () => undefined,
  save: () => undefined,
  restore: () => undefined,
  beginPath: () => undefined,
  closePath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  clip: () => undefined,
  stroke: () => undefined,
  translate: () => undefined,
  scale: () => undefined,
  rotate: () => undefined,
  arc: () => undefined,
  fill: () => undefined,
  measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0, fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0 }),
  transform: () => undefined,
  rect: () => undefined,
  quadraticCurveTo: () => undefined,
  createLinearGradient: () => ({ addColorStop: () => undefined } as CanvasGradient),
  setLineDash: () => undefined,
};

HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
  if (contextId === "2d") {
    return canvasContextStub as unknown as CanvasRenderingContext2D;
  }
  return null;
}) as typeof HTMLCanvasElement.prototype.getContext;

if (typeof URL !== "undefined") {
  if (typeof URL.revokeObjectURL === "function") {
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  } else {
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
      () => undefined;
  }
}

