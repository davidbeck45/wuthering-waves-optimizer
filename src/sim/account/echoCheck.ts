// Wuthering Tools+ — /account "With what you own", part (a): better echoes already in the inventory.
//
// Per set-up character, Build my team's engine (src/sim/buildTeam/) re-gears that character alone from the real
// inventory: wuwa_calc's pick for their strongest team you can field (sets, main echo, main stats, the Energy Regen
// that team's loop needs; Ryan's preset or their own build when he has none), upstream's optimizer on the echoes, no
// echo worn twice. Only that member is built: teammates keep their echoes (a member with no plan keeps what they wear
// and it stays out of the search), and echoes anyone outside the team wears are left out as the page does by default.
// The run is the exact one /build-team does when opened on the same team with `only=<character>` (teamSpecOf), so the
// row's figure and the page's agree.
//
//   own   the character's damage on Build my team's objective (the saved team's rotation for this slot, else their
//         best rotation), before → after: what /build-team prints as the member's Δ
//   team  the strongest fieldable team re-scored through the rankings' own scorer with the new build worn
//         (investPlan's `createTeamScorer`: exact or absent, with the reason) — the same rule as every other row
//
// Store-free; the page passes plain copies and the browser backends (the optimizer workers, the solver worker), the
// tests the inline backend. Nothing here writes anything: the row's button opens /build-team, which saves after a
// preview and a confirm.
import { applyBuildFields } from "../../characters/buildFields";
import { echoSetLabelMap } from "../../echoes/stats";
import { setBonusEffectsTwo } from "../../echoes/sets";
import { buildMyTeam, currentEchoesOf, teamSpecOf, type TeamRequest } from "../buildTeam/buildTeam";
import { DEFAULT_OPTIONS, type BuildOptions } from "../buildTeam/options";
import type { OptimizerBackend } from "../buildTeam/headlessOptimizer";
import { plansForTeam, type RileySource, type TeamPlans } from "../buildTeam/plans";
import type { MemberPlan } from "../buildTeam/rileyPlan";
import { buffDefaultNames, worthSaving } from "../buildTeam/buildTeamView";
import { characterDisplayName } from "../display/names";
import { isSetUp, type RosterRanking } from "../myRankings/rankRoster";
import { showNeed } from "../energy/energyNeed";
import { createTeamScorer, MIN_GAIN, type TeamContext, type TeamImpact } from "./investPlan";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface EchoUpgrade {
  /** `<character>:echoes` */
  id: string;
  characterId: string;
  /** what /build-team opens on (with `only` = this character) */
  request: TeamRequest;
  /** the team the run used: the saved team's name, or the members */
  teamName: string;
  /** what the own figure is measured on: "Team rotation" or the rotation's name */
  objective: string;
  /** the character's average damage per rotation on the objective, today and with the new echoes */
  before: number;
  after: number;
  gain: number;
  team: TeamImpact | null;
  /** why there is no team figure (null with one) */
  teamNote: string | null;
  /** echoes of the five that change */
  changed: number;
  /** of those, echoes nobody wears today */
  unworn: number;
  /** the sets the new build wears ("Windward Pilgrimage 5pc") */
  sets: string;
  /** the Energy Regen floor the run kept (the team loop's need), with the character screen's ER before / after */
  er: { floor: number; before: number | null; after: number | null; met: boolean; buys: boolean } | null;
  /** set passives / main-echo buffs nobody had set, switched on at max stacks (part of the gain), named as /build-team
   *  names them ("Havoc Eclipse 5pc", "Bell-Borne Geochelone's buff") */
  buffsOn: string[];
  /** where the plan came from */
  plan: MemberPlan["source"];
  /** the plan was loosened to fill the build ("mainStats", "layout"); null when it held */
  relaxed: string | null;
}

export interface EchoCheckSkip {
  characterId: string;
  /** in words, from Build my team ("Not enough echoes: needs 1 more 3-cost …") */
  reason: string;
}

export interface EchoCheck {
  /** characters with a better build in the inventory, best own gain first */
  items: EchoUpgrade[];
  /** characters checked (set up, with a best rotation) */
  total: number;
  done: number;
  /** characters whose echoes are already the best the inventory gives under the plan */
  best: string[];
  skipped: EchoCheckSkip[];
  errors: string[];
  computedAt: string;
  cancelled: boolean;
  ms: number;
}

export interface EchoCheckInput {
  characters: Record<string, any>;
  inventory: { echoes: any[]; equipped?: Record<string, Record<string, number>> };
  teams: any[];
  /** the roster ranking of the same data (the page keys both by the ranking fingerprint) */
  ranking: Pick<RosterRanking, "characters" | "teams">;
  autoTeamBuffs?: boolean;
  /** Build my team's switches (the page's saved ones, so the figures are the page's); default DEFAULT_OPTIONS */
  options?: BuildOptions;
  /** only these characters (tests; default every set-up character the ranking scored) */
  only?: readonly string[];
}

export interface EchoCheckDeps {
  backend: OptimizerBackend;
  /** wuwa_calc's plans (rileyClient in the browser); null: Ryan's presets / the current build */
  riley: RileySource | null;
}

export interface EchoCheckHooks {
  signal?: AbortSignal;
  /** before each character and after it, with the items found so far */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (progress: { done: number; total: number; label: string }, items: EchoUpgrade[]) => void;
  /** give the browser a turn between characters; default true */
  yieldToUi?: boolean;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const isAbort = (err: unknown): boolean => (err as { name?: string } | null)?.name === "AbortError";

/** What /build-team opens on for this character: the strongest fieldable team (a saved one by id, a preset by its
 *  three), or the character alone when they are in no team you can field. */
export function echoCheckRequest(ctx: Pick<TeamContext, "rank"> | null, characterId: string): TeamRequest {
  if (!ctx) return { members: [characterId] };
  if (ctx.rank.source === "yours") return { teamId: ctx.rank.id };
  return { members: [...ctx.rank.characterIds] };
}

/** Best own gain first; ties by team gain, then id. */
export function sortEchoUpgrades(items: readonly EchoUpgrade[]): EchoUpgrade[] {
  const t = (i: EchoUpgrade): number => (i.team ? i.team.gain : -Infinity);
  return [...items].sort((a, b) => b.gain - a.gain || t(b) - t(a) || a.id.localeCompare(b.id));
}

/** per set passive key: its set and the pieces it needs ("HavocEclipse5SetHavoc" → Havoc Eclipse, 5) */
let passiveTiers: Map<string, { set: string; pieces: number }> | null = null;
function passiveTierOf(key: string): { set: string; pieces: number } | null {
  if (!passiveTiers) {
    passiveTiers = new Map();
    const typeOf = new Map(Object.entries(echoSetLabelMap as Record<string, string>).map(([type, label]) => [label, type]));
    for (const [label, def] of Object.entries(setBonusEffectsTwo as Record<string, any>)) {
      const pieces = Number(/(\d) Set$/.exec(label)?.[1] ?? NaN);
      const set = typeOf.get(String(def?.name ?? ""));
      if (!set || !Number.isFinite(pieces)) continue;
      for (const p of (def.passives ?? []) as any[]) if (!passiveTiers.has(String(p.key))) passiveTiers.set(String(p.key), { set, pieces });
    }
  }
  return passiveTiers.get(key) ?? null;
}

/** The buffs Build my team switched on that the new build actually wears: the main echo's own buffs (not those of the
 *  other main echoes it tried) and set passives whose pieces are worn (not a 5pc passive with 2 pieces on). A passive
 *  the set data doesn't place is kept. Build my team switches on every candidate's buff in the draft; only these are
 *  in the figure. */
export function buffsWorn(keys: readonly string[], setsWorn: Record<string, number>, mainEcho: string | null): string[] {
  return keys.filter((k) => {
    const i = k.indexOf(":");
    if (i >= 0) return mainEcho != null && k.slice(0, i) === mainEcho;
    const tier = passiveTierOf(k);
    return !tier || (setsWorn[tier.set] ?? 0) >= tier.pieces;
  });
}

/** "Windward Pilgrimage 5pc + Moonlit Clouds 2pc" from the pieces worn per set. */
function setsText(setsWorn: Record<string, number>, label: (key: string) => string): string {
  return Object.entries(setsWorn)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${label(k)} ${n}pc`)
    .join(" + ");
}

/**
 * Re-gears each set-up character alone from the inventory and keeps the ones the inventory improves. Cancel through
 * `hooks.signal` (the result so far comes back with `cancelled`).
 */
export async function checkOwnEchoes(input: EchoCheckInput, deps: EchoCheckDeps, hooks: EchoCheckHooks = {}): Promise<EchoCheck> {
  const t0 = now();
  const { characters, teams } = input;
  const echoes = input.inventory.echoes ?? [];
  const equipped = input.inventory.equipped ?? {};
  const auto = input.autoTeamBuffs ?? true;
  const options = input.options ?? DEFAULT_OPTIONS;
  const aborted = (): boolean => !!hooks.signal?.aborted;
  const pause = (): Promise<void> => (hooks.yieldToUi === false ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 0)));
  const setLabel = (key: string): string => (echoSetLabelMap as Record<string, string>)[key] ?? key;

  const errors: string[] = [];
  const items: EchoUpgrade[] = [];
  const best: string[] = [];
  const skipped: EchoCheckSkip[] = [];
  const only = input.only ? new Set(input.only) : null;
  const ranks = input.ranking.characters.filter((c) => c.best && c.bestRotation && isSetUp(characters[c.id]) && (!only || only.has(c.id)));
  const scorer = await createTeamScorer(characters, echoes, teams, input.ranking.teams, { autoTeamBuffs: auto, errors });
  const plansMemo = new Map<string, Promise<TeamPlans>>();
  const plansFor = (ids: Array<string | null>): Promise<TeamPlans> => {
    const key = ids.map((x) => x ?? "").join(",");
    let hit = plansMemo.get(key);
    if (!hit) {
      hit = plansForTeam(ids, deps.riley, { high: false, currentEchoes: (id) => currentEchoesOf(id, characters, echoes) });
      plansMemo.set(key, hit);
    }
    return hit;
  };

  let done = 0;
  for (const rank of ranks) {
    if (aborted()) break;
    const id = rank.id;
    const name = characterDisplayName(id) || rank.name;
    hooks.onProgress?.({ done, total: ranks.length, label: name }, sortEchoUpgrades(items));
    try {
      const ctx = await scorer.teamFor(id);
      const request = echoCheckRequest(ctx, id);
      const spec = teamSpecOf(request, teams);
      const slot = spec ? spec.characterIds.indexOf(id) : -1;
      if (!spec || slot < 0) {
        skipped.push({ characterId: id, reason: "Their team is not in this browser's data any more." });
      } else {
        const plans = await plansFor(spec.characterIds);
        if (aborted()) break;
        // only this member gets a plan: the others are skipped, so they keep their echoes and those stay out
        const masked: MemberPlan[] = [];
        masked[slot] = plans.plans[slot]!;
        const need = plans.plans[slot]?.erNeed;
        const erFloors = spec.characterIds.map((_, i) => (i === slot && need != null ? showNeed(need) : null));
        const result = await buildMyTeam(
          { characters, inventory: { echoes, equipped }, team: spec, plans: masked, order: [slot], options, erFloors, autoTeamBuffs: auto },
          deps.backend,
          { signal: hooks.signal },
        );
        // the browser gets a frame between the run's verification and the team re-score (both on the main thread)
        await pause();
        if (aborted()) break;
        const m = result.members[slot]!;
        if (m.status !== "ok" || !m.after || !m.before || !m.draft) {
          skipped.push({ characterId: id, reason: m.message ?? "Build my team found no build for them." });
        } else if (m.sameEchoes || m.keptCurrent || !worthSaving(m)) {
          best.push(id);
        } else {
          const gain = m.after.value / Math.max(1, m.before.value) - 1;
          const buys = m.erMet === true && m.erFloor != null && m.before.menuEr != null && m.before.menuEr + 1e-6 < m.erFloor;
          let team: TeamImpact | null = null;
          let teamNote: string | null = null;
          const activeId = characters[id]?.activeBuildId ?? null;
          const onActive = m.fromBuild.source === "active" || (m.fromBuild.id != null && m.fromBuild.id === activeId);
          if (!ctx) teamNote = "not in a team you can field";
          else if (!onActive) teamNote = `Build my team re-gears ${name}'s "${m.fromBuild.name ?? "other"}" build in this team, not the active one`;
          else {
            const block = await scorer.buildBlock(ctx, id);
            await pause();
            const hypo = { ...characters, [id]: applyBuildFields(characters[id] ?? {}, m.draft) };
            ({ team, note: teamNote } = await scorer.impact(ctx, block, hypo, echoes));
          }
          if (gain < MIN_GAIN && !(team && team.gain >= MIN_GAIN) && !buys) {
            best.push(id);
          } else {
            const picks = m.after.picks;
            const changed = picks.filter((p) => p.source !== "own");
            items.push({
              id: `${id}:echoes`,
              characterId: id,
              request,
              teamName: spec.name,
              objective: m.objective?.label ?? "best rotation",
              before: m.before.value,
              after: m.after.value,
              gain,
              team,
              teamNote,
              changed: changed.length,
              unworn: changed.filter((p) => p.source === "free").length,
              sets: setsText(m.setsWorn, setLabel),
              er: m.erFloor == null ? null : { floor: m.erFloor, before: m.before.menuEr, after: m.after.menuEr, met: m.erMet === true, buys },
              buffsOn: buffDefaultNames(buffsWorn(m.buffDefaults, m.setsWorn, m.draft.mainEcho?.echo ?? null)),
              plan: plans.plans[slot]?.source ?? "none",
              relaxed: m.relaxed && m.relaxed !== "plan" ? m.relaxed : null,
            });
          }
        }
      }
    } catch (err) {
      if (isAbort(err) || aborted()) break;
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done += 1;
    hooks.onProgress?.({ done, total: ranks.length, label: name }, sortEchoUpgrades(items));
    await pause();
  }
  return {
    items: sortEchoUpgrades(items),
    total: ranks.length,
    done,
    best,
    skipped,
    errors,
    computedAt: new Date().toISOString(),
    cancelled: aborted(),
    ms: Math.round(now() - t0),
  };
}
