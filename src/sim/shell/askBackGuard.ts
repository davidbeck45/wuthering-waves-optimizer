// Wuthering Tools+ — Back closes the Ask sheet on a phone. The sheet is a section, not a <dialog>, so a phone's Back gesture
// has no close watcher to reach and left the page under it (2026-11-05 hunt, L6). A Back with the sheet open closes the
// sheet and stays: the router puts the address back. A link inside the sheet is a push, not a Back, and goes on its way;
// Forward isn't touched. The side panel on a wide screen sits beside the page, so Back there still means the page.
//
// The same guard serves every sheet that is no <dialog> (`installSheetBackGuard`): /my-rankings' Options and /rotation's
// Play along left their page on Back too, the lap with it (2026-11-08 hunt, L3). With two sheets open, one Back closes
// one: the first guard to answer stops the move, so the others never run. Each forgets the Back once that move is over
// (`afterEach`), or the next link tapped inside a sheet still open would have been taken for it and swallowed.
import { watch } from "vue";
import type { Router } from "vue-router";
import { createSheetHistory, type SheetHistory, type SheetHistoryHost } from "./sheetHistory";

export interface AskSheet {
  /** the sheet is open, as a sheet (a phone) */
  sheetOpen: () => boolean;
  close: () => void;
}

/** every sheet a guard is installed for: the first page of a visit has no router move to cancel (sheetHistory.ts) */
const sheets = new Set<AskSheet>();
/**
 * One listener for the app, put on the window as this module loads, on purpose. A window's popstate listeners run in
 * the order they were added, and vue-router adds its own when main.ts creates the router. main.ts imports the app
 * (App.vue, PlusShell, this module) before that line runs, so this listener is first and can keep a move between a
 * sheet's two entries from the router. Made later, the router heard of the move first, finished it in a microtask and
 * this listener no longer knew where the page had been: Back stayed on the page with the sheet still open.
 */
const firstPage: SheetHistory | null = typeof window === "undefined" ? null : createSheetHistory(window as unknown as SheetHistoryHost, () => sheets);

export function installAskBackGuard(router: Pick<Router, "beforeEach" | "afterEach" | "options">, sheet: AskSheet): () => void {
  let back = false;
  // on the first page of a visit Back is not a router move at all: the tap that opens the sheet gives it an entry of
  // the app to land on (sync, so it is still that tap), and the listener behind `firstPageHistory` closes the sheet
  sheets.add(sheet);
  const history = firstPage;
  const stopOpening = history
    ? watch(
        () => sheet.sheetOpen(),
        (open) => {
          if (open) history.pad();
        },
        { flush: "sync" },
      )
    : () => undefined;
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
  // a move another guard stopped never reached the guard above: it is over all the same
  const stopSettled = router.afterEach(() => {
    back = false;
    history?.noteMove();
  });
  return () => {
    stopListening();
    stopGuard();
    stopSettled();
    stopOpening();
    sheets.delete(sheet);
  };
}

/** The guard under the name the other sheets use it by. */
export const installSheetBackGuard = installAskBackGuard;
