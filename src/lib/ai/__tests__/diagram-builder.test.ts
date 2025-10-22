import { beforeEach, describe, expect, it } from "vitest";

import { buildDiagramElements } from "../diagram-builder";
import { GeminiResponseError } from "../gemini";
import {
  FLOWCHART_HORIZONTAL_GAP,
  FLOWCHART_NODE_WIDTH,
} from "../patterns/flowchart";

const defaultOptions = {
  strokeColor: "#1f2937",
  strokeOpacity: 1,
  fillColor: "#ffffff",
  fillOpacity: 1,
  strokeWidth: 4,
  strokeStyle: "solid" as const,
  sloppiness: "normal" as const,
  arrowType: "arrow-end" as const,
  arrowStyle: "straight" as const,
  opacity: 1,
  rectangleCornerStyle: "rounded" as const,
  textFontFamily: "Inter",
  textFontSize: 20,
  penBackground: "#ffffff",
  pan: { x: 0, y: 0 },
  zoom: 1,
};

const getCenter = (element: { x: number; y: number; width?: number; height?: number }) => ({
  x: element.x + (element.width ?? 0) / 2,
  y: element.y + (element.height ?? 0) / 2,
});

describe("diagram builder flowchart templates", () => {
  beforeEach(() => {
    globalThis.window = {
      innerWidth: 1200,
      innerHeight: 800,
    } as any;
  });

  it("lays out multi-branch flowcharts using the decision-split template", () => {
    const response = {
      nodes: [
        { id: "start", label: "Start", type: "start" },
        { id: "prep", label: "Prep", type: "process" },
        { id: "decision", label: "Decision", type: "decision" },
        { id: "branch-approve", label: "Approve", type: "process" },
        { id: "branch-reject", label: "Reject", type: "process" },
        { id: "merge", label: "Finalize", type: "end" },
      ],
      edges: [
        { from: "start", to: "prep" },
        { from: "prep", to: "decision" },
        { from: "decision", to: "branch-approve" },
        { from: "decision", to: "branch-reject" },
        { from: "branch-approve", to: "merge" },
        { from: "branch-reject", to: "merge" },
      ],
    } satisfies Parameters<typeof buildDiagramElements>[0];

    const result = buildDiagramElements(response, "flowchart", defaultOptions);

    const shapeElements = result.elements.slice(0, response.nodes.length);
    const findShape = (id: string) => {
      const index = response.nodes.findIndex((node) => node.id === id);
      return shapeElements[index]!;
    };

    const decision = findShape("decision");
    const branchApprove = findShape("branch-approve");
    const branchReject = findShape("branch-reject");
    const merge = findShape("merge");

    expect(decision.type).toBe("diamond");
    expect(branchApprove.type).toBe("rectangle");
    expect(branchReject.type).toBe("rectangle");

    const decisionCenter = getCenter(decision);
    const approveCenter = getCenter(branchApprove);
    const rejectCenter = getCenter(branchReject);
    const mergeCenter = getCenter(merge);

    const expectedOffset = FLOWCHART_NODE_WIDTH + Math.max(FLOWCHART_HORIZONTAL_GAP, FLOWCHART_NODE_WIDTH / 2);
    expect(Math.abs(decisionCenter.x - approveCenter.x)).toBeCloseTo(expectedOffset, 1);
    expect(Math.abs(decisionCenter.x - rejectCenter.x)).toBeCloseTo(expectedOffset, 1);

    expect(approveCenter.y).toBeGreaterThan(decisionCenter.y);
    expect(rejectCenter.y).toBeGreaterThan(decisionCenter.y);
    expect(mergeCenter.x).toBeCloseTo(decisionCenter.x, 1);

    const arrows = result.elements.filter((element) => element.type === "arrow");
    const elbowArrows = arrows.filter((element) => element.points?.length === 8);

    expect(elbowArrows.length).toBeGreaterThanOrEqual(4);
  });
});

describe("diagram builder mind map templates", () => {
  beforeEach(() => {
    globalThis.window = {
      innerWidth: 1200,
      innerHeight: 800,
    } as any;
  });

  it("lays out radial mind maps deterministically", () => {
    const response = {
      template: { id: "mindmap.radial" },
      nodes: [
        { id: "central", label: "Central Idea", type: "central", role: "central", level: 0 },
        { id: "branch-a", label: "Branch A", type: "primary branch", role: "primary", level: 1, order: 0 },
        { id: "branch-b", label: "Branch B", type: "primary branch", role: "primary", level: 1, order: 1 },
        { id: "detail-a", label: "Detail A", type: "secondary detail", role: "secondary", level: 2, order: 0 },
        { id: "detail-b", label: "Detail B", type: "secondary detail", role: "secondary", level: 2, order: 1 },
      ],
      edges: [
        { from: "central", to: "branch-a" },
        { from: "central", to: "branch-b" },
        { from: "branch-a", to: "detail-a" },
        { from: "branch-b", to: "detail-b" },
      ],
    } satisfies Parameters<typeof buildDiagramElements>[0];

    const result = buildDiagramElements(response, "mind-map", defaultOptions);
    const shapeElements = result.elements.slice(0, response.nodes.length);

    const central = shapeElements[0]!;
    expect(central.x).toBeCloseTo(470, 3);
    expect(central.y).toBeCloseTo(330, 3);

    const branchACenter = getCenter(shapeElements[1]!);
    const branchBCenter = getCenter(shapeElements[2]!);
    const detailACenter = getCenter(shapeElements[3]!);
    const detailBCenter = getCenter(shapeElements[4]!);
    const centralCenter = getCenter(central);

    const distance = (point: { x: number; y: number }) =>
      Math.hypot(point.x - centralCenter.x, point.y - centralCenter.y);

    expect(distance(branchACenter)).toBeCloseTo(320, 1);
    expect(distance(branchBCenter)).toBeCloseTo(320, 1);
    expect(distance(detailACenter)).toBeCloseTo(640, 1);
    expect(distance(detailBCenter)).toBeCloseTo(640, 1);

    expect(branchACenter.y).toBeLessThan(centralCenter.y);
    expect(branchBCenter.y).toBeGreaterThan(centralCenter.y);
  });

  it("lays out quadrant mind maps using directional anchors", () => {
    const response = {
      template: { id: "mindmap.quadrant" },
      nodes: [
        { id: "central", label: "Central", type: "central", role: "central", level: 0 },
        {
          id: "north",
          label: "North Anchor",
          type: "quadrant anchor north",
          role: "quadrant anchor",
          level: 1,
          quadrant: "north",
          order: 0,
        },
        {
          id: "east",
          label: "East Anchor",
          type: "quadrant anchor east",
          role: "quadrant anchor",
          level: 1,
          quadrant: "east",
          order: 1,
        },
        {
          id: "detail-north",
          label: "North Detail",
          type: "quadrant detail north",
          role: "detail",
          level: 2,
          quadrant: "north",
          order: 0,
        },
        {
          id: "detail-east",
          label: "East Detail",
          type: "quadrant detail east",
          role: "detail",
          level: 2,
          quadrant: "east",
          order: 0,
        },
      ],
      edges: [
        { from: "central", to: "north" },
        { from: "central", to: "east" },
        { from: "north", to: "detail-north" },
        { from: "east", to: "detail-east" },
      ],
    } satisfies Parameters<typeof buildDiagramElements>[0];

    const result = buildDiagramElements(response, "mind-map", defaultOptions);
    const shapes = result.elements.slice(0, response.nodes.length);

    const centralCenter = getCenter(shapes[0]!);
    const northCenter = getCenter(shapes[1]!);
    const eastCenter = getCenter(shapes[2]!);
    const northDetailCenter = getCenter(shapes[3]!);
    const eastDetailCenter = getCenter(shapes[4]!);

    expect(northCenter.y).toBeLessThan(centralCenter.y);
    expect(eastCenter.x).toBeGreaterThan(centralCenter.x);

    expect(northDetailCenter.y).toBeLessThan(northCenter.y);
    expect(eastDetailCenter.x).toBeGreaterThan(eastCenter.x);

    expect(Math.hypot(northDetailCenter.x - centralCenter.x, northDetailCenter.y - centralCenter.y)).toBeGreaterThan(
      Math.hypot(northCenter.x - centralCenter.x, northCenter.y - centralCenter.y),
    );
    expect(Math.hypot(eastDetailCenter.x - centralCenter.x, eastDetailCenter.y - centralCenter.y)).toBeGreaterThan(
      Math.hypot(eastCenter.x - centralCenter.x, eastCenter.y - centralCenter.y),
    );
  });

  it("lays out timeline mind maps along a horizontal axis", () => {
    const response = {
      template: { id: "mindmap.timeline" },
      nodes: [
        { id: "start", label: "Kickoff", type: "timeline start", role: "start", level: 0, order: 0 },
        { id: "milestone", label: "Milestone", type: "timeline milestone", role: "milestone", level: 0, order: 1 },
        { id: "end", label: "Wrap", type: "timeline end", role: "end", level: 0, order: 2 },
        {
          id: "note-above",
          label: "Prep",
          type: "timeline detail upper",
          role: "detail",
          level: 1,
          order: 0,
          lane: "upper",
        },
        {
          id: "note-below",
          label: "Retro",
          type: "timeline detail lower",
          role: "detail",
          level: 2,
          order: 1,
          lane: "lower",
        },
      ],
      edges: [
        { from: "start", to: "note-above" },
        { from: "end", to: "note-below" },
      ],
    } satisfies Parameters<typeof buildDiagramElements>[0];

    const result = buildDiagramElements(response, "mind-map", defaultOptions);
    const shapes = result.elements.slice(0, response.nodes.length);

    const startCenter = getCenter(shapes[0]!);
    const milestoneCenter = getCenter(shapes[1]!);
    const endCenter = getCenter(shapes[2]!);
    const noteAboveCenter = getCenter(shapes[3]!);
    const noteBelowCenter = getCenter(shapes[4]!);

    expect(startCenter.y).toBeCloseTo(milestoneCenter.y, 5);
    expect(milestoneCenter.y).toBeCloseTo(endCenter.y, 5);
    expect(milestoneCenter.x - startCenter.x).toBeCloseTo(320, 3);
    expect(endCenter.x - milestoneCenter.x).toBeCloseTo(320, 3);

    expect(noteAboveCenter.y).toBeLessThan(startCenter.y);
    expect(noteBelowCenter.y).toBeGreaterThan(endCenter.y);
  });

  it("falls back to response order for timeline anchors missing metadata", () => {
    const response = {
      template: { id: "mindmap.timeline" },
      nodes: [
        { id: "a", label: "First", type: "timeline milestone" },
        { id: "b", label: "Second", type: "timeline milestone" },
        { id: "c", label: "Third", type: "timeline milestone" },
      ],
      edges: [],
    } satisfies Parameters<typeof buildDiagramElements>[0];

    const result = buildDiagramElements(response, "mind-map", defaultOptions);
    const shapes = result.elements.slice(0, response.nodes.length);

    const first = getCenter(shapes[0]!);
    const second = getCenter(shapes[1]!);
    const third = getCenter(shapes[2]!);

    expect(first.x).toBeLessThan(second.x);
    expect(second.x).toBeLessThan(third.x);
  });

  it("throws a descriptive error when role metadata is missing", () => {
    const response = {
      template: { id: "mindmap.radial" },
      nodes: [
        { id: "a", label: "A", type: "topic" },
        { id: "b", label: "B", type: "topic" },
      ],
      edges: [],
    } satisfies Parameters<typeof buildDiagramElements>[0];

    expect(() => buildDiagramElements(response, "mind-map", defaultOptions)).toThrowError(GeminiResponseError);
  });
});

