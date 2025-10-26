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
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  textStrikethrough: boolean;
  elements: CanvasElement[];
  setSelectedIds: (ids: string[]) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
};

export type UseTextEditingResult = {
  editingText: EditingTextState | null;
  setEditingText: Dispatch<SetStateAction<EditingTextState | null>>;
  textEditorRef: RefObject<HTMLTextAreaElement | null>;
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
  textBold,
  textItalic,
  textUnderline,
  textStrikethrough,
  elements,
  setSelectedIds,
  updateElement,
  deleteElement,
}: UseTextEditingParams): UseTextEditingResult => {
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const editingTextRef = useRef<EditingTextState | null>(null);
  const skipNextPointerRef = useRef(false);
  const [editingText, setEditingText] = useState<EditingTextState | null>(null);

  useEffect(() => {
    editingTextRef.current = editingText;
  }, [editingText]);

  useEffect(() => {
    const current = editingTextRef.current;
    if (!current) {
      return;
    }

    const element = elements.find((item) => item.id === current.id);
    if (!element) {
      return;
    }

    setEditingText((previous) => {
      if (!previous) {
        return previous;
      }

      const nextState: EditingTextState = {
        ...previous,
        fontFamily: element.fontFamily ?? previous.fontFamily,
        fontSize: element.fontSize ?? previous.fontSize,
        alignment: element.textAlign ?? previous.alignment,
        isBold: element.isBold ?? previous.isBold,
        isItalic: element.isItalic ?? previous.isItalic,
        isUnderline: element.isUnderline ?? previous.isUnderline,
        isStrikethrough: element.isStrikethrough ?? previous.isStrikethrough,
      };

      const hasChanges =
        nextState.fontFamily !== previous.fontFamily ||
        nextState.fontSize !== previous.fontSize ||
        nextState.alignment !== previous.alignment ||
        nextState.isBold !== previous.isBold ||
        nextState.isItalic !== previous.isItalic ||
        nextState.isUnderline !== previous.isUnderline ||
        nextState.isStrikethrough !== previous.isStrikethrough;

      return hasChanges ? nextState : previous;
    });
  }, [elements, setEditingText]);

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
      const isBold = element.isBold ?? textBold;
      const isItalic = element.isItalic ?? textItalic;
      const isUnderline = element.isUnderline ?? textUnderline;
      const isStrikethrough = element.isStrikethrough ?? textStrikethrough;

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
        isBold,
        isItalic,
        isUnderline,
        isStrikethrough,
        lockWidth,
        persistWidth,
      };

      setSelectedIds([element.id]);
      setEditingText(editingState);
    },
    [
      setSelectedIds,
      textAlign,
      textBold,
      textFontFamily,
      textFontSize,
      textItalic,
      textStrikethrough,
      textUnderline,
    ],
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
        isBold: current.isBold,
        isItalic: current.isItalic,
        isUnderline: current.isUnderline,
        isStrikethrough: current.isStrikethrough,
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
