// Wuthering Tools+ — the hook in Ryan's inventory list: a plus sort stands aside for his ranked lists. Neither case
// reaches the Echo Lab layer, so no stores are needed (the sort and the filter themselves: inventoryQuality.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { plusInventoryView, setInventorySort } from "./useInventoryQuality";

describe("plusInventoryView", () => {
  const list = [{ echoId: "b" }, { echoId: "a" }];
  afterEach(() => setInventorySort("default"));

  it("hands his list back untouched with Inventory order and the filter off", () => {
    expect(plusInventoryView(list)).toBe(list);
  });

  it("leaves his ranked list alone under a plus sort (Finish these first, Duplicates)", () => {
    setInventorySort("best-rolls");
    expect(plusInventoryView(list, true)).toBe(list);
    setInventorySort("feed-first");
    expect(plusInventoryView(list, true)).toBe(list);
  });
});
