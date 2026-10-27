// Wuthering Tools+ share cards — the share sheet's remembered choices (card theme, engine numbers). The UID switch is
// deliberately not remembered: it starts off every time.
export const SHARE_PREFS_KEY = "wtplus:share:prefs";

export interface SharePrefs {
  theme: "dark" | "light";
  showNumbers: boolean;
}

const DEFAULTS: SharePrefs = { theme: "dark", showNumbers: true };

export function readPrefs(): SharePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(SHARE_PREFS_KEY) ?? "{}") as Partial<SharePrefs>;
    return {
      theme: raw.theme === "light" ? "light" : "dark",
      showNumbers: typeof raw.showNumbers === "boolean" ? raw.showNumbers : DEFAULTS.showNumbers,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePrefs(prefs: SharePrefs): void {
  try {
    localStorage.setItem(SHARE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable: the choice holds for this page only
  }
}
