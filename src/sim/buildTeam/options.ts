// Wuthering Tools+ — Build my team's switches and their saved copy, in a module of their own (no engine imports), so
// /account's echo check can key its cache on them without loading the optimizer. constraints.ts re-exports them.

/** The switches the page offers (defaults in `DEFAULT_OPTIONS`). */
export interface BuildOptions {
  /** only echoes of the plan's sets (Riley's pick or the preset's) */
  useSets: boolean;
  /** only main stats the plan's layout puts at each cost */
  useMainStats: boolean;
  /** keep each member's current main echo instead of the plan's */
  keepMainEcho: boolean;
  /** take echoes other characters (outside the team) wear in their active build */
  takeFromOthers: boolean;
  /** try every priority order and keep the best team value (only when the pools are small) */
  tryAllOrders: boolean;
}

export const DEFAULT_OPTIONS: BuildOptions = { useSets: true, useMainStats: true, keepMainEcho: false, takeFromOthers: false, tryAllOrders: true };

/** localStorage: the page's switches */
export const OPTIONS_KEY = "wtplus:buildTeam:options:v1";

/** The saved switches: only the known ones, only booleans (a hand-edited or older value never reaches the run). */
export function parseBuildOptions(raw: string | null | undefined): BuildOptions {
  const out = { ...DEFAULT_OPTIONS };
  if (!raw) return out;
  try {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_OPTIONS) as Array<keyof BuildOptions>) if (typeof saved?.[k] === "boolean") out[k] = saved[k] as boolean;
  } catch {
    // unreadable: defaults
  }
  return out;
}

/** The player's saved switches (/build-team and /account's echo check read them, so both run the same search). */
export function readBuildOptions(): BuildOptions {
  try {
    return parseBuildOptions(typeof localStorage === "undefined" ? null : localStorage.getItem(OPTIONS_KEY));
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}
