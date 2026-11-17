// Wuthering Tools+ — the one reactive copy of the "What's new" unseen marker. The plus pages menu (its dot), /account's
// card and the page itself all read it, so opening the page clears the other two at once, and another tab's visit
// clears this tab's dot through the `storage` event. Light on purpose: the menu sits in the entry chunk.
import { computed, ref, type ComputedRef } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { isNewVisitor } from "../shell/welcome";
import { WHATS_NEW } from "./entries";
import { WHATS_NEW_SEEN_KEY, readSeen, seenMarker, unseenIds } from "./whatsNew";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked
  }
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(WHATS_NEW_SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

const raw = ref<string | null>(readRaw());
let listening = false;
function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    // key null = localStorage.clear() in the other tab
    if (e.key === WHATS_NEW_SEEN_KEY || e.key === null) raw.value = readRaw();
  });
}

export interface WhatsNewState {
  /** the ids new to this browser, in the list's order */
  unseen: ComputedRef<string[]>;
  count: ComputedRef<number>;
  /** the page was opened here before, so "since your last visit" is true */
  hasMarker: ComputedRef<boolean>;
  /** the page was opened: everything listed today is seen */
  markSeen: () => void;
}

export function useWhatsNew(): WhatsNewState {
  listen();
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const hasAccount = computed(() => !isNewVisitor(characterStore.characters as Record<string, { weapon?: unknown }>, inventoryStore.echoes as unknown[]));
  const seen = computed(() => readSeen(raw.value));
  const unseen = computed(() => unseenIds(WHATS_NEW, seen.value, hasAccount.value));
  return {
    unseen,
    count: computed(() => unseen.value.length),
    hasMarker: computed(() => seen.value !== null),
    markSeen(): void {
      const next = seenMarker(WHATS_NEW);
      raw.value = next; // this page load keeps it even when the browser refuses the write (private mode, full)
      try {
        storage()?.setItem(WHATS_NEW_SEEN_KEY, next);
      } catch {
        /* the dot comes back on the next load: nothing else depends on it */
      }
    },
  };
}

/** For tests: read the stored marker again. */
export function resetWhatsNewState(): void {
  raw.value = readRaw();
}
