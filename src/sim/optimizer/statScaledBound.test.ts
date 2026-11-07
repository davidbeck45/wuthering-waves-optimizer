// Wuthering Tools+ — the bound skip where a buff scales on the loadout's own stats (sync of Ryan's #687, 2026-11-06).
//
// `loadoutBound.test.ts` proves admissibility on kits with nothing stat-scaled (Galbrena, Rover, Verina, Danjin). These
// are the kits that do scale: Mornye's Energy Regen → DMG Bonus and per-talent crit, Jingran's HP → ATK and Fusion,
// Brant's, Sigrika's and Shorekeeper's Energy Regen, Roccia's and Qiuyuan's Crit Rate, Augusta's chains, and a set
// whose 5-piece reads Energy Regen. The score is upstream's own (`computeLoadoutFinalStats` + `scoreOptimizerRotation`),
// every generated loadout, nothing skipped: loadout by loadout, no bound above it may undercut it.
import { describe, expect, it } from "vitest";
import { buildTeamOptimizerSlotPlan } from "../../calculator/teamOptimizer";
import { computeLoadoutFinalStats, normalizeOptimizerLoadout, scoreOptimizerRotation, type OptimizerContext, type OptimizerLoadoutFormat } from "../../calculator/optimizer";
import { meetsMinStatThreshold } from "../../calculator/meetsMinStatThreshold";
import { computeResonanceChainsBuffs, computeSelfBuffs } from "../../calculator/stats";
import { setBonusEffectsOne, setBonusEffectsOnePiece, setBonusEffectsTwo } from "../../echoes/sets";
import { getCombinedEchoStats } from "../../echoes/stats";
import { createLoadoutPruner, virtualLoadoutStats, type PrunerScoring } from "./loadoutBound";
import { optimizerLoadoutStream, planOptimizerGeneration, pruneSetupOf } from "./optimizerPool";
import { scalingPool, statScaledKit } from "./testFixture";

/* eslint-disable @typescript-eslint/no-explicit-any */

const enemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };
const MAIN = "FallacyOfNoReturn";

interface Kit {
  name: string;
  characterId: string;
  sets: string[];
  format?: OptimizerLoadoutFormat;
  floors?: Array<{ stat: string; minValue: number }>;
  setPassives?: string[];
  target?: string;
  /** a kit that sits past its cap on the usual pool: no chains, less crit (so the buff crosses its threshold and cap) */
  lowCrit?: boolean;
}

const KITS: Kit[] = [
  { name: "Mornye · ER to DMG Bonus and per-talent crit", characterId: "Mornye", sets: ["RejuvenatingGlow", "MoonlitClouds"] },
  { name: "Mornye · 43311 · ER floor", characterId: "Mornye", sets: ["RejuvenatingGlow"], format: "43311", floors: [{ stat: "energyRegen", minValue: 130 }] },
  { name: "Jingran · HP to ATK, Fusion and Healing", characterId: "Jingran", sets: ["MoltenRift", "RejuvenatingGlow"] },
  { name: "Brant · ER over 150 % to ATK", characterId: "Brant", sets: ["MoltenRift", "MoonlitClouds"] },
  { name: "Sigrika · ER over 125 % to Echo DMG", characterId: "Sigrika", sets: ["SierraGale", "MoonlitClouds"] },
  { name: "Shorekeeper · ER to crit", characterId: "Shorekeeper", sets: ["RejuvenatingGlow", "MoonlitClouds"] },
  { name: "Roccia · Crit Rate over 50 % to ATK", characterId: "Roccia", sets: ["HavocEclipse", "MoonlitClouds"] },
  { name: "Qiuyuan · Crit Rate over 50 % to Crit DMG", characterId: "Qiuyuan", sets: ["SierraGale", "MoonlitClouds"], lowCrit: true },
  { name: "Augusta · chains on Crit Rate", characterId: "Augusta", sets: ["VoidThunder", "MoonlitClouds"] },
  { name: "Mornye · Stat:totalAtk", characterId: "Mornye", sets: ["RejuvenatingGlow", "MoonlitClouds"], target: "Stat:totalAtk" },
  // a set's own AdditionalBase: a label that reads Energy Regen, only on five pieces
  { name: "Galbrena · five of a set whose passive reads ER", characterId: "Galbrena", sets: ["SongofFeatheredTrace"], setPassives: ["SongofFeatheredTrace5SetChongming"] },
];

// one seed on CI (seconds); STAT_SCALED_SEEDS="1,2,3,…" and STAT_SCALED_POOL=big widen it by hand
const SEEDS = (process.env.STAT_SCALED_SEEDS ?? "7").split(",").map(Number);
const BIG = process.env.STAT_SCALED_POOL === "big" ? { main: 3, four: 3, three: 6, one: 8 } : {};

async function prepare(kit: Kit, seed = SEEDS[0]!) {
  const { data, actions } = await statScaledKit(kit.characterId, kit.setPassives, { chains: !kit.lowCrit });
  const team: any = { name: "Bound", characterIds: [kit.characterId, null, null], buildIds: [null, null, null], actions, duration: null };
  const pool = scalingPool(seed, MAIN, kit.sets, { ...BIG, ...(kit.lowCrit ? { critRate: 7 } : {}) });
  const plan = await buildTeamOptimizerSlotPlan({ team, slot: 0, characterId: kit.characterId, characterData: data, enemyConfig, inventoryEchoes: pool, mainEchoKeys: [MAIN] });
  const context = JSON.parse(JSON.stringify(plan.context)) as OptimizerContext;
  const selfBuffsData = computeSelfBuffs(context.activeCharacterBuffs ?? {}, context.chosenChar?.buffs ?? [], context.activeCharacterResonanceChains ?? {}, context.talentData ?? {}, context.character ?? null, context.activeStance ?? null, { havocBaneStacks: context.havocBaneStacks ?? 0 });
  const resonanceChainsBuffsData = computeResonanceChainsBuffs(context.activeCharacterResonanceChains ?? {}, context.chosenChar?.resonanceChains ?? [], context.talentData ?? {}, context.activeStance ?? null);
  const target = kit.target ?? plan.target;
  const scoring: PrunerScoring & { context: OptimizerContext } = { context, selfBuffsData, resonanceChainsBuffsData, echoSetPassiveBuffs: plan.echoBuffs.echoSetPassiveBuffs, mainEchoStats: plan.echoBuffs.mainEchoStats, target, damageType: "Average", rotationData: plan.rotationData, minStats: kit.floors ?? [] };
  const format = kit.format ?? "Any";
  const generation = planOptimizerGeneration({ echoes: pool, mainEchoKeys: [MAIN], loadoutFormat: format, topN: 5, target, echoSetPassiveBuffs: scoring.echoSetPassiveBuffs, mainEchoStats: scoring.mainEchoStats, context, rotationData: plan.rotationData });
  return { scoring, generation, format, pool };
}

/** The score nothing skips: upstream's stats and upstream's scorer on one loadout. */
function trueScore(scoring: PrunerScoring & { context: OptimizerContext }, raw: any[]) {
  const loadout = normalizeOptimizerLoadout(raw);
  const stats = computeLoadoutFinalStats(loadout, scoring.context, scoring.selfBuffsData, scoring.resonanceChainsBuffsData, scoring.echoSetPassiveBuffs, scoring.mainEchoStats);
  const [targetType, targetObject] = scoring.target.split(":");
  if (targetType === "Stat") return { value: Number(stats.finalStats[targetObject!]), stats, loadout };
  const { damageAggregation } = scoreOptimizerRotation(scoring.rotationData!, loadout, stats, scoring.context, new Map());
  return { value: Number(damageAggregation.avgDamage), stats, loadout };
}

describe("the bound stays admissible when a buff scales on the loadout's own stats", () => {
  for (const [kit, seed] of KITS.flatMap((k) => SEEDS.map((s) => [k, s] as const))) {
    it(`${kit.name} (seed ${seed}): every prefix's bound is at or above every score below it`, async () => {
      const { scoring, generation, format } = await prepare(kit, seed);
      expect(generation.uniquePool).toBe(true);
      expect(generation.pruneByBound).toBe(true);
      const pruner = createLoadoutPruner(pruneSetupOf(generation, [MAIN], format), scoring)!;
      expect(pruner).not.toBeNull();
      // every generated loadout, the partial ones too (skipDominatedPartials off)
      const loadouts = [...optimizerLoadoutStream(generation.echoes, [MAIN], format, 0, 1, { uniquePool: true, skipDominatedPartials: 0 })];
      expect(loadouts.length).toBeGreaterThan(40);
      const bounds = new Map<string, { ub: number; feasible: boolean }>();
      const buffPrints = new Set<string>();
      let checks = 0;
      let tight = 0;
      let meetsFloor = 0;
      for (const raw of loadouts) {
        const { value, stats } = trueScore(scoring, raw);
        buffPrints.add(JSON.stringify(stats.loadoutBuffData.selfBuffsData) + JSON.stringify(stats.loadoutBuffData.resonanceChainsBuffsData));
        const meets = (scoring.minStats ?? []).every((m) => meetsMinStatThreshold(stats.finalStats[m.stat], m.minValue, m.stat));
        if (meets) meetsFloor += 1;
        for (let len = 1; len <= Math.min(raw.length, 4); len++) {
          const prefix = raw.slice(0, len);
          const key = prefix.map((e: any) => e.echoId).join(",");
          let b = bounds.get(key);
          if (!b) bounds.set(key, (b = pruner.bound(prefix)!));
          expect(b, key).not.toBeNull();
          if (meets) expect(b.feasible, `${key}: a floor check ruled out a loadout that meets it`).toBe(true);
          if (b.feasible) expect(b.ub, `${key} → ${raw.map((e: any) => e.echoId).join(",")}`).toBeGreaterThanOrEqual(value);
          if (b.ub < value * 1.02) tight += 1;
          checks += 1;
        }
      }
      expect(checks).toBeGreaterThan(100);
      if (scoring.minStats?.length) expect(meetsFloor).toBeGreaterThan(0);
      // not vacuous: the scaling moved from loadout to loadout (a Stat: target reads the same buffs), some bound is near a real score
      expect(buffPrints.size).toBeGreaterThan(3);
      expect(tight).toBeGreaterThan(0);
    }, 120_000);
  }

  it("no set's AdditionalBase writes a per-talent buff: those replace instead of add, and a set comes and goes with its label", () => {
    // `calculateFinalStatsFromBuffs` Object.assigns specificTalentBuffs, so a set's key would overwrite a character's
    // and the bound's virtual loadout, wearing every label, could read less than a real loadout does
    const scaled = Object.values({ ...setBonusEffectsOnePiece, ...setBonusEffectsOne, ...setBonusEffectsTwo } as Record<string, any>)
      .flatMap((set) => set?.passives ?? [])
      .flatMap((passive: any) => passive?.modifiers ?? [])
      .filter((modifier: any) => modifier?.modifier?.includes("AdditionalBase"));
    expect(scaled.length).toBeGreaterThan(0);
    for (const modifier of scaled) expect(modifier.modifySpecificTalents ?? []).toEqual([]);
  });

  it("scoring today's buffs instead of the loadout's own would be wrong on these kits: the test above can tell", async () => {
    const { scoring, generation, format } = await prepare(KITS[0]!);
    const loadouts = [...optimizerLoadoutStream(generation.echoes, [MAIN], format, 0, 1, { uniquePool: true, skipDominatedPartials: 0 })].filter((l) => l.length === 5);
    let differ = 0;
    for (const raw of loadouts.slice(0, 40)) {
      const { value, stats, loadout } = trueScore(scoring, raw);
      const { damageAggregation } = scoreOptimizerRotation(scoring.rotationData!, loadout, { ...stats, loadoutBuffData: undefined as any }, scoring.context, new Map());
      if (Number(damageAggregation.avgDamage) < value) differ += 1;
    }
    expect(differ).toBeGreaterThan(20);
  }, 60_000);

  it("virtualLoadoutStats resolves the same buffs as computeLoadoutFinalStats on a real loadout, bit for bit", async () => {
    const { scoring, generation, format } = await prepare(KITS[0]!);
    const loadouts = [...optimizerLoadoutStream(generation.echoes, [MAIN], format, 0, 1, { uniquePool: true, skipDominatedPartials: 0 })].filter((l) => l.length === 5);
    expect(loadouts.length).toBeGreaterThan(10);
    for (const raw of loadouts.slice(0, 40)) {
      const loadout = normalizeOptimizerLoadout(raw);
      const real = computeLoadoutFinalStats(loadout, scoring.context, scoring.selfBuffsData, scoring.resonanceChainsBuffsData, scoring.echoSetPassiveBuffs, scoring.mainEchoStats);
      const virtual = virtualLoadoutStats(scoring, getCombinedEchoStats(loadout), loadout[0].echo, [real.setBonusOnePiece, real.setBonusOne, real.setBonusTwo]);
      expect(virtual.finalStats).toStrictEqual(real.finalStats);
      expect(virtual.selfBuffsData).toStrictEqual(real.loadoutBuffData.selfBuffsData);
      expect(virtual.resonanceChainsBuffsData).toStrictEqual(real.loadoutBuffData.resonanceChainsBuffsData);
    }
  }, 60_000);
});
