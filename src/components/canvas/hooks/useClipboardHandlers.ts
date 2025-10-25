import { useCallback, type RefObject } from "react";
import { nanoid } from "nanoid";
import type Konva from "konva";
import { estimateTextBoxHeight, estimateTextBoxWidth } from "@/lib/canvas";
import type {
  CanvasElement,
  TextAlignment,
  Sloppiness,
} from "@/lib/store/useWhiteboardStore";
import type { useToast } from "@/hooks/use-toast";

const ensureClipboard = () => typeof navigator !== "undefined" && navigator.clipboard;

type ToastFunction = ReturnType<typeof useToast>["toast"];

type UseClipboardHandlersParams = {
  stageRef: RefObject<Konva.Stage | null>;
  toast: ToastFunction;
  addElement: (element: CanvasElement) => void;
  setSelectedIds: (ids: string[]) => void;
  elements: CanvasElement[];
  addFilesToCanvas: (
    files: File[],
    position: { x: number; y: number },
  ) => Promise<void>;
  getPastePosition: () => { x: number; y: number };
  strokeColor: string;
  fillColor: string;
  fillOpacity: number;
  opacity: number;
  strokeWidth: number;
  strokeStyle: CanvasElement["strokeStyle"];
  sloppiness: Sloppiness;
  textFontFamily: string;
  textFontSize: number;
  textAlign: TextAlignment;
};

type ClipboardHandlers = {
  handlePasteAction: () => Promise<void>;
  handleCopyAsPng: () => Promise<void>;
  handleCopyAsSvg: () => Promise<void>;
  handleSelectAll: () => void;
};

export const useClipboardHandlers = ({
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
}: UseClipboardHandlersParams): ClipboardHandlers => {
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
    ],
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
  }, [addFilesToCanvas, createTextElementFromClipboard, getPastePosition, toast]);

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
  }, [stageRef, toast]);

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
      const stageSvg = stage.toSVG();
      const blob = new Blob([stageSvg], { type: "image/svg+xml" });
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
  }, [stageRef, toast]);

  const handleSelectAll = useCallback(() => {
    if (!elements.length) {
      return;
    }

    const ids = elements.map((element) => element.id);
    setSelectedIds(ids);
  }, [elements, setSelectedIds]);

  return {
    handlePasteAction,
    handleCopyAsPng,
    handleCopyAsSvg,
    handleSelectAll,
  };
};

export const getClipboardSupport = () => {
  const clipboard = ensureClipboard();
  const readSupported = !!clipboard &&
    (typeof clipboard.read === "function" ||
      typeof clipboard.readText === "function");
  const writeSupported = !!clipboard &&
    typeof clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined";
  return { readSupported, writeSupported };
};
