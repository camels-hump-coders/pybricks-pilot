import { useEffect, useState } from "react";
import type { RobotConnectionOptions } from "../services/robotInterface";

interface RobotConnectionSelectorProps {
  onConnect: (options: RobotConnectionOptions) => Promise<void>;
  isConnecting: boolean;
  robotType: "real" | "virtual" | null;
  isBluetoothSupported: boolean;
  className?: string;
}

// Instructions Modal Component
function RobotInstructionsModal({
  isOpen,
  onClose,
  isConnecting,
  onTryAgain,
}: {
  isOpen: boolean;
  onClose: () => void;
  isConnecting: boolean;
  onTryAgain: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Connect to Real Robot
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <span className="text-xl text-gray-500">×</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-blue-600 dark:text-blue-400 text-xl">
                ℹ️
              </span>
              <div className="text-blue-800 dark:text-blue-200">
                <h3 className="font-semibold mb-2">Before You Begin</h3>
                <p className="text-sm">
                  Make sure your LEGO robot is powered on and has Pybricks
                  firmware installed. The robot should be within Bluetooth range
                  of your computer.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Step 1: Install Pybricks Firmware
            </h3>
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                If you haven't already installed Pybricks firmware on your LEGO
                hub:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-300 ml-4">
                <li>
                  Visit{" "}
                  <a
                    href="https://code.pybricks.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 underline"
                  >
                    code.pybricks.com
                  </a>
                </li>
                <li>
                  Click "Install Pybricks" and follow the installation
                  instructions
                </li>
                <li>Once installed, your hub will be ready to connect</li>
              </ol>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Step 2: Connection Process
            </h3>
            <div className="space-y-3">
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-300 ml-4">
                <li>
                  Make sure your robot is powered on and running Pybricks
                  firmware
                </li>
                <li>
                  Click "Connect to Robot" below to open the Bluetooth pairing
                  dialog
                </li>
                <li>
                  Select your hub from the list (usually named "Pybricks Hub")
                </li>
                <li>
                  Once connected, you'll see real-time telemetry and can control
                  your robot
                </li>
              </ol>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-yellow-600 dark:text-yellow-400 text-xl">
                ⚠️
              </span>
              <div className="text-yellow-800 dark:text-yellow-200">
                <h3 className="font-semibold mb-2">Troubleshooting</h3>
                <ul className="text-sm space-y-1">
                  <li>
                    • If the hub doesn't appear, try restarting your robot
                  </li>
                  <li>• Check that Bluetooth is enabled on your computer</li>
                  <li>
                    • The hub should show a Bluetooth icon when ready to connect
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          {isConnecting ? (
            <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium">
                Opening Bluetooth pairing dialog...
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Connection cancelled. You can try again or close this dialog.
              </p>
            </div>
          )}
          <div className="flex-1"></div>
          <div className="flex gap-2">
            {!isConnecting && (
              <button
                onClick={onTryAgain}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                🔄 Try Again
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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

  const [showInstructions, setShowInstructions] = useState(false);
  const [_pendingConnection, setPendingConnection] = useState<
    "real" | "virtual" | null
  >(null);

  // Clear Real Robot selection if Bluetooth becomes unsupported
  useEffect(() => {
    if (selectedRobotType === "real" && !isBluetoothSupported) {
      setSelectedRobotType(null);
    }
  }, [isBluetoothSupported, selectedRobotType]);
  const handleConnect = async (robotType: "real" | "virtual") => {
    const options: RobotConnectionOptions = {
      robotType: robotType,
    };

    try {
      await onConnect(options);
      // If successful and we had instructions open, close them
      if (showInstructions) {
        setShowInstructions(false);
      }
      setPendingConnection(null);
    } catch (error) {
      // If connection fails and it was a real robot, keep instructions open
      // so user can try again or get help
      if (robotType === "real" && showInstructions) {
        // Keep instructions modal open for troubleshooting
        // Don't clear pendingConnection so "Try Again" button works
      } else {
        // For virtual robots or if instructions weren't shown, reset
        setPendingConnection(null);
      }
      throw error; // Re-throw so parent can handle error notification
    }
  };

  const handleRobotTypeSelection = async (type: "real" | "virtual") => {
    // Prevent selecting Real Robot if Bluetooth is not supported
    if (type === "real" && !isBluetoothSupported) {
      return;
    }

    setSelectedRobotType(type);

    if (type === "virtual") {
      // Connect immediately for virtual robot
      await handleConnect(type);
    } else if (type === "real") {
      // Show instructions modal and start connecting immediately
      setPendingConnection(type);
      setShowInstructions(true);
      // Start connection process immediately
      await handleConnect(type);
    }
  };

  const handleCloseInstructions = () => {
    setShowInstructions(false);
    setPendingConnection(null);
    setSelectedRobotType(null); // Reset selection so user can choose again
  };

  const handleTryAgain = async () => {
    console.log("Try Again clicked - starting fresh real robot connection");
    try {
      await handleConnect("real");
    } catch (error) {
      console.log("Try Again failed:", error);
      // Error is handled by handleConnect, just log it here
    }
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
            onClick={() => handleRobotTypeSelection("real")}
            disabled={!isBluetoothSupported || isConnecting}
            className={`p-3 rounded-lg border-2 transition-all ${
              !isBluetoothSupported
                ? "border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-60"
                : isConnecting && selectedRobotType === "real"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 opacity-50"
                  : selectedRobotType === "real"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
            }`}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">
                {isConnecting && selectedRobotType === "real" ? (
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                ) : (
                  "🤖"
                )}
              </div>
              <div className="font-medium text-sm">Real Robot</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {isBluetoothSupported
                  ? isConnecting && selectedRobotType === "real"
                    ? "Connecting..."
                    : "Connect via Bluetooth"
                  : "Bluetooth not supported - use Chrome/Edge"}
              </div>
            </div>
          </button>

          <button
            onClick={() => handleRobotTypeSelection("virtual")}
            disabled={isConnecting}
            className={`p-3 rounded-lg border-2 transition-all ${
              isConnecting && selectedRobotType === "virtual"
                ? "border-green-500 bg-green-50 dark:bg-green-900/20 opacity-50"
                : selectedRobotType === "virtual"
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
            }`}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">
                {isConnecting && selectedRobotType === "virtual" ? (
                  <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                ) : (
                  "🖥️"
                )}
              </div>
              <div className="font-medium text-sm">Virtual Robot</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {isConnecting && selectedRobotType === "virtual"
                  ? "Connecting..."
                  : "Simulate for testing"}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Instructions Modal */}
      <RobotInstructionsModal
        isOpen={showInstructions}
        onClose={handleCloseInstructions}
        isConnecting={isConnecting && selectedRobotType === "real"}
        onTryAgain={handleTryAgain}
      />

      {/* Info Text */}
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
        {isConnecting ? (
          <p>
            {selectedRobotType === "real"
              ? "Opening Bluetooth pairing dialog..."
              : "Connecting to virtual robot..."}
          </p>
        ) : (
          <p>Select a robot type above to get started with PyBricks Pilot.</p>
        )}
      </div>
    </div>
  );
}
