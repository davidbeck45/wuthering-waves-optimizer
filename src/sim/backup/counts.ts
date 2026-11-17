// Wuthering Tools+ automatic backups — what is inside one, in the words the list uses: characters, saved builds,
// echoes, teams, pulls. Read from the stores as stored text (a capture) or already parsed (a file on its way in).
import { CONVENE_HISTORY_KEY, decodeConveneHistory } from "../convene/gachaImport";
import type { Capture } from "./backupFile";
import type { BackupCounts } from "./backupStore";

/* eslint-disable @typescript-eslint/no-explicit-any */

const record = (v: unknown): Record<string, any> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : null);

function parsed(v: unknown): Record<string, any> | null {
  if (typeof v !== "string") return record(v);
  try {
    return record(JSON.parse(v));
  } catch {
    return null;
  }
}

/** Pulls of every stored player; null when the stored history cannot be read by this build. */
export function pullCount(raw: string | null | undefined): number | null {
  if (!raw) return 0;
  const history = decodeConveneHistory(raw);
  if (!history.ok) return null;
  return Object.values(history.history.players).reduce((n, p) => n + Object.values(p.pools).reduce((m, rows) => m + rows.length, 0), 0);
}

/** A character counts once a weapon is equipped: My account's "set up" (myRankings/rankRoster.ts `isSetUp`). */
export function countsOf(stores: { character: unknown; inventory: unknown; teamRotations: unknown }, pullsRaw: string | null | undefined): BackupCounts {
  const characters = Object.values(record(parsed(stores.character)?.characters) ?? {}).filter((c) => record(c));
  const echoes = parsed(stores.inventory)?.echoes;
  const teams = parsed(stores.teamRotations)?.teams;
  return {
    characters: characters.filter((c) => Boolean(c.weapon)).length,
    builds: characters.reduce((n, c) => n + (Array.isArray(c.builds) ? c.builds.length : 0), 0),
    echoes: Array.isArray(echoes) ? echoes.length : 0,
    teams: Array.isArray(teams) ? teams.length : 0,
    pulls: pullCount(pullsRaw),
  };
}

export const captureCounts = (capture: Pick<Capture, "data" | "keys">): BackupCounts =>
  countsOf({ character: capture.data.character, inventory: capture.data.inventory, teamRotations: capture.data.teamRotations }, capture.keys[CONVENE_HISTORY_KEY]);

/** Nothing of the player's own: no character set up, no echoes, no teams, no pulls. Such an account takes no backup:
 *  a backup of nothing would in time push the real ones out of the list. A pull history that cannot be read counts as
 *  something. */
export const isEmptyAccount = (c: BackupCounts): boolean => !c.characters && !c.echoes && !c.teams && c.pulls === 0;

/** "12 characters · 251 echoes · 9 teams · 14 saved builds · 480 pulls": each number with its noun. */
export function countsText(c: BackupCounts): string {
  // a number never wraps away from its noun (no-break spaces), so a narrow phone breaks the line between items
  const n = (count: number, one: string, many = `${one}s`): string => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`.replace(/ /g, "\u00a0");
  return [n(c.characters, "character"), n(c.echoes, "echo", "echoes"), n(c.teams, "team"), n(c.builds, "saved build"), c.pulls === null ? "a\u00a0pull\u00a0history" : n(c.pulls, "pull")].join(" · ");
}
