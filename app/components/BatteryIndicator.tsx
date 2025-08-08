interface BatteryIndicatorProps {
  level?: number;
  className?: string;
}

export function BatteryIndicator({ level, className = '' }: BatteryIndicatorProps) {
  if (level === undefined) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-8 h-4 border-2 border-gray-400 rounded-sm relative">
          <div className="absolute -right-1 top-1 w-1 h-2 bg-gray-400 rounded-r-sm"></div>
          <div className="w-full h-full bg-gray-200 rounded-sm"></div>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">--</span>
      </div>
    );
  }

  const getBatteryColor = () => {
    if (level >= 60) return 'bg-green-500';
    if (level >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getBorderColor = () => {
    if (level >= 60) return 'border-green-600';
    if (level >= 30) return 'border-yellow-600';
    return 'border-red-600';
  };

  const getTextColor = () => {
    if (level >= 60) return 'text-green-800 dark:text-green-300';
    if (level >= 30) return 'text-yellow-800 dark:text-yellow-300';
    return 'text-red-800 dark:text-red-300';
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`w-8 h-4 border-2 ${getBorderColor()} rounded-sm relative`}>
        <div className="absolute -right-1 top-1 w-1 h-2 bg-current rounded-r-sm"></div>
        <div 
          className={`h-full ${getBatteryColor()} rounded-sm transition-all duration-300`}
          style={{ width: `${Math.max(level, 5)}%` }}
        ></div>
      </div>
      <span className={`text-sm font-medium ${getTextColor()}`}>{level}%</span>
    </div>
  );
}