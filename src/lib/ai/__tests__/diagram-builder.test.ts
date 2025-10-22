import { beforeEach, describe, expect, it } from "vitest";

import { buildDiagramElements } from "../diagram-builder";
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

