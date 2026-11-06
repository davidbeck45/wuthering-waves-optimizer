// Wuthering Tools+ — /my-rankings when an option moves during a run. The palette's team-buff switch is not disabled
// while scoring (the toolbar's is): flipped off and on again, the run for "off" ended under the switch reading "on" and
// its numbers stood as Live (2026-11-05 hunt, M1). And a ranking that did not fully score says so on the page (H1).
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { clearRankingMemory } from "./rankingCache";
import MyRankingsView from "./MyRankingsView.vue";
import type { RosterRanking } from "./rankRoster";

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
const h = vi.hoisted(() => ({ runs: [] as Array<{ auto: boolean; finish: (r: unknown) => void }> }));
vi.mock("./rankRoster", async (real) => ({
  ...(await real<typeof import("./rankRoster")>()),
  rankRoster: (_c: unknown, _e: unknown, _t: unknown, options: { autoTeamBuffs: boolean }) => new Promise((finish) => h.runs.push({ auto: options.autoTeamBuffs, finish })),
}));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }) }));
vi.mock("../../composables/useDocumentTitle", () => ({ useDocumentTitle: () => undefined }));
vi.mock("../energy/EnergySummaryTile.vue", () => ({ default: { template: "<i></i>" } }));

const ranking = (tag: string, over: Partial<RosterRanking> = {}): RosterRanking =>
  ({ enemy: { enemyLevel: 100, enemyResist: 0.2 }, characters: [{ id: tag, errors: [], rotationsEvaluated: 1 }], teams: [], teamsSkipped: 0, computedAt: "2026-11-05T00:00:00.000Z", ...over }) as unknown as RosterRanking;

async function openPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { useCharacterStore } = await import("../../stores/character");
  const store = useCharacterStore();
  store.characters = { Aemeath: { weapon: "EverbrightPolestar" } } as never;
  const view = mount(MyRankingsView, {
    global: { plugins: [pinia], stubs: { Nav: true, RouterLink: true, MyRankingsInfo: true, MyRankingsToolbar: true, MyRankingsCharacters: { props: ["ranks"], template: `<ul><li v-for="r in ranks" data-row>{{ r.id }}</li></ul>` }, MyRankingsTeams: true, MyRankingsEmpty: true } },
  });
  await flushPromises();
  return { view, rows: () => view.findAll("[data-row]").map((r) => r.text()) };
}

beforeEach(() => {
  h.runs.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  clearRankingMemory();
  autoTeamBuffs.value = true;
});
afterEach(() => {
  autoTeamBuffs.value = true;
  clearRankingMemory();
});

describe("/my-rankings", () => {
  it("drops a run whose switch moved back meanwhile: the numbers on screen are the ones the switch reads", async () => {
    const page = await openPage();
    h.runs[0]!.finish(ranking("on"));
    await flushPromises();
    expect(page.rows()).toEqual(["on"]);

    autoTeamBuffs.value = false; // the palette: a run for "off" starts
    await flushPromises();
    expect(h.runs.at(-1)!.auto).toBe(false);
    autoTeamBuffs.value = true; // and back, while it scores: the cache holds "on"
    await flushPromises();
    h.runs.at(-1)!.finish(ranking("off"));
    await flushPromises();
    await nextTick();
    expect(page.rows()).not.toContain("off");

    // the old run took the one memory slot, and nothing is saved here (no IndexedDB): "on" scores again
    expect(h.runs.at(-1)!.auto).toBe(true);
    h.runs.at(-1)!.finish(ranking("on"));
    await flushPromises();
    expect(page.rows()).toEqual(["on"]);
    expect(page.view.find("[data-test-my-rankings-status]").attributes("data-status")).toBe("live");
    page.view.unmount();
  }, 30_000);

  it("says on the page when a ranking did not fully score, and that it is not kept", async () => {
    const page = await openPage();
    h.runs[0]!.finish(ranking("half", { incomplete: true }));
    await flushPromises();
    expect(page.view.find("[data-test-my-rankings-partial]").text()).toContain("This stays on this page only");
    expect(page.view.find("[data-test-my-rankings-status]").text()).toContain("Partial");
    expect(page.view.find("[data-test-my-rankings-status]").text()).toContain("this visit only");
    page.view.unmount();
  }, 30_000);

  it("reads Live with no note for a whole ranking", async () => {
    const page = await openPage();
    await flushPromises();
    h.runs[0]!.finish(ranking("whole"));
    await flushPromises();
    expect(page.view.find("[data-test-my-rankings-partial]").exists()).toBe(false);
    expect(page.view.find("[data-test-my-rankings-status]").text()).toContain("Live");
    page.view.unmount();
  }, 30_000);
});
