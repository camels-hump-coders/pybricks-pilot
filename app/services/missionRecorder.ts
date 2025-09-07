import { calculatePreviewPosition } from "../components/MovementPreview";
import type { StepCommand } from "../types/missionRecorder";
import type { RobotPosition } from "../utils/robotPosition";

type UpdateCallback = (
  missionId: string,
  checkpoints: RobotPosition[],
  steps: StepCommand[],
) => void;

class MissionRecorderService {
  private recording: {
    missionId: string;
    checkpoints: RobotPosition[];
    steps: StepCommand[];
    update: UpdateCallback;
  } | null = null;

  private listeners: (() => void)[] = [];

  start(
    missionId: string,
    startPosition: RobotPosition,
    update: UpdateCallback,
  ) {
    this.recording = {
      missionId,
      checkpoints: [startPosition],
      steps: [],
      update,
    };
    update(missionId, this.recording.checkpoints, this.recording.steps);
    this.notify();
  }

  stop() {
    this.recording = null;
    this.notify();
  }

  record(step: StepCommand) {
    if (!this.recording) return;
    const last =
      this.recording.checkpoints[this.recording.checkpoints.length - 1];
    const { missionId, checkpoints, steps, update } = this.recording;
    const direction =
      step.type === "drive"
        ? step.distance >= 0
          ? "forward"
          : "backward"
        : step.angle >= 0
          ? "right"
          : "left";
    const distance = step.type === "drive" ? Math.abs(step.distance) : 0;
    const angle = step.type === "turn" ? Math.abs(step.angle) : 0;
    const newPos = calculatePreviewPosition(
      last,
      distance,
      angle,
      step.type,
      direction as any,
    );

    const lastPos = checkpoints[checkpoints.length - 1];
    const samePlace =
      Math.hypot(newPos.x - lastPos.x, newPos.y - lastPos.y) < 1;
    if (samePlace) {
      // just update heading
      lastPos.heading = newPos.heading;
    } else {
      checkpoints.push(newPos);
    }
    steps.push(step);
    update(missionId, checkpoints, steps);
    this.notify();
  }

  getCheckpoints(): RobotPosition[] {
    return this.recording ? this.recording.checkpoints : [];
  }

  getSteps(): StepCommand[] {
    return this.recording ? this.recording.steps : [];
  }

  isRecording(): boolean {
    return this.recording !== null;
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export const missionRecorder = new MissionRecorderService();
