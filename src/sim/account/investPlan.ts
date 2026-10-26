// Wuthering Tools+ — "What to invest in next": one ranked list of concrete investments across the roster, each
// with the gain this app's engine computes for it.
//
// Per set-up character, on the best rotation the roster ranking picked for them (rankRoster):
//   sequence  the next sequence node                     (withNextSequence — the same build /my-rankings' "Next S" scores)
//   refine    the worn weapon one refinement up, and at R5 (withWeapon / withRefineFive)
//   weapon    the best weapon of their type that someone on the account wears (no weapon inventory exists: the
//             weapons the roster wears are the ones the account is known to own), at that copy's refinement
//   substat   one more expected roll of the substat that pays most (substatWeights' best line: withSubstat over the
//             13 kinds, expected roll only — the median / best / step columns stay on /my-rankings)
// Each is also scored on the strongest team the character can field (every member armed), when the result is
// exact: the team is re-run through the rankings' own team scorer (resolveTeamCharacters → calcTeamRotationDamage)
// with the member upgraded, so teammates' buffs from the upgrade (a support's new sequence node, a weapon's team
// buff) count — except for a teammate whose own team-buff panel already names this team's other two: resolveTeam then
// keeps that panel's ticked buffs as the user set them (buildCharacterContext reads only `isEnabled`), so a buff the
// upgrade unlocks counts once it is ticked there. The figure is still exactly what the rankings would score. It is skipped — with the reason — when that team runs another saved build of the character (the
// upgrade was scored on the active build), or a weapon swap takes the weapon off a teammate in the same team.
//
// Pure/async (no Vue, no stores); time-sliced so the page stays responsive (yieldToUi), and cancellable.
import { RANKING_ENEMY, refinementOf, scoreRotation, scoreTeamCandidate, teamCandidatesOf, withNextSequence, withRefineFive, withWeapon, type CharacterRank, type RosterRanking, type TeamCandidate, type TeamRank } from "../myRankings/rankRoster";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";
import { SUBSTAT_KEYS, SUBSTAT_LABELS, expectedRoll, isFlatSubstat, withSubstat, type SubstatKey } from "../substats/substatWeights";
import { characterDisplayName, characterMeta, weaponDisplayName, weaponMeta } from "../display/names";
import { equippedEchoCount } from "./buildScore";

export type InvestKind = "sequence" | "refine" | "weapon" | "substat";

export const INVEST_KIND_LABELS: Record<InvestKind, string> = {
  sequence: "Sequence",
  refine: "Refinement",
  weapon: "Weapon",
  substat: "Echo roll",
};

export interface TeamImpact {
  teamId: string;
  teamName: string;
  characterIds: string[];
  /** the team's average damage per rotation as it is, and with the investment */
  base: number;
  avgDamage: number;
  gain: number;
}

export interface InvestItem {
  /** `<character>:<kind>:<what>`, stable across runs */
  id: string;
  characterId: string;
  kind: InvestKind;
  /** the short headline: "S3", "R2", "R5", "Lux & Umbra R5", "Crit DMG +15.1%" */
  label: string;
  /** the state it starts from: "S2", "R1", the worn weapon, "on an echo" */
  from: string;
  /** what it would be: "S3", "R5", the other weapon */
  to: string;
  /** the best rotation the gain is measured on (its stored name) */
  rotation: string;
  /** the character's average damage per rotation on that rotation, as it is and with the investment */
  base: number;
  avgDamage: number;
  gain: number;
  team: TeamImpact | null;
  /** why there is no team figure (null with a team figure) */
  teamNote: string | null;
  /** weapon swaps: who wears that copy now */
  wornBy?: string[];
  weaponKey?: string;
  refinement?: number;
  substatKey?: SubstatKey;
  roll?: number;
}

export interface InvestProgress {
  done: number;
  total: number;
  /** the character being scored */
  label: string;
}

export interface InvestOptions {
  /** team buffs from the real members (src/sim/teamContext) — the ranking's own setting; default true */
  autoTeamBuffs?: boolean;
  /** called before each character and after it with the items found so far (sorted) */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (progress: InvestProgress, items: InvestItem[]) => void;
  /** give the browser a frame every ~12 ms of engine work; default true */
  yieldToUi?: boolean;
  /** set `cancelled` to stop between two scorings (the result so far is returned) */
  signal?: { cancelled: boolean };
  /** substats tried for the roll (default all 13) */
  substatKeys?: readonly SubstatKey[];
}

export interface InvestPlan {
  items: InvestItem[];
  /** characters scored (set up, with a best rotation) */
  characters: number;
  errors: string[];
  computedAt: string;
  /** stopped early through the signal */
  cancelled: boolean;
}

/** What changes, in a few words: "S2 → S3", "Unflickering Valor R1 → R5", "Variation R5 → Stringmaster R1",
 *  "Crit Rate +7.5% on an echo". */
export function investChange(item: Pick<InvestItem, "kind" | "from" | "to" | "label">): string {
  if (item.kind === "refine") return `${item.from} → ${/R\d$/.exec(item.to)?.[0] ?? item.to}`;
  if (item.kind === "substat") return `${item.label} on an echo`;
  return `${item.from} → ${item.to}`;
}

/** a gain smaller than this is noise (rounding in the engine), not an investment */
export const MIN_GAIN = 0.0005;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** A yield that only gives the event loop a turn when ~`budget` ms of work ran since the last one. */
function slicer(enabled: boolean, budget = 12): () => Promise<void> {
  let last = now();
  return async () => {
    if (!enabled || now() - last < budget) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    last = now();
  };
}

/** Best first by own gain; ties by team gain, then id, so the order never jitters. */
export function sortInvestItems(items: InvestItem[], by: "own" | "team" = "own"): InvestItem[] {
  const teamKey = (i: InvestItem): number => (i.team ? i.team.gain : -Infinity);
  return [...items].sort((a, b) => {
    if (by === "team") {
      const t = teamKey(b) - teamKey(a);
      if (t && Number.isFinite(t)) return t;
      if (a.team && !b.team) return -1;
      if (!a.team && b.team) return 1;
    }
    return b.gain - a.gain || teamKey(b) - teamKey(a) || a.id.localeCompare(b.id);
  });
}

/** The strongest team (by the ranking's own score) the character can field — every member armed — or null. */
export function bestFieldableTeam(teams: TeamRank[], characterId: string): TeamRank | null {
  let best: TeamRank | null = null;
  for (const t of teams) {
    if (t.unarmed.length || !t.characterIds.includes(characterId)) continue;
    if (!best || t.avgDamage > best.avgDamage || (t.avgDamage === best.avgDamage && t.source === "yours" && best.source !== "yours")) best = t;
  }
  return best;
}

/** The weapons the account is known to own: the ones its set-up characters wear, with the best refinement among
 *  the copies and who wears them. */
export function ownedWeapons(characters: Record<string, any>): Map<string, { refinement: number; wornBy: string[] }> {
  const out = new Map<string, { refinement: number; wornBy: string[] }>();
  for (const [id, data] of Object.entries(characters ?? {})) {
    const key = data?.weapon;
    if (!key) continue;
    const entry = out.get(key) ?? { refinement: 0, wornBy: [] };
    entry.refinement = Math.max(entry.refinement, Math.min(5, refinementOf(data)));
    entry.wornBy.push(id);
    out.set(key, entry);
  }
  return out;
}

/** "Sword" (the roster's weapon type) → "Swords" (the weapon registry's bucket) */
const weaponBucket = (type: string | null | undefined): string | null => (type ? (type.endsWith("s") ? type : `${type}s`) : null);

const rollText = (key: SubstatKey, value: number): string => (isFlatSubstat(key) ? `+${Math.round(value)}` : `+${value.toFixed(1)}%`);

interface TeamContext {
  candidate: TeamCandidate;
  rank: TeamRank;
  /** the team as it is, scored here (equal to the ranking's figure; scored again so both sides share inputs) */
  base: number;
  /** null when the result can be exact; otherwise why not */
  blocked: string | null;
}

/**
 * The investment list for a scored roster. `ranking` must come from the same `characters` / `inventoryEchoes` /
 * `teams` (the page keys both by the ranking fingerprint). Items whose gain is below `MIN_GAIN` are dropped; at
 * most one weapon swap per character (the best).
 */
export async function investPlan(
  characters: Record<string, any>,
  inventoryEchoes: any[],
  teams: any[],
  ranking: Pick<RosterRanking, "characters" | "teams">,
  options: InvestOptions = {},
): Promise<InvestPlan> {
  const auto = options.autoTeamBuffs ?? true;
  const pause = slicer(options.yieldToUi !== false);
  const cancelled = (): boolean => Boolean(options.signal?.cancelled);
  const enemy = RANKING_ENEMY;
  const keys = options.substatKeys ?? SUBSTAT_KEYS;
  const errors: string[] = [];
  const items: InvestItem[] = [];
  const ranks = ranking.characters.filter((c) => c.best && c.bestRotation && characters[c.id]);
  const owned = ownedWeapons(characters);

  const { candidates } = await teamCandidatesOf(characters, teams);
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const teamContexts = new Map<string, TeamContext | null>();

  async function teamFor(rank: CharacterRank): Promise<TeamContext | null> {
    const best = bestFieldableTeam(ranking.teams, rank.id);
    if (!best) return null;
    if (teamContexts.has(best.id)) return teamContexts.get(best.id)!;
    const candidate = candidateById.get(best.id);
    let ctx: TeamContext | null = null;
    if (candidate) {
      try {
        const scored = await scoreTeamCandidate(candidate, characters, inventoryEchoes, { autoTeamBuffs: auto, enemy });
        ctx = { candidate, rank: best, base: scored.avgDamage, blocked: null };
      } catch (err) {
        errors.push(`${best.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    teamContexts.set(best.id, ctx);
    return ctx;
  }

  /** null when the team runs the character's active build (the upgrade applies as scored), else why not */
  async function buildBlock(ctx: TeamContext, characterId: string): Promise<string | null> {
    const resolution = await resolveTeamCharacters(ctx.candidate.team, characters, inventoryEchoes, { auto, enemyConfig: enemy });
    const slot = resolution.slots.find((s) => s.characterId === characterId);
    const activeId = characters[characterId]?.activeBuildId ?? null;
    const other = resolution.auto ? slot && slot.buildSource !== "active" && slot.buildId !== activeId : slot?.buildId && slot.buildId !== activeId;
    return other ? `the team runs ${characterDisplayName(characterId)}'s "${slot?.buildName ?? "other"}" build` : null;
  }

  async function teamImpact(ctx: TeamContext | null, block: string | null, hypoCharacters: Record<string, any>, hypoEchoes: any[]): Promise<{ team: TeamImpact | null; note: string | null }> {
    if (!ctx) return { team: null, note: "not in a team you can field" };
    if (block) return { team: null, note: block };
    if (ctx.base <= 0) return { team: null, note: "the team scores no damage" };
    try {
      const scored = await scoreTeamCandidate(ctx.candidate, hypoCharacters, hypoEchoes, { autoTeamBuffs: auto, enemy });
      return {
        team: { teamId: ctx.rank.id, teamName: ctx.rank.name, characterIds: ctx.rank.characterIds, base: ctx.base, avgDamage: scored.avgDamage, gain: scored.avgDamage / ctx.base - 1 },
        note: null,
      };
    } catch (err) {
      return { team: null, note: `the team could not be scored (${err instanceof Error ? err.message : String(err)})` };
    }
  }

  let done = 0;
  for (const rank of ranks) {
    if (cancelled()) break;
    const id = rank.id;
    const name = characterDisplayName(id) || rank.name;
    options.onProgress?.({ done, total: ranks.length, label: name }, sortInvestItems(items));
    const data = characters[id];
    const rotation = rank.bestRotation!;
    try {
      const base = (await scoreRotation(rotation, id, characters, enemy, inventoryEchoes)).avgDamage;
      await pause();
      if (base > 0) {
        const ctx = await teamFor(rank);
        const block = ctx ? await buildBlock(ctx, id) : null;
        const push = async (item: Omit<InvestItem, "base" | "avgDamage" | "gain" | "team" | "teamNote" | "rotation" | "characterId">, hypo: { characters: Record<string, any>; inventoryEchoes: any[] }, extraBlock: string | null = null): Promise<void> => {
          const avgDamage = (await scoreRotation(rotation, id, hypo.characters, enemy, hypo.inventoryEchoes)).avgDamage;
          await pause();
          const gain = avgDamage / base - 1;
          const { team, note } = await teamImpact(ctx, extraBlock ?? block, hypo.characters, hypo.inventoryEchoes);
          await pause();
          // an upgrade a support's own rotation does not show can still lift their team (an outro buff, a sequence node)
          if (gain < MIN_GAIN && !(team && team.gain >= MIN_GAIN)) return;
          items.push({ ...item, characterId: id, rotation: rotation.name, base, avgDamage, gain, team, teamNote: note });
        };
        const withData = (next: Record<string, any>) => ({ characters: { ...characters, [id]: next }, inventoryEchoes });

        // sequence
        const sequence = rank.sequence;
        if (sequence < 6 && !cancelled()) {
          const next = await withNextSequence(id, data, sequence);
          if (next) await push({ id: `${id}:sequence:${sequence + 1}`, kind: "sequence", label: `S${sequence + 1}`, from: `S${sequence}`, to: `S${sequence + 1}` }, withData(next));
        }
        // refinement of the worn weapon: one up, and R5 when that is further
        const weapon: string | null = data.weapon ?? null;
        const refinement = refinementOf(data);
        if (weapon && refinement < 5 && !cancelled()) {
          const wName = weaponDisplayName(weapon);
          await push({ id: `${id}:refine:${refinement + 1}`, kind: "refine", label: `R${refinement + 1}`, from: `${wName} R${refinement}`, to: `${wName} R${refinement + 1}`, weaponKey: weapon, refinement: refinement + 1 }, withData(withWeapon(data, weapon, refinement + 1)));
          const r5 = refinement + 1 < 5 ? withRefineFive(data) : null;
          if (r5 && !cancelled()) await push({ id: `${id}:refine:5`, kind: "refine", label: "R5", from: `${wName} R${refinement}`, to: `${wName} R5`, weaponKey: weapon, refinement: 5 }, withData(r5));
        }
        // a better weapon the account owns (keep the best one)
        const bucket = weaponBucket(characterMeta(id)?.weapon);
        let bestSwap: { key: string; refinement: number; wornBy: string[]; gain: number } | null = null;
        for (const [key, copy] of owned) {
          if (cancelled()) break;
          if (key === weapon || !bucket || weaponMeta(key)?.type !== bucket) continue;
          const wornBy = copy.wornBy.filter((w) => w !== id);
          if (!wornBy.length) continue;
          const hypo = withData(withWeapon(data, key, copy.refinement));
          const avgDamage = (await scoreRotation(rotation, id, hypo.characters, enemy, inventoryEchoes)).avgDamage;
          await pause();
          const gain = avgDamage / base - 1;
          if (gain >= MIN_GAIN && (!bestSwap || gain > bestSwap.gain)) bestSwap = { key, refinement: copy.refinement, wornBy, gain };
        }
        if (bestSwap && !cancelled()) {
          const inTeam = ctx ? bestSwap.wornBy.filter((w) => ctx.rank.characterIds.includes(w)) : [];
          const swapBlock = inTeam.length ? `${characterDisplayName(inTeam[0])} wears it in this team` : null;
          await push(
            {
              id: `${id}:weapon:${bestSwap.key}`,
              kind: "weapon",
              label: `${weaponDisplayName(bestSwap.key)} R${bestSwap.refinement}`,
              from: weapon ? `${weaponDisplayName(weapon)} R${refinement}` : "no weapon",
              to: `${weaponDisplayName(bestSwap.key)} R${bestSwap.refinement}`,
              weaponKey: bestSwap.key,
              refinement: bestSwap.refinement,
              wornBy: bestSwap.wornBy,
            },
            withData(withWeapon(data, bestSwap.key, bestSwap.refinement)),
            swapBlock,
          );
        }
        // the substat roll that pays most (only on a character wearing echoes: an empty build's next step is echoes)
        if (equippedEchoCount(data) > 0 && !cancelled()) {
          let top: { key: SubstatKey; roll: number; gain: number } | null = null;
          for (const key of keys) {
            if (cancelled()) break;
            const roll = expectedRoll(key);
            const clone = withSubstat(id, characters, inventoryEchoes, key, roll);
            const avgDamage = (await scoreRotation(rotation, id, clone.characters, enemy, clone.inventoryEchoes)).avgDamage;
            await pause();
            const gain = avgDamage / base - 1;
            if (!top || gain > top.gain) top = { key, roll, gain };
          }
          if (top && top.gain >= MIN_GAIN && !cancelled()) {
            const clone = withSubstat(id, characters, inventoryEchoes, top.key, top.roll);
            await push(
              { id: `${id}:substat:${top.key}`, kind: "substat", label: `${SUBSTAT_LABELS[top.key]} ${rollText(top.key, top.roll)}`, from: "an echo line", to: `one more ${SUBSTAT_LABELS[top.key]} roll`, substatKey: top.key, roll: top.roll },
              { characters: clone.characters, inventoryEchoes: clone.inventoryEchoes },
            );
          }
        }
      }
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done += 1;
    options.onProgress?.({ done, total: ranks.length, label: name }, sortInvestItems(items));
    await pause();
  }
  return { items: sortInvestItems(items), characters: ranks.length, errors, computedAt: new Date().toISOString(), cancelled: cancelled() };
}
