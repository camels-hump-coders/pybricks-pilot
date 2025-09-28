import { useState } from "react";
import { PythonEditor } from "../components/PythonEditor";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import type { PythonFile } from "../types/fileSystem";

export default function Filesystem() {
  const {
    hasDirectoryAccess,
    directoryName,
    pythonFiles,
    isPythonFilesLoading,
    requestDirectoryAccess,
    readFile,
    writeFile,
    refreshFiles,
    createFile,
  } = useJotaiFileSystem();
  const [currentFile, setCurrentFile] = useState<PythonFile | null>(null);
  const [content, setContent] = useState("");

  const handleOpen = async (file: PythonFile) => {
    if (file.isDirectory) return;
    const text = await readFile(file.handle as FileSystemFileHandle);
    setCurrentFile(file);
    setContent(text ?? "");
  };

  const handleSave = async () => {
    if (!currentFile) return;
    await writeFile({
      handle: currentFile.handle as FileSystemFileHandle,
      content,
    });
    await refreshFiles();
  };

  const handleCreate = async () => {
    const name = prompt("New file name", "untitled.py");
    if (name) {
      await createFile({ name, content: "" });
      await refreshFiles();
    }
  };

  if (!hasDirectoryAccess) {
    return (
      <div className="p-4">
        <button
          type="button"
          onClick={requestDirectoryAccess}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Mount Directory
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="w-64 border-r overflow-y-auto p-2 space-y-2">
        <div className="text-sm font-semibold">{directoryName}</div>
        <button
          type="button"
          onClick={handleCreate}
          className="px-2 py-1 bg-green-500 text-white rounded w-full"
        >
          New File
        </button>
        {isPythonFilesLoading && <div>Loading...</div>}
        {pythonFiles.map((f) => (
          <button
            type="button"
            key={f.relativePath}
            onClick={() => handleOpen(f)}
            className="w-full text-left cursor-pointer p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {f.relativePath}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        {currentFile ? (
          <>
            <div className="flex items-center justify-between p-2 border-b">
              <h2 className="font-semibold">{currentFile.relativePath}</h2>
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1 bg-blue-500 text-white rounded"
              >
                Save
              </button>
            </div>
            <div className="flex-1">
              <PythonEditor value={content} onChange={setContent} />
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  );
}
