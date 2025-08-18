import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { useJotaiFileSystem } from "./useJotaiFileSystem";
import {
  type NamedPosition,
  type EdgeBasedPosition,
  positionsAtom,
  customPositionsAtom,
  selectedPositionIdAtom,
  selectedPositionAtom,
  isPositionManagementOpenAtom,
  isAddPositionDialogOpenAtom,
  addCustomPositionAtom,
  removeCustomPositionAtom,
  updateCustomPositionAtom,
  updateDefaultPositionCoordinatesAtom,
  clearPositionSelectionAtom,
  DEFAULT_EDGE_POSITIONS,
} from "../store/atoms/positionManagement";
import { coordinateUtilsAtom } from "../store/atoms/canvasState";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { customMatConfigAtom } from "../store/atoms/gameMat";
import { calculateRobotPositionFromEdges } from "../utils/robotPosition";

const POSITIONS_CONFIG_FILE = "config/positions.json";

interface PositionsFileData {
  version: string;
  customPositions: NamedPosition[];
}

/**
 * Custom hook for managing robot positions (default and custom)
 */
export function usePositionManager() {
  const { hasDirectoryAccess, directoryHandle } = useJotaiFileSystem();
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const robotConfig = useAtomValue(robotConfigAtom);
  const customMatConfig = useAtomValue(customMatConfigAtom);

  // Position atoms
  const [positions, setPositions] = useAtom(positionsAtom);
  const [customPositions, setCustomPositions] = useAtom(customPositionsAtom);
  const [selectedPositionId, setSelectedPositionId] = useAtom(selectedPositionIdAtom);
  const selectedPosition = useAtomValue(selectedPositionAtom);

  // UI state atoms
  const [isPositionManagementOpen, setIsPositionManagementOpen] = useAtom(isPositionManagementOpenAtom);
  const [isAddPositionDialogOpen, setIsAddPositionDialogOpen] = useAtom(isAddPositionDialogOpenAtom);

  // Action atoms
  const addCustomPosition = useSetAtom(addCustomPositionAtom);
  const removeCustomPosition = useSetAtom(removeCustomPositionAtom);
  const updateCustomPosition = useSetAtom(updateCustomPositionAtom);
  const updateDefaultPositionCoordinates = useSetAtom(updateDefaultPositionCoordinatesAtom);
  const clearPositionSelection = useSetAtom(clearPositionSelectionAtom);

  // Load custom positions from config/positions.json on mount
  const loadCustomPositions = useCallback(async () => {
    if (!hasDirectoryAccess || !directoryHandle) return;

    try {
      // Get config directory and positions file
      const configHandle = await directoryHandle.getDirectoryHandle("config");
      const positionsFileHandle = await configHandle.getFileHandle("positions.json");
      const positionsFile = await positionsFileHandle.getFile();
      const fileContent = await positionsFile.text();
      
      if (fileContent) {
        const data: PositionsFileData = JSON.parse(fileContent);
        if (data.customPositions && Array.isArray(data.customPositions)) {
          setCustomPositions(data.customPositions);
        }
      }
    } catch (error) {
      console.log("No existing positions config file found, starting with defaults");
    }
  }, [hasDirectoryAccess, directoryHandle, setCustomPositions]);

  // Save custom positions to config/positions.json
  const saveCustomPositions = useCallback(async () => {
    if (!hasDirectoryAccess || !directoryHandle) return;

    try {
      const data: PositionsFileData = {
        version: "1.0",
        customPositions: customPositions,
      };

      // Ensure config directory exists
      const configHandle = await directoryHandle.getDirectoryHandle("config", { create: true });
      const positionsFileHandle = await configHandle.getFileHandle("positions.json", { create: true });
      const writable = await positionsFileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    } catch (error) {
      console.error("Failed to save custom positions:", error);
    }
  }, [hasDirectoryAccess, directoryHandle, customPositions]);

  // Save whenever custom positions change
  useEffect(() => {
    if (hasDirectoryAccess && customPositions.length > 0) {
      saveCustomPositions();
    }
  }, [customPositions, hasDirectoryAccess, saveCustomPositions]);

  // Calculate default positions from edge-based settings
  const calculateDefaultPositions = useCallback((): NamedPosition[] => {
    if (!robotConfig) return [];
    
    const defaultPositions: NamedPosition[] = [];
    
    for (const [id, edgePos] of Object.entries(DEFAULT_EDGE_POSITIONS)) {
      const calculatedPos = calculateRobotPositionFromEdges(
        edgePos.side,
        edgePos.fromBottom,
        edgePos.fromSide,
        edgePos.heading,
        robotConfig,
        customMatConfig
      );
      
      const name = id === "bottom-left" ? "Bottom Left" : "Bottom Right";
      
      defaultPositions.push({
        id,
        name,
        x: calculatedPos.x,
        y: calculatedPos.y,
        heading: calculatedPos.heading,
        isDefault: true,
        isCustom: false,
      });
    }
    
    return defaultPositions;
  }, [robotConfig, customMatConfig]);

  // Update positions when robot config or mat config changes
  useEffect(() => {
    const defaultPositions = calculateDefaultPositions();
    setPositions(prevPositions => {
      // Only update if the positions have actually changed to prevent infinite loops
      const newAllPositions = [...defaultPositions, ...customPositions];
      
      // Simple comparison - check if lengths are different or if any position changed
      if (prevPositions.length !== newAllPositions.length) {
        return newAllPositions;
      }
      
      // Check if any default positions changed
      for (let i = 0; i < defaultPositions.length; i++) {
        const prevPos = prevPositions.find(p => p.id === defaultPositions[i].id);
        if (!prevPos || 
            prevPos.x !== defaultPositions[i].x || 
            prevPos.y !== defaultPositions[i].y || 
            prevPos.heading !== defaultPositions[i].heading) {
          return newAllPositions;
        }
      }
      
      return prevPositions; // No changes, return previous state
    });
  }, [calculateDefaultPositions, customPositions]);

  // Load custom positions on mount
  useEffect(() => {
    loadCustomPositions();
  }, [loadCustomPositions]);

  // Ensure a default position is always selected
  useEffect(() => {
    if (positions.length > 0 && !selectedPositionId) {
      // Default to bottom-right if no position is selected
      const bottomRight = positions.find(pos => pos.id === "bottom-right");
      if (bottomRight) {
        setSelectedPositionId("bottom-right");
      }
    }
  }, [positions, selectedPositionId, setSelectedPositionId]);

  // Add a new custom position
  const handleAddCustomPosition = useCallback(async (
    name: string,
    x: number,
    y: number,
    heading: number
  ): Promise<NamedPosition | null> => {
    try {
      const newPosition = addCustomPosition({ name, x, y, heading });
      return newPosition;
    } catch (error) {
      console.error("Failed to add custom position:", error);
      return null;
    }
  }, [addCustomPosition]);

  // Remove a custom position (cannot remove defaults)
  const handleRemoveCustomPosition = useCallback(async (positionId: string): Promise<boolean> => {
    const success = removeCustomPosition(positionId);
    return success;
  }, [removeCustomPosition]);

  // Update a custom position (cannot update defaults)
  const handleUpdateCustomPosition = useCallback(async (
    positionId: string,
    updates: Partial<Omit<NamedPosition, "id" | "isDefault" | "isCustom">>
  ): Promise<boolean> => {
    const success = updateCustomPosition(positionId, updates);
    return success;
  }, [updateCustomPosition]);

  // Select a position by ID
  const handleSelectPosition = useCallback((positionId: string | null) => {
    setSelectedPositionId(positionId);
  }, [setSelectedPositionId]);

  // Get position by ID
  const getPositionById = useCallback((positionId: string): NamedPosition | null => {
    return positions.find(pos => pos.id === positionId) || null;
  }, [positions]);

  // Check if we can create custom positions (requires file system access)
  const canCreateCustomPositions = hasDirectoryAccess;

  // Get available positions for selection (all positions)
  const availablePositions = positions;

  // Get only custom positions
  const getCustomPositions = customPositions;

  // Get only default positions
  const getDefaultPositions = positions.filter(pos => pos.isDefault);

  return {
    // Position data
    positions: availablePositions,
    customPositions: getCustomPositions,
    defaultPositions: getDefaultPositions,
    selectedPosition,
    selectedPositionId,

    // UI state
    isPositionManagementOpen,
    isAddPositionDialogOpen,
    setIsPositionManagementOpen,
    setIsAddPositionDialogOpen,

    // Capabilities
    canCreateCustomPositions,
    hasFileSystemAccess: hasDirectoryAccess,

    // Actions
    addCustomPosition: handleAddCustomPosition,
    removeCustomPosition: handleRemoveCustomPosition,
    updateCustomPosition: handleUpdateCustomPosition,
    selectPosition: handleSelectPosition,
    clearSelection: clearPositionSelection,
    getPositionById,

    // File operations
    loadCustomPositions,
    saveCustomPositions,
  };
}