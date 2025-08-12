export interface PythonFile {
  handle: FileSystemFileHandle;
  name: string;
  size: number;
  lastModified: number;
  content?: string;
  relativePath?: string;
}
