import { useState } from "react";
import type { PythonFile } from "../types/fileSystem";

interface FileBrowserProps {
  directoryName: string;
  pythonFiles: PythonFile[];
  isLoading: boolean;
  isRestoring?: boolean;
  error: Error | null;
  onRefresh: () => void;
  onUnmount: () => void;
  onCreateFile: () => void;
  className?: string;
  // Program metadata handlers
  onSetProgramNumber?: (relativePath: string, programNumber: number | undefined) => Promise<void>;
  onSetProgramSide?: (relativePath: string, programSide: "left" | "right" | undefined) => Promise<void>;
  onGetNextAvailableProgramNumber?: () => Promise<number>;
  onMoveProgramUp?: (relativePath: string) => Promise<void>;
  onMoveProgramDown?: (relativePath: string) => Promise<void>;
  // Atomic program operations
  onAddToPrograms?: (relativePath: string) => Promise<void>;
  onRemoveFromPrograms?: (relativePath: string) => Promise<void>;
}

interface FileTreeItemProps {
  file: PythonFile;
  level: number;
  // Program metadata handlers
  onSetProgramNumber?: (relativePath: string, programNumber: number | undefined) => Promise<void>;
  onSetProgramSide?: (relativePath: string, programSide: "left" | "right" | undefined) => Promise<void>;
  onGetNextAvailableProgramNumber?: () => Promise<number>;
  onMoveProgramUp?: (relativePath: string) => Promise<void>;
  onMoveProgramDown?: (relativePath: string) => Promise<void>;
  // Atomic program operations
  onAddToPrograms?: (relativePath: string) => Promise<void>;
  onRemoveFromPrograms?: (relativePath: string) => Promise<void>;
}

function FileTreeItem({ 
  file, 
  level, 
  onSetProgramNumber,
  onSetProgramSide,
  onGetNextAvailableProgramNumber,
  onMoveProgramUp,
  onMoveProgramDown,
  onAddToPrograms,
  onRemoveFromPrograms
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const [isSettingNumber, setIsSettingNumber] = useState(false);
  const hasChildren = file.isDirectory && file.children && file.children.length > 0;

  const handleClick = () => {
    if (file.isDirectory) {
      setIsExpanded(!isExpanded);
    }
    // No longer select individual files - only manage programs
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

  const handleAddToPrograms = async () => {
    if (!onAddToPrograms) return;
    
    setIsSettingNumber(true);
    try {
      await onAddToPrograms(file.relativePath);
    } catch (error) {
      console.error("Failed to add to program list:", error);
    } finally {
      setIsSettingNumber(false);
    }
  };

  const handleRemoveFromPrograms = async () => {
    if (!onRemoveFromPrograms) return;
    
    try {
      await onRemoveFromPrograms(file.relativePath);
    } catch (error) {
      console.error("Failed to remove from program list:", error);
    }
  };

  const handleSetProgramSide = async (side: "left" | "right") => {
    if (!onSetProgramSide) return;
    
    try {
      await onSetProgramSide(file.name, side);
    } catch (error) {
      console.error("Failed to set program side:", error);
    }
  };

  const handleMoveProgramUp = async () => {
    if (!onMoveProgramUp) return;
    
    try {
      await onMoveProgramUp(file.relativePath);
    } catch (error) {
      console.error("Failed to move program up:", error);
    }
  };

  const handleMoveProgramDown = async () => {
    if (!onMoveProgramDown) return;
    
    try {
      await onMoveProgramDown(file.relativePath);
    } catch (error) {
      console.error("Failed to move program down:", error);
    }
  };

  return (
    <div>
      <div
        className="grid grid-cols-12 gap-2 p-2 border-b border-gray-100 dark:border-gray-700 items-center hover:bg-blue-50 dark:hover:bg-blue-900/20"
        style={{ paddingLeft: `${level * 20 + 16}px` }}
      >
        {/* Name Column */}
        <div className="col-span-4 min-w-0">
          <button
            onClick={handleClick}
            className="flex items-center gap-2 min-w-0 w-full text-left"
          >
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
          </button>
        </div>

        {/* Program Column */}
        <div className="col-span-4 flex items-center justify-center">
          {!file.isDirectory && (
            <div className="flex items-center gap-1">
              {file.programNumber ? (
                <>
                  {/* 1) Up arrow to move program up */}
                  {onMoveProgramUp && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveProgramUp();
                      }}
                      className="text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 px-1 py-0.5 rounded"
                      title="Move program up in order (with wrap-around)"
                    >
                      ↑
                    </button>
                  )}
                  
                  {/* 2) L for left side */}
                  {onSetProgramSide && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetProgramSide("left");
                      }}
                      className={`text-xs px-1.5 py-0.5 rounded border ${
                        file.programSide === "left"
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                      }`}
                      title="Set robot starting position to left side"
                    >
                      L
                    </button>
                  )}
                  
                  {/* 3) #x program number */}
                  <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-mono border border-purple-200 dark:border-purple-700">
                    #{file.programNumber}
                  </span>
                  
                  {/* 4) R for right side */}
                  {onSetProgramSide && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetProgramSide("right");
                      }}
                      className={`text-xs px-1.5 py-0.5 rounded border ${
                        file.programSide === "right" || !file.programSide
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                      }`}
                      title="Set robot starting position to right side"
                    >
                      R
                    </button>
                  )}
                  
                  {/* 5) Down arrow to move program down */}
                  {onMoveProgramDown && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveProgramDown();
                      }}
                      className="text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 px-1 py-0.5 rounded"
                      title="Move program down in order (with wrap-around)"
                    >
                      ↓
                    </button>
                  )}
                  
                  {/* 6) X to remove from program list */}
                  {onRemoveFromPrograms && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromPrograms();
                      }}
                      className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 px-1 py-0.5 rounded"
                      title="Remove from program list"
                    >
                      ✕
                    </button>
                  )}
                </>
              ) : (
                onAddToPrograms && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToPrograms();
                    }}
                    disabled={isSettingNumber}
                    className="text-xs text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:border-purple-400 disabled:opacity-50"
                    title="Add to program list for hub menu"
                  >
                    {isSettingNumber ? "..." : "#"}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Size Column */}
        <div className="col-span-2 text-right text-sm text-gray-600 dark:text-gray-400">
          {!file.isDirectory && formatFileSize(file.size)}
        </div>

        {/* Modified Column */}
        <div className="col-span-2 text-right text-sm text-gray-600 dark:text-gray-400">
          {!file.isDirectory && formatLastModified(file.lastModified)}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {file.children!.map((child) => (
            <FileTreeItem
              key={child.relativePath}
              file={child}
              level={level + 1}
              onSetProgramNumber={onSetProgramNumber}
              onSetProgramSide={onSetProgramSide}
              onGetNextAvailableProgramNumber={onGetNextAvailableProgramNumber}
              onMoveProgramUp={onMoveProgramUp}
              onMoveProgramDown={onMoveProgramDown}
              onAddToPrograms={onAddToPrograms}
              onRemoveFromPrograms={onRemoveFromPrograms}
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
  isLoading,
  isRestoring = false,
  error,
  onRefresh,
  onUnmount,
  onCreateFile,
  className = "",
  onSetProgramNumber,
  onSetProgramSide,
  onGetNextAvailableProgramNumber,
  onMoveProgramUp,
  onMoveProgramDown,
  onAddToPrograms,
  onRemoveFromPrograms,
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
              <div className="col-span-4 text-left">Name</div>
              <div className="col-span-4 text-center">Program</div>
              <div className="col-span-2 text-right">Size</div>
              <div className="col-span-2 text-right">Modified</div>
            </div>

            {/* File Tree Items */}
            {pythonFiles.map((file) => (
              <FileTreeItem
                key={file.relativePath}
                file={file}
                level={0}
                onSetProgramNumber={onSetProgramNumber}
                onSetProgramSide={onSetProgramSide}
                onGetNextAvailableProgramNumber={onGetNextAvailableProgramNumber}
                onMoveProgramUp={onMoveProgramUp}
                onMoveProgramDown={onMoveProgramDown}
                onAddToPrograms={onAddToPrograms}
                onRemoveFromPrograms={onRemoveFromPrograms}
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
          </span>
        </div>
      </div>
    </div>
  );
}
