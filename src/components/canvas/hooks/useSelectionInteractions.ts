import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

import {
  RESIZABLE_ELEMENT_TYPES,
  TEXT_MIN_WIDTH,
  ensureCurvePoints,
  getElementBounds,
  isElementWithinSelection,
  normalizeRectBounds,
  resolveElementId,
  type Bounds,
} from "@/lib/canvas";
import type { CanvasElement } from "@/lib/store/useWhiteboardStore";

import type {
  MarqueeSelectionState,
  SelectionDragState,
  SelectionRect,
} from "../types";

const SELECTION_GROUP_ID = "__selection_group__";

type PointerGetter = () => { x: number; y: number } | null;

type UseSelectionInteractionsArgs = {
  activeTool: string;
  elements: CanvasElement[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  pushHistory: () => void;
  stageRef: RefObject<Konva.Stage>;
  transformerRef: RefObject<Konva.Transformer>;
  visibleElements: CanvasElement[];
  getCanvasPointerPosition: PointerGetter;
};

export type UseSelectionInteractionsResult = {
  selectionRect: SelectionRect | null;
  selectionBounds: Bounds | null;
  curveHandleElements: CanvasElement[];
  handleStageMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  handleStageMouseMove: (event: KonvaEventObject<MouseEvent>) => boolean;
  handleStageMouseUp: () => void;
  handleMouseLeave: () => void;
  getInteractionProps: (element: CanvasElement) => Record<string, unknown>;
  handleSelectionGroupDragStart: (event: KonvaEventObject<DragEvent>) => void;
  handleSelectionGroupDragMove: (event: KonvaEventObject<DragEvent>) => void;
  handleSelectionGroupDragEnd: (event: KonvaEventObject<DragEvent>) => void;
  handleCurveHandleDragMove: (
    event: KonvaEventObject<DragEvent>,
    element: CanvasElement,
    handleIndex: number,
  ) => void;
  handleCurveHandleDragEnd: (
    event: KonvaEventObject<DragEvent>,
    element: CanvasElement,
    handleIndex: number,
  ) => void;
};

const selectionTools = new Set(["select"]);

export const useSelectionInteractions = ({
  activeTool,
  elements,
  selectedIds,
  setSelectedIds,
  clearSelection,
  updateElement,
  pushHistory,
  stageRef,
  transformerRef,
  visibleElements,
  getCanvasPointerPosition,
}: UseSelectionInteractionsArgs): UseSelectionInteractionsResult => {
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null);
  const selectionDragStateRef = useRef<SelectionDragState | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);

  useEffect(() => {
    if (!selectionTools.has(activeTool)) {
      marqueeSelectionRef.current = null;
      setSelectionRect(null);
    }
  }, [activeTool]);

  const selectionBounds = useMemo(() => {
    if (selectedIds.length === 0) {
      return null;
    }

    let bounds: Bounds | null = null;
    selectedIds.forEach((id) => {
      const element = elements.find((item) => item.id === id);
      if (!element) {
        return;
      }

      const elementBounds = getElementBounds(element);
      if (!bounds) {
        bounds = { ...elementBounds };
      } else {
        bounds = {
          minX: Math.min(bounds.minX, elementBounds.minX),
          minY: Math.min(bounds.minY, elementBounds.minY),
          maxX: Math.max(bounds.maxX, elementBounds.maxX),
          maxY: Math.max(bounds.maxY, elementBounds.maxY),
        };
      }
    });

    return bounds;
  }, [elements, selectedIds]);

  const curveHandleElements = useMemo(() => {
    if (activeTool !== "select") {
      return [] as CanvasElement[];
    }

    return selectedIds
      .map((id) => elements.find((item) => item.id === id) ?? null)
      .filter((element): element is CanvasElement => {
        if (!element) {
          return false;
        }
        if (element.type !== "line" && element.type !== "arrow") {
          return false;
        }
        return element.arrowStyle === "curve";
      });
  }, [activeTool, elements, selectedIds]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) {
      return;
    }

    if (activeTool !== "select" || selectedIds.length === 0) {
      transformer.nodes([]);
      transformer.resizeEnabled(true);
      transformer.keepRatio(false);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`) as Konva.Node | null)
      .filter((node): node is Konva.Node => Boolean(node));

    if (nodes.length === 0) {
      transformer.nodes([]);
      transformer.resizeEnabled(true);
      transformer.keepRatio(false);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const selectedElements = selectedIds
      .map((id) => visibleElements.find((item) => item.id === id) ?? null)
      .filter((element): element is CanvasElement => Boolean(element));

    const containsNonResizable = selectedElements.some((element) => {
      return !RESIZABLE_ELEMENT_TYPES.has(element.type);
    });

    const shouldKeepAspectRatio =
      selectedElements.length === 1 &&
      selectedElements[0]?.type === "file" &&
      selectedElements[0]?.fileType === "application/pdf";

    transformer.resizeEnabled(!containsNonResizable);
    transformer.keepRatio(shouldKeepAspectRatio);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, selectedIds, transformerRef, stageRef, visibleElements]);

  const applySelectionDrag = useCallback(
    (
      deltaX: number,
      deltaY: number,
      dragState: SelectionDragState,
      stage: Konva.Stage | null,
    ) => {
      dragState.affectedIds.forEach((id) => {
        const baseNode = dragState.startNodes[id];
        const baseElement =
          dragState.elements[id] ?? elements.find((item) => item.id === id);
        if (!baseNode || !baseElement) {
          return;
        }

        const nextNodeX = baseNode.x + deltaX;
        const nextNodeY = baseNode.y + deltaY;

        if (baseElement.type === "ellipse") {
          const referenceNode = stage?.findOne(`#${id}`) as Konva.Shape | null;
          const nodeWidth =
            typeof referenceNode?.width === "function"
              ? referenceNode.width()
              : baseElement.width ?? 0;
          const nodeHeight =
            typeof referenceNode?.height === "function"
              ? referenceNode.height()
              : baseElement.height ?? 0;
          const width = Math.max(1, baseElement.width ?? nodeWidth);
          const height = Math.max(1, baseElement.height ?? nodeHeight);
          updateElement(id, {
            x: nextNodeX - width / 2,
            y: nextNodeY - height / 2,
          });
        } else {
          updateElement(id, { x: nextNodeX, y: nextNodeY });
        }
      });
    },
    [elements, updateElement],
  );

  const handleElementDragStart = useCallback(
    (event: KonvaEventObject<DragEvent>, element: CanvasElement) => {
      if (activeTool !== "select") {
        return;
      }

      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const node = event.target;
      const affectedIds = selectedIds.includes(element.id)
        ? selectedIds
        : [element.id];
      const startNodes: Record<string, { x: number; y: number }> = {
        [element.id]: { x: node.x(), y: node.y() },
      };
      const elementSnapshots: Record<string, CanvasElement> = {};

      affectedIds.forEach((id) => {
        if (!startNodes[id]) {
          const foundNode = stage.findOne(`#${id}`) as Konva.Node | null;
          if (foundNode) {
            startNodes[id] = { x: foundNode.x(), y: foundNode.y() };
          }
        }
        const elementSnapshot = elements.find((item) => item.id === id) ?? null;
        if (elementSnapshot) {
          elementSnapshots[id] = elementSnapshot;
        }
      });

      selectionDragStateRef.current = {
        startNodes,
        elements: elementSnapshots,
        affectedIds,
        referenceId: element.id,
      };
    },
    [activeTool, elements, selectedIds, stageRef],
  );

  const handleElementDragMove = useCallback(
    (event: KonvaEventObject<DragEvent>, element: CanvasElement) => {
      if (activeTool !== "select") {
        return;
      }

      const node = event.target;
      const dragState = selectionDragStateRef.current;

      if (
        !dragState ||
        !dragState.referenceId ||
        !dragState.startNodes[dragState.referenceId]
      ) {
        const fallbackX = node.x();
        const fallbackY = node.y();
        if (element.type === "ellipse") {
          const width = Math.max(1, node.width());
          const height = Math.max(1, node.height());
          updateElement(element.id, {
            x: fallbackX - width / 2,
            y: fallbackY - height / 2,
          });
        } else {
          updateElement(element.id, { x: fallbackX, y: fallbackY });
        }
        return;
      }

      const stage = node.getStage();
      const referenceId = dragState.referenceId;
      const origin = dragState.startNodes[referenceId];
      if (!origin) {
        return;
      }

      const referenceNode =
        referenceId === node.id()
          ? node
          : (stage?.findOne(`#${referenceId}`) as Konva.Node | null);
      if (!referenceNode) {
        return;
      }

      const deltaX = referenceNode.x() - origin.x;
      const deltaY = referenceNode.y() - origin.y;

      applySelectionDrag(deltaX, deltaY, dragState, stage ?? null);
    },
    [activeTool, applySelectionDrag, updateElement],
  );

  const handleElementDragEnd = useCallback(
    (event: KonvaEventObject<DragEvent>, element: CanvasElement) => {
      if (activeTool !== "select") {
        return;
      }

      handleElementDragMove(event, element);
      selectionDragStateRef.current = null;
      pushHistory();
    },
    [activeTool, handleElementDragMove, pushHistory],
  );

  const handleSelectionGroupDragStart = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (activeTool !== "select" || selectedIds.length === 0) {
        return;
      }

      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const node = event.target;
      const startNodes: Record<string, { x: number; y: number }> = {
        [SELECTION_GROUP_ID]: { x: node.x(), y: node.y() },
      };
      const elementSnapshots: Record<string, CanvasElement> = {};

      selectedIds.forEach((id) => {
        const elementNode = stage.findOne(`#${id}`) as Konva.Node | null;
        if (elementNode) {
          startNodes[id] = { x: elementNode.x(), y: elementNode.y() };
        }
        const elementSnapshot = elements.find((item) => item.id === id) ?? null;
        if (elementSnapshot) {
          elementSnapshots[id] = elementSnapshot;
        }
      });

      selectionDragStateRef.current = {
        startNodes,
        elements: elementSnapshots,
        affectedIds: [...selectedIds],
        referenceId: SELECTION_GROUP_ID,
      };
    },
    [activeTool, elements, selectedIds, stageRef],
  );

  const handleSelectionGroupDragMove = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (activeTool !== "select") {
        return;
      }

      const dragState = selectionDragStateRef.current;
      if (!dragState || dragState.referenceId !== SELECTION_GROUP_ID) {
        return;
      }

      const node = event.target;
      const origin = dragState.startNodes[SELECTION_GROUP_ID];
      if (!origin) {
        return;
      }

      const deltaX = node.x() - origin.x;
      const deltaY = node.y() - origin.y;
      const stage = node.getStage() ?? null;

      applySelectionDrag(deltaX, deltaY, dragState, stage);
    },
    [activeTool, applySelectionDrag],
  );

  const handleSelectionGroupDragEnd = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (activeTool !== "select") {
        return;
      }

      handleSelectionGroupDragMove(event);
      selectionDragStateRef.current = null;
      pushHistory();
    },
    [activeTool, handleSelectionGroupDragMove, pushHistory],
  );

  const handleElementTransformEnd = useCallback(
    (event: KonvaEventObject<Event>, element: CanvasElement) => {
      if (activeTool !== "select") {
        return;
      }

      const node = event.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const nextX = node.x();
      const nextY = node.y();

      const updates: Partial<CanvasElement> = {};

      if (element.type === "ellipse") {
        const width = Math.max(1, node.width() * scaleX);
        const height = Math.max(1, node.height() * scaleY);
        node.scaleX(1);
        node.scaleY(1);
        updates.x = nextX - width / 2;
        updates.y = nextY - height / 2;
        updates.width = width;
        updates.height = height;
      } else if (
        element.type === "line" ||
        element.type === "arrow" ||
        element.type === "pen"
      ) {
        const konvaLine = node as Konva.Line;
        const currentPoints = konvaLine.points();
        const scaledPoints: number[] = [];
        for (let index = 0; index < currentPoints.length; index += 2) {
          const pointX = currentPoints[index] ?? 0;
          const pointY = currentPoints[index + 1] ?? 0;
          scaledPoints.push(pointX * scaleX, pointY * scaleY);
        }
        node.scaleX(1);
        node.scaleY(1);
        updates.x = nextX;
        updates.y = nextY;
        updates.points = scaledPoints;
      } else if (element.type === "text") {
        const width = Math.max(TEXT_MIN_WIDTH, node.width() * scaleX);
        node.scaleX(1);
        node.scaleY(1);
        updates.x = nextX;
        updates.y = nextY;
        updates.width = width;
      } else if (
        element.type === "file" &&
        element.fileType === "application/pdf"
      ) {
        const baseWidth = Math.max(1, node.width());
        const baseHeight = Math.max(1, node.height());
        const scaleXAbs = Math.abs(scaleX);
        const scaleYAbs = Math.abs(scaleY);
        const scaleCandidates = [scaleXAbs, scaleYAbs].filter(
          (value) => Number.isFinite(value) && value > 0,
        );
        let uniformScale = scaleCandidates[0] ?? 1;
        if (scaleCandidates.length === 2) {
          const deviationX = Math.abs(scaleXAbs - 1);
          const deviationY = Math.abs(scaleYAbs - 1);
          uniformScale = deviationX >= deviationY ? scaleXAbs : scaleYAbs;
        }

        const width = Math.max(1, baseWidth * uniformScale);
        const height = Math.max(1, baseHeight * uniformScale);
        node.scaleX(1);
        node.scaleY(1);
        updates.x = nextX;
        updates.y = nextY;
        updates.width = width;
        updates.height = height;
      } else {
        const width = Math.max(1, node.width() * scaleX);
        const height = Math.max(1, node.height() * scaleY);
        node.scaleX(1);
        node.scaleY(1);
        updates.x = nextX;
        updates.y = nextY;
        updates.width = width;
        updates.height = height;
      }

      updateElement(element.id, updates);
      pushHistory();
    },
    [activeTool, pushHistory, updateElement],
  );

  const updateCurveHandlePosition = useCallback(
    (element: CanvasElement, handleIndex: number, absX: number, absY: number) => {
      const curvePoints = ensureCurvePoints(element.points);
      if (curvePoints.length < 6) {
        return;
      }

      const absolutePoints = [
        {
          x: element.x + (curvePoints[0] ?? 0),
          y: element.y + (curvePoints[1] ?? 0),
        },
        {
          x: element.x + (curvePoints[2] ?? 0),
          y: element.y + (curvePoints[3] ?? 0),
        },
        {
          x: element.x + (curvePoints[4] ?? 0),
          y: element.y + (curvePoints[5] ?? 0),
        },
      ];

      const index = Math.max(0, Math.min(handleIndex, absolutePoints.length - 1));
      const current = absolutePoints[index];
      if (current.x === absX && current.y === absY) {
        return;
      }

      absolutePoints[index] = { x: absX, y: absY };

      const basePoint = absolutePoints[0];
      const nextPoints: number[] = [];
      absolutePoints.forEach((point) => {
        nextPoints.push(point.x - basePoint.x, point.y - basePoint.y);
      });

      updateElement(element.id, {
        x: basePoint.x,
        y: basePoint.y,
        points: nextPoints,
      });
    },
    [updateElement],
  );

  const handleCurveHandleDragMove = useCallback(
    (
      event: KonvaEventObject<DragEvent>,
      element: CanvasElement,
      handleIndex: number,
    ) => {
      event.cancelBubble = true;
      const node = event.target;
      updateCurveHandlePosition(element, handleIndex, node.x(), node.y());
    },
    [updateCurveHandlePosition],
  );

  const handleCurveHandleDragEnd = useCallback(
    (
      event: KonvaEventObject<DragEvent>,
      element: CanvasElement,
      handleIndex: number,
    ) => {
      event.cancelBubble = true;
      const node = event.target;
      updateCurveHandlePosition(element, handleIndex, node.x(), node.y());
      pushHistory();
    },
    [pushHistory, updateCurveHandlePosition],
  );

  const handleStageMouseDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!selectionTools.has(activeTool)) {
        return;
      }

      const target = event.target as Konva.Node;
      if (!target) {
        return;
      }

      const isTransformerHandle = target.getParent()?.className === "Transformer";
      if (isTransformerHandle) {
        return;
      }

      const targetId = resolveElementId(target);
      if (!targetId) {
        const pointer = getCanvasPointerPosition();
        if (!pointer) return;
        const additive = event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey;
        marqueeSelectionRef.current = {
          originX: pointer.x,
          originY: pointer.y,
          additive,
          initialSelection: selectedIds,
          moved: false,
        };
        setSelectionRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
        return;
      }

      const element = elements.find((item) => item.id === targetId);
      if (!element) {
        return;
      }

      const isMultiSelect = event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey;
      if (isMultiSelect) {
        const alreadySelected = selectedIds.includes(targetId);
        const nextSelection = alreadySelected
          ? selectedIds.filter((id) => id !== targetId)
          : [...selectedIds, targetId];
        setSelectedIds(nextSelection);
      } else {
        if (!selectedIds.includes(targetId)) {
          setSelectedIds([targetId]);
        }
      }

      setSelectionRect(null);
      marqueeSelectionRef.current = null;
    },
    [activeTool, elements, getCanvasPointerPosition, selectedIds, setSelectedIds],
  );

  const handleStageMouseMove = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!selectionTools.has(activeTool)) {
        return false;
      }

      const marqueeState = marqueeSelectionRef.current;
      if (!marqueeState) {
        return false;
      }

      const pointer = getCanvasPointerPosition();
      if (!pointer) return false;

      const width = pointer.x - marqueeState.originX;
      const height = pointer.y - marqueeState.originY;
      if (!marqueeState.moved) {
        const threshold = 3;
        if (Math.abs(width) > threshold || Math.abs(height) > threshold) {
          marqueeState.moved = true;
        }
      }

      setSelectionRect({
        x: marqueeState.originX,
        y: marqueeState.originY,
        width,
        height,
      });
      return true;
    },
    [activeTool, getCanvasPointerPosition],
  );

  const handleStageMouseUp = useCallback(() => {
    if (!selectionTools.has(activeTool)) {
      return;
    }

    const marqueeState = marqueeSelectionRef.current;
    if (!marqueeState) {
      return;
    }

    const rect = selectionRect;
    marqueeSelectionRef.current = null;
    setSelectionRect(null);

    if (!marqueeState.moved || !rect) {
      if (!marqueeState.additive) {
        clearSelection();
      } else {
        setSelectedIds(marqueeState.initialSelection);
      }
      return;
    }

    const bounds = normalizeRectBounds(rect.x, rect.y, rect.width, rect.height);
    const selectedWithinBounds = elements
      .filter((element) => isElementWithinSelection(element, bounds))
      .map((element) => element.id);

    if (marqueeState.additive) {
      const combined = new Set([
        ...marqueeState.initialSelection,
        ...selectedWithinBounds,
      ]);
      setSelectedIds(Array.from(combined));
    } else {
      setSelectedIds(selectedWithinBounds);
    }
  }, [activeTool, clearSelection, elements, selectionRect, setSelectedIds]);

  const handleMouseLeave = useCallback(() => {
    marqueeSelectionRef.current = null;
    setSelectionRect(null);
  }, []);

  const getInteractionProps = useCallback(
    (element: CanvasElement) => {
      if (activeTool !== "select") {
        return { draggable: false };
      }

      const isSelected = selectedIds.includes(element.id);
      const interaction: Record<string, unknown> = {
        draggable: isSelected,
      };

      if (isSelected) {
        interaction.onDragStart = (event: KonvaEventObject<DragEvent>) =>
          handleElementDragStart(event, element);
        interaction.onDragMove = (event: KonvaEventObject<DragEvent>) =>
          handleElementDragMove(event, element);
        interaction.onDragEnd = (event: KonvaEventObject<DragEvent>) =>
          handleElementDragEnd(event, element);
      }

      if (RESIZABLE_ELEMENT_TYPES.has(element.type)) {
        interaction.onTransformEnd = (event: KonvaEventObject<Event>) =>
          handleElementTransformEnd(event, element);
      }

      return interaction;
    },
    [
      activeTool,
      handleElementDragEnd,
      handleElementDragMove,
      handleElementDragStart,
      handleElementTransformEnd,
      selectedIds,
    ],
  );

  return {
    selectionRect,
    selectionBounds,
    curveHandleElements,
    handleStageMouseDown,
    handleStageMouseMove,
    handleStageMouseUp,
    handleMouseLeave,
    getInteractionProps,
    handleSelectionGroupDragStart,
    handleSelectionGroupDragMove,
    handleSelectionGroupDragEnd,
    handleCurveHandleDragMove,
    handleCurveHandleDragEnd,
  };
};

