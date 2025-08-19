import type { Point } from "../../schemas/GameMatConfig";

interface CanvasAreaProps {
  mode: "upload" | "corners" | "calibration" | "objects" | "preview";
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  draggingObject: string | null;
  hoveredObject: string | null;
  placingObject: boolean;
  onMouseDown: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave: () => void;
  drawMagnifier: () => React.ReactNode;
}

export function CanvasArea({
  mode,
  canvasRef,
  draggingObject,
  hoveredObject,
  placingObject,
  onMouseDown,
  onMouseUp,
  onClick,
  onMouseMove,
  onMouseLeave,
  drawMagnifier,
}: CanvasAreaProps) {
  const getCursorClass = () => {
    if (mode === "objects" && !placingObject) {
      if (draggingObject) return "cursor-move";
      if (hoveredObject) return "cursor-pointer";
      return "cursor-default";
    }
    if (mode === "objects" && placingObject) return "cursor-crosshair";
    if (mode === "corners") return "cursor-crosshair";
    return "cursor-default";
  };

  return (
    <div className="relative h-full">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className={`w-full h-full object-contain ${getCursorClass()}`}
      />
      {drawMagnifier()}
    </div>
  );
}