import { atom } from "jotai";
import type { DebugEvent } from "../../services/pybricksHub";
import { isUploadingProgramAtom } from "./hubConnection";

export interface UploadProgressData {
  current: number;
  total: number;
  isVisible: boolean;
}

/**
 * Stores the current upload progress state
 */
export const uploadProgressAtom = atom<UploadProgressData>({
  current: 0,
  total: 0,
  isVisible: false,
});

/**
 * Action atom to update upload progress from debug events
 */
export const updateUploadProgressAtom = atom(
  null,
  (get, set, debugEvents: DebugEvent[]) => {
    if (!debugEvents || debugEvents.length === 0) return;

    // Look for the latest upload-related debug events
    const recentEvents = debugEvents.slice(-10); // Check last 10 events

    for (const event of recentEvents.reverse()) {
      if (event.type === "upload") {
        // Look for "Progress: chunk X/Y" pattern
        const progressMatch = event.message.match(
          /Progress: chunk (\d+)\/(\d+)/,
        );
        if (progressMatch) {
          const current = parseInt(progressMatch[1]);
          const total = parseInt(progressMatch[2]);
          set(uploadProgressAtom, { current, total, isVisible: true });
          return; // Use the most recent progress event
        }

        // Check for upload completion
        if (
          event.message.includes("Upload completed") ||
          event.message.includes("Multi-module compilation complete") ||
          event.message.includes("Upload and run completed successfully")
        ) {
          // Clear uploading state immediately
          set(isUploadingProgramAtom, false);
          // Hide progress after a brief delay
          setTimeout(() => {
            set(uploadProgressAtom, (prev) => ({ ...prev, isVisible: false }));
          }, 1000);
          return;
        }

        // Check for upload start
        if (
          event.message.includes("Starting") &&
          (event.message.includes("upload") ||
            event.message.includes("compilation"))
        ) {
          set(uploadProgressAtom, { current: 0, total: 0, isVisible: true });
          return;
        }
      }

      if (event.type === "error") {
        // Hide progress on error
        set(uploadProgressAtom, (prev) => ({ ...prev, isVisible: false }));
        return;
      }
    }
  },
);

/**
 * Action atom to reset upload progress
 */
export const resetUploadProgressAtom = atom(null, (get, set) => {
  set(uploadProgressAtom, { current: 0, total: 0, isVisible: false });
});
