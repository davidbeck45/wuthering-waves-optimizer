// Wuthering Tools+ — the rotation view's preferences: localStorage `wtplus:rotation:v1` (beep, play text size,
// auto-advance pace, the HP lines, the last team opened). Plain data; a broken or foreign value reads as defaults.

export const ROTATION_PREFS_KEY = "wtplus:rotation:v1";

export type PlaySize = "m" | "l" | "xl";

export interface RotationPrefs {
  /** a short beep when a swap's expected time is up */
  beep: boolean;
  /** play mode's text size */
  size: PlaySize;
  /** play mode walks on by itself at the engine's pace × `pace` (0 = by tap only) */
  pace: 0 | 1 | 0.85 | 0.7;
  /** a custom HP line for the kill chips (the 1.5M / 3M / 4M lines are always drawn), 0 = none */
  hp: number;
  /** the last rotation opened (a /rotation hash), for the "continue" card */
  last: string;
  lastTitle: string;
}

export const DEFAULT_PREFS: RotationPrefs = { beep: false, size: "l", pace: 0, hp: 0, last: "", lastTitle: "" };

const PACES = [0, 1, 0.85, 0.7] as const;

export function readPrefs(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): RotationPrefs {
  try {
    const raw = storage?.getItem(ROTATION_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const v = JSON.parse(raw) as Partial<RotationPrefs>;
    return {
      beep: typeof v.beep === "boolean" ? v.beep : DEFAULT_PREFS.beep,
      size: v.size === "m" || v.size === "l" || v.size === "xl" ? v.size : DEFAULT_PREFS.size,
      pace: PACES.includes(v.pace as (typeof PACES)[number]) ? (v.pace as RotationPrefs["pace"]) : DEFAULT_PREFS.pace,
      hp: typeof v.hp === "number" && Number.isFinite(v.hp) && v.hp >= 0 ? v.hp : DEFAULT_PREFS.hp,
      last: typeof v.last === "string" ? v.last.slice(0, 600) : "",
      lastTitle: typeof v.lastTitle === "string" ? v.lastTitle.slice(0, 200) : "",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(prefs: RotationPrefs, storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(ROTATION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / over quota: the defaults come back next visit */
  }
}
