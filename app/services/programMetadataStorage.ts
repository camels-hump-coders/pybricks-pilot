interface ProgramMetadata {
  fileName: string;
  programNumber?: number;
  programSide?: "left" | "right";
}

interface ProgramsManifest {
  version: string;
  programs: ProgramMetadata[];
}

class ProgramMetadataStorage {
  private readonly PROGRAMS_FILE = "programs.json";
  private readonly MANIFEST_VERSION = "1.0";

  // Load programs manifest from working directory
  async loadProgramsManifest(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<ProgramsManifest> {
    try {
      const programsFileHandle = await dirHandle.getFileHandle(this.PROGRAMS_FILE);
      const programsFile = await programsFileHandle.getFile();
      const content = await programsFile.text();
      const manifest = JSON.parse(content) as ProgramsManifest;

      // Validate the loaded manifest
      if (this.isValidProgramsManifest(manifest)) {
        return manifest;
      } else {
        console.warn("Invalid programs manifest in programs.json, using default");
        return this.createDefaultManifest();
      }
    } catch (error) {
      // programs.json doesn't exist or can't be read, return default
      return this.createDefaultManifest();
    }
  }

  // Save programs manifest to working directory
  async saveProgramsManifest(
    dirHandle: FileSystemDirectoryHandle,
    manifest: ProgramsManifest
  ): Promise<void> {
    try {
      const programsFileHandle = await dirHandle.getFileHandle(this.PROGRAMS_FILE, {
        create: true,
      });
      const writable = await programsFileHandle.createWritable();
      const content = JSON.stringify(manifest, null, 2);
      await writable.write(content);
      await writable.close();
    } catch (error) {
      throw new Error(
        `Failed to save programs manifest to working directory: ${error}`
      );
    }
  }

  // Get program metadata for a specific file
  async getProgramMetadata(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<ProgramMetadata | null> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    return manifest.programs.find(p => p.fileName === fileName) || null;
  }

  // Store program metadata for a specific file
  async storeProgramMetadata(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    metadata: Partial<ProgramMetadata>
  ): Promise<void> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    
    // Find existing entry or create new one
    const existingIndex = manifest.programs.findIndex(p => p.fileName === fileName);
    const programMetadata: ProgramMetadata = {
      fileName,
      programNumber: metadata.programNumber,
      programSide: metadata.programSide,
    };

    if (existingIndex >= 0) {
      manifest.programs[existingIndex] = programMetadata;
    } else {
      manifest.programs.push(programMetadata);
    }

    await this.saveProgramsManifest(dirHandle, manifest);
  }

  // Get all programs with numbers, sorted by program number
  async getAllProgramsWithNumbers(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<ProgramMetadata[]> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    return manifest.programs
      .filter(p => p.programNumber !== undefined)
      .sort((a, b) => (a.programNumber || 0) - (b.programNumber || 0));
  }

  // Remove program metadata
  async removeProgramMetadata(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<void> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    manifest.programs = manifest.programs.filter(p => p.fileName !== fileName);
    await this.saveProgramsManifest(dirHandle, manifest);
  }

  // Get next available program number
  async getNextAvailableProgramNumber(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<number> {
    const programsWithNumbers = await this.getAllProgramsWithNumbers(dirHandle);
    const usedNumbers = programsWithNumbers.map(p => p.programNumber || 0);
    
    // Find the lowest available number starting from 1
    for (let i = 1; i <= 10; i++) { // Limit to 10 programs for hub menu
      if (!usedNumbers.includes(i)) {
        return i;
      }
    }
    
    // If all numbers 1-10 are taken, return 11 (though this might not work on hub)
    return usedNumbers.length + 1;
  }

  // Set program number for a file
  async setProgramNumber(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    programNumber: number | undefined
  ): Promise<void> {
    await this.storeProgramMetadata(dirHandle, fileName, { programNumber });
  }

  // Set program side for a file
  async setProgramSide(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    programSide: "left" | "right" | undefined
  ): Promise<void> {
    await this.storeProgramMetadata(dirHandle, fileName, { programSide });
  }

  // Move program up in order (with wrap-around)
  async moveProgramUp(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<void> {
    const allPrograms = await this.getAllProgramsWithNumbers(dirHandle);
    const currentProgram = allPrograms.find(p => p.fileName === fileName);
    
    if (!currentProgram || !currentProgram.programNumber) return;
    
    const currentNumber = currentProgram.programNumber;
    const currentIndex = allPrograms.findIndex(p => p.programNumber === currentNumber);
    
    if (currentIndex === -1) return;
    
    // Find the program to swap with (wrap around to end if at beginning)
    const swapIndex = currentIndex === 0 ? allPrograms.length - 1 : currentIndex - 1;
    const swapProgram = allPrograms[swapIndex];
    
    if (!swapProgram) return;
    
    // Swap the program numbers
    await this.setProgramNumber(dirHandle, currentProgram.fileName, swapProgram.programNumber);
    await this.setProgramNumber(dirHandle, swapProgram.fileName, currentProgram.programNumber);
  }

  // Move program down in order (with wrap-around)
  async moveProgramDown(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<void> {
    const allPrograms = await this.getAllProgramsWithNumbers(dirHandle);
    const currentProgram = allPrograms.find(p => p.fileName === fileName);
    
    if (!currentProgram || !currentProgram.programNumber) return;
    
    const currentNumber = currentProgram.programNumber;
    const currentIndex = allPrograms.findIndex(p => p.programNumber === currentNumber);
    
    if (currentIndex === -1) return;
    
    // Find the program to swap with (wrap around to beginning if at end)
    const swapIndex = currentIndex === allPrograms.length - 1 ? 0 : currentIndex + 1;
    const swapProgram = allPrograms[swapIndex];
    
    if (!swapProgram) return;
    
    // Swap the program numbers
    await this.setProgramNumber(dirHandle, currentProgram.fileName, swapProgram.programNumber);
    await this.setProgramNumber(dirHandle, swapProgram.fileName, currentProgram.programNumber);
  }

  // Validate programs manifest structure
  private isValidProgramsManifest(manifest: any): manifest is ProgramsManifest {
    return (
      manifest &&
      typeof manifest.version === "string" &&
      Array.isArray(manifest.programs) &&
      manifest.programs.every((p: any) => 
        p &&
        typeof p.fileName === "string" &&
        (p.programNumber === undefined || typeof p.programNumber === "number") &&
        (p.programSide === undefined || p.programSide === "left" || p.programSide === "right")
      )
    );
  }

  // Create default empty manifest
  private createDefaultManifest(): ProgramsManifest {
    return {
      version: this.MANIFEST_VERSION,
      programs: [],
    };
  }
}

export const programMetadataStorage = new ProgramMetadataStorage();