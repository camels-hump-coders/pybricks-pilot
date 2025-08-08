import { useRef } from "react";

interface ProgramOutputLogProps {
  outputLog: string[];
  onClear: () => void;
  className?: string;
}

export function ProgramOutputLog({
  outputLog,
  onClear,
  className = "",
}: ProgramOutputLogProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  const hasOutput = outputLog.length > 0;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-700 dark:text-gray-300">Program Output</h4>
          <div className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
            {outputLog.length} lines
          </div>
        </div>
        <button
          onClick={onClear}
          disabled={!hasOutput}
          className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>

      <div className="relative">
        {!hasOutput ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-2xl mb-2">📝</div>
            <p className="text-sm">No program output yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Output from print() statements and system messages will appear
              here
            </p>
          </div>
        ) : (
          <div className="h-64 overflow-y-auto bg-gray-900 dark:bg-gray-700 text-green-400 dark:text-green-300 font-mono text-xs">
            <div className="p-3 space-y-0.5">
              {outputLog.map((line, index) => (
                <div
                  key={index}
                  className="whitespace-pre-wrap break-all hover:bg-gray-800 dark:hover:bg-gray-600 px-2 py-1 rounded transition-colors"
                >
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>

      {hasOutput && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
          <span>
            Terminal-style output • Auto-scrolls to latest • Max 200 lines
          </span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 dark:bg-green-300 rounded-full animate-pulse"></div>
            <span>Live</span>
          </div>
        </div>
      )}
    </div>
  );
}
