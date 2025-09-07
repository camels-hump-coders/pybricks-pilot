import { useAtom, useSetAtom } from "jotai";
import {
  missionFeatureEnabledAtom,
  toggleMissionFeatureAtom,
} from "../store/atoms/featureFlags";

/**
 * Bottom-right hidden π toggle to enable/disable Mission features.
 * Appears only when hovering the small corner area.
 */
export function SecretPiToggle() {
  const [enabled] = useAtom(missionFeatureEnabledAtom);
  const toggle = useSetAtom(toggleMissionFeatureAtom);

  return (
    <div
      className="fixed bottom-2 right-2 z-50 group"
      // Small hover area; stays invisible unless hovered
      style={{ width: 28, height: 28 }}
      title={enabled ? "Disable Mission mode" : "Enable Mission mode"}
    >
      <button
        type="button"
        onClick={() => toggle()}
        className="w-full h-full rounded-full flex items-center justify-center select-none"
        // Keep the hit-area available but icon hidden unless hover
        style={{ background: "transparent" }}
      >
        <span
          className="text-xs font-semibold transition-opacity duration-150 opacity-0 group-hover:opacity-60 dark:group-hover:opacity-70"
          aria-hidden
        >
          π
        </span>
        <span className="sr-only">Toggle Mission features</span>
      </button>
    </div>
  );
}
