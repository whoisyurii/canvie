"use client";

import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Stage,
  Layer,
  Rect,
  Line,
  Text as KonvaText,
  Arrow,
  Image as KonvaImage,
  Group,
  Transformer,
  Ellipse,
} from "react-konva";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type { CanvasElement, ArrowStyle, TextAlignment } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useDragDrop } from "./DragDropHandler";
import { UserCursor } from "./UserCursor";
import { cn } from "@/lib/utils";
import {
  createSloppyStrokeLayers,
  getEllipseOutlinePoints,
  getRectangleOutlinePoints,
  sampleCurvePoints,
} from "@/lib/canvas/sloppiness";

const MINIMAP_ENABLED = false;

type HighlightProps = Record<string, unknown> | undefined;

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

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

const normalizeRectBounds = (
  x: number,
  y: number,
  width = 0,
  height = 0,
): Bounds => {
  const minX = width >= 0 ? x : x + width;
  const minY = height >= 0 ? y : y + height;
  const maxX = width >= 0 ? x + width : x;
  const maxY = height >= 0 ? y + height : y;
  return { minX, minY, maxX, maxY };
};

const getDiamondShape = (
  x: number,
  y: number,
  width = 0,
  height = 0,
) => {
  const bounds = normalizeRectBounds(x, y, width, height);
  const drawWidth = bounds.maxX - bounds.minX;
  const drawHeight = bounds.maxY - bounds.minY;

  return {
    x: bounds.minX,
    y: bounds.minY,
    points: [
      drawWidth / 2,
      0,
      drawWidth,
      drawHeight / 2,
      drawWidth / 2,
      drawHeight,
      0,
      drawHeight / 2,
    ],
  };
};

const getElementBounds = (element: CanvasElement): Bounds => {
  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "image":
    case "file": {
      return normalizeRectBounds(element.x, element.y, element.width ?? 0, element.height ?? 0);
    }
    case "line":
    case "arrow": {
      if (element.points && element.points.length >= 2) {
        let minX = element.x;
        let minY = element.y;
        let maxX = element.x;
        let maxY = element.y;
        for (let index = 0; index < element.points.length; index += 2) {
          const px = element.x + (element.points[index] ?? 0);
          const py = element.y + (element.points[index + 1] ?? 0);
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        return { minX, minY, maxX, maxY };
      }
      return { minX: element.x, minY: element.y, maxX: element.x, maxY: element.y };
    }
    case "pen": {
      if (element.points && element.points.length >= 2) {
        let minX = element.x;
        let minY = element.y;
        let maxX = element.x;
        let maxY = element.y;
        for (let index = 0; index < element.points.length; index += 2) {
          const px = element.x + (element.points[index] ?? 0);
          const py = element.y + (element.points[index + 1] ?? 0);
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        return { minX, minY, maxX, maxY };
      }
      return { minX: element.x, minY: element.y, maxX: element.x, maxY: element.y };
    }
    case "text": {
      const approxWidth = Math.max(120, Math.min((element.text?.length ?? 0) * 10, 320));
      const approxHeight = 32;
      return normalizeRectBounds(element.x, element.y, approxWidth, approxHeight);
    }
    default:
      return { minX: element.x, minY: element.y, maxX: element.x, maxY: element.y };
  }
};

const duplicateElement = (element: CanvasElement): CanvasElement => ({
  ...element,
  id: nanoid(),
  points: element.points ? [...element.points] : undefined,
  selected: false,
});

const isElementWithinSelection = (element: CanvasElement, selection: Bounds) => {
  const bounds = getElementBounds(element);
  return (
    bounds.maxX >= selection.minX &&
    bounds.minX <= selection.maxX &&
    bounds.maxY >= selection.minY &&
    bounds.minY <= selection.maxY
  );
};

const resolveElementId = (node: Konva.Node | null): string | null => {
  if (!node) {
    return null;
  }

  const nodeId = node.id();
  if (nodeId) {
    return nodeId;
  }

  const elementIdAttr = node.getAttr("elementId");
  if (typeof elementIdAttr === "string" && elementIdAttr.length > 0) {
    return elementIdAttr;
  }

  const ancestorWithElementId = node.findAncestor((ancestor) => {
    const attr = ancestor.getAttr("elementId");
    return typeof attr === "string" && attr.length > 0;
  }, true);

  if (ancestorWithElementId) {
    const attr = ancestorWithElementId.getAttr("elementId");
    if (typeof attr === "string" && attr.length > 0) {
      return attr;
    }
  }

  const ancestorWithId = node.findAncestor((ancestor) => Boolean(ancestor.id()), true);
  return ancestorWithId?.id() ?? null;
};

const RESIZABLE_ELEMENT_TYPES = new Set<CanvasElement["type"]>([
  "rectangle",
  "diamond",
  "ellipse",
  "image",
  "file",
  "text",
  "arrow",
  "line",
  "pen",
]);

type EditingTextState = {
  id: string;
  x: number;
  y: number;
  value: string;
  initialValue: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  alignment: TextAlignment;
};

const TEXT_MIN_WIDTH = 160;
const TEXT_MAX_WIDTH = 460;
const TEXT_BASE_PADDING = 24;

const FONT_FALLBACKS: Record<string, string> = {
  Inter: "Inter, sans-serif",
  "DM Sans": '"DM Sans", sans-serif',
  "Roboto Mono": '"Roboto Mono", monospace',
};

const getFontFamilyCss = (fontFamily?: string) => {
  if (!fontFamily) return FONT_FALLBACKS.Inter;
  return FONT_FALLBACKS[fontFamily] ?? fontFamily;
};

const getLineHeight = (fontSize: number) => Math.round(fontSize * 1.4);

const estimateTextBoxWidth = (text: string, fontSize: number) => {
  const lines = (text ?? "").split(/\r?\n/);
  const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const approxCharWidth = fontSize * 0.6;
  const widthFromContent = Math.max(TEXT_MIN_WIDTH, longestLineLength * approxCharWidth + TEXT_BASE_PADDING);
  return Math.min(TEXT_MAX_WIDTH, widthFromContent || TEXT_MIN_WIDTH);
};

const estimateTextBoxHeight = (text: string, fontSize: number) => {
  const lineCount = Math.max(1, (text ?? "").split(/\r?\n/).length);
  const lineHeight = getLineHeight(fontSize);
  return Math.max(lineCount * lineHeight + TEXT_BASE_PADDING / 2, lineHeight + TEXT_BASE_PADDING / 2);
};

const getArrowRenderConfig = (points: number[] | undefined, style: ArrowStyle | undefined) => {
  if (!points || points.length < 4) {
    return { points: points ?? [], bezier: false };
  }

  if (style !== "curve") {
    return { points, bezier: false };
  }

  const [startX, startY, endX, endY] = points;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const offset = Math.min(120, length * 0.3);
  const controlX = midX + normalX * offset;
  const controlY = midY + normalY * offset;

  return {
    bezier: true,
    points: [startX, startY, controlX, controlY, controlX, controlY, endX, endY],
  };
};

const ImageElement = ({
  element,
  highlight,
  interaction,
}: {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!element.fileUrl) return;

    const img = new window.Image();
    img.src = element.fileUrl;
    img.onload = () => setImage(img);

    return () => {
      img.onload = null;
    };
  }, [element.fileUrl]);

  return image ? (
    <KonvaImage
      id={element.id}
      image={image}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      opacity={element.opacity}
      rotation={element.rotation}
      {...highlight}
      {...interaction}
    />
  ) : null;
};

const FileElement = ({
  element,
  highlight,
  interaction,
}: {
  element: CanvasElement;
  highlight?: HighlightProps;
  interaction?: Record<string, any>;
}) => {
  const [thumbnail, setThumbnail] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!element.thumbnailUrl) {
      setThumbnail(null);
      return;
    }

    const img = new window.Image();
    img.src = element.thumbnailUrl;
    img.onload = () => setThumbnail(img);

    return () => {
      img.onload = null;
    };
  }, [element.thumbnailUrl]);

  const width = element.width ?? 200;
  const height = element.height ?? 240;
  const padding = 12;
  const previewHeight = Math.max(0, height - padding * 2 - 32);

  return (
    <Group
      id={element.id}
      x={element.x}
      y={element.y}
      width={width}
      height={height}
      {...highlight}
      {...interaction}
    >
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        stroke={element.strokeColor}
        strokeWidth={element.strokeWidth}
        fill="white"
        opacity={element.opacity}
        cornerRadius={8}
        listening={false}
      />
      {thumbnail ? (
        <KonvaImage
          image={thumbnail}
          x={padding}
          y={padding}
          width={Math.max(0, width - padding * 2)}
          height={previewHeight}
          listening={false}
        />
      ) : (
        <KonvaText
          x={padding}
          y={padding}
          width={Math.max(0, width - padding * 2)}
          height={previewHeight}
          text={(element.fileType ?? "FILE").slice(0, 8).toUpperCase()}
          fontSize={24}
          align="center"
          fill="#64748b"
          listening={false}
        />
      )}
      <KonvaText
        x={padding}
        y={height - 24 - padding / 2}
        width={Math.max(0, width - padding * 2)}
        height={24}
        text={element.fileName ?? element.fileType ?? "Document"}
        fontSize={14}
        fill="#1f2937"
        ellipsis
        listening={false}
      />
    </Group>
  );
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
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isMiddleMousePanning, setIsMiddleMousePanning] = useState(false);
  const [stageSize, setStageSize] = useState(() => ({
    width: 0,
    height: 0,
  }));
  const [editingText, setEditingText] = useState<EditingTextState | null>(null);
  const [isMiniMapInteracting, setIsMiniMapInteracting] = useState(false);
  const [miniMapContainer, setMiniMapContainer] = useState<HTMLElement | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const { handleDrop, handleDragOver } = useDragDrop();

  useEffect(() => {
    if (!MINIMAP_ENABLED) {
      return;
    }

    const updateContainer = () => {
      if (typeof document === "undefined") return;
      const node = document.getElementById("right-sidebar-minimap");
      setMiniMapContainer((current) => (current === node ? current : node));
    };

    updateContainer();

    if (typeof MutationObserver === "undefined") {
      return;
    }

    const sidebarRoot = document.getElementById("right-sidebar-root");
    const observerTarget = sidebarRoot ?? document.body;

    if (!observerTarget) {
      return;
    }

    const observer = new MutationObserver(updateContainer);
    observer.observe(observerTarget, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  const {
    activeTool,
    elements,
    addElement,
    updateElement,
    deleteElement,
    strokeColor,
    strokeWidth,
    strokeStyle,
    fillColor,
    opacity,
    arrowType,
    arrowStyle,
    sloppiness,
    rectangleCornerStyle,
    penBackground,
    textFontFamily,
    textFontSize,
    textAlign,
    pan,
    zoom,
    setPan,
    setSelectedIds,
    selectedIds,
    clearSelection,
    pushHistory,
    users,
    focusedElementId,
  } = useWhiteboardStore();

  const panX = pan.x;
  const panY = pan.y;
  const safeZoom = zoom || 1;

  useEffect(() => {
    if (activeTool !== "select") {
      marqueeSelectionRef.current = null;
      setSelectionRect(null);
    }
  }, [activeTool]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const position = stage.position();
    if (position.x !== panX || position.y !== panY) {
      stage.position({ x: panX, y: panY });
      stage.batchDraw();
    }
  }, [panX, panY]);

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

  const beginTextEditing = useCallback(
    (element: CanvasElement, options?: { value?: string; width?: number }) => {
      const initialValue = element.text ?? "";
      const value = options?.value ?? initialValue;
      const fontSize = element.fontSize ?? textFontSize;
      const fontFamily = element.fontFamily ?? textFontFamily;
      const alignment = element.textAlign ?? textAlign;
      const width = options?.width ?? element.width ?? estimateTextBoxWidth(value || initialValue, fontSize);
      const editingState: EditingTextState = {
        id: element.id,
        x: element.x,
        y: element.y,
        value,
        initialValue,
        width,
        fontSize,
        fontFamily,
        alignment,
      };
      setSelectedIds([element.id]);
      setEditingText(editingState);
    },
    [setSelectedIds, textAlign, textFontFamily, textFontSize],
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

      updateElement(current.id, {
        text: trimmed,
        fontSize: current.fontSize,
        fontFamily: current.fontFamily,
        textAlign: current.alignment,
        width: current.width,
      });
    },
    [deleteElement, updateElement],
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
        if (element?.type === "text") {
          event.evt.preventDefault();
          beginTextEditing(element);
        }
      }
    },
    [beginTextEditing, elements],
  );

  const getMiniMapCoordinates = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
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
    [],
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

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
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

  const panToMiniMapPoint = useCallback(
    (pointX: number, pointY: number) => {
      if (!miniMapData) return;

      const worldX = pointX / miniMapData.scale + miniMapData.offsetX;
      const worldY = pointY / miniMapData.scale + miniMapData.offsetY;

      const viewportWidth = stageSize.width / safeZoom;
      const viewportHeight = stageSize.height / safeZoom;

      const nextPanX = -(worldX - viewportWidth / 2) * safeZoom;
      const nextPanY = -(worldY - viewportHeight / 2) * safeZoom;

      setPan({
        x: Number.isFinite(nextPanX) ? nextPanX : panX,
        y: Number.isFinite(nextPanY) ? nextPanY : panY,
      });
    },
    [miniMapData, panX, panY, safeZoom, setPan, stageSize.height, stageSize.width],
  );

  const updatePanFromMiniMap = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      const coords = getMiniMapCoordinates(event);
      if (!coords) return;
      panToMiniMapPoint(coords.x, coords.y);
    },
    [getMiniMapCoordinates, panToMiniMapPoint],
  );

  const handleMiniMapPointerDown = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      event.preventDefault();
      event.stopPropagation();
      miniMapDragRef.current = true;
      setIsMiniMapInteracting(true);
      updatePanFromMiniMap(event);
    },
    [updatePanFromMiniMap],
  );

  const handleMiniMapPointerMove = useCallback(
    (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      if (!miniMapDragRef.current) return;
      event.preventDefault();
      updatePanFromMiniMap(event);
    },
    [updatePanFromMiniMap],
  );

  const endMiniMapInteraction = useCallback(() => {
    miniMapDragRef.current = false;
    setIsMiniMapInteracting(false);
  }, []);

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

  const visibleElements = useMemo(() => {
    if (!renderBounds) {
      return elements;
    }

    return elements.filter((element) => {
      const bounds = getElementBounds(element);
      return (
        bounds.maxX >= renderBounds.minX &&
        bounds.minX <= renderBounds.maxX &&
        bounds.maxY >= renderBounds.minY &&
        bounds.minY <= renderBounds.maxY
      );
    });
  }, [elements, renderBounds]);

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
      transformer.getLayer()?.batchDraw();
      return;
    }

    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`) as Konva.Node | null)
      .filter((node): node is Konva.Node => Boolean(node));

    if (nodes.length === 0) {
      transformer.nodes([]);
      transformer.resizeEnabled(true);
      transformer.getLayer()?.batchDraw();
      return;
    }

    const containsNonResizable = selectedIds.some((id) => {
      const element = visibleElements.find((item) => item.id === id);
      return element ? !RESIZABLE_ELEMENT_TYPES.has(element.type) : false;
    });

    transformer.resizeEnabled(!containsNonResizable);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, selectedIds, visibleElements]);

  const syncPanFromStage = (event: KonvaEventObject<DragEvent>) => {
    const stage = event.target.getStage();
    if (!stage) return;
    const position = stage.position();
    setPan({ x: position.x, y: position.y });
  };

  const backgroundSize = `${Math.max(4, 20 * safeZoom)}px ${Math.max(4, 20 * safeZoom)}px`;
  const backgroundPosition = `${panX}px ${panY}px`;
  const isPanMode = activeTool === "pan" || isMiddleMousePanning;

  const stageCursorClass =
    isPanMode
      ? isPanning
        ? "cursor-grabbing"
        : "cursor-grab"
      : activeTool === "select"
        ? "cursor-default"
        : "cursor-crosshair";

  const miniMapContent = MINIMAP_ENABLED && miniMapData ? (
    <div
      className={cn(
        "pointer-events-auto w-full rounded-xl border border-slate-200/80 bg-white/80 p-3 backdrop-blur transition-shadow",
        isMiniMapInteracting ? "shadow-xl ring-1 ring-sky-200/70" : "shadow-lg",
      )}
    >
      <svg
        width={miniMapData.mapWidth}
        height={miniMapData.mapHeight}
        className={cn(
          "block h-auto w-full max-h-[200px] select-none sm:max-h-[240px]",
          isMiniMapInteracting ? "cursor-grabbing" : "cursor-pointer",
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
          const width = Math.max(2, (bounds.maxX - bounds.minX) * miniMapData.scale);
          const height = Math.max(2, (bounds.maxY - bounds.minY) * miniMapData.scale);

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
            (miniMapData.viewport.minX - miniMapData.offsetX) * miniMapData.scale;
          const viewportY =
            (miniMapData.viewport.minY - miniMapData.offsetY) * miniMapData.scale;
          const viewportWidth = Math.max(4, miniMapData.viewport.width * miniMapData.scale);
          const viewportHeight = Math.max(4, miniMapData.viewport.height * miniMapData.scale);

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

    if (activeTool === "select") {
      const target = e.target as Konva.Node;
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
        fillColor,
        strokeWidth,
        strokeStyle,
        opacity,
        sloppiness,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        textAlign,
      };
      addElement(newText);
      beginTextEditing(newText, { width: estimateTextBoxWidth("", textFontSize) });
      return;
    }

    if (activeTool === "pan") {
      return;
    }

    const pointer = getCanvasPointerPosition();
    if (!pointer) return;

    const { x, y } = pointer;

    setIsDrawing(true);

    const newElement: any = {
      id: nanoid(),
      x,
      y,
      strokeColor,
      strokeWidth,
      strokeStyle,
      fillColor,
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
        break;
      case "pen":
        newElement.type = "pen";
        newElement.points = [0, 0];
        newElement.penBackground = penBackground;
        break;
      default:
        break;
    }

    setCurrentShape(newElement);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
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

      setCurrentShape({
        ...currentShape,
        width,
        height,
      });
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

      setCurrentShape({
        ...currentShape,
        points: [0, 0, endX, endY],
      });
    } else if (currentShape.type === "pen") {
      const newPoints = [...currentShape.points, x - currentShape.x, y - currentShape.y];
      setCurrentShape({
        ...currentShape,
        points: newPoints,
      });
    }
  };

  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 && isMiddleMousePanning) {
      setIsMiddleMousePanning(false);
      return;
    }

    if (isDrawing && currentShape) {
      addElement(currentShape);
      setCurrentShape(null);
    }
    setIsDrawing(false);

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

      const bounds = normalizeRectBounds(rect.x, rect.y, rect.width, rect.height);
      const selectedWithinBounds = elements
        .filter((element) => isElementWithinSelection(element, bounds))
        .map((element) => element.id);

      if (marqueeState.additive) {
        const combined = new Set([...marqueeState.initialSelection, ...selectedWithinBounds]);
        setSelectedIds(Array.from(combined));
      } else {
        setSelectedIds(selectedWithinBounds);
      }
    }
  };

  const applySelectionDrag = useCallback(
    (deltaX: number, deltaY: number, dragState: SelectionDragState, stage: Konva.Stage | null) => {
      dragState.affectedIds.forEach((id) => {
        const baseNode = dragState.startNodes[id];
        const baseElement = dragState.elements[id] ?? elements.find((item) => item.id === id);
        if (!baseNode || !baseElement) {
          return;
        }

        const nextNodeX = baseNode.x + deltaX;
        const nextNodeY = baseNode.y + deltaY;

        if (baseElement.type === "ellipse") {
          const referenceNode = stage?.findOne(`#${id}`) as Konva.Shape | null;
          const nodeWidth =
            typeof referenceNode?.width === "function" ? referenceNode.width() : baseElement.width ?? 0;
          const nodeHeight =
            typeof referenceNode?.height === "function" ? referenceNode.height() : baseElement.height ?? 0;
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
      const affectedIds = selectedIds.includes(element.id) ? selectedIds : [element.id];
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
    [activeTool, elements, selectedIds],
  );

  const handleElementDragMove = useCallback(
    (event: KonvaEventObject<DragEvent>, element: CanvasElement) => {
      if (activeTool !== "select") {
        return;
      }

      const node = event.target;
      const dragState = selectionDragStateRef.current;

      if (!dragState || !dragState.referenceId || !dragState.startNodes[dragState.referenceId]) {
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
        referenceId === node.id() ? node : (stage?.findOne(`#${referenceId}`) as Konva.Node | null);
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
    [activeTool, elements, selectedIds],
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

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    if (activeTool === "pan" || e.evt.ctrlKey) {
      const stage = stageRef.current;
      if (!stage) return;

      const currentScale = Number.isFinite(zoom) ? zoom : 1;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - panX) / currentScale,
        y: (pointer.y - panY) / currentScale,
      };

      const rawScale = e.evt.deltaY > 0 ? currentScale * 0.95 : currentScale * 1.05;
      const nextScale = Math.max(0.1, Math.min(5, Number.isFinite(rawScale) ? rawScale : 1));
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
    }
  };

  const getStrokeDash = (style: string) => {
    switch (style) {
      case "dashed":
        return [10, 5];
      case "dotted":
        return [2, 5];
      default:
        return [];
    }
  };

  const editorHeight = editingText
    ? estimateTextBoxHeight(editingText.value, editingText.fontSize)
    : 0;
  const editorLineHeight = editingText ? getLineHeight(editingText.fontSize) : 0;
  const editorStyle = editingText
    ? {
        left: panX + editingText.x * safeZoom,
        top: panY + editingText.y * safeZoom,
        width: editingText.width * safeZoom,
        height: editorHeight * safeZoom,
        fontSize: editingText.fontSize * safeZoom,
        padding: `${12 * safeZoom}px`,
        borderRadius: `${12 * safeZoom}px`,
        fontFamily: getFontFamilyCss(editingText.fontFamily),
        textAlign: editingText.alignment,
      }
    : undefined;

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
    ],
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 dotted-grid"
      style={{ backgroundSize, backgroundPosition }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {editingText && editorStyle && (
        <textarea
          ref={textEditorRef}
          className="pointer-events-auto absolute z-40 resize-none border-2 border-sky-400 bg-white/95 text-slate-800 shadow-lg outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200/80"
          style={{
            ...editorStyle,
            lineHeight: `${editorLineHeight * safeZoom}px`,
          }}
          value={editingText.value}
          onChange={(event) => {
            const { value } = event.target;
            setEditingText((current) => {
              if (!current) return current;
              return {
                ...current,
                value,
                width: estimateTextBoxWidth(value, current.fontSize),
              };
            });
          }}
          onBlur={() => finishEditingText({ skipNextPointer: true })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              finishEditingText({ cancel: true });
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              finishEditingText();
            }
          }}
          spellCheck
          placeholder="Type something"
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
        x={panX}
        y={panY}
        className={cn("h-full w-full", stageCursorClass)}
        onDragStart={() => setIsPanning(true)}
        onDragMove={syncPanFromStage}
        onDragEnd={(event) => {
          setIsPanning(false);
          setIsMiddleMousePanning(false);
          syncPanFromStage(event);
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
            const highlightProps = { ...focusHighlight, ...selectionHighlight };
            const interactionProps = getInteractionProps(element);
            const isEditingElement = editingText?.id === element.id;
            if (element.type === "rectangle") {
              const rectOutlinePoints = getRectangleOutlinePoints(
                element.width ?? 0,
                element.height ?? 0,
                element.cornerRadius ?? 0,
              );
              const rectSloppyLayers = createSloppyStrokeLayers(rectOutlinePoints, {
                sloppiness: element.sloppiness,
                strokeWidth: element.strokeWidth,
                seed: `${element.id}:rect`,
                closed: true,
              });
              return (
                <>
                  <Rect
                    key={element.id}
                    id={element.id}
                    x={element.x}
                    y={element.y}
                    width={element.width}
                    height={element.height}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    fill={element.fillColor}
                    opacity={element.opacity}
                    rotation={element.rotation}
                    cornerRadius={element.cornerRadius ?? 0}
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
                      stroke={element.strokeColor}
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
                </>
              );
            } else if (element.type === "diamond") {
              const diamond = getDiamondShape(
                element.x,
                element.y,
                element.width ?? 0,
                element.height ?? 0,
              );
              const diamondSloppyLayers = createSloppyStrokeLayers(diamond.points, {
                sloppiness: element.sloppiness,
                strokeWidth: element.strokeWidth,
                seed: `${element.id}:diamond`,
                closed: true,
              });
              return (
                <>
                  <Line
                    key={element.id}
                    id={element.id}
                    x={diamond.x}
                    y={diamond.y}
                    points={diamond.points}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    fill={element.fillColor}
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
                      stroke={element.strokeColor}
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
                </>
              );
            } else if (element.type === "ellipse") {
              const ellipseOutlinePoints = getEllipseOutlinePoints(
                element.width ?? 0,
                element.height ?? 0,
              );
              const ellipseSloppyLayers = createSloppyStrokeLayers(ellipseOutlinePoints, {
                sloppiness: element.sloppiness,
                strokeWidth: element.strokeWidth,
                seed: `${element.id}:ellipse`,
                closed: true,
              });
              const ellipseCenterX = element.x + (element.width ?? 0) / 2;
              const ellipseCenterY = element.y + (element.height ?? 0) / 2;
              return (
                <>
                  <Ellipse
                    key={element.id}
                    id={element.id}
                    x={ellipseCenterX}
                    y={ellipseCenterY}
                    radiusX={Math.abs((element.width ?? 0) / 2)}
                    radiusY={Math.abs((element.height ?? 0) / 2)}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    fill={element.fillColor}
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
                      stroke={element.strokeColor}
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
                </>
              );
            } else if (element.type === "line") {
              const lineSloppyLayers = createSloppyStrokeLayers(element.points, {
                sloppiness: element.sloppiness,
                strokeWidth: element.strokeWidth,
                seed: `${element.id}:line`,
              });
              const interactionOpacity = element.sloppiness === "smooth" ? element.opacity : 0.001;
              return (
                <>
                  <Line
                    key={`${element.id}-interaction`}
                    id={element.id}
                    elementId={element.id}
                    x={element.x}
                    y={element.y}
                    points={element.points}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    opacity={interactionOpacity}
                    lineCap="round"
                    lineJoin="round"
                    hitStrokeWidth={Math.max(12, element.strokeWidth)}
                    {...interactionProps}
                  />
                  <Line
                    key={`${element.id}-visible`}
                    elementId={element.id}
                    x={element.x}
                    y={element.y}
                    points={element.points}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    opacity={element.opacity}
                    lineCap="round"
                    lineJoin="round"
                    strokeEnabled={element.sloppiness === "smooth"}
                    listening={false}
                    {...highlightProps}
                  />
                  {lineSloppyLayers.map((layer, index) => (
                    <Line
                      key={`${element.id}-sloppy-line-${index}`}
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={layer.points}
                      stroke={element.strokeColor}
                      strokeWidth={layer.strokeWidth}
                      dash={getStrokeDash(element.strokeStyle)}
                      opacity={element.opacity * layer.opacity}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      {...highlightProps}
                    />
                  ))}
                </>
              );
            } else if (element.type === "arrow") {
              const pointerAtBeginning = element.arrowType === "arrow-start" || element.arrowType === "arrow-both";
              const pointerAtEnding = element.arrowType === "arrow-end" || element.arrowType === "arrow-both";
              const { points: arrowPoints, bezier } = getArrowRenderConfig(element.points, element.arrowStyle);
              const arrowOverlayPoints = bezier ? sampleCurvePoints(arrowPoints) : arrowPoints;
              const arrowSloppyLayers = createSloppyStrokeLayers(arrowOverlayPoints, {
                sloppiness: element.sloppiness,
                strokeWidth: element.strokeWidth,
                seed: `${element.id}:arrow`,
              });
              const [primaryArrowLayer, ...extraArrowLayers] = arrowSloppyLayers;
              const interactionOpacity = element.sloppiness === "smooth" ? element.opacity : 0.001;
              return (
                <>
                  <Arrow
                    key={`${element.id}-interaction`}
                    id={element.id}
                    elementId={element.id}
                    x={element.x}
                    y={element.y}
                    points={arrowPoints}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    opacity={interactionOpacity}
                    pointerLength={12}
                    pointerWidth={12}
                    pointerAtBeginning={pointerAtBeginning}
                    pointerAtEnding={pointerAtEnding}
                    bezier={bezier}
                    tension={bezier ? 0.4 : 0}
                    hitStrokeWidth={Math.max(12, element.strokeWidth)}
                    {...interactionProps}
                  />
                  <Arrow
                    key={element.id}
                    elementId={element.id}
                    x={element.x}
                    y={element.y}
                    points={arrowPoints}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    dash={getStrokeDash(element.strokeStyle)}
                    opacity={element.opacity}
                    pointerLength={12}
                    pointerWidth={12}
                    pointerAtBeginning={pointerAtBeginning}
                    pointerAtEnding={pointerAtEnding}
                    bezier={bezier}
                    tension={bezier ? 0.4 : 0}
                    strokeEnabled={element.sloppiness === "smooth"}
                    listening={false}
                    {...highlightProps}
                  />
                  {primaryArrowLayer && (
                    <Arrow
                      key={`${element.id}-sloppy-arrow-primary`}
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={primaryArrowLayer.points}
                      stroke={element.strokeColor}
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
                  )}
                  {extraArrowLayers.map((layer, index) => (
                    <Line
                      key={`${element.id}-sloppy-arrow-extra-${index}`}
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={layer.points}
                      stroke={element.strokeColor}
                      strokeWidth={layer.strokeWidth}
                      dash={getStrokeDash(element.strokeStyle)}
                      opacity={element.opacity * layer.opacity}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      {...highlightProps}
                    />
                  ))}
                </>
              );
            } else if (element.type === "pen") {
              const hasBackground = element.penBackground && element.penBackground !== "transparent";
              const backgroundOpacity = element.opacity * 0.4 + 0.2;
              const penSloppyLayers = createSloppyStrokeLayers(element.points, {
                sloppiness: element.sloppiness,
                strokeWidth: element.strokeWidth,
                seed: `${element.id}:pen`,
              });
              const interactionOpacity = element.sloppiness === "smooth" ? element.opacity : 0.001;
              return (
                <>
                  <Line
                    key={`${element.id}-interaction`}
                    id={element.id}
                    elementId={element.id}
                    x={element.x}
                    y={element.y}
                    points={element.points}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    opacity={interactionOpacity}
                    lineCap="round"
                    lineJoin="round"
                    tension={
                      element.sloppiness === "smooth"
                        ? 0.75
                        : element.sloppiness === "rough"
                          ? 0.2
                          : 0.5
                    }
                    hitStrokeWidth={Math.max(12, element.strokeWidth)}
                    {...interactionProps}
                  />
                  {hasBackground && (
                    <Line
                      key={`${element.id}-background`}
                      id={`${element.id}-background`}
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={element.points}
                      stroke={element.penBackground}
                      strokeWidth={element.strokeWidth + 12}
                      opacity={Math.min(1, backgroundOpacity)}
                      lineCap="round"
                      lineJoin="round"
                      tension={element.sloppiness === "smooth" ? 0.75 : element.sloppiness === "rough" ? 0.2 : 0.5}
                      strokeEnabled={element.sloppiness === "smooth"}
                      listening={false}
                      {...highlightProps}
                    />
                  )}
                  <Line
                    key={`${element.id}-visible`}
                    elementId={element.id}
                    x={element.x}
                    y={element.y}
                    points={element.points}
                    stroke={element.strokeColor}
                    strokeWidth={element.strokeWidth}
                    opacity={element.opacity}
                    lineCap="round"
                    lineJoin="round"
                    tension={element.sloppiness === "smooth" ? 0.75 : element.sloppiness === "rough" ? 0.2 : 0.5}
                    strokeEnabled={element.sloppiness === "smooth"}
                    listening={false}
                    {...highlightProps}
                  />
                  {hasBackground &&
                    penSloppyLayers.map((layer, index) => (
                      <Line
                        key={`${element.id}-sloppy-pen-background-${index}`}
                        elementId={element.id}
                        x={element.x}
                        y={element.y}
                        points={layer.points}
                        stroke={element.penBackground}
                        strokeWidth={layer.strokeWidth + 12}
                        opacity={Math.min(1, backgroundOpacity) * layer.opacity}
                        lineCap="round"
                        lineJoin="round"
                        listening={false}
                        {...highlightProps}
                      />
                    ))}
                  {penSloppyLayers.map((layer, index) => (
                    <Line
                      key={`${element.id}-sloppy-pen-${index}`}
                      elementId={element.id}
                      x={element.x}
                      y={element.y}
                      points={layer.points}
                      stroke={element.strokeColor}
                      strokeWidth={layer.strokeWidth}
                      opacity={element.opacity * layer.opacity}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      {...highlightProps}
                    />
                  ))}
                </>
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
                  fill={element.strokeColor}
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

          {selectionRect && (() => {
            const bounds = normalizeRectBounds(
              selectionRect.x,
              selectionRect.y,
              selectionRect.width,
              selectionRect.height,
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

          {selectionBounds &&
            activeTool === "select" &&
            selectedIds.length > 1 &&
            (() => {
              const width = selectionBounds.maxX - selectionBounds.minX;
              const height = selectionBounds.maxY - selectionBounds.minY;
              if (width === 0 && height === 0) {
                return null;
              }
              return (
                <Rect
                  id={SELECTION_GROUP_ID}
                  x={selectionBounds.minX}
                  y={selectionBounds.minY}
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

          {/* Render current drawing shape */}
          {currentShape && (
            <>
              {currentShape.type === "rectangle" &&
                (() => {
                  const outlinePoints = getRectangleOutlinePoints(
                    currentShape.width ?? 0,
                    currentShape.height ?? 0,
                    currentShape.cornerRadius ?? 0,
                  );
                  const layers = createSloppyStrokeLayers(outlinePoints, {
                    sloppiness: currentShape.sloppiness,
                    strokeWidth: currentShape.strokeWidth,
                    seed: `${currentShape.id}-preview-rect`,
                    closed: true,
                  });
                  return (
                    <>
                      <Rect
                        x={currentShape.x}
                        y={currentShape.y}
                        width={currentShape.width}
                        height={currentShape.height}
                        stroke={currentShape.strokeColor}
                        strokeWidth={currentShape.strokeWidth}
                        dash={getStrokeDash(currentShape.strokeStyle)}
                        fill={currentShape.fillColor}
                        opacity={currentShape.opacity * 0.7}
                        cornerRadius={currentShape.cornerRadius ?? 0}
                        strokeEnabled={currentShape.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
                      />
                      {layers.map((layer, index) => (
                        <Line
                          key={`${currentShape.id}-preview-rect-${index}`}
                          x={currentShape.x}
                          y={currentShape.y}
                          points={layer.points}
                          stroke={currentShape.strokeColor}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(currentShape.strokeStyle)}
                          opacity={currentShape.opacity * 0.7 * layer.opacity}
                          lineCap="round"
                          lineJoin="round"
                          closed
                          listening={false}
                        />
                      ))}
                    </>
                  );
                })()}
              {currentShape.type === "diamond" && (
                (() => {
                  const diamond = getDiamondShape(
                    currentShape.x,
                    currentShape.y,
                    currentShape.width ?? 0,
                    currentShape.height ?? 0,
                  );
                  const layers = createSloppyStrokeLayers(diamond.points, {
                    sloppiness: currentShape.sloppiness,
                    strokeWidth: currentShape.strokeWidth,
                    seed: `${currentShape.id}-preview-diamond`,
                    closed: true,
                  });
                  return (
                    <>
                      <Line
                        x={diamond.x}
                        y={diamond.y}
                        points={diamond.points}
                        stroke={currentShape.strokeColor}
                        strokeWidth={currentShape.strokeWidth}
                        dash={getStrokeDash(currentShape.strokeStyle)}
                        fill={currentShape.fillColor}
                        opacity={currentShape.opacity * 0.7}
                        closed
                        lineJoin="round"
                        strokeEnabled={currentShape.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
                      />
                      {layers.map((layer, index) => (
                        <Line
                          key={`${currentShape.id}-preview-diamond-${index}`}
                          x={diamond.x}
                          y={diamond.y}
                          points={layer.points}
                          stroke={currentShape.strokeColor}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(currentShape.strokeStyle)}
                          opacity={currentShape.opacity * 0.7 * layer.opacity}
                          closed
                          lineJoin="round"
                          listening={false}
                        />
                      ))}
                    </>
                  );
                })()
              )}
              {currentShape.type === "ellipse" &&
                (() => {
                  const outline = getEllipseOutlinePoints(
                    currentShape.width ?? 0,
                    currentShape.height ?? 0,
                  );
                  const layers = createSloppyStrokeLayers(outline, {
                    sloppiness: currentShape.sloppiness,
                    strokeWidth: currentShape.strokeWidth,
                    seed: `${currentShape.id}-preview-ellipse`,
                    closed: true,
                  });
                  const centerX = currentShape.x + (currentShape.width ?? 0) / 2;
                  const centerY = currentShape.y + (currentShape.height ?? 0) / 2;
                  return (
                    <>
                      <Ellipse
                        x={centerX}
                        y={centerY}
                        radiusX={Math.abs((currentShape.width ?? 0) / 2)}
                        radiusY={Math.abs((currentShape.height ?? 0) / 2)}
                        stroke={currentShape.strokeColor}
                        strokeWidth={currentShape.strokeWidth}
                        dash={getStrokeDash(currentShape.strokeStyle)}
                        fill={currentShape.fillColor}
                        opacity={currentShape.opacity * 0.7}
                        strokeEnabled={currentShape.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
                      />
                      {layers.map((layer, index) => (
                        <Line
                          key={`${currentShape.id}-preview-ellipse-${index}`}
                          x={centerX}
                          y={centerY}
                          points={layer.points}
                          stroke={currentShape.strokeColor}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(currentShape.strokeStyle)}
                          opacity={currentShape.opacity * 0.7 * layer.opacity}
                          closed
                          lineJoin="round"
                          listening={false}
                        />
                      ))}
                    </>
                  );
                })()}
              {currentShape.type === "line" &&
                (() => {
                  const layers = createSloppyStrokeLayers(currentShape.points, {
                    sloppiness: currentShape.sloppiness,
                    strokeWidth: currentShape.strokeWidth,
                    seed: `${currentShape.id}-preview-line`,
                  });
                  return (
                    <>
                      <Line
                        x={currentShape.x}
                        y={currentShape.y}
                        points={currentShape.points}
                        stroke={currentShape.strokeColor}
                        strokeWidth={currentShape.strokeWidth}
                        dash={getStrokeDash(currentShape.strokeStyle)}
                        opacity={currentShape.opacity * 0.7}
                        lineCap="round"
                        lineJoin="round"
                        strokeEnabled={currentShape.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
                      />
                      {layers.map((layer, index) => (
                        <Line
                          key={`${currentShape.id}-preview-line-${index}`}
                          x={currentShape.x}
                          y={currentShape.y}
                          points={layer.points}
                          stroke={currentShape.strokeColor}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(currentShape.strokeStyle)}
                          opacity={currentShape.opacity * 0.7 * layer.opacity}
                          lineCap="round"
                          lineJoin="round"
                          listening={false}
                        />
                      ))}
                    </>
                  );
                })()}
              {currentShape.type === "arrow" && (
                (() => {
                  const { points: arrowPoints, bezier } = getArrowRenderConfig(
                    currentShape.points,
                    currentShape.arrowStyle,
                  );
                  const pointerAtBeginning =
                    currentShape.arrowType === "arrow-start" || currentShape.arrowType === "arrow-both";
                  const pointerAtEnding =
                    currentShape.arrowType === "arrow-end" || currentShape.arrowType === "arrow-both";
                  const overlayPoints = bezier ? sampleCurvePoints(arrowPoints) : arrowPoints;
                  const layers = createSloppyStrokeLayers(overlayPoints, {
                    sloppiness: currentShape.sloppiness,
                    strokeWidth: currentShape.strokeWidth,
                    seed: `${currentShape.id}-preview-arrow`,
                  });
                  const [primaryLayer, ...extraLayers] = layers;
                  return (
                    <>
                      <Arrow
                        x={currentShape.x}
                        y={currentShape.y}
                        points={arrowPoints}
                        stroke={currentShape.strokeColor}
                        strokeWidth={currentShape.strokeWidth}
                        dash={getStrokeDash(currentShape.strokeStyle)}
                        opacity={currentShape.opacity * 0.7}
                        pointerLength={12}
                        pointerWidth={12}
                        pointerAtBeginning={pointerAtBeginning}
                        pointerAtEnding={pointerAtEnding}
                        bezier={bezier}
                        tension={bezier ? 0.4 : 0}
                        strokeEnabled={currentShape.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
                      />
                      {primaryLayer && (
                        <Arrow
                          key={`${currentShape.id}-preview-arrow-primary`}
                          x={currentShape.x}
                          y={currentShape.y}
                          points={primaryLayer.points}
                          stroke={currentShape.strokeColor}
                          strokeWidth={primaryLayer.strokeWidth}
                          dash={getStrokeDash(currentShape.strokeStyle)}
                          opacity={currentShape.opacity * 0.7 * primaryLayer.opacity}
                          pointerLength={12}
                          pointerWidth={12}
                          pointerAtBeginning={pointerAtBeginning}
                          pointerAtEnding={pointerAtEnding}
                          bezier={false}
                          tension={0}
                          listening={false}
                        />
                      )}
                      {extraLayers.map((layer, index) => (
                        <Line
                          key={`${currentShape.id}-preview-arrow-${index}`}
                          x={currentShape.x}
                          y={currentShape.y}
                          points={layer.points}
                          stroke={currentShape.strokeColor}
                          strokeWidth={layer.strokeWidth}
                          dash={getStrokeDash(currentShape.strokeStyle)}
                          opacity={currentShape.opacity * 0.7 * layer.opacity}
                          lineCap="round"
                          lineJoin="round"
                          listening={false}
                        />
                      ))}
                    </>
                  );
                })()
              )}
              {currentShape.type === "pen" && (
                (() => {
                  const hasBackground = currentShape.penBackground && currentShape.penBackground !== "transparent";
                  const backgroundOpacity = currentShape.opacity * 0.4 + 0.2;
                  const penSloppyLayers = createSloppyStrokeLayers(currentShape.points, {
                    sloppiness: currentShape.sloppiness,
                    strokeWidth: currentShape.strokeWidth,
                    seed: `${currentShape.id}-preview-pen`,
                  });
                  return (
                    <>
                      {hasBackground && (
                        <Line
                          x={currentShape.x}
                          y={currentShape.y}
                          points={currentShape.points}
                          stroke={currentShape.penBackground}
                          strokeWidth={currentShape.strokeWidth + 12}
                          opacity={Math.min(1, backgroundOpacity)}
                          lineCap="round"
                          lineJoin="round"
                          tension={
                            currentShape.sloppiness === "smooth"
                              ? 0.75
                              : currentShape.sloppiness === "rough"
                              ? 0.2
                              : 0.5
                          }
                          strokeEnabled={currentShape.sloppiness === "smooth"}
                          listening={false}
                        />
                      )}
                      <Line
                        x={currentShape.x}
                        y={currentShape.y}
                        points={currentShape.points}
                        stroke={currentShape.strokeColor}
                        strokeWidth={currentShape.strokeWidth}
                        opacity={currentShape.opacity * 0.7}
                        lineCap="round"
                        lineJoin="round"
                        tension={
                          currentShape.sloppiness === "smooth"
                            ? 0.75
                            : currentShape.sloppiness === "rough"
                            ? 0.2
                            : 0.5
                        }
                        strokeEnabled={currentShape.sloppiness === "smooth"}
                        hitStrokeWidth={Math.max(12, currentShape.strokeWidth)}
                      />
                      {hasBackground &&
                        penSloppyLayers.map((layer, index) => (
                          <Line
                            key={`${currentShape.id}-preview-pen-background-${index}`}
                            x={currentShape.x}
                            y={currentShape.y}
                            points={layer.points}
                            stroke={currentShape.penBackground}
                            strokeWidth={layer.strokeWidth + 12}
                            opacity={Math.min(1, backgroundOpacity) * layer.opacity}
                            lineCap="round"
                            lineJoin="round"
                            listening={false}
                          />
                        ))}
                      {penSloppyLayers.map((layer, index) => (
                        <Line
                          key={`${currentShape.id}-preview-pen-${index}`}
                          x={currentShape.x}
                          y={currentShape.y}
                          points={layer.points}
                          stroke={currentShape.strokeColor}
                          strokeWidth={layer.strokeWidth}
                          opacity={currentShape.opacity * 0.7 * layer.opacity}
                          lineCap="round"
                          lineJoin="round"
                          listening={false}
                        />
                      ))}
                    </>
                  );
                })()
              )}
            </>
          )}

          {/* Render cursors */}
          {users.map((user) => (
            <UserCursor key={user.id} user={user} pan={pan} zoom={zoom} />
          ))}
        </Layer>
      </Stage>

      {miniMapContent &&
        (miniMapContainer
          ? createPortal(miniMapContent, miniMapContainer)
          : (
              <div className="pointer-events-none absolute bottom-6 left-6 z-30 w-max max-w-[200px] sm:max-w-[240px] [&>*]:pointer-events-auto">
                {miniMapContent}
              </div>
            ))}
    </div>
  );
};
