// Wuthering Tools+ — the optimizer's bench and equivalence harness (track "optimizer-speed", 2026-11-02).
//
// Builds optimizer runs ("cases") from an account (an export, or a test fixture), runs each through the loop as it
// stood before the speedups (`referenceOptimize`) and through the inline backend as it is now, times both and checks
// that they return the same top N: the same echoes (by id, slot for slot), in the same order, with the same score and
// energy regen to the last bit (Object.is). `npm run cli -- optimizer-bench` prints the table; the vitest equivalence
// suite runs a fixture subset. Node-only by use (no DOM, no stores), nothing in the app imports it.
import { getCharByName } from "../../characters/characters";
import { RANKING_ENEMY } from "../myRankings/rankRoster";
import { bestRotationOf, currentEchoesOf } from "../buildTeam/buildTeam";
import { constraintsOf, DEFAULT_OPTIONS, filterPool, mainEchoCandidates } from "../buildTeam/constraints";
import { erMinStat, inlineBackend, prepareMemberJob, type MemberJob, type Objective, type OptimizeOutcome, type OptimizeRequest } from "../buildTeam/headlessOptimizer";
import { planFromPreset } from "../buildTeam/rileyPlan";
import type { OptimizerLoadoutFormat } from "../../calculator/optimizer";
import { referenceOptimize, type ReferenceOutcome } from "./referenceOptimizer";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BenchSource {
  characters: Record<string, any>;
  echoes: any[];
}

export interface BenchCase {
  name: string;
  characterId: string;
  /** "crit DPS", "4-star", "healer", "Rover", "edge" */
  kind: string;
  /** "rotation" = the character's best rotation; else a `Stat:` target (`Stat:energyRegen` is build-team's ER run) */
  target: "rotation" | `Stat:${string}`;
  pool: any[];
  mainEchoKeys: string[];
  loadoutFormat: OptimizerLoadoutFormat;
  /** character-screen ER floor (%), turned into the optimizer's row by the job's offset (build-team's rule) */
  erFloor: number | null;
  topN: number;
}

export interface CaseRun {
  name: string;
  kind: string;
  pool: number;
  format: OptimizerLoadoutFormat;
  generated: number;
  before: { ms: number[]; cpuMs: number[]; generationMs: number; scoringMs: number; scored: number };
  after: { ms: number[]; cpuMs: number[]; scored: number; pruned: number; bounds: number };
  same: boolean;
  diff: string | null;
  results: number;
  best: number | null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN;
};
export const medianOf = median;

/** The first difference between two top-N lists, or null when they are the same to the last bit. */
export function diffOutcomes(a: Pick<OptimizeOutcome, "results" | "generated" | "processed">, b: Pick<OptimizeOutcome, "results" | "generated" | "processed">): string | null {
  if (a.generated !== b.generated) return `generated ${a.generated} vs ${b.generated}`;
  if (a.processed !== b.processed) return `processed ${a.processed} vs ${b.processed}`;
  if (a.results.length !== b.results.length) return `${a.results.length} results vs ${b.results.length}`;
  for (let i = 0; i < a.results.length; i++) {
    const x = a.results[i]!;
    const y = b.results[i]!;
    if (!Object.is(x.targetValue, y.targetValue)) return `#${i + 1} score ${x.targetValue} vs ${y.targetValue}`;
    if (!Object.is(x.energyRegen, y.energyRegen)) return `#${i + 1} energy regen ${x.energyRegen} vs ${y.energyRegen}`;
    const ids = (r: typeof x): string => r.loadout.map((e: any) => String(e?.echoId)).join(",");
    if (ids(x) !== ids(y)) return `#${i + 1} echoes ${ids(x)} vs ${ids(y)}`;
  }
  return null;
}

/** A deterministic pseudo-random stream (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `copies` stat-identical copies of every echo (new ids), interleaved after the originals: a big pool the
 *  signature dedup folds back to the originals. */
export function withCopies(pool: readonly any[], copies: number, tag = "copy"): any[] {
  const out = [...pool];
  for (let c = 1; c <= copies; c++) for (const e of pool) out.push({ ...e, echoId: `${tag}${c}-${e.echoId}` });
  return out;
}

const SUB_VALUES: Record<string, number[]> = {
  CritRate: [6.3, 6.9, 7.5, 8.1, 8.7, 9.3, 9.9, 10.5],
  CritDMG: [12.6, 13.8, 15, 16.2, 17.4, 18.6, 19.8, 21],
  ATK: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
  ATK_FLAT: [30, 40, 50, 60],
  HP: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
  HP_FLAT: [320, 360, 390, 430, 470, 510, 540, 580],
  DEF: [8.1, 9, 10, 10.9, 11.8, 12.8, 13.8, 14.7],
  DEF_FLAT: [40, 50, 60, 70],
  EnergyRegen: [6.8, 7.6, 8.4, 9.2, 10, 10.8, 11.6, 12.4],
  BasicAttackDMGBonus: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
  HeavyAttackDMGBonus: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
  ResonanceSkillDMGBonus: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
  ResonanceLiberationDMGBonus: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
};

/**
 * Synthetic echoes for tests (no personal data): `n` echoes of the given species (cost from the species' class list
 * the caller passes), sets and main stats, five distinct substats each drawn from the game's roll tiers by a seeded
 * stream.
 */
export function syntheticEchoes(seed: number, n: number, species: Array<{ echo: string; type: number }>, sets: string[], mainStats: Record<number, string[]>, idPrefix = "syn"): any[] {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const subKeys = Object.keys(SUB_VALUES);
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const sp = pick(species);
    const subs: string[] = [];
    while (subs.length < 5) {
      const k = pick(subKeys);
      if (!subs.includes(k)) subs.push(k);
    }
    const echo: any = { echo: sp.echo, type: sp.type, rank: 5, stat: pick(mainStats[sp.type] ?? ["ATK"]), echoId: `${idPrefix}${seed}-${i}`, echoSet: pick(sets) };
    subs.forEach((k, j) => {
      echo[`echoSubStatsType${j + 1}`] = k;
      echo[`echoSubStatsValue${j + 1}`] = pick(SUB_VALUES[k]!);
    });
    out.push(echo);
  }
  return out;
}

/** The objective a case scores: the character's best rotation the way build-team picks it, or its first curated one
 *  (`fast`: tests, no wuwa_calc presets). */
export async function objectiveOf(characterId: string, source: BenchSource, fast = false): Promise<Objective | null> {
  if (!fast) return bestRotationOf(characterId, source.characters, source.echoes, RANKING_ENEMY);
  const own = (source.characters[characterId]?.rotations ?? []).find((r: any) => r?.actions?.length);
  if (own) return { rotation: { id: own.id ?? "own", name: own.name, duration: own.duration ?? null, actions: own.actions }, label: own.name, source: "yours" };
  const chosen = (await getCharByName(characterId)) as any;
  const curated = (chosen?.rotations ?? []).find((p: any) => p?.data?.actions?.length);
  if (!curated) return null;
  return {
    rotation: { id: "curated-0", name: curated.name, duration: curated.data?.duration ?? null, actions: curated.data.actions.map((a: any, i: number) => ({ ...a, id: a.id ?? `c${i}` })) },
    label: curated.name,
    source: "curated",
  };
}

/** The sets and main echo the character wears now, or (nothing worn) its first curated echo preset's. */
export async function wornOrPreset(characterId: string, source: BenchSource): Promise<{ sets: string[]; main: string | null; plan: ReturnType<typeof planFromPreset> | null }> {
  const chosen = (await getCharByName(characterId)) as any;
  const preset = chosen?.echoes?.find((p: any) => p?.data?.echoes);
  const plan = preset ? planFromPreset(characterId, preset) : null;
  const worn = currentEchoesOf(characterId, source.characters, source.echoes).filter(Boolean) as any[];
  if (worn.length) return { sets: [...new Set(worn.map((e) => e.echoSet).filter(Boolean))], main: worn[0]?.echo ?? null, plan };
  return { sets: plan?.sets.map((s) => s.key) ?? [], main: plan?.mainEcho?.keys[0] ?? null, plan };
}

export interface CaseSpec {
  characterId: string;
  kind: string;
  /** formats over the worn sets' pool; default all three */
  formats?: OptimizerLoadoutFormat[];
  /** also the curated preset's plan: its sets, main stats per cost and layout (build-team's filters) */
  plan?: boolean;
  /** ER floors (%) on the worn sets' pool under "Any" */
  erFloors?: number[];
  /** extra `Stat:` targets on the worn sets' pool under "Any" */
  stats?: string[];
}

/** The cases for one character, from the account. */
export async function casesFor(spec: CaseSpec, source: BenchSource): Promise<BenchCase[]> {
  const { characterId, kind } = spec;
  const { sets, main, plan } = await wornOrPreset(characterId, source);
  const out: BenchCase[] = [];
  const usable = source.echoes.filter((e) => e && !e.ignoreFromOptimizer);
  const base = (over: Partial<BenchCase> & Pick<BenchCase, "name" | "pool" | "mainEchoKeys" | "loadoutFormat">): BenchCase => ({ characterId, kind, target: "rotation", erFloor: null, topN: 5, ...over });
  if (main && sets.length) {
    const pool = usable.filter((e) => sets.includes(e.echoSet));
    for (const f of spec.formats ?? (["Any", "43311", "44111"] as OptimizerLoadoutFormat[])) out.push(base({ name: `${characterId} · ${f} · worn sets`, pool, mainEchoKeys: [main], loadoutFormat: f }));
    for (const floor of spec.erFloors ?? []) out.push(base({ name: `${characterId} · Any · worn sets · ER ≥ ${floor} %`, pool, mainEchoKeys: [main], loadoutFormat: "Any", erFloor: floor }));
    for (const stat of spec.stats ?? []) out.push(base({ name: `${characterId} · Any · worn sets · ${stat}`, pool, mainEchoKeys: [main], loadoutFormat: "Any", target: stat as BenchCase["target"] }));
  }
  if (spec.plan && plan && plan.source !== "none") {
    const c = constraintsOf(plan, DEFAULT_OPTIONS);
    const { pool } = filterPool(source.echoes, c);
    const { keys } = mainEchoCandidates(pool, c);
    if (keys.length) out.push(base({ name: `${characterId} · ${c.loadoutFormat} · preset plan (sets + main stats)`, pool, mainEchoKeys: keys, loadoutFormat: c.loadoutFormat }));
  }
  return out;
}

export interface PreparedCase {
  case: BenchCase;
  job: MemberJob;
  request: OptimizeRequest;
}

const jobMemo = new WeakMap<BenchSource, Map<string, Promise<MemberJob | null>>>();

/** The member job a case runs on (memoised per character, set list and main-echo list). */
export async function prepareCase(c: BenchCase, source: BenchSource, opts: { fastObjective?: boolean } = {}): Promise<PreparedCase | null> {
  let memo = jobMemo.get(source);
  if (!memo) jobMemo.set(source, (memo = new Map()));
  const setKeys = [...new Set(c.pool.map((e) => e.echoSet).filter(Boolean))].sort();
  const key = `${c.characterId}|${setKeys.join(",")}|${[...c.mainEchoKeys].sort().join(",")}`;
  let hit = memo.get(key);
  if (!hit) {
    hit = (async () => {
      const objective = await objectiveOf(c.characterId, source, opts.fastObjective);
      if (!objective) return null;
      return prepareMemberJob({ characterId: c.characterId, characters: source.characters, inventoryEchoes: source.echoes, enemy: RANKING_ENEMY, objective, setKeys, mainEchoKeys: c.mainEchoKeys });
    })();
    memo.set(key, hit);
  }
  const base = await hit;
  if (!base) return null;
  const job: MemberJob = c.target === "rotation" ? base : { ...base, id: `${base.id}:${c.target}`, target: c.target };
  return { case: c, job, request: { pool: c.pool, mainEchoKeys: c.mainEchoKeys, loadoutFormat: c.loadoutFormat, minStats: erMinStat(job, c.erFloor), topN: c.topN } };
}

const cpuMs = (): number => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

/** One case, `reps` times each way (the order alternates so neither side always runs on a warm JIT). */
export async function runCase(p: PreparedCase, reps = 3): Promise<CaseRun> {
  const before: CaseRun["before"] = { ms: [], cpuMs: [], generationMs: 0, scoringMs: 0, scored: 0 };
  const after: CaseRun["after"] = { ms: [], cpuMs: [], scored: 0, pruned: 0, bounds: 0 };
  let ref: ReferenceOutcome | null = null;
  let now: OptimizeOutcome | null = null;
  const gens: number[] = [];
  const scores: number[] = [];
  for (let r = 0; r < reps; r++) {
    for (const side of r % 2 === 0 ? ["before", "after"] : ["after", "before"]) {
      const t = performance.now();
      const c = cpuMs();
      if (side === "before") {
        ref = referenceOptimize(p.job, p.request);
        before.ms.push(performance.now() - t);
        before.cpuMs.push(cpuMs() - c);
        gens.push(ref.generationMs);
        scores.push(ref.scoringMs);
      } else {
        now = await inlineBackend().optimize(p.job, p.request);
        after.ms.push(performance.now() - t);
        after.cpuMs.push(cpuMs() - c);
      }
    }
  }
  before.generationMs = median(gens);
  before.scoringMs = median(scores);
  before.scored = ref!.processed;
  after.scored = now!.scored ?? now!.processed;
  after.pruned = now!.pruned ?? 0;
  after.bounds = now!.bounds ?? 0;
  const diff = diffOutcomes(ref!, now!);
  return {
    name: p.case.name,
    kind: p.case.kind,
    pool: p.case.pool.length,
    format: p.case.loadoutFormat,
    generated: ref!.generated,
    before,
    after,
    same: diff === null,
    diff,
    results: ref!.results.length,
    best: ref!.results[0]?.targetValue ?? null,
  };
}

/** The bench's standard case list on an account: the four kinds the brief names, the three formats, filters, floors,
 *  an empty pool, a pool without its main echo and a 250-echo pool. */
export const STANDARD_SPECS: CaseSpec[] = [
  { characterId: "Galbrena", kind: "crit DPS", plan: true, stats: ["Stat:totalAtk"] },
  { characterId: "Cartethyia", kind: "crit DPS", plan: true },
  { characterId: "Aemeath", kind: "crit DPS", plan: true, erFloors: [125] },
  { characterId: "Phrolova", kind: "crit DPS", plan: true },
  { characterId: "Camellya", kind: "crit DPS", formats: ["Any", "43311"] },
  { characterId: "Zani", kind: "crit DPS", formats: ["Any"] },
  { characterId: "Lynae", kind: "crit DPS", formats: ["Any"] },
  { characterId: "Sigrika", kind: "crit DPS", formats: ["Any"] },
  { characterId: "Danjin", kind: "4-star", plan: true },
  { characterId: "Shorekeeper", kind: "healer", plan: true, erFloors: [150, 220, 400], stats: ["Stat:energyRegen"] },
  { characterId: "Verina", kind: "healer", formats: ["Any", "43311"], erFloors: [180] },
  { characterId: "RoverAeroMale", kind: "Rover", plan: true, erFloors: [140] },
];

/** The edge cases on top: an empty pool, a pool whose main echo is missing, a 250-echo pool (stat-identical copies). */
export function edgeCases(from: BenchCase[]): BenchCase[] {
  const out: BenchCase[] = [];
  const seed = from.find((c) => c.loadoutFormat === "Any" && c.pool.length >= 20 && c.erFloor === null && c.target === "rotation");
  if (!seed) return out;
  out.push({ ...seed, name: `${seed.characterId} · Any · empty pool`, kind: "edge", pool: [] });
  out.push({ ...seed, name: `${seed.characterId} · Any · no copy of the main echo`, kind: "edge", pool: seed.pool.filter((e) => !seed.mainEchoKeys.includes(e.echo)) });
  const base = seed.pool.slice(0, 25);
  const big = withCopies(base, Math.ceil(250 / base.length) - 1).slice(0, 250);
  for (const f of ["Any", "43311"] as OptimizerLoadoutFormat[]) out.push({ ...seed, name: `${seed.characterId} · ${f} · 250-echo pool (${base.length} echoes and stat-identical copies)`, kind: "edge", pool: big, loadoutFormat: f });
  return out;
}

/** Build-team runs a member whose weapon is unset as "not set up": the bench gives a weaponless 4-star a 4-star
 *  sword in memory so it can be measured (the export is never written). */
export function benchCharacters(characters: Record<string, any>): Record<string, any> {
  const out = { ...characters };
  if (out.Danjin && !out.Danjin.weapon) out.Danjin = { ...out.Danjin, weapon: "CommandoOfConviction" };
  return out;
}

