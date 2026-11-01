// Wuthering Tools+ AI tools — Riley31415's wuwa_calc engine as the batch-2 tools take it (energy check, ToA check,
// rotation cue card, build-team plan): one small surface over the Riley run seam (src/sim/engine/), handed in through
// `ctx.riley` so this module never loads his engine itself. The browser fills it from `rileyClient()` (the solver
// worker; src/sim/ai/rileyBrowser.ts), the CLI from `rileyHeadless()` (src/sim/cli/aiRiley.ts), tests from either.
// Also the one reading of a team argument the Riley tools share: a saved team, or three characters by name.
import type { ExportFile } from "../../cli/exportShape";
import { findTeam } from "../../cli/engine";
import type { FightCurve, MineSolve, RileyAccount, RileyPick, RileyTeamInfo, RunLite, SubsMode } from "../../engine/rileyRun";
import type { FloorProfileSpec } from "../../endgame/effects";
import { characterName, resolveAnyCharacter, type ToolContext } from "./shared";

/* eslint-disable no-unused-vars -- the parameters of an interface's method types */
/** Riley's engine at one account. Every call is the seam's: the release guard (Lily) rides on it. */
export interface RileyToolEngine {
  readonly commit: string;
  /** the account the engine runs at (null: nothing set up) */
  readonly account: RileyAccount | null;
  teams(): Promise<RileyTeamInfo[]>;
  /** his keys for a composition (app character keys, any order): every loadout variant of those three */
  teamKeysFor(characterIds: Array<string | null>): Promise<string[]>;
  /** the best `mine` row per key ("mine" = the account's echoes, "high" = his High Invest spread) */
  solveMine(teamKeys: string[], opts?: { subs?: SubsMode }): Promise<MineSolve[]>;
  /** the traced run on these picks (null: the best `mine` row) */
  tracedRun(teamKey: string, picks: RileyPick[] | null, opts?: { subs?: SubsMode }): Promise<RunLite>;
  /** an untraced run of fixed picks against each enemy profile, as its damage curve (the ToA check) */
  curves(teamKey: string, picks: RileyPick[], profiles: Array<FloorProfileSpec | null>): Promise<FightCurve[]>;
}

export type RileyProvider = (exp: ExportFile) => Promise<RileyToolEngine>;
/* eslint-enable no-unused-vars */

/** The engine for this call, or a plain error the model can read. */
export async function rileyOf(ctx: ToolContext): Promise<RileyToolEngine> {
  if (!ctx.riley) throw new Error("wuwa_calc's engine is not available here, so this tool can't run");
  return ctx.riley(ctx.exp);
}

export interface TeamTarget {
  /** the saved team's name, or the members joined with " · " */
  name: string;
  characterIds: string[];
  /** the saved team, when the argument named one */
  saved: Record<string, any> | null;
}

const SEPARATORS = /\s*(?:,|\+|·|\/|&|\band\b)\s*/i;

/** The saved team of exactly these three, if the player has one (its name, builds and pins then apply). */
function savedTeamOf(ids: string[], exp: ExportFile): Record<string, any> | null {
  return (
    (exp.teams ?? []).find((t: any) => {
      const theirs = ((t.characterIds ?? []) as Array<string | null>).filter(Boolean);
      return theirs.length === 3 && ids.every((id) => theirs.includes(id));
    }) ?? null
  );
}

/** A team argument: a saved team (loose name, id or 1-based index) or three characters ("Aemeath, Mornye, Lynae"). */
export function teamTarget(input: string, exp: ExportFile): TeamTarget {
  const text = input.trim();
  if (!text) throw new Error("Name a saved team, or three characters separated by commas");
  let savedError: Error;
  try {
    const saved = findTeam(text, exp.teams ?? []);
    const ids = ((saved.characterIds ?? []) as Array<string | null>).filter((id): id is string => !!id);
    return { name: String(saved.name ?? ids.map(characterName).join(" · ")), characterIds: ids, saved };
  } catch (error) {
    savedError = error instanceof Error ? error : new Error(String(error));
  }
  const parts = text.split(SEPARATORS).filter(Boolean);
  if (parts.length < 2) throw savedError;
  if (parts.length !== 3) throw new Error(`A team is three characters; "${text}" names ${parts.length}`);
  const ids = parts.map((p) => resolveAnyCharacter(p, exp));
  if (new Set(ids).size !== 3) throw new Error(`"${text}" names the same character twice`);
  const same = savedTeamOf(ids, exp);
  return { name: same ? String(same.name) : ids.map(characterName).join(" · "), characterIds: ids, saved: same };
}

const TEAM_KEY = /^t\d+$/i;

/** `teamTarget`, plus wuwa_calc's own team keys: "t269", or a /rotation row key ("t269-0.0.0.s1.r0…", what the page's
 *  address carries), read through his current team list — before any saved team, whose name may carry an old key. */
export async function rileyTeamTarget(input: string, exp: ExportFile, riley: RileyToolEngine): Promise<TeamTarget> {
  const key = input.trim().split("-")[0]!.toLowerCase();
  if (TEAM_KEY.test(key)) {
    const info = (await riley.teams()).find((t) => t.key === key);
    if (info) {
      const ids = info.members.map((m) => m.appKey);
      const same = savedTeamOf(ids, exp);
      return { name: same ? String(same.name) : ids.map(characterName).join(" · "), characterIds: ids, saved: same };
    }
  }
  return teamTarget(input, exp);
}
