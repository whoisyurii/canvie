"use client";

import { useCallback, type ChangeEvent, type DragEvent } from "react";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import { useToast } from "@/hooks/use-toast";
import { generateFilePreview } from "@/lib/files/preview";

const toCanvasCoordinates = (
  e: DragEvent,
  target: HTMLElement,
  pan: { x: number; y: number },
  zoom: number,
) => {
  const rect = target.getBoundingClientRect();
  const localX = e.clientX - rect.left;
  const localY = e.clientY - rect.top;

  return {
    x: (localX - pan.x) / zoom,
    y: (localY - pan.y) / zoom,
  };
};

export type UploadPosition = {
  x: number;
  y: number;
};

export const useDragDrop = () => {
  const { addElement, addFile, currentUser, pan, zoom } = useWhiteboardStore();
  const { toast } = useToast();

  const getCenteredPosition = useCallback(
    (width: number, height: number, index: number) => {
      if (typeof window === "undefined") {
        return { x: 0, y: 0 };
      }

      const offset = index * 24;
      const centerX = (window.innerWidth / 2 - pan.x) / zoom;
      const centerY = (window.innerHeight / 2 - pan.y) / zoom;

      return {
        x: centerX - width / 2 + offset,
        y: centerY - height / 2 + offset,
      };
    },
    [pan.x, pan.y, zoom],
  );

  const processFiles = useCallback(
    async (files: File[], options?: { position?: UploadPosition }) => {
      for (const [index, file] of files.entries()) {
        const fileType = file.type || "";
        const fileName = file.name || "Untitled";
        const fileId = nanoid();

        const url = URL.createObjectURL(file);
        const generatedThumbnail = await generateFilePreview(file, url);
        const thumbnailUrl =
          generatedThumbnail ?? (fileType.startsWith("image/") ? url : undefined);

        addFile({
          id: fileId,
          name: fileName,
          type: fileType,
          url,
          ownerId: currentUser?.id ?? "local-user",
          ownerName: currentUser?.name ?? "You",
          thumbnailUrl,
        });

        const resolvePosition = (width: number, height: number) =>
          options?.position ?? getCenteredPosition(width, height, index);

        if (fileType.startsWith("image/")) {
          const img = new Image();
          img.onload = () => {
            const maxDimension = 400;
            const scale = Math.min(
              1,
              maxDimension / Math.max(img.width, img.height),
            );
            const width = Math.max(1, Math.round(img.width * scale));
            const height = Math.max(1, Math.round(img.height * scale));
            const { x, y } = resolvePosition(width, height);
            addElement({
              id: fileId,
              type: "image",
              x,
              y,
              width,
              height,
              strokeColor: "#000000",
              strokeWidth: 0,
              strokeStyle: "solid",
              opacity: 1,
              fileUrl: url,
              fileName,
              fileType,
            });
          };
          img.src = url;
        } else if (fileType === "application/pdf") {
          const addPdfElement = (width: number, height: number) => {
            const { x, y } = resolvePosition(width, height);
            addElement({
              id: fileId,
              type: "file",
              x,
              y,
              width,
              height,
              strokeColor: "#e03131",
              strokeWidth: 2,
              strokeStyle: "solid",
              opacity: 1,
              fileUrl: url,
              fileName,
              fileType,
              thumbnailUrl,
            });
          };

          if (thumbnailUrl) {
            const previewImage = new Image();
            previewImage.onload = () => {
              const maxDimension = 240;
              const scale = Math.min(
                1,
                maxDimension / Math.max(previewImage.width, previewImage.height),
              );
              addPdfElement(
                Math.max(120, previewImage.width * scale),
                Math.max(160, previewImage.height * scale),
              );
            };
            previewImage.src = thumbnailUrl;
          } else {
            addPdfElement(200, 260);
          }
        } else if (fileType === "text/plain") {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const text = (evt.target?.result as string) ?? "";
            const { x, y } = resolvePosition(240, 160);
            addElement({
              id: fileId,
              type: "text",
              x,
              y,
              text: text.slice(0, 200),
              strokeColor: "#000000",
              strokeWidth: 0,
              strokeStyle: "solid",
              opacity: 1,
              fileName,
            });
          };
          reader.readAsText(file);
        }

        toast({
          title: "File added",
          description: `${fileName} has been added to the canvas`,
        });
      }
    },
    [
      addElement,
      addFile,
      currentUser?.id,
      currentUser?.name,
      getCenteredPosition,
      toast,
    ],
  );

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      if (typeof window === "undefined") {
        return;
      }

      event.preventDefault();

      const fileList = event.dataTransfer.files;
      let files = fileList ? Array.from(fileList) : [];

      if (!files.length && event.dataTransfer.items) {
        files = Array.from(event.dataTransfer.items)
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file));
      }

      if (!files.length) {
        return;
      }

      if (event.target instanceof HTMLElement) {
        const position = toCanvasCoordinates(event, event.target, pan, zoom);
        await processFiles(files, { position });
        return;
      }

      await processFiles(files);
    },
    [pan, processFiles, zoom],
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
  }, []);

  const handleFileInput = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const files = input.files ? Array.from(input.files) : [];
      if (!files.length) {
        return;
      }

      await processFiles(files);
      input.value = "";
    },
    [processFiles],
  );

  const addFilesToCanvas = useCallback(
    async (files: File[], position?: UploadPosition) => {
      await processFiles(files, position ? { position } : undefined);
    },
    [processFiles],
  );

  return { handleDrop, handleDragOver, handleFileInput, addFilesToCanvas };
};
