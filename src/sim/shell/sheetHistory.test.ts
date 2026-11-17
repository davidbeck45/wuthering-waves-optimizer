// Back with a sheet open on the first page of a visit: the page had no entry of its own behind it, so Back left the
// site (2026-11-16: /my-rankings opened from a bookmark, Options open, Back went to the page before the site; a
// /rotation#chars= link with Play along open went to about:blank). A browser history played by hand: entries, a
// position, popstate to a capturing listener first and then to "the router".
import { beforeEach, describe, expect, it } from "vitest";
import type { AskSheet } from "./askBackGuard";
import { createSheetHistory, type SheetHistory, type SheetHistoryHost } from "./sheetHistory";

type Listener = (e: PopStateEvent) => void;

function fakeBrowser(entries: Array<{ url: string; state: Record<string, unknown> | null }>, at: number) {
  let index = at;
  const capture: Listener[] = [];
  /** what vue-router's own popstate listener gets to see */
  const routerSaw: Array<Record<string, unknown> | null> = [];
  let left = false;
  const go = (delta: number): void => {
    const next = index + delta;
    if (next < 0 || next >= entries.length) return; // nothing there: a no-op, as in a browser
    index = next;
    if (entries[index]!.url !== "app") {
      left = true; // another document: no popstate, the page is gone
      return;
    }
    let stopped = false;
    const event = { state: entries[index]!.state, stopImmediatePropagation: () => (stopped = true) } as unknown as PopStateEvent;
    for (const l of [...capture]) if (!stopped) l(event);
    if (!stopped) routerSaw.push(entries[index]!.state);
  };
  const host: SheetHistoryHost = {
    history: {
      get state() {
        return entries[index]!.state;
      },
      pushState: (state: unknown) => {
        entries.splice(index + 1, entries.length, { url: "app", state: state as Record<string, unknown> });
        index += 1;
      },
      replaceState: (state: unknown) => {
        entries[index] = { url: "app", state: state as Record<string, unknown> };
      },
      back: () => go(-1),
      forward: () => go(1),
    },
    addEventListener: (_type, l) => void capture.push(l),
    removeEventListener: (_type, l) => void capture.splice(capture.indexOf(l), 1),
  };
  return { host, entries, routerSaw, back: () => go(-1), forward: () => go(1), index: () => index, left: () => left, listeners: () => capture.length };
}

/** the router's state for the first page of a visit, and for a page reached inside the app */
const first = { back: null, current: "/my-rankings", forward: null, position: 2, replaced: true, scroll: null };
const inApp = { back: "/account", current: "/my-rankings", forward: null, position: 3, replaced: false, scroll: null };

describe("Back with a sheet open on the first page of a visit", () => {
  let open = false;
  let closes = 0;
  const sheet: AskSheet = { sheetOpen: () => open, close: () => ((open = false), (closes += 1)) };
  let history: SheetHistory;
  const start = (browser: ReturnType<typeof fakeBrowser>): void => {
    history = createSheetHistory(browser.host, () => [sheet]);
  };
  beforeEach(() => {
    open = false;
    closes = 0;
  });

  it("closes the sheet and stays on the page, and the router is told of nothing", () => {
    const b = fakeBrowser([{ url: "elsewhere", state: null }, { url: "app", state: { ...first } }], 1);
    start(b);
    open = true;
    history.pad();
    expect(b.entries.map((e) => e.url)).toEqual(["elsewhere", "app", "app"]);
    b.back();
    expect(closes).toBe(1);
    expect(open).toBe(false);
    expect(b.left()).toBe(false);
    expect(b.index()).toBe(2); // on the page again
    expect(b.routerSaw).toEqual([]);
  });

  it("the next Back leaves in one press, as it would have", () => {
    const b = fakeBrowser([{ url: "elsewhere", state: null }, { url: "app", state: { ...first } }], 1);
    start(b);
    open = true;
    history.pad();
    b.back(); // closes the sheet
    b.back(); // nothing open
    expect(b.left()).toBe(true);
    expect(b.index()).toBe(0);
    expect(closes).toBe(1);
    expect(b.routerSaw).toEqual([]);
  });

  it("a sheet closed by its own button costs no extra Back", () => {
    const b = fakeBrowser([{ url: "elsewhere", state: null }, { url: "app", state: { ...first } }], 1);
    start(b);
    open = true;
    history.pad();
    open = false; // the X
    b.back();
    expect(b.left()).toBe(true);
    expect(closes).toBe(0);
  });

  it("adds nothing where an entry of the app is behind, or the entry is not the router's", () => {
    const reached = fakeBrowser([{ url: "app", state: { ...first, current: "/account" } }, { url: "app", state: { ...inApp } }], 1);
    start(reached);
    open = true;
    history.pad();
    expect(reached.entries).toHaveLength(2);
    // Back there is a router move: this listener lets it through
    reached.back();
    expect(reached.routerSaw).toHaveLength(1);
    expect(closes).toBe(0);

    const foreign = fakeBrowser([{ url: "app", state: null }], 0);
    start(foreign);
    history.pad();
    expect(foreign.entries).toHaveLength(1);
  });

  it("opening a second sheet, or the same one again, adds no second entry", () => {
    const b = fakeBrowser([{ url: "elsewhere", state: null }, { url: "app", state: { ...first } }], 1);
    start(b);
    open = true;
    history.pad();
    b.back(); // closed, on the pad
    open = true;
    history.pad();
    history.pad();
    expect(b.entries).toHaveLength(3);
    b.back();
    expect(closes).toBe(2);
    expect(b.index()).toBe(2);
  });

  it("after a move to another page and back, one Back still leaves", () => {
    const b = fakeBrowser([{ url: "elsewhere", state: null }, { url: "app", state: { ...first } }], 1);
    start(b);
    open = true;
    history.pad();
    open = false;
    // the router pushes /teams from the pad, then Back returns to it: both are its own moves
    b.host.history.pushState({ back: "/my-rankings", current: "/teams", forward: null, position: 3 }, "");
    history.noteMove();
    b.back();
    expect(b.routerSaw).toHaveLength(1); // the router handled that one
    history.noteMove();
    b.back();
    expect(b.left()).toBe(true);
    expect(b.routerSaw).toHaveLength(1);
  });

  it("a replace on the pad (the rankings page rewriting its filters into the address) keeps Back closing the sheet", () => {
    const b = fakeBrowser([{ url: "elsewhere", state: null }, { url: "app", state: { ...first } }], 1);
    start(b);
    open = true;
    history.pad();
    // the router replaces the entry it is on: same position, and its own state, which knows nothing of the pad
    b.host.history.replaceState({ ...first, current: "/my-rankings#tc=mine" }, "");
    history.noteMove();
    b.back();
    expect(closes).toBe(1);
    expect(b.index()).toBe(2);
    expect(b.routerSaw).toEqual([]);
  });

  it("a tab with nothing behind the page: Back stays, and the sheet can be opened and closed by Back again", () => {
    const b = fakeBrowser([{ url: "app", state: { ...first } }], 0);
    start(b);
    open = true;
    history.pad();
    b.back();
    expect(closes).toBe(1);
    b.back(); // nothing open, nothing behind: the page stays where it is, on its base
    expect(b.left()).toBe(false);
    expect(b.index()).toBe(0);
    open = true;
    history.pad();
    expect(b.entries).toHaveLength(2);
    b.back();
    expect(closes).toBe(2);
    expect(b.index()).toBe(1);
  });

  it("stop() takes the listener off", () => {
    const b = fakeBrowser([{ url: "app", state: { ...first } }], 0);
    start(b);
    expect(b.listeners()).toBe(1);
    history.stop();
    expect(b.listeners()).toBe(0);
  });
});
