"use client";

import { forwardRef, type Dispatch, type SetStateAction, type CSSProperties } from "react";

import { estimateTextBoxWidth, getFontFamilyCss, TEXT_MIN_WIDTH } from "@/lib/canvas";

import type { EditingTextState } from "./types";

type CanvasTextEditorProps = {
  editingText: EditingTextState | null;
  editorStyle?: CSSProperties;
  safeZoom: number;
  editorLineHeight: number;
  onChange: Dispatch<SetStateAction<EditingTextState | null>>;
  onFinish: (options?: { cancel?: boolean; skipNextPointer?: boolean }) => void;
};

export const CanvasTextEditor = forwardRef<HTMLTextAreaElement, CanvasTextEditorProps>(
  ({ editingText, editorStyle, safeZoom, editorLineHeight, onChange, onFinish }, ref) => {
    if (!editingText || !editorStyle) {
      return null;
    }

    const textDecoration = [
      editingText.isUnderline ? "underline" : null,
      editingText.isStrikethrough ? "line-through" : null,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return (
      <textarea
        ref={ref}
        className="pointer-events-auto absolute z-40 resize-none border-none bg-transparent text-slate-800 outline-none caret-slate-800"
        style={{
          ...editorStyle,
          lineHeight: `${editorLineHeight * safeZoom}px`,
          padding: `${12 * safeZoom}px`,
          whiteSpace: "pre",
          overflowWrap: "normal",
          wordBreak: "keep-all",
          minWidth: editingText.lockWidth ? undefined : `${TEXT_MIN_WIDTH * safeZoom}px`,
          maxWidth: "none",
          fontFamily: getFontFamilyCss(editingText.fontFamily),
          fontSize: editingText.fontSize * safeZoom,
          fontWeight: editingText.isBold ? 700 : 400,
          fontStyle: editingText.isItalic ? "italic" : "normal",
          textDecoration: textDecoration || undefined,
          textAlign: editingText.alignment,
        }}
        value={editingText.value}
        onChange={(event) => {
          const { value } = event.target;
          onChange((current) => {
            if (!current) return current;
            const newWidth = estimateTextBoxWidth(value, current.fontSize);
            return {
              ...current,
              value,
              width: current.lockWidth ? current.width : newWidth,
            };
          });
        }}
        onBlur={() => onFinish({ skipNextPointer: true })}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onFinish({ cancel: true });
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onFinish();
          }
        }}
        spellCheck
        placeholder="Type"
      />
    );
  }
);

CanvasTextEditor.displayName = "CanvasTextEditor";
