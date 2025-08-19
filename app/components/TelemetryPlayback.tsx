import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ColorMode,
  type TelemetryPoint,
  telemetryHistory,
} from "../services/telemetryHistory";
import {
  hideGhostRobotAtom,
  updateGhostRobotAtom,
} from "../store/atoms/ghostPosition";
import {
  allTelemetryPointsAtom,
  colorModeAtom,
  currentTelemetryPathAtom,
  selectedPathPointsAtom,
  selectedTelemetryPathAtom,
  telemetryPathsAtom,
  telemetryTotalDurationAtom,
  updateTelemetryDataAtom,
} from "../store/atoms/telemetryPoints";
import { TelemetryTooltip } from "./TelemetryTooltip";

type TelemetryPlaybackProps = {};

interface TimeWindow {
  start: number; // Start time in ms (relative to first point)
  end: number; // End time in ms (relative to first point)
}

export function TelemetryPlayback(_props: TelemetryPlaybackProps) {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false); // Track if user has interacted

  // Timeline state
  const [timeWindow, setTimeWindow] = useState<TimeWindow>({
    start: 0,
    end: 0,
  });
  const [selectedPoint] = useState<TelemetryPoint | null>(null);

  // Path visualization state from atom
  const [colorMode, setColorMode] = useAtom(colorModeAtom);

  // Telemetry data from atoms
  const allPoints = useAtomValue(allTelemetryPointsAtom);
  const selectedPoints = useAtomValue(selectedPathPointsAtom);
  const selectedPathId = useAtomValue(selectedTelemetryPathAtom);
  const setSelectedPathId = useSetAtom(selectedTelemetryPathAtom);
  const allPaths = useAtomValue(telemetryPathsAtom);
  const currentPath = useAtomValue(currentTelemetryPathAtom);
  const totalDuration = useAtomValue(telemetryTotalDurationAtom);
  const updateTelemetryData = useSetAtom(updateTelemetryDataAtom);

  // Ghost position atoms
  const updateGhostRobot = useSetAtom(updateGhostRobotAtom);
  const hideGhostRobot = useSetAtom(hideGhostRobotAtom);

  // Set up callback for telemetry service to auto-select new paths
  useEffect(() => {
    const handlePathSelection = (pathId: string | null) => {
      setSelectedPathId(pathId);
    };

    telemetryHistory.setSelectedPathChangeCallback(handlePathSelection);

    return () => {
      telemetryHistory.removeSelectedPathChangeCallback();
    };
  }, [setSelectedPathId]);

  // Sync telemetry data from service to atoms
  useEffect(() => {
    const syncTelemetryData = () => {
      const paths = telemetryHistory.getAllPaths();
      const currentPath = telemetryHistory.getCurrentPath();

      updateTelemetryData({ paths, currentPath });
    };

    // Initial sync
    syncTelemetryData();

    // Set up interval to periodically sync (useful for real-time updates)
    const interval = setInterval(syncTelemetryData, 100);

    return () => {
      clearInterval(interval);
    };
  }, [updateTelemetryData]);

  // Local state for windowed data
  const [windowedPoints, setWindowedPoints] = useState<TelemetryPoint[]>([]);

  // Animation refs
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartPositionRef = useRef<number>(0);

  // Timeline interaction refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const windowTimelineRef = useRef<HTMLDivElement>(null);
  const isDraggingTimeline = useRef(false);
  const isDraggingWindowStart = useRef(false);
  const isDraggingWindowEnd = useRef(false);

  // Tooltip state
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryPoint | null>(null);

  // Auto-window: Always keep window spanning from first to last telemetry point
  useEffect(() => {
    if (totalDuration > 0) {
      setTimeWindow({ start: 0, end: totalDuration });
    }
  }, [totalDuration]);

  // Update windowed points when time window changes
  useEffect(() => {
    const pointsToUse = selectedPoints.length > 0 ? selectedPoints : allPoints;
    if (pointsToUse.length === 0) return;

    const firstTime = pointsToUse[0].timestamp;
    const windowStartTime = firstTime + timeWindow.start;
    const windowEndTime = firstTime + timeWindow.end;

    const windowed = pointsToUse.filter(
      (point) =>
        point.timestamp >= windowStartTime && point.timestamp <= windowEndTime,
    );

    setWindowedPoints(windowed);

    // Reset current time if it's outside the window
    if (currentTime < 0 || currentTime > timeWindow.end - timeWindow.start) {
      setCurrentTime(0);
    }
  }, [timeWindow, selectedPoints, allPoints, currentTime]);

  // Find the current point based on playback time - stabilized with useMemo
  const getCurrentPoint = useMemo(
    () =>
      (time: number): TelemetryPoint | null => {
        if (windowedPoints.length === 0) return null;

        const pointsToUse =
          selectedPoints.length > 0 ? selectedPoints : allPoints;
        const windowStartTime = pointsToUse[0]?.timestamp + timeWindow.start;
        const targetTime = windowStartTime + time;

        // Find the point closest to the target time
        let closestPoint = windowedPoints[0];
        let closestDiff = Math.abs(windowedPoints[0].timestamp - targetTime);

        for (const point of windowedPoints) {
          const diff = Math.abs(point.timestamp - targetTime);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestPoint = point;
          }
        }

        return closestPoint;
      },
    [windowedPoints, timeWindow, selectedPoints, allPoints],
  );

  // Update ghost position based on current time (only if playback has started)
  useEffect(() => {
    // Always hide ghost when at start position (time 0) or playback hasn't started
    if (currentTime === 0 || !hasStartedPlayback) {
      hideGhostRobot();
      return;
    }

    const point = selectedPoint || getCurrentPoint(currentTime);

    if (point) {
      updateGhostRobot({
        position: {
          x: point.x,
          y: point.y,
          heading: point.heading,
        },
        isVisible: true,
      });
    } else {
      hideGhostRobot();
    }
  }, [
    currentTime,
    selectedPoint,
    getCurrentPoint,
    updateGhostRobot,
    hideGhostRobot,
    hasStartedPlayback,
  ]);

  // Playback animation
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
        playbackStartTimeRef.current = timestamp;
        playbackStartPositionRef.current = currentTime;
      }

      const elapsed = timestamp - playbackStartTimeRef.current;
      // Convert playback speed: 1x = real time, 2x = double speed, etc.
      const newTime =
        playbackStartPositionRef.current + elapsed * playbackSpeed;
      const windowDuration = timeWindow.end - timeWindow.start;

      if (newTime >= windowDuration) {
        // Stop at the end instead of looping
        setCurrentTime(windowDuration);
        setIsPlaying(false); // Stop playback when reaching the end
      } else {
        setCurrentTime(newTime);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, timeWindow, currentTime]);

  // Timeline mouse handlers
  const handleTimelineMouseDown = (
    e: React.MouseEvent,
    target: "timeline" | "windowStart" | "windowEnd",
  ) => {
    e.preventDefault();

    if (target === "timeline") {
      isDraggingTimeline.current = true;
      handleTimelineClick(e);
    } else if (target === "windowStart") {
      isDraggingWindowStart.current = true;
    } else if (target === "windowEnd") {
      isDraggingWindowEnd.current = true;
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const windowDuration = timeWindow.end - timeWindow.start;
    const newTime = windowDuration * percentage;

    lastFrameTimeRef.current = 0;
    setCurrentTime(newTime);
    setIsPlaying(false);
    setHasStartedPlayback(true); // Show ghost when user scrubs
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDraggingTimeline.current && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const windowDuration = timeWindow.end - timeWindow.start;
      const newTime = windowDuration * percentage;
      setCurrentTime(newTime);
      setHasStartedPlayback(true);
    } else if (
      (isDraggingWindowStart.current || isDraggingWindowEnd.current) &&
      windowTimelineRef.current
    ) {
      const rect = windowTimelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));

      if (isDraggingWindowStart.current) {
        const newStart = totalDuration * percentage;
        setTimeWindow((prev) => ({
          start: Math.min(newStart, prev.end - 1000), // Minimum 1 second window
          end: prev.end,
        }));
      } else if (isDraggingWindowEnd.current) {
        const newEnd = totalDuration * percentage;
        setTimeWindow((prev) => ({
          start: prev.start,
          end: Math.max(newEnd, prev.start + 1000), // Minimum 1 second window
        }));
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingTimeline.current = false;
    isDraggingWindowStart.current = false;
    isDraggingWindowEnd.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  // Format time for display
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
    }
    return `${remainingSeconds}.${milliseconds.toString().padStart(2, "0")}s`;
  };

  if (allPoints.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400">
        <div className="text-2xl mb-2">📊</div>
        <p>No telemetry data recorded yet</p>
        <p className="text-xs mt-1">Start the robot to begin recording</p>
      </div>
    );
  }

  const windowDuration = timeWindow.end - timeWindow.start;
  const currentPercentage = (currentTime / windowDuration) * 100;
  const windowStartPercentage = (timeWindow.start / totalDuration) * 100;
  const windowEndPercentage = (timeWindow.end / totalDuration) * 100;

  return (
    <div className="p-4 space-y-4">
      {/* Path Visualization Settings */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Path Visualization
        </h4>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Choose how to color the robot's path on the competition mat. Colors
          represent different sensor data or robot states over time.
        </p>
        <div className="flex items-center gap-2">
          <label
            htmlFor="color-mode"
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            Color Mode:
          </label>
          <select
            id="color-mode"
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <option value="none">Solid Blue</option>
            <option value="speed">Speed (Green → Red)</option>
            <option value="motorLoad">Motor Load (Blue → Red)</option>
            <option value="colorSensor">Color Sensor (Actual Colors)</option>
            <option value="distanceSensor">
              Distance (Red=Close, Green=Far)
            </option>
            <option value="reflectionSensor">Reflection (Black → White)</option>
            <option value="forceSensor">Force (Light → Dark)</option>
          </select>
        </div>
      </div>

      {/* Path Selection */}
      {(allPaths.length > 0 || currentPath) && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Recorded Paths
          </h4>

          {/* All Paths Combined Option */}
          <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="all-paths"
                name="path-selection"
                checked={!selectedPathId}
                onChange={() => {
                  setSelectedPathId(null);
                  setCurrentTime(0);
                  setIsPlaying(false);
                  setHasStartedPlayback(false);
                }}
                className="text-blue-600"
              />
              <label
                htmlFor="all-paths"
                className="text-sm text-gray-800 dark:text-gray-200"
              >
                All Paths Combined ({allPoints.length} total pts)
              </label>
            </div>
          </div>

          {/* Individual Paths */}
          {allPaths.map((path) => {
            const pathDate = new Date(path.startTime).toLocaleTimeString();
            const duration = ((path.endTime - path.startTime) / 1000).toFixed(
              1,
            );
            const isSelected = selectedPathId === path.id;

            return (
              <div
                key={path.id}
                className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`path-${path.id}`}
                    name="path-selection"
                    checked={isSelected}
                    onChange={() => {
                      setSelectedPathId(path.id);
                      setCurrentTime(0);
                      setIsPlaying(false);
                      setHasStartedPlayback(false);
                    }}
                    className="text-blue-600"
                  />
                  <label
                    htmlFor={`path-${path.id}`}
                    className="text-sm text-gray-800 dark:text-gray-200"
                  >
                    Path {pathDate} ({duration}s, {path.points.length} pts)
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const wasDeleted = telemetryHistory.deletePath(path.id);
                    if (wasDeleted && selectedPathId === path.id) {
                      // If we deleted the currently selected path, switch to all paths
                      setSelectedPathId(null);
                      setCurrentTime(0);
                      setIsPlaying(false);
                      setHasStartedPlayback(false);
                    }
                  }}
                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Delete this path"
                >
                  🗑️
                </button>
              </div>
            );
          })}

          {/* Current Path (if active) */}
          {currentPath && (
            <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="current-path"
                  name="path-selection"
                  checked={selectedPathId === currentPath.id}
                  onChange={() => {
                    setSelectedPathId(currentPath.id);
                    setCurrentTime(0);
                    setIsPlaying(false);
                    setHasStartedPlayback(false);
                  }}
                  className="text-blue-600"
                />
                <label
                  htmlFor="current-path"
                  className="text-sm text-gray-800 dark:text-gray-200"
                >
                  Current Path ({currentPath.points.length} pts) ⚡
                </label>
              </div>
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                Recording
              </span>
            </div>
          )}
        </div>
      )}

      {/* Playback Controls */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => {
            lastFrameTimeRef.current = 0;
            setIsPlaying(!isPlaying);
            setHasStartedPlayback(true);
          }}
          className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <button
          type="button"
          onClick={() => {
            lastFrameTimeRef.current = 0;
            setCurrentTime(0);
            setIsPlaying(false);
            setHasStartedPlayback(false); // Clear ghost when resetting
          }}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Reset to start"
        >
          ⏮
        </button>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">
            Speed:
          </label>
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
          >
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
          </select>
        </div>

        <div className="flex-1 text-center">
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
            {formatTime(currentTime)} / {formatTime(windowDuration)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setTimeWindow({ start: 0, end: totalDuration })}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Reset window to full timeline"
        >
          ↔️
        </button>

        <button
          type="button"
          onClick={() => {
            lastFrameTimeRef.current = 0;
            setCurrentTime(0);
            setIsPlaying(false);
            setHasStartedPlayback(false); // Clear ghost when starting new path
            telemetryHistory.startNewPath(); // Start new path without clearing history
          }}
          className="p-2 rounded-lg bg-green-100 dark:bg-green-500 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-500/70 transition-colors"
          title="Start new telemetry path"
        >
          ➕
        </button>
      </div>

      {/* Full Timeline with Window Visualization */}
      <div className="space-y-2">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Full Timeline
        </div>
        <div
          ref={windowTimelineRef}
          className="relative h-8 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden"
        >
          {/* Faded regions outside window */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-gray-300 dark:bg-gray-600 opacity-50"
            style={{ width: `${windowStartPercentage}%` }}
          />
          <div
            className="absolute top-0 bottom-0 right-0 bg-gray-300 dark:bg-gray-600 opacity-50"
            style={{ width: `${100 - windowEndPercentage}%` }}
          />

          {/* Window handles - always accessible with proper spacing */}
          <div
            className="absolute top-0 bottom-0 w-4 bg-blue-500 cursor-ew-resize hover:bg-blue-600 transition-colors rounded-l shadow-lg border border-white"
            style={{
              left: `${Math.max(2, Math.min(94, windowStartPercentage))}%`,
              transform: "translateX(-50%)",
              minWidth: "16px",
              zIndex: 10,
            }}
            onMouseDown={(e) => handleTimelineMouseDown(e, "windowStart")}
            title="Drag to adjust window start"
          />
          <div
            className="absolute top-0 bottom-0 w-4 bg-blue-500 cursor-ew-resize hover:bg-blue-600 transition-colors rounded-r shadow-lg border border-white"
            style={{
              left: `${Math.max(6, Math.min(98, windowEndPercentage))}%`,
              transform: "translateX(-50%)",
              minWidth: "16px",
              zIndex: 10,
            }}
            onMouseDown={(e) => handleTimelineMouseDown(e, "windowEnd")}
            title="Drag to adjust window end"
          />

          {/* Window range indicator */}
          <div
            className="absolute top-1 bottom-1 bg-blue-100 dark:bg-blue-900/30 border-x border-blue-400"
            style={{
              left: `${windowStartPercentage}%`,
              width: `${windowEndPercentage - windowStartPercentage}%`,
            }}
          />
        </div>

        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatTime(0)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Windowed Timeline with Scrubber */}
      <div className="space-y-2">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Playback Window
        </div>
        <div
          ref={timelineRef}
          className="relative h-12 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer"
          onMouseDown={(e) => handleTimelineMouseDown(e, "timeline")}
          onMouseMove={(e) => {
            if (!timelineRef.current || isDraggingTimeline.current) return;

            const rect = timelineRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, x / rect.width));
            const windowDuration = timeWindow.end - timeWindow.start;
            const hoverTime = windowDuration * percentage;

            const point = getCurrentPoint(hoverTime);
            if (point) {
              setHoveredPoint(point);
              setTooltipPosition({
                x: e.clientX,
                y: rect.top - 10,
              });
            }
          }}
          onMouseLeave={() => {
            setHoveredPoint(null);
            setTooltipPosition(null);
          }}
        >
          {/* Progress bar */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-blue-500 opacity-30 rounded-lg"
            style={{ width: `${currentPercentage}%` }}
          />

          {/* Telemetry points visualization */}
          {windowedPoints.map((point, index) => {
            const pointsToUse =
              selectedPoints.length > 0 ? selectedPoints : allPoints;
            const pointTime =
              point.timestamp - pointsToUse[0].timestamp - timeWindow.start;
            const pointPercentage = (pointTime / windowDuration) * 100;

            return (
              <div
                key={`${point.timestamp}-${index}`}
                className="absolute top-1/2 w-1 h-2 bg-gray-400 dark:bg-gray-500 -translate-y-1/2"
                style={{ left: `${pointPercentage}%` }}
              />
            );
          })}

          {/* Current point indicator */}
          {hasStartedPlayback && getCurrentPoint(currentTime) && (
            <div
              className="absolute top-1/2 w-3 h-3 bg-purple-500 rounded-full -translate-y-1/2 z-10 animate-pulse"
              style={{ left: `${currentPercentage}%`, marginLeft: "-6px" }}
              title="Current telemetry point"
            />
          )}

          {/* Scrubber */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-blue-600"
            style={{ left: `${currentPercentage}%` }}
          >
            <div className="absolute -top-1 -left-2 w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
          </div>
        </div>

        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatTime(0)}</span>
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span>{formatTime(windowDuration)}</span>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4 text-xs">
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <div className="text-gray-500 dark:text-gray-400">Total Paths</div>
          <div className="font-mono text-lg">
            {allPaths.length + (currentPath ? 1 : 0)}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <div className="text-gray-500 dark:text-gray-400">
            Selected Points
          </div>
          <div className="font-mono text-lg">
            {selectedPoints.length > 0
              ? selectedPoints.length
              : allPoints.length}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <div className="text-gray-500 dark:text-gray-400">Window Points</div>
          <div className="font-mono text-lg">{windowedPoints.length}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <div className="text-gray-500 dark:text-gray-400">Window Size</div>
          <div className="font-mono text-lg">{formatTime(windowDuration)}</div>
        </div>
      </div>

      {/* Telemetry tooltip for hovered point */}
      {hoveredPoint && tooltipPosition && (
        <TelemetryTooltip
          telemetry={hoveredPoint.data}
          position={tooltipPosition}
          timestamp={hoveredPoint.timestamp}
        />
      )}
    </div>
  );
}
