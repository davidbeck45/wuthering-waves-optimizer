// Wuthering Tools+ — the selector's wuwa_calc side in the browser: the app's one solver worker (the Wave-0 seam's
// `rileyClient()`), adapted to `SelectorRiley`. A selector run solves the same "your teams as they are" batch for every
// candidate and pool, often more teams than the client's 200-entry LRU keeps, so solves are also kept here for the
// page session, by the seam's own `memoKey` (engine commit + account + builds + spread + team key), at most
// `MAX_SOLVES` of them (the least recently used go first: every data edit and every candidate account adds keys). A
// failed or cancelled solve is never kept. Main thread only.
import { rileyClient, type RileyClient } from "../engine/rileyClient";
import { memoKey, type MineSolve, type RileyAccount } from "../engine/rileyRun";
import type { SelectorRiley } from "./selector";

const solved = new Map<string, Promise<MineSolve>>();
/** ≈ four Moonlit-Path-sized runs (291 solves each on David's 9-16 export) */
export const MAX_SOLVES = 1200;

/** Keep `p` under `key` as the most recent entry; drop it again if it fails (an abort, a dead worker). */
function remember(key: string, p: Promise<MineSolve>): void {
  solved.delete(key);
  solved.set(key, p);
  while (solved.size > MAX_SOLVES) solved.delete(solved.keys().next().value!);
  p.catch(() => {
    if (solved.get(key) === p) solved.delete(key);
  });
}

export async function browserSelectorRiley(account: RileyAccount, signal?: AbortSignal, client: RileyClient = rileyClient()): Promise<SelectorRiley> {
  const [teams, blocked] = await Promise.all([client.teams(signal), client.blocked(signal)]);
  return {
    commit: client.commit,
    account,
    teams,
    blocked,
    solve(keys, acc, onProgress) {
      const keyOf = (teamKey: string): string => memoKey({ op: "solve", commit: client.commit, account: acc, subs: "mine", teamKey });
      // read every hit first: remembering the missing ones may evict an old entry this call still needs
      const found: Array<Promise<MineSolve> | undefined> = keys.map((k) => solved.get(keyOf(k)));
      found.forEach((p, i) => p && remember(keyOf(keys[i]!), p));
      const missing = keys.filter((_, i) => !found[i]);
      const known = keys.length - missing.length;
      if (missing.length) {
        const batch = client.solveMine(missing, { account: acc, subs: "mine", signal, onProgress: (done) => onProgress?.(known + done, keys.length) });
        let j = 0;
        keys.forEach((k, i) => {
          if (found[i]) return;
          const at = j++;
          const one = batch.then((r) => r[at]!);
          found[i] = one;
          remember(keyOf(k), one);
        });
      } else onProgress?.(keys.length, keys.length);
      return Promise.all(found as Array<Promise<MineSolve>>);
    },
  };
}
