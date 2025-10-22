import { GeminiResponseError, type GeminiDiagramResponse } from "../gemini";

export const MIND_MAP_TEMPLATE_IDS = [
  "mindmap.radial",
  "mindmap.quadrant",
  "mindmap.timeline",
] as const;

export type MindMapTemplateId = (typeof MIND_MAP_TEMPLATE_IDS)[number];

export interface MindMapRoleDefinition {
  id: string;
  label: string;
  description: string;
  level: number;
}

export interface MindMapTemplateDefinition {
  id: MindMapTemplateId;
  label: string;
  description: string;
  roles: MindMapRoleDefinition[];
}

export const MIND_MAP_TEMPLATES: Record<MindMapTemplateId, MindMapTemplateDefinition> = {
  "mindmap.radial": {
    id: "mindmap.radial",
    label: "Radial mind map",
    description:
      "Places one central concept at the center with concentric rings of primary and secondary ideas spreading outward.",
    roles: [
      {
        id: "central",
        label: "Central idea",
        description: "Exactly one node that represents the core topic.",
        level: 0,
      },
      {
        id: "primary",
        label: "Primary branch",
        description: "First ring of nodes radiating from the center.",
        level: 1,
      },
      {
        id: "secondary",
        label: "Secondary branch",
        description: "Optional second ring of supporting ideas.",
        level: 2,
      },
    ],
  },
  "mindmap.quadrant": {
    id: "mindmap.quadrant",
    label: "Quadrant mind map",
    description:
      "Divides the canvas into four directional quadrants with a central theme and quadrant anchors supported by detail nodes.",
    roles: [
      {
        id: "central",
        label: "Central idea",
        description: "Exactly one node in the middle connecting all quadrants.",
        level: 0,
      },
      {
        id: "quadrant-anchor",
        label: "Quadrant anchor",
        description: "Primary node within a quadrant (north, east, south, west).",
        level: 1,
      },
      {
        id: "quadrant-detail",
        label: "Quadrant detail",
        description: "Supporting node that sits further out from its quadrant anchor.",
        level: 2,
      },
    ],
  },
  "mindmap.timeline": {
    id: "mindmap.timeline",
    label: "Timeline mind map",
    description:
      "Organises information along a horizontal sequence with milestones and optional notes above or below the axis.",
    roles: [
      {
        id: "timeline-anchor",
        label: "Timeline anchor",
        description: "Milestones such as start, intermediate events, or the ending point placed on the main axis.",
        level: 0,
      },
      {
        id: "timeline-detail",
        label: "Timeline detail",
        description: "Notes that live above or below a milestone.",
        level: 1,
      },
    ],
  },
};

type QuadrantDirection = "north" | "east" | "south" | "west";
type TimelineLane = "upper" | "lower";

type MindMapTemplateRole =
  | "central"
  | "radial-primary"
  | "radial-secondary"
  | "quadrant-anchor"
  | "quadrant-detail"
  | "timeline-anchor"
  | "timeline-detail";

export interface MindMapNodePlacementHint {
  id: string;
  label: string;
  templateRole: MindMapTemplateRole;
  level: number;
  order?: number;
  quadrant?: QuadrantDirection;
  lane?: TimelineLane;
  subRole?: "start" | "milestone" | "end";
}

export interface MindMapClassification {
  templateId: MindMapTemplateId;
  nodes: MindMapNodePlacementHint[];
}

const tokenise = (...sources: Array<string | undefined>) => {
  const tokens = new Set<string>();
  sources.forEach((source) => {
    if (!source) {
      return;
    }

    source
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .forEach((token) => tokens.add(token));
  });
  return tokens;
};

export const isMindMapTemplateId = (value?: string | null): value is MindMapTemplateId => {
  if (!value) {
    return false;
  }
  return (MIND_MAP_TEMPLATE_IDS as readonly string[]).includes(value.toLowerCase());
};

const detectTemplateId = (
  response: GeminiDiagramResponse,
  hint?: string,
): MindMapTemplateId => {
  if (hint && isMindMapTemplateId(hint)) {
    return hint.toLowerCase() as MindMapTemplateId;
  }

  const nodeTokens = new Set<string>();
  response.nodes.forEach((node) => {
    const tokens = tokenise(node.templateRole, node.role, node.type);
    tokens.forEach((token) => nodeTokens.add(token));
  });

  if (["timeline", "chronology", "sequence"].some((token) => nodeTokens.has(token))) {
    return "mindmap.timeline";
  }

  if (
    ["quadrant", "north", "south", "east", "west", "axis", "compass"].some((token) =>
      nodeTokens.has(token),
    )
  ) {
    return "mindmap.quadrant";
  }

  return "mindmap.radial";
};

const ensureCentralNode = (nodes: MindMapNodePlacementHint[], templateId: MindMapTemplateId) => {
  const centralNodes = nodes.filter((node) => node.templateRole === "central");
  if (centralNodes.length !== 1) {
    throw new GeminiResponseError(
      `Mind map template "${templateId}" requires exactly one central node (received ${centralNodes.length}).`,
    );
  }
};

const parseQuadrantDirection = (tokens: Set<string>, fallback?: string): QuadrantDirection | undefined => {
  const allTokens = new Set(tokens);
  if (fallback) {
    tokenise(fallback).forEach((token) => allTokens.add(token));
  }

  if (allTokens.has("north") || allTokens.has("n")) {
    return "north";
  }
  if (allTokens.has("east") || allTokens.has("e")) {
    return "east";
  }
  if (allTokens.has("south") || allTokens.has("s")) {
    return "south";
  }
  if (allTokens.has("west") || allTokens.has("w")) {
    return "west";
  }
  return undefined;
};

const parseTimelineLane = (tokens: Set<string>, fallback?: string): TimelineLane | undefined => {
  const allTokens = new Set(tokens);
  if (fallback) {
    tokenise(fallback).forEach((token) => allTokens.add(token));
  }

  if (allTokens.has("upper") || allTokens.has("top") || allTokens.has("north")) {
    return "upper";
  }
  if (allTokens.has("lower") || allTokens.has("bottom") || allTokens.has("south")) {
    return "lower";
  }
  return undefined;
};

const sortByOrderThenLabel = (a: MindMapNodePlacementHint, b: MindMapNodePlacementHint) => {
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

const classifyRadialTemplate = (
  response: GeminiDiagramResponse,
): MindMapNodePlacementHint[] => {
  const hints: MindMapNodePlacementHint[] = [];

  response.nodes.forEach((node) => {
    const tokens = tokenise(node.templateRole, node.role, node.type);
    let templateRole: MindMapTemplateRole | undefined;

    if (tokens.has("central") || tokens.has("center") || node.level === 0) {
      templateRole = "central";
    } else if (tokens.has("secondary") || tokens.has("detail") || (node.level ?? 0) >= 2) {
      templateRole = "radial-secondary";
    } else if (tokens.has("primary") || tokens.has("branch") || node.level === 1) {
      templateRole = "radial-primary";
    }

    if (!templateRole) {
      throw new GeminiResponseError(
        `Unable to determine radial role for node "${node.label}". Provide role metadata (central, primary, secondary).`,
      );
    }

    const level =
      node.level !== undefined
        ? Math.max(0, node.level)
        : templateRole === "central"
          ? 0
          : templateRole === "radial-primary"
            ? 1
            : 2;

    hints.push({
      id: node.id,
      label: node.label,
      templateRole,
      level,
      order: node.order,
    });
  });

  ensureCentralNode(hints, "mindmap.radial");
  return hints.sort(sortByOrderThenLabel);
};

const classifyQuadrantTemplate = (
  response: GeminiDiagramResponse,
): MindMapNodePlacementHint[] => {
  const hints: MindMapNodePlacementHint[] = [];

  response.nodes.forEach((node) => {
    const tokens = tokenise(node.templateRole, node.role, node.type);

    if (tokens.has("central") || tokens.has("center") || node.level === 0) {
      hints.push({
        id: node.id,
        label: node.label,
        templateRole: "central",
        level: 0,
      });
      return;
    }

    const direction = parseQuadrantDirection(tokens, node.quadrant);
    if (!direction) {
      throw new GeminiResponseError(
        `Quadrant mind map nodes must specify a direction (north, east, south, west). Node "${node.label}" is missing this metadata.`,
      );
    }

    const isDetail = tokens.has("detail") || tokens.has("secondary") || (node.level ?? 0) >= 2;
    const level =
      node.level !== undefined
        ? Math.max(0, node.level)
        : isDetail
          ? 2
          : 1;

    hints.push({
      id: node.id,
      label: node.label,
      templateRole: isDetail ? "quadrant-detail" : "quadrant-anchor",
      level,
      order: node.order,
      quadrant: direction,
    });
  });

  ensureCentralNode(hints, "mindmap.quadrant");
  return hints.sort(sortByOrderThenLabel);
};

const classifyTimelineTemplate = (
  response: GeminiDiagramResponse,
): MindMapNodePlacementHint[] => {
  const hints: MindMapNodePlacementHint[] = [];

  response.nodes.forEach((node) => {
    const tokens = tokenise(node.templateRole, node.role, node.type);
    const hasDetailToken =
      tokens.has("detail") || tokens.has("note") || tokens.has("annotation") || tokens.has("callout");

    if (hasDetailToken) {
      const lane = parseTimelineLane(tokens, node.lane);
      const resolvedLane = lane ?? ((node.level ?? 0) % 2 === 0 ? "upper" : "lower");

      hints.push({
        id: node.id,
        label: node.label,
        templateRole: "timeline-detail",
        level: node.level !== undefined ? Math.max(0, node.level) : 1,
        order: node.order,
        lane: resolvedLane,
      });
      return;
    }

    let subRole: MindMapNodePlacementHint["subRole"] = "milestone";
    if (tokens.has("start") || tokens.has("begin") || tokens.has("kickoff")) {
      subRole = "start";
    } else if (tokens.has("end") || tokens.has("finish") || tokens.has("close")) {
      subRole = "end";
    }

    const order = node.order ?? node.level;
    if (order === undefined) {
      throw new GeminiResponseError(
        `Timeline mind map nodes must provide an order or level to determine their horizontal position. Node "${node.label}" is missing this metadata.`,
      );
    }

    hints.push({
      id: node.id,
      label: node.label,
      templateRole: "timeline-anchor",
      level: node.level !== undefined ? Math.max(0, node.level) : 0,
      order,
      subRole,
    });
  });

  const anchorCount = hints.filter((hint) => hint.templateRole === "timeline-anchor").length;
  if (anchorCount === 0) {
    throw new GeminiResponseError("Timeline mind map responses must include at least one anchor node.");
  }

  return hints.sort(sortByOrderThenLabel);
};

export const classifyMindMapNodes = (
  response: GeminiDiagramResponse,
): MindMapClassification => {
  const templateId = detectTemplateId(response, response.template?.id);

  const nodes =
    templateId === "mindmap.radial"
      ? classifyRadialTemplate(response)
      : templateId === "mindmap.quadrant"
        ? classifyQuadrantTemplate(response)
        : classifyTimelineTemplate(response);

  return { templateId, nodes };
};
