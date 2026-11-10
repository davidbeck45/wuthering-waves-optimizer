// Wuthering Tools+ — what Optimize team's Save has to save.
//
// His Save adds a build for every pick that has a loadout and makes it active. On a result that is the builds of
// today ("+0.00% vs current", every stat +0.0 %) that wrote copies: Aemeath went from 3 builds to 4 and Lynae from 2
// to 3, each further Save stacked another with the same name, and nothing undoes it. Every other save on plus says
// "Nothing to save". A pick is the build of today when it wears the same echoes with the same main echo, changes no
// Team Buffs panel, and the Team page reads the same figure with its echo settings applied.
import { applyLoadoutToCharacterData } from "../../calculator/teamOptimizer";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Key order aside, with nothing-valued keys dropped and a missing stack count read as 0. */
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value ?? null;
  const out: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) {
    const item = canonical(value[key]);
    if (item === null || (key === "stacks" && item === 0)) continue;
    out[key] = item;
  }
  return out;
}
export const sameSettings = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** The same echoes, main echo first: the other four may sit in any slot. */
export function wearsSameEchoes(loadout: any[], wornIds: string[]): boolean {
  const ids = loadout.map((echo) => echo?.echoId).filter(Boolean);
  if (ids.length !== wornIds.length || ids[0] !== wornIds[0]) return false;
  const worn = new Set(wornIds);
  return ids.every((id) => worn.has(id));
}

export interface SaveCheckInput {
  picks: Array<{ slot: number; characterId: string; loadout: any[] | null }>;
  teamBuffsBySlot: Record<number, unknown>;
  echoBuffsBySlot: Array<any>;
  /** the record the team reads for a slot today (its pinned build) */
  record: (slot: number) => Record<string, any>;
  /** the echo ids that record wears, main echo first */
  wornIds: (slot: number) => string[];
  /** the team's records as the page reads them today, pins resolved */
  flat: Record<string, any>;
  /** the Team page's figure for a set of records */
  total: (records: Record<string, any>) => Promise<number>;
}

/** The slots whose pick, saved, would be a copy of the build the member has today. */
export async function slotsAlreadyWorn(input: SaveCheckInput): Promise<number[]> {
  const slots: number[] = [];
  let today: number | null = null;
  for (const pick of input.picks) {
    const record = input.record(pick.slot);
    const panel = input.teamBuffsBySlot[pick.slot];
    if (panel && !sameSettings(panel, record?.teamBuffs)) continue;
    if (!pick.loadout) {
      slots.push(pick.slot);
      continue;
    }
    if (!wearsSameEchoes(pick.loadout, input.wornIds(pick.slot))) continue;
    const echoBuffs = input.echoBuffsBySlot[pick.slot];
    if (!echoBuffs) {
      slots.push(pick.slot);
      continue;
    }
    const applied = applyLoadoutToCharacterData(record, pick.loadout, echoBuffs);
    const sameRecord = sameSettings(applied.echoSetBonus, record?.echoSetBonus) && sameSettings(applied.echoSetPassives, record?.echoSetPassives) && sameSettings(applied.mainEcho, record?.mainEcho);
    if (!sameRecord) {
      // the settings are written differently: it is today's build only if the page reads the same with them
      today ??= await input.total(input.flat);
      const withPick = await input.total({ ...input.flat, [pick.characterId]: { ...applied, echoes: record?.echoes } });
      if (!(today > 0) || Math.abs(withPick / today - 1) > 1e-9) continue;
    }
    slots.push(pick.slot);
  }
  return slots;
}

export const NOTHING_TO_SAVE = "Nothing to save: these are the builds this team already wears.";
