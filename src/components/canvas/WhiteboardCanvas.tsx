"use client";

import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  Fragment,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Line,
  Text as KonvaText,
  Arrow,
  Transformer,
  Ellipse,
} from "react-konva";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type {
  CanvasElement,
  TextAlignment,
  CanvasBackground,
} from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useDragDrop } from "./DragDropHandler";
import { UserCursor } from "./UserCursor";
import { ImageElement, FileElement } from "./elements";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { CurrentShapePreview } from "./CurrentShapePreview";
import { RulerOverlay, type RulerMeasurement } from "./RulerOverlay";
import {
  MINIMAP_ENABLED,
  PEN_TENSION,
  STROKE_BACKGROUND_PADDING,
  getSafeCornerRadius,
} from "./constants";
import { cn } from "@/lib/utils";
import { getColorWithOpacity } from "@/lib/color";
import {
  createSloppyStrokeLayers,
  getEllipseOutlinePoints,
  getRectangleOutlinePoints,
  sampleCurvePoints,
} from "@/lib/canvas/sloppiness";
import {
  type Bounds,
  normalizeRectBounds,
  getElementBounds,
  isElementWithinSelection,
  getDiamondShape,
  getArrowRenderConfig,
  ensureCurvePoints,
  getLineHeight,
  estimateTextBoxWidth,
  estimateTextBoxHeight,
  getFontFamilyCss,
  TEXT_MIN_WIDTH,
  getStrokeDash,
  resolveElementId,
  duplicateElement,
  RESIZABLE_ELEMENT_TYPES,
} from "@/lib/canvas";
import { useToast } from "@/hooks/use-toast";

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MarqueeSelectionState = {
  originX: number;
  originY: number;
  additive: boolean;
  initialSelection: string[];
  moved: boolean;
};

type SelectionDragState = {
  startNodes: Record<string, { x: number; y: number }>;
  elements: Record<string, CanvasElement>;
  affectedIds: string[];
  referenceId: string | null;
};

const SELECTION_GROUP_ID = "__selection_group__";

type EditingTextState = {
  id: string;
  x: number;
  y: number;
  anchor: "top-left" | "center";
  rotation: number;
  value: string;
  initialValue: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  alignment: TextAlignment;
  lockWidth: boolean;
  persistWidth: boolean;
};

export const WhiteboardCanvas = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const editingTextRef = useRef<EditingTextState | null>(null);
  const miniMapDragRef = useRef(false);
  const skipNextPointerRef = useRef(false);
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
  const [stageSize, setStageSize] = useState(() => ({
    width: 0,
    height: 0,
  }));
  const [editingText, setEditingText] = useState<EditingTextState | null>(null);
  const [isMiniMapInteracting, setIsMiniMapInteracting] = useState(false);
  const [miniMapContainer, setMiniMapContainer] = useState<HTMLElement | null>(
    null
  );
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

  useEffect(() => {
    if (!MINIMAP_ENABLED) {
      return;
    }

    if (typeof document === "undefined") {
      return;
    }

    const node = document.getElementById("right-sidebar-minimap");
    setMiniMapContainer(node ?? null);
  }, []);

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
    setActiveTool,
    openFilePreview,
  } = useWhiteboardStore();

  const panX = pan.x;
  const panY = pan.y;
  const safeZoom = zoom || 1;
  const clipboard =
    typeof navigator === "undefined" ? null : navigator.clipboard;
  const clipboardReadSupported =
    !!clipboard &&
    (typeof clipboard.read === "function" ||
      typeof clipboard.readText === "function");
  const clipboardWriteSupported =
    !!clipboard &&
    typeof clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined";

  useEffect(() => {
    if (activeTool !== "select") {
      marqueeSelectionRef.current = null;
      setSelectionRect(null);
    }
  }, [activeTool]);

  const switchToSelectionTool = useCallback(() => {
    setActiveTool("select");
  }, [setActiveTool]);

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

  const isRulerMode = activeTool === "ruler";

  useEffect(() => {
    if (!isRulerMode) {
      clearRulerMeasurement();
    }
  }, [clearRulerMeasurement, isRulerMode]);

  const createTextElementFromClipboard = useCallback(
    (content: string, position: { x: number; y: number }) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const width = estimateTextBoxWidth(trimmed, textFontSize);
      const height = estimateTextBoxHeight(trimmed, textFontSize);
      const textElement: CanvasElement = {
        id: nanoid(),
        type: "text",
        x: position.x,
        y: position.y,
        text: trimmed,
        strokeColor,
        fillColor,
        fillOpacity,
        strokeWidth,
        strokeStyle,
        opacity,
        sloppiness,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        textAlign,
        width,
        height,
      };

      addElement(textElement);
      setSelectedIds([textElement.id]);
      switchToSelectionTool();
    },
    [
      addElement,
      fillColor,
      fillOpacity,
      opacity,
      setSelectedIds,
      sloppiness,
      strokeColor,
      strokeStyle,
      strokeWidth,
      textAlign,
      textFontFamily,
      textFontSize,
      switchToSelectionTool,
    ]
  );

  const handlePasteAction = useCallback(async () => {
    if (typeof navigator === "undefined") {
      toast({
        variant: "destructive",
        title: "Clipboard unavailable",
        description: "Clipboard is not accessible in this environment.",
      });
      return;
    }

    const clipboardApi = navigator.clipboard;
    if (!clipboardApi || (!clipboardApi.read && !clipboardApi.readText)) {
      toast({
        variant: "destructive",
        title: "Clipboard unavailable",
        description: "Your browser does not support clipboard access.",
      });
      return;
    }

    const position = getPastePosition();

    try {
      if (clipboardApi.read) {
        const items = await clipboardApi.read();
        const files: File[] = [];
        let textContent: string | null = null;
        const timestamp = Date.now();

        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith("image/") || type === "application/pdf") {
              const blob = await item.getType(type);
              const extension = type.split("/")[1] ?? "bin";
              const fileName = `pasted-${timestamp}-${files.length}.${extension}`;
              files.push(new File([blob], fileName, { type }));
            } else if (type === "text/plain" && textContent === null) {
              const blob = await item.getType(type);
              textContent = await blob.text();
            }
          }
        }

        if (files.length > 0) {
          await addFilesToCanvas(files, position);
          toast({
            title: "Pasted from clipboard",
            description:
              files.length > 1
                ? `${files.length} items were added to the canvas.`
                : "Clipboard item was added to the canvas.",
          });
          return;
        }

        if (textContent && textContent.trim()) {
          createTextElementFromClipboard(textContent, position);
          toast({
            title: "Text pasted",
            description: "Clipboard text was added to the canvas.",
          });
          return;
        }
      }

      if (clipboardApi.readText) {
        const text = await clipboardApi.readText();
        if (text && text.trim()) {
          createTextElementFromClipboard(text, position);
          toast({
            title: "Text pasted",
            description: "Clipboard text was added to the canvas.",
          });
          return;
        }
      }

      toast({
        variant: "destructive",
        title: "Nothing to paste",
        description: "Clipboard does not contain supported content.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Paste failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to paste clipboard content.",
      });
    }
  }, [
    addFilesToCanvas,
    createTextElementFromClipboard,
    getPastePosition,
    toast,
  ]);

  const handleCopyAsPng = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) {
      toast({
        variant: "destructive",
        title: "Unable to copy",
        description: "Canvas is not ready yet.",
      });
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
      toast({
        variant: "destructive",
        title: "Clipboard unavailable",
        description: "Your browser cannot copy images to the clipboard.",
      });
      return;
    }

    if (typeof ClipboardItem === "undefined") {
      toast({
        variant: "destructive",
        title: "Clipboard unavailable",
        description: "Clipboard images are not supported in this browser.",
      });
      return;
    }

    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const clipboardItem = new ClipboardItem({
        [blob.type || "image/png"]: blob,
      });
      await navigator.clipboard.write([clipboardItem]);
      toast({
        title: "Copied canvas",
        description: "Canvas copied to clipboard as PNG.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Failed to copy PNG",
        description:
          error instanceof Error ? error.message : "Unable to copy as PNG.",
      });
    }
  }, [toast]);

  const handleCopyAsSvg = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) {
      toast({
        variant: "destructive",
        title: "Unable to copy",
        description: "Canvas is not ready yet.",
      });
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
      toast({
        variant: "destructive",
        title: "Clipboard unavailable",
        description: "Your browser cannot copy SVG content to the clipboard.",
      });
      return;
    }

    if (typeof ClipboardItem === "undefined") {
      toast({
        variant: "destructive",
        title: "Clipboard unavailable",
        description: "Clipboard SVGs are not supported in this browser.",
      });
      return;
    }

    try {
      const svg = stage.toSVG();
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const clipboardItem = new ClipboardItem({ "image/svg+xml": blob });
      await navigator.clipboard.write([clipboardItem]);
      toast({
        title: "Copied canvas",
        description: "Canvas copied to clipboard as SVG.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Failed to copy SVG",
        description:
          error instanceof Error ? error.message : "Unable to copy as SVG.",
      });
    }
  }, [toast]);

  const handleSelectAll = useCallback(() => {
    if (!elements.length) {
      return;
    }

    const ids = elements.map((element) => element.id);
    setSelectedIds(ids);
  }, [elements, setSelectedIds]);

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

  const beginTextEditing = useCallback(
    (element: CanvasElement, options?: { value?: string; width?: number }) => {
      const initialValue = element.text ?? "";
      const value = options?.value ?? initialValue;
      const fontSize = element.fontSize ?? textFontSize;
      const fontFamily = element.fontFamily ?? textFontFamily;
      const alignment = element.textAlign ?? textAlign;

      let width =
        options?.width ??
        element.width ??
        estimateTextBoxWidth(value || initialValue, fontSize);
      let x = element.x;
      let y = element.y;
      let anchor: EditingTextState["anchor"] = "top-left";
      const rotation = typeof element.rotation === "number" ? element.rotation : 0;
      let lockWidth = false;
      let persistWidth = element.type === "text";

      if (element.type === "rectangle" || element.type === "diamond") {
        const bounds = normalizeRectBounds(
          element.x,
          element.y,
          element.width ?? 0,
          element.height ?? 0
        );
        const shapeWidth = bounds.maxX - bounds.minX;
        const shapeHeight = bounds.maxY - bounds.minY;
        const padding = element.type === "rectangle" ? 16 : 18;
        const availableWidth = Math.max(0, shapeWidth - padding * 2);
        const centerX = bounds.minX + shapeWidth / 2;
        const centerY = bounds.minY + shapeHeight / 2;

        if (availableWidth > 0) {
          width = availableWidth;
          lockWidth = true;
        }

        x = centerX;
        y = centerY;
        anchor = "center";
        persistWidth = false;
      }

      const editingState: EditingTextState = {
        id: element.id,
        x,
        y,
        anchor,
        rotation,
        value,
        initialValue,
        width,
        fontSize,
        fontFamily,
        alignment,
        lockWidth,
        persistWidth,
      };
      setSelectedIds([element.id]);
      setEditingText(editingState);
    },
    [setSelectedIds, textAlign, textFontFamily, textFontSize]
  );

  const finishEditingText = useCallback(
    (options?: { cancel?: boolean; skipNextPointer?: boolean }) => {
      const current = editingTextRef.current;
      if (!current) {
        return;
      }

      editingTextRef.current = null;
      setEditingText(null);

      if (options?.skipNextPointer) {
        skipNextPointerRef.current = true;
      }

      if (options?.cancel) {
        if (current.initialValue) {
          updateElement(current.id, { text: current.initialValue });
        } else {
          deleteElement(current.id);
        }
        return;
      }

      const trimmed = current.value.trim();
      if (!trimmed) {
        deleteElement(current.id);
        return;
      }

      const updates: Partial<CanvasElement> = {
        text: trimmed,
        fontSize: current.fontSize,
        fontFamily: current.fontFamily,
        textAlign: current.alignment,
      };

      if (current.persistWidth) {
        updates.width = current.width;
      }

      updateElement(current.id, updates);
    },
    [deleteElement, updateElement]
  );

  const cancelIfEditing = useCallback(() => {
    if (editingTextRef.current) {
      finishEditingText();
      return true;
    }
    return false;
  }, [finishEditingText]);

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

  const getMiniMapCoordinates = useCallback(
    (
      event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>
    ) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if ("touches" in event) {
        const touch = event.touches[0];
        if (!touch) return null;
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    []
  );

  useEffect(() => {
    editingTextRef.current = editingText;
  }, [editingText]);

  useEffect(() => {
    if (!editingText) {
      return;
    }

    const textarea = textEditorRef.current;
    if (!textarea) {
      return;
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }, [editingText]);

  const miniMapData = useMemo(() => {
    if (!MINIMAP_ENABLED) {
      return null;
    }

    if (stageSize.width === 0 || stageSize.height === 0) {
      return null;
    }

    const viewportMinX = -panX / safeZoom;
    const viewportMinY = -panY / safeZoom;
    const viewportWidth = stageSize.width / safeZoom;
    const viewportHeight = stageSize.height / safeZoom;
    const mapWidth = 220;
    const mapHeight = 160;

    if (elements.length === 0) {
      const anchorCenterX = viewportWidth / 2;
      const anchorCenterY = viewportHeight / 2;
      const defaultHalfWidth = viewportWidth * 2;
      const defaultHalfHeight = viewportHeight * 2;
      const minX = anchorCenterX - defaultHalfWidth;
      const minY = anchorCenterY - defaultHalfHeight;
      const maxX = anchorCenterX + defaultHalfWidth;
      const maxY = anchorCenterY + defaultHalfHeight;

      const worldWidth = Math.max(1, maxX - minX);
      const worldHeight = Math.max(1, maxY - minY);
      const scale = Math.min(mapWidth / worldWidth, mapHeight / worldHeight);

      return {
        mapWidth,
        mapHeight,
        scale,
        offsetX: minX,
        offsetY: minY,
        viewport: {
          minX: viewportMinX,
          minY: viewportMinY,
          width: viewportWidth,
          height: viewportHeight,
        },
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      const bounds = getElementBounds(element);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      minX = viewportMinX;
      minY = viewportMinY;
      maxX = viewportMinX + viewportWidth;
      maxY = viewportMinY + viewportHeight;
    }

    const padding = 80;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const viewportMaxX = viewportMinX + viewportWidth;
    const viewportMaxY = viewportMinY + viewportHeight;

    minX = Math.min(minX, viewportMinX);
    minY = Math.min(minY, viewportMinY);
    maxX = Math.max(maxX, viewportMaxX);
    maxY = Math.max(maxY, viewportMaxY);

    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);
    const scale = Math.min(mapWidth / worldWidth, mapHeight / worldHeight);

    return {
      mapWidth,
      mapHeight,
      scale,
      offsetX: minX,
      offsetY: minY,
      viewport: {
        minX: viewportMinX,
        minY: viewportMinY,
        width: viewportWidth,
        height: viewportHeight,
      },
    };
  }, [elements, panX, panY, safeZoom, stageSize.height, stageSize.width]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    if (typeof window.ResizeObserver === "undefined") {
      const rect = element.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
      return;
    }

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStageSize({ width, height });
    });

    const rect = element.getBoundingClientRect();
    setStageSize({ width: rect.width, height: rect.height });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    editingTextRef.current = editingText;
  }, [editingText]);

  useEffect(() => {
    if (!editingText) {
      return;
    }

    const textarea = textEditorRef.current;
    if (!textarea) {
      return;
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }, [editingText]);

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
  }, [selectedIds, elements, addElement, setSelectedIds]);

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

  const panToMiniMapPoint = useCallback(
    (pointX: number, pointY: number) => {
      if (!miniMapData) return;

      const worldX = pointX / miniMapData.scale + miniMapData.offsetX;
      const worldY = pointY / miniMapData.scale + miniMapData.offsetY;

      const viewportWidth = stageSize.width / safeZoom;
      const viewportHeight = stageSize.height / safeZoom;

      const nextPanX = -(worldX - viewportWidth / 2) * safeZoom;
      const nextPanY = -(worldY - viewportHeight / 2) * safeZoom;

      schedulePanUpdate(
        {
          x: Number.isFinite(nextPanX) ? nextPanX : panX,
          y: Number.isFinite(nextPanY) ? nextPanY : panY,
        },
        true
      );
    },
    [
      miniMapData,
      panX,
      panY,
      safeZoom,
      schedulePanUpdate,
      stageSize.height,
      stageSize.width,
    ]
  );

  const updatePanFromMiniMap = useCallback(
    (
      event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>
    ) => {
      const coords = getMiniMapCoordinates(event);
      if (!coords) return;
      panToMiniMapPoint(coords.x, coords.y);
    },
    [getMiniMapCoordinates, panToMiniMapPoint]
  );

  const handleMiniMapPointerDown = useCallback(
    (
      event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();
      miniMapDragRef.current = true;
      setIsMiniMapInteracting(true);
      updatePanFromMiniMap(event);
    },
    [updatePanFromMiniMap]
  );

  const handleMiniMapPointerMove = useCallback(
    (
      event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>
    ) => {
      if (!miniMapDragRef.current) return;
      event.preventDefault();
      updatePanFromMiniMap(event);
    },
    [updatePanFromMiniMap]
  );

  const endMiniMapInteraction = useCallback(() => {
    miniMapDragRef.current = false;
    setIsMiniMapInteracting(false);
  }, []);

  const backgroundConfig = useMemo(() => {
    const baseSize = Math.max(4, 20 * safeZoom);
    const basePosition = `${panX}px ${panY}px`;

    if (canvasBackground === "none") {
      return {
        className: "",
        style: {
          backgroundImage: "none",
          backgroundSize: undefined,
          backgroundPosition: undefined,
        } as CSSProperties,
      };
    }

    if (canvasBackground === "technical") {
      const majorSize = baseSize * 5;
      const repeatedPosition = Array(4).fill(basePosition).join(", ");

      return {
        className: "technical-grid",
        style: {
          backgroundSize: `${baseSize}px ${baseSize}px, ${baseSize}px ${baseSize}px, ${majorSize}px ${majorSize}px, ${majorSize}px ${majorSize}px`,
          backgroundPosition: repeatedPosition,
        } as CSSProperties,
      };
    }

    return {
      className: "dotted-grid",
      style: {
        backgroundSize: `${baseSize}px ${baseSize}px`,
        backgroundPosition: basePosition,
      } as CSSProperties,
    };
  }, [canvasBackground, panX, panY, safeZoom]);
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

  const miniMapContent =
    MINIMAP_ENABLED && miniMapData ? (
      <div
        className={cn(
          "pointer-events-auto w-full rounded-xl border border-slate-200/80 bg-white/80 p-3 backdrop-blur transition-shadow",
          isMiniMapInteracting
            ? "shadow-xl ring-1 ring-sky-200/70"
            : "shadow-lg"
        )}
      >
        <svg
          width={miniMapData.mapWidth}
          height={miniMapData.mapHeight}
          className={cn(
            "block h-auto w-full max-h-[200px] select-none sm:max-h-[240px]",
            isMiniMapInteracting ? "cursor-grabbing" : "cursor-pointer"
          )}
          viewBox={`0 0 ${miniMapData.mapWidth} ${miniMapData.mapHeight}`}
          aria-hidden="true"
          onMouseDown={handleMiniMapPointerDown}
          onMouseMove={handleMiniMapPointerMove}
          onMouseUp={(event) => {
            event.preventDefault();
            endMiniMapInteraction();
          }}
          onMouseLeave={endMiniMapInteraction}
          onTouchStart={handleMiniMapPointerDown}
          onTouchMove={handleMiniMapPointerMove}
          onTouchEnd={(event) => {
            event.preventDefault();
            endMiniMapInteraction();
          }}
          onTouchCancel={endMiniMapInteraction}
        >
          <rect
            x={0}
            y={0}
            width={miniMapData.mapWidth}
            height={miniMapData.mapHeight}
            fill="#f8fafc"
            stroke="rgba(148, 163, 184, 0.45)"
            strokeWidth={1}
            rx={12}
            ry={12}
          />
          {elements.map((element) => {
            const bounds = getElementBounds(element);
            const x = (bounds.minX - miniMapData.offsetX) * miniMapData.scale;
            const y = (bounds.minY - miniMapData.offsetY) * miniMapData.scale;
            const width = Math.max(
              2,
              (bounds.maxX - bounds.minX) * miniMapData.scale
            );
            const height = Math.max(
              2,
              (bounds.maxY - bounds.minY) * miniMapData.scale
            );

            return (
              <rect
                key={`mini-${element.id}`}
                x={x}
                y={y}
                width={width}
                height={height}
                fill="rgba(148, 163, 184, 0.35)"
                stroke="rgba(148, 163, 184, 0.55)"
                strokeWidth={1}
                rx={width < 6 ? 1.5 : 3}
                ry={height < 6 ? 1.5 : 3}
              />
            );
          })}
          {(() => {
            const viewportX =
              (miniMapData.viewport.minX - miniMapData.offsetX) *
              miniMapData.scale;
            const viewportY =
              (miniMapData.viewport.minY - miniMapData.offsetY) *
              miniMapData.scale;
            const viewportWidth = Math.max(
              4,
              miniMapData.viewport.width * miniMapData.scale
            );
            const viewportHeight = Math.max(
              4,
              miniMapData.viewport.height * miniMapData.scale
            );

            return (
              <rect
                x={viewportX}
                y={viewportY}
                width={viewportWidth}
                height={viewportHeight}
                fill="rgba(14, 165, 233, 0.1)"
                stroke="#0284c7"
                strokeWidth={1.5}
                rx={6}
                ry={6}
              />
            );
          })()}
        </svg>
      </div>
    ) : null;

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
      switchToSelectionTool();
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
      switchToSelectionTool();
      currentShapeRef.current = null;
      setCurrentShape(null);
    }
    setIsDrawing(false);
    isDrawingRef.current = false;
  }, [addElement, switchToSelectionTool]);

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
          {editingText && editorStyle && (
            <textarea
              ref={textEditorRef}
              className="pointer-events-auto absolute z-40 resize-none border-none bg-transparent text-slate-800 outline-none caret-slate-800"
              style={{
                ...editorStyle,
                lineHeight: `${editorLineHeight * safeZoom}px`,
                padding: `${12 * safeZoom}px`,
                whiteSpace: "pre",
                overflowWrap: "normal",
                wordBreak: "keep-all",
                minWidth: editingText.lockWidth
                  ? undefined
                  : `${TEXT_MIN_WIDTH * safeZoom}px`,
                maxWidth: "none",
              }}
              value={editingText.value}
              onChange={(event) => {
                const { value } = event.target;
                setEditingText((current) => {
                  if (!current) return current;
                  const newWidth = estimateTextBoxWidth(value, current.fontSize);
                  return {
                    ...current,
                    value,
                    width: current.lockWidth ? current.width : newWidth,
                  };
                });
              }}
              onBlur={() => finishEditingText({ skipNextPointer: true })}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  finishEditingText({ cancel: true });
                }
                if (event.key === "Enter") {
                  if (event.metaKey || event.ctrlKey) {
                    event.preventDefault();
                    finishEditingText();
                  }
                  // Allow normal Enter to create new lines
                }
              }}
              spellCheck
              placeholder="Type"
            />
          )}
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
            <Layer>
              {/* Render all elements */}
              {visibleElements.map((element) => {
                const isSelected = selectedIds.includes(element.id);
                const focusHighlight =
                  focusedElementId === element.id
                    ? {
                        shadowColor: "#38bdf8",
                        shadowBlur: 24,
                        shadowOpacity: 0.85,
                        shadowOffsetX: 0,
                        shadowOffsetY: 0,
                      }
                    : {};
                const selectionHighlight = isSelected
                  ? {
                      shadowColor: "#0ea5e9",
                      shadowBlur: Math.max(18, 12 / safeZoom),
                      shadowOpacity: 0.75,
                      shadowOffsetX: 0,
                      shadowOffsetY: 0,
                    }
                  : {};
                const highlightProps = {
                  ...focusHighlight,
                  ...selectionHighlight,
                };
                const interactionProps = getInteractionProps(element);
                const isEditingElement = editingText?.id === element.id;
                if (element.type === "rectangle") {
                  const safeCornerRadius = getSafeCornerRadius(
                    element.width,
                    element.height,
                    element.cornerRadius
                  );
                  const rectBounds = normalizeRectBounds(
                    element.x,
                    element.y,
                    element.width ?? 0,
                    element.height ?? 0
                  );
                  const rectWidth = rectBounds.maxX - rectBounds.minX;
                  const rectHeight = rectBounds.maxY - rectBounds.minY;
                  const rectX = rectBounds.minX;
                  const rectY = rectBounds.minY;
                  const hasLabel = Boolean(element.text?.trim());
                  const labelFontSize = element.fontSize ?? textFontSize;
                  const labelLineHeight = labelFontSize
                    ? getLineHeight(labelFontSize) / labelFontSize
                    : 1.4;
                  const labelPadding = 16;
                  const labelWidth = Math.max(0, rectWidth - labelPadding * 2);
                  const labelHeight = Math.max(0, rectHeight - labelPadding * 2);
                  const labelCenterX = rectX + rectWidth / 2;
                  const labelCenterY = rectY + rectHeight / 2;
                  const rectOutlinePoints = getRectangleOutlinePoints(
                    element.width ?? 0,
                    element.height ?? 0,
                    safeCornerRadius
                  );
                  const rectSloppyLayers = createSloppyStrokeLayers(
                    rectOutlinePoints,
                    {
                      sloppiness: element.sloppiness,
                      strokeWidth: element.strokeWidth,
                      seed: `${element.id}:rect`,
                      closed: true,
                    }
                  );
                  return (
                    <Fragment key={element.id}>
                      <Rect
                        key={element.id}
                        id={element.id}
                        x={element.x}
                        y={element.y}
                        width={element.width}
                        height={element.height}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        dash={getStrokeDash(element.strokeStyle)}
                        fill={getColorWithOpacity(
                          element.fillColor,
                          element.fillOpacity
                        )}
                        opacity={element.opacity}
                        rotation={element.rotation}
                        cornerRadius={safeCornerRadius}
                        strokeEnabled={element.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, element.strokeWidth)}
                        {...highlightProps}
                        {...interactionProps}
                      />
                      {rectSloppyLayers.map((layer, index) => (
                        <Line
                          key={`${element.id}-sloppy-rect-${index}`}
                          x={element.x}
                          y={element.y}
                          points={layer.points}
                          stroke={getColorWithOpacity(
                            element.strokeColor,
                            element.strokeOpacity,
                          )}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(element.strokeStyle)}
                          opacity={element.opacity * layer.opacity}
                          rotation={element.rotation}
                          lineCap="round"
                          lineJoin="round"
                          closed
                          listening={false}
                          {...highlightProps}
                        />
                      ))}
                      {hasLabel &&
                        rectWidth > 0 &&
                        rectHeight > 0 &&
                        labelWidth > 0 &&
                        labelHeight > 0 && (
                        <KonvaText
                          key={`${element.id}-label`}
                          x={labelCenterX}
                          y={labelCenterY}
                          width={labelWidth}
                          height={labelHeight}
                          text={element.text ?? ""}
                          fontSize={labelFontSize}
                          fontFamily={getFontFamilyCss(element.fontFamily)}
                          lineHeight={labelLineHeight}
                          align={(element.textAlign as TextAlignment) ?? "center"}
                          verticalAlign="middle"
                          fill={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                          opacity={element.opacity}
                          offsetX={labelWidth / 2}
                          offsetY={labelHeight / 2}
                          rotation={element.rotation ?? 0}
                          padding={8}
                          wrap="word"
                          listening={false}
                        />
                      )}
                    </Fragment>
                  );
                } else if (element.type === "diamond") {
                  const diamond = getDiamondShape(
                    element.x,
                    element.y,
                    element.width ?? 0,
                    element.height ?? 0
                  );
                  const diamondBounds = normalizeRectBounds(
                    element.x,
                    element.y,
                    element.width ?? 0,
                    element.height ?? 0
                  );
                  const diamondWidth = diamondBounds.maxX - diamondBounds.minX;
                  const diamondHeight = diamondBounds.maxY - diamondBounds.minY;
                  const hasLabel = Boolean(element.text?.trim());
                  const labelFontSize = element.fontSize ?? textFontSize;
                  const labelLineHeight = labelFontSize
                    ? getLineHeight(labelFontSize) / labelFontSize
                    : 1.4;
                  const labelPadding = 18;
                  const labelWidth = Math.max(0, diamondWidth - labelPadding * 2);
                  const labelHeight = Math.max(0, diamondHeight - labelPadding * 2);
                  const labelCenterX = diamondBounds.minX + diamondWidth / 2;
                  const labelCenterY = diamondBounds.minY + diamondHeight / 2;
                  const diamondSloppyLayers = createSloppyStrokeLayers(
                    diamond.points,
                    {
                      sloppiness: element.sloppiness,
                      strokeWidth: element.strokeWidth,
                      seed: `${element.id}:diamond`,
                      closed: true,
                    }
                  );
                  return (
                    <Fragment key={element.id}>
                      <Line
                        key={element.id}
                        id={element.id}
                        x={diamond.x}
                        y={diamond.y}
                        points={diamond.points}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        dash={getStrokeDash(element.strokeStyle)}
                        fill={getColorWithOpacity(
                          element.fillColor,
                          element.fillOpacity
                        )}
                        opacity={element.opacity}
                        rotation={element.rotation}
                        closed
                        lineJoin="round"
                        strokeEnabled={element.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, element.strokeWidth)}
                        {...highlightProps}
                        {...interactionProps}
                      />
                      {diamondSloppyLayers.map((layer, index) => (
                        <Line
                          key={`${element.id}-sloppy-diamond-${index}`}
                          x={diamond.x}
                          y={diamond.y}
                          points={layer.points}
                          stroke={getColorWithOpacity(
                            element.strokeColor,
                            element.strokeOpacity,
                          )}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(element.strokeStyle)}
                          opacity={element.opacity * layer.opacity}
                          rotation={element.rotation}
                          closed
                          lineJoin="round"
                          listening={false}
                          {...highlightProps}
                        />
                      ))}
                      {hasLabel &&
                        diamondWidth > 0 &&
                        diamondHeight > 0 &&
                        labelWidth > 0 &&
                        labelHeight > 0 && (
                        <KonvaText
                          key={`${element.id}-label`}
                          x={labelCenterX}
                          y={labelCenterY}
                          width={labelWidth}
                          height={labelHeight}
                          text={element.text ?? ""}
                          fontSize={labelFontSize}
                          fontFamily={getFontFamilyCss(element.fontFamily)}
                          lineHeight={labelLineHeight}
                          align={(element.textAlign as TextAlignment) ?? "center"}
                          verticalAlign="middle"
                          fill={getColorWithOpacity(element.strokeColor, element.strokeOpacity)}
                          opacity={element.opacity}
                          offsetX={labelWidth / 2}
                          offsetY={labelHeight / 2}
                          rotation={element.rotation ?? 0}
                          padding={8}
                          wrap="word"
                          listening={false}
                        />
                      )}
                    </Fragment>
                  );
                } else if (element.type === "ellipse") {
                  const ellipseOutlinePoints = getEllipseOutlinePoints(
                    element.width ?? 0,
                    element.height ?? 0
                  );
                  const ellipseSloppyLayers = createSloppyStrokeLayers(
                    ellipseOutlinePoints,
                    {
                      sloppiness: element.sloppiness,
                      strokeWidth: element.strokeWidth,
                      seed: `${element.id}:ellipse`,
                      closed: true,
                    }
                  );
                  const ellipseCenterX = element.x + (element.width ?? 0) / 2;
                  const ellipseCenterY = element.y + (element.height ?? 0) / 2;
                  return (
                    <Fragment key={element.id}>
                      <Ellipse
                        key={element.id}
                        id={element.id}
                        x={ellipseCenterX}
                        y={ellipseCenterY}
                        radiusX={Math.abs((element.width ?? 0) / 2)}
                        radiusY={Math.abs((element.height ?? 0) / 2)}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        dash={getStrokeDash(element.strokeStyle)}
                        fill={getColorWithOpacity(
                          element.fillColor,
                          element.fillOpacity
                        )}
                        opacity={element.opacity}
                        rotation={element.rotation}
                        strokeEnabled={element.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, element.strokeWidth)}
                        {...highlightProps}
                        {...interactionProps}
                      />
                      {ellipseSloppyLayers.map((layer, index) => (
                        <Line
                          key={`${element.id}-sloppy-ellipse-${index}`}
                          x={ellipseCenterX}
                          y={ellipseCenterY}
                          points={layer.points}
                          stroke={getColorWithOpacity(
                            element.strokeColor,
                            element.strokeOpacity,
                          )}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(element.strokeStyle)}
                          opacity={element.opacity * layer.opacity}
                          rotation={element.rotation}
                          closed
                          lineJoin="round"
                          listening={false}
                          {...highlightProps}
                        />
                      ))}
                    </Fragment>
                  );
                } else if (element.type === "line") {
                  const { points: linePoints, bezier } = getArrowRenderConfig(
                    element.points,
                    element.arrowStyle
                  );
                  const lineOverlayPoints = bezier
                    ? sampleCurvePoints(linePoints)
                    : linePoints;
                  const lineSloppyLayers = createSloppyStrokeLayers(
                    lineOverlayPoints,
                    {
                      sloppiness: element.sloppiness,
                      strokeWidth: element.strokeWidth,
                      seed: `${element.id}:line`,
                    }
                  );
                  const interactionOpacity =
                    element.sloppiness === "smooth" ? element.opacity : 0.001;
                  const hasBackground =
                    element.penBackground &&
                    element.penBackground !== "transparent";
                  const backgroundOpacity = element.opacity * 0.4 + 0.2;
                  const baseBackgroundOpacity = Math.min(1, backgroundOpacity);
                  const backgroundStrokeWidth =
                    element.strokeWidth + STROKE_BACKGROUND_PADDING;
                  const showBaseStroke = element.sloppiness === "smooth";
                  return (
                    <Fragment key={element.id}>
                      <Line
                        key={`${element.id}-interaction`}
                        id={element.id}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={linePoints}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        dash={getStrokeDash(element.strokeStyle)}
                        opacity={interactionOpacity}
                        lineCap="round"
                        lineJoin="round"
                        bezier={bezier}
                        tension={0}
                        hitStrokeWidth={Math.max(12, element.strokeWidth)}
                        {...interactionProps}
                      />
                      {hasBackground && showBaseStroke && (
                        <Line
                          key={`${element.id}-background`}
                          id={`${element.id}-background`}
                          elementId={element.id}
                          x={element.x}
                          y={element.y}
                          points={linePoints}
                          stroke={element.penBackground}
                          strokeWidth={backgroundStrokeWidth}
                          dash={getStrokeDash(element.strokeStyle)}
                          opacity={baseBackgroundOpacity}
                          lineCap="round"
                          lineJoin="round"
                          bezier={bezier}
                          tension={0}
                          listening={false}
                        />
                      )}
                      <Line
                        key={`${element.id}-visible`}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={linePoints}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        dash={getStrokeDash(element.strokeStyle)}
                        opacity={element.opacity}
                        lineCap="round"
                        lineJoin="round"
                        bezier={bezier}
                        tension={0}
                        strokeEnabled={element.sloppiness === "smooth"}
                        listening={false}
                        {...highlightProps}
                      />
                      {lineSloppyLayers.map((layer, index) => {
                        const layerOpacity = element.opacity * layer.opacity;
                        const layerBackgroundOpacity = Math.min(
                          1,
                          backgroundOpacity * layer.opacity,
                        );
                        return (
                          <Fragment
                            key={`${element.id}-sloppy-line-${index}`}
                          >
                            {hasBackground && (
                              <Line
                                key={`${element.id}-sloppy-line-background-${index}`}
                                elementId={element.id}
                                x={element.x}
                                y={element.y}
                                points={layer.points}
                                stroke={element.penBackground}
                                strokeWidth={
                                  layer.strokeWidth + STROKE_BACKGROUND_PADDING
                                }
                                dash={getStrokeDash(element.strokeStyle)}
                                opacity={layerBackgroundOpacity}
                                lineCap="round"
                                lineJoin="round"
                                listening={false}
                              />
                            )}
                            <Line
                              elementId={element.id}
                              x={element.x}
                              y={element.y}
                              points={layer.points}
                              stroke={getColorWithOpacity(
                                element.strokeColor,
                                element.strokeOpacity,
                              )}
                              strokeWidth={layer.strokeWidth}
                              dash={getStrokeDash(element.strokeStyle)}
                              opacity={layerOpacity}
                              lineCap="round"
                              lineJoin="round"
                              listening={false}
                              {...highlightProps}
                            />
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                } else if (element.type === "arrow") {
                  const pointerAtBeginning =
                    element.arrowType === "arrow-start" ||
                    element.arrowType === "arrow-both";
                  const pointerAtEnding =
                    element.arrowType === "arrow-end" ||
                    element.arrowType === "arrow-both";
                  const { points: arrowPoints, bezier } = getArrowRenderConfig(
                    element.points,
                    element.arrowStyle
                  );
                  const arrowOverlayPoints = bezier
                    ? sampleCurvePoints(arrowPoints)
                    : arrowPoints;
                  const arrowSloppyLayers = createSloppyStrokeLayers(
                    arrowOverlayPoints,
                    {
                      sloppiness: element.sloppiness,
                      strokeWidth: element.strokeWidth,
                      seed: `${element.id}:arrow`,
                    }
                  );
                  const [primaryArrowLayer, ...extraArrowLayers] =
                    arrowSloppyLayers;
                  const interactionOpacity =
                    element.sloppiness === "smooth" ? element.opacity : 0.001;
                  const hasBackground =
                    element.penBackground &&
                    element.penBackground !== "transparent";
                  const backgroundOpacity = element.opacity * 0.4 + 0.2;
                  const baseBackgroundOpacity = Math.min(1, backgroundOpacity);
                  const backgroundStrokeWidth =
                    element.strokeWidth + STROKE_BACKGROUND_PADDING;
                  const pointerBackgroundSize = 12 + STROKE_BACKGROUND_PADDING;
                  const showBaseStroke = element.sloppiness === "smooth";
                  return (
                    <Fragment key={element.id}>
                      <Arrow
                        key={`${element.id}-interaction`}
                        id={element.id}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={arrowPoints}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        dash={getStrokeDash(element.strokeStyle)}
                        opacity={interactionOpacity}
                        pointerLength={12}
                        pointerWidth={12}
                        pointerAtBeginning={pointerAtBeginning}
                        pointerAtEnding={pointerAtEnding}
                        bezier={bezier}
                        tension={0}
                        hitStrokeWidth={Math.max(12, element.strokeWidth)}
                        {...interactionProps}
                      />
                      {hasBackground && showBaseStroke && (
                        <Arrow
                          key={`${element.id}-background`}
                          id={`${element.id}-background`}
                          elementId={element.id}
                          x={element.x}
                          y={element.y}
                          points={arrowPoints}
                          stroke={element.penBackground}
                          strokeWidth={backgroundStrokeWidth}
                          dash={getStrokeDash(element.strokeStyle)}
                          opacity={baseBackgroundOpacity}
                          pointerLength={pointerBackgroundSize}
                          pointerWidth={pointerBackgroundSize}
                          pointerAtBeginning={pointerAtBeginning}
                          pointerAtEnding={pointerAtEnding}
                          bezier={bezier}
                          tension={0}
                          listening={false}
                        />
                      )}
                      <Arrow
                        key={element.id}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={arrowPoints}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        dash={getStrokeDash(element.strokeStyle)}
                        opacity={element.opacity}
                        pointerLength={12}
                        pointerWidth={12}
                        pointerAtBeginning={pointerAtBeginning}
                        pointerAtEnding={pointerAtEnding}
                        bezier={bezier}
                        tension={0}
                        strokeEnabled={element.sloppiness === "smooth"}
                        listening={false}
                        {...highlightProps}
                      />
                      {primaryArrowLayer && (
                        <Fragment>
                          {hasBackground && (
                            <Arrow
                              key={`${element.id}-sloppy-arrow-background`}
                              elementId={element.id}
                              x={element.x}
                              y={element.y}
                              points={primaryArrowLayer.points}
                              stroke={element.penBackground}
                              strokeWidth={
                                primaryArrowLayer.strokeWidth +
                                STROKE_BACKGROUND_PADDING
                              }
                              dash={getStrokeDash(element.strokeStyle)}
                              opacity={Math.min(
                                1,
                                backgroundOpacity * primaryArrowLayer.opacity,
                              )}
                              pointerLength={pointerBackgroundSize}
                              pointerWidth={pointerBackgroundSize}
                              pointerAtBeginning={pointerAtBeginning}
                              pointerAtEnding={pointerAtEnding}
                              bezier={false}
                              tension={0}
                              listening={false}
                            />
                          )}
                          <Arrow
                            key={`${element.id}-sloppy-arrow-primary`}
                            elementId={element.id}
                            x={element.x}
                            y={element.y}
                            points={primaryArrowLayer.points}
                            stroke={getColorWithOpacity(
                              element.strokeColor,
                              element.strokeOpacity,
                            )}
                            strokeWidth={primaryArrowLayer.strokeWidth}
                            dash={getStrokeDash(element.strokeStyle)}
                            opacity={element.opacity * primaryArrowLayer.opacity}
                            pointerLength={12}
                            pointerWidth={12}
                            pointerAtBeginning={pointerAtBeginning}
                            pointerAtEnding={pointerAtEnding}
                            bezier={false}
                            tension={0}
                            listening={false}
                            {...highlightProps}
                          />
                        </Fragment>
                      )}
                      {extraArrowLayers.map((layer, index) => {
                        const layerOpacity = element.opacity * layer.opacity;
                        const layerBackgroundOpacity = Math.min(
                          1,
                          backgroundOpacity * layer.opacity,
                        );
                        return (
                          <Fragment
                            key={`${element.id}-sloppy-arrow-extra-${index}`}
                          >
                            {hasBackground && (
                              <Line
                                key={`${element.id}-sloppy-arrow-extra-background-${index}`}
                                elementId={element.id}
                                x={element.x}
                                y={element.y}
                                points={layer.points}
                                stroke={element.penBackground}
                                strokeWidth={
                                  layer.strokeWidth + STROKE_BACKGROUND_PADDING
                                }
                                dash={getStrokeDash(element.strokeStyle)}
                                opacity={layerBackgroundOpacity}
                                lineCap="round"
                                lineJoin="round"
                                listening={false}
                              />
                            )}
                            <Line
                              elementId={element.id}
                              x={element.x}
                              y={element.y}
                              points={layer.points}
                              stroke={getColorWithOpacity(
                                element.strokeColor,
                                element.strokeOpacity,
                              )}
                              strokeWidth={layer.strokeWidth}
                              dash={getStrokeDash(element.strokeStyle)}
                              opacity={layerOpacity}
                              lineCap="round"
                              lineJoin="round"
                              listening={false}
                              {...highlightProps}
                            />
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                } else if (element.type === "pen") {
                  const hasBackground =
                    element.penBackground &&
                    element.penBackground !== "transparent";
                  const backgroundOpacity = element.opacity * 0.4 + 0.2;
                  const backgroundStrokeWidth =
                    element.strokeWidth + STROKE_BACKGROUND_PADDING;
                  const interactionOpacity = element.opacity;
                  const lineTension = PEN_TENSION;
                  return (
                    <Fragment key={element.id}>
                      {hasBackground && (
                        <Line
                          key={`${element.id}-background`}
                          id={`${element.id}-background`}
                          elementId={element.id}
                          x={element.x}
                          y={element.y}
                          points={element.points}
                          stroke={element.penBackground}
                          strokeWidth={backgroundStrokeWidth}
                          opacity={Math.min(1, backgroundOpacity)}
                          lineCap="round"
                          lineJoin="round"
                          tension={lineTension}
                          listening={false}
                        />
                      )}
                      <Line
                        key={`${element.id}-visible`}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={element.points}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        opacity={element.opacity}
                        lineCap="round"
                        lineJoin="round"
                        tension={lineTension}
                        listening={false}
                        {...highlightProps}
                      />
                      <Line
                        key={`${element.id}-interaction`}
                        id={element.id}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={element.points}
                        stroke={getColorWithOpacity(
                          element.strokeColor,
                          element.strokeOpacity,
                        )}
                        strokeWidth={element.strokeWidth}
                        opacity={interactionOpacity}
                        lineCap="round"
                        lineJoin="round"
                        tension={lineTension}
                        hitStrokeWidth={Math.max(12, element.strokeWidth)}
                        {...interactionProps}
                      />
                    </Fragment>
                  );
                } else if (element.type === "text") {
                  if (isEditingElement) {
                    return null;
                  }
                  const elementFontSize = element.fontSize ?? textFontSize;
                  const lineHeightRatio = elementFontSize
                    ? getLineHeight(elementFontSize) / elementFontSize
                    : 1.4;
                  return (
                    <KonvaText
                      key={element.id}
                      id={element.id}
                      x={element.x}
                      y={element.y}
                      text={element.text || ""}
                      fontSize={elementFontSize}
                      fontFamily={getFontFamilyCss(element.fontFamily)}
                      lineHeight={lineHeightRatio}
                      align={(element.textAlign as TextAlignment) ?? "left"}
                      fill={getColorWithOpacity(
                        element.strokeColor,
                        element.strokeOpacity,
                      )}
                      opacity={element.opacity}
                      width={element.width}
                      {...highlightProps}
                      {...interactionProps}
                    />
                  );
                } else if (element.type === "image") {
                  return (
                    <ImageElement
                      key={element.id}
                      element={element}
                      highlight={highlightProps}
                      interaction={interactionProps}
                    />
                  );
                } else if (element.type === "file") {
                  return (
                    <FileElement
                      key={element.id}
                      element={element}
                      highlight={highlightProps}
                      interaction={interactionProps}
                    />
                  );
                }
                return null;
              })}

              {selectionRect &&
                (() => {
                  const bounds = normalizeRectBounds(
                    selectionRect.x,
                    selectionRect.y,
                    selectionRect.width,
                    selectionRect.height
                  );
                  const width = bounds.maxX - bounds.minX;
                  const height = bounds.maxY - bounds.minY;
                  if (width === 0 && height === 0) {
                    return null;
                  }
                  const strokeWidth = Math.max(1 / safeZoom, 0.5);
                  return (
                    <Rect
                      x={bounds.minX}
                      y={bounds.minY}
                      width={width}
                      height={height}
                      stroke="#0ea5e9"
                      strokeWidth={strokeWidth}
                      dash={[4 / safeZoom, 4 / safeZoom]}
                      fill="rgba(14, 165, 233, 0.12)"
                      listening={false}
                    />
                  );
                })()}

              <RulerOverlay measurement={rulerMeasurement} zoom={safeZoom} />

              {activeTool === "select" &&
                selectedIds.length > 1 &&
                (() => {
                  if (!selectionBounds) {
                    return null;
                  }
                  const bounds = selectionBounds as Bounds;
                  const width = bounds.maxX - bounds.minX;
                  const height = bounds.maxY - bounds.minY;
                  if (width === 0 && height === 0) {
                    return null;
                  }
                  return (
                    <Rect
                      id={SELECTION_GROUP_ID}
                      x={bounds.minX}
                      y={bounds.minY}
                      width={Math.max(width, 1)}
                      height={Math.max(height, 1)}
                      fill="rgba(14, 165, 233, 0.0001)"
                      draggable
                      onDragStart={handleSelectionGroupDragStart}
                      onDragMove={handleSelectionGroupDragMove}
                      onDragEnd={handleSelectionGroupDragEnd}
                    />
                  );
                })()}

              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                anchorSize={8}
                anchorFill="#f8fafc"
                anchorStroke="#0ea5e9"
                anchorCornerRadius={3}
                borderStroke="#0ea5e9"
                borderStrokeWidth={1}
                ignoreStroke
              />

              {curveHandleElements.map((element) => {
                const curvePoints = ensureCurvePoints(element.points);
                if (curvePoints.length < 6) {
                  return null;
                }

                const handles = [
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

                const handleRadius = 8 / safeZoom;
                const handleStrokeWidth = Math.max(1, 2 / safeZoom);
                const connectorPoints = handles.flatMap((point) => [
                  point.x,
                  point.y,
                ]);

                return (
                  <Fragment key={`${element.id}-curve-handles`}>
                    <Line
                      points={connectorPoints}
                      stroke="#0ea5e9"
                      strokeWidth={handleStrokeWidth}
                      dash={[12 / safeZoom, 12 / safeZoom]}
                      opacity={0.4}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                    {handles.map((handle, index) => (
                      <Circle
                        key={`${element.id}-curve-handle-${index}`}
                        x={handle.x}
                        y={handle.y}
                        radius={handleRadius}
                        fill="#f8fafc"
                        stroke="#0ea5e9"
                        strokeWidth={handleStrokeWidth}
                        draggable
                        dragOnTop
                        onMouseDown={(event) => {
                          event.cancelBubble = true;
                        }}
                        onDragStart={(event) => {
                          event.cancelBubble = true;
                        }}
                        onDragMove={(event) =>
                          handleCurveHandleDragMove(event, element, index)
                        }
                        onDragEnd={(event) =>
                          handleCurveHandleDragEnd(event, element, index)
                        }
                      />
                    ))}
                  </Fragment>
                );
              })}

              <CurrentShapePreview currentShape={currentShape} />

              {/* Render cursors */}
              {users.map((user) => (
                <UserCursor key={user.id} user={user} pan={pan} zoom={zoom} />
              ))}
            </Layer>
          </Stage>

          {miniMapContent &&
            (miniMapContainer ? (
              createPortal(miniMapContent, miniMapContainer)
            ) : (
              <div className="pointer-events-none absolute bottom-6 left-6 z-30 w-max max-w-[200px] sm:max-w-[240px] [&>*]:pointer-events-auto">
                {miniMapContent}
              </div>
            ))}
        </div>
    </CanvasContextMenu>
  );
};
