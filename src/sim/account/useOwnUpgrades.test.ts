// Wuthering Tools+ — "Check my echoes" keeps only a check that stands for the data as it is now and that fully scored
// (2026-11-08 hunt F1, F5). The real stores and cache; the check itself is canned, since what is under test is what the
// page does around it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useInventoryStore } from "../../stores/inventory";
import type { EchoCheck } from "./echoCheck";
import { checkOwnEchoes } from "./echoCheck";
import { clearEchoCheckMemory, ECHO_CHECK_CACHE_KEY } from "./echoCheckCache";
import type { RosterRanking } from "../myRankings/rankRoster";
import type { useAccountData } from "./useAccountData";
import { useOwnUpgrades, type EchoCheckStatus } from "./useOwnUpgrades";
import AccountOwnUpgrades from "./AccountOwnUpgrades.vue";

const lost = vi.hoisted(() => ({ value: false }));
vi.mock("../persist/savedResults", async (original) => ({ ...(await original<typeof import("../persist/savedResults")>()), lostChunk: () => lost.value }));
vi.mock("./echoCheck", () => ({ checkOwnEchoes: vi.fn() }));
vi.mock("../buildTeam/workerBackend", () => ({ workerBackend: () => ({ dispose() {} }) }));
vi.mock("../engine/rileyClient", () => ({ rileyClient: () => ({}) }));
vi.mock("../engine/rileyAccount", () => ({ rileyAccountOf: () => ({}) }));
vi.mock("../energy/useEnergyNeeds", async () => {
  const { ref } = await import("vue");
  return { useEnergyNeeds: () => ({ activate() {}, release() {}, savedTeams: ref([]), checkedTeams: ref([]), busy: ref(false) }) };
});

const ranking = (computedAt: string): RosterRanking => ({ enemy: {} as RosterRanking["enemy"], characters: [], teams: [], teamsSkipped: 0, computedAt }) as RosterRanking;
const check = (gain: number): EchoCheck =>
  ({ items: [{ id: "Aemeath:echoes", characterId: "Aemeath", gain }], best: [], skipped: [], errors: [], done: 1, total: 1, cancelled: false, computedAt: "2026-11-08T22:00:00.000Z" }) as unknown as EchoCheck;

/** /account's data as the hook reads it: the ranking and the fingerprint it was scored for */
function accountData() {
  const fp = ref("fp-r5");
  const data = { ranking: shallowRef<RosterRanking | null>(ranking("r5")), rankingFingerprint: () => fp.value, characters: ref({}), teams: ref([]) };
  return { fp, data: data as unknown as ReturnType<typeof useAccountData> & typeof data };
}

function page(data: ReturnType<typeof useAccountData>) {
  let own!: ReturnType<typeof useOwnUpgrades>;
  const wrapper = mount(defineComponent({ setup: () => ((own = useOwnUpgrades(data)), () => h("div")) }));
  return { own, wrapper };
}

/** a check that ends when told to */
function heldCheck(out: EchoCheck): () => void {
  let finish: () => void = () => undefined;
  vi.mocked(checkOwnEchoes).mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve(out))));
  return () => finish();
}
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe("Check my echoes", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
    clearEchoCheckMemory();
    lost.value = false;
    useInventoryStore().echoes = [];
    vi.mocked(checkOwnEchoes).mockReset();
  });
  afterEach(() => clearEchoCheckMemory());

  it("is kept for the tab when it fully scored: a reload shows it again", async () => {
    const { data } = accountData();
    vi.mocked(checkOwnEchoes).mockResolvedValueOnce(check(0.026));
    const { own, wrapper } = page(data);
    await own.checkEchoes();
    expect(own.status.value.state).toBe("done");
    expect(own.status.value.partial).toBeFalsy();
    wrapper.unmount();
    clearEchoCheckMemory(); // a reload: memory gone, sessionStorage kept
    const again = page(data);
    expect(again.own.status.value).toMatchObject({ state: "done", restored: true });
    expect(again.own.check.value?.items[0]?.gain).toBe(0.026);
  });

  it("run in a page load that lost a chunk is shown as not fully scored and never kept: a reload repeated it as whole (F1)", async () => {
    const { data } = accountData();
    lost.value = true; // a weapon chunk failed: it scores as no weapon, with no error
    vi.mocked(checkOwnEchoes).mockResolvedValueOnce(check(0.007));
    const { own, wrapper } = page(data);
    await own.checkEchoes();
    expect(own.check.value?.items[0]?.gain).toBe(0.007); // shown on this page
    expect(sessionStorage.getItem(ECHO_CHECK_CACHE_KEY)).toBeNull();
    wrapper.unmount();
    clearEchoCheckMemory();
    lost.value = false; // the reload has its chunks back
    const again = page(data);
    expect(again.own.check.value).toBeNull();
    expect(again.own.status.value.state).toBe("idle");
    // and the page said so
    const shown = page(data);
    lost.value = true;
    vi.mocked(checkOwnEchoes).mockResolvedValueOnce(check(0.007));
    await shown.own.checkEchoes();
    expect(shown.own.status.value).toMatchObject({ state: "done", partial: true });
  });

  it("leaves a whole check of the same data alone when a later one comes up short", async () => {
    const { data } = accountData();
    vi.mocked(checkOwnEchoes).mockResolvedValueOnce(check(-0.012)).mockResolvedValueOnce(check(0.007));
    const { own } = page(data);
    await own.checkEchoes();
    lost.value = true;
    await own.checkEchoes();
    clearEchoCheckMemory();
    const again = page(data);
    expect(again.own.check.value?.items[0]?.gain).toBe(-0.012);
  });

  it("finishing after another tab's edit is not shown as current under the moved hero, nor kept (F5)", async () => {
    const { fp, data } = accountData();
    const finish = heldCheck(check(-0.012)); // the R5 check
    const { own } = page(data);
    const running = own.checkEchoes();
    await settle();
    expect(own.status.value.state).toBe("running");
    // another tab takes Aemeath's weapon to R1: the ranking moves under the running check
    fp.value = "fp-r1";
    data.ranking.value = ranking("r1");
    await nextTick();
    expect(own.status.value.state).toBe("running");
    const whileRunning = own.status.value.moved;
    finish();
    await running;
    expect(own.check.value).toBeNull(); // its rows are the old data's
    expect(own.status.value.state).toBe("idle");
    expect(sessionStorage.getItem(ECHO_CHECK_CACHE_KEY)).toBeNull();
    expect(whileRunning).toBe(true); // said while it ran
    expect(own.status.value.moved).toBe(true); // and once it ended
    // Check again reads the data as it is now
    vi.mocked(checkOwnEchoes).mockResolvedValueOnce(check(-0.005));
    await own.checkEchoes();
    expect(own.status.value.state).toBe("done");
    expect(own.status.value.moved).toBe(false);
    expect(own.check.value?.items[0]?.gain).toBe(-0.005);
  });

  it("shows the check this tab holds for the data it moved to, when there is one", async () => {
    const { fp, data } = accountData();
    vi.mocked(checkOwnEchoes).mockResolvedValueOnce(check(-0.005)); // a check on R1, earlier in this tab
    fp.value = "fp-r1";
    data.ranking.value = ranking("r1");
    const { own } = page(data);
    await own.checkEchoes();
    fp.value = "fp-r5";
    data.ranking.value = ranking("r5");
    await nextTick();
    const finish = heldCheck(check(-0.012));
    const running = own.checkEchoes(); // on R5
    await settle();
    fp.value = "fp-r1"; // back to R1 while it runs
    data.ranking.value = ranking("r1");
    await nextTick();
    finish();
    await running;
    expect(own.check.value?.items[0]?.gain).toBe(-0.005);
    expect(own.status.value).toMatchObject({ state: "done", restored: true });
  });

  it("is no change of data when the edit is undone before it ends", async () => {
    const { fp, data } = accountData();
    const finish = heldCheck(check(-0.012));
    const { own } = page(data);
    const running = own.checkEchoes();
    await settle();
    fp.value = "fp-r1";
    data.ranking.value = null; // re-scoring
    await nextTick();
    const whileRescoring = own.status.value.moved;
    fp.value = "fp-r5";
    data.ranking.value = ranking("r5");
    await nextTick();
    expect(own.status.value.moved).toBeFalsy();
    finish();
    await running;
    expect(own.status.value.state).toBe("done");
    expect(own.check.value?.items[0]?.gain).toBe(-0.012);
    expect(whileRescoring).toBe(true);
  });
});

describe("the panel", () => {
  const status = (over: Partial<EchoCheckStatus>): EchoCheckStatus => ({ state: "done", done: 1, total: 1, label: "", restored: false, cancelled: false, computedAt: null, error: null, left: null, partial: false, moved: false, ...over });
  const panel = (over: Partial<EchoCheckStatus>, c: EchoCheck | null = check(0.007)) =>
    mount(AccountOwnUpgrades, { props: { rows: [], status: status(over), check: c, rankingReady: true, investBy: "team" }, global: { stubs: { RouterLink: true } } });

  it("says a check that did not fully score stays on this page", () => {
    expect(panel({}).find("[data-test-account-own-partial]").exists()).toBe(false);
    const note = panel({ partial: true }).find("[data-test-account-own-partial]");
    expect(note.text()).toMatch(/Not everything loaded on this visit/);
    expect(note.text()).toMatch(/reload/);
  });

  it("says why a check that ended on older data shows no rows, and that a running one reads older data", () => {
    expect(panel({ state: "idle", moved: true }, null).find("[data-test-account-own-moved]").text()).toMatch(/from before a change made while it ran/);
    expect(panel({ state: "running", moved: true }, null).find("[data-test-account-own-moved]").text()).toMatch(/Check again when it ends/);
    expect(panel({ state: "running" }, null).find("[data-test-account-own-moved]").exists()).toBe(false);
  });
});
