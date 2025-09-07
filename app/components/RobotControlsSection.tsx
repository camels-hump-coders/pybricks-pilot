import { useAtom } from "jotai";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { movementPreviewAtom } from "../store/atoms/gameMat";
import type { PythonFile } from "../types/fileSystem";
import type { StepCommand } from "../types/missionRecorder";
import { CompactRobotController } from "./CompactRobotController";

interface RobotControlsSectionProps {
  onUploadAndRunFile?: (
    file: PythonFile,
    content: string,
    allPrograms: PythonFile[],
  ) => Promise<void>;
  onExecuteCommandSequence?: (commands: StepCommand[]) => Promise<void>;
}

export function RobotControlsSection({
  onUploadAndRunFile,
  onExecuteCommandSequence,
}: RobotControlsSectionProps) {
  const [, setMovementPreview] = useAtom(movementPreviewAtom);
  const robot = useJotaiRobotConnection();
  return (
    <div className="space-y-4">
      <CompactRobotController
        onDriveCommand={robot.sendDriveCommand}
        onTurnCommand={robot.sendTurnCommand}
        onStopCommand={robot.sendStopCommand}
        onContinuousDriveCommand={robot.sendContinuousDriveCommand}
        onMotorCommand={robot.sendMotorCommand}
        onContinuousMotorCommand={robot.sendContinuousMotorCommand}
        onMotorStopCommand={robot.sendMotorStopCommand}
        onExecuteCommandSequence={onExecuteCommandSequence}
        telemetryData={robot.telemetryData ?? undefined}
        isConnected={robot.isConnected}
        robotType={robot.robotType}
        onResetTelemetry={robot.resetTelemetry}
        onStopProgram={robot.stopProgram}
        onUploadAndRunFile={onUploadAndRunFile}
        onPreviewUpdate={(preview) => setMovementPreview(preview)}
      />
    </div>
  );
}
