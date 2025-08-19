import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { missionBoundsAtom } from "../store/atoms/canvasState";
import { customMatConfigAtom } from "../store/atoms/gameMat";
import { popoverObjectAtom } from "../store/atoms/matUIState";

/**
 * Custom hook for handling mission interactions (scoring and clicking)
 */
export function useMissionInteractions() {
  const customMatConfig = useAtomValue(customMatConfigAtom);
  const missionBounds = useAtomValue(missionBoundsAtom);
  const setPopoverObject = useSetAtom(popoverObjectAtom);

  const checkMissionClick = useCallback(
    (canvasX: number, canvasY: number): string | null => {
      if (!customMatConfig) return null;

      // Check against stored bounding boxes for accurate hit detection
      for (const [objId, bounds] of missionBounds) {
        if (
          canvasX >= bounds.x &&
          canvasX <= bounds.x + bounds.width &&
          canvasY >= bounds.y &&
          canvasY <= bounds.y + bounds.height
        ) {
          return objId;
        }
      }

      return null;
    },
    [customMatConfig, missionBounds],
  );

  const createToggleObjective = useCallback(
    (
      setScoringState: React.Dispatch<React.SetStateAction<any>>,
      showScoring: boolean,
    ) =>
      (
        objectId: string,
        objectiveId: string,
        _points: number,
        choiceId: string,
      ) => {
        if (!showScoring) return;

        setScoringState((prev: any) => {
          const currentObjectives = prev[objectId]?.objectives || {};
          const currentState = currentObjectives[objectiveId];
          const isCompleted = currentState?.completed || false;
          const mission = customMatConfig?.missions.find(
            (m) => m.id === objectId,
          );
          const objective = mission?.objectives.find(
            (o) => o.id === objectiveId,
          );

          if (!objective) return prev;

          const newObjectives = { ...currentObjectives };

          // All objectives now have choices - handle single selection
          if (isCompleted && currentState?.selectedChoiceId === choiceId) {
            // If clicking on already selected choice, deselect it
            newObjectives[objectiveId] = {
              completed: false,
              points: 0,
              selectedChoiceId: undefined,
            };
          } else {
            // Select the new choice
            const selectedChoice = objective.choices.find(
              (c) => c.id === choiceId,
            );
            if (selectedChoice) {
              newObjectives[objectiveId] = {
                completed: true,
                points: selectedChoice.points,
                selectedChoiceId: choiceId,
              };
            }
          }

          const newState = {
            ...prev,
            [objectId]: {
              objectives: newObjectives,
            },
          };

          // Score is automatically tracked via Jotai currentScore atom

          return newState;
        });
      },
    [customMatConfig],
  );

  const handleMissionClick = useCallback(
    (
      canvasX: number,
      canvasY: number,
      showScoring: boolean,
      controlMode: string,
    ): boolean => {
      // Check for mission clicks (if scoring is enabled and in program mode)
      if (showScoring && controlMode === "program") {
        const clickedObjectId = checkMissionClick(canvasX, canvasY);
        if (clickedObjectId) {
          setPopoverObject(clickedObjectId);
          return true; // Click was handled
        } else {
          // Close popover if clicking elsewhere
          setPopoverObject(null);
        }
      }
      return false; // Click was not handled
    },
    [checkMissionClick, setPopoverObject],
  );

  return {
    checkMissionClick,
    createToggleObjective,
    handleMissionClick,
  };
}
