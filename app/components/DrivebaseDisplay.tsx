interface DrivebaseData {
  distance: number;
  angle: number;
  state?: {
    distance: number;
    drive_speed: number;
    angle: number;
    turn_rate: number;
  };
  error?: string;
}

interface DrivebaseDisplayProps {
  drivebaseData?: DrivebaseData;
  className?: string;
}

export function DrivebaseDisplay({ drivebaseData, className = '' }: DrivebaseDisplayProps) {
  if (!drivebaseData) {
    return (
      <div className={`space-y-2 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Drivebase</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">No drivebase data available</p>
      </div>
    );
  }

  const formatValue = (value: number, unit: string, decimals = 1) => {
    return `${value.toFixed(decimals)}${unit}`;
  };

  if (drivebaseData.error) {
    return (
      <div className={`space-y-3 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Drivebase</h3>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900 p-3 rounded">
            <div className="font-medium">Error</div>
            <div className="text-sm mt-1">{drivebaseData.error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Drivebase</h3>
      
      {/* Basic Position Data */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Position</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Distance</div>
            <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
              {formatValue(drivebaseData.distance, 'mm', 0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Angle</div>
            <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
              {formatValue(drivebaseData.angle, '°', 0)}
            </div>
          </div>
        </div>
        
        {/* Visual angle indicator */}
        <div className="mt-4 flex justify-center">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-gray-300 dark:border-gray-600 rounded-full"></div>
            <div 
              className="absolute inset-0 flex items-center justify-center"
              style={{ transform: `rotate(${drivebaseData.angle}deg)` }}
            >
              <div className="w-0.5 h-6 bg-blue-500 rounded-full origin-bottom"></div>
            </div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-gray-800 dark:bg-gray-200 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Detailed State Data */}
      {drivebaseData.state && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Current State</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Drive Speed</div>
              <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatValue(drivebaseData.state.drive_speed, 'mm/s', 0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Turn Rate</div>
              <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatValue(drivebaseData.state.turn_rate, '°/s', 0)}
              </div>
            </div>
          </div>
          
          {/* Motion indicator */}
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-2">
              <div 
                className={`w-2 h-2 rounded-full ${
                  Math.abs(drivebaseData.state.drive_speed) > 5 || Math.abs(drivebaseData.state.turn_rate) > 5 
                    ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              ></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {Math.abs(drivebaseData.state.drive_speed) > 5 || Math.abs(drivebaseData.state.turn_rate) > 5 
                  ? 'Moving' : 'Stationary'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}