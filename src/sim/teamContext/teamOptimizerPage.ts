// Wuthering Tools+ — Ryan's Optimize team (ADR 0052) reading what the Team page reads.
//
// Upstream's team page is each character's stored Team Buffs panel. Here it is `resolveTeamCharacters`: builds by name,
// team buffs from the real members. Everything else on plus goes through it (src/sim/README.md, "Ryan's Optimize team
// on plus"), and his composable did not, so this is the one seam between the two.
import { resolveTeamCharacters, type TeamResolution } from "./resolveTeam";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TeamPageRead {
  /** the records the Team page reads today */
  characters: Record<string, any>;
  /** members whose Team Buffs panel was derived from the real team (auto team buffs), not set by the player. His buff
   *  plans (#689) must not save such a panel into a build: a saved panel names the team, so the resolver would keep it
   *  as the player's own and it would stop following the builds. */
  derived: string[];
  /** the records it would read with these builds worn (records from `characters`, with the new echoes on them) */
  withBuilds: (records: Record<string, any>) => Promise<Record<string, any>>;
}

export async function readTeamPage(team: any, stored: Record<string, any>, inventoryEchoes: any[], options: { auto: boolean; enemyConfig: any }): Promise<TeamPageRead> {
  const resolution: TeamResolution = await resolveTeamCharacters(team, stored, inventoryEchoes, options);
  const derived = resolution.slots.filter((slot) => slot.buffSource === "derived").map((slot) => slot.characterId);
  return {
    characters: resolution.characters,
    derived,
    withBuilds: async (records) => {
      // A derived panel names the team, and the resolver keeps a panel that does as the player's own. A panel the
      // player did set stays as it is, as on the Team page.
      const unread = { ...records };
      for (const id of derived) unread[id] = { ...records[id], teamBuffs: { ...records[id]?.teamBuffs, selectedCharacter1: null, selectedCharacter2: null } };
      return (await resolveTeamCharacters(team, unread, inventoryEchoes, options)).characters;
    },
  };
}

const ROUNDING = 0.05;

/**
 * `deriveTeamBuffGuards` reads what a teammate's buff assumes of its provider. Upstream that is a typed number. Here it
 * is `resolveTeam.ts`'s `statFor`: the provider's real stat held to one decimal, so a build can sit up to 0.05 points
 * under the figure taken from that very build (124.96 % reads 125.0 %). Taken as written, that floor rules the provider's
 * own build out of its search and warns about a gap that isn't there.
 */
export function allowStatRounding<G extends { floors: any[]; drifts: any[] } | null>(guards: G[]): G[] {
  return guards.map((guard) =>
    guard
      ? {
          ...guard,
          floors: guard.floors.map((floor) => ({ ...floor, minValue: floor.minValue - ROUNDING })),
          drifts: guard.drifts.filter((drift) => drift.expected - drift.actual > ROUNDING),
        }
      : guard,
  );
}
