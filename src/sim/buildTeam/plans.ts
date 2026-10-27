// Wuthering Tools+ — "Build it for me": the plan per member, from Riley's best `mine` row when the team is one of his
// compositions, else from Ryan's curated echo presets. Shared by the page (rileyClient, the solver worker) and the
// CLI (rileyHeadless): the seam is passed in as `RileySource`, so this module never loads his engine itself.
import { getCharByName } from "../../characters/characters";
import type { MineSolve, RileyPick, RunLite } from "../engine/rileyRun";
import { emptyPlan, planFromCurrent, planFromPreset, planFromRiley, type MemberPlan, type PresetEcho } from "./rileyPlan";

/** The Riley run seam as this feature uses it (rileyClient in the browser, rileyHeadless on Node). */
export interface RileySource {
  /** his keys for a composition (any order); [] when he has none */
  teamKeysFor(characterIds: Array<string | null>): Promise<string[]>;
  /** the best `mine` row per key ("mine" = the account's own echoes, "high" = his High Invest spread) */
  solveMine(teamKeys: string[], subs?: "mine" | "high" | "standard"): Promise<MineSolve[]>;
  /** the traced run on these picks (its `needs` are the ER floors) */
  tracedRun(teamKey: string, picks: RileyPick[] | null): Promise<RunLite>;
}

export interface TeamPlans {
  plans: MemberPlan[];
  /** his best row for the composition at the account (null: not a Riley composition, or none solves) */
  riley: MineSolve | null;
  /** why there is no Riley plan, in words */
  rileyNote: string | null;
  /** the keys his list has for these three */
  teamKeys: string[];
  /** Riley's DPS for the team at the account today, and in his High Invest spread on the same team key */
  dpsMine: number | null;
  dpsHigh: number | null;
}

/** Ryan's first curated echo preset as a plan (`src/characters/<Key>/presets.ts` `echoes[0]`). */
export async function presetPlanFor(characterId: string, mainDps: boolean): Promise<MemberPlan> {
  try {
    const chosen = (await getCharByName(characterId)) as { echoes?: Array<{ name?: string; data?: any }> } | null;
    const preset = chosen?.echoes?.find((p) => p?.data?.echoes) ?? null;
    return preset ? planFromPreset(characterId, preset, mainDps) : emptyPlan(characterId, mainDps);
  } catch {
    return emptyPlan(characterId, mainDps);
  }
}

/** Plans for a team, slot order. `pinnedKey`: a team key the player came from (a /rankings detail) — used when it is
 *  one of the composition's keys, else the best of them. */
export async function plansForTeam(
  characterIds: Array<string | null>,
  riley: RileySource | null,
  options: { pinnedKey?: string | null; currentEchoes?: (characterId: string) => ReadonlyArray<PresetEcho | null | undefined> } = {},
): Promise<TeamPlans> {
  const ids = characterIds.filter((id): id is string => !!id);
  let best: MineSolve | null = null;
  let run: RunLite | null = null;
  let rileyNote: string | null = null;
  let teamKeys: string[] = [];
  let dpsHigh: number | null = null;
  if (riley && ids.length === 3) {
    try {
      teamKeys = await riley.teamKeysFor(characterIds);
      const keys = options.pinnedKey && teamKeys.includes(options.pinnedKey) ? [options.pinnedKey] : teamKeys;
      if (!keys.length) rileyNote = "Not a wuwa_calc composition: using Ryan's echo presets.";
      else {
        const solves = await riley.solveMine(keys, "mine");
        best = solves.filter((s) => s.best).sort((a, b) => b.best!.total - a.best!.total)[0] ?? null;
        if (!best) {
          const skipped = solves[0];
          rileyNote =
            skipped?.reason === "notInApp"
              ? `wuwa_calc's team has ${skipped.notInApp?.join(" and ")}, not released in this app: using Ryan's echo presets.`
              : `wuwa_calc could not solve this team at your account (${skipped?.message ?? skipped?.reason ?? "no build"}): using Ryan's echo presets.`;
        } else {
          run = await riley.tracedRun(best.teamKey, best.best!.picks);
          try {
            const [high] = await riley.solveMine([best.teamKey], "high");
            dpsHigh = high?.best?.total ?? null;
          } catch {
            dpsHigh = null;
          }
        }
      }
    } catch (e) {
      rileyNote = `wuwa_calc's engine is unavailable (${e instanceof Error ? e.message : String(e)}): using Ryan's echo presets.`;
      best = null;
    }
  } else if (ids.length !== 3) {
    rileyNote = "A team needs three members for wuwa_calc: using Ryan's echo presets.";
  }

  const plans: MemberPlan[] = [];
  for (let slot = 0; slot < characterIds.length; slot++) {
    const id = characterIds[slot];
    if (!id) continue;
    const member = best?.best?.members.find((m) => m.appKey === id) ?? null;
    if (member) plans[slot] = planFromRiley(member, run?.needs?.[member.name] ?? null);
    else {
      const preset = await presetPlanFor(id, slot === 0);
      plans[slot] = preset.source !== "none" ? preset : options.currentEchoes ? planFromCurrent(id, options.currentEchoes(id), slot === 0) : preset;
    }
  }
  return { plans, riley: best, rileyNote, teamKeys, dpsMine: best?.best?.total ?? null, dpsHigh };
}
