// Wuthering Tools+ Echo Lab — "who should wear this echo?" for every inventory echo: its value to each built
// character, swapped into the slot of the same cost it improves most and scored on that character's best
// rotation by the app's own engine (set bonuses that break or complete count — the swap recomputes them).
// A cheap linear pre-score (set change scored exactly + stat change at the build's per-point values) picks
// the top-K characters per echo; only those are scored exactly, in every slot the echo may go into. Verdicts:
//   keep  — an upgrade for someone, or worn, or (not fully tuned) likely to become one;
//   spare — no upgrade, but close to what its best owner wears (a backup), or a fair gamble to tune;
//   feed  — nobody gains from it and nobody wears it.
// Pure/async, worker-safe.
import { SUBSTAT_KEYS, type SubstatKey } from "../substats/substatWeights";
import {
  builtCharacterIds,
  echoLines,
  makePacer,
  perPointOf,
  prepareCharacter,
  relGain,
  scoreBuild,
  slotChecks,
  swapInto,
  wornByIndex,
  type LabCharacter,
  type LabSession,
  type RunControl,
  type SlotBlock,
  type SwapRules,
  type WornBy,
} from "./core";
import { echoPotential, type EchoPotentialResult, type PotentialOptions } from "./echoPotential";
import { rankSlots, substatWorth } from "./prescore";

export type EchoVerdictKind = "keep" | "spare" | "feed";
/**
 * upgrade: gains someone damage · worn: someone wears it · tune: not fully tuned, likely to beat what its best
 * owner wears · close: no upgrade but within `spareWithin` of the current echo · gamble: a fair chance once tuned ·
 * good-subs: no build can slot it as-is but its substats match what you wear · no-gain · no-slot: no built
 * character can slot it (a 4-cost of a species nobody uses as main echo, say)
 */
export type VerdictReason = "upgrade" | "worn" | "tune" | "close" | "gamble" | "good-subs" | "no-gain" | "no-slot";

export interface OwnerScore {
  characterId: string;
  name: string;
  slot: number;
  replacedEchoId: string | null;
  replacedEcho: string | null;
  /** the linear estimate that picked this pair */
  preScore: number;
  /** exact relative gain over the character's current build (≤ 0: not an upgrade) */
  gain: number;
  /** the same in damage per rotation (a support's +30 % can be less damage than a carry's +2 %) */
  damageGain: number;
  avgDamage: number;
  base: number;
  /** Energy Regen the swap adds to the build (negative: costs) */
  erChange: number;
}

export interface EchoVerdict {
  echoId: string;
  echo: string | null;
  set: string | null;
  cost: number | null;
  main: string | null;
  rank: number | null;
  lines: number;
  /** the substat lines it carries */
  subs: Array<{ key: string; value: number }>;
  wornBy: WornBy[];
  /** exact-scored owners, best first */
  owners: OwnerScore[];
  best: OwnerScore | null;
  /** characters it is an upgrade for (gain above `upgradeAbove`) */
  upgradeFor: string[];
  /** characters with at least one slot it may go into */
  legalOwners: number;
  /** characters whose every slot of that cost the swap rules closed: it would break a set bonus / cost too much ER /
   * cost their Healing Bonus (one count per character, the first of set → er → heal its slots name) */
  blocked: Record<SlotBlock, number>;
  /** Tune or Feed, for an echo with fewer than five lines (its best candidate owner) */
  potential: EchoPotentialResult | null;
  verdict: EchoVerdictKind;
  reason: VerdictReason;
}

/** One of a character's five slots as the engine resolved it (for the UI: what they wear, line by line). */
export interface LabSlotSummary {
  slot: number;
  echoId: string | null;
  echo: string | null;
  set: string | null;
  cost: number | null;
  main: string | null;
  rank: number | null;
  lines: Array<{ key: string; value: number }>;
  fromInventory: boolean;
}

export interface LabCharacterSummary {
  id: string;
  name: string;
  rotationName: string;
  rotationSource: string;
  base: number;
  complete: boolean;
  totalCost: number;
  /** inventory echoes that would raise this character's damage */
  upgrades: number;
  bestUpgrade: { echoId: string; slot: number; gain: number } | null;
  /** relative gain per point of each substat on this build (the pre-score's prices; the UI colours lines with them) */
  perPoint: Partial<Record<SubstatKey, number>>;
  /** what the character wears, slot by slot (null: an empty slot) */
  slots: Array<LabSlotSummary | null>;
}

export interface BestOwnerOptions {
  /** characters scored exactly per echo, every slot it may go into (default 4) */
  topK?: number;
  /** an exact gain above this is an upgrade (default 0) */
  upgradeAbove?: number;
  /** no upgrade but within this of the current echo → spare (default 0.02 = 2 % of the owner's damage) */
  spareWithin?: number;
  /** only these echoes (default: the whole inventory) */
  echoIds?: string[];
  /** only these owners (default: every built character) */
  characterIds?: string[];
  /** Tune or Feed for echoes with fewer than five lines (default true) */
  potential?: boolean;
  potentialOptions?: PotentialOptions;
  /** what a swap may not cost a build (default: keep every set bonus and any Healing Bonus, at most one ER roll of Energy Regen) */
  rules?: SwapRules;
}

export interface BestOwnerResult {
  fingerprint: string;
  characters: LabCharacterSummary[];
  skipped: Array<{ id: string; reason: string }>;
  echoes: EchoVerdict[];
  counts: Record<EchoVerdictKind, number>;
  scorings: number;
  ms: number;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const BLOCK_ORDER: readonly SlotBlock[] = ["set", "er", "heal"];

export async function bestOwners(session: LabSession, options: BestOwnerOptions = {}, control: RunControl = {}): Promise<BestOwnerResult> {
  const started = now();
  const startScorings = session.scorings;
  const pace = makePacer(control);
  const topK = Math.max(1, options.topK ?? 4);
  const upgradeAbove = options.upgradeAbove ?? 0;
  const spareWithin = options.spareWithin ?? 0.02;
  const wantPotential = options.potential ?? true;

  // 1. the owners: built characters with a full build, best rotation picked
  const ids = (options.characterIds ?? builtCharacterIds(session.account)).filter((id) => session.account.characters?.[id]);
  const labs: LabCharacter[] = [];
  for (let i = 0; i < ids.length; i++) {
    const lab = await prepareCharacter(session, ids[i], pace);
    if (lab && !lab.complete) {
      session.skipped.set(lab.id, "needs five echoes to compare against");
    } else if (lab) {
      labs.push(lab);
    }
    await pace({ phase: "characters", done: i + 1, total: ids.length, label: lab?.name ?? ids[i] });
  }

  // 2. what each substat point is worth on each build (the pre-score's prices), and what the echoes they wear are worth
  const wornWorth = new Map<string, number>();
  for (let i = 0; i < labs.length; i++) {
    const lab = labs[i];
    for (const key of SUBSTAT_KEYS) await perPointOf(session, lab, key);
    const worths: number[] = [];
    for (const s of lab.slots) if (s) worths.push(await substatWorth(session, lab, s.record));
    worths.sort((a, b) => a - b);
    wornWorth.set(lab.id, worths.length ? worths[Math.floor((worths.length - 1) / 2)] : 0);
    await pace({ phase: "weights", done: i + 1, total: labs.length, label: lab.name });
  }

  // 3. every echo: pre-score every legal (character, slot), score the top K exactly
  const worn = wornByIndex(session.account);
  const wanted = options.echoIds ? new Set(options.echoIds) : null;
  const pool = session.account.echoes.filter((e) => e?.echoId && (!wanted || wanted.has(e.echoId)));
  const rows: EchoVerdict[] = [];
  const upgradesOf = new Map<string, Array<{ echoId: string; slot: number; gain: number }>>();
  for (let n = 0; n < pool.length; n++) {
    const echo = pool[n];
    const subs = echoLines(echo).map((l) => ({ key: l.key, value: l.value }));
    const lines = subs.length;
    const partial = lines < 5;
    const candidates: Array<{ lab: LabCharacter; slot: number; pre: number }> = [];
    const bestPreOf = new Map<string, number>();
    let legalOwners = 0;
    const blocked: Record<SlotBlock, number> = { set: 0, er: 0, heal: 0 };
    for (const lab of labs) {
      const checks = slotChecks(lab, echo, options.rules);
      if (!checks.length) continue;
      if (checks.every((c) => c.blocked)) {
        blocked[BLOCK_ORDER.find((b) => checks.some((c) => c.blocked === b)) ?? "er"] += 1;
        continue;
      }
      legalOwners += 1;
      const ranked = await rankSlots(session, lab, echo, { fill: partial, rules: options.rules });
      if (!ranked.length) continue;
      bestPreOf.set(lab.id, ranked[0].pre);
      for (const r of ranked) candidates.push({ lab, slot: r.slot, pre: r.pre });
    }
    const topLabs = new Set([...bestPreOf.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([id]) => id));

    const owners: OwnerScore[] = [];
    for (const c of candidates) {
      if (!topLabs.has(c.lab.id)) continue;
      let avg: number;
      try {
        avg = await scoreBuild(session, c.lab, swapInto(session, c.lab, session.account.echoes, echo.echoId, c.slot), session.account.echoes);
      } catch {
        continue;
      }
      owners.push({
        characterId: c.lab.id,
        name: c.lab.name,
        slot: c.slot,
        replacedEchoId: c.lab.slots[c.slot]?.echoId ?? null,
        replacedEcho: c.lab.slots[c.slot]?.species ?? null,
        preScore: c.pre,
        gain: relGain(c.lab.base, avg),
        damageGain: avg - c.lab.base,
        avgDamage: avg,
        base: c.lab.base,
        erChange: slotChecks(c.lab, echo, options.rules).find((k) => k.slot === c.slot)?.erChange ?? 0,
      });
    }
    // one entry per character (its better slot), best first
    owners.sort((a, b) => b.gain - a.gain || a.characterId.localeCompare(b.characterId));
    const seen = new Set<string>();
    const unique = owners.filter((o) => (seen.has(o.characterId) ? false : (seen.add(o.characterId), true)));
    for (const o of unique) {
      if (o.gain > upgradeAbove) upgradesOf.set(o.characterId, [...(upgradesOf.get(o.characterId) ?? []), { echoId: echo.echoId, slot: o.slot, gain: o.gain }]);
    }

    // 4. not fully tuned: what it can still become in its most promising owner's slot
    let potential: EchoPotentialResult | null = null;
    if (wantPotential && partial && candidates.length) {
      const target = [...candidates].sort((a, b) => b.pre - a.pre)[0];
      try {
        potential = await echoPotential(session, echo.echoId, { characterId: target.lab.id, slot: target.slot }, { rules: options.rules, ...options.potentialOptions }, control);
      } catch {
        potential = null;
      }
    }

    const wornBy = worn.get(echo.echoId) ?? [];
    const upgradeFor = unique.filter((o) => o.gain > upgradeAbove).map((o) => o.characterId);
    const best = unique[0] ?? null;
    let verdict: EchoVerdictKind;
    let reason: VerdictReason;
    if (upgradeFor.length) [verdict, reason] = ["keep", "upgrade"];
    else if (wornBy.length) [verdict, reason] = ["keep", "worn"];
    else if (potential?.verdict === "tune") [verdict, reason] = ["keep", "tune"];
    else if (best && best.gain >= -spareWithin) [verdict, reason] = ["spare", "close"];
    else if (potential?.verdict === "gamble") [verdict, reason] = ["spare", "gamble"];
    else if (!legalOwners && (await hasGoodSubs(session, labs, echo, wornWorth))) [verdict, reason] = ["spare", "good-subs"];
    else [verdict, reason] = ["feed", legalOwners ? "no-gain" : "no-slot"];

    rows.push({
      echoId: echo.echoId,
      echo: echo.echo ?? null,
      set: echo.echoSet ?? null,
      cost: Number(echo.type) || null,
      main: echo.stat ?? null,
      rank: echo.rank != null ? Number(echo.rank) : null,
      lines,
      subs,
      wornBy,
      owners: unique,
      best,
      upgradeFor,
      legalOwners,
      blocked,
      potential,
      verdict,
      reason,
    });
    await pace({ phase: "echoes", done: n + 1, total: pool.length, label: echo.echo ?? echo.echoId });
  }

  const counts: Record<EchoVerdictKind, number> = { keep: 0, spare: 0, feed: 0 };
  for (const r of rows) counts[r.verdict] += 1;
  const characters: LabCharacterSummary[] = labs.map((lab) => {
    const ups = (upgradesOf.get(lab.id) ?? []).sort((a, b) => b.gain - a.gain);
    return {
      id: lab.id,
      name: lab.name,
      rotationName: lab.rotationName,
      rotationSource: lab.rotationSource,
      base: lab.base,
      complete: lab.complete,
      totalCost: lab.totalCost,
      upgrades: ups.length,
      bestUpgrade: ups[0] ?? null,
      perPoint: Object.fromEntries(SUBSTAT_KEYS.filter((k) => lab.perPoint.has(k)).map((k) => [k, lab.perPoint.get(k) as number])),
      slots: lab.slots.map((s) =>
        s
          ? {
              slot: s.slot,
              echoId: s.echoId,
              echo: s.species,
              set: s.set,
              cost: s.cost,
              main: s.record?.stat ?? null,
              rank: s.record?.rank != null ? Number(s.record.rank) : null,
              lines: echoLines(s.record).map((l) => ({ key: l.key, value: l.value })),
              fromInventory: s.fromInventory,
            }
          : null,
      ),
    };
  });
  return {
    fingerprint: session.fingerprint,
    characters,
    skipped: [...session.skipped.entries()].filter(([id]) => ids.includes(id)).map(([id, reason]) => ({ id, reason })),
    echoes: rows,
    counts,
    scorings: session.scorings - startScorings,
    ms: now() - started,
  };
}

/** No build can slot it as-is: are its substats at least as good as the median echo some build wears? */
async function hasGoodSubs(session: LabSession, labs: LabCharacter[], echo: Record<string, any>, wornWorth: Map<string, number>): Promise<boolean> {
  for (const lab of labs) {
    const median = wornWorth.get(lab.id);
    if (median === undefined || median <= 0) continue;
    if ((await substatWorth(session, lab, echo)) >= median) return true;
  }
  return false;
}
