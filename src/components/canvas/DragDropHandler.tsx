"use client";

import { useCallback } from "react";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import { useToast } from "@/hooks/use-toast";

export const useDragDrop = () => {
  const { addElement, addFile } = useWhiteboardStore();
  const { toast } = useToast();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);

      files.forEach((file) => {
        const fileType = file.type;
        const fileName = file.name;
        const fileId = nanoid();

        // Create object URL for preview
        const url = URL.createObjectURL(file);

        // Add to files list
        addFile({
          id: fileId,
          name: fileName,
          type: fileType,
          url,
        });

        // Get drop position relative to canvas
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Create canvas element based on file type
        if (fileType.startsWith("image/")) {
          // Add image element
          const img = new Image();
          img.onload = () => {
            addElement({
              id: fileId,
              type: "image",
              x,
              y,
              width: Math.min(img.width, 400),
              height: Math.min(img.height, 400),
              strokeColor: "#000000",
              strokeWidth: 0,
              strokeStyle: "solid",
              opacity: 1,
              fileUrl: url,
              fileName,
            });
          };
          img.src = url;
        } else if (fileType === "application/pdf") {
          // Add PDF placeholder
          addElement({
            id: fileId,
            type: "file",
            x,
            y,
            width: 200,
            height: 250,
            strokeColor: "#e03131",
            strokeWidth: 2,
            strokeStyle: "solid",
            opacity: 1,
            fileUrl: url,
            fileName,
          });
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
      });
    },
    [addElement, addFile, toast]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return { handleDrop, handleDragOver };
};
