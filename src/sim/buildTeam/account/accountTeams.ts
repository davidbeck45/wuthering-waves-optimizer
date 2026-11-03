// Wuthering Tools+ — "Whole account": the teams the account can field, the way /account lists them (rankRoster's team
// candidates: your saved teams with a rotation, then the curated and wuwa_calc team presets of characters you own;
// fieldable = every member has a weapon; identical rows folded; strongest first), and the default choice of which to
// gear. Each comes with the TeamSpec Build my team runs on (the team's own rotation is every member's objective).
import { isSetUp, RANKING_ENEMY, scoreTeamCandidate, teamCandidatesOf, type RosterRanking, type TeamCandidate } from "../../myRankings/rankRoster";
import type { RotationSource } from "../../myRankings/rankRoster";
import type { TeamSpec } from "../buildTeam";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AccountTeamChoice {
  /** the ranking's id: a saved team's id, or `curated:<name>` / `wuwa_calc:<name>` */
  id: string;
  name: string;
  source: RotationSource;
  characterIds: string[];
  /** the app's average team damage per rotation at the rankings' enemy (level 100, 20 % RES) */
  avgDamage: number;
  dps: number | null;
  /** other rows folded into this one (the same three, the same damage) */
  duplicates: number;
  spec: TeamSpec;
}

const SOURCE_ORDER: Record<string, number> = { yours: 0, curated: 1, wuwa_calc: 2 };

function specOf(c: TeamCandidate, saved: any | undefined): TeamSpec {
  if (c.source === "yours" && saved) {
    return {
      id: saved.id,
      name: saved.name,
      characterIds: [...(saved.characterIds ?? [])],
      buildIds: [...(saved.buildIds ?? [null, null, null])],
      actions: saved.actions ?? [],
      duration: saved.duration ?? null,
      enemyConfig: saved.enemyConfig ?? null,
      handoffs: saved.handoffs ?? null,
    };
  }
  return { id: null, name: c.name, characterIds: [...c.team.characterIds], actions: c.team.actions as any[], duration: c.team.duration ?? null, enemyConfig: null, handoffs: c.team.handoffs ?? null };
}

export interface ChoiceOptions {
  /** the /account ranking for this exact data (its team damage is reused instead of scored again) */
  ranking?: Pick<RosterRanking, "teams"> | null;
  autoTeamBuffs?: boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** let the page breathe between teams (default true in a browser) */
  yieldToUi?: boolean;
}

const yieldNow = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The fieldable teams, strongest first, one row per distinct team. */
export async function accountTeamChoices(characters: Record<string, any>, echoes: any[], teams: any[], options: ChoiceOptions = {}): Promise<AccountTeamChoice[]> {
  const { candidates } = await teamCandidatesOf(characters, teams);
  const fieldable = candidates.filter((c) => c.team.characterIds.every((id) => isSetUp(characters[id])));
  const ranked = new Map((options.ranking?.teams ?? []).map((t) => [t.id, t]));
  const savedById = new Map((teams ?? []).map((t) => [t?.id, t]));
  const rows: AccountTeamChoice[] = [];
  const yieldToUi = options.yieldToUi ?? typeof window !== "undefined";
  for (let i = 0; i < fieldable.length; i++) {
    if (options.signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    const c = fieldable[i]!;
    let rank = ranked.get(c.id) ?? null;
    if (!rank) {
      try {
        rank = await scoreTeamCandidate(c, characters, echoes, { autoTeamBuffs: options.autoTeamBuffs ?? true, enemy: RANKING_ENEMY });
      } catch {
        rank = null; // a team the engine cannot run is not offered
      }
      if (yieldToUi) await yieldNow();
    }
    options.onProgress?.(i + 1, fieldable.length);
    if (!rank) continue;
    rows.push({ id: c.id, name: c.name, source: c.source, characterIds: [...c.team.characterIds], avgDamage: rank.avgDamage, dps: rank.dps, duplicates: 0, spec: specOf(c, savedById.get(c.id)) });
  }
  // fold the same three at the same damage (a saved team and the preset it came from), your own team first
  const groups = new Map<string, AccountTeamChoice[]>();
  for (const r of rows) {
    const key = `${[...r.characterIds].sort().join("+")}|${Math.round(r.avgDamage)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((g) => {
      const [head, ...rest] = [...g].sort((a, b) => (SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9));
      return { ...head!, duplicates: rest.length };
    })
    .sort((a, b) => b.avgDamage - a.avgDamage || a.name.localeCompare(b.name));
}

/** The teams ticked by default: every saved team of yours the account can field (a character in two of them gets one
 *  build), then the strongest presets that share no member with what is already ticked, at most `max` in all.
 *  Returned strongest first (the default priority). */
export function defaultSelection(choices: readonly AccountTeamChoice[], max = 4): string[] {
  const used = new Set<string>();
  const picked: AccountTeamChoice[] = [];
  for (const c of choices.filter((x) => x.source === "yours")) {
    if (picked.length >= max) break;
    picked.push(c);
    for (const id of c.characterIds) used.add(id);
  }
  for (const c of choices.filter((x) => x.source !== "yours")) {
    if (picked.length >= max) break;
    if (c.characterIds.some((id) => used.has(id))) continue;
    picked.push(c);
    for (const id of c.characterIds) used.add(id);
  }
  return picked.sort((a, b) => b.avgDamage - a.avgDamage).map((c) => c.id);
}

/** "How much this team matters" by priority position: 1, 0.8, 0.6, 0.4, then 0.2. */
export const defaultWeight = (position: number): number => Math.max(0.2, Math.round((1 - 0.2 * position) * 10) / 10);

export const WEIGHT_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "1 · the most" },
  { value: 0.8, label: "0.8" },
  { value: 0.6, label: "0.6" },
  { value: 0.4, label: "0.4" },
  { value: 0.2, label: "0.2 · the least" },
];
