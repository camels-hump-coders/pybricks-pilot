import type { ScoringState } from "./scoringUtils";

const toBase64 = (value: string): string => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf-8").toString("base64");
  }

  throw new Error("No base64 encoder available in this environment");
};

const fromBase64 = (value: string): string => {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf-8");
  }

  throw new Error("No base64 decoder available in this environment");
};

const toBase64Url = (value: string): string =>
  toBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");

const fromBase64Url = (value: string): string => {
  const paddedLength = (4 - (value.length % 4)) % 4;
  const padding = "=".repeat(paddedLength);
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + padding;
  return fromBase64(normalized);
};

export const encodeScoringState = (state: ScoringState): string =>
  toBase64Url(JSON.stringify(state));

export const decodeScoringState = (encoded: string): ScoringState | null => {
  try {
    const json = fromBase64Url(encoded);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      return parsed as ScoringState;
    }
    return null;
  } catch (error) {
    console.warn("Failed to decode scoring state", error);
    return null;
  }
};

export const hasScoringData = (state: ScoringState): boolean =>
  Object.values(state).some((mission) =>
    Object.values(mission?.objectives ?? {}).some((objective) =>
      Boolean(objective?.completed),
    ),
  );
