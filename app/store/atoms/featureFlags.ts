import { atom } from "jotai";

// Central feature flag for Mission-related UI
// Initializes from localStorage on first mount and persists on changes
const STORAGE_KEY = "feature.missionEnabled";

export const missionFeatureEnabledAtom = atom<boolean>(false);

missionFeatureEnabledAtom.onMount = (set) => {
  try {
    const stored = typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;
    if (stored !== null) {
      set(stored === "true");
    }
  } catch {
    // ignore storage errors
  }
};

export const toggleMissionFeatureAtom = atom(null, (get, set) => {
  const next = !get(missionFeatureEnabledAtom);
  set(missionFeatureEnabledAtom, next);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    }
  } catch {
    // ignore storage errors
  }
});

