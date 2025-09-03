export type StepCommand =
  | { type: "drive"; distance: number; speed: number }
  | { type: "turn"; angle: number; speed: number };

export interface RecordedMission {
  id: string;
  name: string;
  created: string;
  steps: StepCommand[];
}

/**
 * Simple service for recording and replaying manual step commands as missions.
 */
class MissionRecorderService {
  private missions: RecordedMission[] = [];
  private recordingSteps: StepCommand[] | null = null;
  private listeners: (() => void)[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("missions");
        if (stored) {
          this.missions = JSON.parse(stored);
        }
      } catch {
        // ignore
      }
    }
  }

  /** Start a new recording session */
  start() {
    this.recordingSteps = [];
    this.notify();
  }

  /** Stop current recording and save mission */
  save(name: string): RecordedMission | null {
    if (!this.recordingSteps) return null;
    const mission: RecordedMission = {
      id: `mission-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      created: new Date().toISOString(),
      steps: this.recordingSteps,
    };
    this.missions.push(mission);
    this.persist();
    this.recordingSteps = null;
    this.notify();
    return mission;
  }

  /** Cancel current recording */
  cancel() {
    this.recordingSteps = null;
    this.notify();
  }

  /** Add a step if recording */
  record(step: StepCommand) {
    if (this.recordingSteps) {
      this.recordingSteps.push(step);
      this.notify();
    }
  }

  /** Get missions */
  getMissions(): RecordedMission[] {
    return this.missions;
  }

  /** Get current step count */
  getCurrentStepCount(): number {
    return this.recordingSteps ? this.recordingSteps.length : 0;
  }

  /** Whether recording is active */
  isRecording(): boolean {
    return this.recordingSteps !== null;
  }

  /** Replay mission using provided callbacks */
  async play(
    mission: RecordedMission,
    handlers: {
      drive: (distance: number, speed: number) => Promise<void>;
      turn: (angle: number, speed: number) => Promise<void>;
    },
  ) {
    for (const step of mission.steps) {
      if (step.type === "drive") {
        await handlers.drive(step.distance, step.speed);
      } else if (step.type === "turn") {
        await handlers.turn(step.angle, step.speed);
      }
    }
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

  private persist() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("missions", JSON.stringify(this.missions));
      } catch {
        // ignore
      }
    }
  }
}

export const missionRecorder = new MissionRecorderService();
