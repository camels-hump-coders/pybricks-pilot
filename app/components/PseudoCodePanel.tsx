import { useEffect, useState } from "react";
import {
  pseudoCodeGenerator,
  type GeneratedProgram,
} from "../services/pseudoCodeGenerator.js";
import type { TelemetryPoint } from "../services/telemetryHistory.js";
import { normalizeHeading } from "../utils/headingUtils";

// Python syntax highlighting component
function PythonCodeBlock({ code }: { code: string }) {
  const highlightPython = (code: string) => {
    return code.split("\n").map((line, index) => {
      // Handle comments
      if (line.trim().startsWith("//")) {
        return (
          <div key={index} className="text-gray-400 italic">
            {line}
          </div>
        );
      }

      // Handle function calls
      if (line.includes("straight(") || line.includes("turn_to_heading(")) {
        // Split the line into parts for highlighting
        const funcMatch = line.match(/(straight|turn_to_heading)\(/);
        if (funcMatch) {
          const funcName = funcMatch[1];
          const funcIndex = funcMatch.index!;
          const beforeFunc = line.slice(0, funcIndex);
          const afterFunc = line.slice(funcIndex + funcName.length + 1);

          // Parse the afterFunc part to highlight numbers and units
          const parts = [];
          let currentText = afterFunc;

          // Find and highlight numbers with units
          const numberMatch = currentText.match(/(\d+\.?\d*)(mm|°)/);
          if (numberMatch) {
            const beforeNum = currentText.slice(0, numberMatch.index);
            const num = numberMatch[1];
            const unit = numberMatch[2];
            const afterNum = currentText.slice(
              numberMatch.index! + numberMatch[0].length
            );

            parts.push(
              <span key="before" className="text-white">
                {beforeNum}
              </span>,
              <span key="number" className="text-green-400">
                {num}
                {unit}
              </span>,
              <span key="after" className="text-white">
                {afterNum}
              </span>
            );
          } else {
            parts.push(
              <span key="text" className="text-white">
                {afterFunc}
              </span>
            );
          }

          return (
            <div key={index} className="text-blue-400">
              {beforeFunc}
              <span className="text-yellow-400">{funcName}</span>
              <span className="text-white">(</span>
              {parts}
            </div>
          );
        }
      }

      // Handle empty lines
      if (line.trim() === "") {
        return <div key={index}>&nbsp;</div>;
      }

      // Default case
      return (
        <div key={index} className="text-white">
          {line}
        </div>
      );
    });
  };

  return <pre className="p-3 text-xs">{highlightPython(code)}</pre>;
}

interface PseudoCodePanelProps {
  telemetryPoints: TelemetryPoint[];
  isVisible: boolean;
  onToggle: () => void;
}

export function PseudoCodePanel({
  telemetryPoints,
  isVisible,
  onToggle,
}: PseudoCodePanelProps) {
  const [generatedProgram, setGeneratedProgram] =
    useState<GeneratedProgram | null>(null);
  const [readableCode, setReadableCode] = useState<string>("");

  // Generate pseudo code when telemetry points change
  useEffect(() => {
    if (telemetryPoints.length < 2) {
      return;
    }

    // Use live preview to show current movement as it happens
    const program = pseudoCodeGenerator.generateLivePreview(telemetryPoints);

    setGeneratedProgram(program);

    const code = pseudoCodeGenerator.generateReadableCode(program);
    setReadableCode(code);
  }, [telemetryPoints]);

  // Copy code to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(readableCode);
      // Could add a toast notification here
    } catch (err) {
      console.error("Failed to copy code to clipboard:", err);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-gray-800">
      {/* Controls */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={copyToClipboard}
          disabled={!readableCode || readableCode === "// No movement detected"}
          className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📋 Copy
        </button>
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
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Generated Code:
              </div>
              <div className="bg-gray-900 rounded text-xs overflow-x-auto">
                <PythonCodeBlock code={readableCode} />
              </div>
            </div>

            {/* Command List */}
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Command Details:
              </div>
              <div className="space-y-1">
                {generatedProgram.commands.map((command, index) => (
                  <div
                    key={index}
                    className="text-xs p-2 rounded border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {command.type === "drive" ? "🚗 Drive" : "🔄 Turn"}
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
                                1
                              )}
                              °
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          Target:{" "}
                          {normalizeHeading(command.targetHeading!).toFixed(1)}°
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
