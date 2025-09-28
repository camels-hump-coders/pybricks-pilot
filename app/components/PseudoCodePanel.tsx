import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { useNotifications } from "../hooks/useNotifications";
import {
  type GeneratedProgram,
  pseudoCodeGenerator,
} from "../services/pseudoCodeGenerator.js";
import type { TelemetryPoint } from "../services/telemetryHistory.js";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { normalizeHeading } from "../utils/headingUtils";

type Disposable = { dispose: () => void };

type MonacoEditorInstance = {
  dispose: () => void;
  updateOptions: (options: Record<string, unknown>) => void;
  onDidChangeModelContent: (listener: () => void) => Disposable;
  getValue: () => string;
  setValue: (value: string) => void;
  getModel: () => { getFullModelRange: () => unknown } | null;
  pushUndoStop: () => void;
  executeEdits: (source: string, edits: Array<Record<string, unknown>>) => void;
  getSelection: () => unknown;
  setSelection: (selection: unknown) => void;
};

type MonacoInstance = {
  editor: {
    create: (
      container: HTMLElement,
      options: Record<string, unknown>,
    ) => MonacoEditorInstance;
    setTheme: (theme: string) => void;
  };
  languages: {
    registerCompletionItemProvider: (
      languageId: string,
      provider: {
        triggerCharacters?: string[];
        provideCompletionItems: () => {
          suggestions: Array<Record<string, unknown>>;
        };
      },
    ) => Disposable;
    CompletionItemKind: Record<string, number>;
    CompletionItemInsertTextRule: Record<string, number>;
  };
};

declare global {
  interface Window {
    require?: {
      config: (config: { paths: Record<string, string> }) => void;
      <T>(modules: string[], onLoad: (...modules: T[]) => void): void;
    };
    monaco?: MonacoInstance;
  }
}

const MONACO_BASE_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min";

let monacoLoaderPromise: Promise<MonacoInstance> | null = null;
let completionDisposable: Disposable | null = null;

async function loadMonaco(): Promise<MonacoInstance> {
  if (typeof window === "undefined") {
    throw new Error(
      "Monaco editor can only be loaded in a browser environment",
    );
  }

  if (window.monaco) {
    return window.monaco;
  }

  if (!monacoLoaderPromise) {
    monacoLoaderPromise = new Promise<MonacoInstance>((resolve, reject) => {
      const existingLoader = document.querySelector<HTMLScriptElement>(
        `script[data-origin="monaco-loader"]`,
      );

      const finalize = () => {
        if (window.require) {
          window.require.config({ paths: { vs: `${MONACO_BASE_URL}/vs` } });
          window.require(["vs/editor/editor.main"], () => {
            if (window.monaco) {
              resolve(window.monaco);
            } else {
              monacoLoaderPromise = null;
              reject(new Error("Monaco failed to initialize"));
            }
          });
        } else {
          monacoLoaderPromise = null;
          reject(new Error("Monaco AMD loader not available"));
        }
      };

      if (existingLoader) {
        finalize();
        return;
      }

      const script = document.createElement("script");
      script.src = `${MONACO_BASE_URL}/vs/loader.min.js`;
      script.async = true;
      script.dataset.origin = "monaco-loader";
      script.onload = finalize;
      script.onerror = () => {
        monacoLoaderPromise = null;
        reject(new Error("Failed to load Monaco loader script"));
      };
      document.body.append(script);
    });
  }

  return monacoLoaderPromise;
}

function registerHelperCompletions(monaco: MonacoInstance) {
  if (completionDisposable) {
    return;
  }

  const helperFunctions = [
    {
      label: "drive_straight",
      detail: "drive_straight(distance_mm: float)",
      documentation:
        "Drive straight for the specified distance in millimeters.",
      insertText: "await drive_straight(${1:distance_mm})",
    },
    {
      label: "drive_arc",
      detail: "drive_arc(radius_mm: float, angle_deg: float)",
      documentation:
        "Drive an arc with the provided radius (mm) and angle (degrees).",
      insertText: "await drive_arc(${1:radius_mm}, ${2:angle_deg})",
    },
    {
      label: "turn_to_heading",
      detail: "turn_to_heading(target_heading_deg: float)",
      documentation:
        "Turn in place until the hub reaches the desired absolute heading.",
      insertText: "await turn_to_heading(${1:heading_deg})",
    },
    {
      label: "reset_heading_reference",
      detail: "reset_heading_reference()",
      documentation:
        "Recalibrate the helper functions so heading 0 aligns with the current IMU reading.",
      insertText: "reset_heading_reference()",
    },
    {
      label: "run_motor_angle",
      detail:
        "run_motor_angle(motor_name: str, angle_deg: float, speed_deg_per_sec: float = 180)",
      documentation:
        "Rotate a registered motor by the requested angle at an optional speed.",
      insertText:
        'await run_motor_angle("${1:motor_name}", ${2:angle_deg}, speed=${3:speed_deg_per_sec})',
    },
    {
      label: "run_motor_speed",
      detail:
        "run_motor_speed(motor_name: str, speed_deg_per_sec: float, duration_ms: int | None = None)",
      documentation:
        "Spin a motor at a target speed, optionally stopping after a duration.",
      insertText:
        'await run_motor_speed("${1:motor_name}", ${2:speed_deg_per_sec}, duration_ms=${3:duration_ms})',
    },
    {
      label: "stop_motor",
      detail: 'stop_motor(motor_name: str, stop_behavior: str = "hold")',
      documentation:
        "Stop a registered motor using the selected stop behavior (hold, brake, coast).",
      insertText: 'await stop_motor("${1:motor_name}")',
    },
  ];

  completionDisposable = monaco.languages.registerCompletionItemProvider(
    "python",
    {
      triggerCharacters: ["_", "d", "r", "t"],
      provideCompletionItems: () => ({
        suggestions: helperFunctions.map((fn) => ({
          label: fn.label,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: fn.detail,
          documentation: fn.documentation,
          insertText: fn.insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        })),
      }),
    },
  );
}

interface MonacoCodeEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  readOnly: boolean;
  height: number;
  isDarkMode: boolean;
}

function MonacoCodeEditor({
  value,
  onChange,
  readOnly,
  height,
  isDarkMode,
}: MonacoCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<MonacoInstance | null>(null);
  const disposablesRef = useRef<Disposable[]>([]);
  const applyingChangeRef = useRef(false);
  const latestValueRef = useRef(value);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    let isMounted = true;

    loadMonaco()
      .then((monaco) => {
        if (!isMounted || !containerRef.current) {
          return;
        }

        monacoRef.current = monaco;
        registerHelperCompletions(monaco);

        const editor = monaco.editor.create(containerRef.current, {
          value: latestValueRef.current,
          language: "python",
          automaticLayout: true,
          fontSize: 12,
          minimap: { enabled: false },
          readOnly,
          wordWrap: "on",
          renderLineHighlight: "all",
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        });

        monaco.editor.setTheme(isDarkMode ? "vs-dark" : "vs");

        editorRef.current = editor;

        const changeDisposable = editor.onDidChangeModelContent(() => {
          if (applyingChangeRef.current) {
            return;
          }
          const nextValue = editor.getValue();
          latestValueRef.current = nextValue;
          onChange(nextValue);
        });

        disposablesRef.current.push(changeDisposable);
      })
      .catch((error) => {
        console.error("Failed to initialize Monaco editor", error);
      });

    return () => {
      isMounted = false;
      disposablesRef.current.forEach((disposable) => {
        disposable.dispose();
      });
      disposablesRef.current = [];
      editorRef.current?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const monaco = monacoRef.current;
    if (monaco) {
      monaco.editor.setTheme(isDarkMode ? "vs-dark" : "vs");
    }
  }, [isDarkMode]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.updateOptions({ readOnly });
  }, [readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const current = editor.getValue();
    if (value === current) {
      return;
    }

    applyingChangeRef.current = true;
    const model = editor.getModel();
    const selection = editor.getSelection?.();
    if (model && typeof editor.executeEdits === "function") {
      const fullRange = (
        model as { getFullModelRange: () => unknown }
      ).getFullModelRange();
      editor.executeEdits("external-update", [
        {
          range: fullRange,
          text: value,
        },
      ]);
      if (typeof editor.pushUndoStop === "function") {
        editor.pushUndoStop();
      }
    } else {
      editor.setValue(value);
    }
    if (selection && editor.setSelection) {
      editor.setSelection(selection);
    }
    applyingChangeRef.current = false;
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ height }}
      data-testid="pseudo-code-editor"
    />
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
  const latestGeneratedCodeRef = useRef("");
  const [editorCode, setEditorCode] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editorHeight, setEditorHeight] = useState(320);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const isDraggingHandle = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(320);

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
      latestGeneratedCodeRef.current = "";
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
    latestGeneratedCodeRef.current = code;
    if (!isEditing) {
      setIsDirty(false);
      setEditorCode(code);
      return;
    }

    if (!isDirty) {
      setEditorCode(code);
    }
  }, [telemetryPoints, isDirty, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setIsDirty(false);
      setEditorCode(latestGeneratedCodeRef.current);
    }
  }, [isEditing]);

  useEffect(() => {
    latestGeneratedCodeRef.current = latestGeneratedCode;
  }, [latestGeneratedCode]);

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

  const handleEditorChange = useCallback(
    (value: string) => {
      setEditorCode(value);
      if (isEditing) {
        setIsDirty(value !== latestGeneratedCodeRef.current);
      }
    },
    [isEditing],
  );

  const handleResetToGenerated = () => {
    setEditorCode(latestGeneratedCodeRef.current);
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
      showError(
        "Nothing to run",
        "Generate movements before running pseudo code.",
      );
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

  const currentCode = isEditing
    ? editorCode
    : latestGeneratedCode || editorCode;
  const canReset =
    Boolean(latestGeneratedCode) &&
    (isDirty || editorCode !== latestGeneratedCode);
  const runDisabled =
    !uploadAndRunAdhocProgram ||
    !isConnected ||
    !currentCode.trim() ||
    isUploading ||
    isProgramRunning;
  const editButtonLabel = isEditing ? "👁 Preview" : "✏️ Edit";
  const runButtonLabel = isUploading ? "⏳ Running..." : "▶️ Run";
  const copyDisabled = !currentCode.trim();
  const showCustomCodeNotice = isDirty;
  const editorMinHeight = 220;
  const editorMaxHeight = 720;

  const handleResizePointerMove = useCallback((event: PointerEvent) => {
    const delta = event.clientY - dragStartY.current;
    const nextHeight = Math.min(
      Math.max(dragStartHeight.current + delta, editorMinHeight),
      editorMaxHeight,
    );
    setEditorHeight(nextHeight);
  }, []);

  const stopDragging = useCallback(() => {
    isDraggingHandle.current = false;
    window.removeEventListener("pointermove", handleResizePointerMove);
    window.removeEventListener("pointerup", stopDragging);
  }, [handleResizePointerMove]);

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      isDraggingHandle.current = true;
      dragStartY.current = event.clientY;
      dragStartHeight.current = editorHeight;
      window.addEventListener("pointermove", handleResizePointerMove);
      window.addEventListener("pointerup", stopDragging);
    },
    [editorHeight, handleResizePointerMove, stopDragging],
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const root = document.documentElement;
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const updateTheme = () => {
        setIsDarkMode(root.classList.contains("dark") || mediaQuery.matches);
      };

      updateTheme();

      const observer = new MutationObserver(updateTheme);
      observer.observe(root, { attributes: true, attributeFilter: ["class"] });

      const mediaListener = (event: MediaQueryListEvent) => {
        if (!root.classList.contains("dark")) {
          setIsDarkMode(event.matches);
        }
      };
      mediaQuery.addEventListener("change", mediaListener);

      return () => {
        observer.disconnect();
        mediaQuery.removeEventListener("change", mediaListener);
      };
    }
  }, []);

  useEffect(() => {
    return () => {
      if (isDraggingHandle.current) {
        window.removeEventListener("pointermove", handleResizePointerMove);
        window.removeEventListener("pointerup", stopDragging);
      }
    };
  }, [handleResizePointerMove, stopDragging]);

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
      <div className="p-3 space-y-3">
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
              <div
                className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 flex flex-col"
                style={{ height: `${editorHeight + 12}px` }}
              >
                <MonacoCodeEditor
                  value={currentCode}
                  onChange={handleEditorChange}
                  readOnly={!isEditing}
                  height={editorHeight}
                  isDarkMode={isDarkMode}
                />
                <div
                  role="presentation"
                  className="h-2 cursor-row-resize bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-300 select-none"
                  onPointerDown={handleResizePointerDown}
                >
                  ⇳
                </div>
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
                              Distance: {Math.abs(command.distance).toFixed(1)}
                              mm
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
