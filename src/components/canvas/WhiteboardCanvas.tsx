import { useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text as KonvaText, Arrow, Image as KonvaImage } from "react-konva";
import { useWhiteboardStore } from "@/lib/store/useWhiteboardStore";
import { nanoid } from "nanoid";
import Konva from "konva";
import { useDragDrop } from "./DragDropHandler";
import useImage from "use-image";
import { UserCursor } from "./UserCursor";

const ImageElement = ({ element }: { element: any }) => {
  const [image] = useImage(element.fileUrl || "");
  return image ? (
    <KonvaImage
      image={image}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      opacity={element.opacity}
      rotation={element.rotation}
    />
  ) : null;
};

export const WhiteboardCanvas = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const { handleDrop, handleDragOver } = useDragDrop();

  const {
    activeTool,
    elements,
    addElement,
    updateElement,
    strokeColor,
    strokeWidth,
    strokeStyle,
    fillColor,
    opacity,
    arrowType,
    pan,
    setPan,
    zoom,
    users,
  } = useWhiteboardStore();

  const handleMouseDown = (e: any) => {
    if (activeTool === "select" || activeTool === "pan") return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const x = (pos.x - pan.x) / zoom;
    const y = (pos.y - pan.y) / zoom;

    setIsDrawing(true);

    const newElement: any = {
      id: nanoid(),
      x,
      y,
      strokeColor,
      strokeWidth,
      strokeStyle,
      fillColor,
      opacity,
    };

    if (activeTool === "rectangle") {
      newElement.type = "rectangle";
      newElement.width = 0;
      newElement.height = 0;
    } else if (activeTool === "ellipse") {
      newElement.type = "ellipse";
      newElement.width = 0;
      newElement.height = 0;
    } else if (activeTool === "line" || activeTool === "arrow") {
      newElement.type = activeTool;
      newElement.points = [0, 0, 0, 0];
      newElement.arrowType = arrowType;
    } else if (activeTool === "pen") {
      newElement.type = "pen";
      newElement.points = [0, 0];
    }

    setCurrentShape(newElement);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || !currentShape) return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const x = (pos.x - pan.x) / zoom;
    const y = (pos.y - pan.y) / zoom;

    if (activeTool === "rectangle" || activeTool === "ellipse") {
      setCurrentShape({
        ...currentShape,
        width: x - currentShape.x,
        height: y - currentShape.y,
      });
    } else if (activeTool === "line" || activeTool === "arrow") {
      setCurrentShape({
        ...currentShape,
        points: [0, 0, x - currentShape.x, y - currentShape.y],
      });
    } else if (activeTool === "pen") {
      const newPoints = [...currentShape.points, x - currentShape.x, y - currentShape.y];
      setCurrentShape({
        ...currentShape,
        points: newPoints,
      });
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentShape) {
      addElement(currentShape);
      setCurrentShape(null);
    }
    setIsDrawing(false);
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    
    if (activeTool === "pan" || e.evt.ctrlKey) {
      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = zoom;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - pan.x) / oldScale,
        y: (pointer.y - pan.y) / oldScale,
      };

      const newScale = e.evt.deltaY > 0 ? oldScale * 0.95 : oldScale * 1.05;
      
      useWhiteboardStore.setState({
        zoom: Math.max(0.1, Math.min(5, newScale)),
        pan: {
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        },
      });
    }
  };

  const getStrokeDash = (style: string) => {
    switch (style) {
      case "dashed":
        return [10, 5];
      case "dotted":
        return [2, 5];
      default:
        return [];
    }
  };

  return (
    <div
      className="absolute inset-0 dotted-grid"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        draggable={activeTool === "pan"}
        scaleX={zoom}
        scaleY={zoom}
        x={pan.x}
        y={pan.y}
      >
        <Layer>
          {/* Render all elements */}
          {elements.map((element) => {
            if (element.type === "rectangle") {
              return (
                <Rect
                  key={element.id}
                  x={element.x}
                  y={element.y}
                  width={element.width}
                  height={element.height}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  fill={element.fillColor}
                  opacity={element.opacity}
                  rotation={element.rotation}
                />
              );
            } else if (element.type === "ellipse") {
              return (
                <Circle
                  key={element.id}
                  x={element.x + (element.width || 0) / 2}
                  y={element.y + (element.height || 0) / 2}
                  radiusX={Math.abs((element.width || 0) / 2)}
                  radiusY={Math.abs((element.height || 0) / 2)}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  fill={element.fillColor}
                  opacity={element.opacity}
                  rotation={element.rotation}
                />
              );
            } else if (element.type === "line") {
              return (
                <Line
                  key={element.id}
                  x={element.x}
                  y={element.y}
                  points={element.points}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            } else if (element.type === "arrow") {
              return (
                <Arrow
                  key={element.id}
                  x={element.x}
                  y={element.y}
                  points={element.points}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  dash={getStrokeDash(element.strokeStyle)}
                  opacity={element.opacity}
                  pointerLength={10}
                  pointerWidth={10}
                />
              );
            } else if (element.type === "pen") {
              return (
                <Line
                  key={element.id}
                  x={element.x}
                  y={element.y}
                  points={element.points}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  opacity={element.opacity}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.5}
                />
              );
            } else if (element.type === "text") {
              return (
                <KonvaText
                  key={element.id}
                  x={element.x}
                  y={element.y}
                  text={element.text || ""}
                  fontSize={20}
                  fill={element.strokeColor}
                  opacity={element.opacity}
                />
              );
            } else if (element.type === "image") {
              return <ImageElement key={element.id} element={element} />;
            } else if (element.type === "file") {
              return (
                <Rect
                  key={element.id}
                  x={element.x}
                  y={element.y}
                  width={element.width}
                  height={element.height}
                  stroke={element.strokeColor}
                  strokeWidth={element.strokeWidth}
                  fill="white"
                  opacity={element.opacity}
                  cornerRadius={8}
                />
              );
            }
            return null;
          })}

          {/* Render current drawing shape */}
          {currentShape && (
            <>
              {currentShape.type === "rectangle" && (
                <Rect
                  x={currentShape.x}
                  y={currentShape.y}
                  width={currentShape.width}
                  height={currentShape.height}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  fill={currentShape.fillColor}
                  opacity={currentShape.opacity * 0.7}
                />
              )}
              {currentShape.type === "ellipse" && (
                <Circle
                  x={currentShape.x + currentShape.width / 2}
                  y={currentShape.y + currentShape.height / 2}
                  radiusX={Math.abs(currentShape.width / 2)}
                  radiusY={Math.abs(currentShape.height / 2)}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  fill={currentShape.fillColor}
                  opacity={currentShape.opacity * 0.7}
                />
              )}
              {(currentShape.type === "line" || currentShape.type === "arrow") && (
                <Line
                  x={currentShape.x}
                  y={currentShape.y}
                  points={currentShape.points}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  dash={getStrokeDash(currentShape.strokeStyle)}
                  opacity={currentShape.opacity * 0.7}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              {currentShape.type === "pen" && (
                <Line
                  x={currentShape.x}
                  y={currentShape.y}
                  points={currentShape.points}
                  stroke={currentShape.strokeColor}
                  strokeWidth={currentShape.strokeWidth}
                  opacity={currentShape.opacity * 0.7}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.5}
                />
              )}
            </>
          )}

          {/* Render cursors */}
          {users.map((user) => (
            <UserCursor key={user.id} user={user} pan={pan} zoom={zoom} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};
