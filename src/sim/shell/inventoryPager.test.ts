// Wuthering Tools+ — the inventory on a phone (inventoryPager.ts): where a page change scrolls the list to, and the
// Filters panel folded on a phone's first visit while the player has never toggled it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { INVENTORY_FILTER_PANEL, foldInventoryFiltersOnPhone, listTopTarget } from "./inventoryPager";

const settingsWith = (config: { filterPanelsOpen?: Record<string, boolean> } | null) => {
  const calls: Array<Record<string, unknown>> = [];
  return { config, calls, addToConfig: (data: Record<string, unknown>) => void calls.push(data) };
};
// jsdom has no matchMedia: stub one per test
const phone = (matches: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches, media: q }) as MediaQueryList);

afterEach(() => vi.unstubAllGlobals());

describe("the inventory pager on a phone", () => {
  it("lands the list's first echo just under the nav and the sticky pager", () => {
    // list top 1500 px below the viewport top, scrolled 2000, nav 72, pager 52 → 2000 + 1500 − 72 − 52 − 8
    expect(listTopTarget(1500, 2000, 72, 52)).toBe(3368);
    expect(listTopTarget(-4000, 1000, 72, 52)).toBe(0);
  });

  it("folds the Filters panel once on a phone, never over the player's own choice, never on a desktop", () => {
    phone(true);
    const fresh = settingsWith({});
    expect(foldInventoryFiltersOnPhone(fresh)).toBe(true);
    expect(fresh.calls).toEqual([{ filterPanelsOpen: { [INVENTORY_FILTER_PANEL]: false } }]);
    const chosen = settingsWith({ filterPanelsOpen: { [INVENTORY_FILTER_PANEL]: true } });
    expect(foldInventoryFiltersOnPhone(chosen)).toBe(false);
    expect(chosen.calls).toEqual([]);
    phone(false);
    const desk = settingsWith({});
    expect(foldInventoryFiltersOnPhone(desk)).toBe(false);
    expect(desk.calls).toEqual([]);
  });
});
