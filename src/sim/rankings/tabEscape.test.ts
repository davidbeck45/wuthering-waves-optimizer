import { describe, expect, it } from "vitest";
import { leavesTabRing } from "./tabEscape";

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
