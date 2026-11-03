// Wuthering Tools+ — the optimizer speed tests' account (test helper; no personal data): the Echo Lab fixture
// (Cartethyia, Galbrena, Zani and their echoes, from the my-rankings fixture and upstream's Cypress golden data) plus
// three synthetic records — Danjin (a 4-star, with a 4-star sword), Havoc Rover and Verina (a healer) — and seeded
// synthetic echoes of real species and sets for the pools they need.
import fixture from "../echoLab/__fixtures__/echoLabAccount.json";
import { mainEchoesData } from "../../echoes/index";
import { syntheticEchoes, type BenchSource } from "./optimizerBench";

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
