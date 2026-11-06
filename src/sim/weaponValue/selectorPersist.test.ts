// Wuthering Tools+ — /weapons' selector on a ranking that did not fully score: like the value run beside it, its rows
// stay on this page. A saved pick built on holes would repeat in every new tab (2026-11-05 hunt, H2 / S21).
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savedResults } from "../persist/savedResults";
import type { RosterRanking } from "../myRankings/rankRoster";
import { POOLS } from "./pools";
import SelectorChooser from "./SelectorChooser.vue";
import { SELECTOR_CACHE_KEY } from "./valueCache";

vi.mock("./selector", async (real) => ({
  ...(await real<typeof import("./selector")>()),
  rankResonatorPool: async () => [],
}));
vi.mock("./selectorRiley", async (real) => ({
  ...(await real<Record<string, unknown>>()),
  browserSelectorRiley: async () => ({}),
}));

const ranking = (over: Partial<RosterRanking> = {}) => ({ enemy: {}, characters: [], teams: [], teamsSkipped: 0, computedAt: "2026-11-05T00:00:00.000Z", ...over }) as unknown as RosterRanking;

async function run(base: RosterRanking) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const view = mount(SelectorChooser, { props: { pool: POOLS.pools.find((p) => p.kind === "resonator")!.id, value: null, ranking: base, fingerprint: "fp", running: false, owned: [] }, global: { plugins: [pinia], stubs: { RouterLink: true } } });
  await flushPromises();
  await view.find("[data-test-weapons-selector-run]").trigger("click");
  await flushPromises();
  view.unmount();
}

describe("the selector's rows", () => {
  let write: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sessionStorage.clear();
    write = vi.spyOn(savedResults, "write").mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("are saved on a whole ranking", async () => {
    await run(ranking());
    expect(write).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SELECTOR_CACHE_KEY)).not.toBeNull();
  }, 30_000);

  it("stay on this page on a ranking that did not fully score", async () => {
    await run(ranking({ incomplete: true }));
    expect(write).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SELECTOR_CACHE_KEY)).toBeNull();
  }, 30_000);
});
