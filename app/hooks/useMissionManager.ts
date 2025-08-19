import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  addMissionAtom,
  addPointToMissionAtom,
  cancelEditingMissionAtom,
  clearMissionSelectionAtom,
  editingMissionAtom,
  insertPointAfterAtom,
  isAddMissionDialogOpenAtom,
  isEditingMissionAtom,
  isMissionEditorOpenAtom,
  isMissionManagementOpenAtom,
  missionsAtom,
  removeMissionAtom,
  removePointFromMissionAtom,
  saveEditingMissionAtom,
  selectedMissionAtom,
  selectedMissionIdAtom,
  selectedPointIdAtom,
  selectPointAtom,
  startEditingMissionAtom,
  updateMissionAtom,
  updatePointInMissionAtom,
} from "../store/atoms/missionPlanner";
import type { Mission, MissionPointType } from "../types/missionPlanner";
import { useJotaiFileSystem } from "./useJotaiFileSystem";

interface MissionsFileDataV1 {
  version: string;
  missions: Mission[];
  lastModified: string;
}

/**
 * Custom hook for managing missions with file system integration
 */
export function useMissionManager() {
  const { hasDirectoryAccess, stableDirectoryHandle, stableDirectoryAccess } =
    useJotaiFileSystem();

  // Mission state
  const [missions, setMissions] = useAtom(missionsAtom);
  const [selectedMissionId, setSelectedMissionId] = useAtom(
    selectedMissionIdAtom,
  );
  const selectedMission = useAtomValue(selectedMissionAtom);
  const [isEditingMission, _setIsEditingMission] =
    useAtom(isEditingMissionAtom);
  const [editingMission, _setEditingMission] = useAtom(editingMissionAtom);
  const [selectedPointId, _setSelectedPointId] = useAtom(selectedPointIdAtom);

  // UI state
  const [isMissionManagementOpen, setIsMissionManagementOpen] = useAtom(
    isMissionManagementOpenAtom,
  );
  const [isAddMissionDialogOpen, setIsAddMissionDialogOpen] = useAtom(
    isAddMissionDialogOpenAtom,
  );
  const [isMissionEditorOpen, setIsMissionEditorOpen] = useAtom(
    isMissionEditorOpenAtom,
  );

  // Action atoms
  const addMission = useSetAtom(addMissionAtom);
  const removeMission = useSetAtom(removeMissionAtom);
  const updateMission = useSetAtom(updateMissionAtom);
  const startEditingMission = useSetAtom(startEditingMissionAtom);
  const saveEditingMission = useSetAtom(saveEditingMissionAtom);
  const cancelEditingMission = useSetAtom(cancelEditingMissionAtom);
  const addPointToMission = useSetAtom(addPointToMissionAtom);
  const insertPointAfter = useSetAtom(insertPointAfterAtom);
  const removePointFromMission = useSetAtom(removePointFromMissionAtom);
  const updatePointInMission = useSetAtom(updatePointInMissionAtom);
  const selectPoint = useSetAtom(selectPointAtom);
  const clearMissionSelection = useSetAtom(clearMissionSelectionAtom);

  // Load missions from config/missions.json
  const loadMissions = useCallback(async () => {
    if (!stableDirectoryAccess || !stableDirectoryHandle) return;

    try {
      // Get config directory and missions file
      const configHandle =
        await stableDirectoryHandle.getDirectoryHandle("config");
      const missionsFileHandle =
        await configHandle.getFileHandle("missions.json");
      const missionsFile = await missionsFileHandle.getFile();
      const fileContent = await missionsFile.text();

      if (fileContent) {
        const data: MissionsFileDataV1 = JSON.parse(fileContent);
        if (data.missions && Array.isArray(data.missions)) {
          setMissions(data.missions);
        }
      }
    } catch (_error) {
      console.log(
        "No existing missions config file found, starting with empty missions",
      );
    }
  }, [stableDirectoryAccess, stableDirectoryHandle, setMissions]);

  // Save missions to config/missions.json
  const saveMissions = useCallback(
    async (missions: Mission[]) => {
      if (!stableDirectoryAccess || !stableDirectoryHandle) return;

      try {
        const data: MissionsFileDataV1 = {
          version: "1.0",
          missions: missions,
          lastModified: new Date().toISOString(),
        };

        // Ensure config directory exists
        const configHandle = await stableDirectoryHandle.getDirectoryHandle(
          "config",
          { create: true },
        );
        const missionsFileHandle = await configHandle.getFileHandle(
          "missions.json",
          { create: true },
        );
        const writable = await missionsFileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      } catch (error) {
        console.error("Failed to save missions:", error);
      }
    },
    [stableDirectoryAccess, stableDirectoryHandle],
  );

  // Save whenever missions change
  useEffect(() => {
    if (stableDirectoryAccess && missions.length > 0) {
      saveMissions(missions);
      console.log("Auto-save enabled - missions saved:", missions.length);
    }
  }, [missions, stableDirectoryAccess, saveMissions]);

  // Load missions on mount
  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  // Mission management functions
  const handleAddMission = useCallback(
    async (
      name: string,
      description?: string,
      defaultArcRadius: number = 100,
    ): Promise<Mission | null> => {
      try {
        // Validate unique name
        const existingNames = missions.map((m) => m.name.toLowerCase());
        if (existingNames.includes(name.toLowerCase())) {
          throw new Error("Mission name must be unique");
        }

        const newMission = addMission({
          name,
          description,
          points: [],
          segments: [],
          defaultArcRadius,
        });

        return newMission;
      } catch (error) {
        console.error("Failed to add mission:", error);
        return null;
      }
    },
    [addMission, missions],
  );

  const handleRemoveMission = useCallback(
    async (missionId: string): Promise<boolean> => {
      try {
        return removeMission(missionId);
      } catch (error) {
        console.error("Failed to remove mission:", error);
        return false;
      }
    },
    [removeMission],
  );

  const handleUpdateMission = useCallback(
    async (
      missionId: string,
      updates: Partial<Omit<Mission, "id" | "created">>,
    ): Promise<boolean> => {
      try {
        return updateMission(missionId, updates);
      } catch (error) {
        console.error("Failed to update mission:", error);
        return false;
      }
    },
    [updateMission],
  );

  // Mission editing functions
  const handleStartEditingMission = useCallback(
    (missionId: string) => {
      return startEditingMission(missionId);
    },
    [startEditingMission],
  );

  const handleSaveEditingMission = useCallback(() => {
    return saveEditingMission();
  }, [saveEditingMission]);

  const handleCancelEditingMission = useCallback(() => {
    cancelEditingMission();
  }, [cancelEditingMission]);

  // Point management functions
  const handleAddPoint = useCallback(
    (point: MissionPointType) => {
      return addPointToMission(point);
    },
    [addPointToMission],
  );

  const handleInsertPointAfter = useCallback(
    (afterPointId: string | null, point: MissionPointType) => {
      return insertPointAfter(afterPointId, point);
    },
    [insertPointAfter],
  );

  const handleRemovePoint = useCallback(
    (pointId: string) => {
      return removePointFromMission(pointId);
    },
    [removePointFromMission],
  );

  const handleUpdatePoint = useCallback(
    (pointId: string, updates: Partial<MissionPointType>) => {
      return updatePointInMission(pointId, updates);
    },
    [updatePointInMission],
  );

  const handleSelectPoint = useCallback(
    (pointId: string | null) => {
      selectPoint(pointId);
    },
    [selectPoint],
  );

  // Mission selection functions
  const handleSelectMission = useCallback(
    (missionId: string | null) => {
      setSelectedMissionId(missionId);
    },
    [setSelectedMissionId],
  );

  // Get mission by ID
  const getMissionById = useCallback(
    (missionId: string): Mission | null => {
      return missions.find((mission) => mission.id === missionId) || null;
    },
    [missions],
  );

  // Validation functions
  const validateMissionName = useCallback(
    (name: string, excludeMissionId?: string): string | null => {
      if (!name.trim()) {
        return "Mission name is required";
      }

      if (name.trim().length < 2) {
        return "Mission name must be at least 2 characters";
      }

      const existingMission = missions.find(
        (m) =>
          m.id !== excludeMissionId &&
          m.name.toLowerCase() === name.trim().toLowerCase(),
      );

      if (existingMission) {
        return "Mission name must be unique";
      }

      return null;
    },
    [missions],
  );

  // Check if we can create missions (requires file system access)
  const canCreateMissions = hasDirectoryAccess;

  return {
    // Mission data
    missions,
    selectedMission,
    selectedMissionId,
    editingMission,
    isEditingMission,
    selectedPointId,

    // UI state
    isMissionManagementOpen,
    isAddMissionDialogOpen,
    isMissionEditorOpen,
    setIsMissionManagementOpen,
    setIsAddMissionDialogOpen,
    setIsMissionEditorOpen,

    // Capabilities
    canCreateMissions,
    hasFileSystemAccess: hasDirectoryAccess,

    // Mission management actions
    addMission: handleAddMission,
    removeMission: handleRemoveMission,
    updateMission: handleUpdateMission,
    selectMission: handleSelectMission,
    getMissionById,
    clearSelection: clearMissionSelection,

    // Mission editing actions
    startEditingMission: handleStartEditingMission,
    saveEditingMission: handleSaveEditingMission,
    cancelEditingMission: handleCancelEditingMission,

    // Point management actions
    addPoint: handleAddPoint,
    insertPointAfter: handleInsertPointAfter,
    removePoint: handleRemovePoint,
    updatePoint: handleUpdatePoint,
    selectPoint: handleSelectPoint,

    // Validation
    validateMissionName,

    // File operations
    loadMissions,
    saveMissions,
  };
}
