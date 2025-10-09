import { create } from "zustand";
import * as Y from "yjs";

export type Tool =
  | "select"
  | "pan"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "pen"
  | "eraser";

export type StrokeStyle = "solid" | "dashed" | "dotted";
export type Sloppiness = "smooth" | "normal" | "rough";
export type ArrowType = "line" | "arrow-start" | "arrow-end" | "arrow-both";

export interface CanvasElement {
  id: string;
  type: "rectangle" | "ellipse" | "arrow" | "line" | "text" | "pen" | "image" | "file";
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  points?: number[];
  text?: string;
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  sloppiness?: Sloppiness;
  arrowType?: ArrowType;
  fileUrl?: string;
  fileName?: string;
  selected?: boolean;
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

export type SharedFile = { id: string; name: string; type: string; url: string };

interface CollaborationBindings {
  ydoc: Y.Doc | null;
  elements: Y.Array<CanvasElement> | null;
  files: Y.Array<SharedFile> | null;
  historyEntries: Y.Array<CanvasElement[]> | null;
  historyMeta: Y.Map<any> | null;
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

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
  historyMeta.set("index", historyEntries.length - 1);
};

interface WhiteboardState {
  // Tools
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;

  // Tool settings
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  fillColor: string;
  setFillColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  strokeStyle: StrokeStyle;
  setStrokeStyle: (style: StrokeStyle) => void;
  sloppiness: Sloppiness;
  setSloppiness: (sloppiness: Sloppiness) => void;
  arrowType: ArrowType;
  setArrowType: (type: ArrowType) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;

  // Canvas
  elements: CanvasElement[];
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
  bringToFront: () => void;
  sendToBack: () => void;
  clearSelection: () => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;

  // Pan & Zoom
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  zoom: number;
  setZoom: (zoom: number) => void;

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

  // Files
  uploadedFiles: SharedFile[];
  addFile: (file: SharedFile) => void;

  // Collaboration bindings
  collaboration: CollaborationBindings | null;
  setCollaboration: (collaboration: CollaborationBindings | null) => void;
  setElementsFromDoc: (elements: CanvasElement[]) => void;
  setUploadedFilesFromDoc: (files: SharedFile[]) => void;
  setHistoryFromDoc: (history: CanvasElement[][], index: number) => void;
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  // Tools
  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),

  // Tool settings
  strokeColor: "#000000",
  setStrokeColor: (color) => set({ strokeColor: color }),
  fillColor: "transparent",
  setFillColor: (color) => set({ fillColor: color }),
  strokeWidth: 2,
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  strokeStyle: "solid",
  setStrokeStyle: (style) => set({ strokeStyle: style }),
  sloppiness: "normal",
  setSloppiness: (sloppiness) => set({ sloppiness }),
  arrowType: "arrow-end",
  setArrowType: (type) => set({ arrowType: type }),
  opacity: 1,
  setOpacity: (opacity) => set({ opacity }),

  // Canvas
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

    const selectedIdsSet = new Set(state.selectedIds);
    const others = state.elements.filter((el) => !selectedIdsSet.has(el.id));
    const selected = state.elements.filter((el) => selectedIdsSet.has(el.id));

    set({ elements: [...others, ...selected] });
    get().pushHistory();
  },
  sendToBack: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;

    const selectedIdsSet = new Set(state.selectedIds);
    const others = state.elements.filter((el) => !selectedIdsSet.has(el.id));
    const selected = state.elements.filter((el) => selectedIdsSet.has(el.id));

    set({ elements: [...selected, ...others] });
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
  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: ids }),

  // Pan & Zoom
  pan: { x: 0, y: 0 },
  setPan: (pan) => set({ pan }),
  zoom: 1,
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),

  // History
  history: [[]],
  historyIndex: 0,
  pushHistory: () => {
    const state = get();
    const snapshot = deepClone(state.elements);
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
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

  // Collaboration bindings
  collaboration: null,
  setCollaboration: (collaboration) => set({ collaboration }),
  setElementsFromDoc: (elements) => set({ elements }),
  setUploadedFilesFromDoc: (files) => set({ uploadedFiles: files }),
  setHistoryFromDoc: (history, index) =>
    set({
      history,
      historyIndex: Math.max(0, Math.min(index, history.length - 1)),
    }),
}));
