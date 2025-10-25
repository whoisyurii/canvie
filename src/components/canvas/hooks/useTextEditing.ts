import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
  type RefObject,
} from "react";
import type {
  CanvasElement,
  TextAlignment,
} from "@/lib/store/useWhiteboardStore";
import {
  estimateTextBoxWidth,
  normalizeRectBounds,
} from "@/lib/canvas";
import type { EditingTextState } from "../types";

export type UseTextEditingParams = {
  textFontSize: number;
  textFontFamily: string;
  textAlign: TextAlignment;
  setSelectedIds: (ids: string[]) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
};

export type UseTextEditingResult = {
  editingText: EditingTextState | null;
  setEditingText: Dispatch<SetStateAction<EditingTextState | null>>;
  textEditorRef: RefObject<HTMLTextAreaElement>;
  editingTextRef: MutableRefObject<EditingTextState | null>;
  skipNextPointerRef: MutableRefObject<boolean>;
  beginTextEditing: (
    element: CanvasElement,
    options?: { value?: string; width?: number }
  ) => void;
  finishEditingText: (
    options?: { cancel?: boolean; skipNextPointer?: boolean }
  ) => void;
  cancelIfEditing: () => boolean;
};

export const useTextEditing = ({
  textFontFamily,
  textFontSize,
  textAlign,
  setSelectedIds,
  updateElement,
  deleteElement,
}: UseTextEditingParams): UseTextEditingResult => {
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const editingTextRef = useRef<EditingTextState | null>(null);
  const skipNextPointerRef = useRef(false);
  const [editingText, setEditingText] = useState<EditingTextState | null>(null);

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
          element.height ?? 0,
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
    [deleteElement, updateElement],
  );

  const cancelIfEditing = useCallback(() => {
    if (editingTextRef.current) {
      finishEditingText();
      return true;
    }
    return false;
  }, [finishEditingText]);

  return {
    editingText,
    setEditingText,
    textEditorRef,
    editingTextRef,
    skipNextPointerRef,
    beginTextEditing,
    finishEditingText,
    cancelIfEditing,
  };
};
