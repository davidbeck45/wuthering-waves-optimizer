import { describe, it, expect } from "vitest";
import {
  generateLoadouts,
  getOptimizerLoadoutHash,
  getOptimizerLoadoutKey,
  normalizeOptimizerLoadout,
  type OptimizerLoadoutFormat,
} from "../../calculator/optimizer";
import {
  getSetBonusEffects,
  setBonusEffectsOne,
  setBonusEffectsOnePiece,
  setBonusEffectsTwo,
} from "../../echoes/sets";
import { echoSetLabelMap } from "../../echoes/stats";
import {
  canSkipDominatedPartials,
  hasLoadoutExtensions,
  normalizeOptimizerLoadoutCached,
  optimizerLoadoutStream,
  planOptimizerGeneration,
  prepareOptimizerEchoPool,
  type OptimizerGenerationInput,
} from "./optimizerPool";

type Echo = Record<string, any>;

function echo(species: string, type: number, echoId: string, cr = 0, set = "SetA"): Echo {
  return {
    echoId,
    echo: species,
    echoSet: set,
    type,
    rank: 5,
    stat: type === 4 ? "CritRate" : "ATK",
    echoSubStatsType1: "CritRate",
    echoSubStatsValue1: cr,
    echoSubStatsType2: null,
    echoSubStatsValue2: null,
  };
}

/** Upstream's generator loop (generator.worker.ts before the perf track), as a key list. */
function upstreamKeys(echoes: Echo[], main: string[], format: OptimizerLoadoutFormat, shardIndex = 0, shardCount = 1) {
  const seen = new Set<number>();
  const keys: string[] = [];
  const ids: string[][] = [];
  for (const loadout of generateLoadouts(echoes, main, 0, [], 0, new Set(), new Set(), format, undefined, shardIndex, shardCount) as Iterable<Echo[]>) {
    const normalized = normalizeOptimizerLoadout(loadout);
    const hash = getOptimizerLoadoutHash(normalized);
    if (seen.has(hash)) continue;
    seen.add(hash);
    keys.push(getOptimizerLoadoutKey(normalized));
    ids.push(normalized.map((e: Echo) => e.echoId));
  }
  return { keys, ids };
}

function streamKeys(echoes: Echo[], main: string[], format: OptimizerLoadoutFormat, options: Parameters<typeof optimizerLoadoutStream>[5], shardIndex = 0, shardCount = 1) {
  const keys: string[] = [];
  const ids: string[][] = [];
  for (const loadout of optimizerLoadoutStream(echoes, main, format, shardIndex, shardCount, options)) {
    keys.push(getOptimizerLoadoutKey(loadout));
    ids.push(normalizeOptimizerLoadout(loadout).map((e: Echo) => e.echoId));
  }
  return { keys, ids };
}

// A pool with stat-identical copies scattered through it (one in front of its original, one main echo copy).
const base = [
  echo("Main", 4, "m1", 6.3),
  echo("Main", 4, "m2", 8.1),
  echo("FourA", 4, "f4a", 7.5),
  echo("ThreeA", 3, "t3a", 6.9),
  echo("ThreeB", 3, "t3b", 8.7),
  echo("ThreeC", 3, "t3c", 0, "SetB"),
  echo("OneA", 1, "o1a", 9.3),
  echo("OneB", 1, "o1b", 6.3),
  echo("OneC", 1, "o1c", 0, "SetB"),
  echo("OneD", 1, "o1d", 10.5),
];
const withCopies: Echo[] = [
  { ...base[6], echoId: "o1a-front" },
  ...base.slice(0, 3),
  { ...base[1], echoId: "m2-copy" },
  ...base.slice(3, 7),
  { ...base[3], echoId: "t3a-copy" },
  { ...base[6], echoId: "o1a-copy" },
  ...base.slice(7),
];

describe("prepareOptimizerEchoPool", () => {
  it("keeps the first copy of each signature, in pool order", () => {
    const pool = prepareOptimizerEchoPool(withCopies, ["Main"]);
    expect(pool.unique).toBe(true);
    expect(pool.dropped).toBe(4); // o1a (behind o1a-front), m2-copy, t3a-copy, o1a-copy
    expect(pool.echoes.map((e) => e.echoId)).toEqual([
      "o1a-front", "m1", "m2", "f4a", "t3a", "t3b", "t3c", "o1b", "o1c", "o1d",
    ]);
    // every kept echo is one of the input objects (owned echoes, not synthesised ones)
    for (const e of pool.echoes) expect(withCopies).toContain(e);
  });

  it("falls back to the untouched pool when the shortcut would not be exact", () => {
    // no main echo: slot 0 is the lowest-index echo, which swapping copies can change
    expect(prepareOptimizerEchoPool(withCopies, [])).toEqual({ echoes: withCopies, unique: false, dropped: 0 });
    // two kept echoes sharing an echoId
    const sharedId = [echo("Main", 4, "x"), echo("OneA", 1, "x")];
    expect(prepareOptimizerEchoPool(sharedId, ["Main"]).unique).toBe(false);
    // separators inside a species or a substat would make signatures ambiguous
    expect(prepareOptimizerEchoPool([echo("Ma:in", 4, "a")], ["Ma:in"]).unique).toBe(false);
    expect(prepareOptimizerEchoPool([{ ...echo("Main", 4, "a"), echoSubStatsType2: "A|B" }], ["Main"]).unique).toBe(false);
    expect(prepareOptimizerEchoPool([{ ...echo("Main", 4, "a"), echo: null }], ["Main"]).unique).toBe(false);
  });
});

describe("optimizerLoadoutStream", () => {
  it("default path is upstream's loop (normalise, hash, drop repeats)", () => {
    for (const format of ["Any", "43311", "44111"] as const) {
      expect(streamKeys(withCopies, ["Main"], format, {})).toEqual(upstreamKeys(withCopies, ["Main"], format));
      expect(streamKeys(withCopies, [], format, {})).toEqual(upstreamKeys(withCopies, [], format));
    }
  });

  it("the deduped pool yields upstream's loadouts, echo ids and order without hashing", () => {
    const pool = prepareOptimizerEchoPool(withCopies, ["Main"]);
    for (const format of ["Any", "43311", "44111"] as const) {
      const expected = upstreamKeys(withCopies, ["Main"], format);
      expect(expected.keys.length).toBeGreaterThan(0);
      expect(streamKeys(pool.echoes, ["Main"], format, { uniquePool: true })).toEqual(expected);
    }
  });

  it("two main species and sharding: shards stay disjoint and their union is upstream's set", () => {
    const echoes = [...withCopies, echo("MainB", 3, "mb1", 7.0), { ...echo("MainB", 3, "mb1-copy", 7.0) }];
    const main = ["Main", "MainB"];
    const pool = prepareOptimizerEchoPool(echoes, main);
    const expected = upstreamKeys(echoes, main, "Any").keys.slice().sort();
    const union: string[] = [];
    for (let i = 0; i < 3; i++) union.push(...streamKeys(pool.echoes, main, "Any", { uniquePool: true }, i, 3).keys);
    expect(new Set(union).size).toBe(union.length);
    expect(union.slice().sort()).toEqual(expected);
  });

  it("skips exactly the partial loadouts that still have topN extensions", () => {
    const pool = prepareOptimizerEchoPool(base, ["Main"]);
    const costs = pool.echoes.map((e) => Number(e.type));
    const all = upstreamKeys(base, ["Main"], "Any");
    const kept = streamKeys(pool.echoes, ["Main"], "Any", { uniquePool: true, skipDominatedPartials: 3 });
    const keptSet = new Set(kept.keys);
    let skipped = 0;
    for (const loadout of generateLoadouts(pool.echoes, ["Main"], 0, [], 0, new Set(), new Set(), "Any") as Iterable<Echo[]>) {
      const key = getOptimizerLoadoutKey(loadout);
      const expectSkip = loadout.length < 5 && hasLoadoutExtensions(loadout, pool.echoes, costs, 3);
      expect(keptSet.has(key)).toBe(!expectSkip);
      if (expectSkip) skipped += 1;
    }
    expect(skipped).toBeGreaterThan(0);
    expect(kept.keys.length + skipped).toBe(all.keys.length);
    // only "Any" skips: fixed formats only ever yield full loadouts anyway
    expect(streamKeys(pool.echoes, ["Main"], "43311", { uniquePool: true, skipDominatedPartials: 3 })).toEqual(upstreamKeys(base, ["Main"], "43311"));
    // and never without a deduped pool
    expect(streamKeys(base, ["Main"], "Any", { skipDominatedPartials: 3 })).toEqual(all);
  });
});

describe("hasLoadoutExtensions", () => {
  const pool = base;
  const costs = pool.map((e) => Number(e.type));
  it("counts echoes that fit the cost cap with a new species and a new id", () => {
    // Main(4) + FourA(4) + ThreeA(3) = 11: only the four 1-cost echoes fit
    const loadout = [base[0], base[2], base[3]];
    expect(hasLoadoutExtensions(loadout, pool, costs, 4)).toBe(true);
    expect(hasLoadoutExtensions(loadout, pool, costs, 5)).toBe(false);
    // the other Main copy is the same species: never an extension
    expect(hasLoadoutExtensions([base[0]], [base[1]], [4], 1)).toBe(false);
    // a full or capped loadout has none
    expect(hasLoadoutExtensions([base[0], base[2], base[6], base[7], base[9]], pool, costs, 1)).toBe(false);
    expect(hasLoadoutExtensions([base[0], base[2], base[3], base[6]], [{ ...echo("Zero", 0, "z"), type: null }], [0], 1)).toBe(false);
  });
});

describe("normalizeOptimizerLoadoutCached", () => {
  it("orders slots 1-4 exactly like upstream's normalizeOptimizerLoadout", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const species = ["Aix", "aix", "Bell", "bell", "Crownless", "Échelon", "Zig", "Main", "Main2"];
    const echoes = Array.from({ length: 60 }, (_, i) => ({
      ...echo(species[i % species.length], 1 + (i % 4), `e${i}`, Math.round(rand() * 100) / 10, i % 2 ? "SetA" : "SetB"),
      echoSubStatsType2: rand() > 0.5 ? "CritDMG" : "ATK",
      echoSubStatsValue2: Math.round(rand() * 200) / 10,
    }));
    for (let n = 0; n < 2000; n++) {
      const size = 1 + Math.floor(rand() * 5);
      const loadout = Array.from({ length: size }, () => echoes[Math.floor(rand() * echoes.length)]);
      expect(normalizeOptimizerLoadoutCached(loadout).map((e) => e.echoId)).toEqual(
        normalizeOptimizerLoadout(loadout).map((e: Echo) => e.echoId),
      );
    }
  });
});

describe("canSkipDominatedPartials / planOptimizerGeneration", () => {
  const input = (over: Partial<OptimizerGenerationInput> = {}): OptimizerGenerationInput => ({
    echoes: base,
    mainEchoKeys: ["Main"],
    loadoutFormat: "Any",
    topN: 5,
    target: "Rotation:abc",
    echoSetPassiveBuffs: { "Set A 2 Set": { ATK: 10 } },
    context: { customBuffs: { ATK: 5, CritRate: "2" }, enemyResist: 0.1 },
    rotationData: { plainAttacks: [{ buffs: { DMGDeepen: 0.2 } }], overrideActions: [] },
    ...over,
  });

  it("turns the skip on only when every precondition holds", () => {
    expect(planOptimizerGeneration(input())).toMatchObject({ uniquePool: true, skipDominatedPartials: 5 });
    expect(canSkipDominatedPartials(input(), true)).toBe(true);
    expect(canSkipDominatedPartials(input(), false)).toBe(false);
    for (const target of ["Stat:totalAtk", "Attack:liberationAttacks|X"]) expect(canSkipDominatedPartials(input({ target }), true)).toBe(true);
    expect(canSkipDominatedPartials(input({ target: "ATK" }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ loadoutFormat: "43311" }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ mainEchoKeys: [] }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ topN: 0 }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ context: { customBuffs: { CritDMG: -150 }, enemyResist: 0.1 } }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ context: { customBuffs: { CritDMG: "-1" }, enemyResist: 0.1 } }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ context: { customBuffs: {}, enemyResist: 1.2 } }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ echoSetPassiveBuffs: { X: { ATK: -1 } } }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ rotationData: { plainAttacks: [{ buffs: { ATK: -47 } }], overrideActions: [] } }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ rotationData: { plainAttacks: [], overrideActions: [{ attack: { buffs: { CritDMG: -2 } } }] } }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ rotationData: { plainAttacks: [{ buffs: null, count: -1 }], overrideActions: [] } }), true)).toBe(false);
    expect(canSkipDominatedPartials(input({ rotationData: { plainAttacks: [{ buffs: null, count: 3 }], overrideActions: [{ attack: { count: "2" } }] } }), true)).toBe(true);
    expect(canSkipDominatedPartials(input({ echoes: [{ ...base[0], echoSubStatsValue1: -3 }] }), true)).toBe(false);
  });

  it("without a main echo nothing changes", () => {
    expect(planOptimizerGeneration(input({ mainEchoKeys: [] }))).toEqual({
      echoes: base,
      uniquePool: false,
      skipDominatedPartials: 0,
      droppedDuplicates: 0,
    });
  });
});

// The skip relies on every score being monotone non-decreasing in added echoes. The engine-side arguments are in
// src/sim/README.md; these pin the game-data preconditions, so new data that breaks them fails here first.
describe("monotonicity preconditions in game data", () => {
  const characterModules = import.meta.glob("../../characters/*/index.ts", { eager: true }) as Record<string, any>;

  function modifiersOf(entries: any[] | undefined): any[] {
    return (entries ?? []).flatMap((entry: any) => entry?.modifiers ?? []);
  }
  function values(value: unknown): number[] {
    if (value !== null && typeof value === "object") return Object.values(value).map(Number);
    return [Number(value)];
  }

  it("AdditionalBase and CritOverflow conversions never shrink as a stat grows", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const [path, mod] of Object.entries(characterModules)) {
      const data = mod?.getData?.();
      if (!data) continue;
      for (const m of [...modifiersOf(data.buffs), ...modifiersOf(data.resonanceChains)]) {
        if (typeof m?.modifier !== "string") continue;
        if (m.modifier.includes("AdditionalBase")) {
          checked++;
          if (!(Number(m.modifierStep) > 0) || values(m.modifierValue).some((v) => !(v >= 0))) offenders.push(`${path} ${m.modifier}`);
        }
        if (m.modifier === "CritOverflow") {
          checked++;
          if (!(Number(m.overflowStep) > 0) || !(Number(m.modifierValue) >= 0)) offenders.push(`${path} CritOverflow`);
        }
      }
    }
    for (const [label, bonus] of Object.entries(setBonusEffectsTwo)) {
      for (const m of modifiersOf((bonus as any).passives)) {
        if (typeof m?.modifier === "string" && m.modifier.includes("AdditionalBase")) {
          checked++;
          if (!(Number(m.modifierStep) > 0) || values(m.modifierValue).some((v) => !(v >= 0))) offenders.push(label);
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });

  it("set bonuses only add stats", () => {
    const offenders: string[] = [];
    for (const table of [setBonusEffectsOnePiece, setBonusEffectsOne, setBonusEffectsTwo]) {
      for (const [label, bonus] of Object.entries(table)) {
        for (const m of modifiersOf((bonus as any).passives)) {
          if (values(m?.modifierValue).some((v) => Number.isFinite(v) && v < 0)) offenders.push(label);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("adding an echo never removes an active set bonus (getSetBonusEffects)", () => {
    const setKeys = [...Object.keys(echoSetLabelMap), null] as (string | null)[];
    const labels = (sets: (string | null)[]) => {
      const r = getSetBonusEffects(sets);
      return [r.setBonusOnePiece, r.setBonusOne, r.setBonusTwo].filter(Boolean) as string[];
    };
    let seed = 11;
    const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    // every pair of sets (in both alphabetical orders) at every split of four echoes, plus random multisets of all sets
    const cases: (string | null)[][] = [];
    for (const a of setKeys) for (const b of setKeys) for (let k = 0; k <= 4; k++) cases.push([...Array(k).fill(a), ...Array(4 - k).fill(b)]);
    for (let n = 0; n < 4000; n++) {
      const size = Math.floor(rand() * 5);
      cases.push(Array.from({ length: size }, () => setKeys[Math.floor(rand() * setKeys.length)]));
    }
    for (const sets of cases) {
      for (let cut = 0; cut <= sets.length; cut++) {
        const before = labels(sets.slice(0, cut));
        for (const added of setKeys) {
          const after = labels([...sets.slice(0, cut), added]);
          for (const label of before) {
            if (!after.includes(label)) throw new Error(`${JSON.stringify(sets.slice(0, cut))} + ${added} lost ${label}`);
          }
        }
      }
    }
  });
});
