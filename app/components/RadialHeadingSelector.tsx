import { useCallback, useEffect, useState } from "react";

// Radial Heading Selector Component
interface HeadingSelectorProps {
  heading: number;
  onChange: (heading: number) => void;
  size?: number;
}

export function RadialHeadingSelector({
  heading,
  onChange,
  size = 80,
}: HeadingSelectorProps) {
  const radius = size / 2 - 8;
  const centerX = size / 2;
  const centerY = size / 2;
  const [isDragging, setIsDragging] = useState(false);

  // Convert heading to angle for display (0° = north/up, clockwise)
  const displayAngle = heading - 90; // Offset so 0° points up
  const radians = (displayAngle * Math.PI) / 180;
  const indicatorX = centerX + radius * 0.7 * Math.cos(radians);
  const indicatorY = centerY + radius * 0.7 * Math.sin(radians);

  const calculateAngleFromMouse = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const mouseX = clientX - centerX;
      const mouseY = clientY - centerY;

      // Calculate angle from center (0° = north/up, clockwise)
      let angle = Math.atan2(mouseY, mouseX) * (180 / Math.PI);
      angle = angle + 90; // Convert to our heading system

      // Normalize to -180 to 180 range
      if (angle > 180) angle -= 360;
      if (angle < -180) angle += 360;

      return Math.round(angle);
    },
    [],
  );

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = calculateAngleFromMouse(event.clientX, event.clientY, rect);
    onChange(angle);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = calculateAngleFromMouse(event.clientX, event.clientY, rect);
    onChange(angle);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (event: MouseEvent) => {
        const selector = document.querySelector(
          "[data-heading-selector]",
        ) as HTMLElement;
        if (selector) {
          const rect = selector.getBoundingClientRect();
          const angle = calculateAngleFromMouse(
            event.clientX,
            event.clientY,
            rect,
          );
          onChange(angle);
        }
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDragging, onChange, calculateAngleFromMouse]);

  // Common direction markers
  const directions = [
    { angle: 0, label: "N", desc: "Forward" },
    { angle: 90, label: "E", desc: "Right" },
    { angle: 180, label: "S", desc: "Backward" },
    { angle: -90, label: "W", desc: "Left" },
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-gray-600 dark:text-gray-400">
        Robot Heading
      </div>
      <div
        className={`relative cursor-pointer bg-gray-100 dark:bg-gray-700 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:border-blue-400 transition-colors select-none ${isDragging ? "border-blue-500" : ""}`}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        title={`Click or drag to set heading (currently ${heading}°)`}
        data-heading-selector
      >
        {/* Direction markers */}
        {directions.map(({ angle, label }) => {
          const markerAngle = angle - 90; // Offset for display
          const markerRadians = (markerAngle * Math.PI) / 180;
          const markerX = centerX + (radius - 4) * Math.cos(markerRadians);
          const markerY = centerY + (radius - 4) * Math.sin(markerRadians);

          return (
            <div
              key={angle}
              className="absolute text-xs font-bold text-gray-600 dark:text-gray-300 pointer-events-none flex items-center justify-center"
              style={{
                left: markerX,
                top: markerY,
                transform: "translate(-50%, -50%)",
                width: "12px",
                height: "12px",
              }}
            >
              {label}
            </div>
          );
        })}

        {/* Robot direction indicator */}
        <div
          className="absolute w-3 h-3 bg-blue-500 rounded-full border border-white shadow-md pointer-events-none"
          style={{
            left: indicatorX - 6,
            top: indicatorY - 6,
          }}
        />

        {/* Center dot */}
        <div
          className="absolute w-2 h-2 bg-gray-400 rounded-full pointer-events-none"
          style={{
            left: centerX - 4,
            top: centerY - 4,
          }}
        />
      </div>
      <div className="text-xs text-center text-gray-500 dark:text-gray-400">
        {heading}° (
        {directions.find((d) => d.angle === heading)?.desc || "Custom"})
      </div>
    </div>
  );
}
