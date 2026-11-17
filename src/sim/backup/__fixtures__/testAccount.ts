// Wuthering Tools+ automatic backups — a small synthetic account for the tests: two characters (one set up, with two
// saved builds), three echoes, one team, and a pull history of one player. No real player's data.
import { encodeConveneHistory, type ConveneHistory, type ConveneRecord } from "../../convene/gachaImport";
import type { Capture } from "../backupFile";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const TEST_PLAYER = "800000001";

export const pull = (time: string, name: string, qualityLevel = 3, resourceId = 21010013): ConveneRecord => ({ time, resourceId, qualityLevel, name });

export function pullsRaw(records: ConveneRecord[], playerId = TEST_PLAYER): string {
  const history: ConveneHistory = { version: 1, activePlayerId: playerId, players: { [playerId]: { playerId, region: "global", pools: { "1": records }, updatedAt: 1, imports: [] } } };
  return encodeConveneHistory(history);
}

export const THREE_PULLS = [pull("2026-05-01 10:00:00", "Originite: Type II"), pull("2026-05-02 11:30:00", "Verina", 5, 1503), pull("2026-06-10 09:15:00", "Guardian Sword")];

export function testCharacters(weapon = "AgesOfHarvest"): Record<string, any> {
  return {
    Jinhsi: { level: 90, weapon, builds: [{ id: "b1", name: "Default build" }, { id: "b2", name: "Tower" }], activeBuildId: "b1", echoes: {} },
    Augusta: { level: 1, echoes: {} },
  };
}

export function testStores(opts: { weapon?: string; echoes?: number; teams?: number } = {}): { character: string; inventory: string; teamRotations: string } {
  const echoes = Array.from({ length: opts.echoes ?? 3 }, (_, i) => ({ echoId: `e${i + 1}`, echo: "Jué", echoSet: "CelestialLight", stat: "CritDMG" }));
  const teams = Array.from({ length: opts.teams ?? 1 }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}`, characters: ["Jinhsi"] }));
  return {
    character: JSON.stringify({ characters: testCharacters(opts.weapon), activeCharacter: "Jinhsi", favoriteCharacters: [] }),
    inventory: JSON.stringify({ echoes, equipped: {}, echoPresets: [], equippedPresets: {} }),
    teamRotations: JSON.stringify({ teams, favoriteTeamIds: [], favoritePresetNames: [] }),
  };
}

/** A capture as `captureAccount` makes one. */
export function testCapture(opts: { weapon?: string; echoes?: number; teams?: number; pulls?: ConveneRecord[] | null; clears?: string | null } = {}): Capture {
  return {
    meta: { version: "10", source: "WutheringTools" },
    data: testStores(opts),
    keys: {
      "wtplus:convene:history": opts.pulls === null ? null : pullsRaw(opts.pulls ?? THREE_PULLS),
      "wtplus:endgame:clears": opts.clears === undefined ? JSON.stringify({ v: 1, clears: [{ floor: "left-4", team: "t1", seconds: 71 }] }) : opts.clears,
      "wtplus:echoPlan:v1": null,
      "wuthering-tools-plus.echoScan.albums": null,
    },
  };
}

export const EMPTY_CAPTURE: Capture = {
  meta: { version: "10", source: "WutheringTools" },
  data: { character: JSON.stringify({ characters: { Augusta: { level: 1, echoes: {} } }, activeCharacter: "Augusta" }), inventory: JSON.stringify({ echoes: [], equipped: {} }), teamRotations: null },
  keys: { "wtplus:convene:history": null, "wtplus:endgame:clears": null, "wtplus:echoPlan:v1": null, "wuthering-tools-plus.echoScan.albums": null },
};
