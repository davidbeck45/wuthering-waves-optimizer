// Wuthering Tools+ numbers log — one entry per finished ranking. `sharedRanking` (myRankings/rankingCache.ts) calls
// `recordScoredRanking` when a run it started ends whole and is cached; a ranking painted from a tab copy never comes
// through there, so it is not recorded a second time as if new. One painted from the saved results is recorded only
// when it is not the ranking the log saw last (`recordSavedRanking`): the account was put back to a state scored before. This module loads after
// that run (a dynamic import), waits for idle time, and never throws: a full browser or a private window just means
// no entry.
//
// The signatures are taken from the stores as they are when this runs, which is after the run. They describe what was
// scored only if the account is still the one the run read, so the ranking's fingerprint is made again from the stores
// and compared: a different one (he edited a build while the run was going) records nothing, and the run for the new
// data records itself when it ends.
import { toRaw } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { fingerprintOptions, rankingFingerprint } from "../myRankings/rankingCache";
import type { RosterRanking } from "../myRankings/rankRoster";
import { appBuildId } from "../persist/savedResults";
import { readImportStamp } from "./importStamp";
import { entryFromRanking, type RankedAccount } from "./entry";
import { appendEntry } from "./log";
import { localArea, readLog, withLogLock, writeLog, type LogArea } from "./logStore";

export type RecordOutcome =
  /** a new entry */
  | "stored"
  /** equal to the last entry: only "last seen" moved */
  | "same"
  /** not recorded: did not fully score, the account changed since, or nowhere to write */
  | "skipped";

export interface RecordEnv {
  /** the account as it is now (the stores, by default) */
  account: () => RankedAccount;
  storage: LogArea | null;
  now: () => number;
  build: string;
  /** resolves when the page is idle */
  idle: () => Promise<void>;
  importedAt: () => number | null;
  /** how long a run's record waits for an earlier ranking still on its way into the log (ms) */
  earlierWaitMs: number;
}

function storesAccount(): RankedAccount {
  return {
    characters: toRaw(useCharacterStore().characters ?? {}) as RankedAccount["characters"],
    echoes: toRaw(useInventoryStore().echoes ?? []) as RankedAccount["echoes"],
    teams: toRaw(useTeamRotationsStore().teams ?? []) as RankedAccount["teams"],
  };
}

/** After the page has painted what the run produced: an idle callback where the browser has one (Safari has none). */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => unknown }).requestIdleCallback;
    if (typeof ric === "function") ric(() => resolve(), { timeout: 4000 });
    else setTimeout(resolve, 250);
  });
}

/** For the last build's ranking: idle time too, but soon. It is found as the page loads, when the run that follows is
 *  starting; it has to be in the log before that run's record, and that record waits for it (`earlierWaitMs`). */
function soon(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => unknown }).requestIdleCallback;
    if (typeof ric === "function") ric(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 60);
  });
}

/** an earlier ranking on its way into the log (`recordEarlierRanking`): the run's own record goes in after it */
let earlier: Promise<unknown> = Promise.resolve();

export async function recordScoredRanking(fingerprint: string, ranking: RosterRanking, env: Partial<RecordEnv> = {}): Promise<RecordOutcome> {
  try {
    if (!fingerprint || !ranking || ranking.incomplete) return "skipped";
    await (env.idle ?? whenIdle)();
    // the last build's ranking goes in first; one that never settles must not hold every later record up
    await Promise.race([earlier, new Promise((resolve) => setTimeout(resolve, env.earlierWaitMs ?? 5000))]);
    const storage = "storage" in env ? (env.storage ?? null) : localArea();
    if (!storage) return "skipped";
    const account = (env.account ?? storesAccount)();
    const options = fingerprintOptions(fingerprint);
    // still the account this run read? (the same hash the pages key their caches on)
    if (rankingFingerprint({ characters: account.characters, echoes: account.echoes, teams: account.teams, ...options }) !== fingerprint) return "skipped";
    const now = (env.now ?? Date.now)();
    const finished = Date.parse(ranking.computedAt);
    const at = Number.isFinite(finished) && finished <= now ? finished : now;
    const build = env.build ?? appBuildId();
    const entry = entryFromRanking(ranking, account, { at, build, autoTeamBuffs: options.autoTeamBuffs });
    if (!entry) return "skipped";
    const imported = (env.importedAt ?? readImportStamp)();
    return await withLogLock((): RecordOutcome => {
      const log = readLog(storage);
      const last = log.entries[log.entries.length - 1];
      // an import since the last record AND since the last ranking seen: one that changed nothing was seen already
      if (imported && last && imported > last.at && imported > (log.seen?.at ?? 0) && imported <= now) entry.importedAt = imported;
      // never behind the entry before it: a clock set back must not reorder the log
      if (last && entry.at <= last.at) entry.at = last.at + 1;
      const result = appendEntry(log, entry, { fp: fingerprint, build, at: now });
      if (!writeLog(result.log, storage)) return "skipped";
      return result.stored ? "stored" : "same";
    });
  } catch {
    return "skipped"; // no Pinia (a test, a script), a store that will not read: the page that ranked is untouched
  }
}

/**
 * A ranking of this build painted from the Saved results (rankingCache.ts `readSavedRanking`): the account was put back
 * to a state already scored, an echo or a weapon changed and changed back. No run follows, so without this the log
 * would never get a record of the account as it is, and the page would ask him to open My account forever ("Your
 * account changed since the last record"). It is recorded only when it is not the ranking the log saw last; one equal
 * to the newest record only moves "last seen" (`appendEntry`), so a page that paints the same ranking again adds nothing.
 */
export async function recordSavedRanking(fingerprint: string, ranking: RosterRanking, env: Partial<RecordEnv> = {}): Promise<RecordOutcome> {
  try {
    const storage = "storage" in env ? (env.storage ?? null) : localArea();
    const seen = readLog(storage).seen;
    if (seen && seen.fp === fingerprint && seen.build === (env.build ?? appBuildId())) return "skipped";
    return await recordScoredRanking(fingerprint, ranking, env);
  } catch {
    return "skipped";
  }
}

/**
 * The last app build's ranking of this very account, found in the Saved results as a page asked for the saved one
 * (persist/savedResults.ts `onOtherBuildRecord`, through rankingCache.ts). It becomes a record of that build, at the
 * time it was saved, so the run about to start is read against it: the first visit after an update says what the
 * update moved. The signatures are taken from the stores, as for a run, and for the same reason they are right: the
 * record was filed under the fingerprint the stores hash to now.
 *
 * Not taken: from this same build (a run records itself), behind a record the log already has, equal to the last
 * record (from the next update on the log has it already: it was recorded when it was scored), or dated in the future.
 */
export function recordEarlierRanking(fingerprint: string, ranking: RosterRanking, meta: { build: string; at: number }, env: Partial<RecordEnv> = {}): Promise<RecordOutcome> {
  const job = (async (): Promise<RecordOutcome> => {
    try {
      if (!fingerprint || !ranking || ranking.incomplete || !meta?.build || !Number.isFinite(meta.at)) return "skipped";
      await (env.idle ?? soon)();
      const storage = "storage" in env ? (env.storage ?? null) : localArea();
      if (!storage) return "skipped";
      if (meta.build === (env.build ?? appBuildId())) return "skipped";
      if (meta.at > (env.now ?? Date.now)()) return "skipped";
      const account = (env.account ?? storesAccount)();
      const options = fingerprintOptions(fingerprint);
      if (rankingFingerprint({ characters: account.characters, echoes: account.echoes, teams: account.teams, ...options }) !== fingerprint) return "skipped";
      const entry = entryFromRanking(ranking, account, { at: meta.at, build: meta.build, autoTeamBuffs: options.autoTeamBuffs });
      if (!entry) return "skipped";
      return await withLogLock((): RecordOutcome => {
        const log = readLog(storage);
        const last = log.entries[log.entries.length - 1];
        if (last && meta.at <= last.at) return "skipped";
        const result = appendEntry(log, entry, null);
        if (!result.stored) return "same";
        return writeLog(result.log, storage) ? "stored" : "skipped";
      });
    } catch {
      return "skipped";
    }
  })();
  earlier = job.catch(() => undefined);
  return job;
}
