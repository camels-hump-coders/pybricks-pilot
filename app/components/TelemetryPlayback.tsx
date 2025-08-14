import { useState, useEffect, useRef, useCallback } from "react";
import { telemetryHistory, type TelemetryPoint, type TelemetryPath } from "../services/telemetryHistory";
import type { TelemetryData } from "../services/pybricksHub";
import { TelemetryTooltip } from "./TelemetryTooltip.tsx";

interface TelemetryPlaybackProps {
  onGhostPositionUpdate: (position: { x: number; y: number; heading: number } | null) => void;
  onTelemetryDataUpdate: (data: TelemetryData | null) => void;
}

interface TimeWindow {
  start: number; // Start time in ms (relative to first point)
  end: number;   // End time in ms (relative to first point)
}

export function TelemetryPlayback({ 
  onGhostPositionUpdate, 
  onTelemetryDataUpdate 
}: TelemetryPlaybackProps) {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false); // Track if user has interacted
  
  // Timeline state
  const [timeWindow, setTimeWindow] = useState<TimeWindow>({ start: 0, end: 0 });
  const [totalDuration, setTotalDuration] = useState(0);
  const [selectedPoint, setSelectedPoint] = useState<TelemetryPoint | null>(null);
  
  // Telemetry data
  const [allPoints, setAllPoints] = useState<TelemetryPoint[]>([]);
  const [windowedPoints, setWindowedPoints] = useState<TelemetryPoint[]>([]);
  
  // Animation refs
  const animationFrameRef = useRef<number>();
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
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryPoint | null>(null);

  // Load telemetry data
  useEffect(() => {
    const loadTelemetryData = () => {
      const paths = telemetryHistory.getAllPaths();
      const currentPath = telemetryHistory.getCurrentPath();
      
      // Combine all paths into a single array of points
      const allPathPoints: TelemetryPoint[] = [];
      
      paths.forEach(path => {
        allPathPoints.push(...path.points);
      });
      
      if (currentPath && currentPath.points.length > 0) {
        allPathPoints.push(...currentPath.points);
      }
      
      // Sort by timestamp
      allPathPoints.sort((a, b) => a.timestamp - b.timestamp);
      
      if (allPathPoints.length > 0) {
        const firstTime = allPathPoints[0].timestamp;
        const lastTime = allPathPoints[allPathPoints.length - 1].timestamp;
        const duration = lastTime - firstTime;
        
        setAllPoints(allPathPoints);
        setTotalDuration(duration);
        
        // Initialize time window to full range
        if (timeWindow.end === 0) {
          setTimeWindow({ start: 0, end: duration });
        }
      }
    };
    
    // Load data initially
    loadTelemetryData();
    
    // Set up periodic refresh
    const interval = setInterval(loadTelemetryData, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  // Update windowed points when time window changes
  useEffect(() => {
    if (allPoints.length === 0) return;
    
    const firstTime = allPoints[0].timestamp;
    const windowStartTime = firstTime + timeWindow.start;
    const windowEndTime = firstTime + timeWindow.end;
    
    const windowed = allPoints.filter(
      point => point.timestamp >= windowStartTime && point.timestamp <= windowEndTime
    );
    
    setWindowedPoints(windowed);
    
    // Reset current time if it's outside the window
    if (currentTime < 0 || currentTime > timeWindow.end - timeWindow.start) {
      setCurrentTime(0);
    }
  }, [timeWindow, allPoints]);
  
  // Find the current point based on playback time
  const getCurrentPoint = useCallback((time: number): TelemetryPoint | null => {
    if (windowedPoints.length === 0) return null;
    
    const windowStartTime = allPoints[0]?.timestamp + timeWindow.start;
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
  }, [windowedPoints, timeWindow, allPoints]);
  
  // Update ghost position based on current time (only if playback has started)
  useEffect(() => {
    if (!hasStartedPlayback) {
      onGhostPositionUpdate(null);
      onTelemetryDataUpdate(null);
      return;
    }
    
    const point = selectedPoint || getCurrentPoint(currentTime);
    
    if (point) {
      onGhostPositionUpdate({
        x: point.x,
        y: point.y,
        heading: point.heading
      });
      onTelemetryDataUpdate(point.data);
    } else {
      onGhostPositionUpdate(null);
      onTelemetryDataUpdate(null);
    }
  }, [currentTime, selectedPoint, getCurrentPoint, onGhostPositionUpdate, onTelemetryDataUpdate, hasStartedPlayback]);
  
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
      const newTime = playbackStartPositionRef.current + (elapsed * playbackSpeed);
      const windowDuration = timeWindow.end - timeWindow.start;
      
      if (newTime >= windowDuration) {
        // Loop back to start or stop
        setCurrentTime(0);
        playbackStartTimeRef.current = timestamp;
        playbackStartPositionRef.current = 0;
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
      lastFrameTimeRef.current = 0;
    };
  }, [isPlaying, playbackSpeed, timeWindow, currentTime]);
  
  // Timeline mouse handlers
  const handleTimelineMouseDown = (e: React.MouseEvent, target: "timeline" | "windowStart" | "windowEnd") => {
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
    } else if ((isDraggingWindowStart.current || isDraggingWindowEnd.current) && windowTimelineRef.current) {
      const rect = windowTimelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      
      if (isDraggingWindowStart.current) {
        const newStart = totalDuration * percentage;
        setTimeWindow(prev => ({
          start: Math.min(newStart, prev.end - 1000), // Minimum 1 second window
          end: prev.end
        }));
      } else if (isDraggingWindowEnd.current) {
        const newEnd = totalDuration * percentage;
        setTimeWindow(prev => ({
          start: prev.start,
          end: Math.max(newEnd, prev.start + 1000) // Minimum 1 second window
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 space-y-4">
      {/* Playback Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            setIsPlaying(!isPlaying);
            setHasStartedPlayback(true);
          }}
          className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        
        <button
          onClick={() => setCurrentTime(0)}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Reset to start"
        >
          ⏮
        </button>
        
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Speed:</label>
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
          onClick={() => telemetryHistory.clearHistory()}
          className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
          title="Clear telemetry history"
        >
          🗑️
        </button>
      </div>
      
      {/* Full Timeline with Window Visualization */}
      <div className="space-y-2">
        <div className="text-xs text-gray-500 dark:text-gray-400">Full Timeline</div>
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
          
          {/* Window handles */}
          <div
            className="absolute top-0 bottom-0 w-2 bg-blue-500 cursor-ew-resize hover:bg-blue-600 transition-colors"
            style={{ left: `${windowStartPercentage}%`, marginLeft: '-4px' }}
            onMouseDown={(e) => handleTimelineMouseDown(e, "windowStart")}
            title="Drag to adjust window start"
          />
          <div
            className="absolute top-0 bottom-0 w-2 bg-blue-500 cursor-ew-resize hover:bg-blue-600 transition-colors"
            style={{ left: `${windowEndPercentage}%`, marginLeft: '-4px' }}
            onMouseDown={(e) => handleTimelineMouseDown(e, "windowEnd")}
            title="Drag to adjust window end"
          />
          
          {/* Window range indicator */}
          <div className="absolute top-1 bottom-1 bg-blue-100 dark:bg-blue-900/30 border-x border-blue-400"
            style={{ 
              left: `${windowStartPercentage}%`,
              width: `${windowEndPercentage - windowStartPercentage}%`
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
        <div className="text-xs text-gray-500 dark:text-gray-400">Playback Window</div>
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
                y: rect.top - 10
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
            const pointTime = point.timestamp - allPoints[0].timestamp - timeWindow.start;
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
              style={{ left: `${currentPercentage}%`, marginLeft: '-6px' }}
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
          <span>{formatTime(timeWindow.start)}</span>
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span>{formatTime(timeWindow.end)}</span>
        </div>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <div className="text-gray-500 dark:text-gray-400">Total Points</div>
          <div className="font-mono text-lg">{allPoints.length}</div>
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