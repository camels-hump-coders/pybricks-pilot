import { useEffect, useState } from "react";
import type { RobotConnectionOptions } from "../services/robotInterface";

interface RobotConnectionSelectorProps {
  onConnect: (options: RobotConnectionOptions) => Promise<void>;
  isConnecting: boolean;
  robotType: "real" | "virtual" | null;
  isBluetoothSupported: boolean;
  className?: string;
}

export function RobotConnectionSelector({
  onConnect,
  isConnecting,
  robotType,
  isBluetoothSupported,
  className = "",
}: RobotConnectionSelectorProps) {
  const [selectedRobotType, setSelectedRobotType] = useState<
    "real" | "virtual" | null
  >(robotType); // Use robotType directly, which can be null

  // Clear Real Robot selection if Bluetooth becomes unsupported
  useEffect(() => {
    if (selectedRobotType === "real" && !isBluetoothSupported) {
      setSelectedRobotType(null);
    }
  }, [isBluetoothSupported, selectedRobotType]);
  const handleConnect = async () => {
    if (!selectedRobotType) return; // Don't connect if no robot type selected

    const options: RobotConnectionOptions = {
      robotType: selectedRobotType,
    };

    await onConnect(options);
  };

  const handleRobotTypeChange = (type: "real" | "virtual") => {
    // Prevent selecting Real Robot if Bluetooth is not supported
    if (type === "real" && !isBluetoothSupported) {
      return;
    }
    setSelectedRobotType(type);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Robot Type Selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select Robot Type
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleRobotTypeChange("real")}
            disabled={!isBluetoothSupported}
            className={`p-3 rounded-lg border-2 transition-all ${
              !isBluetoothSupported
                ? "border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-60"
                : selectedRobotType === "real"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
            }`}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-medium text-sm">Real Robot</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {isBluetoothSupported
                  ? "Connect via Bluetooth"
                  : "Bluetooth not supported - use Chrome/Edge"}
              </div>
            </div>
          </button>

          <button
            onClick={() => handleRobotTypeChange("virtual")}
            className={`p-3 rounded-lg border-2 transition-all ${
              selectedRobotType === "virtual"
                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
            }`}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">🖥️</div>
              <div className="font-medium text-sm">Virtual Robot</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Simulate for testing
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Connection Button */}
      <button
        onClick={handleConnect}
        disabled={isConnecting || !selectedRobotType}
        className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
          !selectedRobotType
            ? "bg-gray-400 cursor-not-allowed"
            : selectedRobotType === "real"
              ? "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400"
              : "bg-green-600 hover:bg-green-700 text-white disabled:bg-green-400"
        } disabled:opacity-50 flex items-center justify-center gap-2`}
      >
        {isConnecting && (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        )}
        {isConnecting
          ? "Connecting..."
          : !selectedRobotType
            ? "Select a robot type first"
            : `Connect to ${selectedRobotType === "real" ? "Robot" : "Virtual Robot"}`}
      </button>

      {/* Info Text */}
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
        {!selectedRobotType ? (
          <p>Select a robot type above to get started with PyBricks Pilot.</p>
        ) : selectedRobotType === "real" ? (
          <p>
            Connect to a real PyBricks robot via Bluetooth to control motors,
            read sensors, and run programs.
          </p>
        ) : (
          <p>
            Use a virtual robot to test your code and plan routes without
            physical hardware. Perfect for learning and development.
          </p>
        )}
      </div>
    </div>
  );
}
