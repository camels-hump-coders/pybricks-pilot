// Robot starting position configuration
export interface RobotStartPosition {
  side: "left" | "right";
  fromBottom: number; // mm from bottom edge
  fromSide: number; // mm from side edge
  heading: number; // degrees (-180 to 180, 0 = north/forward)
}

export interface PythonFile {
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  name: string;
  size: number;
  lastModified: number;
  content?: string;
  relativePath: string; // Make this required and ensure it's always populated
  isDirectory: boolean; // Flag to distinguish directories
  children?: PythonFile[]; // Children for directory structure
  // Program menu system properties
  programStartPosition?: RobotStartPosition; // Robot starting position configuration
  // Note: programNumber is derived from array position in config/programs.json (1-based)
}
