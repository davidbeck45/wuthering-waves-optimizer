// Wuthering Tools+ — the quiet "saved 2 h ago" note a page shows beside a result that came out of this browser's
// saved results (savedResults.ts) instead of being scored on this visit, with the tooltip that says why. Ticks once
// a minute while the page is open.
import { computed, getCurrentInstance, onBeforeUnmount, ref, type ComputedRef } from "vue";
import { savedAgo, savedTitle } from "./savedResults";

export interface SavedNote {
  /** "saved 2 h ago", or null when the result was not a saved one */
  text: string | null;
  title: string;
}

/** `button`: what the page's own button that scores again says, for the tooltip */
export function useSavedNote(savedAt: () => number | null | undefined, button?: string): ComputedRef<SavedNote> {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), 60_000);
  if (getCurrentInstance()) onBeforeUnmount(() => clearInterval(timer));
  return computed(() => {
    const at = savedAt();
    return at ? { text: savedAgo(at, now.value), title: savedTitle(at, button) } : { text: null, title: "" };
  });
}
