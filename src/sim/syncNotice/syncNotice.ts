// Wuthering Tools+ — "Your saved teams from Team rankings are behind": which saved teams were read off an older Riley's
// engine (wuwa_calc) than the one this app runs, found from a stamp on each team, with no solve.
//
// A team saved from Team rankings (an import from a team's page, a stock team preset, or one Sync my teams rewrote) is a
// copy: its actions, its per-tick stacks and its enemy settings were read off the engine on the day it was saved. From
// batch 5 (2026-11-23) each such team carries the engine commit it was read from (`wuwaCalcCommit`): an import and a
// Sync write `WUWA_CALC_COMMIT`, a stock team its manifest's `wuwaCalcCommit`. A team saved before that carries none
// and is read as older than the first update that stamps (`ENGINE_UPDATES`). A team the player built or renamed is not
// generated (`isWuwaCalcTeam`, by its name) and is never counted. A starred stock team is not a saved team: it is read
// from the stock list every time, so it is never behind.
//
// The notice is handled until the next engine update: closing it, or a Sync, writes today's commit under
// `SYNC_NOTICE_KEY`; a later commit shows it again. A Sync stamps the teams it rewrote, but one it could not re-read
// (no build at the account's state, a trio Riley does not list) keeps its old stamp, so the handled mark is what
// takes the notice away after a Sync, not the stamps alone.
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";

export const SYNC_NOTICE_KEY = "wtplus:syncNotice:handled";

/** When each engine commit the app shipped became Team rankings' data: the date of Riley's newest commit in it. A commit
 *  missing here is named without a date ("its latest update"). Add a line when the engine is bumped. */
export const ENGINE_UPDATES: Readonly<Record<string, string>> = {
  // Riley's master 211d7d0 "update precompute" (2026-11-22) plus the fork's five patches
  "821f8db": "2026-11-22",
};

/** importFromRankings.ts `isGeneratedTeamName`, which Sync my teams goes by. Its own copy here: that module pulls the
 *  character data and the cast mapper, too much for /account and /teams to load for one notice
 *  (syncNotice.test.ts holds the two to the same answers). */
export const isWuwaCalcTeam = (team: { name?: string | null }): boolean => {
  const name = team?.name ?? "";
  return /^wuwa_calc /.test(name) || /\(wuwa_calc t\d+\)/.test(name) || /\(wuwa_calc\)\s*$/.test(name);
};

export interface TeamOrigin {
  id: string;
  name: string;
  /** the engine commit the team's rotation was read from; absent on a team saved before stamps */
  wuwaCalcCommit?: string | null;
}

export interface BehindTeams {
  /** the saved generated teams read from an older engine, in the store's order */
  teams: TeamOrigin[];
  /** how many saved generated teams there are in all */
  generated: number;
  /** the engine this app runs */
  current: string;
  /** "2026-11-22": when the current engine became Team rankings' data; null when not known */
  updatedOn: string | null;
}

/** Is this saved team a generated one read from another engine than `current`? */
export const isBehind = (team: TeamOrigin, current: string = WUWA_CALC_COMMIT): boolean =>
  isWuwaCalcTeam(team) && (team.wuwaCalcCommit ?? null) !== current;

/** The saved teams behind today's engine. Pure: no store, no solve. */
export function behindTeams(teams: readonly TeamOrigin[] | null | undefined, current: string = WUWA_CALC_COMMIT): BehindTeams {
  const list = (teams ?? []).filter((t) => t && typeof t.name === "string");
  const generated = list.filter(isWuwaCalcTeam);
  return { teams: generated.filter((t) => isBehind(t, current)), generated: generated.length, current, updatedOn: ENGINE_UPDATES[current] ?? null };
}

/** Should the notice show: some team is behind and it was not closed (or synced) at this engine. */
export const showSyncNotice = (behind: BehindTeams, handled: string | null): boolean => behind.teams.length > 0 && handled !== behind.current;

/** "22 November" (the year only when it is not `now`'s). */
export function updateDayText(iso: string, now = Date.now()): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC", ...(sameYear ? {} : { year: "numeric" }) });
}

/** The notice's first sentence. */
export function noticeHeadline(behind: BehindTeams, now = Date.now()): string {
  const n = behind.teams.length;
  const when = behind.updatedOn ? `its update of ${updateDayText(behind.updatedOn, now)}` : "its latest update";
  const who = n === behind.generated ? (n === 1 ? "Your saved team" : n === 2 ? "Both of your saved teams" : `All ${n} of your saved teams`) : `${n} of your saved teams`;
  return `${who} from Team rankings ${n === 1 ? "was" : "were"} read before ${when}.`;
}

/** What a Sync does, in one sentence. */
export const NOTICE_SYNC_TEXT = "Sync my teams re-reads them at your own sequences and weapons, shows what moved, and can be undone.";

type Area = Pick<Storage, "getItem" | "setItem">;

function local(): Area | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The engine commit at which the notice was last closed or a Sync ran; null when never. */
export function readHandled(storage: Area | null = local()): string | null {
  try {
    return storage?.getItem(SYNC_NOTICE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** The notice is handled at this engine: closed, or a Sync ran. Never throws (a full browser just shows it again). */
export function markHandled(commit: string = WUWA_CALC_COMMIT, storage: Area | null = local()): void {
  try {
    storage?.setItem(SYNC_NOTICE_KEY, commit);
  } catch {
    /* refused: the notice shows again next visit */
  }
}

/** The stamp a team read off today's engine carries. */
export const engineStamp = (): { wuwaCalcCommit: string } => ({ wuwaCalcCommit: WUWA_CALC_COMMIT });

/** The address of the existing Sync my teams flow: /rankings?sync=1 opens its question once Riley's modules are in
 *  (RankingsAccountBar.vue, `takeSyncRequest`), at the account's own state as /account's link has it
 *  (accountState.ts `rankingsMineHash()`, not imported: it pulls the ranking code onto /teams). */
export const SYNC_QUERY = "sync";
export const SYNC_HASH = "#tc=mine";

/** Was the existing Sync asked for by this address? Then the query to go on with, without it (so a reload or Back does
 *  not ask again). Null when not asked. */
export function takeSyncRequest<T>(query: Record<string, T>): Record<string, T> | null {
  if ((query?.[SYNC_QUERY] as unknown) !== "1") return null;
  const { [SYNC_QUERY]: _asked, ...rest } = query;
  return rest;
}
