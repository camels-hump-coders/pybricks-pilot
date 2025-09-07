import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { DebugEventEntry } from "./DebugEventEntry";
import { showDebugDetailsAtom } from "../store/atoms/matUIState";
import {
  clearDebugEventsAtom,
  clearProgramOutputLogAtom,
  debugEventsAtom,
  programOutputLogAtom,
} from "../store/atoms/robotConnection";

export function DebugDetailsModal() {
  const [open, setOpen] = useAtom(showDebugDetailsAtom);
  const debugEvents = useAtomValue(debugEventsAtom);
  const programOutputLog = useAtomValue(programOutputLogAtom);
  const clearDebug = useSetAtom(clearDebugEventsAtom);
  const clearLog = useSetAtom(clearProgramOutputLogAtom);

  // Rendering logic is shared via DebugEventEntry

  if (!open) return null;

  const lastEvents = debugEvents.slice(-100).reverse();
  const lastLogs = programOutputLog.slice(-200);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="bg-white dark:bg-gray-800 w-full max-w-3xl rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Upload & Run Details
          </h3>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          <div className="border rounded-md border-gray-200 dark:border-gray-700">
            <div className="px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">
              Compiler & Upload Events (latest first)
            </div>
            <div className="p-2 space-y-2 text-xs text-gray-800 dark:text-gray-200 max-h-[30vh] overflow-y-auto">
              {lastEvents.length === 0 ? (
                <div className="text-gray-500">No debug events</div>
              ) : (
                lastEvents.map((e, idx) => <DebugEventEntry key={idx} event={e} />)
              )}
            </div>
          </div>
          <div className="border rounded-md border-gray-200 dark:border-gray-700">
            <div className="px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">
              Program Output Log (tail)
            </div>
            <div className="p-2 text-xs font-mono text-gray-800 dark:text-gray-200 max-h-[30vh] overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-b-md">
              {lastLogs.length === 0 ? (
                <div className="text-gray-500">No output</div>
              ) : (
                lastLogs.map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700">
          <div className="space-x-2">
            <button
              onClick={() => clearDebug()}
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Clear Events
            </button>
            <button
              onClick={() => clearLog()}
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Clear Log
            </button>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
