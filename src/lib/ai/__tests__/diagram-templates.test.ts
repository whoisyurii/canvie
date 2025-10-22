import { describe, expect, it } from "vitest";

import {
  classifyDiagramPrompt,
  getDiagramTemplatesByKind,
} from "../diagram-templates";

describe("diagram template prompt classifier", () => {
  it("recognises timeline mind map prompts", () => {
    const result = classifyDiagramPrompt("Create a product roadmap timeline with major milestones", {
      kind: "mind-map",
    });

    expect(result.best?.template.id).toBe("mindmap.timeline");
    expect(result.best?.reason).toBe("keyword");
  });

  it("detects quadrant mind map language such as SWOT", () => {
    const result = classifyDiagramPrompt("Build a SWOT analysis mind map with four quadrants", {
      kind: "mind-map",
    });

    expect(result.best?.template.id).toBe("mindmap.quadrant");
    expect(result.best?.reason).toBe("keyword");
  });

  it("matches swimlane flowchart prompts", () => {
    const result = classifyDiagramPrompt(
      "Plan a swimlane flowchart that shows marketing vs sales handoffs",
      { kind: "flowchart" },
    );

    expect(result.best?.template.id).toBe("swimlane");
  });

  it("treats explicit template mentions as overrides", () => {
    const result = classifyDiagramPrompt("Use the linear flowchart template for this intake process", {
      kind: "flowchart",
    });

    expect(result.best?.template.id).toBe("linear");
    expect(result.best?.reason).toBe("explicit");
  });
});

describe("diagram template catalog", () => {
  it("exposes flowchart templates for manual selection", () => {
    const templates = getDiagramTemplatesByKind("flowchart");
    const ids = templates.map((template) => template.id);

    expect(ids).toEqual(expect.arrayContaining(["linear", "decision-split", "swimlane"]));
  });
});

