import { useEffect } from "react";

interface UseSplineKeyboardEventsProps {
  isSplinePathMode: boolean;
  selectedSplinePointId: string | null;
  currentSplinePath: any; // TODO: Add proper typing
  deleteSplinePoint: (pointId: string) => void;
  setSelectedSplinePointId: (pointId: string | null) => void;
  completeSplinePath: () => void;
  exitSplinePathMode: () => void;
}

/**
 * Custom hook for handling keyboard events in spline path mode
 */
export function useSplineKeyboardEvents({
  isSplinePathMode,
  selectedSplinePointId,
  currentSplinePath,
  deleteSplinePoint,
  setSelectedSplinePointId,
  completeSplinePath,
  exitSplinePathMode,
}: UseSplineKeyboardEventsProps) {
  // Keyboard event handler for spline path operations
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Delete selected point when Delete or Backspace is pressed
      if (
        isSplinePathMode &&
        selectedSplinePointId &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        deleteSplinePoint(selectedSplinePointId);
        setSelectedSplinePointId(null);
      }

      // Complete path when Enter is pressed
      if (isSplinePathMode && currentSplinePath && event.key === "Enter") {
        if (currentSplinePath.points.length >= 2) {
          completeSplinePath();
        }
      }

      // Cancel path when Escape is pressed
      if (isSplinePathMode && event.key === "Escape") {
        exitSplinePathMode();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isSplinePathMode,
    selectedSplinePointId,
    currentSplinePath,
    deleteSplinePoint,
    setSelectedSplinePointId,
    completeSplinePath,
    exitSplinePathMode,
  ]);
}
