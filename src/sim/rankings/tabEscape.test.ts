import { describe, expect, it } from "vitest";
import { leavesTabRing, tabRingStep } from "./tabEscape";

const tab = { key: "Tab", shiftKey: false };
const back = { key: "Tab", shiftKey: true };

describe("leavesTabRing: the way out of Riley's filter-bar Tab ring", () => {
  it("lets Tab and Shift+Tab leave a search box with no bubbles (the trap the audit found)", () => {
    expect(leavesTabRing(tab, "search", ["search"], false)).toBe(true);
    expect(leavesTabRing(back, "search", ["search"], false)).toBe(true);
  });

  it("keeps Riley's ring between the search box and its bubbles", () => {
    const ring = ["search", "a", "b", "clear"];
    expect(leavesTabRing(tab, "search", ring, false)).toBe(false);
    expect(leavesTabRing(tab, "a", ring, false)).toBe(false);
    expect(leavesTabRing(back, "b", ring, false)).toBe(false);
    expect(leavesTabRing(back, "a", ring, false)).toBe(false);
  });

  it("lets Tab leave from the last bubble and Shift+Tab from the search box", () => {
    const ring = ["search", "a", "clear"];
    expect(leavesTabRing(tab, "clear", ring, false)).toBe(true);
    expect(leavesTabRing(back, "search", ring, false)).toBe(true);
    expect(leavesTabRing(back, "clear", ring, false)).toBe(false);
  });

  it("leaves Tab to Riley while the search box shows hits", () => {
    expect(leavesTabRing(tab, "search", ["search"], true)).toBe(false);
    expect(leavesTabRing(back, "search", ["search", "a"], true)).toBe(false);
  });

  it("ignores other keys, modified Tabs and targets outside the ring", () => {
    expect(leavesTabRing({ key: "ArrowDown", shiftKey: false }, "search", ["search"], false)).toBe(false);
    expect(leavesTabRing({ key: "Tab", shiftKey: false, ctrlKey: true }, "search", ["search"], false)).toBe(false);
    expect(leavesTabRing(tab, "checkbox", ["search"], false)).toBe(false);
    expect(leavesTabRing(tab, null, ["search"], false)).toBe(false);
    expect(leavesTabRing(tab, "search", [], false)).toBe(false);
  });
});

describe("tabRingStep: Tab over the ring as the player sees it", () => {
  it("leaves at the ends, so a ring of the search box alone (every bubble hidden) is no trap", () => {
    expect(tabRingStep(tab, "search", ["search"], false)).toBe("leave");
    expect(tabRingStep(back, "search", ["search", "a"], false)).toBe("leave");
    expect(tabRingStep(tab, "clear", ["search", "a", "clear"], false)).toBe("leave");
  });

  it("walks the shown bubbles one step at a time, both ways", () => {
    const ring = ["search", "a", "clear"];
    expect(tabRingStep(tab, "search", ring, false)).toBe("a");
    expect(tabRingStep(tab, "a", ring, false)).toBe("clear");
    expect(tabRingStep(back, "clear", ring, false)).toBe("a");
    expect(tabRingStep(back, "a", ring, false)).toBe("search");
  });

  it("leaves the press to Riley for his search hits, other keys and targets outside the ring", () => {
    expect(tabRingStep(tab, "search", ["search", "a"], true)).toBe(null);
    expect(tabRingStep({ key: "Enter", shiftKey: false }, "search", ["search"], false)).toBe(null);
    expect(tabRingStep({ key: "Tab", shiftKey: false, altKey: true }, "search", ["search"], false)).toBe(null);
    expect(tabRingStep(tab, "hidden", ["search"], false)).toBe(null);
    expect(tabRingStep(tab, null, ["search"], false)).toBe(null);
  });
});
