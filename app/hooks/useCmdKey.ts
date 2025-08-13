import { useEffect, useState } from "react";

/**
 * Custom hook for detecting CMD key (Meta key on Mac, Ctrl key on Windows/Linux) presses
 * @returns boolean indicating if CMD key is currently pressed
 */
export function useCmdKey(): boolean {
  const [isCmdKeyPressed, setIsCmdKeyPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        setIsCmdKeyPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        setIsCmdKeyPressed(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return isCmdKeyPressed;
}
