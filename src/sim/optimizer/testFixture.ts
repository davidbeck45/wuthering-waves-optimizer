// Wuthering Tools+ — the optimizer speed tests' account (test helper; no personal data): the Echo Lab fixture
// (Cartethyia, Galbrena, Zani and their echoes, from the my-rankings fixture and upstream's Cypress golden data) plus
// three synthetic records — Danjin (a 4-star, with a 4-star sword), Havoc Rover and Verina (a healer) — and seeded
// synthetic echoes of real species and sets for the pools they need.
import fixture from "../echoLab/__fixtures__/echoLabAccount.json";
import { getCharByName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { getWeaponsByType } from "../../weapons/weapons";
import { seeded, syntheticEchoes, type BenchSource } from "./optimizerBench";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAIN_STATS: Record<number, string[]> = { 4: ["CritRate", "CritDMG", "ATK", "HP", "HealingBonus"], 3: ["ATK", "HP", "EnergyRegen", "Havoc", "Spectro"], 1: ["ATK", "HP", "DEF"] };

/** Real species per cost (no Phantom skins), sorted, from the app's echo data. */
export function speciesByCost(): Record<number, string[]> {
  const out: Record<number, string[]> = { 4: [], 3: [], 1: [] };
  for (const [key, value] of Object.entries(mainEchoesData as Record<string, { class?: string }>)) {
    const cls = value?.class;
    const cost = cls === "Calamity" || cls === "Overlord" ? 4 : cls === "Elite" ? 3 : cls === "Common" ? 1 : 0;
    if (cost && !key.startsWith("Phantom")) out[cost]!.push(key);
  }
  for (const list of Object.values(out)) list.sort();
  return out;
}

/** `n` synthetic echoes: two copies of the main species, then a seeded spread of species per cost (the main one among them). */
export function syntheticPool(seed: number, n: number, mainEcho: string, sets: string[]): any[] {
  const species = speciesByCost();
  const pick = (cost: number, count: number, offset: number): Array<{ echo: string; type: number }> =>
    species[cost]!.slice(offset, offset + count).filter((k) => k !== mainEcho).map((echo) => ({ echo, type: cost }));
  const list = [
    ...Array.from({ length: 4 }, () => ({ echo: mainEcho, type: 4 })),
    ...pick(4, 6, seed % 7),
    ...pick(3, 9, seed % 11),
    ...pick(1, 12, seed % 13),
  ];
  // two copies of the main echo up front (a seeded draw could leave a small pool with none), then the spread
  const mains = syntheticEchoes(seed + 1000, Math.min(2, n), [{ echo: mainEcho, type: 4 }], sets, MAIN_STATS, `s${seed}m`);
  return [...mains, ...syntheticEchoes(seed, Math.max(0, n - mains.length), list, sets, MAIN_STATS, `s${seed}x`)];
}

export function testSource(): BenchSource {
  const characters: Record<string, any> = JSON.parse(JSON.stringify((fixture as any).characters));
  const blank = { echoes: { 0: {}, 1: {}, 2: {}, 3: {}, 4: {} }, mainEcho: { echo: null, rank: 5 } };
  characters.Danjin = { ...blank, weapon: "CommandoOfConviction" };
  characters.RoverHavocFemale = { ...blank, weapon: "Lumingloss" };
  characters.Verina = { ...blank, weapon: "Variation" };
  const echoes: any[] = JSON.parse(JSON.stringify((fixture as any).echoes));
  return { characters, echoes };
}

/** A character with every buff and chain on at full stacks, so what scales on a stat is live (no worn echoes: the run's
 *  `context.charBuffsData` then holds base stats, which is what a loadout must not be scored at). */
export async function statScaledKit(characterId: string, setPassives: string[] = [], options: { chains?: boolean } = {}): Promise<{ data: any; actions: any[] }> {
  const character: any = await getCharByName(characterId);
  const on = (defs: any[] = []): Record<string, any> => Object.fromEntries(defs.map((d) => [d.key, { isEnabled: true, stacks: d.hasStacks ? d.maxStacks : 0 }]));
  const weaponKey = character.basic?.signatureWeapon ?? (getWeaponsByType(character.basic?.weapon) as any).five?.[0]?.key;
  const groups: Record<string, string> = { basicAttacks: "basic", skillAttacks: "skill", forteCircuitAttacks: "forteCircuit", liberationAttacks: "liberation", introAttacks: "intro", outroAttacks: "outro" };
  const actions: any[] = [];
  for (const [group, type] of Object.entries(groups)) {
    for (const attack of character[group]?.attacks ?? []) actions.push({ id: `a${actions.length}`, slot: 0, order: actions.length + 1, key: attack.key, type, count: 1, buffs: [] });
  }
  const data = {
    weapon: weaponKey,
    weapons: { [weaponKey]: { refinement: "1" } },
    echoes: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, { echoId: null }])),
    mainEcho: { echo: null, rank: 5, buffs: {} },
    buffs: on(character.buffs),
    resonanceChains: options.chains === false ? {} : on(character.resonanceChains),
    echoSetPassives: Object.fromEntries(setPassives.map((key) => [key, { isEnabled: true }])),
    optimizer: { echoSetPassives: {} },
  };
  return { data, actions };
}

/** A small pool that walks the stats kits scale on across their thresholds and caps: two main echoes, then seeded
 *  cost 4 / 3 / 1 echoes of real species whose Energy Regen, Crit Rate and HP spread wide (no personal data). */
export function scalingPool(seed: number, mainEcho: string, sets: string[], counts: { main?: number; four?: number; three?: number; one?: number; critRate?: number; energyRegen?: number } = {}): any[] {
  const rnd = seeded(seed);
  const species = speciesByCost();
  const value = (lo: number, hi: number): number => Math.round((lo + rnd() * (hi - lo)) * 10) / 10;
  const make = (echo: string, type: number, stat: string, id: string): any => ({
    echo,
    type,
    rank: 5,
    stat,
    echoId: id,
    echoSet: sets[Math.floor(rnd() * sets.length)]!,
    echoSubStatsType1: "EnergyRegen",
    echoSubStatsValue1: value(0, counts.energyRegen ?? 30),
    echoSubStatsType2: "CritRate",
    echoSubStatsValue2: value(0, counts.critRate ?? 16),
    echoSubStatsType3: "CritDMG",
    echoSubStatsValue3: value(0, 24),
    echoSubStatsType4: "HP",
    echoSubStatsValue4: value(0, 30),
    echoSubStatsType5: "ATK",
    echoSubStatsValue5: value(0, 14),
  });
  const of = (cost: number, n: number, stats: string[]): any[] =>
    species[cost]!.filter((k) => k !== mainEcho).slice(seed % 5, (seed % 5) + n).map((echo, i) => make(echo, cost, stats[i % stats.length]!, `scale${seed}-${cost}-${i}`));
  return [
    ...Array.from({ length: counts.main ?? 2 }, (_, i) => make(mainEcho, 4, i % 2 && counts.critRate === undefined ? "CritRate" : "CritDMG", `scale${seed}-main-${i}`)),
    ...of(4, counts.four ?? 2, counts.critRate === undefined ? ["CritRate", "HP"] : ["HP"]),
    ...of(3, counts.three ?? 4, ["EnergyRegen", "ATK", "HP"]),
    ...of(1, counts.one ?? 5, ["HP", "ATK"]),
  ];
}
