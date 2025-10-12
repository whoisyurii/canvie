"use client";

import { useCallback, type DragEvent } from "react";
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

export const useDragDrop = () => {
  const { addElement, addFile, currentUser, pan, zoom } = useWhiteboardStore();
  const { toast } = useToast();

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      if (typeof window === "undefined") {
        return;
      }

      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);

      for (const file of files) {
        const fileType = file.type;
        const fileName = file.name;
        const fileId = nanoid();

        // Create object URL for preview
        const url = URL.createObjectURL(file);
        const generatedThumbnail = await generateFilePreview(file, url);
        const thumbnailUrl =
          generatedThumbnail ?? (fileType.startsWith("image/") ? url : undefined);

        // Add to files list
        addFile({
          id: fileId,
          name: fileName,
          type: fileType,
          url,
          ownerId: currentUser?.id ?? "local-user",
          ownerName: currentUser?.name ?? "You",
          thumbnailUrl,
        });

        // Get drop position relative to canvas
        if (!(e.target instanceof HTMLElement)) {
          continue;
        }
        const { x, y } = toCanvasCoordinates(e, e.target, pan, zoom);

        // Create canvas element based on file type
        if (fileType.startsWith("image/")) {
          // Add image element
          const img = new Image();
          img.onload = () => {
            const maxDimension = 400;
            const scale = Math.min(
              1,
              maxDimension / Math.max(img.width, img.height),
            );
            addElement({
              id: fileId,
              type: "image",
              x,
              y,
              width: Math.max(1, Math.round(img.width * scale)),
              height: Math.max(1, Math.round(img.height * scale)),
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
          // Read and add text content
          const reader = new FileReader();
          reader.onload = (evt) => {
            const text = evt.target?.result as string;
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
    [addElement, addFile, currentUser?.id, currentUser?.name, pan, toast, zoom]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  return { handleDrop, handleDragOver };
};
