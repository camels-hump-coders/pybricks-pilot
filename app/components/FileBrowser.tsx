import { useAtomValue } from "jotai";
import { useState } from "react";
import { getProgramInfoAtom } from "../store/atoms/fileSystem";
import type { PythonFile, RobotStartPosition } from "../types/fileSystem";

// Helper function to recursively check if a directory contains any programs
const directoryContainsPrograms = (file: PythonFile, getProgramInfo: (relativePath: string) => { isProgram: boolean }): boolean => {
  if (!file.isDirectory || !file.children) {
    return false;
  }
  
  // Check if any direct child files are programs
  for (const child of file.children) {
    if (!child.isDirectory && getProgramInfo(child.relativePath).isProgram) {
      return true;
    }
  }
  
  // Recursively check subdirectories
  for (const child of file.children) {
    if (child.isDirectory && directoryContainsPrograms(child, getProgramInfo)) {
      return true;
    }
  }
  
  return false;
};

// Radial Heading Selector Component (compact version for FileBrowser)
interface CompactHeadingSelectorProps {
  heading: number;
  onChange: (heading: number) => void;
  size?: number;
}

function CompactHeadingSelector({ heading, onChange, size = 40 }: CompactHeadingSelectorProps) {
  const radius = size / 2 - 4;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Convert heading to angle for display (0° = north/up, clockwise)
  const displayAngle = heading - 90; // Offset so 0° points up
  const radians = (displayAngle * Math.PI) / 180;
  const indicatorX = centerX + radius * 0.6 * Math.cos(radians);
  const indicatorY = centerY + radius * 0.6 * Math.sin(radians);
  
  const handleClick = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = event.clientX - centerX;
    const mouseY = event.clientY - centerY;
    
    // Calculate angle from center (0° = north/up, clockwise)
    let angle = Math.atan2(mouseY, mouseX) * (180 / Math.PI);
    angle = angle + 90; // Convert to our heading system
    
    // Normalize to -180 to 180 range
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;
    
    onChange(Math.round(angle));
  };
  
  return (
    <div 
      className="relative cursor-pointer bg-gray-100 dark:bg-gray-700 rounded-full border border-gray-300 dark:border-gray-600 hover:border-blue-400 transition-colors select-none"
      style={{ width: size, height: size }}
      onClick={handleClick}
      title={`Robot heading: ${heading}° (click to change)`}
    >
      {/* Robot direction indicator */}
      <div
        className="absolute w-1.5 h-1.5 bg-blue-500 rounded-full border border-white shadow-sm"
        style={{
          left: indicatorX - 3,
          top: indicatorY - 3,
        }}
      />
      
      {/* Center dot */}
      <div
        className="absolute w-1 h-1 bg-gray-400 rounded-full"
        style={{
          left: centerX - 2,
          top: centerY - 2,
        }}
      />
    </div>
  );
}

// Display-only heading indicator (no interaction)
interface HeadingDisplayProps {
  heading: number;
  size?: number;
}

function HeadingDisplay({ heading, size = 20 }: HeadingDisplayProps) {
  const radius = size / 2 - 2;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Convert heading to angle for display (0° = north/up, clockwise)
  const displayAngle = heading - 90; // Offset so 0° points up
  const radians = (displayAngle * Math.PI) / 180;
  
  // Calculate arrow points
  const arrowLength = radius * 0.7;
  const arrowEndX = centerX + arrowLength * Math.cos(radians);
  const arrowEndY = centerY + arrowLength * Math.sin(radians);
  
  // Calculate arrow head points
  const arrowHeadLength = 3;
  const arrowHeadAngle = Math.PI / 6; // 30 degrees
  const leftHeadX = arrowEndX - arrowHeadLength * Math.cos(radians - arrowHeadAngle);
  const leftHeadY = arrowEndY - arrowHeadLength * Math.sin(radians - arrowHeadAngle);
  const rightHeadX = arrowEndX - arrowHeadLength * Math.cos(radians + arrowHeadAngle);
  const rightHeadY = arrowEndY - arrowHeadLength * Math.sin(radians + arrowHeadAngle);
  
  return (
    <div 
      className="relative bg-gray-100 dark:bg-gray-700 rounded-full border border-gray-300 dark:border-gray-600"
      style={{ width: size, height: size }}
      title={`Robot heading: ${heading}°`}
    >
      <svg 
        className="absolute inset-0" 
        width={size} 
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Arrow line */}
        <line
          x1={centerX}
          y1={centerY}
          x2={arrowEndX}
          y2={arrowEndY}
          stroke="#3B82F6"
          strokeWidth="1"
        />
        {/* Arrow head */}
        <polyline
          points={`${leftHeadX},${leftHeadY} ${arrowEndX},${arrowEndY} ${rightHeadX},${rightHeadY}`}
          stroke="#3B82F6"
          strokeWidth="1"
          fill="none"
        />
        {/* Center dot */}
        <circle
          cx={centerX}
          cy={centerY}
          r="1"
          fill="#9CA3AF"
        />
      </svg>
    </div>
  );
}

// Program Position Configuration Component
interface ProgramPositionConfigProps {
  position?: RobotStartPosition;
  onPositionChange: (position: RobotStartPosition) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function ProgramPositionConfig({ 
  position, 
  onPositionChange, 
  isExpanded, 
  onToggle 
}: ProgramPositionConfigProps) {
  const currentPosition: RobotStartPosition = position || {
    side: "right",
    fromBottom: 0,
    fromSide: 0,
    heading: 0,
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Toggle button with current position summary */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex items-center gap-2 px-2 py-1 text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded border border-green-200 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/70 transition-colors"
        title={`Robot position: ${currentPosition.side} side, ${currentPosition.fromBottom}mm from bottom, ${currentPosition.fromSide}mm from side, ${currentPosition.heading}° heading`}
      >
        <span className="font-mono">📍</span>
        <span>{currentPosition.side[0].toUpperCase()}</span>
        <CompactHeadingSelector 
          heading={currentPosition.heading}
          onChange={(heading) => onPositionChange({ ...currentPosition, heading })}
          size={20}
        />
        <span>{isExpanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded configuration form */}
      {isExpanded && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2 space-y-2">
          <div className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
            🎯 Robot Starting Position
          </div>
          
          {/* Side Selection */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPositionChange({ ...currentPosition, side: "left" });
              }}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                currentPosition.side === "left"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              ← Left Side
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPositionChange({ ...currentPosition, side: "right" });
              }}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                currentPosition.side === "right"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              Right Side →
            </button>
          </div>

          {/* Distance Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Bottom (mm)
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                value={currentPosition.fromBottom}
                onChange={(e) => {
                  e.stopPropagation();
                  onPositionChange({ 
                    ...currentPosition, 
                    fromBottom: Math.max(0, parseInt(e.target.value) || 0) 
                  });
                }}
                className="w-full px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                From {currentPosition.side === "left" ? "Left" : "Right"} (mm)
              </label>
              <input
                type="number"
                min="0"
                max="2000"
                value={currentPosition.fromSide}
                onChange={(e) => {
                  e.stopPropagation();
                  onPositionChange({ 
                    ...currentPosition, 
                    fromSide: Math.max(0, parseInt(e.target.value) || 0) 
                  });
                }}
                className="w-full px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Heading Control */}
          <div className="flex justify-center pt-1">
            <div className="flex flex-col items-center gap-1">
              <div className="text-xs text-gray-600 dark:text-gray-400">Heading</div>
              <CompactHeadingSelector
                heading={currentPosition.heading}
                onChange={(heading) => onPositionChange({ ...currentPosition, heading })}
                size={50}
              />
              <div className="text-xs text-gray-500 dark:text-gray-400">{currentPosition.heading}°</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  onSetProgramSide?: (relativePath: string, programSide: "left" | "right" | undefined) => Promise<void>;
  onSetProgramStartPosition?: (relativePath: string, programStartPosition: import("../types/fileSystem").RobotStartPosition | undefined) => Promise<void>;
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
  onSetProgramSide?: (relativePath: string, programSide: "left" | "right" | undefined) => Promise<void>;
  onSetProgramStartPosition?: (relativePath: string, programStartPosition: import("../types/fileSystem").RobotStartPosition | undefined) => Promise<void>;
  onMoveProgramUp?: (relativePath: string) => Promise<void>;
  onMoveProgramDown?: (relativePath: string) => Promise<void>;
  // Atomic program operations
  onAddToPrograms?: (relativePath: string) => Promise<void>;
  onRemoveFromPrograms?: (relativePath: string) => Promise<void>;
}

function FileTreeItem({ 
  file, 
  level, 
  onSetProgramSide,
  onSetProgramStartPosition,
  onMoveProgramUp,
  onMoveProgramDown,
  onAddToPrograms,
  onRemoveFromPrograms
}: FileTreeItemProps) {
  const getProgramInfo = useAtomValue(getProgramInfoAtom);
  
  // Auto-expand directories that contain programs (either directly or in subdirectories)
  const shouldAutoExpand = level === 0 || (file.isDirectory && directoryContainsPrograms(file, getProgramInfo));
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand);
  
  const programInfo = getProgramInfo(file.relativePath);
  const [isSettingNumber, setIsSettingNumber] = useState(false);
  const [isPositionExpanded, setIsPositionExpanded] = useState(false);
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
      await onSetProgramSide(file.relativePath, side);
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

  const handleSetProgramStartPosition = async (position: RobotStartPosition) => {
    if (!onSetProgramStartPosition) return;
    try {
      await onSetProgramStartPosition(file.relativePath, position);
    } catch (error) {
      console.error("Failed to set program start position:", error);
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
              {programInfo.isProgram ? (
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
                  
                  {/* 2) Position Configuration */}
                  {onSetProgramStartPosition && (
                    <ProgramPositionConfig
                      position={programInfo.programStartPosition}
                      onPositionChange={handleSetProgramStartPosition}
                      isExpanded={isPositionExpanded}
                      onToggle={() => setIsPositionExpanded(!isPositionExpanded)}
                    />
                  )}
                  
                  {/* 3) #x program number */}
                  <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-mono border border-purple-200 dark:border-purple-700">
                    #{programInfo.programNumber}
                  </span>
                  
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
              onSetProgramSide={onSetProgramSide}
              onSetProgramStartPosition={onSetProgramStartPosition}
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
  onSetProgramSide,
  onSetProgramStartPosition,
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
                onSetProgramSide={onSetProgramSide}
                onSetProgramStartPosition={onSetProgramStartPosition}
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
