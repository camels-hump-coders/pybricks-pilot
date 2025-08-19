import { useState } from "react";
import { usePositionManager } from "../hooks/usePositionManager";
import type { NamedPosition } from "../store/atoms/positionManagement";

interface PositionSelectorProps {
  className?: string;
  onPositionSelected?: (position: NamedPosition) => void;
  showManagementButton?: boolean;
}

/**
 * Dropdown selector for robot positions with management options
 */
export function PositionSelector({
  className = "",
  onPositionSelected,
  showManagementButton = true,
}: PositionSelectorProps) {
  const {
    positions,
    selectedPosition,
    selectedPositionId,
    selectPosition,
    canCreateCustomPositions,
    setIsPositionManagementOpen,
    setIsAddPositionDialogOpen,
  } = usePositionManager();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSelectPosition = (position: NamedPosition) => {
    selectPosition(position.id);
    setIsDropdownOpen(false);
    onPositionSelected?.(position);
  };

  const handleOpenManagement = () => {
    setIsPositionManagementOpen(true);
    setIsDropdownOpen(false);
  };

  const handleAddNewPosition = () => {
    setIsAddPositionDialogOpen(true);
    setIsDropdownOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Main dropdown button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="w-full px-3 py-2 text-left bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {selectedPosition?.name || "Loading..."}
            </span>
            {selectedPosition && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                X: {Math.round(selectedPosition.x)}mm, Y:{" "}
                {Math.round(selectedPosition.y)}mm, θ:{" "}
                {Math.round(selectedPosition.heading)}°
              </span>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transform transition-transform ${
              isDropdownOpen ? "rotate-180" : "rotate-0"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
          <div className="py-1 max-h-64 overflow-y-auto">
            {/* Default positions */}
            {positions
              .filter((pos) => pos.isDefault)
              .map((position) => (
                <button
                  key={position.id}
                  onClick={() => handleSelectPosition(position)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    selectedPositionId === position.id
                      ? "bg-blue-50 dark:bg-blue-900"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {position.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        X: {Math.round(position.x)}mm, Y:{" "}
                        {Math.round(position.y)}mm, θ:{" "}
                        {Math.round(position.heading)}°
                      </span>
                    </div>
                    <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                      Default
                    </span>
                  </div>
                </button>
              ))}

            {/* Custom positions */}
            {positions.filter((pos) => pos.isCustom).length > 0 && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
                {positions
                  .filter((pos) => pos.isCustom)
                  .map((position) => (
                    <button
                      key={position.id}
                      onClick={() => handleSelectPosition(position)}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 ${
                        selectedPositionId === position.id
                          ? "bg-blue-50 dark:bg-blue-900"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {position.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            X: {Math.round(position.x)}mm, Y:{" "}
                            {Math.round(position.y)}mm, θ:{" "}
                            {Math.round(position.heading)}°
                          </span>
                        </div>
                        <span className="text-xs bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                          Custom
                        </span>
                      </div>
                    </button>
                  ))}
              </>
            )}

            {/* Management options */}
            {canCreateCustomPositions && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>

                <button
                  onClick={handleAddNewPosition}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-blue-600 dark:text-blue-400"
                >
                  <div className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span className="text-sm font-medium">
                      Add New Position
                    </span>
                  </div>
                </button>

                {showManagementButton && (
                  <button
                    onClick={handleOpenManagement}
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400"
                  >
                    <div className="flex items-center">
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span className="text-sm">Manage Positions</span>
                    </div>
                  </button>
                )}
              </>
            )}

            {!canCreateCustomPositions && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  Custom positions require a mounted folder
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  );
}
