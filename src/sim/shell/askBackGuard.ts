// Wuthering Tools+ — Back closes the Ask sheet on a phone. The sheet is a section, not a <dialog>, so a phone's Back gesture
// has no close watcher to reach and left the page under it (2026-11-05 hunt, L6). A Back with the sheet open closes the
// sheet and stays: the router puts the address back. A link inside the sheet is a push, not a Back, and goes on its way;
// Forward isn't touched. The side panel on a wide screen sits beside the page, so Back there still means the page.
import type { Router } from "vue-router";

export interface AskSheet {
  /** the sheet is open, as a sheet (a phone) */
  sheetOpen: () => boolean;
  close: () => void;
}

export function installAskBackGuard(router: Pick<Router, "beforeEach" | "options">, sheet: AskSheet): () => void {
  let back = false;
  // the history's listener runs as the pop arrives, the router's guards a microtask later, whichever was installed first
  const stopListening = router.options.history.listen((_to, _from, info) => {
    back = info.delta < 0;
  });
  const stopGuard = router.beforeEach(() => {
    const wasBack = back;
    back = false;
    if (!wasBack || !sheet.sheetOpen()) return true;
    sheet.close();
    return false;
  });
  return () => {
    stopListening();
    stopGuard();
  };
}
