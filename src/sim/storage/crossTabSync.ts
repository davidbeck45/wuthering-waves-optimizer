// Wuthering Tools+ — two tabs on one account. The persisted stores write their whole state on any change, and a tab
// never heard about another tab's write, so an older tab wiped what a newer one had saved by selecting a character
// (2026-11-05 hunt, H3). Each tab now adopts what another tab stores for the three account stores, as it happens.
//
// Adopting is not the plugin's `$hydrate`: that is a deep `$patch`, which keeps a build or a character the other tab
// deleted. It replaces each top-level field instead, with writes held back (persistGuard.ts): this tab's copy now is
// what is stored, and a write back would answer the other tab forever, each keeping its own `activeCharacter`. Which
// character a tab shows stays its own, unless that character left the account.
import { getCurrentInstance, onBeforeUnmount, ref, watch } from "vue";
import { ACCOUNT_STORE_KEYS, markStoreCurrent, withoutPersisting } from "./persistGuard";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SyncedStore {
  $id: string;
  $patch(mutator: (state: any) => void): void;
  $reset(): void;
}

/** How many times this tab took another tab's write: a scored page follows it (`onAccountAdopted`). */
export const accountAdoptions = ref(0);

function adopt(store: SyncedStore, raw: string | null): void {
  let next: Record<string, any> | null = null;
  if (raw) {
    try {
      next = JSON.parse(raw);
    } catch {
      return; // not something this app wrote: this tab keeps what it has
    }
    if (!next || typeof next !== "object" || Array.isArray(next)) return;
  }
  withoutPersisting(() => {
    if (!next) {
      store.$reset(); // cleared in the other tab (Settings › delete), so a write here must not bring it back
      return;
    }
    const incoming = next;
    store.$patch((state) => {
      const shown = state.activeCharacter;
      Object.assign(state, incoming);
      if (shown && incoming.characters?.[shown]) state.activeCharacter = shown;
    });
  });
  markStoreCurrent(store.$id);
  accountAdoptions.value += 1;
}

/** A page that shows results scored on the account calls this with its refresh: the stores followed the other tab, and
 *  the rows on screen must too, or they stand as "Live" for builds that have changed. One call once the other tab's
 *  writes settle, and none until this tab is looked at: an edit there is no reason to score in the background. */
export function onAccountAdopted(refresh: () => void, waitMs = 500, host: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> = document): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting = false;
  const run = (): void => {
    timer = null;
    if (host.visibilityState === "hidden") {
      waiting = true;
      return;
    }
    waiting = false;
    refresh();
  };
  const onVisible = (): void => {
    if (waiting) run();
  };
  const stop = watch(accountAdoptions, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  });
  host.addEventListener("visibilitychange", onVisible);
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      stop();
      if (timer) clearTimeout(timer);
      host.removeEventListener("visibilitychange", onVisible);
    });
  }
}

/** Starts listening; returns the unsubscribe. */
export function installCrossTabSync(stores: readonly SyncedStore[], target: Pick<Window, "addEventListener" | "removeEventListener"> = window): () => void {
  const watched = stores.filter((s) => (ACCOUNT_STORE_KEYS as readonly string[]).includes(s.$id));
  const onStorage = (e: StorageEvent): void => {
    if (e.storageArea && e.storageArea !== localStorage) return;
    if (e.key === null) {
      for (const store of watched) adopt(store, null); // localStorage.clear() in the other tab
      return;
    }
    const store = watched.find((s) => s.$id === e.key);
    if (store) adopt(store, e.newValue);
  };
  target.addEventListener("storage", onStorage as EventListener);
  return () => target.removeEventListener("storage", onStorage as EventListener);
}
