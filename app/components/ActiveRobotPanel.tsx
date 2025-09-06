import { useAtomValue } from "jotai";
import { hasDirectoryAccessAtom } from "../store/atoms/fileSystem";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";

interface ActiveRobotPanelProps {
  onRobotBuilderOpen: () => void;
}

export function ActiveRobotPanel({ onRobotBuilderOpen }: ActiveRobotPanelProps) {
  const currentRobotConfig = useAtomValue(robotConfigAtom);
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
        Active Robot:
      </div>
      <div className="font-medium text-gray-900 dark:text-white text-sm">
        {currentRobotConfig.name}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {currentRobotConfig.dimensions.width}×
        {currentRobotConfig.dimensions.length} studs (
        {currentRobotConfig.dimensions.width * 8}×
        {currentRobotConfig.dimensions.length * 8}mm)
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        {hasDirectoryAccess ? (
          <button
            type="button"
            onClick={onRobotBuilderOpen}
            className="w-full px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            🧱 Customize Robot
          </button>
        ) : (
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 dark:text-yellow-400 text-xs">📁</span>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <div>Mount a directory to customize robot</div>
              <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-500">
                Configs saved to <code className="font-mono text-xs">./config/robots/</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

