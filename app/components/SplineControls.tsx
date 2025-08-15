interface SplinePath {
  id: string;
  name: string;
  points: any[];
  isComplete: boolean;
}

interface SplineControlsProps {
  currentSplinePath: SplinePath | null;
  splinePaths: SplinePath[];
  onExecutePath: (path: SplinePath) => Promise<void>;
  onExitSplineMode: () => void;
}

export function SplineControls({
  currentSplinePath,
  splinePaths,
  onExecutePath,
  onExitSplineMode,
}: SplineControlsProps) {
  const completedPaths = splinePaths.filter(p => p.isComplete);

  return (
    <div className="space-y-4">
      <div className="text-center text-purple-600 dark:text-purple-400">
        <div className="text-lg font-semibold">📐 Spline Path Planning</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Click on the mat to add waypoints to your path
        </div>
      </div>

      {/* Current path info */}
      {currentSplinePath && (
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
          <div className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">
            {currentSplinePath.name}
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-400 mb-3">
            {currentSplinePath.points.length} waypoints
          </div>

          {/* Path controls */}
          <div className="flex gap-2">
            {currentSplinePath.points.length >= 2 && !currentSplinePath.isComplete && (
              <button
                onClick={() => {
                  console.log("Execute spline path", currentSplinePath);
                }}
                className="flex-1 px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
              >
                ▶ Execute Path
              </button>
            )}
            <button
              onClick={onExitSplineMode}
              className="px-3 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saved Paths Execution */}
      {completedPaths.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide border-t border-gray-200 dark:border-gray-700 pt-2 sm:pt-3">
            Saved Paths ({completedPaths.length})
          </div>
          
          <div className="space-y-2">
            {completedPaths.map((path) => (
              <div 
                key={path.id} 
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {path.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {path.points.length} points
                  </div>
                </div>
                <button
                  onClick={() => onExecutePath(path)}
                  className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                  ▶ Execute
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}