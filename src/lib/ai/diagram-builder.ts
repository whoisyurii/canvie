import { nanoid } from "nanoid";

import { estimateTextBoxHeight, estimateTextBoxWidth } from "@/lib/canvas/text";
import {
  useWhiteboardStore,
  type CanvasElement,
  type CornerStyle,
} from "@/lib/store/useWhiteboardStore";
import { ensureCurvePoints } from "@/lib/canvas/geometry";

import {
  GeminiResponseError,
  type GeminiDiagramKind,
  type GeminiDiagramResponse,
} from "./gemini";
import {
  FLOWCHART_NODE_HEIGHT,
  FLOWCHART_NODE_WIDTH,
  FLOWCHART_VERTICAL_GAP,
  resolveFlowchartTemplate,
} from "./patterns/flowchart";
import type { FlowchartTemplateId } from "./patterns/flowchart";
import { classifyMindMapNodes } from "./patterns/mind-map";

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

interface FlowchartLayoutResult {
  templateId: FlowchartTemplateId;
  nodes: Map<string, DiagramLayoutEntry>;
  edgeRoutes: Map<string, { points: Array<{ x: number; y: number }> }>;
  horizontalSpacing: number;
  verticalSpacing: number;
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
  response: GeminiDiagramResponse,
  center: { x: number; y: number },
  baseFontSize: number,
): FlowchartLayoutResult | null => {
  if (response.nodes.length === 0) {
    return null;
  }

  const match = resolveFlowchartTemplate(response);
  if (!match) {
    return null;
  }

  const columnValues = Array.from(new Set(match.columns.values())).sort((a, b) => a - b);
  if (columnValues.length === 0) {
    columnValues.push(0);
  }

  const columnIndex = new Map<number, number>();
  columnValues.forEach((value, index) => {
    columnIndex.set(value, index);
  });

  const levelValues = Array.from(new Set(match.levels.values()));
  if (levelValues.length === 0) {
    levelValues.push(0);
  }
  const minLevel = Math.min(...levelValues);
  const maxLevel = Math.max(...levelValues);

  const columnCount = columnValues.length;
  const rowCount = maxLevel - minLevel + 1;

  const totalWidth =
    columnCount * FLOWCHART_NODE_WIDTH + (columnCount - 1) * match.horizontalSpacing;
  const totalHeight = rowCount * FLOWCHART_NODE_HEIGHT + (rowCount - 1) * match.verticalSpacing;

  const originX = center.x - totalWidth / 2;
  const originY = center.y - totalHeight / 2;

  const layout = new Map<string, DiagramLayoutEntry>();

  response.nodes.forEach((node) => {
    const column = columnIndex.get(match.columns.get(node.id) ?? 0) ?? 0;
    const level = match.levels.get(node.id) ?? 0;
    const rowIndex = level - minLevel;

    const x = originX + column * (FLOWCHART_NODE_WIDTH + match.horizontalSpacing);
    const y = originY + rowIndex * (FLOWCHART_NODE_HEIGHT + match.verticalSpacing);

    const normalizedType = node.type.toLowerCase();
    const shape = match.shapes.get(node.id)
      ? match.shapes.get(node.id)!
      : normalizedType.includes("decision")
        ? "diamond"
        : "rectangle";

    layout.set(node.id, {
      x,
      y,
      width: FLOWCHART_NODE_WIDTH,
      height: FLOWCHART_NODE_HEIGHT,
      shape,
      fontSize: baseFontSize,
      textAlign: "center",
    });
  });

  const edgeRoutes = new Map<string, { points: Array<{ x: number; y: number }> }>();

  const getCenter = (placement: DiagramLayoutEntry) => ({
    x: placement.x + placement.width / 2,
    y: placement.y + placement.height / 2,
  });

  response.edges.forEach((edge) => {
    const fromPlacement = layout.get(edge.from);
    const toPlacement = layout.get(edge.to);
    if (!fromPlacement || !toPlacement) {
      return;
    }

    const fromCenter = getCenter(fromPlacement);
    const toCenter = getCenter(toPlacement);

    const fromColumn = match.columns.get(edge.from) ?? 0;
    const toColumn = match.columns.get(edge.to) ?? fromColumn;

    if (fromColumn === toColumn) {
      edgeRoutes.set(`${edge.from}->${edge.to}`, { points: [fromCenter, toCenter] });
      return;
    }

    const fromAnchorY =
      toCenter.y >= fromCenter.y ? fromPlacement.y + fromPlacement.height : fromPlacement.y;
    const start = { x: fromCenter.x, y: fromAnchorY };

    const toAnchorY = toCenter.y >= fromCenter.y ? toPlacement.y : toPlacement.y + toPlacement.height;
    const end = { x: toCenter.x, y: toAnchorY };

    const intermediateY = start.y + (end.y - start.y) / 2;
    const pathPoints = [
      start,
      { x: start.x, y: intermediateY },
      { x: end.x, y: intermediateY },
      end,
    ];

    edgeRoutes.set(`${edge.from}->${edge.to}`, { points: pathPoints });
  });

  return {
    templateId: match.templateId,
    nodes: layout,
    edgeRoutes,
    horizontalSpacing: match.horizontalSpacing,
    verticalSpacing: match.verticalSpacing,
  };
};

const fallbackSequentialLayout = (
  nodes: GeminiDiagramResponse["nodes"],
  center: { x: number; y: number },
  baseFontSize: number,
): Map<string, DiagramLayoutEntry> => {
  const layout = new Map<string, DiagramLayoutEntry>();
  if (nodes.length === 0) {
    return layout;
  }

  const totalHeight =
    nodes.length * FLOWCHART_NODE_HEIGHT + (nodes.length - 1) * FLOWCHART_VERTICAL_GAP;
  const startY = center.y - totalHeight / 2;
  const startX = center.x - FLOWCHART_NODE_WIDTH / 2;

  nodes.forEach((node, index) => {
    const typeLower = node.type.toLowerCase();
    const shape = typeLower.includes("decision") ? "diamond" : "rectangle";
    const y = startY + index * (FLOWCHART_NODE_HEIGHT + FLOWCHART_VERTICAL_GAP);

    layout.set(node.id, {
      x: startX,
      y,
      width: FLOWCHART_NODE_WIDTH,
      height: FLOWCHART_NODE_HEIGHT,
      shape,
      fontSize: baseFontSize,
      textAlign: "center",
    });
  });

  return layout;
};

const RADIAL_SECONDARY_FONT_STEP = -2;
const QUADRANT_PRIMARY_DISTANCE = MINDMAP_RADIAL_SPACING;
const QUADRANT_DETAIL_DISTANCE = MINDMAP_RADIAL_SPACING * 1.6;
const QUADRANT_DETAIL_STACK = MINDMAP_BRANCH_HEIGHT + 40;
const TIMELINE_HORIZONTAL_STEP = 320;
const TIMELINE_LANE_OFFSET = MINDMAP_RADIAL_SPACING / 1.6;
const TIMELINE_DETAIL_STACK = MINDMAP_BRANCH_HEIGHT + 40;

const compareMindMapNodes = (
  a: ReturnType<typeof classifyMindMapNodes>["nodes"][number],
  b: ReturnType<typeof classifyMindMapNodes>["nodes"][number],
) => {
  if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
    return a.order - b.order;
  }
  if (a.order !== undefined && b.order === undefined) {
    return -1;
  }
  if (a.order === undefined && b.order !== undefined) {
    return 1;
  }
  return a.label.localeCompare(b.label);
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

  const classification = classifyMindMapNodes(response);

  const centerPlacement = {
    x: center.x - MINDMAP_CENTRAL_WIDTH / 2,
    y: center.y - MINDMAP_CENTRAL_HEIGHT / 2,
    width: MINDMAP_CENTRAL_WIDTH,
    height: MINDMAP_CENTRAL_HEIGHT,
    shape: "rectangle" as const,
    fontSize: baseFontSize + 4,
    textAlign: "center" as const,
  } satisfies DiagramLayoutEntry;

  const centralNode = classification.nodes.find((node) => node.templateRole === "central");
  if (centralNode) {
    layout.set(centralNode.id, centerPlacement);
  }

  if (classification.templateId === "mindmap.radial") {
    const byLevel = new Map<number, typeof classification.nodes>();
    classification.nodes.forEach((node) => {
      if (node.templateRole === "central") {
        return;
      }
      if (!byLevel.has(node.level)) {
        byLevel.set(node.level, []);
      }
      byLevel.get(node.level)!.push(node);
    });

    const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    levels.forEach((level) => {
      const nodes = byLevel.get(level)!;
      nodes.sort(compareMindMapNodes);
      const radius = MINDMAP_RADIAL_SPACING * Math.max(1, level);
      nodes.forEach((node, index) => {
        const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = center.x + Math.cos(angle) * radius - MINDMAP_BRANCH_WIDTH / 2;
        const y = center.y + Math.sin(angle) * radius - MINDMAP_BRANCH_HEIGHT / 2;
        const fontSize =
          node.templateRole === "radial-secondary" && level >= 2
            ? Math.max(12, baseFontSize + RADIAL_SECONDARY_FONT_STEP)
            : baseFontSize;
        layout.set(node.id, {
          x,
          y,
          width: MINDMAP_BRANCH_WIDTH,
          height: MINDMAP_BRANCH_HEIGHT,
          shape: "rectangle",
          fontSize,
          textAlign: "center",
        });
      });
    });

    return layout;
  }

  if (classification.templateId === "mindmap.quadrant") {
    const angleByQuadrant = {
      north: -Math.PI / 2,
      east: 0,
      south: Math.PI / 2,
      west: Math.PI,
    } as const;

    const primaryByQuadrant = new Map<"north" | "east" | "south" | "west", typeof classification.nodes>();
    const detailByQuadrant = new Map<"north" | "east" | "south" | "west", typeof classification.nodes>();

    classification.nodes.forEach((node) => {
      if (node.templateRole === "central") {
        return;
      }
      if (!node.quadrant) {
        throw new GeminiResponseError(`Quadrant template node "${node.label}" is missing quadrant metadata.`);
      }
      const bucket = node.templateRole === "quadrant-anchor" ? primaryByQuadrant : detailByQuadrant;
      if (!bucket.has(node.quadrant)) {
        bucket.set(node.quadrant, []);
      }
      bucket.get(node.quadrant)!.push(node);
    });

    (Object.keys(angleByQuadrant) as Array<keyof typeof angleByQuadrant>).forEach((quadrant) => {
      const primaryNodes = primaryByQuadrant.get(quadrant) ?? [];
      const detailNodes = detailByQuadrant.get(quadrant) ?? [];
      const angle = angleByQuadrant[quadrant];

      primaryNodes
        .sort(compareMindMapNodes)
        .forEach((node, index) => {
          const distance = QUADRANT_PRIMARY_DISTANCE + index * 60;
          const x = center.x + Math.cos(angle) * distance - MINDMAP_BRANCH_WIDTH / 2;
          const y = center.y + Math.sin(angle) * distance - MINDMAP_BRANCH_HEIGHT / 2;
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

      detailNodes
        .sort(compareMindMapNodes)
        .forEach((node, index) => {
          const distance = QUADRANT_DETAIL_DISTANCE + index * QUADRANT_DETAIL_STACK;
          const x = center.x + Math.cos(angle) * distance - MINDMAP_BRANCH_WIDTH / 2;
          const y = center.y + Math.sin(angle) * distance - MINDMAP_BRANCH_HEIGHT / 2;
          layout.set(node.id, {
            x,
            y,
            width: MINDMAP_BRANCH_WIDTH,
            height: MINDMAP_BRANCH_HEIGHT,
            shape: "rectangle",
            fontSize: baseFontSize - 2,
            textAlign: "center",
          });
        });
    });

    return layout;
  }

  // timeline
  const anchors = classification.nodes.filter((node) => node.templateRole === "timeline-anchor");
  const details = classification.nodes.filter((node) => node.templateRole === "timeline-detail");

  if (anchors.length === 0) {
    throw new GeminiResponseError("Timeline mind map requires at least one anchor node.");
  }

  anchors.sort(compareMindMapNodes);

  const axisWidth = (anchors.length - 1) * TIMELINE_HORIZONTAL_STEP;
  const axisStart = center.x - axisWidth / 2;
  const anchorCenters = new Map<string, { x: number; y: number }>();

  anchors.forEach((anchor, index) => {
    const centerX = axisStart + index * TIMELINE_HORIZONTAL_STEP;
    const x = centerX - MINDMAP_BRANCH_WIDTH / 2;
    const y = center.y - MINDMAP_BRANCH_HEIGHT / 2;

    layout.set(anchor.id, {
      x,
      y,
      width: MINDMAP_BRANCH_WIDTH,
      height: MINDMAP_BRANCH_HEIGHT,
      shape: "rectangle",
      fontSize: baseFontSize,
      textAlign: "center",
    });

    anchorCenters.set(anchor.id, { x: centerX, y: center.y });
  });

  if (centralNode && !layout.has(centralNode.id)) {
    layout.set(centralNode.id, centerPlacement);
  }

  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const detailAssignments = new Map<string, string>();
  const detailIds = new Set(details.map((detail) => detail.id));

  response.edges.forEach((edge) => {
    if (anchorIds.has(edge.from) && detailIds.has(edge.to)) {
      detailAssignments.set(edge.to, edge.from);
    }
    if (anchorIds.has(edge.to) && detailIds.has(edge.from)) {
      detailAssignments.set(edge.from, edge.to);
    }
  });

  const groupedDetails = new Map<string, { upper: typeof details; lower: typeof details }>();

  details.forEach((detail) => {
    const parentId = detailAssignments.get(detail.id) ?? anchors[0]?.id;
    if (!parentId) {
      throw new GeminiResponseError(`Timeline detail "${detail.label}" could not be associated with an anchor node.`);
    }

    const lane = detail.lane ?? "upper";
    if (!groupedDetails.has(parentId)) {
      groupedDetails.set(parentId, { upper: [], lower: [] });
    }
    groupedDetails.get(parentId)![lane === "upper" ? "upper" : "lower"].push(detail);
  });

  groupedDetails.forEach((lanes, parentId) => {
    const parentCenter = anchorCenters.get(parentId);
    if (!parentCenter) {
      throw new GeminiResponseError(`Timeline detail references unknown anchor "${parentId}".`);
    }

    (Object.entries(lanes) as Array<["upper" | "lower", typeof details]>).forEach(([lane, items]) => {
      const laneOffset = lane === "upper" ? -TIMELINE_LANE_OFFSET : TIMELINE_LANE_OFFSET;
      items.sort(compareMindMapNodes).forEach((detail, index) => {
        const y = parentCenter.y + laneOffset - MINDMAP_BRANCH_HEIGHT / 2 + index * TIMELINE_DETAIL_STACK;
        const x = parentCenter.x - MINDMAP_BRANCH_WIDTH / 2;

        layout.set(detail.id, {
          x,
          y,
          width: MINDMAP_BRANCH_WIDTH,
          height: MINDMAP_BRANCH_HEIGHT,
          shape: "rectangle",
          fontSize: Math.max(12, baseFontSize - 2),
          textAlign: "center",
        });
      });
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
  const flowchartLayout =
    kind === "flowchart" ? layoutFlowchartNodes(response, center, options.textFontSize) : null;
  const layout =
    kind === "flowchart"
      ? flowchartLayout?.nodes ?? fallbackSequentialLayout(response.nodes, center, options.textFontSize)
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

    const key = `${edge.from}->${edge.to}`;
    const routedPoints = flowchartLayout?.edgeRoutes.get(key)?.points;

    if (routedPoints && routedPoints.length >= 2) {
      const xs = routedPoints.map((point) => point.x);
      const ys = routedPoints.map((point) => point.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      const normalizedPoints: number[] = [];
      routedPoints.forEach((point) => {
        normalizedPoints.push(point.x - minX, point.y - minY);
      });

      const arrowElement: CanvasElement = {
        id: nanoid(),
        type: "arrow",
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(maxY - minY, 1),
        points: normalizedPoints,
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
      };

      elements.push(arrowElement);
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

    const basePoints: number[] = [startX, startY, endX, endY];
    const points =
      options.arrowStyle === "curve" && basePoints.length === 4
        ? ensureCurvePoints(basePoints)
        : basePoints;

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
    };

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
