"use client";

import { Stage } from "react-konva";

import { CanvasContextMenu } from "./CanvasContextMenu";
import { CanvasElementsLayer } from "./CanvasElementsLayer";
import { CanvasTextEditor } from "./CanvasTextEditor";
import { useWhiteboardCanvas } from "./hooks/useWhiteboardCanvas";

export const WhiteboardCanvas = () => {
  const {
    refs: { containerRef, stageRef, textEditorRef },
    contextMenuProps,
    containerProps,
    textEditorProps,
    stageProps,
    canvasElementsLayerProps,
  } = useWhiteboardCanvas();

  return (
    <CanvasContextMenu {...contextMenuProps}>
      <div ref={containerRef} {...containerProps}>
        <CanvasTextEditor ref={textEditorRef} {...textEditorProps} />
        <Stage ref={stageRef} {...stageProps}>
          <CanvasElementsLayer {...canvasElementsLayerProps} />
        </Stage>
      </div>
    </CanvasContextMenu>
  );
};

