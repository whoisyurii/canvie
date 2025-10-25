"use client";

import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { Stage } from "react-konva";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type {
  CanvasElement,
  CanvasBackground,
} from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useDragDrop } from "./DragDropHandler";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { type RulerMeasurement } from "./RulerOverlay";
import { cn } from "@/lib/utils";
import {
  type Bounds,
  normalizeRectBounds,
  getElementBounds,
  isElementWithinSelection,
  ensureCurvePoints,
  estimateTextBoxWidth,
  estimateTextBoxHeight,
  getFontFamilyCss,
  TEXT_MIN_WIDTH,
  resolveElementId,
  duplicateElement,
  RESIZABLE_ELEMENT_TYPES,
} from "@/lib/canvas";
import { useToast } from "@/hooks/use-toast";
import {
  type EditingTextState,
  type SelectionRect,
  type MarqueeSelectionState,
  type SelectionDragState,
} from "./types";
import { useTextEditing } from "./hooks/useTextEditing";
import {
  getClipboardSupport,
  useClipboardHandlers,
} from "./hooks/useClipboardHandlers";
import { useCanvasBackground } from "./hooks/useCanvasBackground";
import { useStageSize } from "./hooks/useStageSize";
import { CanvasTextEditor } from "./CanvasTextEditor";
import { CanvasElementsLayer } from "./CanvasElementsLayer";

const SELECTION_GROUP_ID = "__selection_group__";

export const WhiteboardCanvas = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageSize = useStageSize(containerRef);
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null);
  const selectionDragStateRef = useRef<SelectionDragState | null>(null);
  const lastErasedIdRef = useRef<string | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  const panAnimationFrameRef = useRef<number | null>(null);
  const measurementStartRef = useRef<{ x: number; y: number } | null>(null);
  const rulerMeasurementRef = useRef<RulerMeasurement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const currentShapeRef = useRef<any>(null);
  const isDrawingRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isMiddleMousePanning, setIsMiddleMousePanning] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(
    null
  );
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [rulerMeasurement, setRulerMeasurement] = useState<RulerMeasurement | null>(
    null
  );
  const { handleDrop, handleDragOver, addFilesToCanvas } = useDragDrop();
  const { toast } = useToast();

  const {
    activeTool,
    elements,
    addElement,
    updateElement,
    deleteElement,
    strokeColor,
    strokeOpacity,
    strokeWidth,
    strokeStyle,
    fillColor,
    fillOpacity,
    opacity,
    arrowType,
    arrowStyle,
    sloppiness,
    rectangleCornerStyle,
    penBackground,
    textFontFamily,
    textFontSize,
    textAlign,
    canvasBackground,
    setCanvasBackground,
    pan,
    zoom,
    setPan,
    setSelectedIds,
    selectedIds,
    clearSelection,
    pushHistory,
    users,
    focusedElementId,
    bringToFront,
    bringForward,
    sendToBack,
    sendBackward,
    openFilePreview,
  } = useWhiteboardStore();

  const {
    editingText,
    setEditingText,
    textEditorRef,
    editingTextRef,
    skipNextPointerRef,
    beginTextEditing,
    finishEditingText,
    cancelIfEditing,
  } = useTextEditing({
    textFontFamily,
    textFontSize,
    textAlign,
    setSelectedIds,
    updateElement,
    deleteElement,
  });

  const panX = pan.x;
  const panY = pan.y;
  const safeZoom = zoom || 1;
  const { readSupported: clipboardReadSupported, writeSupported: clipboardWriteSupported } =
    useMemo(() => getClipboardSupport(), []);

  useEffect(() => {
    if (activeTool !== "select") {
      marqueeSelectionRef.current = null;
      setSelectionRect(null);
    }
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== "eraser") {
      if (isErasing) {
        setIsErasing(false);
      }
      lastErasedIdRef.current = null;
    }
  }, [activeTool, isErasing]);

  useEffect(() => {
    const targets = elements.filter(
      (element) =>
        (element.type === "line" || element.type === "arrow") &&
        element.arrowStyle === "curve" &&
        element.points &&
        element.points.length !== 6
    );

    if (targets.length === 0) {
      return;
    }

    targets.forEach((element) => {
      const normalized = ensureCurvePoints(element.points);
      if (
        element.points &&
        normalized.length === element.points.length &&
        normalized.every((value, index) => value === element.points?.[index])
      ) {
        return;
      }

      updateElement(element.id, { points: normalized });
    });
  }, [elements, updateElement]);

  // Sync Stage position with pan state (but not while panning to avoid conflicts)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || isPanning) return;

    const position = stage.position();
    if (position.x !== panX || position.y !== panY) {
      stage.position({ x: panX, y: panY });
      stage.batchDraw();
    }
  }, [panX, panY, isPanning]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (stage.scaleX() !== safeZoom || stage.scaleY() !== safeZoom) {
      stage.scale({ x: safeZoom, y: safeZoom });
      stage.batchDraw();
    }
  }, [safeZoom]);

  const getCanvasPointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - panX) / safeZoom,
      y: (pos.y - panY) / safeZoom,
    };
  }, [panX, safeZoom, panY]);

  const clearRulerMeasurement = useCallback(() => {
    measurementStartRef.current = null;
    rulerMeasurementRef.current = null;
    setRulerMeasurement(null);
  }, []);

  const updateRulerMeasurement = useCallback(
    (nextPosition: { x: number; y: number }) => {
      const start = measurementStartRef.current;
      if (!start) {
        return;
      }

      const deltaX = nextPosition.x - start.x;
      const deltaY = nextPosition.y - start.y;
      const distance = Math.hypot(deltaX, deltaY);
      const angle = ((Math.atan2(deltaY, deltaX) * 180) / Math.PI + 360) % 360;

      const measurement: RulerMeasurement = {
        start,
        end: nextPosition,
        deltaX,
        deltaY,
        distance,
        angle,
      };

      rulerMeasurementRef.current = measurement;
      setRulerMeasurement(measurement);
    },
    [],
  );

  const recordContextMenuPosition = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const canvasX = (localX - panX) / safeZoom;
      const canvasY = (localY - panY) / safeZoom;
      setContextMenuPosition({ x: canvasX, y: canvasY });
    },
    [panX, panY, safeZoom]
  );

  const getPastePosition = useCallback(() => {
    if (contextMenuPosition) {
      return contextMenuPosition;
    }

    if (typeof window !== "undefined") {
      const centerX = (window.innerWidth / 2 - panX) / safeZoom;
      const centerY = (window.innerHeight / 2 - panY) / safeZoom;
      return { x: centerX, y: centerY };
    }

    return { x: 0, y: 0 };
  }, [contextMenuPosition, panX, panY, safeZoom]);

  const {
    handlePasteAction,
    handleCopyAsPng,
    handleCopyAsSvg,
    handleSelectAll,
  } = useClipboardHandlers({
    stageRef,
    toast,
    addElement,
    setSelectedIds,
    elements,
    addFilesToCanvas,
    getPastePosition,
    strokeColor,
    fillColor,
    fillOpacity,
    opacity,
    strokeWidth,
    strokeStyle,
    sloppiness,
    textFontFamily,
    textFontSize,
    textAlign,
  });

  const isRulerMode = activeTool === "ruler";

  useEffect(() => {
    if (!isRulerMode) {
      clearRulerMeasurement();
    }
  }, [clearRulerMeasurement, isRulerMode]);

  const eraseNode = useCallback(
    (node: Konva.Node | null) => {
      if (!node) {
        lastErasedIdRef.current = null;
        return;
      }

      const elementId = resolveElementId(node);
      if (!elementId || elementId === SELECTION_GROUP_ID) {
        if (!elementId) {
          lastErasedIdRef.current = null;
        }
        return;
      }

      if (lastErasedIdRef.current === elementId) {
        return;
      }

      const elementExists = elements.some(
        (element) => element.id === elementId
      );
      if (!elementExists) {
        lastErasedIdRef.current = null;
        return;
      }

      deleteElement(elementId);
      lastErasedIdRef.current = elementId;

      if (selectedIds.includes(elementId)) {
        setSelectedIds(selectedIds.filter((id) => id !== elementId));
      }
    },
    [deleteElement, elements, selectedIds, setSelectedIds]
  );

  const eraseElementAtPointer = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      lastErasedIdRef.current = null;
      return;
    }

    const intersection = stage.getIntersection(pointer);
    eraseNode(intersection ?? null);
  }, [eraseNode]);

  const handleStageDoublePointer = useCallback(
    (event: KonvaEventObject<Event>) => {
      const stage = stageRef.current;
      if (!stage) return;

      const target = event.target;
      if (target && target !== stage) {
        const targetId = target.id();
        if (!targetId) return;
        const element = elements.find((item) => item.id === targetId);
        if (!element) {
          return;
        }

        if (element.type === "file") {
          event.evt.preventDefault();
          const fileId = element.fileUrl ?? element.id;
          if (fileId) {
            openFilePreview(fileId, {
              name: element.fileName,
              type: element.fileType,
              sourceElementId: element.id,
              thumbnailUrl: element.thumbnailUrl,
              initialPage: element.pdfPage,
            });
          }
          return;
        }

        if (element.type === "text") {
          event.evt.preventDefault();
          beginTextEditing(element);
        }
      }
    },
    [beginTextEditing, elements, openFilePreview]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName?.toLowerCase();
      return (
        target.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.getAttribute("role") === "textbox"
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || event.repeat || !isRulerMode) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const pointer = getCanvasPointerPosition();
      if (!pointer) {
        return;
      }

      measurementStartRef.current = pointer;
      updateRulerMeasurement(pointer);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") {
        return;
      }

      if (measurementStartRef.current) {
        clearRulerMeasurement();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    clearRulerMeasurement,
    getCanvasPointerPosition,
    isRulerMode,
    updateRulerMeasurement,
  ]);

  // QW-1: Delete Key Support & QW-2: Duplicate with Ctrl+D
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if we're editing text
      if (editingTextRef.current) {
        return;
      }

      // Don't handle if user is typing in an input or textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // QW-1: Delete and Backspace - Delete selected elements
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length > 0) {
          event.preventDefault();
          const { deleteSelection } = useWhiteboardStore.getState();
          deleteSelection();
        }
        return;
      }

      // QW-2: Ctrl+D or Cmd+D - Duplicate selected elements
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "d" &&
        !event.shiftKey &&
        !event.altKey
      ) {
        if (selectedIds.length > 0) {
          event.preventDefault();
          const newIds: string[] = [];
          selectedIds.forEach((id) => {
            const element = elements.find((item) => item.id === id);
            if (element) {
              const clone = duplicateElement(element);
              clone.x += 24;
              clone.y += 24;
              addElement(clone);
              newIds.push(clone.id);
            }
          });
          if (newIds.length > 0) {
            setSelectedIds(newIds);
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedIds, elements, addElement, setSelectedIds, editingTextRef]);

  const renderBounds = useMemo(() => {
    if (stageSize.width === 0 || stageSize.height === 0) {
      return null;
    }

    const viewportMinX = -panX / safeZoom;
    const viewportMinY = -panY / safeZoom;
    const viewportWidth = stageSize.width / safeZoom;
    const viewportHeight = stageSize.height / safeZoom;
    const overscan = 800;

    return {
      minX: viewportMinX - overscan,
      minY: viewportMinY - overscan,
      maxX: viewportMinX + viewportWidth + overscan,
      maxY: viewportMinY + viewportHeight + overscan,
    };
  }, [panX, panY, safeZoom, stageSize.height, stageSize.width]);

  const elementBoundsMap = useMemo(() => {
    const bounds = new Map<string, Bounds>();
    elements.forEach((element) => {
      bounds.set(element.id, getElementBounds(element));
    });
    return bounds;
  }, [elements]);

  const visibleElements = useMemo(() => {
    if (!renderBounds) {
      return elements;
    }

    return elements.filter((element) => {
      const bounds =
        elementBoundsMap.get(element.id) ?? getElementBounds(element);
      return (
        bounds.maxX >= renderBounds.minX &&
        bounds.minX <= renderBounds.maxX &&
        bounds.maxY >= renderBounds.minY &&
        bounds.minY <= renderBounds.maxY
      );
    });
  }, [elements, elementBoundsMap, renderBounds]);

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

    const shouldKeepAspectRatio = selectedElements.length === 1 &&
      selectedElements[0]?.type === "file" &&
      selectedElements[0]?.fileType === "application/pdf";

    transformer.resizeEnabled(!containsNonResizable);
    transformer.keepRatio(shouldKeepAspectRatio);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, selectedIds, visibleElements]);

  const schedulePanUpdate = useCallback(
    (nextPan: { x: number; y: number }, immediate = false) => {
      const normalizedPan = {
        x: Number.isFinite(nextPan.x) ? nextPan.x : 0,
        y: Number.isFinite(nextPan.y) ? nextPan.y : 0,
      };

      if (normalizedPan.x === panX && normalizedPan.y === panY) {
        if (immediate && panAnimationFrameRef.current !== null) {
          cancelAnimationFrame(panAnimationFrameRef.current);
          panAnimationFrameRef.current = null;
        }
        pendingPanRef.current = null;
        return;
      }

      if (immediate) {
        if (panAnimationFrameRef.current !== null) {
          cancelAnimationFrame(panAnimationFrameRef.current);
          panAnimationFrameRef.current = null;
        }
        pendingPanRef.current = null;
        setPan(normalizedPan);
        return;
      }

      pendingPanRef.current = normalizedPan;
      if (panAnimationFrameRef.current !== null) {
        return;
      }

      panAnimationFrameRef.current = requestAnimationFrame(() => {
        if (pendingPanRef.current) {
          setPan(pendingPanRef.current);
          pendingPanRef.current = null;
        }
        panAnimationFrameRef.current = null;
      });
    },
    [panX, panY, setPan]
  );

  useEffect(() => {
    return () => {
      if (panAnimationFrameRef.current !== null) {
        cancelAnimationFrame(panAnimationFrameRef.current);
        panAnimationFrameRef.current = null;
      }
    };
  }, []);

  const syncPanFromStage = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      const stage = event.target.getStage();
      if (!stage) return;
      const position = stage.position();
      schedulePanUpdate({ x: position.x, y: position.y });
    },
    [schedulePanUpdate]
  );

  const syncPanFromStageImmediate = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      const stage = event.target.getStage();
      if (!stage) return;
      const position = stage.position();
      schedulePanUpdate({ x: position.x, y: position.y }, true);
    },
    [schedulePanUpdate]
  );

  const backgroundConfig = useCanvasBackground(canvasBackground, pan, safeZoom);
  const { className: backgroundClassName, style: backgroundStyle } =
    backgroundConfig;
  const handleCanvasBackgroundChange = useCallback(
    (value: CanvasBackground) => {
      setCanvasBackground(value);
    },
    [setCanvasBackground]
  );
  const isPanMode = activeTool === "pan" || isMiddleMousePanning;

  const stageCursorClass = isPanMode
    ? isPanning
      ? "cursor-grabbing"
      : "cursor-grab"
    : activeTool === "select"
    ? "cursor-default"
    : "cursor-crosshair";

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (e.evt.button === 1) {
      e.evt.preventDefault();
      setIsMiddleMousePanning(true);
      requestAnimationFrame(() => {
        stage.startDrag();
      });
      return;
    }

    if (skipNextPointerRef.current) {
      skipNextPointerRef.current = false;
      e.evt.preventDefault();
      return;
    }

    if (cancelIfEditing()) {
      e.evt.preventDefault();
      return;
    }

    if (isRulerMode) {
      if (e.evt.button === 0) {
        e.evt.preventDefault();

        if (!e.evt.shiftKey) {
          const pointer = getCanvasPointerPosition();
          if (pointer) {
            measurementStartRef.current = pointer;
            updateRulerMeasurement(pointer);
          }
        }
      }
      return;
    }

    if (e.evt.altKey && activeTool === "select") {
      const targetId = resolveElementId(e.target as Konva.Node);
      if (targetId) {
        const element = elements.find((item) => item.id === targetId);
        if (element) {
          const clone = duplicateElement(element);
          clone.x += 24;
          clone.y += 24;
          addElement(clone);
          setSelectedIds([clone.id]);
          e.evt.preventDefault();
          return;
        }
      }
    }

    if (activeTool === "eraser") {
      setIsErasing(true);
      eraseNode(e.target as Konva.Node | null);
      if (stage) {
        requestAnimationFrame(() => {
          eraseElementAtPointer();
        });
      }
      return;
    }

    if (activeTool === "select") {
      const target = e.target as Konva.Node;
      if (!target) {
        return;
      }

      const isTransformerHandle =
        target.getParent()?.className === "Transformer";
      if (isTransformerHandle) {
        return;
      }

      const targetId = resolveElementId(target);
      if (!targetId) {
        const pointer = getCanvasPointerPosition();
        if (!pointer) return;
        const additive = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;
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

      const isMultiSelect = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;
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
      return;
    }

    if (activeTool === "text") {
      const target = e.target;
      if (target && target !== stage) {
        const targetId = target.id();
        if (targetId) {
          const element = elements.find((item) => item.id === targetId);
          if (element?.type === "text") {
            e.evt.preventDefault();
            beginTextEditing(element);
            return;
          }
        }
      }

      const pointer = getCanvasPointerPosition();
      if (!pointer) return;

      const newText: CanvasElement = {
        id: nanoid(),
        type: "text",
        x: pointer.x,
        y: pointer.y,
        text: "",
        strokeColor,
        strokeOpacity,
        fillColor,
        fillOpacity,
        strokeWidth,
        strokeStyle,
        opacity,
        sloppiness,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        textAlign,
      };
      addElement(newText);
      beginTextEditing(newText, {
        width: estimateTextBoxWidth("", textFontSize),
      });
      return;
    }

    if (activeTool === "pan") {
      return;
    }

    const pointer = getCanvasPointerPosition();
    if (!pointer) return;

    const { x, y } = pointer;

    setIsDrawing(true);
    isDrawingRef.current = true;

    const newElement: any = {
      id: nanoid(),
      x,
      y,
      strokeColor,
      strokeOpacity,
      strokeWidth,
      strokeStyle,
      fillColor,
      fillOpacity,
      opacity,
      sloppiness,
    };

    switch (activeTool) {
      case "rectangle":
        newElement.type = "rectangle";
        newElement.width = 0;
        newElement.height = 0;
        newElement.cornerRadius = rectangleCornerStyle === "rounded" ? 16 : 0;
        break;
      case "diamond":
        newElement.type = "diamond";
        newElement.width = 0;
        newElement.height = 0;
        break;
      case "ellipse":
        newElement.type = "ellipse";
        newElement.width = 0;
        newElement.height = 0;
        break;
      case "line":
      case "arrow":
        newElement.type = activeTool;
        newElement.points = [0, 0, 0, 0];
        newElement.arrowType = arrowType;
        newElement.arrowStyle = arrowStyle;
        newElement.penBackground = penBackground;
        break;
      case "pen":
        newElement.type = "pen";
        newElement.points = [0, 0];
        newElement.penBackground = penBackground;
        newElement.sloppiness = "smooth";
        break;
      default:
        break;
    }

    setCurrentShape(newElement);
    currentShapeRef.current = newElement;
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (isRulerMode) {
      const pointer = getCanvasPointerPosition();
      if (!pointer) {
        return;
      }

      if (!measurementStartRef.current && e.evt.shiftKey) {
        measurementStartRef.current = pointer;
        updateRulerMeasurement(pointer);
        return;
      }

      if (measurementStartRef.current) {
        updateRulerMeasurement(pointer);
      }
      return;
    }

    const marqueeState = marqueeSelectionRef.current;
    if (marqueeState) {
      const pointer = getCanvasPointerPosition();
      if (!pointer) return;

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
      return;
    }

    if (isErasing && activeTool === "eraser") {
      eraseElementAtPointer();
      return;
    }

    if (!isDrawing || !currentShape) return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const x = (pos.x - panX) / zoom;
    const y = (pos.y - panY) / zoom;
    const shiftPressed = e.evt.shiftKey;

    if (
      currentShape.type === "rectangle" ||
      currentShape.type === "diamond" ||
      currentShape.type === "ellipse"
    ) {
      const deltaX = x - currentShape.x;
      const deltaY = y - currentShape.y;
      let width = deltaX;
      let height = deltaY;

      if (shiftPressed) {
        const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        const widthSign = Math.sign(deltaX) || 1;
        const heightSign = Math.sign(deltaY) || 1;
        width = size * widthSign;
        height = size * heightSign;
      }

      const updatedShape = {
        ...currentShape,
        width,
        height,
      };
      setCurrentShape(updatedShape);
      currentShapeRef.current = updatedShape;
    } else if (currentShape.type === "line" || currentShape.type === "arrow") {
      let endX = x - currentShape.x;
      let endY = y - currentShape.y;

      if (shiftPressed) {
        const length = Math.hypot(endX, endY);
        if (length > 0) {
          const angle = Math.atan2(endY, endX);
          const step = Math.PI / 4;
          const snapped = Math.round(angle / step) * step;
          endX = Math.cos(snapped) * length;
          endY = Math.sin(snapped) * length;
        }
      }

      const basePoints = [0, 0, endX, endY];
      const nextPoints =
        currentShape.arrowStyle === "curve"
          ? ensureCurvePoints(basePoints)
          : basePoints;
      const updatedShape = {
        ...currentShape,
        points: nextPoints,
      };
      setCurrentShape(updatedShape);
      currentShapeRef.current = updatedShape;
    } else if (currentShape.type === "pen") {
      const newPoints = [
        ...currentShape.points,
        x - currentShape.x,
        y - currentShape.y,
      ];
      const updatedShape = {
        ...currentShape,
        points: newPoints,
      };
      setCurrentShape(updatedShape);
      currentShapeRef.current = updatedShape;
    }
  };

  const finalizeDrawing = useCallback(() => {
    const shape = currentShapeRef.current;
    if (shape) {
      addElement(shape);
      currentShapeRef.current = null;
      setCurrentShape(null);
    }
    setIsDrawing(false);
    isDrawingRef.current = false;
  }, [addElement]);

  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 && isMiddleMousePanning) {
      setIsMiddleMousePanning(false);
      return;
    }

    if (isRulerMode) {
      clearRulerMeasurement();
    }

    if (isErasing) {
      setIsErasing(false);
      lastErasedIdRef.current = null;
    }

    if (isDrawingRef.current) {
      finalizeDrawing();
    }

    const marqueeState = marqueeSelectionRef.current;
    if (marqueeState) {
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

      const bounds = normalizeRectBounds(
        rect.x,
        rect.y,
        rect.width,
        rect.height
      );
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
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePointerUp = (event: MouseEvent | TouchEvent) => {
      if (rulerMeasurementRef.current) {
        clearRulerMeasurement();
      }

      if (!isDrawingRef.current) {
        return;
      }

      if (event instanceof MouseEvent && event.button !== 0) {
        return;
      }

      finalizeDrawing();
    };

    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchend", handlePointerUp);
    window.addEventListener("touchcancel", handlePointerUp);

    return () => {
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchend", handlePointerUp);
      window.removeEventListener("touchcancel", handlePointerUp);
    };
  }, [clearRulerMeasurement, finalizeDrawing]);

  const applySelectionDrag = useCallback(
    (
      deltaX: number,
      deltaY: number,
      dragState: SelectionDragState,
      stage: Konva.Stage | null
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
    [elements, updateElement]
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
    [activeTool, elements, selectedIds]
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
    [activeTool, applySelectionDrag, updateElement]
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
    [activeTool, handleElementDragMove, pushHistory]
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
    [activeTool, elements, selectedIds]
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
    [activeTool, applySelectionDrag]
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
    [activeTool, handleSelectionGroupDragMove, pushHistory]
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
    [activeTool, pushHistory, updateElement]
  );

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    const shouldZoom = activeTool === "pan" || e.evt.ctrlKey;
    if (!shouldZoom) {
      return;
    }

    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const currentScale = Number.isFinite(zoom) ? zoom : 1;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - panX) / currentScale,
      y: (pointer.y - panY) / currentScale,
    };

    const rawScale =
      e.evt.deltaY > 0 ? currentScale * 0.95 : currentScale * 1.05;
    const nextScale = Math.max(
      0.1,
      Math.min(5, Number.isFinite(rawScale) ? rawScale : 1)
    );
    if (!Number.isFinite(nextScale)) {
      return;
    }

    useWhiteboardStore.setState({
      zoom: nextScale,
      pan: {
        x: pointer.x - mousePointTo.x * nextScale,
        y: pointer.y - mousePointTo.y * nextScale,
      },
    });
  };

  const editorHeight = editingText
    ? estimateTextBoxHeight(editingText.value, editingText.fontSize)
    : 0;
  const editorLineHeight = editingText
    ? getLineHeight(editingText.fontSize)
    : 0;
  const editorStyle: CSSProperties | undefined = editingText
    ? (() => {
        const baseLeft = panX + editingText.x * safeZoom;
        const baseTop = panY + editingText.y * safeZoom;
        const transforms: string[] = [];

        if (editingText.anchor === "center") {
          transforms.push("translate(-50%, -50%)");
        }

        if (editingText.rotation) {
          transforms.push(`rotate(${editingText.rotation}deg)`);
        }

        return {
          left: baseLeft,
          top: baseTop,
          width: editingText.width * safeZoom,
          height: editorHeight * safeZoom,
          fontSize: editingText.fontSize * safeZoom,
          fontFamily: getFontFamilyCss(editingText.fontFamily),
          textAlign: editingText.alignment,
          transform: transforms.length > 0 ? transforms.join(" ") : undefined,
          transformOrigin:
            editingText.anchor === "center" ? "center center" : "top left",
        } satisfies CSSProperties;
      })()
    : undefined;

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
    [updateElement]
  );

  const handleCurveHandleDragMove = useCallback(
    (
      event: KonvaEventObject<DragEvent>,
      element: CanvasElement,
      handleIndex: number
    ) => {
      event.cancelBubble = true;
      const node = event.target;
      updateCurveHandlePosition(element, handleIndex, node.x(), node.y());
    },
    [updateCurveHandlePosition]
  );

  const handleCurveHandleDragEnd = useCallback(
    (
      event: KonvaEventObject<DragEvent>,
      element: CanvasElement,
      handleIndex: number
    ) => {
      event.cancelBubble = true;
      const node = event.target;
      updateCurveHandlePosition(element, handleIndex, node.x(), node.y());
      pushHistory();
    },
    [pushHistory, updateCurveHandlePosition]
  );

  const getInteractionProps = useCallback(
    (element: CanvasElement) => {
      if (activeTool !== "select") {
        return { draggable: false };
      }

      const isSelected = selectedIds.includes(element.id);
      const interaction: Record<string, any> = {
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
    ]
  );

  return (
    <CanvasContextMenu
      canvasBackground={canvasBackground}
      onBackgroundChange={handleCanvasBackgroundChange}
      clipboardReadSupported={clipboardReadSupported}
      clipboardWriteSupported={clipboardWriteSupported}
      onPaste={handlePasteAction}
      onCopyAsPng={handleCopyAsPng}
      onCopyAsSvg={handleCopyAsSvg}
      onSelectAll={handleSelectAll}
      disableZIndexActions={selectedIds.length === 0}
      onBringToFront={bringToFront}
      onBringForward={bringForward}
      onSendBackward={sendBackward}
      onSendToBack={sendToBack}
    >
      <div
          ref={containerRef}
          className={cn("absolute inset-0", backgroundClassName)}
          style={backgroundStyle}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onContextMenu={recordContextMenuPosition}
        >
          <CanvasTextEditor
            ref={textEditorRef}
            editingText={editingText}
            editorStyle={editorStyle}
            safeZoom={safeZoom}
            editorLineHeight={editorLineHeight}
            onChange={setEditingText}
            onFinish={finishEditingText}
          />
          <Stage
            ref={stageRef}
            width={Math.max(stageSize.width, 1)}
            height={Math.max(stageSize.height, 1)}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDblClick={handleStageDoublePointer}
            onDblTap={handleStageDoublePointer}
            onWheel={handleWheel}
            draggable={isPanMode}
            scaleX={safeZoom}
            scaleY={safeZoom}
            className={cn("h-full w-full", stageCursorClass)}
            onDragStart={() => setIsPanning(true)}
            onDragMove={syncPanFromStage}
            onDragEnd={(event) => {
              setIsPanning(false);
              setIsMiddleMousePanning(false);
              syncPanFromStageImmediate(event);
            }}
            onMouseLeave={() => {
              if (isErasing) {
                setIsErasing(false);
              }
              lastErasedIdRef.current = null;
              clearRulerMeasurement();
            }}
          >
            <CanvasElementsLayer
              visibleElements={visibleElements}
              selectedIds={selectedIds}
              focusedElementId={focusedElementId}
              safeZoom={safeZoom}
              defaultFontSize={textFontSize}
              editingTextId={editingText?.id ?? null}
              getInteractionProps={getInteractionProps}
              selectionRect={selectionRect}
              activeTool={activeTool}
              selectionBounds={selectionBounds}
              onSelectionGroupDragStart={handleSelectionGroupDragStart}
              onSelectionGroupDragMove={handleSelectionGroupDragMove}
              onSelectionGroupDragEnd={handleSelectionGroupDragEnd}
              rulerMeasurement={rulerMeasurement}
              curveHandleElements={curveHandleElements}
              onCurveHandleDragMove={handleCurveHandleDragMove}
              onCurveHandleDragEnd={handleCurveHandleDragEnd}
              currentShape={currentShape as CanvasElement | null}
              users={users}
              pan={pan}
              zoom={zoom}
              transformerRef={transformerRef}
            />
          </Stage>
        </div>
    </CanvasContextMenu>
  );
};
