"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { nanoid } from "nanoid";

import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import type { CanvasBackground, CanvasElement } from "@/lib/store/useWhiteboardStore";
import { useToast } from "@/hooks/use-toast";
import {
  duplicateElement,
  ensureCurvePoints,
  estimateTextBoxHeight,
  estimateTextBoxWidth,
  getElementBounds,
  getFontFamilyCss,
  getLineHeight,
  resolveElementId,
  type Bounds,
} from "@/lib/canvas";
import { cn } from "@/lib/utils";

import type { CanvasContextMenuProps } from "../CanvasContextMenu";
import type { CanvasElementsLayerProps } from "../CanvasElementsLayer";
import { useCanvasBackground } from "./useCanvasBackground";
import { useClipboardHandlers, getClipboardSupport } from "./useClipboardHandlers";
import { useDragDrop } from "../DragDropHandler";
import { useStageSize } from "./useStageSize";
import { useTextEditing } from "./useTextEditing";
import type { EditingTextState } from "../types";
import { useCanvasPanZoom } from "./useCanvasPanZoom";
import { useRulerMeasurement } from "./useRulerMeasurement";
import { useSelectionInteractions } from "./useSelectionInteractions";

const SELECTION_GROUP_ID = "__selection_group__";

type TextEditorProps = {
  editingText: EditingTextState | null;
  editorStyle?: CSSProperties;
  safeZoom: number;
  editorLineHeight: number;
  onChange: Dispatch<SetStateAction<EditingTextState | null>>;
  onFinish: (options?: { cancel?: boolean; skipNextPointer?: boolean }) => void;
};

type ContainerProps = {
  className: string;
  style: CSSProperties | undefined;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

type StageProps = {
  width: number;
  height: number;
  onMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  onMouseMove: (event: KonvaEventObject<MouseEvent>) => void;
  onMouseUp: (event: KonvaEventObject<MouseEvent>) => void;
  onDblClick: (event: KonvaEventObject<Event>) => void;
  onDblTap: (event: KonvaEventObject<Event>) => void;
  onWheel: (event: KonvaEventObject<WheelEvent>) => void;
  draggable: boolean;
  scaleX: number;
  scaleY: number;
  className: string;
  onDragStart: () => void;
  onDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
  onMouseLeave: () => void;
};

export type WhiteboardCanvasController = {
  refs: {
    containerRef: React.RefObject<HTMLDivElement>;
    stageRef: React.RefObject<Konva.Stage>;
    transformerRef: React.RefObject<Konva.Transformer>;
    textEditorRef: React.RefObject<HTMLTextAreaElement>;
  };
  contextMenuProps: Omit<CanvasContextMenuProps, "children">;
  containerProps: ContainerProps;
  textEditorProps: TextEditorProps;
  stageProps: StageProps;
  canvasElementsLayerProps: CanvasElementsLayerProps;
};

export const useWhiteboardCanvas = (): WhiteboardCanvasController => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageSize = useStageSize(containerRef);
  const lastErasedIdRef = useRef<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [currentShape, setCurrentShape] = useState<CanvasElement | null>(null);
  const currentShapeRef = useRef<CanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const { handleDrop, handleDragOver, addFilesToCanvas } = useDragDrop();
  const { toast } = useToast();

  const {
    activeTool,
    setActiveTool,
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
  const {
    isMiddleMousePanning,
    stopMiddleMousePan,
    handlePanMouseDown,
    handleWheel,
    stageCursorClass,
    isPanMode,
    stageDragHandlers,
  } = useCanvasPanZoom({
    stageRef,
    pan,
    setPan,
    safeZoom,
    activeTool,
  });

  const getCanvasPointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - panX) / safeZoom,
      y: (pos.y - panY) / safeZoom,
    };
  }, [panX, panY, safeZoom, stageRef]);

  const isRulerMode = activeTool === "ruler";
  const {
    rulerMeasurement,
    handlePointerDown: handleRulerPointerDown,
    handlePointerMove: handleRulerPointerMove,
    handlePointerUp: handleRulerPointerUp,
    handleGlobalPointerUp: handleRulerGlobalPointerUp,
    handleMouseLeave: handleRulerMouseLeave,
  } = useRulerMeasurement({
    isRulerMode,
    getCanvasPointerPosition,
  });

  const { readSupported: clipboardReadSupported, writeSupported: clipboardWriteSupported } =
    useMemo(() => getClipboardSupport(), []);

  const createTextElementAtPosition = useCallback(
    (position: { x: number; y: number }) => {
      const newText: CanvasElement = {
        id: nanoid(),
        type: "text",
        x: position.x,
        y: position.y,
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
    },
    [
      addElement,
      beginTextEditing,
      fillColor,
      fillOpacity,
      opacity,
      sloppiness,
      strokeColor,
      strokeOpacity,
      strokeStyle,
      strokeWidth,
      textAlign,
      textFontFamily,
      textFontSize,
    ],
  );

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
        element.points.length !== 6,
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

  const recordContextMenuPosition = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
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
    [panX, panY, safeZoom],
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

      const elementExists = elements.some((element) => element.id === elementId);
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
    [deleteElement, elements, selectedIds, setSelectedIds],
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
        return;
      }

      event.evt.preventDefault();
      const pointer = getCanvasPointerPosition();
      if (!pointer) {
        return;
      }

      if (activeTool !== "text") {
        setActiveTool("text");
      }

      createTextElementAtPosition(pointer);
    },
    [
      activeTool,
      beginTextEditing,
      createTextElementAtPosition,
      elements,
      getCanvasPointerPosition,
      openFilePreview,
      setActiveTool,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (editingTextRef.current) {
        return;
      }

      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length > 0) {
          event.preventDefault();
          const { deleteSelection } = useWhiteboardStore.getState();
          deleteSelection();
        }
        return;
      }

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
      const bounds = elementBoundsMap.get(element.id) ?? getElementBounds(element);
      return (
        bounds.maxX >= renderBounds.minX &&
        bounds.minX <= renderBounds.maxX &&
        bounds.maxY >= renderBounds.minY &&
        bounds.minY <= renderBounds.maxY
      );
    });
  }, [elements, elementBoundsMap, renderBounds]);
  const {
    selectionRect,
    selectionBounds,
    curveHandleElements,
    handleStageMouseDown: handleSelectionMouseDown,
    handleStageMouseMove: handleSelectionMouseMove,
    handleStageMouseUp: handleSelectionMouseUp,
    handleMouseLeave: handleSelectionMouseLeave,
    getInteractionProps,
    handleSelectionGroupDragStart,
    handleSelectionGroupDragMove,
    handleSelectionGroupDragEnd,
    handleCurveHandleDragMove,
    handleCurveHandleDragEnd,
  } = useSelectionInteractions({
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
  });

  const backgroundConfig = useCanvasBackground(canvasBackground, pan, safeZoom);
  const { className: backgroundClassName, style: backgroundStyle } = backgroundConfig;
  const handleCanvasBackgroundChange = useCallback(
    (value: CanvasBackground) => {
      setCanvasBackground(value);
    },
    [setCanvasBackground],
  );

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (handlePanMouseDown(e)) {
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

    if (handleRulerPointerDown(e)) {
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
      handleSelectionMouseDown(e);
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
      createTextElementAtPosition(pointer);
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

    const newElement: CanvasElement = {
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
      type: activeTool as CanvasElement["type"],
    };

    switch (activeTool) {
      case "rectangle":
        newElement.width = 0;
        newElement.height = 0;
        newElement.cornerRadius = rectangleCornerStyle === "rounded" ? 16 : 0;
        break;
      case "diamond":
        newElement.width = 0;
        newElement.height = 0;
        break;
      case "ellipse":
        newElement.width = 0;
        newElement.height = 0;
        break;
      case "line":
      case "arrow":
        newElement.points = [0, 0, 0, 0];
        newElement.arrowType = arrowType;
        newElement.arrowStyle = arrowStyle;
        newElement.penBackground = penBackground;
        break;
      case "pen":
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
    if (handleRulerPointerMove(e)) {
      return;
    }

    if (handleSelectionMouseMove(e)) {
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
      } as CanvasElement;
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
      } as CanvasElement;
      setCurrentShape(updatedShape);
      currentShapeRef.current = updatedShape;
    } else if (currentShape.type === "pen") {
      const newPoints = [
        ...(currentShape.points ?? []),
        x - currentShape.x,
        y - currentShape.y,
      ];
      const updatedShape = {
        ...currentShape,
        points: newPoints,
      } as CanvasElement;
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
      stopMiddleMousePan();
      return;
    }

    handleRulerPointerUp();

    if (isErasing) {
      setIsErasing(false);
      lastErasedIdRef.current = null;
    }

    if (isDrawingRef.current) {
      finalizeDrawing();
    }
    handleSelectionMouseUp();
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePointerUp = (event: MouseEvent | TouchEvent) => {
      handleRulerGlobalPointerUp();

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
  }, [finalizeDrawing, handleRulerGlobalPointerUp]);







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

  const contextMenuProps: Omit<CanvasContextMenuProps, "children"> = {
    canvasBackground,
    onBackgroundChange: handleCanvasBackgroundChange,
    clipboardReadSupported,
    clipboardWriteSupported,
    onPaste: handlePasteAction,
    onCopyAsPng: handleCopyAsPng,
    onCopyAsSvg: handleCopyAsSvg,
    onSelectAll: handleSelectAll,
    disableZIndexActions: selectedIds.length === 0,
    onBringToFront: bringToFront,
    onBringForward: bringForward,
    onSendBackward: sendBackward,
    onSendToBack: sendToBack,
  };

  const containerProps: ContainerProps = {
    className: cn("absolute inset-0", backgroundClassName),
    style: backgroundStyle,
    onDrop: (event) => {
      event.preventDefault();
      void handleDrop(event.nativeEvent);
    },
    onDragOver: (event) => {
      event.preventDefault();
      handleDragOver(event.nativeEvent);
    },
    onContextMenu: recordContextMenuPosition,
  };

  const textEditorProps: TextEditorProps = {
    editingText,
    editorStyle,
    safeZoom,
    editorLineHeight,
    onChange: setEditingText,
    onFinish: finishEditingText,
  };

  const stageProps: StageProps = {
    width: Math.max(stageSize.width, 1),
    height: Math.max(stageSize.height, 1),
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onDblClick: handleStageDoublePointer,
    onDblTap: handleStageDoublePointer,
    onWheel: handleWheel,
    draggable: isPanMode,
    scaleX: safeZoom,
    scaleY: safeZoom,
    className: cn("h-full w-full", stageCursorClass),
    onDragStart: stageDragHandlers.handleStageDragStart,
    onDragMove: stageDragHandlers.handleStageDragMove,
    onDragEnd: stageDragHandlers.handleStageDragEnd,
    onMouseLeave: () => {
      if (isErasing) {
        setIsErasing(false);
      }
      lastErasedIdRef.current = null;
      handleRulerMouseLeave();
      handleSelectionMouseLeave();
      stopMiddleMousePan();
    },
  };

  const canvasElementsLayerProps: CanvasElementsLayerProps = {
    visibleElements,
    selectedIds,
    focusedElementId,
    safeZoom,
    defaultFontSize: textFontSize,
    editingTextId: editingText?.id ?? null,
    getInteractionProps,
    selectionRect,
    activeTool,
    selectionBounds,
    onSelectionGroupDragStart: handleSelectionGroupDragStart,
    onSelectionGroupDragMove: handleSelectionGroupDragMove,
    onSelectionGroupDragEnd: handleSelectionGroupDragEnd,
    rulerMeasurement,
    curveHandleElements,
    onCurveHandleDragMove: handleCurveHandleDragMove,
    onCurveHandleDragEnd: handleCurveHandleDragEnd,
    currentShape,
    users,
    pan,
    zoom,
    transformerRef,
  };

  return {
    refs: {
      containerRef,
      stageRef,
      transformerRef,
      textEditorRef,
    },
    contextMenuProps,
    containerProps,
    textEditorProps,
    stageProps,
    canvasElementsLayerProps,
  };
};
