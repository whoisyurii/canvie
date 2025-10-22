import type { GeminiDiagramResponse } from "../../ai/gemini";

export const FLOWCHART_NODE_WIDTH = 240;
export const FLOWCHART_NODE_HEIGHT = 120;
export const FLOWCHART_VERTICAL_GAP = 90;
export const FLOWCHART_HORIZONTAL_GAP = 180;

export type FlowchartTemplateId = "linear" | "decision-split" | "swimlane";

export interface FlowchartTemplateMatch {
  templateId: FlowchartTemplateId;
  columns: Map<string, number>;
  levels: Map<string, number>;
  shapes: Map<string, "rectangle" | "diamond">;
  horizontalSpacing: number;
  verticalSpacing: number;
}

interface FlowchartAnalysis {
  nodes: GeminiDiagramResponse["nodes"];
  edges: GeminiDiagramResponse["edges"];
  incoming: Map<string, Set<string>>;
  outgoing: Map<string, Set<string>>;
  rootIds: string[];
}

const normalizeType = (type: string) => type.trim().toLowerCase();

const analyzeFlowchart = (response: GeminiDiagramResponse): FlowchartAnalysis => {
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();

  response.nodes.forEach((node) => {
    incoming.set(node.id, new Set());
    outgoing.set(node.id, new Set());
  });

  response.edges.forEach((edge) => {
    if (!incoming.has(edge.to)) {
      incoming.set(edge.to, new Set());
    }
    if (!outgoing.has(edge.from)) {
      outgoing.set(edge.from, new Set());
    }
    incoming.get(edge.to)?.add(edge.from);
    outgoing.get(edge.from)?.add(edge.to);
  });

  const rootIds = response.nodes
    .filter((node) => (incoming.get(node.id)?.size ?? 0) === 0)
    .map((node) => node.id);

  if (rootIds.length === 0 && response.nodes.length > 0) {
    rootIds.push(response.nodes[0].id);
  }

  return {
    nodes: response.nodes,
    edges: response.edges,
    incoming,
    outgoing,
    rootIds,
  };
};

const computeLevels = (analysis: FlowchartAnalysis) => {
  const queue: Array<{ id: string; level: number }> = [];
  const levels = new Map<string, number>();
  const visited = new Set<string>();

  analysis.rootIds.forEach((rootId) => {
    queue.push({ id: rootId, level: 0 });
    levels.set(rootId, 0);
  });

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    visited.add(current.id);

    const neighbors = analysis.outgoing.get(current.id);
    if (!neighbors) {
      continue;
    }

    neighbors.forEach((neighbor) => {
      const nextLevel = current.level + 1;
      const existing = levels.get(neighbor);
      if (existing === undefined || nextLevel > existing) {
        levels.set(neighbor, nextLevel);
      }
      if (!visited.has(neighbor)) {
        queue.push({ id: neighbor, level: nextLevel });
      }
    });
  }

  analysis.nodes.forEach((node) => {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  });

  return levels;
};

const identifyDecisionNode = (analysis: FlowchartAnalysis) => {
  const decisionByType = analysis.nodes.find((node) =>
    normalizeType(node.type).includes("decision"),
  );
  if (decisionByType) {
    return decisionByType.id;
  }

  let candidate: { id: string; degree: number } | undefined;
  analysis.nodes.forEach((node) => {
    const degree = analysis.outgoing.get(node.id)?.size ?? 0;
    if (!candidate || degree > candidate.degree) {
      candidate = { id: node.id, degree };
    }
  });

  return candidate?.degree && candidate.degree > 1 ? candidate.id : undefined;
};

const propagateBranchColumns = (
  analysis: FlowchartAnalysis,
  decisionId: string,
  branchColumns: Map<string, number>,
) => {
  const outgoing = Array.from(analysis.outgoing.get(decisionId) ?? []);
  const branchCount = outgoing.length;
  if (branchCount === 0) {
    return;
  }

  const offsets = outgoing.map((_, index) => {
    const relative = index - (branchCount - 1) / 2;
    return relative >= 0 ? Math.ceil(relative) : Math.floor(relative);
  });

  const joinCandidates = new Set<string>();

  const traverse = (startId: string, column: number) => {
    const stack = [startId];
    while (stack.length > 0) {
      const nodeId = stack.pop();
      if (!nodeId || nodeId === decisionId) {
        continue;
      }

      const existing = branchColumns.get(nodeId);
      if (existing !== undefined && existing !== 0 && existing !== column) {
        joinCandidates.add(nodeId);
        continue;
      }

      branchColumns.set(nodeId, column);

      const children = analysis.outgoing.get(nodeId);
      if (!children) {
        continue;
      }

      children.forEach((childId) => {
        if (childId === decisionId) {
          return;
        }
        const indegree = analysis.incoming.get(childId)?.size ?? 0;
        if (indegree > 1 && childId !== startId) {
          joinCandidates.add(childId);
          return;
        }
        stack.push(childId);
      });
    }
  };

  outgoing.forEach((childId, index) => {
    traverse(childId, offsets[index] === 0 ? (branchCount > 1 ? 1 : 0) : offsets[index]);
  });

  const queue = Array.from(joinCandidates);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    branchColumns.set(current, 0);
    const children = analysis.outgoing.get(current);
    if (!children) {
      continue;
    }
    children.forEach((childId) => {
      const existing = branchColumns.get(childId);
      if (existing !== undefined && existing !== 0) {
        branchColumns.set(childId, 0);
        queue.push(childId);
      }
    });
  }
};

const extractLaneName = (type: string, label: string) => {
  const laneMatch = type.match(/lane\s*:?(.*)$/i);
  if (laneMatch && laneMatch[1]) {
    return laneMatch[1].trim().toLowerCase();
  }

  const swimlaneMatch = type.match(/swimlane\s*:?(.*)$/i);
  if (swimlaneMatch && swimlaneMatch[1]) {
    return swimlaneMatch[1].trim().toLowerCase();
  }

  const labelMatch = label.match(/^(.*?)\s*:/);
  if (labelMatch && labelMatch[1]) {
    return labelMatch[1].trim().toLowerCase();
  }

  return undefined;
};

const buildLinearTemplate = (
  analysis: FlowchartAnalysis,
): FlowchartTemplateMatch => {
  const levels = computeLevels(analysis);
  const columns = new Map<string, number>();
  const shapes = new Map<string, "rectangle" | "diamond">();

  analysis.nodes.forEach((node) => {
    columns.set(node.id, 0);
    const normalized = normalizeType(node.type);
    shapes.set(node.id, normalized.includes("decision") ? "diamond" : "rectangle");
  });

  return {
    templateId: "linear",
    columns,
    levels,
    shapes,
    horizontalSpacing: FLOWCHART_HORIZONTAL_GAP,
    verticalSpacing: FLOWCHART_VERTICAL_GAP,
  };
};

const buildDecisionSplitTemplate = (
  analysis: FlowchartAnalysis,
  decisionId: string,
): FlowchartTemplateMatch => {
  const levels = computeLevels(analysis);
  const columns = new Map<string, number>();
  const shapes = new Map<string, "rectangle" | "diamond">();

  analysis.nodes.forEach((node) => {
    const normalized = normalizeType(node.type);
    shapes.set(node.id, normalized.includes("decision") ? "diamond" : "rectangle");
    columns.set(node.id, 0);
  });

  propagateBranchColumns(analysis, decisionId, columns);
  columns.set(decisionId, 0);

  return {
    templateId: "decision-split",
    columns,
    levels,
    shapes,
    horizontalSpacing: Math.max(FLOWCHART_HORIZONTAL_GAP, FLOWCHART_NODE_WIDTH / 2),
    verticalSpacing: FLOWCHART_VERTICAL_GAP,
  };
};

const buildSwimlaneTemplate = (
  analysis: FlowchartAnalysis,
  laneGroups: Map<string, string>,
): FlowchartTemplateMatch => {
  const levels = computeLevels(analysis);
  const columns = new Map<string, number>();
  const shapes = new Map<string, "rectangle" | "diamond">();

  const lanes = Array.from(new Set(laneGroups.values()));
  const laneIndex = new Map<string, number>();
  lanes.forEach((lane, index) => laneIndex.set(lane, index));

  analysis.nodes.forEach((node) => {
    const lane = laneGroups.get(node.id) ?? lanes[0] ?? "";
    columns.set(node.id, laneIndex.get(lane) ?? 0);
    const normalized = normalizeType(node.type);
    shapes.set(node.id, normalized.includes("decision") ? "diamond" : "rectangle");
  });

  return {
    templateId: "swimlane",
    columns,
    levels,
    shapes,
    horizontalSpacing: FLOWCHART_HORIZONTAL_GAP,
    verticalSpacing: FLOWCHART_VERTICAL_GAP,
  };
};

export const resolveFlowchartTemplate = (
  response: GeminiDiagramResponse,
): FlowchartTemplateMatch | null => {
  if (response.nodes.length === 0) {
    return null;
  }

  const analysis = analyzeFlowchart(response);

  const laneGroups = new Map<string, string>();
  analysis.nodes.forEach((node) => {
    const lane = extractLaneName(node.type, node.label);
    if (lane) {
      laneGroups.set(node.id, lane);
    }
  });

  if (laneGroups.size >= 2) {
    return buildSwimlaneTemplate(analysis, laneGroups);
  }

  const branchNode = identifyDecisionNode(analysis);
  if (branchNode) {
    const branchSize = analysis.outgoing.get(branchNode)?.size ?? 0;
    if (branchSize > 1) {
      return buildDecisionSplitTemplate(analysis, branchNode);
    }
  }

  return buildLinearTemplate(analysis);
};

