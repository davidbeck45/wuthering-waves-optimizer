// Wuthering Tools+ — "one team, one number" (2026-11-02): the rule set every plus page follows when it prints a damage
// or Energy Regen figure, and the short labels and "why do these differ?" sentences that go beside one. The README's
// "One team, one number" section is the design record; `numberBasis.test.ts` runs one fixture account and team
// through each page's view model and checks that figures meant to be equal are equal, and the rest carry a label.
//
// The rules:
// 1. Two engines, never mixed in one figure. This app's engine (the calculator, /account, /my-rankings, Teams, share
//    cards, Build my team's scores) plays a saved action list on the player's own builds; Riley31415's wuwa_calc
//    (/energy, /rotation, /endgame, /rankings, Sync my teams) plays its own frame-timed loop of the team.
// 2. Units: this app counts damage per rotation (average: crit chance × crit damage folded in) and DPS only where the
//    rotation has a duration (average ÷ duration). wuwa_calc counts DPS; /rankings' DPR is one rotation's damage,
//    averaged over his four.
// 3. Average, never non-crit, unless the figure says so: the Teams editor's share bar, its header and the Summary pie
//    all split average damage.
// 4. Substats: this app always runs the echoes each character wears. wuwa_calc runs a spread, named beside every
//    figure: your own echoes (/energy, /rotation, /endgame, Build my team; ChemX32 for a character with none), or the
//    /rankings bar's Substats choice (Riley's ChemX32 by default, High Invest, or My builds) — Sync my teams too.
// 5. Enemy: level 100 at 20 % resistance (Riley's target) for /my-rankings, /account, share cards and wuwa_calc; the
//    Teams page and the calculator use each team's or character's own enemy settings.
// 6. Energy Regen "have": the Energy check's basis everywhere a need is compared with it (/energy, Build my team, the
//    Echo Lab): the build card's ER plus a kit's always-on ER that the app keeps as a switch (`KIT_CONSTANT_ER`,
//    Mornye +10 %). Build history and the share cards show the build card's figure, without it.
// 7. One name per team: `teamTitle` / `teamLabel` ("Aemeath · Mornye + Lynae"), the investment tier as a second line.
// Pure: no Vue, no stores.

/** wuwa_calc's substat spreads: the /rankings hash's `sb` ("" | "h" | "m") or the engine's `SubsMode`. */
export type SpreadMode = "standard" | "high" | "mine";

/** "" / "standard" → standard, "h" / "high" → high, "m" / "mine" → mine; anything else reads as Riley's default. */
export function spreadOf(mode: string | null | undefined): SpreadMode {
  const m = String(mode ?? "").trim();
  if (m === "h" || m === "high") return "high";
  if (m === "m" || m === "mine") return "mine";
  return "standard";
}

/** The spread in two or three words, for a figure's label: "ChemX32 substats", "High Invest substats", "your echoes". */
export function spreadLabel(mode: string | null | undefined): string {
  const s = spreadOf(mode);
  return s === "high" ? "High Invest substats" : s === "mine" ? "your echoes" : "ChemX32 substats";
}

/** The spread in a sentence's words. */
export function spreadSentence(mode: string | null | undefined): string {
  const s = spreadOf(mode);
  if (s === "high") return "Riley's High Invest substats on every member";
  if (s === "mine") return "the echoes each character wears in this app (Riley's ChemX32 substats for one with none)";
  return "Riley's ChemX32 substats, not your echoes";
}

/** The line under /rankings' bar on the My account tier: what the rows are, and why they differ from /account. `short`
 *  for a phone's ⋯ menu, under its Substats pick (the card list already heads itself "… · <spread>"): only the why. */
export function rankingsMineNote(mode: string | null | undefined, short = false): string {
  const s = spreadOf(mode);
  if (short) {
    if (s === "mine") return "Your own echoes, as Energy check and Rotation run them. /account counts this app's engine, per rotation.";
    return `${s === "high" ? "High Invest" : "ChemX32"} substats, not your echoes: pick My builds above to match Energy check and Rotation.`;
  }
  const base = `wuwa_calc at your sequences, weapons and refinements, on ${spreadSentence(s)}.`;
  if (s === "mine") return `${base} Energy check and Rotation run the same; /account and My roster rankings use this app's engine, per rotation.`;
  return `${base} Pick My builds under Substats for your own echoes, as Energy check and Rotation run them.`;
}

/** Why one team has two damage figures: this app's engine vs wuwa_calc. */
export const WHY_ENGINES_DIFFER =
  "This app's engine plays the team's saved action list on your builds and counts damage per rotation; wuwa_calc plays its own frame-timed loop of the team and counts damage per second. Both use your account, but they are two different simulations, so their figures for one team differ.";

/** The share sheet's note when it opens over a wuwa_calc page (/rotation, /energy, /endgame, /rankings). */
export const SHARE_ENGINE_NOTE =
  "The card's number is this app's engine on the team's saved rotation (as on the Teams page), not wuwa_calc's figure on the page behind this sheet.";

/** Paths whose figures are wuwa_calc's (rule 1). */
export const WUWA_CALC_PATHS: readonly string[] = ["/rotation", "/energy", "/endgame", "/rankings"];
export const isWuwaCalcPage = (path: string | null | undefined): boolean => WUWA_CALC_PATHS.some((p) => path === p || Boolean(path?.startsWith(`${p}/`)));
