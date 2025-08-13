import { atom } from "jotai";
import type { PythonFile } from "../../types/fileSystem";

export interface SelectedProgramData {
  file: PythonFile;
  content: string;
  availableFiles: PythonFile[];
}

/**
 * Stores the currently selected program for quick iteration
 * This allows the robot controls to show Upload & Run for the active program
 */
export const selectedProgramAtom = atom<SelectedProgramData | null>(null);

/**
 * Action atom to set the selected program
 */
export const setSelectedProgramAtom = atom(
  null,
  (get, set, program: SelectedProgramData | null) => {
    set(selectedProgramAtom, program);
  }
);

/**
 * Action atom to clear the selected program
 */
export const clearSelectedProgramAtom = atom(
  null,
  (get, set) => {
    set(selectedProgramAtom, null);
  }
);