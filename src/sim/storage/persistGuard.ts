// Wuthering Tools+ — what stands between the persisted Pinia stores and localStorage (one `storage:` option in main.ts).
// pinia-plugin-persistedstate drops every write error, so on a full browser each write path said it had saved and a
// reload lost it (2026-11-05 hunt, H4). This keeps the same writes and remembers which stores the browser refused:
// a save asks `accountStoresRefused()` after the write and takes itself back, and PlusShell tells the player about any
// other write (`noticeRefusedWrites`). `withoutPersisting` lets a tab adopt another tab's state without writing it back
// (crossTabSync.ts).
import { shallowRef, watch } from "vue";

/** The stores a build, a team or an echo lives in. */
export const ACCOUNT_STORE_KEYS = ["character", "inventory", "teamRotations"] as const;

/** Store keys whose latest write the browser refused: this tab is ahead of what a reload would read. */
export const refusedStores = shallowRef<readonly string[]>([]);

let muted = 0;

function mark(key: string, refused: boolean): void {
  if (refusedStores.value.includes(key) === refused) return;
  refusedStores.value = refused ? [...refusedStores.value, key] : refusedStores.value.filter((k) => k !== key);
}

/** The plugin's `storage`. Rethrows a refused write: the plugin drops it, as it did before. */
export const persistStorage = {
  getItem: (key: string): string | null => localStorage.getItem(key),
  setItem(key: string, value: string): void {
    if (muted) return;
    try {
      localStorage.setItem(key, value);
      mark(key, false);
    } catch (e) {
      mark(key, true);
      throw e;
    }
  },
};

/** Runs `fn` (synchronous) with the stores' writes held back. */
export function withoutPersisting(fn: () => void): void {
  muted += 1;
  try {
    fn();
  } finally {
    muted -= 1;
  }
}

/** This tab now holds what is stored for `key` (it adopted another tab's write). */
export const markStoreCurrent = (key: string): void => mark(key, false);

/** After a write has reached the plugin (`await nextTick()`): did the browser refuse any account store? */
export const accountStoresRefused = (): boolean => ACCOUNT_STORE_KEYS.some((k) => refusedStores.value.includes(k));

/** The key `roomFor` borrows for a moment. */
export const PROBE_KEY = "wtplus:storage:probe";

/** Would this browser store `chars` more characters? Tried on a scratch key of its own, so the account is never at
 *  risk, and taken straight back out. */
export function roomFor(chars: number, storage: Pick<Storage, "setItem" | "removeItem"> = localStorage): boolean {
  if (chars <= 0) return true;
  try {
    storage.setItem(PROBE_KEY, "x".repeat(Math.ceil(chars)));
    return true;
  } catch {
    return false;
  } finally {
    try {
      storage.removeItem(PROBE_KEY);
    } catch {
      // nothing was stored
    }
  }
}

export const STORAGE_FULL_TEXT = "This browser's storage is full: your last change is on this page only and will be gone after a reload. Delete some versions in Build history to make room.";

/** Tells the player once when a write stays refused. The wait lets a save that takes itself back (and says so in its
 *  own words) clear the mark first. Returns the unsubscribe. */
export function noticeRefusedWrites(notify: (text: string) => void, waitMs = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let told = false;
  const stop = watch(refusedStores, (keys) => {
    if (!keys.length) {
      told = false;
      if (timer) clearTimeout(timer);
      timer = null;
      return;
    }
    if (told || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!refusedStores.value.length || told) return;
      told = true;
      notify(STORAGE_FULL_TEXT);
    }, waitMs);
  });
  return () => {
    stop();
    if (timer) clearTimeout(timer);
  };
}
