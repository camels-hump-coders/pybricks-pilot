import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fileSystemService } from '../services/fileSystem';
import { useState, useEffect, useCallback } from 'react';

export interface PythonFile {
  handle: FileSystemFileHandle;
  name: string;
  size: number;
  lastModified: number;
  content?: string;
  relativePath?: string;
}

export function useFileSystem() {
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [directoryName, setDirectoryName] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState(true);
  const queryClient = useQueryClient();

  // Auto-restore directory on component mount
  useEffect(() => {
    const restoreDirectory = async () => {
      setIsRestoring(true);
      try {
        const restoredHandle = await fileSystemService.restoreLastDirectory();
        if (restoredHandle) {
          setDirectoryHandle(restoredHandle);
          setDirectoryName(restoredHandle.name);
          queryClient.invalidateQueries({ queryKey: ['pythonFiles'] });
        }
      } catch (error) {
        console.warn('Failed to restore directory:', error);
      } finally {
        setIsRestoring(false);
      }
    };

    restoreDirectory();
  }, [queryClient]);

  const requestDirectoryMutation = useMutation({
    mutationFn: () => fileSystemService.requestDirectoryAccess(),
    onSuccess: (handle) => {
      if (handle) {
        setDirectoryHandle(handle);
        setDirectoryName(handle.name);
        queryClient.invalidateQueries({ queryKey: ['pythonFiles'] });
      }
    },
  });

  const pythonFilesQuery = useQuery({
    queryKey: ['pythonFiles', directoryHandle?.name],
    queryFn: async (): Promise<PythonFile[]> => {
      if (!directoryHandle) return [];
      
      const fileHandles = await fileSystemService.listPythonFiles(directoryHandle);
      
      // Get file info for each handle
      const filesWithInfo = await Promise.all(
        fileHandles.map(async (handle) => {
          const fileInfo = await fileSystemService.getFileInfo(handle);
          return {
            handle,
            name: fileInfo.name,
            size: fileInfo.size,
            lastModified: fileInfo.lastModified,
            relativePath: fileInfo.relativePath,
          };
        })
      );
      
      return filesWithInfo;
    },
    enabled: !!directoryHandle,
    refetchInterval: 5000, // Auto-refresh every 5 seconds to detect file changes
  });

  const readFileMutation = useMutation({
    mutationFn: async (fileHandle: FileSystemFileHandle) => {
      const content = await fileSystemService.readFile(fileHandle);
      return { handle: fileHandle, content };
    },
    onSuccess: ({ handle, content }) => {
      queryClient.setQueryData(['fileContent', handle.name], content);
    },
  });

  const writeFileMutation = useMutation({
    mutationFn: async ({ handle, content }: { handle: FileSystemFileHandle; content: string }) => {
      await fileSystemService.writeFile(handle, content);
      return { handle, content };
    },
    onSuccess: ({ handle, content }) => {
      queryClient.setQueryData(['fileContent', handle.name], content);
    },
  });

  const createFileMutation = useMutation({
    mutationFn: async ({ name, content }: { name: string; content: string }) => {
      if (!directoryHandle) throw new Error('No directory selected');
      return await fileSystemService.createFile(directoryHandle, name, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pythonFiles'] });
    },
  });

  const getFileContent = (fileName: string) => {
    return useQuery({
      queryKey: ['fileContent', fileName],
      queryFn: async () => {
        const file = pythonFilesQuery.data?.find(f => f.name === fileName);
        if (!file) throw new Error(`File ${fileName} not found`);
        return await fileSystemService.readFile(file.handle);
      },
      enabled: !!pythonFilesQuery.data?.find(f => f.name === fileName),
    });
  };

  // Function to unmount directory
  const unmountDirectory = useCallback(async () => {
    setDirectoryHandle(null);
    setDirectoryName('');
    queryClient.removeQueries({ queryKey: ['pythonFiles'] });
    queryClient.removeQueries({ queryKey: ['fileContent'] });
    
    // Clear persisted data
    try {
      await fileSystemService.clearPersistedData();
    } catch (error) {
      console.warn('Failed to clear persisted data:', error);
    }
  }, [queryClient]);

  // Function to refresh file list manually
  const refreshFiles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pythonFiles'] });
  }, [queryClient]);

  return {
    // Directory management
    directoryHandle,
    directoryName,
    hasDirectoryAccess: !!directoryHandle,
    requestDirectoryAccess: requestDirectoryMutation.mutateAsync,
    unmountDirectory,
    isRequestingDirectory: requestDirectoryMutation.isPending,
    isRestoring,
    
    // File management
    pythonFiles: pythonFilesQuery.data || [],
    isPythonFilesLoading: pythonFilesQuery.isLoading || isRestoring,
    pythonFilesError: pythonFilesQuery.error,
    refreshFiles,
    
    // File operations
    readFile: readFileMutation.mutateAsync,
    writeFile: writeFileMutation.mutateAsync,
    createFile: createFileMutation.mutateAsync,
    
    getFileContent,
    
    // Browser support
    isSupported: 'showDirectoryPicker' in window,
  };
}