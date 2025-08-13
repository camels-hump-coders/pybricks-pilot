import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

// Custom hook to sync file system polling
export function useSyncFileSystem() {
  const directoryHandle = useAtomValue(directoryHandleAtom);
  const refreshFiles = useSetAtom(refreshPythonFilesAtom);

  useEffect(() => {
    if (!directoryHandle) return;

    // Auto-refresh every 5 seconds to detect file changes
    const interval = setInterval(() => {
      refreshFiles();
    }, 5000);

    return () => clearInterval(interval);
  }, [directoryHandle, refreshFiles]);
}

// Import the refresh action
import { refreshPythonFilesAtom } from "./actions/fileSystemActions";
import { directoryHandleAtom } from "./atoms/fileSystem";
