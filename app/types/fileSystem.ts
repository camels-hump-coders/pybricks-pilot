export interface PythonFile {
  handle: FileSystemFileHandle;
  name: string;
  size: number;
  lastModified: number;
  content?: string;
  relativePath: string; // Make this required and ensure it's always populated
  isDirectory?: boolean; // Add flag to distinguish directories
  children?: PythonFile[]; // Add children for directory structure
  // Program menu system properties
  programSide?: "left" | "right"; // Robot starting side for automatic positioning
  // Note: programNumber is derived from array position in programs.json (1-based)
}
