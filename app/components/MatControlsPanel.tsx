import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { hasDirectoryAccessAtom } from "../store/atoms/fileSystem";
import { currentScoreAtom } from "../store/atoms/gameMat";
import {
  isMatConfigLoadingAtom,
  lowQualityModeAtom,
  matEditorModeAtom,
  showMapSelectorAtom,
  showMatEditorAtom,
  showScoringAtom,
} from "../store/atoms/matUIState";
import { encodeScoringState, hasScoringData } from "../utils/scoringShare";

interface MatControlsPanelProps {
  onClearMat: () => void;
}

export function MatControlsPanel({ onClearMat }: MatControlsPanelProps) {
  const { customMatConfig, scoringState } = useJotaiGameMat();
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  const currentScore = useAtomValue(currentScoreAtom);
  const [showScoring, setShowScoring] = useAtom(showScoringAtom);
  const [, setShowMapSelector] = useAtom(showMapSelectorAtom);
  const [, setShowMatEditor] = useAtom(showMatEditorAtom);
  const [, setMatEditorMode] = useAtom(matEditorModeAtom);
  const isLoadingConfig = useAtomValue(isMatConfigLoadingAtom);
  const [lowQuality, setLowQuality] = useAtom(lowQualityModeAtom);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const canShareScore = hasScoringData(scoringState);

  const handleShareScore = async () => {
    if (!canShareScore || typeof window === "undefined") {
      return;
    }

    try {
      const encodedScore = encodeScoringState(scoringState);
      const url = new URL(window.location.href);
      url.searchParams.set("score", encodedScore);

      if (customMatConfig?.name) {
        url.searchParams.set("mat", customMatConfig.name);
      } else {
        url.searchParams.delete("mat");
      }

      const shareUrl = url.toString();

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setShareStatus("copied");
      window.setTimeout(() => setShareStatus("idle"), 2500);
    } catch (error) {
      console.error("Failed to copy scoring link", error);
      setShareStatus("error");
      window.setTimeout(() => setShareStatus("idle"), 3000);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
      <div className="p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Mat Controls
        </h3>
      </div>
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Current:{" "}
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {customMatConfig ? customMatConfig.name : "Loading..."}
          </span>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowMapSelector(true)}
            disabled={isLoadingConfig}
            className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🗺️ Select Mat
          </button>
          {hasDirectoryAccess ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMatEditorMode("edit");
                  setShowMatEditor(true);
                }}
                disabled={!customMatConfig || isLoadingConfig}
                className="w-full px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  !customMatConfig ? "Select a map first" : "Edit current map"
                }
              >
                ✏️ Edit Mat
              </button>
              <button
                type="button"
                onClick={() => {
                  setMatEditorMode("new");
                  setShowMatEditor(true);
                }}
                className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
              >
                ➕ New Mat
              </button>
            </>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400">📁</span>
                <div className="text-xs text-yellow-700 dark:text-yellow-300">
                  <div className="font-medium">
                    Mount a directory to create or edit mats
                  </div>
                  <div className="text-xs mt-1 text-yellow-600 dark:text-yellow-400">
                    Mat configurations are saved to{" "}
                    <code className="font-mono">
                      ./config/mats/&lt;id&gt;/mat.json
                    </code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {customMatConfig && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowScoring(!showScoring)}
              className={`px-2 py-1.5 rounded text-xs font-medium border ${
                showScoring
                  ? "bg-green-50 dark:bg-green-900 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
                  : "bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
              }`}
            >
              {showScoring ? `Scoring: On (${currentScore})` : "Scoring: Off"}
            </button>
            <button
              type="button"
              onClick={onClearMat}
              className="px-2 py-1.5 rounded text-xs font-medium border bg-red-50 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
            >
              🧹 Clear Custom Mat
            </button>
            <button
              type="button"
              onClick={handleShareScore}
              disabled={!canShareScore}
              className={`col-span-2 px-2 py-1.5 rounded text-xs font-medium border flex items-center justify-center gap-2 ${
                canShareScore
                  ? "bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800"
                  : "bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400 cursor-not-allowed"
              }`}
            >
              <span>🔗 Share Score</span>
              {shareStatus === "copied" && (
                <span className="text-green-600 dark:text-green-300">
                  Copied!
                </span>
              )}
              {shareStatus === "error" && (
                <span className="text-red-600 dark:text-red-300">Failed</span>
              )}
            </button>
          </div>
        )}

        {/* Performance settings */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
              ⚡ Low Quality Mode
            </div>
            <span className="relative group cursor-help text-gray-500 dark:text-gray-400">
              ℹ️
              <div
                role="tooltip"
                className="absolute right-0 mt-1 z-20 hidden group-hover:block bg-gray-900 text-white text-xs p-2 rounded shadow-lg w-64"
              >
                - Skips heavy gradients and shadows
                <br />- Samples telemetry path to ~2000 points
                <br />- Slightly reduces stroke widths
                <br />- Disables oriented grid under certain conditions
              </div>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !lowQuality;
              setLowQuality(next);
              try {
                localStorage.setItem("ui.lowQualityMode", String(next));
              } catch {}
            }}
            className={`w-full px-3 py-2 rounded text-sm transition-colors ${
              lowQuality
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "bg-gray-500 text-white hover:bg-gray-600"
            }`}
          >
            {lowQuality ? "Turn Off" : "Turn On"}
          </button>
        </div>
      </div>
    </div>
  );
}
