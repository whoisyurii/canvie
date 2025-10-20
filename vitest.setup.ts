import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Provide a very small mock for canvas rendering used by pdf previews in tests.
HTMLCanvasElement.prototype.getContext = () => ({
  fillRect: () => undefined,
  clearRect: () => undefined,
  getImageData: () => ({ data: [] }),
  putImageData: () => undefined,
  createImageData: () => [],
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
  measureText: () => ({ width: 0 }),
  transform: () => undefined,
  rect: () => undefined,
  quadraticCurveTo: () => undefined,
  createLinearGradient: () => ({ addColorStop: () => undefined }),
  setLineDash: () => undefined,
}) as unknown as CanvasRenderingContext2D;

if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
} else {
  // jsdom may omit revokeObjectURL; provide a noop implementation for tests.
  // @ts-expect-error - test environment polyfill.
  URL.revokeObjectURL = () => undefined;
}

