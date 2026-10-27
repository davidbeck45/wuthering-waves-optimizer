// Wuthering Tools+ Echo Lab — a damage-based build score in the manner of Fribbels' HSR benchmarks: the build's
// echo substats measured against three builds the engine generates under the same conditions — same
// character, weapon, chains, main stats, sets and main echo, same best rotation:
//   B (0 %)   every substat line blanked;
//   R (100 %) a realistic spread — Riley31415's ChemX32 (wuwa_calc `shared/substats.ts`): 5/5/2/2/2 rolls at the
//             median tier over Crit Rate, Crit DMG and the three stats this build values most (the engine ranks
//             them on B, so the reference never depends on the rolls being judged), one median roll of each of
//             the other eight — 24 of the 25 rolls, one left unspent as in his spread;
//   P (200 %) a perfect spread — 25 best-tier rolls placed one at a time where the engine gains most, at most one
//             line of a stat per echo (≤ 5 rolls of a stat).
// score = (D − B) / (R − B) below R, 1 + (D − R) / (P − R) above it; clamped to 0–200 %. Scores compare builds
// of one character on one rotation, never across characters (Fribbels' own caveat). Pure/async, worker-safe.
import { SUBSTAT_KEYS, SUBSTAT_LABELS, expectedRoll, maxRoll, medianRoll, type SubstatKey } from "../substats/substatWeights";
import {
  echoLines,
  makePacer,
  prepareCharacter,
  scoreBuild,
  withInventoryRecord,
  withLines,
  type LabCharacter,
  type LabSession,
  type RunControl,
} from "./core";
// Wuthering Tools+ energy check: Energy Regen as a floor (src/sim/energy/)
import { menuEnergyRegen } from "../energy/energyHave";
import { erBenchmarkNote, erFactorFor, erReferenceCounts, erRollsToFloor } from "../energy/erAwareScorer";

/** ChemX32's roll counts for its five named stats, most important first (the other eight take one roll each). */
export const REFERENCE_SHAPE = [5, 5, 2, 2, 2] as const;

export const BENCHMARK_NOTES = [
  "100 % = Riley31415's ChemX32 spread (wuwa_calc): 5/5/2/2/2 median rolls over Crit Rate, Crit DMG and the three stats the engine values most on this build without substats, one median roll of every other stat — 24 of 25 rolls.",
  "200 % = 25 best-tier rolls, each placed where the engine gains most; at most one line of a stat per echo.",
  "0 % = the same echoes with every substat line removed (main stats, sets and main echo kept).",
  "Energy Regen reads as worth nothing to the static engine, so the references spend no rolls chasing it.",
] as const;

export interface SpreadLine {
  key: SubstatKey;
  label: string;
  rolls: number;
  /** the value of one roll (yours: the average of your lines of it) */
  value: number;
  total: number;
}

export interface BenchmarkOptions {
  /** stats the perfect spread may pick from: the best this many on B (Crit Rate and Crit DMG always; default 8) */
  greedyTypes?: number;
  /** per character, the ER need (%) of their saved teams (`erNeedsOf(useEnergyNeeds())`): every build scores
   *  damage × (1 − ER deficit) and the reference spends ER rolls up to it, as ChemX32 does */
  erNeeds?: Record<string, number>;
}

export interface BenchmarkResult {
  characterId: string;
  name: string;
  rotationName: string;
  rotationSource: string;
  /** average damage of the rotation: your build, and the three references */
  D: number;
  B: number;
  R: number;
  P: number;
  /** 0–2 (0–200 %); null when substats do not move this rotation */
  score: number | null;
  rawScore: number | null;
  /** the five stats the reference spread names, most important first */
  named: SubstatKey[];
  reference: SpreadLine[];
  perfect: SpreadLine[];
  yours: SpreadLine[];
  notes: readonly string[];
  scorings: number;
  /** the ER floor the scores respect (%), null without one; the ER your build has (%) */
  erNeed: number | null;
  erHave: number | null;
}

/** The benchmark score from the four damage numbers (null when R ≤ B). */
export function benchmarkScoreOf(D: number, B: number, R: number, P: number): { score: number | null; rawScore: number | null } {
  if (!(R - B > 1e-9)) return { score: null, rawScore: null };
  const raw = D < R ? (D - B) / (R - B) : P - R > 1e-9 ? 1 + (D - R) / (P - R) : 1;
  return { score: Math.min(2, Math.max(0, raw)), rawScore: raw };
}

type Counts = Map<SubstatKey, number>;
/** The value of one roll of a stat in a spread (median tier, best tier, …). */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
type RollValue = (key: SubstatKey) => number;

/**
 * Five echoes' worth of lines for a spread: each stat's rolls go onto distinct echoes (one line of a stat per
 * echo), the most-rolled stats first, onto the echoes with the most room. Always fits: ≤ 5 rolls a stat, ≤ 25 in all.
 */
export function placeSpread(counts: Counts, valueOf: RollValue): Array<Array<{ key: string; value: number }>> {
  const echoes: Array<Array<{ key: string; value: number }>> = [[], [], [], [], []];
  const entries = [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || SUBSTAT_KEYS.indexOf(a[0]) - SUBSTAT_KEYS.indexOf(b[0]));
  for (const [key, n] of entries) {
    const room = echoes
      .map((lines, i) => ({ i, free: 5 - lines.length }))
      .filter((e) => e.free > 0)
      .sort((a, b) => b.free - a.free || a.i - b.i)
      .slice(0, Math.min(5, n));
    if (room.length < n) throw new Error(`a spread of ${n} ${key} rolls does not fit five echoes`);
    for (const { i } of room) echoes[i].push({ key, value: valueOf(key) });
  }
  return echoes;
}

/** A clone of the build with the five echoes' substats replaced by `perEcho` (main stats and sets kept). */
export function withEchoLines(session: LabSession, lab: LabCharacter, perEcho: Array<Array<{ key: string; value: number }>>): { characters: Record<string, any>; echoes: any[] } {
  let { characters, echoes } = session.account;
  const data = characters?.[lab.id] ?? {};
  const stored = data.echoes ?? {};
  const nextSlots: Record<string, any> = Array.isArray(stored) ? [...stored] : { ...stored };
  let slotsChanged = false;
  lab.slots.forEach((s, i) => {
    if (!s) return;
    const record = withLines(s.record, perEcho[i] ?? []);
    if (s.fromInventory) {
      echoes = withInventoryRecord(echoes, { ...record, echoId: s.echoId });
    } else {
      nextSlots[i] = { ...record, echoId: null };
      slotsChanged = true;
    }
  });
  if (slotsChanged) characters = { ...characters, [lab.id]: { ...data, echoes: nextSlots } };
  return { characters, echoes };
}

const spreadLines = (counts: Counts, valueOf: RollValue): SpreadLine[] =>
  [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || SUBSTAT_KEYS.indexOf(a[0]) - SUBSTAT_KEYS.indexOf(b[0]))
    .map(([key, rolls]) => ({ key, label: SUBSTAT_LABELS[key], rolls, value: valueOf(key), total: rolls * valueOf(key) }));

export async function benchmarkScore(session: LabSession, characterId: string, options: BenchmarkOptions = {}, control: RunControl = {}): Promise<BenchmarkResult> {
  const pace = makePacer(control);
  const lab = await prepareCharacter(session, characterId, pace);
  if (!lab) throw new Error(`${characterId} can't be scored: ${session.skipped.get(characterId) ?? "unknown"}`);
  if (!lab.slots.every(Boolean)) throw new Error(`${lab.name} needs five echoes for a benchmark`);
  const startScorings = session.scorings;
  const erNeed = options.erNeeds?.[lab.id] ?? null;
  const erFactor = erFactorFor(lab.id, erNeed);
  let work = 0;
  const score = async (perEcho: Array<Array<{ key: string; value: number }>>): Promise<number> => {
    const clone = withEchoLines(session, lab, perEcho);
    const avg = await scoreBuild(session, lab, clone.characters, clone.echoes);
    work += 1;
    await pace({ phase: "benchmark", done: work, total: 230, label: lab.name });
    return erFactor ? avg * (await erFactor(clone.characters, clone.echoes)) : avg;
  };
  const empty: Array<Array<{ key: string; value: number }>> = [[], [], [], [], []];

  // B, and what one expected roll of each stat is worth on it
  const B = await score(empty);
  const onB = new Map<SubstatKey, number>();
  for (const key of SUBSTAT_KEYS) onB.set(key, (await score([[{ key, value: expectedRoll(key) }], [], [], [], []])) - B);
  const byValue = [...SUBSTAT_KEYS].sort((a, b) => (onB.get(b) ?? 0) - (onB.get(a) ?? 0) || SUBSTAT_KEYS.indexOf(a) - SUBSTAT_KEYS.indexOf(b));

  // R: ChemX32 — crit first, then the three stats this build values most
  const crit: SubstatKey[] = (["CritRate", "CritDMG"] as SubstatKey[]).sort((a, b) => (onB.get(b) ?? 0) - (onB.get(a) ?? 0));
  let named = [...crit, ...byValue.filter((k) => k !== "CritRate" && k !== "CritDMG").slice(0, 3)];
  let refCounts: Counts = new Map(SUBSTAT_KEYS.map((k) => [k, 1]));
  named.forEach((k, i) => refCounts.set(k, REFERENCE_SHAPE[i]));
  if (erFactor) {
    // with a floor, ER is placed by the need (promoted to third, at most three rolls) and never named for its value
    const blank = withEchoLines(session, lab, empty);
    const ref = erReferenceCounts([...crit, ...byValue.filter((k) => k !== "CritRate" && k !== "CritDMG")], erRollsToFloor(erNeed, await menuEnergyRegen(lab.id, blank.characters, blank.echoes)));
    named = ref.named;
    refCounts = ref.counts;
  }
  const R = await score(placeSpread(refCounts, medianRoll));

  // P: 25 best-tier rolls, greedily where the engine gains most
  const greedyTypes = Math.max(2, options.greedyTypes ?? 8);
  const candidates = [...new Set<SubstatKey>(["CritRate", "CritDMG", ...(erFactor ? (["EnergyRegen"] as SubstatKey[]) : []), ...byValue.slice(0, greedyTypes)])];
  const perfect: Counts = new Map();
  let P = B;
  for (let step = 0; step < 25; step++) {
    let pick: SubstatKey | null = null;
    let pickScore = P;
    for (const key of candidates) {
      if ((perfect.get(key) ?? 0) >= 5) continue;
      const trial = new Map(perfect);
      trial.set(key, (trial.get(key) ?? 0) + 1);
      const s = await score(placeSpread(trial, maxRoll));
      if (s > pickScore + 1e-9) {
        pick = key;
        pickScore = s;
      }
    }
    if (!pick) break; // nothing left that adds damage
    perfect.set(pick, (perfect.get(pick) ?? 0) + 1);
    P = pickScore;
  }

  // D: your build as it is
  const D = erFactor ? lab.base * (await erFactor(session.account.characters, session.account.echoes)) : lab.base;
  const yoursCounts: Counts = new Map();
  const yoursTotals = new Map<SubstatKey, number>();
  for (const s of lab.slots) {
    for (const line of echoLines(s?.record)) {
      const key = line.key as SubstatKey;
      if (!SUBSTAT_KEYS.includes(key)) continue;
      yoursCounts.set(key, (yoursCounts.get(key) ?? 0) + 1);
      yoursTotals.set(key, (yoursTotals.get(key) ?? 0) + line.value);
    }
  }
  const { score: s, rawScore } = benchmarkScoreOf(D, B, R, Math.max(P, R));
  return {
    characterId: lab.id,
    name: lab.name,
    rotationName: lab.rotationName,
    rotationSource: lab.rotationSource,
    D,
    B,
    R,
    P: Math.max(P, R),
    score: s,
    rawScore,
    named,
    reference: spreadLines(refCounts, medianRoll),
    perfect: spreadLines(perfect, maxRoll),
    yours: spreadLines(yoursCounts, (key) => (yoursTotals.get(key) ?? 0) / (yoursCounts.get(key) || 1)),
    notes: erFactor ? [...BENCHMARK_NOTES.slice(0, 3), erBenchmarkNote(erNeed, refCounts.get("EnergyRegen") ?? 1)] : BENCHMARK_NOTES,
    scorings: session.scorings - startScorings,
    erNeed,
    erHave: erFactor ? await menuEnergyRegen(lab.id, session.account.characters, session.account.echoes) : null,
  };
}
