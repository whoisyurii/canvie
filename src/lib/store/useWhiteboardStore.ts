import { create } from "zustand";
import * as Y from "yjs";
import { ensureCurvePoints, flattenCurvePoints } from "@/lib/canvas/geometry";

export type Tool =
  | "select"
  | "pan"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "pen"
  | "eraser"
  | "ruler";

export type StrokeStyle = "solid" | "dashed" | "dotted";
export type Sloppiness = "smooth" | "normal" | "rough";
export type ArrowType = "line" | "arrow-start" | "arrow-end" | "arrow-both";
export type ArrowStyle = "straight" | "curve";
export type CornerStyle = "sharp" | "rounded";
export type TextAlignment = "left" | "center" | "right";
export type CanvasBackground = "none" | "simple" | "technical";

export interface CanvasElement {
  id: string;
  type:
    | "rectangle"
    | "diamond"
    | "ellipse"
    | "arrow"
    | "line"
    | "text"
    | "pen"
    | "image"
    | "file";
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  points?: number[];
  text?: string;
  strokeColor: string;
  strokeOpacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  sloppiness?: Sloppiness;
  arrowType?: ArrowType;
  arrowStyle?: ArrowStyle;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  thumbnailUrl?: string;
  selected?: boolean;
  cornerRadius?: number;
  penBackground?: string;
  fontFamily?: string;
  fontSize?: number;
  textAlign?: TextAlignment;
}

export interface User {
  id: string;
  name: string;
  color: string;
  cursorX: number;
  cursorY: number;
  tool?: Tool;
  strokeColor?: string;
  lastActive: number;
  isConnected: boolean;
}

export type SharedFile = {
  id: string;
  name: string;
  type: string;
  url: string;
  ownerId: string;
  ownerName: string;
  thumbnailUrl?: string;
};

export type FilePreviewState = {
  fileId: string;
  name?: string;
  type?: string;
  ownerId?: string;
  ownerName?: string;
  sourceElementId?: string;
  thumbnailUrl?: string;
};

const getElementCenter = (element: CanvasElement) => {
  if (
    element.type === "rectangle" ||
    element.type === "diamond" ||
    element.type === "ellipse" ||
    element.type === "image" ||
    element.type === "file"
  ) {
    const width = element.width ?? 0;
    const height = element.height ?? 0;
    return {
      x: element.x + width / 2,
      y: element.y + height / 2,
    };
  }

  if (element.type === "line" || element.type === "arrow") {
    if (element.points && element.points.length >= 4) {
      const endX = element.x + element.points[element.points.length - 2];
      const endY = element.y + element.points[element.points.length - 1];
      return {
        x: (element.x + endX) / 2,
        y: (element.y + endY) / 2,
      };
    }
    return { x: element.x, y: element.y };
  }

  if (element.type === "pen" && element.points && element.points.length >= 2) {
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;

    for (let index = 0; index < element.points.length; index += 2) {
      const pointX = element.points[index];
      const pointY = element.points[index + 1];
      minX = Math.min(minX, pointX);
      maxX = Math.max(maxX, pointX);
      minY = Math.min(minY, pointY);
      maxY = Math.max(maxY, pointY);
    }

    return {
      x: element.x + (minX + maxX) / 2,
      y: element.y + (minY + maxY) / 2,
    };
  }

  return { x: element.x, y: element.y };
};

let focusTimeout: ReturnType<typeof setTimeout> | undefined;

interface CollaborationBindings {
  ydoc: Y.Doc | null;
  elements: Y.Array<CanvasElement> | null;
  files: Y.Array<SharedFile> | null;
  historyEntries: Y.Array<CanvasElement[]> | null;
  historyMeta: Y.Map<any> | null;
  fileSyncManager: any | null; // Will be FileSyncManager, using any to avoid circular deps
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const MAX_HISTORY_LENGTH = 200;

type ToolSettingDefaults = {
  strokeColor?: string;
  strokeOpacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  sloppiness?: Sloppiness;
  arrowType?: ArrowType;
  arrowStyle?: ArrowStyle;
  opacity?: number;
  rectangleCornerStyle?: CornerStyle;
  penBackground?: string;
  textFontFamily?: string;
  textFontSize?: number;
  textAlign?: TextAlignment;
};

const TOOL_DEFAULTS: Record<Tool, ToolSettingDefaults> = {
  select: {},
  pan: {},
  ruler: {},
  rectangle: {
    strokeColor: "#1f2937",
    strokeOpacity: 1,
    fillColor: "transparent",
    fillOpacity: 1,
    strokeWidth: 4,
    strokeStyle: "solid",
    sloppiness: "normal",
    opacity: 1,
    rectangleCornerStyle: "rounded",
  },
  diamond: {
    strokeColor: "#1f2937",
    strokeOpacity: 1,
    fillColor: "transparent",
    fillOpacity: 1,
    strokeWidth: 4,
    strokeStyle: "solid",
    sloppiness: "normal",
    opacity: 1,
  },
  ellipse: {
    strokeColor: "#1f2937",
    strokeOpacity: 1,
    fillColor: "transparent",
    fillOpacity: 1,
    strokeWidth: 4,
    strokeStyle: "solid",
    sloppiness: "normal",
    opacity: 1,
  },
  arrow: {
    strokeColor: "#1f2937",
    strokeOpacity: 1,
    fillColor: "transparent",
    fillOpacity: 1,
    strokeWidth: 4,
    strokeStyle: "solid",
    sloppiness: "normal",
    arrowType: "arrow-end",
    arrowStyle: "straight",
    opacity: 1,
    penBackground: "transparent",
  },
  line: {
    strokeColor: "#1f2937",
    strokeOpacity: 1,
    fillColor: "transparent",
    fillOpacity: 1,
    strokeWidth: 4,
    strokeStyle: "solid",
    sloppiness: "normal",
    arrowType: "line",
    arrowStyle: "straight",
    opacity: 1,
    penBackground: "transparent",
  },
  text: {
    strokeColor: "#1f2937",
    strokeOpacity: 1,
    fillColor: "transparent",
    fillOpacity: 1,
    opacity: 1,
    textFontFamily: "Inter",
    textFontSize: 20,
    textAlign: "left",
  },
  pen: {
    strokeColor: "#1f2937",
    strokeOpacity: 1,
    fillColor: "transparent",
    fillOpacity: 1,
    strokeWidth: 4,
    sloppiness: "smooth",
    penBackground: "transparent",
    opacity: 1,
  },
  eraser: {
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWidth: 4,
    strokeStyle: "solid",
    sloppiness: "smooth",
    opacity: 1,
  },
};

const applySharedHistoryUpdate = (
  historyEntries: Y.Array<CanvasElement[]>,
  historyMeta: Y.Map<any>,
  snapshot: CanvasElement[],
) => {
  const currentIndex = (historyMeta.get("index") as number | undefined) ?? historyEntries.length - 1;
  const entriesToRemove = historyEntries.length - (currentIndex + 1);
  if (entriesToRemove > 0) {
    historyEntries.delete(currentIndex + 1, entriesToRemove);
  }

  historyEntries.push([deepClone(snapshot)]);
  let nextIndex = historyEntries.length - 1;
  historyMeta.set("index", nextIndex);

  const overflow = historyEntries.length - MAX_HISTORY_LENGTH;
  if (overflow > 0) {
    historyEntries.delete(0, overflow);
    nextIndex = Math.max(0, nextIndex - overflow);
    historyMeta.set("index", nextIndex);
  }
};

interface WhiteboardState {
  // Tools
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;

  // Tool settings
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  strokeOpacity: number;
  setStrokeOpacity: (opacity: number) => void;
  fillColor: string;
  setFillColor: (color: string) => void;
  fillOpacity: number;
  setFillOpacity: (opacity: number) => void;
  recentStrokeColors: string[];
  recentFillColors: string[];
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  strokeStyle: StrokeStyle;
  setStrokeStyle: (style: StrokeStyle) => void;
  sloppiness: Sloppiness;
  setSloppiness: (sloppiness: Sloppiness) => void;
  arrowType: ArrowType;
  setArrowType: (type: ArrowType) => void;
  arrowStyle: ArrowStyle;
  setArrowStyle: (style: ArrowStyle) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  rectangleCornerStyle: CornerStyle;
  setRectangleCornerStyle: (style: CornerStyle) => void;
  penBackground: string;
  setPenBackground: (color: string) => void;
  textFontFamily: string;
  setTextFontFamily: (font: string) => void;
  textFontSize: number;
  setTextFontSize: (size: number) => void;
  textAlign: TextAlignment;
  setTextAlign: (alignment: TextAlignment) => void;

  // Canvas
  canvasBackground: CanvasBackground;
  setCanvasBackground: (background: CanvasBackground) => void;
  elements: CanvasElement[];
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
  bringToFront: () => void;
  bringForward: () => void;
  sendToBack: () => void;
  sendBackward: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;

  // Pan & Zoom
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  resetView: () => void;

  // History
  history: CanvasElement[][];
  historyIndex: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Collaboration
  users: User[];
  setUsers: (users: User[]) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  roomId: string | null;
  shareUrl: string | null;
  setRoomId: (roomId: string | null) => void;
  setShareUrl: (shareUrl: string | null) => void;

  // Files
  uploadedFiles: SharedFile[];
  addFile: (file: SharedFile) => void;
  renameFile: (id: string, name: string) => void;
  removeFile: (id: string) => void;
  filePreview: FilePreviewState | null;
  openFilePreview: (
    fileId: string,
    metadata?: Partial<Omit<FilePreviewState, "fileId">>
  ) => void;
  closeFilePreview: () => void;
  clearCanvas: () => void;

  // Collaboration bindings
  collaboration: CollaborationBindings | null;
  setCollaboration: (collaboration: CollaborationBindings | null) => void;
  setElementsFromDoc: (elements: CanvasElement[]) => void;
  setUploadedFilesFromDoc: (files: SharedFile[]) => void;
  setHistoryFromDoc: (history: CanvasElement[][], index: number) => void;

  // Focus management
  focusedElementId: string | null;
  focusElement: (id: string) => void;
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  // Tools
  activeTool: "select",
  setActiveTool: (tool) => {
    const defaults = TOOL_DEFAULTS[tool] ?? {};
    set({
      activeTool: tool,
      ...defaults,
    });
  },

  // Tool settings
  strokeColor: "#000000",
  setStrokeColor: (color) => {
    set((state) => {
      const recentColors = [...state.recentStrokeColors];
      // Remove color if it already exists
      const index = recentColors.indexOf(color);
      if (index > -1) {
        recentColors.splice(index, 1);
      }
      // Add to the beginning
      recentColors.unshift(color);
      // Keep only last 6 colors
      const limitedRecent = recentColors.slice(0, 6);
      return {
        strokeColor: color,
        recentStrokeColors: limitedRecent,
      };
    });
  },
  strokeOpacity: 1,
  setStrokeOpacity: (opacity) =>
    set({ strokeOpacity: Math.min(1, Math.max(0, opacity)) }),
  fillColor: "transparent",
  setFillColor: (color) => {
    set((state) => {
      const recentColors = [...state.recentFillColors];
      // Remove color if it already exists
      const index = recentColors.indexOf(color);
      if (index > -1) {
        recentColors.splice(index, 1);
      }
      // Add to the beginning
      recentColors.unshift(color);
      // Keep only last 6 colors
      const limitedRecent = recentColors.slice(0, 6);
      return {
        fillColor: color,
        recentFillColors: limitedRecent,
      };
    });
  },
  fillOpacity: 1,
  setFillOpacity: (opacity) => set({ fillOpacity: Math.min(1, Math.max(0, opacity)) }),
  recentStrokeColors: [],
  recentFillColors: [],
  strokeWidth: 4,
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  strokeStyle: "solid",
  setStrokeStyle: (style) => set({ strokeStyle: style }),
  sloppiness: "normal",
  setSloppiness: (sloppiness) =>
    set((state) => {
      if (state.activeTool === "pen") {
        return {};
      }

      return { sloppiness };
    }),
  arrowType: "arrow-end",
  setArrowType: (type) => set({ arrowType: type }),
  arrowStyle: "straight",
  setArrowStyle: (style) => {
    set({ arrowStyle: style });

    const state = get();
    if (state.activeTool !== "select") {
      return;
    }

    const targetIds = state.selectedIds.filter((id) => {
      const element = state.elements.find((el) => el.id === id);
      if (!element) {
        return false;
      }
      return element.type === "arrow" || element.type === "line";
    });

    if (targetIds.length === 0) {
      return;
    }

    targetIds.forEach((id) => {
      const element = state.elements.find((el) => el.id === id);
      if (!element) {
        return;
      }

      const nextPoints =
        style === "curve"
          ? ensureCurvePoints(element.points)
          : flattenCurvePoints(element.points);

      state.updateElement(id, {
        arrowStyle: style,
        points: nextPoints,
      });
    });

    state.pushHistory();
  },
  opacity: 1,
  setOpacity: (opacity) => set({ opacity }),
  rectangleCornerStyle: "rounded",
  setRectangleCornerStyle: (style) => set({ rectangleCornerStyle: style }),
  penBackground: "transparent",
  setPenBackground: (color) => set({ penBackground: color }),
  textFontFamily: "Inter",
  setTextFontFamily: (font) => {
    set({ textFontFamily: font });
    const state = get();
    if (state.activeTool !== "select") {
      return;
    }

    const textIds = state.selectedIds.filter((id) => {
      const element = state.elements.find((el) => el.id === id);
      return element?.type === "text";
    });

    if (textIds.length === 0) {
      return;
    }

    textIds.forEach((id) => state.updateElement(id, { fontFamily: font }));
    state.pushHistory();
  },
  textFontSize: 20,
  setTextFontSize: (size) => {
    set({ textFontSize: size });
    const state = get();
    if (state.activeTool !== "select") {
      return;
    }

    const textIds = state.selectedIds.filter((id) => {
      const element = state.elements.find((el) => el.id === id);
      return element?.type === "text";
    });

    if (textIds.length === 0) {
      return;
    }

    textIds.forEach((id) => state.updateElement(id, { fontSize: size }));
    state.pushHistory();
  },
  textAlign: "left",
  setTextAlign: (alignment) => {
    set({ textAlign: alignment });
    const state = get();
    if (state.activeTool !== "select") {
      return;
    }

    const textIds = state.selectedIds.filter((id) => {
      const element = state.elements.find((el) => el.id === id);
      return element?.type === "text";
    });

    if (textIds.length === 0) {
      return;
    }

    textIds.forEach((id) => state.updateElement(id, { textAlign: alignment }));
    state.pushHistory();
  },

  // Canvas
  canvasBackground: "simple",
  setCanvasBackground: (background) => set({ canvasBackground: background }),
  elements: [],
  addElement: (element) => {
    const collaboration = get().collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc;
      doc?.transact(() => {
        sharedElements.push([element]);
        if (historyEntries && historyMeta) {
          const snapshot = deepClone(sharedElements.toArray());
          applySharedHistoryUpdate(historyEntries, historyMeta, snapshot);
        }
      });
      return;
    }

    set((state) => ({
      elements: [...state.elements, element],
    }));
    get().pushHistory();
  },
  updateElement: (id, updates) => {
    const collaboration = get().collaboration;
    if (collaboration?.elements) {
      const sharedElements = collaboration.elements;
      const doc = sharedElements.doc;
      doc?.transact(() => {
        for (let index = 0; index < sharedElements.length; index += 1) {
          const current = sharedElements.get(index);
          if (current?.id === id) {
            sharedElements.delete(index, 1);
            sharedElements.insert(index, [{ ...current, ...updates }]);
            break;
          }
        }
      });
      return;
    }

    set((state) => ({
      elements: state.elements.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    }));
  },
  deleteElement: (id) => {
    const collaboration = get().collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc;
      doc?.transact(() => {
        for (let index = 0; index < sharedElements.length; index += 1) {
          const current = sharedElements.get(index);
          if (current?.id === id) {
            sharedElements.delete(index, 1);
            if (historyEntries && historyMeta) {
              const snapshot = deepClone(sharedElements.toArray());
              applySharedHistoryUpdate(historyEntries, historyMeta, snapshot);
            }
            break;
          }
        }
      });
      return;
    }

    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
    }));
    get().pushHistory();
  },
  bringToFront: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;

    const collaboration = state.collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc;

      const reorder = () => {
        const selectedIdsSet = new Set(state.selectedIds);
        const currentElements = sharedElements.toArray();
        const others = currentElements.filter((el) => !selectedIdsSet.has(el.id));
        const selected = currentElements.filter((el) => selectedIdsSet.has(el.id));
        const reordered = [...others, ...selected];

        sharedElements.delete(0, sharedElements.length);
        sharedElements.insert(0, reordered.map((el) => ({ ...el })));

        if (historyEntries && historyMeta) {
          const snapshot = deepClone(reordered);
          applySharedHistoryUpdate(historyEntries, historyMeta, snapshot);
        }
      };

      if (doc) {
        doc.transact(reorder);
      } else {
        reorder();
      }

      return;
    }

    const selectedIdsSet = new Set(state.selectedIds);
    const others = state.elements.filter((el) => !selectedIdsSet.has(el.id));
    const selected = state.elements.filter((el) => selectedIdsSet.has(el.id));

    set({ elements: [...others, ...selected] });
    get().pushHistory();
  },
  sendToBack: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;

    const collaboration = state.collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc;

      const reorder = () => {
        const selectedIdsSet = new Set(state.selectedIds);
        const currentElements = sharedElements.toArray();
        const others = currentElements.filter((el) => !selectedIdsSet.has(el.id));
        const selected = currentElements.filter((el) => selectedIdsSet.has(el.id));
        const reordered = [...selected, ...others];

        sharedElements.delete(0, sharedElements.length);
        sharedElements.insert(0, reordered.map((el) => ({ ...el })));

        if (historyEntries && historyMeta) {
          const snapshot = deepClone(reordered);
          applySharedHistoryUpdate(historyEntries, historyMeta, snapshot);
        }
      };

      if (doc) {
        doc.transact(reorder);
      } else {
        reorder();
      }

      return;
    }

    const selectedIdsSet = new Set(state.selectedIds);
    const others = state.elements.filter((el) => !selectedIdsSet.has(el.id));
    const selected = state.elements.filter((el) => selectedIdsSet.has(el.id));

    set({ elements: [...selected, ...others] });
    get().pushHistory();
  },
  bringForward: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;

    const collaboration = state.collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc;

      const reorder = () => {
        const selectedIdsSet = new Set(state.selectedIds);
        const currentElements = sharedElements.toArray();
        const reordered = [...currentElements];

        // Find the highest index of selected elements
        let maxSelectedIndex = -1;
        for (let i = reordered.length - 1; i >= 0; i--) {
          if (selectedIdsSet.has(reordered[i].id)) {
            maxSelectedIndex = i;
            break;
          }
        }

        // If already at the top, nothing to do
        if (maxSelectedIndex === reordered.length - 1) return;

        // Move selected elements one position forward
        for (let i = maxSelectedIndex; i >= 0; i--) {
          if (selectedIdsSet.has(reordered[i].id) && i < reordered.length - 1) {
            // Swap with next element if next is not selected
            if (!selectedIdsSet.has(reordered[i + 1].id)) {
              [reordered[i], reordered[i + 1]] = [reordered[i + 1], reordered[i]];
            }
          }
        }

        sharedElements.delete(0, sharedElements.length);
        sharedElements.insert(0, reordered.map((el) => ({ ...el })));

        if (historyEntries && historyMeta) {
          const snapshot = deepClone(reordered);
          applySharedHistoryUpdate(historyEntries, historyMeta, snapshot);
        }
      };

      if (doc) {
        doc.transact(reorder);
      } else {
        reorder();
      }

      return;
    }

    const selectedIdsSet = new Set(state.selectedIds);
    const reordered = [...state.elements];

    // Find the highest index of selected elements
    let maxSelectedIndex = -1;
    for (let i = reordered.length - 1; i >= 0; i--) {
      if (selectedIdsSet.has(reordered[i].id)) {
        maxSelectedIndex = i;
        break;
      }
    }

    // If already at the top, nothing to do
    if (maxSelectedIndex === reordered.length - 1) {
      return;
    }

    // Move selected elements one position forward
    for (let i = maxSelectedIndex; i >= 0; i--) {
      if (selectedIdsSet.has(reordered[i].id) && i < reordered.length - 1) {
        // Swap with next element if next is not selected
        if (!selectedIdsSet.has(reordered[i + 1].id)) {
          [reordered[i], reordered[i + 1]] = [reordered[i + 1], reordered[i]];
        }
      }
    }

    set({ elements: reordered });
    get().pushHistory();
  },
  sendBackward: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;

    const collaboration = state.collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc;

      const reorder = () => {
        const selectedIdsSet = new Set(state.selectedIds);
        const currentElements = sharedElements.toArray();
        const reordered = [...currentElements];

        // Find the lowest index of selected elements
        let minSelectedIndex = reordered.length;
        for (let i = 0; i < reordered.length; i++) {
          if (selectedIdsSet.has(reordered[i].id)) {
            minSelectedIndex = i;
            break;
          }
        }

        // If already at the bottom, nothing to do
        if (minSelectedIndex === 0) return;

        // Move selected elements one position backward
        for (let i = minSelectedIndex; i < reordered.length; i++) {
          if (selectedIdsSet.has(reordered[i].id) && i > 0) {
            // Swap with previous element if previous is not selected
            if (!selectedIdsSet.has(reordered[i - 1].id)) {
              [reordered[i], reordered[i - 1]] = [reordered[i - 1], reordered[i]];
            }
          }
        }

        sharedElements.delete(0, sharedElements.length);
        sharedElements.insert(0, reordered.map((el) => ({ ...el })));

        if (historyEntries && historyMeta) {
          const snapshot = deepClone(reordered);
          applySharedHistoryUpdate(historyEntries, historyMeta, snapshot);
        }
      };

      if (doc) {
        doc.transact(reorder);
      } else {
        reorder();
      }

      return;
    }

    const selectedIdsSet = new Set(state.selectedIds);
    const reordered = [...state.elements];

    // Find the lowest index of selected elements
    let minSelectedIndex = reordered.length;
    for (let i = 0; i < reordered.length; i++) {
      if (selectedIdsSet.has(reordered[i].id)) {
        minSelectedIndex = i;
        break;
      }
    }

    // If already at the bottom, nothing to do
    if (minSelectedIndex === 0) {
      return;
    }

    // Move selected elements one position backward
    for (let i = minSelectedIndex; i < reordered.length; i++) {
      if (selectedIdsSet.has(reordered[i].id) && i > 0) {
        // Swap with previous element if previous is not selected
        if (!selectedIdsSet.has(reordered[i - 1].id)) {
          [reordered[i], reordered[i - 1]] = [reordered[i - 1], reordered[i]];
        }
      }
    }

    set({ elements: reordered });
    get().pushHistory();
  },
  clearSelection: () => {
    const collaboration = get().collaboration;
    if (collaboration?.elements) {
      const sharedElements = collaboration.elements;
      const doc = sharedElements.doc;
      doc?.transact(() => {
        for (let index = 0; index < sharedElements.length; index += 1) {
          const current = sharedElements.get(index);
          if (current?.selected) {
            sharedElements.delete(index, 1);
            sharedElements.insert(index, [{ ...current, selected: false }]);
          }
        }
      });
      set({ selectedIds: [] });
      return;
    }

    set((state) => ({
      elements: state.elements.map((el) => ({ ...el, selected: false })),
      selectedIds: [],
    }));
  },
  deleteSelection: () => {
    const selectedIds = get().selectedIds;
    if (selectedIds.length === 0) {
      return;
    }

    const collaboration = get().collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, files: sharedFiles, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc ?? sharedFiles?.doc;
      doc?.transact(() => {
        for (let index = sharedElements.length - 1; index >= 0; index -= 1) {
          const current = sharedElements.get(index);
          if (current?.id && selectedIds.includes(current.id)) {
            sharedElements.delete(index, 1);
          }
        }

        if (sharedFiles) {
          for (let index = sharedFiles.length - 1; index >= 0; index -= 1) {
            const current = sharedFiles.get(index);
            if (current?.id && selectedIds.includes(current.id)) {
              sharedFiles.delete(index, 1);
            }
          }
        }

        if (historyEntries && historyMeta) {
          const snapshot = deepClone(sharedElements.toArray?.() ?? []);
          applySharedHistoryUpdate(historyEntries, historyMeta, snapshot);
        }
      });
      set({ selectedIds: [] });
      return;
    }

    set((state) => ({
      elements: state.elements.filter((el) => !selectedIds.includes(el.id)),
      uploadedFiles: state.uploadedFiles.filter((file) => !selectedIds.includes(file.id)),
      selectedIds: [],
    }));
    get().pushHistory();
  },
  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: ids }),

  // Pan & Zoom
  pan: { x: 0, y: 0 },
  setPan: (pan) =>
    set(() => ({
      pan: {
        x: Number.isFinite(pan.x) ? pan.x : 0,
        y: Number.isFinite(pan.y) ? pan.y : 0,
      },
    })),
  zoom: 1,
  setZoom: (zoom) =>
    set(() => {
      const sanitizedZoom = Number.isFinite(zoom) ? zoom : 1;
      const nextZoom = Math.max(0.1, Math.min(5, sanitizedZoom));
      return { zoom: nextZoom };
    }),
  resetView: () => set({ pan: { x: 0, y: 0 }, zoom: 1 }),

  // History
  history: [[]],
  historyIndex: 0,
  pushHistory: () => {
    const state = get();
    const snapshot = deepClone(state.elements);
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);

    let historyIndex = newHistory.length - 1;
    const overflow = newHistory.length - MAX_HISTORY_LENGTH;
    if (overflow > 0) {
      newHistory.splice(0, overflow);
      historyIndex = Math.max(0, historyIndex - overflow);
    }

    const collaboration = state.collaboration;
    if (collaboration?.historyEntries && collaboration?.historyMeta && collaboration?.elements) {
      const { historyEntries, historyMeta, elements: sharedElements } = collaboration;
      const doc = historyEntries.doc ?? sharedElements.doc;
      const sharedSnapshot = deepClone(sharedElements?.toArray?.() ?? state.elements);
      doc?.transact(() => {
        applySharedHistoryUpdate(historyEntries, historyMeta, sharedSnapshot);
      });
      return;
    }

    set({
      history: newHistory,
      historyIndex,
    });
  },
  undo: () => {
    const collaboration = get().collaboration;
    if (collaboration?.historyEntries && collaboration?.historyMeta && collaboration?.elements) {
      const { historyEntries, historyMeta, elements: sharedElements } = collaboration;
      const currentIndex = (historyMeta.get("index") as number | undefined) ?? historyEntries.length - 1;
      if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        const snapshot = historyEntries.get(newIndex);
        if (snapshot) {
          const doc = sharedElements.doc;
          doc?.transact(() => {
            sharedElements.delete(0, sharedElements.length);
            sharedElements.insert(0, deepClone(snapshot));
            historyMeta.set("index", newIndex);
          });
        }
      }
      return;
    }

    const state = get();
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      set({
        elements: deepClone(state.history[newIndex]),
        historyIndex: newIndex,
      });
    }
  },
  redo: () => {
    const collaboration = get().collaboration;
    if (collaboration?.historyEntries && collaboration?.historyMeta && collaboration?.elements) {
      const { historyEntries, historyMeta, elements: sharedElements } = collaboration;
      const currentIndex = (historyMeta.get("index") as number | undefined) ?? historyEntries.length - 1;
      if (currentIndex < historyEntries.length - 1) {
        const newIndex = currentIndex + 1;
        const snapshot = historyEntries.get(newIndex);
        if (snapshot) {
          const doc = sharedElements.doc;
          doc?.transact(() => {
            sharedElements.delete(0, sharedElements.length);
            sharedElements.insert(0, deepClone(snapshot));
            historyMeta.set("index", newIndex);
          });
        }
      }
      return;
    }

    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      set({
        elements: deepClone(state.history[newIndex]),
        historyIndex: newIndex,
      });
    }
  },

  // Collaboration
  users: [],
  setUsers: (users) => set({ users }),
  updateUser: (id, updates) => {
    set((state) => ({
      users: state.users.map((user) => (user.id === id ? { ...user, ...updates } : user)),
    }));
  },
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  roomId: null,
  shareUrl: null,
  setRoomId: (roomId) => set({ roomId }),
  setShareUrl: (shareUrl) => set({ shareUrl }),

  // Files
  uploadedFiles: [],
  addFile: (file) => {
    const collaboration = get().collaboration;
    if (collaboration?.files) {
      const sharedFiles = collaboration.files;
      const doc = sharedFiles.doc;
      doc?.transact(() => {
        sharedFiles.push([file]);
      });
      return;
    }

    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, file],
    }));
  },
  renameFile: (id, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const collaboration = get().collaboration;
    if (collaboration?.files) {
      const sharedFiles = collaboration.files;
      const doc = sharedFiles.doc;
      doc?.transact(() => {
        for (let index = 0; index < sharedFiles.length; index += 1) {
          const current = sharedFiles.get(index);
          if (current?.id === id) {
            sharedFiles.delete(index, 1);
            sharedFiles.insert(index, [{ ...current, name: trimmedName }]);
            break;
          }
        }
      });
    } else {
      set((state) => ({
        uploadedFiles: state.uploadedFiles.map((file) =>
          file.id === id ? { ...file, name: trimmedName } : file,
        ),
      }));
    }

    const element = get().elements.find((item) => item.id === id);
    if (element) {
      get().updateElement(id, { fileName: trimmedName });
    }
  },
  removeFile: (id) => {
    const collaboration = get().collaboration;
    if (collaboration?.files) {
      const sharedFiles = collaboration.files;
      const doc = sharedFiles.doc;
      doc?.transact(() => {
        for (let index = 0; index < sharedFiles.length; index += 1) {
          const current = sharedFiles.get(index);
          if (current?.id === id) {
            sharedFiles.delete(index, 1);
            break;
          }
        }
      });
    } else {
      set((state) => ({
        uploadedFiles: state.uploadedFiles.filter((file) => file.id !== id),
      }));
    }

    get().deleteElement(id);
  },
  filePreview: null,
  openFilePreview: (fileId, metadata) => {
    const state = get();
    const sharedFile = state.uploadedFiles.find((file) => file.id === fileId);
    const relatedElement = state.elements.find(
      (element) => element.fileUrl === fileId || element.id === fileId
    );

    const resolvedMetadata: FilePreviewState = {
      fileId,
      name: metadata?.name ?? sharedFile?.name ?? relatedElement?.fileName,
      type: metadata?.type ?? sharedFile?.type ?? relatedElement?.fileType,
      ownerId: metadata?.ownerId ?? sharedFile?.ownerId,
      ownerName: metadata?.ownerName ?? sharedFile?.ownerName,
      sourceElementId: metadata?.sourceElementId ?? relatedElement?.id,
      thumbnailUrl:
        metadata?.thumbnailUrl ?? sharedFile?.thumbnailUrl ?? relatedElement?.thumbnailUrl,
    };

    set({ filePreview: resolvedMetadata });
  },
  closeFilePreview: () => {
    set({ filePreview: null });
  },
  clearCanvas: () => {
    const collaboration = get().collaboration;
    if (collaboration?.elements) {
      const { elements: sharedElements, files: sharedFiles, historyEntries, historyMeta } = collaboration;
      const doc = sharedElements.doc ?? sharedFiles?.doc;
      doc?.transact(() => {
        if (sharedElements.length > 0) {
          sharedElements.delete(0, sharedElements.length);
        }
        if (sharedFiles && sharedFiles.length > 0) {
          sharedFiles.delete(0, sharedFiles.length);
        }
        if (historyEntries && historyMeta) {
          applySharedHistoryUpdate(historyEntries, historyMeta, []);
        }
      });
      set({ selectedIds: [], uploadedFiles: [] });
      return;
    }

    set({ elements: [], uploadedFiles: [], selectedIds: [] });
    get().pushHistory();
  },

  // Collaboration bindings
  collaboration: null,
  setCollaboration: (collaboration) => set({ collaboration }),
  setElementsFromDoc: (elements) => set({ elements }),
  setUploadedFilesFromDoc: (files) => set({ uploadedFiles: files }),
  setHistoryFromDoc: (history, index) =>
    set(() => {
      const trimmedHistory = history.slice(-MAX_HISTORY_LENGTH);
      const overflow = history.length - trimmedHistory.length;
      const nextIndex = trimmedHistory.length
        ? Math.max(0, Math.min(index - overflow, trimmedHistory.length - 1))
        : 0;

      return {
        history: trimmedHistory.length > 0 ? trimmedHistory : [[]],
        historyIndex: trimmedHistory.length > 0 ? nextIndex : 0,
      };
    }),

  // Focus management
  focusedElementId: null,
  focusElement: (id) => {
    const state = get();
    const element = state.elements.find((item) => item.id === id);
    if (!element) {
      return;
    }

    const center = getElementCenter(element);
    const { zoom } = state;
    let nextPan = state.pan;

    if (typeof window !== "undefined") {
      const stageWidth = window.innerWidth;
      const stageHeight = window.innerHeight;
      nextPan = {
        x: stageWidth / 2 - center.x * zoom,
        y: stageHeight / 2 - center.y * zoom,
      };
    }

    set({
      pan: nextPan,
      selectedIds: [id],
      focusedElementId: id,
    });

    if (typeof window !== "undefined") {
      if (focusTimeout) {
        clearTimeout(focusTimeout);
      }
      focusTimeout = setTimeout(() => {
        set({ focusedElementId: null });
        focusTimeout = undefined;
      }, 1800);
    }
  },
}));
