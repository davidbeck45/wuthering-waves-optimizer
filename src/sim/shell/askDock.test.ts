import { describe, expect, it } from "vitest";
import { askInRail, dockAskInRail } from "./askDock";

describe("the Ask button's place (askDock)", () => {
  it("is in the rail while any rail item is mounted, and floats again once the last one goes", () => {
    expect(askInRail.value).toBe(false);
    const first = dockAskInRail();
    expect(askInRail.value).toBe(true);
    // the rail remounts on a navigation: the new item docks before the old one undocks
    const second = dockAskInRail();
    first();
    expect(askInRail.value).toBe(true);
    second();
    expect(askInRail.value).toBe(false);
  });

  it("ignores a second undock from the same item", () => {
    const a = dockAskInRail();
    const b = dockAskInRail();
    a();
    a();
    expect(askInRail.value).toBe(true);
    b();
    expect(askInRail.value).toBe(false);
  });
});

describe("docking the open panel", () => {
  it("docks only while open and expanded, from 1440 px", async () => {
    const { shouldDock, DOCK_MIN_WIDTH } = await import("./askDock");
    expect(DOCK_MIN_WIDTH).toBe(1440);
    expect(shouldDock({ open: true, collapsed: false }, 1920)).toBe(true);
    expect(shouldDock({ open: true, collapsed: false }, 1440)).toBe(true);
    expect(shouldDock({ open: true, collapsed: false }, 1439)).toBe(false);
    expect(shouldDock({ open: true, collapsed: true }, 1920)).toBe(false);
    expect(shouldDock({ open: false, collapsed: false }, 1920)).toBe(false);
  });
});
