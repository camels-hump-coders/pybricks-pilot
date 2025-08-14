interface ProgramMetadata {
  relativePath: string;
  programSide?: "left" | "right";
}

interface ProgramsManifest {
  version: string;
  programs: ProgramMetadata[];
}

class ProgramMetadataStorage {
  private readonly CONFIG_DIR = "config";
  private readonly PROGRAMS_FILE = "programs.json";
  private readonly MANIFEST_VERSION = "1.0";

  // Load programs manifest from config directory
  async loadProgramsManifest(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<ProgramsManifest> {
    try {
      // Ensure config directory exists
      const configHandle = await dirHandle.getDirectoryHandle(this.CONFIG_DIR, { create: true });
      const programsFileHandle = await configHandle.getFileHandle(this.PROGRAMS_FILE);
      const programsFile = await programsFileHandle.getFile();
      const content = await programsFile.text();
      const manifest = JSON.parse(content) as ProgramsManifest;

      // Validate the loaded manifest
      if (this.isValidProgramsManifest(manifest)) {
        return manifest;
      } else {
        console.warn("Invalid programs manifest in config/programs.json, using default");
        return this.createDefaultManifest();
      }
    } catch (error) {
      // config/programs.json doesn't exist or can't be read, return default
      return this.createDefaultManifest();
    }
  }

  // Save programs manifest to config directory
  async saveProgramsManifest(
    dirHandle: FileSystemDirectoryHandle,
    manifest: ProgramsManifest
  ): Promise<void> {
    try {
      // Ensure config directory exists
      const configHandle = await dirHandle.getDirectoryHandle(this.CONFIG_DIR, { create: true });
      const programsFileHandle = await configHandle.getFileHandle(this.PROGRAMS_FILE, {
        create: true,
      });
      const writable = await programsFileHandle.createWritable();
      const content = JSON.stringify(manifest, null, 2);
      await writable.write(content);
      await writable.close();
    } catch (error) {
      throw new Error(
        `Failed to save programs manifest to config directory: ${error}`
      );
    }
  }

  // Get program metadata for a specific file
  async getProgramMetadata(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string
  ): Promise<ProgramMetadata | null> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    return manifest.programs.find(p => p.relativePath === relativePath) || null;
  }

  // Store program metadata for a specific file
  async storeProgramMetadata(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string,
    metadata: Partial<ProgramMetadata>
  ): Promise<void> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    
    // Find existing entry or create new one
    const existingIndex = manifest.programs.findIndex(p => p.relativePath === relativePath);
    const programMetadata: ProgramMetadata = {
      relativePath,
      programSide: metadata.programSide,
    };

    if (existingIndex >= 0) {
      manifest.programs[existingIndex] = programMetadata;
    } else {
      manifest.programs.push(programMetadata);
    }

    await this.saveProgramsManifest(dirHandle, manifest);
  }

  // Get all programs in order (array position determines program number)
  async getAllPrograms(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<ProgramMetadata[]> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    return manifest.programs;
  }

  // Remove program metadata
  async removeProgramMetadata(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string
  ): Promise<void> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    manifest.programs = manifest.programs.filter(p => p.relativePath !== relativePath);
    await this.saveProgramsManifest(dirHandle, manifest);
  }

  // Add program to the end of the list (gets next available program number)
  async addProgram(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string,
    programSide: "left" | "right" = "right"
  ): Promise<void> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    
    // Check if program already exists
    const existingIndex = manifest.programs.findIndex(p => p.relativePath === relativePath);
    if (existingIndex >= 0) {
      // Update existing program side but keep position
      manifest.programs[existingIndex].programSide = programSide;
    } else {
      // Add new program to end of array
      manifest.programs.push({
        relativePath,
        programSide,
      });
    }
    
    await this.saveProgramsManifest(dirHandle, manifest);
  }

  // Set program side for a file
  async setProgramSide(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string,
    programSide: "left" | "right" | undefined
  ): Promise<void> {
    await this.storeProgramMetadata(dirHandle, relativePath, { programSide });
  }

  // Move program up in order (with wrap-around)
  async moveProgramUp(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string
  ): Promise<void> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    const currentIndex = manifest.programs.findIndex(p => p.relativePath === relativePath);
    
    if (currentIndex === -1) return; // Program not found
    
    // Calculate swap index (wrap around to end if at beginning)
    const swapIndex = currentIndex === 0 ? manifest.programs.length - 1 : currentIndex - 1;
    
    // Swap the programs in the array
    const temp = manifest.programs[currentIndex];
    manifest.programs[currentIndex] = manifest.programs[swapIndex];
    manifest.programs[swapIndex] = temp;
    
    await this.saveProgramsManifest(dirHandle, manifest);
  }

  // Move program down in order (with wrap-around)
  async moveProgramDown(
    dirHandle: FileSystemDirectoryHandle,
    relativePath: string
  ): Promise<void> {
    const manifest = await this.loadProgramsManifest(dirHandle);
    const currentIndex = manifest.programs.findIndex(p => p.relativePath === relativePath);
    
    if (currentIndex === -1) return; // Program not found
    
    // Calculate swap index (wrap around to beginning if at end)
    const swapIndex = currentIndex === manifest.programs.length - 1 ? 0 : currentIndex + 1;
    
    // Swap the programs in the array
    const temp = manifest.programs[currentIndex];
    manifest.programs[currentIndex] = manifest.programs[swapIndex];
    manifest.programs[swapIndex] = temp;
    
    await this.saveProgramsManifest(dirHandle, manifest);
  }

  // Validate programs manifest structure
  private isValidProgramsManifest(manifest: any): manifest is ProgramsManifest {
    return (
      manifest &&
      typeof manifest.version === "string" &&
      Array.isArray(manifest.programs) &&
      manifest.programs.every((p: any) => 
        p &&
        typeof p.relativePath === "string" &&
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