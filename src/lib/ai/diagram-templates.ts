import type { GeminiDiagramKind } from "./gemini";

export interface DiagramTemplate {
  id: string;
  kind: GeminiDiagramKind;
  label: string;
  description: string;
}

interface KeywordMatcher {
  value: string;
  weight?: number;
}

interface PhraseMatcher {
  value: string;
  weight?: number;
}

interface PatternMatcher {
  label: string;
  pattern: RegExp;
  weight?: number;
}

interface CompiledMatchers {
  keywords: Array<{ token: string; weight: number }>;
  phrases: Array<{ label: string; regex: RegExp; weight: number }>;
  patterns: Array<{ label: string; regex: RegExp; weight: number }>;
  explicit: Array<{ label: string; regex: RegExp }>;
}

interface DiagramTemplateConfig {
  template: DiagramTemplate;
  keywords?: KeywordMatcher[];
  phrases?: PhraseMatcher[];
  patterns?: PatternMatcher[];
  explicit?: PhraseMatcher[];
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const phraseToRegex = (phrase: string) => {
  const escaped = escapeRegex(phrase.trim());
  const spaced = escaped.replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${spaced}\\b`, "i");
};

const keywordToToken = (keyword: string) => keyword.trim().toLowerCase();

const compileMatchers = (config: DiagramTemplateConfig): CompiledMatchers => ({
  keywords: (config.keywords ?? []).map((entry) => ({
    token: keywordToToken(entry.value),
    weight: entry.weight ?? 1,
  })),
  phrases: (config.phrases ?? []).map((entry) => ({
    label: entry.value,
    regex: phraseToRegex(entry.value),
    weight: entry.weight ?? 2,
  })),
  patterns: (config.patterns ?? []).map((entry) => ({
    label: entry.label,
    regex: entry.pattern,
    weight: entry.weight ?? 2,
  })),
  explicit: (config.explicit ?? []).map((entry) => ({
    label: entry.value,
    regex: phraseToRegex(entry.value),
  })),
});

interface InternalTemplate extends DiagramTemplateConfig {
  matchers: CompiledMatchers;
}

const createTemplate = (config: DiagramTemplateConfig): InternalTemplate => ({
  ...config,
  matchers: compileMatchers(config),
});

const templates: InternalTemplate[] = [
  createTemplate({
    template: {
      id: "mindmap.radial",
      kind: "mind-map",
      label: "Radial mind map",
      description: "Radiates spokes from a single central idea.",
    },
    keywords: [
      { value: "radial", weight: 4 },
      { value: "spider", weight: 3 },
      { value: "hub", weight: 2 },
      { value: "spoke", weight: 2 },
      { value: "center", weight: 1 },
    ],
    phrases: [
      { value: "hub and spoke", weight: 4 },
      { value: "central idea", weight: 2 },
      { value: "radial layout", weight: 4 },
    ],
    explicit: [
      { value: "radial mind map" },
      { value: "spider mind map" },
      { value: "mindmap.radial" },
    ],
  }),
  createTemplate({
    template: {
      id: "mindmap.quadrant",
      kind: "mind-map",
      label: "Quadrant mind map",
      description: "Splits the canvas into north, east, south, and west anchors.",
    },
    keywords: [
      { value: "quadrant", weight: 4 },
      { value: "north", weight: 2 },
      { value: "east", weight: 2 },
      { value: "south", weight: 2 },
      { value: "west", weight: 2 },
      { value: "matrix", weight: 2 },
    ],
    phrases: [
      { value: "2x2", weight: 4 },
      { value: "2 by 2", weight: 4 },
      { value: "four quadrants", weight: 5 },
      { value: "north star", weight: 3 },
      { value: "swot", weight: 5 },
    ],
    explicit: [
      { value: "quadrant mind map" },
      { value: "mindmap.quadrant" },
      { value: "swot mind map" },
    ],
  }),
  createTemplate({
    template: {
      id: "mindmap.timeline",
      kind: "mind-map",
      label: "Timeline mind map",
      description: "Places milestones along a horizontal axis with detail notes above or below.",
    },
    keywords: [
      { value: "timeline", weight: 5 },
      { value: "chronology", weight: 3 },
      { value: "chronological", weight: 3 },
      { value: "milestone", weight: 3 },
      { value: "roadmap", weight: 4 },
      { value: "schedule", weight: 2 },
      { value: "phases", weight: 2 },
    ],
    phrases: [
      { value: "project roadmap", weight: 5 },
      { value: "product roadmap", weight: 5 },
      { value: "timeline mind map", weight: 6 },
      { value: "quarterly plan", weight: 3 },
    ],
    explicit: [
      { value: "timeline mind map" },
      { value: "mindmap.timeline" },
      { value: "roadmap mind map" },
    ],
  }),
  createTemplate({
    template: {
      id: "linear",
      kind: "flowchart",
      label: "Linear flowchart",
      description: "Connects sequential steps without branching.",
    },
    keywords: [
      { value: "linear", weight: 5 },
      { value: "sequence", weight: 3 },
      { value: "process", weight: 2 },
      { value: "steps", weight: 2 },
      { value: "pipeline", weight: 3 },
    ],
    phrases: [
      { value: "step by step", weight: 5 },
      { value: "straight through", weight: 4 },
      { value: "simple flow", weight: 3 },
    ],
    explicit: [
      { value: "linear flowchart" },
      { value: "flowchart linear" },
      { value: "flowchart template linear" },
    ],
  }),
  createTemplate({
    template: {
      id: "decision-split",
      kind: "flowchart",
      label: "Decision split flowchart",
      description: "Highlights branching choices and converging paths.",
    },
    keywords: [
      { value: "decision", weight: 5 },
      { value: "branch", weight: 4 },
      { value: "conditional", weight: 3 },
      { value: "choice", weight: 3 },
      { value: "approval", weight: 2 },
    ],
    phrases: [
      { value: "yes or no", weight: 4 },
      { value: "if then", weight: 4 },
      { value: "branching flowchart", weight: 5 },
      { value: "decision tree", weight: 4 },
    ],
    explicit: [
      { value: "decision flowchart" },
      { value: "decision split" },
      { value: "flowchart decision" },
      { value: "flowchart template decision" },
    ],
  }),
  createTemplate({
    template: {
      id: "swimlane",
      kind: "flowchart",
      label: "Swimlane flowchart",
      description: "Organises steps by team or role across horizontal lanes.",
    },
    keywords: [
      { value: "swimlane", weight: 6 },
      { value: "lane", weight: 3 },
      { value: "handoff", weight: 4 },
      { value: "responsibility", weight: 4 },
      { value: "department", weight: 3 },
      { value: "team", weight: 2 },
      { value: "parallel", weight: 2 },
    ],
    phrases: [
      { value: "cross functional", weight: 4 },
      { value: "across teams", weight: 3 },
      { value: "lane based", weight: 3 },
    ],
    explicit: [
      { value: "swimlane flowchart" },
      { value: "flowchart swimlane" },
      { value: "flowchart template swimlane" },
    ],
    patterns: [
      { label: "team vs team", pattern: /\bteam\s+vs\s+team\b/i, weight: 3 },
      { label: "marketing vs sales", pattern: /\b(marketing|sales|support)\s+vs\s+(marketing|sales|support)\b/i, weight: 4 },
    ],
  }),
];

const tokenise = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

export const getDiagramTemplates = (): DiagramTemplate[] => templates.map((entry) => entry.template);

export const getDiagramTemplatesByKind = (kind: GeminiDiagramKind): DiagramTemplate[] =>
  templates.filter((entry) => entry.template.kind === kind).map((entry) => entry.template);

export const findDiagramTemplateById = (id?: string | null): DiagramTemplate | undefined => {
  if (!id) {
    return undefined;
  }
  const matchId = id.trim().toLowerCase();
  return templates.find((entry) => entry.template.id.toLowerCase() === matchId)?.template;
};

export type DiagramTemplateMatchReason = "explicit" | "keyword";

export interface DiagramTemplateMatch {
  template: DiagramTemplate;
  score: number;
  reason?: DiagramTemplateMatchReason;
  matches: string[];
}

export interface DiagramPromptClassification {
  best?: DiagramTemplateMatch;
  suggestions: DiagramTemplateMatch[];
}

const evaluateTemplate = (
  entry: InternalTemplate,
  prompt: string,
  tokens: Set<string>,
): DiagramTemplateMatch => {
  const matches: string[] = [];
  let score = 0;

  for (const explicit of entry.matchers.explicit) {
    if (explicit.regex.test(prompt)) {
      matches.push(explicit.label);
      return {
        template: entry.template,
        score: 100 + matches.length,
        reason: "explicit",
        matches,
      };
    }
  }

  for (const phrase of entry.matchers.phrases) {
    if (phrase.regex.test(prompt)) {
      matches.push(phrase.label);
      score += phrase.weight;
    }
  }

  for (const pattern of entry.matchers.patterns) {
    if (pattern.regex.test(prompt)) {
      matches.push(pattern.label);
      score += pattern.weight;
    }
  }

  for (const keyword of entry.matchers.keywords) {
    if (tokens.has(keyword.token)) {
      matches.push(keyword.token);
      score += keyword.weight;
    }
  }

  return {
    template: entry.template,
    score,
    reason: score > 0 ? "keyword" : undefined,
    matches,
  };
};

const sortMatches = (a: DiagramTemplateMatch, b: DiagramTemplateMatch) => {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  return a.template.label.localeCompare(b.template.label);
};

const selectBestMatch = (matches: DiagramTemplateMatch[]): DiagramTemplateMatch | undefined => {
  if (matches.length === 0) {
    return undefined;
  }

  const explicit = matches.find((match) => match.reason === "explicit");
  if (explicit) {
    return explicit;
  }

  const highConfidence = matches.find((match) => match.score >= 4);
  if (highConfidence) {
    return highConfidence;
  }

  const moderate = matches.find((match) => match.score >= 3 && match.matches.length >= 2);
  if (moderate) {
    return moderate;
  }

  return undefined;
};

export const classifyDiagramPrompt = (
  prompt: string,
  options?: { kind?: GeminiDiagramKind },
): DiagramPromptClassification => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { suggestions: [] };
  }

  const lower = trimmed.toLowerCase();
  const tokens = new Set(tokenise(lower));

  const scopedTemplates = options?.kind
    ? templates.filter((entry) => entry.template.kind === options.kind)
    : templates;

  const matches = scopedTemplates.map((entry) => evaluateTemplate(entry, lower, tokens)).sort(sortMatches);

  const best = selectBestMatch(matches);

  return {
    best,
    suggestions: matches,
  };
};

