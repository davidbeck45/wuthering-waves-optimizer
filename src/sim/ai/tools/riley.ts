// Wuthering Tools+ AI tools — Riley31415's wuwa_calc engine as the batch-2 tools take it (energy check, ToA check,
// rotation cue card, build-team plan): one small surface over the Riley run seam (src/sim/engine/), handed in through
// `ctx.riley` so this module never loads his engine itself. The browser fills it from `rileyClient()` (the solver
// worker; src/sim/ai/rileyBrowser.ts), the CLI from `rileyHeadless()` (src/sim/cli/aiRiley.ts), tests from either.
// Also the one reading of a team argument the Riley tools share: a saved team, or three characters by name.
import type { ExportFile } from "../../cli/exportShape";
import { findTeam } from "../../cli/engine";
import { savedTeamOf as savedCompositionOf } from "../../engine/rileyAccount";
import type { FightCurve, MineSolve, RileyAccount, RileyPick, RileyTeamInfo, RunLite, SubsMode } from "../../engine/rileyRun";
import type { FloorProfileSpec } from "../../endgame/effects";
import { resolveTeamBuilds } from "../../teamContext/resolveTeam";
import { characterName, resolveAnyCharacter, type ToolContext } from "./shared";
import { accountKeyOf } from "../../rankings/rileyNames";

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
  /** an untraced run of fixed picks against each enemy profile, as its damage curve (the ToA check); `spread`: with each
   *  hit's crit (the clear odds) */
  curves(teamKey: string, picks: RileyPick[], profiles: Array<FloorProfileSpec | null>, opts?: { spread?: boolean }): Promise<FightCurve[]>;
}

export type RileyProvider = (exp: ExportFile) => Promise<RileyToolEngine>;
/* eslint-enable no-unused-vars */

/** The engine for this call, or a plain error the model can read. */
export async function rileyOf(ctx: ToolContext): Promise<RileyToolEngine> {
  if (!ctx.riley) throw new Error("wuwa_calc's engine is not available here, so this tool can't run");
  return ctx.riley(ctx.exp);
}

/** The engine a team is asked at. A saved team runs the builds it pins (with team buffs on, also a build named after
 *  both teammates), and /energy, /rotation and /endgame ask wuwa_calc at that team's own account
 *  (engine/rileyAccount.ts `rileyAccountForTeam`). These tools asked at every character's active build: "Explain these
 *  needs" on a team whose pins run 353,983 DPS answered 367,567 beside the pinned build's own Energy Regen. A provider
 *  takes its account as an export, so it is handed the export as that team reads it; `base` (the engine at the active
 *  builds) for three nobody saved and for a team that runs the active builds anyway. */
export async function rileyForTeam(ctx: ToolContext, target: { saved: Record<string, any> | null }, base: RileyToolEngine): Promise<RileyToolEngine> {
  const team = target.saved;
  if (!team || !ctx.riley) return base;
  const built = resolveTeamBuilds({ characterIds: team.characterIds ?? [], buildIds: team.buildIds ?? [] }, ctx.exp.characters, { auto: ctx.autoBuffs ?? true });
  return built.characters === ctx.exp.characters ? base : ctx.riley({ ...ctx.exp, characters: built.characters });
}

/** The builds a saved team runs that are not their member's active one, as an answer names them ("Aemeath on “Account
 *  plan”"): the builds `rileyForTeam` asks at. Empty for three nobody saved and for a team on the active builds. */
export function pinnedBuildsOf(ctx: ToolContext, target: { saved: Record<string, any> | null }): string[] {
  const team = target.saved;
  if (!team) return [];
  return resolveTeamBuilds({ characterIds: team.characterIds ?? [], buildIds: team.buildIds ?? [] }, ctx.exp.characters, { auto: ctx.autoBuffs ?? true })
    .slots.filter((s) => s.buildId && s.buildId !== (ctx.exp.characters[s.characterId]?.activeBuildId ?? null))
    .map((s) => `${characterName(s.characterId)} on “${s.buildName ?? "a saved build"}”`);
}

export interface TeamTarget {
  /** the saved team's name, or the members joined with " · " */
  name: string;
  characterIds: string[];
  /** the saved team, when the argument named one */
  saved: Record<string, any> | null;
}

/** A target's members under the saved team's own keys and in its own order, else as the argument gave them. A wuwa_calc
 *  team key lists them in his order and names a Rover by his one form; the saved team is what the player set up, so a
 *  link or a build lookup made from it reads the same wherever the team was named from. */
export const memberKeysOf = (target: Pick<TeamTarget, "characterIds" | "saved">): string[] => {
  const own = ((target.saved?.characterIds ?? []) as Array<string | null>).filter((id): id is string => !!id);
  return own.length === target.characterIds.length ? own : target.characterIds;
};

const SEPARATORS = /\s*(?:,|\+|·|\/|&|\band\b)\s*/i;

/** The saved team of exactly these three, if the player has one (its name, builds and pins then apply). A Rover in
 *  either gender (engine/rileyAccount.ts `savedTeamOf` compares by wuwa_calc's names): a saved team may list the
 *  other gender than the one a key or a name resolves to, and it is still that team. */
function savedTeamOf(ids: string[], exp: ExportFile): Record<string, any> | null {
  return ids.length === 3 ? (savedCompositionOf(exp.teams as Array<Record<string, any>>, ids) ?? null) : null;
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
      // his list names a Rover by the female key: the account's own form, so its saved team and its build are found
      const ids = info.members.map((m) => accountKeyOf(m.appKey, exp.characters));
      const same = savedTeamOf(ids, exp);
      return { name: same ? String(same.name) : ids.map(characterName).join(" · "), characterIds: ids, saved: same };
    }
  }
  return teamTarget(input, exp);
}
