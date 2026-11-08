// Wuthering Tools+ — the hook in Ryan's inventory list: a plus sort stands aside for his ranked lists. Neither case
// reaches the Echo Lab layer, so no stores are needed (the sort and the filter themselves: inventoryQuality.test.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { accountAdoptions } from "../storage/crossTabSync";
import { plusInventoryView, setInventorySort, useInventoryQuality } from "./useInventoryQuality";

// the Echo Lab layer, faked: what is under test is when /inventory asks it to judge again
const lab = vi.hoisted(() => ({ refresh: vi.fn(async () => undefined) }));
vi.mock("../echoLab/useEchoLab", async () => {
  const { reactive, ref } = await import("vue");
  const fake = {
    pass: ref(null),
    passStatus: reactive({ running: false, error: null, cancelled: false }),
    builtCount: ref(3),
    qualityOf: () => undefined,
    ratingOf: () => undefined,
    snapshot: () => ({ account: { echoes: [] }, fingerprint: "fp" }),
    runRollRatings: async () => true,
    refresh: lab.refresh,
  };
  return { useEchoLab: () => fake };
});

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

describe("the inventory's verdicts", () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("are judged again when this tab adopts another tab's edit: a weapon changed in Settings left 71 feed where the page says 66 (2026-11-08 hunt F3)", async () => {
    setActivePinia(createPinia());
    const q = useInventoryQuality();
    const leave = q.activate();
    await nextTick();
    lab.refresh.mockClear();
    accountAdoptions.value += 1; // Settings in another tab took Aemeath's Everbright Polestar from R5 to R1
    await nextTick();
    await vi.waitFor(() => expect(lab.refresh).toHaveBeenCalledTimes(1), { timeout: 1500 });
    leave();

    // and not while the page is closed: the next visit judges on arrival
    lab.refresh.mockClear();
    accountAdoptions.value += 1;
    await nextTick();
    await wait(700);
    expect(lab.refresh).not.toHaveBeenCalled();
  }, 10_000);
});
