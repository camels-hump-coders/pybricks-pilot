import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { DebugEvent } from "../services/pybricksHub";
import { 
  uploadProgressAtom, 
  updateUploadProgressAtom, 
  resetUploadProgressAtom,
  type UploadProgressData 
} from "../store/atoms/uploadProgress";

/**
 * Custom hook for managing upload progress state
 * Automatically processes debug events to update progress
 */
export function useUploadProgress(debugEvents?: DebugEvent[]): {
  uploadProgress: UploadProgressData;
  resetProgress: () => void;
} {
  const uploadProgress = useAtomValue(uploadProgressAtom);
  const updateProgress = useSetAtom(updateUploadProgressAtom);
  const resetProgress = useSetAtom(resetUploadProgressAtom);

  // Automatically update progress when debug events change
  useEffect(() => {
    if (debugEvents && debugEvents.length > 0) {
      updateProgress(debugEvents);
    }
  }, [debugEvents, updateProgress]);

  return {
    uploadProgress,
    resetProgress,
  };
}