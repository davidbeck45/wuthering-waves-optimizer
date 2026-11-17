// Wuthering Tools+ numbers log — the localStorage around log.ts. One log per browser, shared by every tab:
//   - a write is a read-modify-write under a Web Lock (`navigator.locks`) where the browser has one, so two tabs that
//     finish the same ranking add one entry, not two (the second reads the first's entry and finds its own equal);
//   - a write the browser refuses (full, private mode) drops the older half and tries once more, then gives up without
//     a sound: the log is the first thing to yield, and nothing else depends on it;
//   - `logVersion` moves when this tab writes and when another tab does (the `storage` event), so an open page follows.
import { ref } from "vue";
import { NUMBERS_LOG_KEY, decodeLog, emptyLog, encodeLog, halved, type NumbersLog } from "./log";

export type LogArea = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function localArea(): LogArea | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked
  }
}

/** Bumped on every change to the stored log this tab can know of. */
export const logVersion = ref(0);

let listening = false;
/** Follow another tab's writes (and a Delete your data there). Safe to call many times. */
export function watchLog(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === NUMBERS_LOG_KEY || e.key === null) logVersion.value += 1;
  });
}

export function readLog(storage: LogArea | null = localArea()): NumbersLog {
  try {
    return decodeLog(storage?.getItem(NUMBERS_LOG_KEY));
  } catch {
    return emptyLog();
  }
}

/** True once the log is stored. A refusal halves the log and tries once more. */
export function writeLog(log: NumbersLog, storage: LogArea | null = localArea()): boolean {
  if (!storage) return false;
  for (const attempt of [log, halved(log)]) {
    try {
      storage.setItem(NUMBERS_LOG_KEY, encodeLog(attempt));
      logVersion.value += 1;
      return true;
    } catch {
      /* quota: the smaller log next, then nothing */
    }
  }
  return false;
}

interface LockManagerLike {
  // eslint-disable-next-line no-unused-vars -- the parameters of a method type
  request: <T>(name: string, callback: () => T | Promise<T>) => Promise<T>;
}

/** `job` alone among this browser's tabs, where the browser has Web Locks; else just run. The job itself is one
 *  synchronous read-modify-write, so without locks the window two tabs could cross in is a few microseconds. */
export async function withLogLock<T>(job: () => T, locks: LockManagerLike | null | undefined = typeof navigator === "undefined" ? null : (navigator as { locks?: LockManagerLike }).locks): Promise<T> {
  if (locks?.request) {
    let ran = false;
    try {
      return await locks.request("wtplus-numbers-log", () => {
        ran = true;
        return job();
      });
    } catch (err) {
      if (ran) throw err; // the job itself failed: it is not run twice
      /* else a browser that refuses the lock (some private modes): run unlocked */
    }
  }
  return job();
}
