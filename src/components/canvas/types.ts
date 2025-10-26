import type { CanvasElement, TextAlignment } from "@/lib/store/useWhiteboardStore";

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MarqueeSelectionState = {
  originX: number;
  originY: number;
  additive: boolean;
  initialSelection: string[];
  moved: boolean;
};

export type SelectionDragState = {
  startNodes: Record<string, { x: number; y: number }>;
  elements: Record<string, CanvasElement>;
  affectedIds: string[];
  referenceId: string | null;
};

export type EditingTextState = {
  id: string;
  x: number;
  y: number;
  anchor: "top-left" | "center";
  rotation: number;
  value: string;
  initialValue: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  alignment: TextAlignment;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  lockWidth: boolean;
  persistWidth: boolean;
};
