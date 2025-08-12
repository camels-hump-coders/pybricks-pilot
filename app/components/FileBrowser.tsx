import { useState } from "react";
import type { PythonFile } from "../types/fileSystem";

interface FileBrowserProps {
  directoryName: string;
  pythonFiles: PythonFile[];
  selectedFile: PythonFile | null;
  isLoading: boolean;
  isRestoring?: boolean;
  error: Error | null;
  onFileSelect: (file: PythonFile) => void;
  onRefresh: () => void;
  onUnmount: () => void;
  onCreateFile: () => void;
  className?: string;
}

export function FileBrowser({
  directoryName,
  pythonFiles,
  selectedFile,
  isLoading,
  isRestoring = false,
  error,
  onFileSelect,
  onRefresh,
  onUnmount,
  onCreateFile,
  className = "",
}: FileBrowserProps) {
  const [sortBy, setSortBy] = useState<"name" | "modified" | "size">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatLastModified = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const sortedFiles = [...pythonFiles].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "modified":
        comparison = b.lastModified - a.lastModified;
        break;
      case "size":
        comparison = b.size - a.size;
        break;
    }

    return sortOrder === "asc" ? comparison : -comparison;
  });

  const handleSort = (newSortBy: "name" | "modified" | "size") => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSortBy);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (column: "name" | "modified" | "size") => {
    if (sortBy !== column) return "↕️";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  if (error) {
    return (
      <div
        className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 ${className}`}
      >
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-2">
          <span>❌</span>
          <span className="font-medium">Error loading directory</span>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">
          {error.message}
        </p>
        <button
          onClick={onRefresh}
          className="mt-2 px-3 py-1 text-sm bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📁</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                  Mounted Directory
                </h3>
                {isRestoring && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    🔄 Restoring...
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {directoryName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50"
              title="Refresh file list"
            >
              {isLoading ? "🔄" : "↻"} Refresh
            </button>

            <button
              onClick={onCreateFile}
              className="px-3 py-1 text-sm bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-md hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
              title="Create new Python file"
            >
              ➕ New File
            </button>

            <button
              onClick={onUnmount}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Unmount directory"
            >
              ✕ Unmount
            </button>
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="max-h-96 overflow-y-auto">
        {pythonFiles.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-lg font-medium mb-1">No Python files found</p>
            <p className="text-sm">
              {isLoading
                ? "Scanning directory..."
                : "Create a new file or add .py files to this directory"}
            </p>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              <button
                onClick={() => handleSort("name")}
                className="col-span-6 text-left flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Name {getSortIcon("name")}
              </button>
              <button
                onClick={() => handleSort("size")}
                className="col-span-2 text-right flex items-center justify-end gap-1 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Size {getSortIcon("size")}
              </button>
              <button
                onClick={() => handleSort("modified")}
                className="col-span-4 text-right flex items-center justify-end gap-1 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Modified {getSortIcon("modified")}
              </button>
            </div>

            {/* File Rows */}
            {sortedFiles.map((file) => (
              <button
                key={file.name}
                onClick={() => onFileSelect(file)}
                className={`w-full grid grid-cols-12 gap-2 p-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-gray-100 dark:border-gray-700 ${
                  selectedFile?.name === file.name
                    ? "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-600"
                    : ""
                }`}
              >
                <div className="col-span-6 flex items-center gap-2">
                  <span className="text-blue-600">🐍</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {file.name}
                  </span>
                  {selectedFile?.name === file.name && (
                    <span className="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
                      Selected
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-right text-sm text-gray-600 dark:text-gray-400">
                  {formatFileSize(file.size)}
                </div>
                <div className="col-span-4 text-right text-sm text-gray-600 dark:text-gray-400">
                  {formatLastModified(file.lastModified)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>
              {pythonFiles.length} Python file
              {pythonFiles.length !== 1 ? "s" : ""} found
            </span>
            <span className="text-purple-600">● Persisted to IndexedDB</span>
          </div>
          <span>
            {isLoading && <span className="text-blue-600">● Scanning...</span>}
            {isRestoring && (
              <span className="text-orange-600">
                ● Restoring from storage...
              </span>
            )}
            {selectedFile && (
              <span className="text-green-600">
                ● {selectedFile.name} selected
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
