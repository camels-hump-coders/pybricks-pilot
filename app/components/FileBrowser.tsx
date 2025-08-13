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

interface FileTreeItemProps {
  file: PythonFile;
  level: number;
  selectedFile: PythonFile | null;
  onFileSelect: (file: PythonFile) => void;
}

function FileTreeItem({ file, level, selectedFile, onFileSelect }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const isSelected = selectedFile?.relativePath === file.relativePath;
  const hasChildren = file.isDirectory && file.children && file.children.length > 0;

  const handleClick = () => {
    if (file.isDirectory) {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect(file);
    }
  };

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

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 p-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-gray-100 dark:border-gray-700 ${
          isSelected
            ? "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-600"
            : ""
        }`}
        style={{ paddingLeft: `${level * 20 + 16}px` }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {file.isDirectory ? (
            <span className="text-yellow-600">
              {isExpanded ? "📂" : "📁"}
            </span>
          ) : (
            <span className="text-blue-600">🐍</span>
          )}
          
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {file.name}
          </span>
          
          {isSelected && !file.isDirectory && (
            <span className="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
              Selected
            </span>
          )}
        </div>

        {!file.isDirectory && (
          <>
            <div className="text-sm text-gray-600 dark:text-gray-400 min-w-0 text-right">
              {formatFileSize(file.size)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 min-w-0 text-right">
              {formatLastModified(file.lastModified)}
            </div>
          </>
        )}
      </button>

      {hasChildren && isExpanded && (
        <div>
          {file.children!.map((child) => (
            <FileTreeItem
              key={child.relativePath}
              file={child}
              level={level + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
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
  const countPythonFiles = (files: PythonFile[]): number => {
    let count = 0;
    files.forEach(file => {
      if (file.isDirectory && file.children) {
        count += countPythonFiles(file.children);
      } else if (!file.isDirectory) {
        count++;
      }
    });
    return count;
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

      {/* File Tree */}
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
            {/* Tree Header */}
            <div className="grid grid-cols-12 gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              <div className="col-span-6 text-left">Name</div>
              <div className="col-span-3 text-right">Size</div>
              <div className="col-span-3 text-right">Modified</div>
            </div>

            {/* File Tree Items */}
            {pythonFiles.map((file) => (
              <FileTreeItem
                key={file.relativePath}
                file={file}
                level={0}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>
              {countPythonFiles(pythonFiles)} Python file
              {countPythonFiles(pythonFiles) !== 1 ? "s" : ""} found
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
