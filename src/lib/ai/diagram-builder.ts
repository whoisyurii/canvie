import { nanoid } from "nanoid";

import { estimateTextBoxHeight, estimateTextBoxWidth } from "@/lib/canvas/text";
import {
  useWhiteboardStore,
  type CanvasElement,
  type CornerStyle,
} from "@/lib/store/useWhiteboardStore";
import { ensureCurvePoints } from "@/lib/canvas/geometry";

import { type GeminiDiagramKind, type GeminiDiagramResponse } from "./gemini";

const FLOW_NODE_WIDTH = 240;
const FLOW_NODE_HEIGHT = 120;
const FLOW_VERTICAL_SPACING = 90;

const MINDMAP_CENTRAL_WIDTH = 260;
const MINDMAP_CENTRAL_HEIGHT = 140;
const MINDMAP_BRANCH_WIDTH = 220;
const MINDMAP_BRANCH_HEIGHT = 110;
const MINDMAP_RADIAL_SPACING = 320;

interface DiagramLayoutEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: "rectangle" | "diamond";
  fontSize: number;
  textAlign: CanvasElement["textAlign"];
}

export interface DiagramBuildResult {
  elements: CanvasElement[];
  nodeCount: number;
  edgeCount: number;
  selectionIds: string[];
  summaryLabels: string[];
}

const getCanvasCenter = (pan: { x: number; y: number }, zoom: number) => {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }

  const safeZoom = zoom || 1;
  return {
    x: (window.innerWidth / 2 - pan.x) / safeZoom,
    y: (window.innerHeight / 2 - pan.y) / safeZoom,
  };
};

const layoutFlowchartNodes = (
  nodes: GeminiDiagramResponse["nodes"],
  center: { x: number; y: number },
  baseFontSize: number,
): Map<string, DiagramLayoutEntry> => {
  const layout = new Map<string, DiagramLayoutEntry>();
  if (nodes.length === 0) {
    return layout;
  }

  const totalHeight = nodes.length * FLOW_NODE_HEIGHT + (nodes.length - 1) * FLOW_VERTICAL_SPACING;
  const startY = center.y - totalHeight / 2;
  const startX = center.x - FLOW_NODE_WIDTH / 2;

  nodes.forEach((node, index) => {
    const typeLower = node.type.toLowerCase();
    const shape = typeLower.includes("decision") ? "diamond" : "rectangle";
    const y = startY + index * (FLOW_NODE_HEIGHT + FLOW_VERTICAL_SPACING);

    layout.set(node.id, {
      x: startX,
      y,
      width: FLOW_NODE_WIDTH,
      height: FLOW_NODE_HEIGHT,
      shape,
      fontSize: baseFontSize,
      textAlign: "center",
    });
  });

  return layout;
};

const layoutMindMapNodes = (
  response: GeminiDiagramResponse,
  center: { x: number; y: number },
  baseFontSize: number,
): Map<string, DiagramLayoutEntry> => {
  const layout = new Map<string, DiagramLayoutEntry>();
  if (response.nodes.length === 0) {
    return layout;
  }

  const normalized = response.nodes.map((node) => ({
    ...node,
    type: node.type.toLowerCase(),
  }));

  const centralNode =
    normalized.find((node) =>
      ["central", "center", "main", "root", "core"].some((token) => node.type.includes(token)),
    ) ?? normalized[0];

  layout.set(centralNode.id, {
    x: center.x - MINDMAP_CENTRAL_WIDTH / 2,
    y: center.y - MINDMAP_CENTRAL_HEIGHT / 2,
    width: MINDMAP_CENTRAL_WIDTH,
    height: MINDMAP_CENTRAL_HEIGHT,
    shape: "rectangle",
    fontSize: baseFontSize + 4,
    textAlign: "center",
  });

  const adjacency = new Map<string, Set<string>>();
  response.edges.forEach((edge) => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  });

  const visited = new Set<string>([centralNode.id]);
  const queue: Array<{ id: string; depth: number }> = [{ id: centralNode.id, depth: 0 }];
  const depthMap = new Map<string, number>([[centralNode.id, 0]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const neighbors = adjacency.get(current.id);
    if (!neighbors) continue;

    neighbors.forEach((neighbor) => {
      if (visited.has(neighbor)) {
        return;
      }
      visited.add(neighbor);
      const depth = current.depth + 1;
      depthMap.set(neighbor, depth);
      queue.push({ id: neighbor, depth });
    });
  }

  const depthLayers = new Map<number, string[]>();
  depthMap.forEach((depth, id) => {
    if (!depthLayers.has(depth)) {
      depthLayers.set(depth, []);
    }
    depthLayers.get(depth)?.push(id);
  });

  const depthKeys = Array.from(depthLayers.keys());
  const maxDepth = depthKeys.length > 0 ? Math.max(...depthKeys) : 0;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const nodeIds = depthLayers.get(depth) ?? [];
    const count = nodeIds.length;
    if (count === 0) {
      continue;
    }

    const radius = MINDMAP_RADIAL_SPACING * depth;
    nodeIds.forEach((id, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const x = center.x + Math.cos(angle) * radius - MINDMAP_BRANCH_WIDTH / 2;
      const y = center.y + Math.sin(angle) * radius - MINDMAP_BRANCH_HEIGHT / 2;
      layout.set(id, {
        x,
        y,
        width: MINDMAP_BRANCH_WIDTH,
        height: MINDMAP_BRANCH_HEIGHT,
        shape: "rectangle",
        fontSize: baseFontSize,
        textAlign: "center",
      });
    });
  }

  response.nodes.forEach((node) => {
    if (layout.has(node.id)) {
      return;
    }
    // Place disconnected or leftover nodes on an outer ring.
    const fallbackDepth = maxDepth + 1;
    const siblings = Array.from(layout.values()).filter((entry) => entry.height === MINDMAP_BRANCH_HEIGHT);
    const offsetIndex = siblings.length + layout.size;
    const radius = MINDMAP_RADIAL_SPACING * Math.max(1, fallbackDepth);
    const angle = (offsetIndex / Math.max(1, response.nodes.length)) * Math.PI * 2 - Math.PI / 2;
    const x = center.x + Math.cos(angle) * radius - MINDMAP_BRANCH_WIDTH / 2;
    const y = center.y + Math.sin(angle) * radius - MINDMAP_BRANCH_HEIGHT / 2;
    layout.set(node.id, {
      x,
      y,
      width: MINDMAP_BRANCH_WIDTH,
      height: MINDMAP_BRANCH_HEIGHT,
      shape: "rectangle",
      fontSize: baseFontSize,
      textAlign: "center",
    });
  });

  return layout;
};

export const buildDiagramElements = (
  response: GeminiDiagramResponse,
  kind: GeminiDiagramKind,
  options: {
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
    strokeWidth: number;
    strokeStyle: CanvasElement["strokeStyle"];
    sloppiness: CanvasElement["sloppiness"];
    arrowType: CanvasElement["arrowType"];
    arrowStyle: CanvasElement["arrowStyle"];
    opacity: number;
    rectangleCornerStyle: CornerStyle;
    textFontFamily: string;
    textFontSize: number;
    penBackground: string;
    pan: { x: number; y: number };
    zoom: number;
  },
): DiagramBuildResult => {
  const center = getCanvasCenter(options.pan, options.zoom);
  const layout =
    kind === "flowchart"
      ? layoutFlowchartNodes(response.nodes, center, options.textFontSize)
      : layoutMindMapNodes(response, center, options.textFontSize);

  if (layout.size === 0) {
    return { elements: [], nodeCount: 0, edgeCount: 0, selectionIds: [], summaryLabels: [] };
  }

  const elements: CanvasElement[] = [];
  const selectionIds: string[] = [];

  response.nodes.forEach((node) => {
    const placement = layout.get(node.id);
    if (!placement) {
      return;
    }

    const isRectangle = placement.shape === "rectangle";
    const cornerRadius =
      isRectangle && options.rectangleCornerStyle === "rounded" ? 16 : isRectangle ? 0 : undefined;

    const shapeElement: CanvasElement = {
      id: nanoid(),
      type: placement.shape,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: 0,
      strokeColor: options.strokeColor,
      strokeOpacity: options.strokeOpacity,
      fillColor: options.fillColor,
      fillOpacity: options.fillOpacity,
      strokeWidth: options.strokeWidth,
      strokeStyle: options.strokeStyle,
      opacity: options.opacity,
      sloppiness: options.sloppiness,
      text: node.label,
      fontFamily: options.textFontFamily,
      fontSize: placement.fontSize,
      textAlign: placement.textAlign,
      cornerRadius,
    };

    elements.push(shapeElement);
    selectionIds.push(shapeElement.id);
  });

  response.edges.forEach((edge) => {
    const fromPlacement = layout.get(edge.from);
    const toPlacement = layout.get(edge.to);
    if (!fromPlacement || !toPlacement) {
      return;
    }

    const fromCenter = {
      x: fromPlacement.x + fromPlacement.width / 2,
      y: fromPlacement.y + fromPlacement.height / 2,
    };
    const toCenter = {
      x: toPlacement.x + toPlacement.width / 2,
      y: toPlacement.y + toPlacement.height / 2,
    };

    const arrowX = Math.min(fromCenter.x, toCenter.x);
    const arrowY = Math.min(fromCenter.y, toCenter.y);

    const startX = fromCenter.x - arrowX;
    const startY = fromCenter.y - arrowY;
    const endX = toCenter.x - arrowX;
    const endY = toCenter.y - arrowY;

    const basePoints = [startX, startY, endX, endY] as const;
    const points =
      options.arrowStyle === "curve"
        ? ensureCurvePoints([...basePoints])
        : [...basePoints];

    const arrowElement: CanvasElement = {
      id: nanoid(),
      type: "arrow",
      x: arrowX,
      y: arrowY,
      width: Math.abs(toCenter.x - fromCenter.x) || 1,
      height: Math.abs(toCenter.y - fromCenter.y) || 1,
      points,
      strokeColor: options.strokeColor,
      strokeOpacity: options.strokeOpacity,
      fillColor: options.fillColor,
      fillOpacity: options.fillOpacity,
      strokeWidth: options.strokeWidth,
      strokeStyle: options.strokeStyle,
      opacity: options.opacity,
      sloppiness: options.sloppiness,
      arrowType: options.arrowType,
      arrowStyle: options.arrowStyle,
    } as CanvasElement;

    elements.push(arrowElement);
  });

  if (kind === "flowchart") {
    elements.forEach((element) => {
      if (element.type !== "rectangle" && element.type !== "diamond") {
        return;
      }

      const elementWidth = element.width ?? 0;
      const elementHeight = element.height ?? 0;

      const maxTextWidth = Math.max(elementWidth - 24, 0);
      const fontSize = element.fontSize ?? options.textFontSize;
      const textContent = element.text ?? "";
      const estimatedHeight = estimateTextBoxHeight(textContent, fontSize);
      const estimatedWidth = estimateTextBoxWidth(textContent, fontSize);

      if (
        estimatedHeight + 16 > elementHeight ||
        estimatedWidth + 24 > elementWidth
      ) {
        const textElement: CanvasElement = {
          id: nanoid(),
          type: "text",
          x: element.x,
          y: element.y + elementHeight + 12,
          width: Math.max(maxTextWidth, elementWidth),
          height: estimatedHeight,
          strokeColor: options.strokeColor,
          strokeOpacity: options.strokeOpacity,
          fillColor: options.penBackground,
          fillOpacity: 1,
          strokeWidth: 0,
          strokeStyle: "solid",
          opacity: options.opacity,
          sloppiness: options.sloppiness,
          text: element.text ?? "",
          fontFamily: element.fontFamily ?? options.textFontFamily,
          fontSize,
          textAlign: "left",
        };

        element.text = "";
        elements.push(textElement);
        selectionIds.push(textElement.id);
      }
    });
  }

  const summaryLabels = response.nodes.slice(0, 4).map((node) => node.label);

  return {
    elements,
    nodeCount: response.nodes.length,
    edgeCount: response.edges.length,
    selectionIds,
    summaryLabels,
  };
};

export const insertDiagramElements = (elements: CanvasElement[], selectionIds: string[]) => {
  if (elements.length === 0) {
    return;
  }
  const store = useWhiteboardStore.getState();
  const originalPushHistory = store.pushHistory;
  const insertedIds: string[] = [];

  try {
    store.pushHistory = () => {};
    elements.forEach((element) => {
      store.addElement(element);
      insertedIds.push(element.id);
    });
  } finally {
    store.pushHistory = originalPushHistory;
  }

  store.pushHistory();
  store.setSelectedIds(selectionIds.length > 0 ? selectionIds : insertedIds);
};
