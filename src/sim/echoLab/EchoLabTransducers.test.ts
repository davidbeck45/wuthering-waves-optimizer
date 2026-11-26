// Wuthering Tools+ Echo Lab: the Transducers tab when one echo's advice fails. The row names the echo and why, and the
// rest of the ranking stands, the resonator's other echo included. No engine: `useEchoLab` is stubbed here.
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { BestOwnerResult, LabCharacterSummary, LabSlotSummary } from "./bestOwner";
import EchoLabTransducers from "./EchoLabTransducers.vue";
import type { LockPlan, RerollAdviceResult } from "./rerollAdvice";
import { DEFAULT_VIEW } from "./transducerView";

const answers = vi.hoisted(() => new Map<string, unknown>());
const runs = vi.hoisted(() => ({ n: 0 }));
vi.mock("./useEchoLab", () => ({
  useEchoLab: () => ({
    rerollOf: (id: string, slot: number) => answers.get(`${id}|${slot}`) ?? null,
    runReroll: async () => {
      runs.n += 1;
    },
  }),
}));

const KEYS = ["CritRate", "CritDMG", "ATKPercent", "DEF", "HP"];
const slotOf = (slot: number, echo: string): LabSlotSummary =>
  ({ slot, echoId: `e${slot}`, echo, set: null, cost: 1, main: "CritRate", rank: 1, lines: KEYS.map((key) => ({ key, value: 8.1 })), fromInventory: false }) as LabSlotSummary;
const character = { id: "Phrolova", name: "Phrolova", rotationName: "Loop", rotationSource: "team", base: 1_000_000, complete: true, totalCost: 12, upgrades: 0, bestUpgrade: null, perPoint: {}, slots: [slotOf(0, "Hecate"), slotOf(1, "Tambourinist"), null, null, null] } as LabCharacterSummary;
const result = { fingerprint: "f", characters: [character], skipped: [], echoes: [], counts: {}, scorings: 0, ms: 0 } as unknown as BestOwnerResult;

const plan = (locks: number): LockPlan => ({
  locks,
  lockedFields: [0, 1, 2, 3].slice(0, locks),
  rerolledFields: [0, 1, 2, 3, 4].slice(locks),
  cost: locks <= 2 ? 1 : locks - 1,
  method: "counted",
  pImprove: 0.5,
  expectedGain: 0.01,
  expectedChange: 0,
  gainPerTransducer: 0.01 / (locks <= 2 ? 1 : locks - 1),
  transducersPerSuccess: 2,
  p10: -0.01,
  p50: 0,
  p90: 0.02,
  bestOf: Array.from({ length: 60 }, (_, i) => 0.01 * (1 + Math.log(i + 1))),
  top: { gain: 0.05, lines: [{ key: "CritDMG", value: 21 }], chance: 1e-4 },
});
const advice: RerollAdviceResult = {
  characterId: "Phrolova",
  name: "Phrolova",
  slot: 1,
  echoId: "e1",
  echo: "Tambourinist",
  base: 1_000_000,
  lines: KEYS.map((key, field) => ({ key, value: 8.1, field, worth: 0.01, freshWorth: 0.001, delta: 0, rank: field + 1, advice: "lock" })),
  plans: [4, 3, 2, 1, 0].map(plan),
  recommended: plan(2),
  allPlans: [plan(2)],
  lockCostNote: "",
  assumptions: [],
  scorings: 0,
  erNeed: null,
  erHave: null,
} as unknown as RerollAdviceResult;

vi.mock("vue-router", () => ({ useRouter: () => ({ replace: () => undefined }), useRoute: () => ({ query: {} }) }));

describe("Transducers tab: an echo whose advice fails", () => {
  it("names the echo and why, and ranks the resonator's other echo", async () => {
    answers.clear();
    answers.set("Phrolova|0", { error: "the worker stopped" });
    answers.set("Phrolova|1", advice);
    const view = mount(EchoLabTransducers, { props: { result, view: { ...DEFAULT_VIEW, who: "everyone" } }, global: { stubs: { EchoLabPopover: true } } });
    await nextTick();
    await nextTick();
    const failed = view.find("[data-test-tdx-failed]");
    expect(failed.exists()).toBe(true);
    expect(failed.text()).toContain("Hecate could not be read: the worker stopped");
    expect(view.findAll("[data-test-tdx-row]").map((r) => r.attributes("data-test-tdx-row"))).toEqual(["Phrolova|1"]);
    expect(view.find("[data-test-tdx-best]").attributes("data-key")).toBe("Phrolova|1");
    view.unmount();
  });

  it("asks again for an echo that failed when the tab is opened again", async () => {
    answers.clear();
    answers.set("Phrolova|0", { error: "the worker stopped" });
    answers.set("Phrolova|1", advice);
    runs.n = 0;
    const view = mount(EchoLabTransducers, { props: { result, view: { ...DEFAULT_VIEW, who: "everyone" } }, global: { stubs: { EchoLabPopover: true } } });
    await nextTick();
    await nextTick();
    expect(runs.n, "the failed echo is asked again").toBeGreaterThanOrEqual(1);
    view.unmount();
  });
});
