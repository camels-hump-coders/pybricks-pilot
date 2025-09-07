export type StepCommand =
  | { type: "drive"; distance: number; speed: number }
  | { type: "turn"; angle: number; speed: number };
