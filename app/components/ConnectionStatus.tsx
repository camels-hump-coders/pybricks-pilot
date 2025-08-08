import type { HubInfo } from '../services/bluetooth';

interface ConnectionStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  hubInfo: HubInfo | null;
  connectionError?: Error | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  className?: string;
}

export function ConnectionStatus({
  isConnected,
  isConnecting,
  hubInfo,
  connectionError,
  onConnect,
  onDisconnect,
  className = ''
}: ConnectionStatusProps) {
  const getStatusColor = () => {
    if (isConnecting) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700';
    if (isConnected) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700';
    if (connectionError) return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700';
    return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
  };

  const getStatusIcon = () => {
    if (isConnecting) return '🔄';
    if (isConnected) return '✅';
    if (connectionError) return '❌';
    return '📶';
  };

  const getStatusText = () => {
    if (isConnecting) return 'Connecting...';
    if (isConnected && hubInfo) return `Connected to ${hubInfo.name}`;
    if (isConnected) return 'Connected';
    if (connectionError) return 'Connection Failed';
    return 'Not Connected';
  };

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {isConnecting ? (
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : (
              getStatusIcon()
            )}
          </span>
          <div>
            <h3 className="font-medium">{getStatusText()}</h3>
            {hubInfo && (
              <div className="text-sm opacity-75 mt-1">
                {hubInfo.manufacturer && <span>{hubInfo.manufacturer} • </span>}
                {hubInfo.firmwareRevision && <span>FW: {hubInfo.firmwareRevision} • </span>}
                {hubInfo.batteryLevel !== undefined && <span>Battery: {hubInfo.batteryLevel}%</span>}
              </div>
            )}
            {connectionError && (
              <div className="text-sm opacity-75 mt-1">
                {connectionError.message}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={onDisconnect}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {isConnecting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Connection Quality Indicator */}
      {isConnected && (
        <div className="mt-3 pt-3 border-t border-current/20">
          <div className="flex items-center justify-between text-sm">
            <span>Connection Quality</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((bar) => (
                <div
                  key={bar}
                  className={`w-1 h-3 rounded-full ${
                    bar <= 4 ? 'bg-current' : 'bg-current/30'
                  }`}
                  style={{ height: `${bar * 3 + 3}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}