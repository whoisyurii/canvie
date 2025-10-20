"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BrainCircuit, Loader2, Workflow, Sparkles, type LucideIcon } from "lucide-react";
import { nanoid } from "nanoid";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  GeminiDiagramKind,
  type GeminiDiagramResponse,
  GeminiMissingKeyError,
  GeminiResponseError,
  useGeminiDiagram,
} from "@/lib/ai/gemini";
import {
  useWhiteboardStore,
  type CanvasElement,
  type CornerStyle,
} from "@/lib/store/useWhiteboardStore";
import { estimateTextBoxHeight, estimateTextBoxWidth } from "@/lib/canvas/text";
import { cn } from "@/lib/utils";

const DIAGRAM_OPTIONS: Array<{
  label: string;
  value: GeminiDiagramKind;
  description: string;
  icon: LucideIcon;
}> = [
  {
    label: "Mind Map",
    value: "mind-map",
    description: "Radiates key topics from a central idea.",
    icon: BrainCircuit,
  },
  {
    label: "Flowchart",
    value: "flowchart",
    description: "Outlines sequential steps and decisions.",
    icon: Workflow,
  },
];

const FLOW_NODE_WIDTH = 240;
const FLOW_NODE_HEIGHT = 120;
const FLOW_VERTICAL_SPACING = 90;

const MINDMAP_CENTRAL_WIDTH = 260;
const MINDMAP_CENTRAL_HEIGHT = 140;
const MINDMAP_BRANCH_WIDTH = 220;
const MINDMAP_BRANCH_HEIGHT = 110;
const MINDMAP_RADIAL_SPACING = 320;

interface GeminiDiagramGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DiagramLayoutEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: "rectangle" | "diamond";
  fontSize: number;
  textAlign: CanvasElement["textAlign"];
}

interface DiagramBuildResult {
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

const buildDiagramElements = (
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

  const idToPlacement = new Map<string, DiagramLayoutEntry>();
  layout.forEach((value, key) => idToPlacement.set(key, value));

  response.edges.forEach((edge) => {
    const fromPlacement = idToPlacement.get(edge.from);
    const toPlacement = idToPlacement.get(edge.to);
    if (!fromPlacement || !toPlacement) {
      return;
    }

    const start = {
      x: fromPlacement.x + (fromPlacement.width ?? 0) / 2,
      y: fromPlacement.y + (fromPlacement.height ?? 0) / 2,
    };
    const end = {
      x: toPlacement.x + (toPlacement.width ?? 0) / 2,
      y: toPlacement.y + (toPlacement.height ?? 0) / 2,
    };

    const arrowElement: CanvasElement = {
      id: nanoid(),
      type: "arrow",
      x: start.x,
      y: start.y,
      points: [0, 0, end.x - start.x, end.y - start.y],
      strokeColor: options.strokeColor,
      strokeOpacity: options.strokeOpacity,
      fillColor: "transparent",
      fillOpacity: 1,
      strokeWidth: options.strokeWidth,
      strokeStyle: options.strokeStyle,
      opacity: options.opacity,
      sloppiness: options.sloppiness,
      arrowType: options.arrowType,
      arrowStyle: options.arrowStyle,
      penBackground: options.penBackground,
    };

    elements.push(arrowElement);

    const label = edge.kind && edge.kind !== "relationship" ? edge.kind : "";
    if (label) {
      const labelFontSize = Math.max(12, options.textFontSize - 4);
      const width = Math.max(120, estimateTextBoxWidth(label, labelFontSize));
      const height = Math.max(40, estimateTextBoxHeight(label, labelFontSize));
      const midX = start.x + (end.x - start.x) / 2;
      const midY = start.y + (end.y - start.y) / 2;

      const textElement: CanvasElement = {
        id: nanoid(),
        type: "text",
        x: midX - width / 2,
        y: midY - height / 2,
        width,
        height,
        text: label,
        strokeColor: options.strokeColor,
        strokeOpacity: options.strokeOpacity,
        fillColor: "transparent",
        fillOpacity: 1,
        strokeWidth: options.strokeWidth,
        strokeStyle: options.strokeStyle,
        opacity: options.opacity,
        sloppiness: "smooth",
        fontFamily: options.textFontFamily,
        fontSize: labelFontSize,
        textAlign: "center",
      };

      elements.push(textElement);
      selectionIds.push(textElement.id);
    }
  });

  const summaryLabels = response.nodes.slice(0, 4).map((node) => node.label);

  return {
    elements,
    nodeCount: response.nodes.length,
    edgeCount: response.edges.length,
    selectionIds,
    summaryLabels,
  };
};

const insertDiagramElements = (elements: CanvasElement[], selectionIds: string[]) => {
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

export const GeminiDiagramGenerator = ({ open, onOpenChange }: GeminiDiagramGeneratorProps) => {
  const [diagramKind, setDiagramKind] = useState<GeminiDiagramKind>("mind-map");
  const [prompt, setPrompt] = useState("");
  const { toast } = useToast();
  const { generate, hasApiKey } = useGeminiDiagram();

  const mutation = useMutation({
    mutationFn: async ({ prompt: userPrompt, kind }: { prompt: string; kind: GeminiDiagramKind }) => {
      return generate({ prompt: userPrompt, kind });
    },
    onSuccess: (data, variables) => {
      const store = useWhiteboardStore.getState();
      const build = buildDiagramElements(data, variables.kind, {
        strokeColor: store.strokeColor,
        strokeOpacity: store.strokeOpacity,
        fillColor: store.fillColor,
        fillOpacity: store.fillOpacity,
        strokeWidth: store.strokeWidth,
        strokeStyle: store.strokeStyle,
        sloppiness: store.sloppiness,
        arrowType: store.arrowType,
        arrowStyle: store.arrowStyle,
        opacity: store.opacity,
        rectangleCornerStyle: store.rectangleCornerStyle,
        textFontFamily: store.textFontFamily,
        textFontSize: store.textFontSize,
        penBackground: store.penBackground,
        pan: store.pan,
        zoom: store.zoom,
      });

      if (build.elements.length === 0) {
        toast({
          variant: "destructive",
          title: "Nothing to add",
          description: "Gemini did not return any diagram nodes.",
        });
        return;
      }

      insertDiagramElements(build.elements, build.selectionIds);
      onOpenChange(false);

      const summary = [
        `${build.nodeCount} node${build.nodeCount === 1 ? "" : "s"}`,
        `${build.edgeCount} connection${build.edgeCount === 1 ? "" : "s"}`,
      ];
      if (build.summaryLabels.length > 0) {
        summary.push(build.summaryLabels.join(" • "));
      }

      toast({
        title: variables.kind === "mind-map" ? "Mind map ready" : "Flowchart added",
        description: summary.join(" — "),
        action: (
          <ToastAction
            altText="Undo diagram"
            onClick={() => {
              useWhiteboardStore.getState().undo();
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    },
    onError: (error: unknown) => {
      if (error instanceof GeminiMissingKeyError) {
        toast({
          variant: "destructive",
          title: "Add your Gemini API key",
          description: "Open settings to paste a key before generating diagrams.",
        });
        return;
      }

      if (error instanceof GeminiResponseError) {
        toast({
          variant: "destructive",
          title: "Gemini response issue",
          description: error.message,
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Gemini request failed",
        description: error instanceof Error ? error.message : "Unexpected error calling Gemini.",
      });
    },
  });

  const isSubmitDisabled = useMemo(() => {
    if (!hasApiKey) {
      return true;
    }
    return mutation.isPending || prompt.trim().length === 0;
  }, [hasApiKey, mutation.isPending, prompt]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> AI diagram generator
          </DrawerTitle>
          <DrawerDescription>
            Describe what you need and Gemini will draft a structured diagram directly onto the canvas.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-6 px-6 pb-8">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Diagram style</Label>
            <RadioGroup
              value={diagramKind}
              onValueChange={(value) => setDiagramKind(value as GeminiDiagramKind)}
              className="grid gap-3 md:grid-cols-2"
            >
              {DIAGRAM_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = diagramKind === option.value;
                return (
                  <label
                    key={option.value}
                    htmlFor={`diagram-${option.value}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition hover:border-primary/50",
                      isActive ? "border-primary shadow-sm" : "border-border",
                    )}
                  >
                    <RadioGroupItem id={`diagram-${option.value}`} value={option.value} className="mt-1" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className="h-4 w-4 text-primary" />
                        {option.label}
                      </div>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gemini-diagram-prompt">Prompt</Label>
            <Textarea
              id="gemini-diagram-prompt"
              placeholder={
                diagramKind === "mind-map"
                  ? "Map the main ideas for launching a tea subscription service..."
                  : "Explain the onboarding flow for new workspace members..."
              }
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Keep it short but specific—Gemini returns up to 12 nodes with labeled connections.
            </p>
          </div>

          {!hasApiKey && (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900">
              Add a Gemini API key in settings to unlock AI diagramming.
            </div>
          )}
        </div>

        <DrawerFooter className="border-t bg-muted/40">
          <Button
            onClick={() => {
              const trimmed = prompt.trim();
              if (!trimmed) {
                toast({
                  title: "Prompt required",
                  description: "Tell Gemini what to sketch before generating a diagram.",
                });
                return;
              }
              mutation.mutate({ prompt: trimmed, kind: diagramKind });
            }}
            disabled={isSubmitDisabled}
          >
            {mutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Generate diagram
              </span>
            )}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
