// Wuthering Tools+ — Back closes a sheet on the first page of a visit too.
//
// The Back guard (askBackGuard.ts) cancels a router move. On the first page of a visit (a bookmark, a shared
// /rotation#chars= link, the page the site opened on) there is no router move to cancel: the entry behind is another
// document, so Back with the Ask sheet, /my-rankings' Options or /rotation's Play along open left the site, the lap
// with it (2026-11-16, second check of the Back fixes). The browser only hands Back to a page that has an entry of its
// own behind the current one, so one is made on the tap that opens the sheet, and only then:
//
//   B  the page as it was, marked as a base          <- Back from the pad lands here
//   P  the same address and the same router state    <- the page the player is on, sheet open
//
// Both entries are one route at one position to vue-router, so it is never told of a move between them: the listener
// here runs first (capture) and stops the event. Arriving on B from P means Back was pressed: with a sheet open it is
// closed and the page goes forward to P again; with none open the Back is passed on (`history.back()`), so leaving the
// site still takes one press. Any other move is the router's and is left alone. Where an entry of the app is behind
// already, nothing is added and the router guard does the work, as before.
import type { AskSheet } from "./askBackGuard";

/* eslint-disable no-unused-vars -- the parameters of interface methods and function types */
/** The part of `window` this needs (a fake one in the tests). */
export interface SheetHistoryHost {
  history: Pick<History, "state" | "pushState" | "replaceState" | "back" | "forward">;
  addEventListener(type: "popstate", listener: (e: PopStateEvent) => void, capture: boolean): void;
  removeEventListener(type: "popstate", listener: (e: PopStateEvent) => void, capture: boolean): void;
}
/* eslint-enable no-unused-vars */

/** on the entry Back lands on from a pad */
const BASE = "wtSheetBase";
/** on the entry added for a sheet */
const PAD = "wtSheetPad";

type EntryState = Record<string, unknown> & { back?: unknown; position?: unknown };

export interface SheetHistory {
  /** on the tap that opens a sheet: gives Back an entry of the app to land on, where there is none */
  pad(): void;
  /** after a router move (a push or a replace fires no popstate): the entry the next Back leaves from */
  noteMove(): void;
  stop(): void;
}

export function createSheetHistory(host: SheetHistoryHost, sheets: () => Iterable<AskSheet>): SheetHistory {
  const read = (): EntryState | null => {
    try {
      const state = host.history.state as EntryState | null;
      return state && typeof state === "object" ? state : null;
    } catch {
      return null;
    }
  };
  /** the state of the entry the page is on: what a pop is measured against */
  let prev = read();
  /** the next pop is this module going forward to the pad again */
  let restoring = false;

  function pad(): void {
    const state = read();
    // not the router's entry (no position), or an entry of the app is behind: Back is a router move, the guard's
    if (!state || typeof state.position !== "number" || state.back != null) return;
    if (state[PAD]) {
      prev = state; // on a pad already (a reload, a return from another page): its base is behind
      return;
    }
    try {
      host.history.replaceState({ ...state, [BASE]: true }, "");
      const padState: EntryState = { ...state, [PAD]: true };
      delete padState[BASE];
      host.history.pushState(padState, "");
      prev = padState;
    } catch {
      /* a browser that refuses: Back leaves the page, as it did */
    }
  }

  const onPop = (e: PopStateEvent): void => {
    const state = e.state && typeof e.state === "object" ? (e.state as EntryState) : null;
    const from = prev;
    prev = state;
    if (restoring) {
      restoring = false;
      e.stopImmediatePropagation();
      return;
    }
    // Back from a pad onto its base; every other move is the router's
    if (!from?.[PAD] || !state?.[BASE] || from.position !== state.position) return;
    e.stopImmediatePropagation();
    const open = [...sheets()].find((sheet) => sheet.sheetOpen());
    if (open) {
      open.close();
      restoring = true;
      host.history.forward();
    } else {
      host.history.back(); // nothing to close: the Back goes on its way, out of the site or to the page before
    }
  };
  host.addEventListener("popstate", onPop, true);

  return {
    pad,
    noteMove: () => {
      const now = read();
      // a replace keeps the page on the same entry (the rankings page rewrites its hash on every filter): a pad stays
      // a pad even when its new state no longer says so
      prev = now && prev?.[PAD] && now.position === prev.position && !now[BASE] ? { ...now, [PAD]: true } : now;
    },
    stop: () => host.removeEventListener("popstate", onPop, true),
  };
}
