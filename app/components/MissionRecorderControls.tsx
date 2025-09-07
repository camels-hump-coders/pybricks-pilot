import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { missionRecorder } from "../services/missionRecorder";
import { robotPositionAtom } from "../store/atoms/gameMat";
import {
  addMissionAtom,
  missionsAtom,
  updateMissionAtom,
} from "../store/atoms/missionPlanner";
import type { StepCommand } from "../types/missionRecorder";
import type { RobotPosition } from "../utils/robotPosition";

interface MissionRecorderControlsProps {
  onDrive: (distance: number, speed: number) => Promise<void>;
  onTurn: (angle: number, speed: number) => Promise<void>;
}

export function MissionRecorderControls({
  onDrive,
  onTurn,
}: MissionRecorderControlsProps) {
  const [, forceUpdate] = useState(0);
  const missions = useAtomValue(missionsAtom);
  const addMission = useSetAtom(addMissionAtom);
  const updateMission = useSetAtom(updateMissionAtom);
  const currentPosition = useAtomValue(robotPositionAtom);
  const [selectedId, setSelectedId] = useState<string>("");
  const [newName, setNewName] = useState("");

  useEffect(
    () => missionRecorder.subscribe(() => forceUpdate((v) => v + 1)),
    [],
  );

  const isRecording = missionRecorder.isRecording();
  const checkpoints = missionRecorder.getCheckpoints();

  const handleStart = () => {
    let missionId = selectedId;
    if (!missionId && newName) {
      const mission = addMission({
        name: newName,
        description: "",
        points: [],
        segments: [],
        defaultArcRadius: 100,
        steps: [],
      });
      missionId = mission.id;
      setSelectedId(mission.id);
    }
    if (!missionId) return;
    missionRecorder.start(missionId, currentPosition, handleUpdate);
  };

  const handleStop = () => {
    missionRecorder.stop();
  };

  const handleUpdate = (
    missionId: string,
    points: RobotPosition[],
    steps: StepCommand[],
  ) => {
    const missionPoints = points.map((p, idx) => ({
      id: `cp-${idx}`,
      type: "action" as const,
      x: p.x,
      y: p.y,
      heading: p.heading,
    }));
    const segments = missionPoints.slice(1).map((pt, i) => ({
      fromPoint: missionPoints[i],
      toPoint: pt,
    }));
    updateMission(missionId, { points: missionPoints, segments, steps });
  };

  const handlePlay = async () => {
    const mission = missions.find((m) => m.id === selectedId);
    if (!mission?.steps) return;
    for (const step of mission.steps) {
      if (step.type === "drive") {
        await onDrive(step.distance, step.speed);
      } else {
        await onTurn(step.angle, step.speed);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Mission Recorder
      </div>
      {!isRecording ? (
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border rounded-md dark:bg-gray-700"
          >
            <option value="">Select mission</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Or new mission"
            className="flex-1 px-2 py-1 text-xs border rounded-md dark:bg-gray-700"
          />
          <button
            type="button"
            onClick={handleStart}
            className="px-3 py-1 text-xs bg-green-600 text-white rounded-md"
          >
            Start
          </button>
          <button
            type="button"
            onClick={handlePlay}
            disabled={!selectedId}
            className="px-3 py-1 text-xs bg-purple-600 text-white rounded-md disabled:opacity-50"
          >
            Play
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Checkpoints: {checkpoints.length}
          </span>
          <button
            type="button"
            onClick={handleStop}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md"
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
}
