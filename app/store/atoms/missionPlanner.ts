import { atom } from "jotai";
import type { 
  Mission, 
  MissionPointType, 
  MissionExecution,
  MissionStatus,
  CompiledMission,
  MissionsFileData
} from "../../types/missionPlanner";

// Base atoms for mission data
export const missionsAtom = atom<Mission[]>([]);
export const selectedMissionIdAtom = atom<string | null>(null);
export const isEditingMissionAtom = atom<boolean>(false);

// Derived atom for the currently selected mission
export const selectedMissionAtom = atom(
  (get) => {
    const selectedId = get(selectedMissionIdAtom);
    if (!selectedId) return null;
    return get(missionsAtom).find(mission => mission.id === selectedId) || null;
  }
);

// Mission editing state
export const editingMissionAtom = atom<Mission | null>(null);
export const selectedPointIdAtom = atom<string | null>(null);

// Mission execution state
export const missionExecutionAtom = atom<MissionExecution | null>(null);
export const missionStatusAtom = atom<MissionStatus>("idle");

// UI state atoms
export const isMissionManagementOpenAtom = atom<boolean>(false);
export const isAddMissionDialogOpenAtom = atom<boolean>(false);
export const isMissionEditorOpenAtom = atom<boolean>(false);
export const showMissionValidationAtom = atom<boolean>(false);

// Action atoms for mission management

// Create a new mission
export const addMissionAtom = atom(
  null,
  (get, set, newMission: Omit<Mission, "id" | "created" | "modified">) => {
    const missions = get(missionsAtom);
    const now = new Date().toISOString();
    
    const mission: Mission = {
      ...newMission,
      id: `mission-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created: now,
      modified: now,
    };
    
    set(missionsAtom, [...missions, mission]);
    return mission;
  }
);

// Remove a mission
export const removeMissionAtom = atom(
  null,
  (get, set, missionId: string) => {
    const missions = get(missionsAtom);
    const updatedMissions = missions.filter(mission => mission.id !== missionId);
    set(missionsAtom, updatedMissions);
    
    // Clear selection if the removed mission was selected
    const selectedId = get(selectedMissionIdAtom);
    if (selectedId === missionId) {
      set(selectedMissionIdAtom, null);
      set(editingMissionAtom, null);
      set(isEditingMissionAtom, false);
    }
    
    return true;
  }
);

// Update a mission
export const updateMissionAtom = atom(
  null,
  (get, set, missionId: string, updates: Partial<Omit<Mission, "id" | "created">>) => {
    const missions = get(missionsAtom);
    const updatedMissions = missions.map(mission => 
      mission.id === missionId 
        ? { 
            ...mission, 
            ...updates, 
            modified: new Date().toISOString() 
          }
        : mission
    );
    set(missionsAtom, updatedMissions);
    
    // Update editing mission if it's the same one being updated
    const editingMission = get(editingMissionAtom);
    if (editingMission && editingMission.id === missionId) {
      set(editingMissionAtom, {
        ...editingMission,
        ...updates,
        modified: new Date().toISOString()
      });
    }
    
    return true;
  }
);

// Start editing a mission
export const startEditingMissionAtom = atom(
  null,
  (get, set, missionId: string) => {
    const mission = get(missionsAtom).find(m => m.id === missionId);
    if (!mission) return false;
    
    // Create a deep copy for editing
    const editingMission: Mission = {
      ...mission,
      points: mission.points.map(point => ({ ...point } as MissionPointType)),
      segments: mission.segments.map(segment => ({
        ...segment,
        fromPoint: { ...segment.fromPoint } as MissionPointType,
        toPoint: { ...segment.toPoint } as MissionPointType,
        arcConfig: segment.arcConfig ? { ...segment.arcConfig } : undefined
      }))
    };
    
    set(selectedMissionIdAtom, missionId);
    set(editingMissionAtom, editingMission);
    set(isEditingMissionAtom, true);
    set(isMissionEditorOpenAtom, true);
    
    return true;
  }
);

// Save editing changes to the mission
export const saveEditingMissionAtom = atom(
  null,
  (get, set) => {
    const editingMission = get(editingMissionAtom);
    if (!editingMission) return false;
    
    const updateMission = set(updateMissionAtom, editingMission.id, {
      name: editingMission.name,
      description: editingMission.description,
      points: editingMission.points,
      segments: editingMission.segments,
      defaultArcRadius: editingMission.defaultArcRadius
    });
    
    if (updateMission) {
      set(isEditingMissionAtom, false);
      set(editingMissionAtom, null);
      set(isMissionEditorOpenAtom, false);
    }
    
    return updateMission;
  }
);

// Cancel editing changes
export const cancelEditingMissionAtom = atom(
  null,
  (get, set) => {
    set(isEditingMissionAtom, false);
    set(editingMissionAtom, null);
    set(isMissionEditorOpenAtom, false);
    set(selectedPointIdAtom, null);
  }
);

// Add a point to the editing mission
export const addPointToMissionAtom = atom(
  null,
  (get, set, point: MissionPointType) => {
    const editingMission = get(editingMissionAtom);
    if (!editingMission) return false;
    
    const updatedMission: Mission = {
      ...editingMission,
      points: [...editingMission.points, point],
      modified: new Date().toISOString()
    };
    
    set(editingMissionAtom, updatedMission);
    return true;
  }
);

// Remove a point from the editing mission
export const removePointFromMissionAtom = atom(
  null,
  (get, set, pointId: string) => {
    const editingMission = get(editingMissionAtom);
    if (!editingMission) return false;
    
    // Don't allow removal of start/end points
    const pointToRemove = editingMission.points.find(p => p.id === pointId);
    if (pointToRemove && (pointToRemove.type === "start" || pointToRemove.type === "end")) {
      return false;
    }
    
    const updatedMission = {
      ...editingMission,
      points: editingMission.points.filter(p => p.id !== pointId),
      segments: editingMission.segments.filter(s => 
        s.fromPoint.id !== pointId && s.toPoint.id !== pointId
      ),
      modified: new Date().toISOString()
    };
    
    set(editingMissionAtom, updatedMission);
    
    // Clear selection if the removed point was selected
    const selectedPointId = get(selectedPointIdAtom);
    if (selectedPointId === pointId) {
      set(selectedPointIdAtom, null);
    }
    
    return true;
  }
);

// Update a point in the editing mission
export const updatePointInMissionAtom = atom(
  null,
  (get, set, pointId: string, updates: Partial<MissionPointType>) => {
    const editingMission = get(editingMissionAtom);
    if (!editingMission) return false;
    
    const updatedMission: Mission = {
      ...editingMission,
      points: editingMission.points.map(point =>
        point.id === pointId ? { ...point, ...updates } as MissionPointType : point
      ),
      modified: new Date().toISOString()
    };
    
    set(editingMissionAtom, updatedMission);
    return true;
  }
);

// Select a point for editing
export const selectPointAtom = atom(
  null,
  (get, set, pointId: string | null) => {
    set(selectedPointIdAtom, pointId);
  }
);

// Clear mission selection
export const clearMissionSelectionAtom = atom(
  null,
  (get, set) => {
    set(selectedMissionIdAtom, null);
    set(editingMissionAtom, null);
    set(isEditingMissionAtom, false);
    set(selectedPointIdAtom, null);
  }
);