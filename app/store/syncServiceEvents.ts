import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

// Custom hook to sync file system polling
export function useSyncFileSystem() {
  const stableDirectoryAccess = useAtomValue(stableDirectoryAccessAtom);
  const refreshFiles = useSetAtom(refreshPythonFilesAtom);

  useEffect(() => {
    if (!stableDirectoryAccess) return;

    // Auto-refresh every 5 seconds to detect file changes
    const interval = setInterval(() => {
      refreshFiles();
    }, 5000);

    return () => clearInterval(interval);
  }, [stableDirectoryAccess, refreshFiles]);
}

// Import the refresh action
import { refreshPythonFilesAtom } from "./actions/fileSystemActions";
import { stableDirectoryAccessAtom } from "./atoms/fileSystem";
