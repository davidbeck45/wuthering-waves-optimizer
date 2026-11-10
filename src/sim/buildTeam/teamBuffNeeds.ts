// Wuthering Tools+ — "Build it for me": the stats a teammate's team buffs rest on.
//
// A team buff can scale on its provider's stat (Suisui's Floral Epistle tiers and Shorekeeper's Stellarealm on Energy
// Regen, a few on Crit Rate; one set's too: Song of Feathered Trace 5pc gives the team ATK by its wearer's Energy Regen). The receiver's Team Buffs panel holds that stat as a number: the player's own when the
// panel names the team (the resolver keeps it as theirs), read off the provider's build when plus derives it. Either way
// the team's damage rests on it, and the search scores each member on their own part of the rotation: Suisui, 1.2 % of
// her team, shed 73 points of Energy Regen for +9.5 % of her own damage while Xuanling's buffs went on reading the
// stored 260 % (hunt round 2, H1: 7.80M printed and saved, 6.61M once the panel said 189.4 %).
//
// Two rules, both from one list of needs:
//   1. the provider's search keeps the stat (`target`, a floor beside the loop's own need: prepareMember);
//   2. no team total counts more of that stat than a build the plan changed gives (`deliveredRecords`), so a floor the
//      echoes can't hold still reads true.
// What a buff needs is Ryan's rule (`teamBuffStatFloor`, the same one behind Optimize team's "team buffs assume 260%
// Energy Regen from this character" line): the panel's value, no higher than where the buff tops out.
import { allEchoBuffs, buffsByCharacter } from "../../buffs/index";
import type { TeamBuffDef } from "../../buffs/teamBuffs";
import { buildCharacterCalculationContext, resolveCharacterEchoes, type TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import { resolveCharactersForBuild } from "../../calculator/buildOverride";
import { teamBuffStatFloor } from "../../calculator/teamOptimizer";
import type { TeamResolution } from "../teamContext/resolveTeam";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The stats a team buff can scale on that a build moves, by the definition's `modifierBasedOn`. */
const FED_STATS: Record<string, { stat: string; label: string }> = {
  "Energy Regen": { stat: "energyRegen", label: "Energy Regen" },
  "Crit Rate": { stat: "totalCritRate", label: "Crit Rate" },
};

export interface TeamBuffNeed {
  /** whose build feeds the buff */
  provider: string;
  /** the stat on the calculator's final stats (a fraction there; every figure here is in %) */
  stat: string;
  label: string;
  /** what the buffs rest on: the panel's value, capped where the buff tops out */
  value: number;
  /** what the provider's build gives today; null when it can't be read */
  today: number | null;
  /** what a new build must keep: `value`, or today's when today's build is already short of it (the plan can't be
   *  asked for more than the team has, and the figures before and after then rest on the same panel) */
  target: number;
  /** whose panels these are: the player's own (kept as stored: it can claim more than a build gives, and says what the
   *  player set it for), or derived from the team (it follows the build by itself). One need per kind */
  own: boolean;
  /** who the buffs reach */
  receivers: Array<{ characterId: string; own: boolean; keys: string[] }>;
}

/** The records a resolution's team runs on, pins applied: the resolver bakes them in, the passthrough (`auto` off)
 *  leaves them to the engine. */
export function bakedRecords(team: { characterIds: Array<string | null>; buildIds?: Array<string | null> }, resolution: TeamResolution): Record<string, any> {
  if (resolution.auto) return resolution.characters;
  let out = resolution.characters;
  team.characterIds.forEach((id, slot) => {
    const pin = team.buildIds?.[slot];
    if (!id || !pin || !out[id]) return;
    out = resolveCharactersForBuild(out, id, pin);
    out = { ...out, [id]: { ...out[id], activeBuildId: pin } };
  });
  return out;
}

const statPct = (finalStats: Record<string, any> | null | undefined, stat: string): number | null => {
  const v = finalStats?.[stat];
  return typeof v === "number" && Number.isFinite(v) ? v * 100 : null;
};

/** A provider's stat (%) on these records, the calculator's own read. */
export async function providerStat(provider: string, stat: string, records: Record<string, any>, echoes: any[], enemy: TeamEnemyConfig): Promise<number | null> {
  try {
    return statPct((await buildCharacterCalculationContext(provider, records, enemy, echoes)).finalStats, stat);
  } catch {
    return null;
  }
}

const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Does this build bring an echo team buff: five pieces of its set, or its main echo. By the buff's picture, the
 *  resolver's own rule (resolveTeam.ts `providedBy`). */
function wearsEchoBuff(def: TeamBuffDef & { imageUrl?: string }, record: Record<string, any>, echoes: any[]): boolean {
  const url = def.imageUrl ?? "";
  const name = (url.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  if (!name) return false;
  if (url.includes("/echoes/sets/")) return resolveCharacterEchoes(record?.echoes ?? {}, echoes).filter((e: any) => e?.echoSet === name).length >= 5;
  const main: string | null = record?.mainEcho?.echo ?? null;
  return !!main && (name === main || compact(name) === compact(main));
}

/** Every stat a member's build feeds into a teammate's enabled team buff, one entry per provider, stat and kind of
 *  panel. `records` are the team's records as it runs today (`bakedRecords`); `kept` names the receivers whose panel is
 *  the player's own. */
export async function teamBuffNeedsOf(records: Record<string, any>, members: readonly string[], kept: ReadonlySet<string>, echoes: any[], enemy: TeamEnemyConfig): Promise<TeamBuffNeed[]> {
  const needs: TeamBuffNeed[] = [];
  const stats = new Map<string, Promise<number | null>>();
  const todayOf = (provider: string, stat: string): Promise<number | null> => {
    const key = `${provider}|${stat}`;
    let hit = stats.get(key);
    if (!hit) stats.set(key, (hit = providerStat(provider, stat, records, echoes, enemy)));
    return hit;
  };
  for (const receiver of members) {
    const panel = records[receiver]?.teamBuffs ?? {};
    const config: Record<string, any> = panel.buffs ?? {};
    const own = kept.has(receiver);
    /** what an enabled, stat-scaled entry of this panel rests on; null for any other buff */
    const restsOn = (def: TeamBuffDef): { stat: string; label: string; floor: number } | null => {
      const fed = def.inputBase && def.modifierBasedOn ? FED_STATS[def.modifierBasedOn] : undefined;
      const entry = config[def.key];
      const entered = Number(entry?.baseAttrValue);
      if (!fed || !entry?.isEnabled || !Number.isFinite(entered)) return null;
      const floor = teamBuffStatFloor(def, entered);
      return floor === null ? null : { ...fed, floor }; // null: under the buff's threshold, nothing rests on it
    };
    const add = (provider: string, key: string, on: { stat: string; label: string; floor: number }): void => {
      let need = needs.find((n) => n.provider === provider && n.stat === on.stat && n.own === own);
      if (!need) needs.push((need = { provider, stat: on.stat, label: on.label, value: on.floor, today: null, target: on.floor, own, receivers: [] }));
      need.value = Math.max(need.value, on.floor);
      let to = need.receivers.find((r) => r.characterId === receiver);
      if (!to) need.receivers.push((to = { characterId: receiver, own, keys: [] }));
      to.keys.push(key);
    };
    const named = members.filter((p) => p !== receiver && !!records[p] && (panel.selectedCharacter1 === p || panel.selectedCharacter2 === p));
    for (const provider of named) {
      for (const def of ((buffsByCharacter as Record<string, TeamBuffDef[]>)[provider] ?? []) as TeamBuffDef[]) {
        const on = restsOn(def);
        if (on) add(provider, def.key, on);
      }
    }
    // a set's or a main echo's buff comes from whoever wears it. The entry holds one figure, so with two wearers it
    // rests on the one with more of the stat
    for (const def of allEchoBuffs as unknown as TeamBuffDef[]) {
      const on = restsOn(def);
      if (!on) continue;
      let best: { provider: string; has: number } | null = null;
      for (const provider of named) {
        if (!wearsEchoBuff(def, records[provider], echoes)) continue;
        const has = (await todayOf(provider, on.stat)) ?? -1;
        if (!best || has > best.has) best = { provider, has };
      }
      if (best) add(best.provider, def.key, on);
    }
  }
  for (const need of needs) {
    need.today = await todayOf(need.provider, need.stat);
    // a build already short of the panel is held where it is, a tenth down so its own echoes always pass
    need.target = need.today == null || need.value <= need.today + 1e-6 ? need.value : Math.floor(need.today * 10 + 1e-6) / 10;
  }
  return needs;
}

/** The needs of a resolved team as it runs today. */
export function teamBuffNeedsFor(team: { characterIds: Array<string | null>; buildIds?: Array<string | null> }, resolution: TeamResolution, echoes: any[], enemy: TeamEnemyConfig): Promise<TeamBuffNeed[]> {
  const records = bakedRecords(team, resolution);
  const members = team.characterIds.filter((id): id is string => !!id && !!records[id]);
  // the passthrough reads every panel as stored, so each is the player's own
  const kept = new Set(resolution.auto ? resolution.slots.filter((s) => s.buffSource === "panel").map((s) => s.characterId) : members);
  return teamBuffNeedsOf(records, members, kept, echoes, enemy);
}

/** A stat a build no longer gives its teammates' buffs: what they count instead. */
export interface ShortDelivery {
  provider: string;
  stat: string;
  label: string;
  /** what the panel rests on, and what the build gives (%) */
  target: number;
  has: number;
  receivers: string[];
}

/** `records` with no own panel counting more of a provider's stat than their build gives, for the providers the plan
 *  changed (`changed`). The same object back when every need is delivered, so the caller can tell. A panel already ahead
 *  of today's build stays as it is on Teams: `target` is today's then, and only a build under that moves it. */
export async function deliveredRecords(records: Record<string, any>, needs: readonly TeamBuffNeed[], changed: ReadonlySet<string>, echoes: any[], enemy: TeamEnemyConfig): Promise<{ records: Record<string, any>; short: ShortDelivery[] }> {
  let out = records;
  const short: ShortDelivery[] = [];
  for (const need of needs) {
    const own = need.own ? need.receivers : [];
    if (!changed.has(need.provider) || !own.length) continue;
    const has = await providerStat(need.provider, need.stat, records, echoes, enemy);
    if (has == null || has + 1e-6 >= need.target) continue;
    const shown = Math.round(has * 10) / 10; // one decimal, as the resolver feeds a derived buff
    short.push({ provider: need.provider, stat: need.stat, label: need.label, target: need.target, has: shown, receivers: own.map((r) => r.characterId) });
    for (const r of own) {
      const record = out[r.characterId];
      const buffs: Record<string, any> = { ...(record?.teamBuffs?.buffs ?? {}) };
      for (const key of r.keys) if (buffs[key]?.isEnabled && Number(buffs[key].baseAttrValue) > shown) buffs[key] = { ...buffs[key], baseAttrValue: shown };
      out = { ...out, [r.characterId]: { ...record, teamBuffs: { ...record.teamBuffs, buffs } } };
    }
  }
  return { records: out, short };
}
