// Utilities for normalizing program output and error lines across the app

const SYS_EXIT = "The program was stopped (SystemExit)";

/**
 * Normalize a single program output line.
 * - If the line contains a SystemExit marker (even with trailing punctuation or
 *   surrounding text/timestamps/JSON), return just the canonical SystemExit text.
 * - Otherwise return the input trimmed.
 */
export function normalizeProgramLine(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();

  // Fast path exact match
  if (raw === SYS_EXIT) return SYS_EXIT;

  // Handle lines that end with the marker and optionally punctuation
  // Examples:
  //   "{...} The program was stopped (SystemExit)."
  //   "[12:00:00] The program was stopped (SystemExit)"
  const idx = raw.lastIndexOf(SYS_EXIT);
  if (idx !== -1) {
    return SYS_EXIT;
  }

  return raw;
}

