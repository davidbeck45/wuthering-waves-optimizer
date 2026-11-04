// Wuthering Tools+ — the /account investment plan cache, keyed by the roster ranking's fingerprint
// (myRankings/rankingCache.ts: a hash of every character, echo and team the scoring reads, plus its options), so a
// plan is only ever shown for exactly the data it was computed on. Module memory (coming back to the page) and
// sessionStorage (a reload of the tab), the same pattern as the ranking cache — and, since 2026-11-02, saved in this
// browser (persist/savedResults.ts, IndexedDB) + the app build. The saved copy is filed under the ranking fingerprint
// alone, with the full key (which adds the ER needs) inside, so /account can paint it before the energy check has
// answered and confirm the ER needs when it does (`readSavedPlan`).
import { onSavedResultsCleared, savedSlot } from "../persist/savedResults";
import type { InvestPlan } from "./investPlan";

/** bump when InvestItem's shape or the plan's rules change */
export const INVEST_CACHE_VERSION = 2; // 2: items carry the ER shortfall (erGap) their own gain is read against
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

export interface SavedPlan {
  /** the full cache key the plan was computed for (ranking fingerprint + the ER needs) */
  key: string;
  plan: InvestPlan;
}
const isSavedPlan = (v: unknown): boolean => {
  const s = v as SavedPlan | null;
  return typeof s?.key === "string" && Array.isArray(s.plan?.items) && !s.plan.cancelled;
};
/** the browser-wide copy (IndexedDB): survives the tab; one per ranking fingerprint */
export const savedPlans = savedSlot<SavedPlan>("investPlan", INVEST_CACHE_VERSION, isSavedPlan);

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

/** Keep a finished plan (a cancelled one is never cached); false when sessionStorage refused it. With `savedUnder`
 *  (the ranking fingerprint alone) it is saved in this browser too, in the background. */
export function writeCachedPlan(rankingFingerprint: string, plan: InvestPlan, storage: StorageLike | null = sessionStore(), savedUnder: string | null = null): boolean {
  if (plan.cancelled) return false;
  const key = keyOf(rankingFingerprint);
  memory = { key, plan };
  if (savedUnder) void savedPlans.write(savedUnder, { key: rankingFingerprint, plan });
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

/** Where a finished plan is saved past this tab (`writeCachedPlan`'s `savedUnder`): under the ranking fingerprint, or
 *  nowhere when it or the ranking under it did not fully score, so the next tab plans again. */
export function planSavedUnder(rankingFingerprint: string, base: { incomplete?: boolean }, plan: Pick<InvestPlan, "errors">): string | null {
  return base.incomplete || plan.errors.length ? null : rankingFingerprint;
}

/** The plan this browser saved for this ranking fingerprint and app build: the plan, the full key it was computed
 *  for (compare it with the one built from today's ER needs before keeping it) and when it was saved; null on a miss. */
export async function readSavedPlan(rankingFingerprint: string): Promise<{ key: string; plan: InvestPlan; savedAt: number } | null> {
  const hit = await savedPlans.read(rankingFingerprint);
  return hit ? { ...hit.value, savedAt: hit.savedAt } : null;
}

export function clearPlanMemory(): void {
  memory = null;
}

// Settings › Clear saved results: this tab's copies go too
onSavedResultsCleared(() => {
  memory = null;
  try {
    sessionStore()?.removeItem(INVEST_CACHE_KEY);
  } catch {
    /* nothing to do */
  }
});
