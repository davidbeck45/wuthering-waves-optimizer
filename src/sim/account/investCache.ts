// Wuthering Tools+ — the /account investment plan cache, keyed by the roster ranking's fingerprint
// (myRankings/rankingCache.ts: a hash of every character, echo and team the scoring reads, plus its options), so a
// plan is only ever shown for exactly the data it was computed on. Module memory (coming back to the page) and
// sessionStorage (a reload of the tab), the same pattern as the ranking cache.
import type { InvestPlan } from "./investPlan";

/** bump when InvestItem's shape or the plan's rules change */
export const INVEST_CACHE_VERSION = 1;
export const INVEST_CACHE_KEY = "wtplus:account:invest";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const sessionStore = (): StorageLike | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

const keyOf = (rankingFingerprint: string): string => `p${INVEST_CACHE_VERSION}:${rankingFingerprint}`;
let memory: { key: string; plan: InvestPlan } | null = null;

export function readCachedPlan(rankingFingerprint: string, storage: StorageLike | null = sessionStore()): InvestPlan | null {
  const key = keyOf(rankingFingerprint);
  if (memory?.key === key) return memory.plan;
  if (!storage) return null;
  try {
    const entry = JSON.parse(storage.getItem(INVEST_CACHE_KEY) ?? "null") as { key?: string; plan?: InvestPlan } | null;
    if (entry?.key !== key || !entry.plan || !Array.isArray(entry.plan.items)) return null;
    memory = { key, plan: entry.plan };
    return entry.plan;
  } catch {
    return null;
  }
}

/** Keep a finished plan (a cancelled one is never cached); false when sessionStorage refused it. */
export function writeCachedPlan(rankingFingerprint: string, plan: InvestPlan, storage: StorageLike | null = sessionStore()): boolean {
  if (plan.cancelled) return false;
  const key = keyOf(rankingFingerprint);
  memory = { key, plan };
  if (!storage) return false;
  try {
    storage.setItem(INVEST_CACHE_KEY, JSON.stringify({ key, plan }));
    return true;
  } catch {
    try {
      storage.removeItem(INVEST_CACHE_KEY);
    } catch {
      /* nothing to do */
    }
    return false;
  }
}

export function clearPlanMemory(): void {
  memory = null;
}
