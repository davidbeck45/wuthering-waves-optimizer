// Wuthering Tools+ — where the Ask button lives. On Ryan's v3 desktop rail (from 1024 px) Ask is a rail item under
// Tools+ (nav/PlusRailAsk.vue), so the floating button that covered right-column figures there (/account's rail, the
// Echo Lab Verdict column, /weapons' "Next copy") steps aside (2026-11-02 desktop audit, D12). Phones, tablets under the
// phone header and the classic UI keep the floating button. A count, not a flag: the rail can remount mid-navigation.
import { computed, ref } from "vue";

const railAsks = ref(0);

/** Ryan's rail is about 640 px tall and an Ask item adds about 62: below this window height its bottom items (theme,
 *  the … menu) would run off the screen, so a short window (a 1366 × 768 laptop's ~657 px) keeps the floating button */
export const RAIL_ASK_MIN_HEIGHT = 720;

/** true while an Ask item sits in the v3 rail */
export const askInRail = computed(() => railAsks.value > 0);

/** called by the rail item on mount; returns its unmount */
export function dockAskInRail(): () => void {
  railAsks.value += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    railAsks.value = Math.max(0, railAsks.value - 1);
  };
}

/** The open assistant panel docks beside the page, which narrows to make room, from this width; below it the panel
 *  lies over the page's right side as before (2026-11-02 desktop audit, D13). 1440: the docked page keeps about 950 px,
 *  what a 1024 px window with the side rail gets, which every page is laid out for. At 1280 the page dropped to 800 px
 *  while the pages' window-width rules still picked their desktop layouts (/account's hero number was cut, the
 *  /my-rankings rotation column was 40 px). The two tables that lay out by width (Echo Lab, /my-rankings) use container
 *  queries, so they follow the docked page. */
export const DOCK_MIN_WIDTH = 1440;
/** the class on <html> while docked (phone.css § 34 narrows the page by the panel's width) */
export const DOCKED_CLASS = "wt-ai-docked";

export function shouldDock(panel: { open: boolean; collapsed: boolean }, viewportWidth: number): boolean {
  return panel.open && !panel.collapsed && viewportWidth >= DOCK_MIN_WIDTH;
}
