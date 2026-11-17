// Wuthering Tools+ numbers log — one entry per finished ranking. `sharedRanking` (myRankings/rankingCache.ts) calls
// `recordScoredRanking` when a run it started ends whole and is cached; a ranking painted from a tab copy or from the
// saved results never comes through there, so it is not recorded a second time as if new. This module loads after
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
import { appendEntry, entryFromRanking, type RankedAccount } from "./log";
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

export async function recordScoredRanking(fingerprint: string, ranking: RosterRanking, env: Partial<RecordEnv> = {}): Promise<RecordOutcome> {
  try {
    if (!fingerprint || !ranking || ranking.incomplete) return "skipped";
    await (env.idle ?? whenIdle)();
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
