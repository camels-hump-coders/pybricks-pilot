import type { Mission } from "../schemas/GameMatConfig";
import {
  getMaxPointsForMission,
  getTotalPointsForMission,
  type ScoringState,
} from "../utils/scoringUtils";

interface ScoringModalProps {
  mission: Mission;
  scoringState: ScoringState;
  onClose: () => void;
  onToggleObjective: (
    missionId: string,
    objectiveId: string,
    points: number,
    choiceId: string,
  ) => void;
}

export function ScoringModal({
  mission,
  scoringState,
  onClose,
  onToggleObjective,
}: ScoringModalProps) {
  const currentPoints = getTotalPointsForMission(mission, scoringState);
  const maxPoints = getMaxPointsForMission(mission);

  return (
    <>
      {/* Backdrop - full screen on mobile, right side only on large screens */}
      <button
        className="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity md:right-0 md:left-auto md:w-1/3 lg:w-1/4 xl:w-1/5"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClose();
        }}
        aria-label="Close scoring panel"
      />

      {/* Side Panel */}
      <div className="fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-white dark:bg-gray-800 border-l border-gray-300 dark:border-gray-600 shadow-xl transform transition-transform duration-300 ease-in-out">
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base">
              {mission.name}
            </h4>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              ✕
            </button>
          </div>

          {mission.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
              {mission.description}
            </p>
          )}

          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
            Score: {currentPoints}/{maxPoints} points
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
            {mission.objectives.map((objective, index) => {
              const objectiveState =
                scoringState[mission.id]?.objectives?.[objective.id];
              const isCompleted = objectiveState?.completed || false;

              // All objectives now have choices
              return (
                <div key={objective.id} className="space-y-2">
                  {objective.description && (
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {objective.description}
                    </div>
                  )}
                  {objective.choices.map((choice) => {
                    const isChoiceSelected =
                      isCompleted &&
                      objectiveState?.selectedChoiceId === choice.id;

                    return (
                      <button
                        key={choice.id}
                        onClick={() =>
                          onToggleObjective(
                            mission.id,
                            objective.id,
                            choice.points,
                            choice.id,
                          )
                        }
                        className={`w-full text-left p-3 rounded-lg text-sm transition-colors touch-manipulation ${
                          isChoiceSelected
                            ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700"
                            : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-3 flex-1 pr-3">
                            <span className="flex-shrink-0">
                              <span
                                className={`w-4 h-4 rounded-full border-2 inline-block ${
                                  isChoiceSelected
                                    ? "bg-green-600 border-green-600"
                                    : "border-gray-400 dark:border-gray-500"
                                }`}
                              >
                                {isChoiceSelected && (
                                  <span className="block w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5"></span>
                                )}
                              </span>
                            </span>
                            <span className="text-sm leading-relaxed">
                              {choice.description}
                            </span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">
                              {choice.points}pts
                            </span>
                            {choice.type === "bonus" && (
                              <span className="text-orange-500 text-xs bg-orange-100 dark:bg-orange-900 px-2 py-1 rounded-full font-medium">
                                bonus
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {/* Add dividing line between objectives (except after the last one) */}
                  {index < mission.objectives.length - 1 && (
                    <div className="border-t border-gray-300 dark:border-gray-600 my-3"></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
