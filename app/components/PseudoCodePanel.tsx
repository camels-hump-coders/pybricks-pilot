import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import {
  type GeneratedProgram,
  pseudoCodeGenerator,
} from "../services/pseudoCodeGenerator.js";
import type { TelemetryPoint } from "../services/telemetryHistory.js";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { useNotifications } from "../hooks/useNotifications";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { normalizeHeading } from "../utils/headingUtils";

// Register python language once (module scope)
hljs.registerLanguage("python", python);

function HighlightedPython({ code }: { code: string }) {
  const html = hljs.highlight(code || "", { language: "python" }).value;
  return (
    <pre className="p-3 text-xs overflow-x-auto font-mono">
      <code
        className="hljs language-python"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: we need to for our pseudocode highlighting
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

interface PseudoCodePanelProps {
  telemetryPoints: TelemetryPoint[];
  isVisible: boolean;
  onToggle: () => void;
}

export function PseudoCodePanel({
  telemetryPoints,
  isVisible: _isVisible,
  onToggle: _onToggle,
}: PseudoCodePanelProps) {
  const [generatedProgram, setGeneratedProgram] =
    useState<GeneratedProgram | null>(null);
  const [latestGeneratedCode, setLatestGeneratedCode] = useState<string>("");
  const [editorCode, setEditorCode] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const { pythonFiles } = useJotaiFileSystem();
  const availableFiles = useMemo(() => pythonFiles ?? [], [pythonFiles]);
  const { uploadAndRunAdhocProgram, isConnected } = useJotaiRobotConnection();
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const { showError, addNotification } = useNotifications();

  // Generate pseudo code when telemetry points change
  useEffect(() => {
    if (telemetryPoints.length < 2) {
      // Clear when not enough telemetry to generate code (e.g., after Reset)
      setGeneratedProgram(null);
      setLatestGeneratedCode("");
      if (!isDirty) {
        setEditorCode("");
      }
      return;
    }

    // Use live preview to show current movement as it happens
    const program = pseudoCodeGenerator.generateLivePreview(telemetryPoints);

    setGeneratedProgram(program);

    const code = pseudoCodeGenerator.generateReadableCode(program);
    setLatestGeneratedCode(code);
    if (!isDirty) {
      setEditorCode(code);
    }
  }, [telemetryPoints, isDirty]);

  // Copy code to clipboard
  const copyToClipboard = async () => {
    try {
      const textToCopy = editorCode || latestGeneratedCode;
      await navigator.clipboard.writeText(textToCopy);
      // Could add a toast notification here
    } catch (err) {
      console.error("Failed to copy code to clipboard:", err);
    }
  };

  const handleEditorChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setEditorCode(next);
    setIsDirty(next !== latestGeneratedCode);
  };

  const handleResetToGenerated = () => {
    setEditorCode(latestGeneratedCode);
    setIsDirty(false);
  };

  const handleRunPseudoCode = async () => {
    if (!uploadAndRunAdhocProgram) {
      showError(
        "Robot not connected",
        "Connect to a real hub to run the generated pseudo code.",
      );
      return;
    }

    const content = editorCode || latestGeneratedCode;

    if (!content.trim()) {
      showError("Nothing to run", "Generate movements before running pseudo code.");
      return;
    }

    try {
      setIsUploading(true);
      await uploadAndRunAdhocProgram(
        "generated_pseudo.py",
        content,
        availableFiles,
      );
      addNotification({
        type: "success",
        title: "Pseudo code running",
        message: "Uploaded generated_pseudo.py to the connected hub.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError("Failed to run pseudo code", message);
    } finally {
      setIsUploading(false);
    }
  };

  const currentCode =
    isDirty || editorCode.length > 0 || latestGeneratedCode.length === 0
      ? editorCode
      : latestGeneratedCode;
  const canReset = Boolean(latestGeneratedCode) && editorCode !== latestGeneratedCode;
  const runDisabled =
    !uploadAndRunAdhocProgram ||
    !isConnected ||
    !currentCode.trim() ||
    isUploading ||
    isProgramRunning;
  const editButtonLabel = isEditing ? "👁 Preview" : "✏️ Edit";
  const runButtonLabel = isUploading ? "⏳ Running..." : "▶️ Run";
  const copyDisabled = !currentCode.trim();
  const showCustomCodeNotice = editorCode !== latestGeneratedCode;

  return (
    <div className="w-full bg-white dark:bg-gray-800">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={copyToClipboard}
          disabled={copyDisabled}
          className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📋 Copy
        </button>
        <button
          onClick={() => setIsEditing((prev) => !prev)}
          disabled={copyDisabled}
          className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {editButtonLabel}
        </button>
        <button
          onClick={handleResetToGenerated}
          disabled={!canReset}
          className="px-2 py-1 text-xs bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          ↺ Reset
        </button>
        <button
          onClick={handleRunPseudoCode}
          disabled={runDisabled}
          className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {runButtonLabel}
        </button>
        {(!isConnected || isProgramRunning) && (
          <div className="ml-auto flex items-center gap-2 text-xs">
            {!isConnected && (
              <span className="text-red-500">Connect to a hub to run code</span>
            )}
            {isProgramRunning && (
              <span className="text-yellow-600">
                Program running – stop it before uploading
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 max-h-96 overflow-y-auto">
        {!generatedProgram || generatedProgram.commands.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <div className="text-2xl mb-2">🤖</div>
            <p className="text-sm">
              {telemetryPoints.length < 2
                ? "No telemetry data available"
                : "No significant movements detected"}
            </p>
            <p className="text-xs mt-1">
              Run a program or move the robot manually to generate code
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded p-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Commands:
                  </span>
                  <span className="ml-2 font-medium">
                    {generatedProgram.commands.length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Distance:
                  </span>
                  <span className="ml-2 font-medium">
                    {generatedProgram.totalDistance.toFixed(1)}mm
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Time:
                  </span>
                  <span className="ml-2 font-medium">
                    {(generatedProgram.totalTime / 1000).toFixed(1)}s
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Points:
                  </span>
                  <span className="ml-2 font-medium">
                    {telemetryPoints.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Generated Code */}
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span>Generated Code:</span>
                {showCustomCodeNotice && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    Editing custom pseudo code
                  </span>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={currentCode}
                  onChange={handleEditorChange}
                  className="w-full h-64 p-2 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                  spellCheck={false}
                />
              ) : (
                <div className="rounded text-xs overflow-x-auto bg-gray-100 dark:bg-gray-900">
                  <HighlightedPython code={currentCode} />
                </div>
              )}
            </div>

            {/* Command List */}
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Command Details:
              </div>
              <div className="space-y-1">
                {generatedProgram.commands.map((command, index) => (
                  <div
                    key={`${index}-${command.type}-${command.distance ?? 0}-${command.targetHeading ?? 0}`}
                    className="text-xs p-2 rounded border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {command.type === "drive"
                          ? "🚗 Drive"
                          : command.type === "turn"
                            ? "🔄 Turn"
                            : "➿ Arc"}
                      </span>
                      <span className="text-gray-500">{`#${index + 1}`}</span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-300">
                      {command.type === "drive" ? (
                        <>
                          Distance: {command.distance?.toFixed(1)}mm
                          {command.targetHeading !== undefined && (
                            <span className="ml-2">
                              → Heading:{" "}
                              {normalizeHeading(command.targetHeading).toFixed(
                                1,
                              )}
                              °
                            </span>
                          )}
                        </>
                      ) : command.type === "turn" ? (
                        <>
                          Target:{" "}
                          {command.targetHeading !== undefined
                            ? normalizeHeading(command.targetHeading).toFixed(1)
                            : "N/A"}
                          °
                        </>
                      ) : (
                        <>
                          Radius: {command.radius?.toFixed(1)}mm
                          <span className="ml-2">
                            Angle: {(command.angle ?? 0).toFixed(1)}°
                          </span>
                          {command.distance !== undefined && (
                            <span className="ml-2">
                              Distance: {Math.abs(command.distance).toFixed(1)}mm
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {command.duration && (
                      <div className="text-gray-500 text-xs">
                        Duration: {(command.duration / 1000).toFixed(2)}s
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
