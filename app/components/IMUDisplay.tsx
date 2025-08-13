import { BatteryIndicator } from "./BatteryIndicator";

// Updated to match PybricksPilot hub data structure
interface HubData {
  battery?: {
    voltage: number;
    current: number;
  };
  imu?: {
    acceleration: [number, number, number];
    angular_velocity: [number, number, number]; 
    heading: number;
  };
  system?: {
    name: string;
  };
  gyro?: {
    angle: number;
    speed?: number;
  };
}

interface IMUDisplayProps {
  hubData?: HubData;
  className?: string;
}

export function IMUDisplay({ hubData, className = '' }: IMUDisplayProps) {
  if (!hubData?.imu && !hubData?.battery) {
    return (
      <div className={`space-y-2 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Hub Data</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">No hub data available</p>
      </div>
    );
  }

  /**
   * Normalize heading to -180 to 180 degrees range
   */
  const normalizeHeading = (heading: number): number => {
    // Normalize to 0-360 range first
    let normalized = ((heading % 360) + 360) % 360;
    
    // Convert to -180 to 180 range
    if (normalized > 180) {
      normalized -= 360;
    }
    
    return normalized;
  };

  const formatValue = (value: number | undefined | null, unit: string, decimals = 1) => {
    if (value === undefined || value === null || isNaN(value)) {
      return `--${unit}`;
    }
    return `${value.toFixed(decimals)}${unit}`;
  };

  /**
   * Calculate battery percentage from voltage in millivolts
   * Based on LEGO hub lithium-ion battery characteristics
   */
  const calculateBatteryPercentage = (voltageMillivolts: number): number => {
    // Define voltage thresholds for LEGO hubs (in mV)
    const MAX_VOLTAGE = 8300;  // Fully charged (~8.3V)
    const MIN_SAFE_VOLTAGE = 6000;  // Minimum safe operating voltage (~6.0V)
    const CRITICAL_VOLTAGE = 4800;  // Hub shutdown voltage (~4.8V)
    
    // Clamp voltage to reasonable range
    if (voltageMillivolts >= MAX_VOLTAGE) {
      return 100;
    } else if (voltageMillivolts <= CRITICAL_VOLTAGE) {
      return 0;
    } else if (voltageMillivolts <= MIN_SAFE_VOLTAGE) {
      // Battery is critically low but still functional
      return Math.round(((voltageMillivolts - CRITICAL_VOLTAGE) / (MIN_SAFE_VOLTAGE - CRITICAL_VOLTAGE)) * 10);
    }
    
    // Normal operating range: 6.0V to 8.3V maps to 10% to 100%
    const percentage = 10 + ((voltageMillivolts - MIN_SAFE_VOLTAGE) / (MAX_VOLTAGE - MIN_SAFE_VOLTAGE)) * 90;
    return Math.round(Math.max(0, Math.min(100, percentage)));
  };

  const getBatteryStatus = (percentage: number) => {
    if (percentage >= 60) return { status: 'excellent', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' };
    if (percentage >= 30) return { status: 'good', color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' };
    if (percentage >= 10) return { status: 'low', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' };
    return { status: 'critical', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' };
  };

  const getAccelerationColor = (value: number) => {
    const abs = Math.abs(value);
    if (abs > 2) return 'text-red-600';
    if (abs > 1) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Hub Data</h3>
      
      {/* Battery Status */}
      {hubData.battery && (() => {
        const voltageVolts = hubData.battery.voltage ? hubData.battery.voltage / 1000 : 0;
        const batteryPercentage = calculateBatteryPercentage(hubData.battery.voltage || 0);
        const batteryStatus = getBatteryStatus(batteryPercentage);
        
        return (
          <div className={`rounded-lg border p-4 shadow-sm ${batteryStatus.bgColor} dark:${batteryStatus.bgColor.replace('bg-', 'bg-').replace('-50', '-900')} ${batteryStatus.borderColor} dark:${batteryStatus.borderColor.replace('border-', 'border-').replace('-200', '-700')}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-700 dark:text-gray-300">Battery Status</h4>
              <div className={`text-xs font-medium px-2 py-1 rounded-full ${batteryStatus.color} bg-white dark:bg-gray-800 bg-opacity-50 dark:bg-opacity-50`}>
                {batteryStatus.status.toUpperCase()}
              </div>
            </div>
            
            {/* Battery Percentage Display */}
            <div className="mb-4">
              <BatteryIndicator level={batteryPercentage} className="justify-center" />
            </div>
            
            {/* Technical Details */}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-current border-opacity-20">
              <div className="text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Voltage</div>
                <div className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {formatValue(voltageVolts, 'V', 2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Current</div>
                <div className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {formatValue(hubData.battery.current, 'mA', 0)}
                </div>
              </div>
            </div>
            
            {/* Battery Health Indicator */}
            {batteryPercentage <= 10 && (
              <div className="mt-3 p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-center">
                <div className="text-xs font-medium text-red-700 dark:text-red-300">
                  ⚠️ Battery critically low - charge soon!
                </div>
              </div>
            )}
            
            {batteryPercentage <= 30 && batteryPercentage > 10 && (
              <div className="mt-3 p-2 bg-orange-100 dark:bg-orange-900 border border-orange-300 dark:border-orange-700 rounded text-center">
                <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
                  🔋 Battery low - consider charging
                </div>
              </div>
            )}
          </div>
        );
      })()}
      
      {/* Heading/Compass */}
      {hubData.imu && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="text-center mb-3">
            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Heading</h4>
            <div className="relative w-24 h-24 mx-auto">
              {/* Compass circle */}
              <div className="absolute inset-0 border-2 border-gray-300 dark:border-gray-600 rounded-full"></div>
              
              {/* Cardinal directions */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 text-xs font-bold text-gray-600 dark:text-gray-400">N</div>
              <div className="absolute right-0 top-1/2 transform translate-x-1 -translate-y-1/2 text-xs font-bold text-gray-600 dark:text-gray-400">E</div>
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 text-xs font-bold text-gray-600 dark:text-gray-400">S</div>
              <div className="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 text-xs font-bold text-gray-600 dark:text-gray-400">W</div>
              
              {/* Heading needle */}
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ transform: `rotate(${normalizeHeading(hubData.imu.heading || 0)}deg)` }}
              >
                <div className="w-0.5 h-8 bg-red-500 rounded-full origin-bottom"></div>
              </div>
              
              {/* Center dot */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-800 dark:bg-gray-200 rounded-full"></div>
            </div>
            <div className="text-lg font-mono font-bold text-gray-800 dark:text-gray-200 mt-2">
              {formatValue(normalizeHeading(hubData.imu.heading || 0), '°', 0)}
            </div>
          </div>
        </div>
      )}

      {/* Acceleration */}
      {hubData.imu && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Acceleration</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">X</div>
              <div className={`font-mono font-bold ${getAccelerationColor(hubData.imu.acceleration?.[0] || 0)}`}>
                {formatValue(hubData.imu.acceleration?.[0] ? hubData.imu.acceleration[0] / 1000 : undefined, 'g')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Y</div>
              <div className={`font-mono font-bold ${getAccelerationColor(hubData.imu.acceleration?.[1] || 0)}`}>
                {formatValue(hubData.imu.acceleration?.[1] ? hubData.imu.acceleration[1] / 1000 : undefined, 'g')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Z</div>
              <div className={`font-mono font-bold ${getAccelerationColor(hubData.imu.acceleration?.[2] || 0)}`}>
                {formatValue(hubData.imu.acceleration?.[2] ? hubData.imu.acceleration[2] / 1000 : undefined, 'g')}
              </div>
            </div>
          </div>
          
          {/* Acceleration magnitude */}
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total</div>
              <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatValue(
                  hubData.imu.acceleration?.length === 3 ? Math.sqrt(
                    Math.pow(hubData.imu.acceleration[0], 2) + 
                    Math.pow(hubData.imu.acceleration[1], 2) + 
                    Math.pow(hubData.imu.acceleration[2], 2)
                  ) / 1000 : undefined, 
                  'g'
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Angular Velocity */}
      {hubData.imu && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Angular Velocity</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Roll</div>
              <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatValue(hubData.imu.angular_velocity?.[0], '°/s')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Pitch</div>
              <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatValue(hubData.imu.angular_velocity?.[1], '°/s')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Yaw</div>
              <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatValue(hubData.imu.angular_velocity?.[2], '°/s')}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Separate Gyro Sensor (if registered separately) */}
      {hubData.gyro && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Gyro Sensor</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Angle</div>
              <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatValue(hubData.gyro.angle, '°', 0)}
              </div>
            </div>
            {hubData.gyro.speed !== undefined && hubData.gyro.speed !== null && (
              <div className="text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Speed</div>
                <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
                  {formatValue(hubData.gyro.speed, '°/s')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* System Info */}
      {hubData.system && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">System</h4>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hub Name</div>
            <div className="font-mono font-bold text-gray-800 dark:text-gray-200">
              {hubData.system.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}