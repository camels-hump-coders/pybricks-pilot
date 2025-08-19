import { useEffect, useRef, useState } from "react";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";

interface DebugPanelProps {
  isVisible: boolean;
  onToggle: () => void;
}

export function DebugPanel({ isVisible, onToggle }: DebugPanelProps) {
  const {
    hubInfo,
    programStatus,
    isConnected,
    debugEvents,
    clearDebugEvents,
    setInstrumentationEnabled,
    setInstrumentationOptions,
    getInstrumentationOptions,
  } = useJotaiRobotConnection();
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [showInstrumentationSettings, setShowInstrumentationSettings] =
    useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current && debugEvents.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [debugEvents]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "connection":
        return "text-blue-600 dark:text-blue-400";
      case "upload":
        return "text-green-600 dark:text-green-400";
      case "program":
        return "text-purple-600 dark:text-purple-400";
      case "status":
        return "text-yellow-600 dark:text-yellow-400";
      case "command":
        return "text-indigo-600 dark:text-indigo-400";
      case "error":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "connection":
        return "🔗";
      case "upload":
        return "📤";
      case "program":
        return "▶️";
      case "status":
        return "ℹ️";
      case "command":
        return "⚡";
      case "error":
        return "❌";
      default:
        return "📝";
    }
  };

  const toggleEventExpansion = (index: number) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEvents(newExpanded);
  };

  const formatDetails = (details: Record<string, unknown>) => {
    const formatted: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === "object" && value !== null) {
        formatted[key] = JSON.stringify(value, null, 2);
      } else {
        formatted[key] = String(value);
      }
    }
    return formatted;
  };

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 bg-gray-800 dark:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors z-40"
      >
        Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-96 h-96 bg-white dark:bg-gray-800 border-l border-t border-gray-300 dark:border-gray-600 shadow-lg z-40 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 dark:bg-gray-900 text-white px-3 py-2 flex justify-between items-center">
        <span className="font-medium">Debug Panel</span>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setShowInstrumentationSettings(!showInstrumentationSettings)
            }
            className="text-sm bg-gray-700 dark:bg-gray-600 px-2 py-1 rounded hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
            title="Toggle instrumentation settings"
          >
            🔧
          </button>
          <button
            onClick={clearDebugEvents}
            className="text-sm bg-gray-700 dark:bg-gray-600 px-2 py-1 rounded hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onToggle}
            className="text-white hover:text-gray-300 dark:hover:text-gray-400 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className="bg-gray-50 dark:bg-gray-700 p-2 border-b border-gray-200 dark:border-gray-600">
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>Status:</span>
            <span
              className={
                isConnected
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          {hubInfo && (
            <div className="flex justify-between">
              <span>Hub:</span>
              <span className="text-gray-800 dark:text-gray-200">
                {hubInfo.name}
              </span>
            </div>
          )}
          {programStatus.statusFlags && (
            <div className="flex justify-between">
              <span>Program:</span>
              <span
                className={
                  programStatus.running
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-500 dark:text-gray-400"
                }
              >
                {programStatus.running ? "Running" : "Stopped"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Instrumentation Settings */}
      {showInstrumentationSettings && (
        <div className="bg-blue-50 dark:bg-blue-900 p-2 border-b border-blue-200 dark:border-blue-700">
          <div className="text-xs space-y-2">
            <div className="font-medium text-blue-700 dark:text-blue-300 mb-2">
              🔧 PybricksPilot Settings
            </div>

            <div className="flex items-center justify-between">
              <span>Auto-Instrumentation:</span>
              <button
                onClick={() => {
                  const options = getInstrumentationOptions?.();
                  if (options && setInstrumentationEnabled) {
                    setInstrumentationEnabled(
                      !(options.enableTelemetry && options.enableRemoteControl),
                    );
                  }
                }}
                className={`text-xs px-2 py-1 rounded ${
                  getInstrumentationOptions?.()?.enableTelemetry
                    ? "bg-green-600 text-white"
                    : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                }`}
              >
                {getInstrumentationOptions?.()?.enableTelemetry ? "ON" : "OFF"}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span>Telemetry Interval:</span>
              <select
                value={getInstrumentationOptions?.()?.telemetryInterval || 100}
                onChange={(e) => {
                  if (setInstrumentationOptions) {
                    setInstrumentationOptions({
                      telemetryInterval: parseInt(e.target.value, 10),
                    });
                  }
                }}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value={50}>50ms</option>
                <option value={100}>100ms</option>
                <option value={250}>250ms</option>
                <option value={500}>500ms</option>
                <option value={1000}>1s</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span>Auto-Detect Hardware:</span>
              <button
                onClick={() => {
                  const current =
                    getInstrumentationOptions?.()?.autoDetectHardware;
                  if (setInstrumentationOptions && current !== undefined) {
                    setInstrumentationOptions({ autoDetectHardware: !current });
                  }
                }}
                className={`text-xs px-2 py-1 rounded ${
                  getInstrumentationOptions?.()?.autoDetectHardware
                    ? "bg-green-600 text-white"
                    : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                }`}
              >
                {getInstrumentationOptions?.()?.autoDetectHardware
                  ? "ON"
                  : "OFF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Logs */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 text-xs">
        {debugEvents.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center mt-8">
            No debug logs yet
          </div>
        ) : (
          <div className="space-y-1">
            {debugEvents.map((event, index) => {
              const isExpanded = expandedEvents.has(index);
              const hasDetails =
                event.details && Object.keys(event.details).length > 0;

              return (
                <div
                  key={index}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div
                    className={`flex items-start gap-2 ${hasDetails ? "cursor-pointer" : ""}`}
                    onClick={() => hasDetails && toggleEventExpansion(index)}
                  >
                    <span className="text-gray-400 dark:text-gray-500 text-[10px] min-w-[60px] font-mono">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span
                      className={`text-[10px] min-w-[12px] ${getTypeColor(event.type)}`}
                    >
                      {getTypeIcon(event.type)}
                    </span>
                    <span
                      className={`font-medium text-[10px] min-w-[60px] ${getTypeColor(event.type)}`}
                    >
                      {event.type.toUpperCase()}
                    </span>
                    <span className="text-gray-800 dark:text-gray-200 text-[10px] flex-1">
                      {event.message}
                    </span>
                    {hasDetails && (
                      <span
                        className={`text-gray-400 dark:text-gray-500 text-[10px] transition-transform ${
                          isExpanded ? "rotate-90" : "rotate-0"
                        }`}
                      >
                        ▶
                      </span>
                    )}
                  </div>

                  {hasDetails && isExpanded && (
                    <div className="mt-2 ml-[134px] text-[9px] text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600">
                      <div className="font-mono space-y-1">
                        {Object.entries(formatDetails(event.details!)).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="border-b border-gray-200 dark:border-gray-600 pb-1 last:border-b-0"
                            >
                              <div className="text-gray-500 dark:text-gray-400 font-semibold mb-1">
                                {key}:
                              </div>
                              <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                                {value.length > 500
                                  ? `${value.slice(0, 500)}...`
                                  : value}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
