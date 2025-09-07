import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import { useEffect, useState } from "react";
import {
  type GeneratedProgram,
  pseudoCodeGenerator,
} from "../services/pseudoCodeGenerator.js";
import type { TelemetryPoint } from "../services/telemetryHistory.js";
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
              <div className="rounded text-xs overflow-x-auto bg-gray-100 dark:bg-gray-900">
                <HighlightedPython code={readableCode} />
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
                                1,
                              )}
                              °
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          Target:{" "}
                          {command.targetHeading !== undefined
                            ? normalizeHeading(command.targetHeading).toFixed(1)
                            : "N/A"}
                          °
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
