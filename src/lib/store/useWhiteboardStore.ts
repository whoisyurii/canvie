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
  fileType?: string;
  thumbnailUrl?: string;
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

export type SharedFile = {
  id: string;
  name: string;
  type: string;
  url: string;
  ownerId: string;
  ownerName: string;
  thumbnailUrl?: string;
};

const getElementCenter = (element: CanvasElement) => {
  if (element.type === "rectangle" || element.type === "ellipse" || element.type === "image" || element.type === "file") {
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
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const MAX_HISTORY_LENGTH = 200;

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
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;

  // Files
  uploadedFiles: SharedFile[];
  addFile: (file: SharedFile) => void;
  renameFile: (id: string, name: string) => void;
  removeFile: (id: string) => void;

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
        window.clearTimeout(focusTimeout);
      }
      focusTimeout = window.setTimeout(() => {
        set({ focusedElementId: null });
        focusTimeout = undefined;
      }, 1800);
    }
  },
}));
