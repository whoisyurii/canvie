import type Konva from "konva";
import { nanoid } from "nanoid";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";

export const resolveElementId = (node: Konva.Node | null): string | null => {
  if (!node) {
    return null;
  }

  const nodeId = node.id();
  if (nodeId) {
    return nodeId;
  }

  const elementIdAttr = node.getAttr("elementId");
  if (typeof elementIdAttr === "string" && elementIdAttr.length > 0) {
    return elementIdAttr;
  }

  const ancestorWithElementId = node.findAncestor((ancestor) => {
    const attr = ancestor.getAttr("elementId");
    return typeof attr === "string" && attr.length > 0;
  }, true);

  if (ancestorWithElementId) {
    const attr = ancestorWithElementId.getAttr("elementId");
    if (typeof attr === "string" && attr.length > 0) {
      return attr;
    }
  }

  const ancestorWithId = node.findAncestor(
    (ancestor) => Boolean(ancestor.id()),
    true
  );
  return ancestorWithId?.id() ?? null;
};

export const duplicateElement = (element: CanvasElement): CanvasElement => ({
  ...element,
  id: nanoid(),
  points: element.points ? [...element.points] : undefined,
  selected: false,
});

export const RESIZABLE_ELEMENT_TYPES = new Set<CanvasElement["type"]>([
  "rectangle",
  "diamond",
  "ellipse",
  "image",
  "file",
  "text",
  "arrow",
  "line",
  "pen",
]);
