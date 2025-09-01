import { useEffect, useState } from "react";
import { missionRecorder } from "../services/missionRecorder";

interface MissionRecorderControlsProps {
  onDrive: (distance: number, speed: number) => Promise<void>;
  onTurn: (angle: number, speed: number) => Promise<void>;
}

export function MissionRecorderControls({
  onDrive,
  onTurn,
}: MissionRecorderControlsProps) {
  const [, forceUpdate] = useState(0);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");

  useEffect(() => {
    // Subscribe to recorder updates
    return missionRecorder.subscribe(() => forceUpdate((v) => v + 1));
  }, []);

  const missions = missionRecorder.getMissions();
  const isRecording = missionRecorder.isRecording();
  const stepCount = missionRecorder.getCurrentStepCount();

  const handleStart = () => {
    missionRecorder.start();
  };

  const handleSave = () => {
    missionRecorder.save(name || `Mission ${missions.length + 1}`);
    setName("");
  };

  const handlePlay = async () => {
    const mission = missions.find((m) => m.id === selected);
    if (mission) {
      await missionRecorder.play(mission, { drive: onDrive, turn: onTurn });
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Mission Recorder
      </div>
      {!isRecording ? (
        <button
          type="button"
          onClick={handleStart}
          className="px-3 py-1 text-xs bg-green-600 text-white rounded-md"
        >
          Start Recording
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mission name"
            className="flex-1 px-2 py-1 text-xs border rounded-md dark:bg-gray-700"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Steps: {stepCount}
          </span>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => missionRecorder.cancel()}
            className="px-3 py-1 text-xs bg-gray-600 text-white rounded-md"
          >
            Cancel
          </button>
        </div>
      )}
      {missions.length > 0 && !isRecording && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border rounded-md dark:bg-gray-700"
          >
            <option value="">Select mission</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handlePlay}
            disabled={!selected}
            className="px-3 py-1 text-xs bg-purple-600 text-white rounded-md disabled:opacity-50"
          >
            Play
          </button>
        </div>
      )}
    </div>
  );
}
