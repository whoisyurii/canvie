import { create } from "zustand";
import { nanoid } from "nanoid";

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
}

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
  uploadedFiles: Array<{ id: string; name: string; type: string; url: string }>;
  addFile: (file: { id: string; name: string; type: string; url: string }) => void;
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
    set((state) => ({
      elements: [...state.elements, element],
    }));
    get().pushHistory();
  },
  updateElement: (id, updates) => {
    set((state) => ({
      elements: state.elements.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    }));
  },
  deleteElement: (id) => {
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
    }));
    get().pushHistory();
  },
  clearSelection: () => {
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
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(state.elements)));
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },
  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      set({
        elements: JSON.parse(JSON.stringify(state.history[newIndex])),
        historyIndex: newIndex,
      });
    }
  },
  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      set({
        elements: JSON.parse(JSON.stringify(state.history[newIndex])),
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
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, file],
    }));
  },
}));
