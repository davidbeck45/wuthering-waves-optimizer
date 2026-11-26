// Wuthering Tools+ Echo Lab: the re-roll advisor's chips on a card with no plan worth Transducers. Every line reads
// Keep there, and a line the build's Energy Regen need holds up must still say why: only the plain Keep chip dropped
// the ER mark the Lock chip carries. No real engine: the card reads its advice through `useEchoLab`, stubbed here.
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { BestOwnerResult, LabCharacterSummary, LabSlotSummary } from "./bestOwner";
import EchoLabReroll from "./EchoLabReroll.vue";
import type { RerollAdviceResult } from "./rerollAdvice";

const advice = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("./useEchoLab", () => ({
  useEchoLab: () => ({ rerollOf: () => advice.result, runReroll: async () => undefined, checkBenchmarks: async () => undefined }),
}));

const KEYS = ["EnergyRegen", "CritRate", "CritDMG", "ATKPercent", "HeavyAttackDMGBonus"];
const slot: LabSlotSummary = { slot: 0, echoId: "e1", echo: "Hecate", set: null, cost: 4, main: "CritRate", rank: 1, lines: KEYS.map((key) => ({ key, value: 8.6 })), fromInventory: true };
const character = { id: "Mornye", name: "Mornye", rotationName: "Loop", rotationSource: "team", base: 1_000_000, complete: true, totalCost: 12, upgrades: 0, bestUpgrade: null, perPoint: {}, slots: [slot, null, null, null, null] } as LabCharacterSummary;
const result = { fingerprint: "f", characters: [character], skipped: [], echoes: [], counts: {}, scorings: 0, ms: 0 } as unknown as BestOwnerResult;

function adviceWith(floorField: number | null, need: number | null = floorField === null ? null : 260): RerollAdviceResult {
  return {
    characterId: "Mornye",
    name: "Mornye",
    slot: 0,
    echoId: "e1",
    echo: "Hecate",
    base: 1_000_000,
    lines: KEYS.map((key, field) => ({ key, value: 8.6, field, worth: 0.01, freshWorth: 0.001, delta: -0.009, rank: field + 1, advice: "lock", ...(field === floorField ? { erFloor: true } : {}) })),
    plans: [],
    recommended: null, // no re-roll pays: every chip reads Keep
    lockCostNote: "",
    assumptions: [],
    scorings: 0,
    erNeed: need,
    erHave: need === null ? null : 268,
  } as unknown as RerollAdviceResult;
}

async function chips(floorField: number | null, need?: number | null) {
  advice.result = need === undefined ? adviceWith(floorField) : adviceWith(floorField, need);
  const view = mount(EchoLabReroll, { props: { result, benchmarks: null, character: "Mornye" }, global: { stubs: { EchoLabEcho: true, EchoLabPopover: true } } });
  await nextTick();
  return view;
}

describe("re-roll advisor: a Keep chip on the line an ER need holds up", () => {
  it("keeps the ER mark and says the build needs the line", async () => {
    const view = await chips(0);
    const rows = view.findAll('[data-test-echo-lab-reroll-line="keep"]');
    expect(rows).toHaveLength(5);
    const floor = view.find("[data-test-echo-lab-reroll-er-floor] .el-chip");
    expect(floor.text()).toBe("KeepER");
    expect(floor.attributes("aria-label")).toBe("Keep: the build needs this Energy Regen");
    expect(floor.attributes("title")).toBe("Keep: without this line the build falls under its Energy Regen need");
    // the other four lines stay plain Keep chips
    expect(view.findAll("[data-test-echo-lab-reroll-er-floor]")).toHaveLength(1);
    const plain = rows.map((r) => r.find(".el-chip")).filter((c) => c.text() === "Keep");
    expect(plain).toHaveLength(4);
    for (const c of plain) expect(c.attributes("aria-label")).toBe("Keep: no re-roll pays on this echo");
    view.unmount();
  });

  it("says the app knows no need when the line is kept for a resonator in no saved team", async () => {
    // the advice keeps the line (keepUnknownEr) but carries no need: "the build needs this" would be a claim nobody measured
    const view = await chips(0, null);
    const floor = view.find("[data-test-echo-lab-reroll-er-floor] .el-chip");
    expect(floor.text()).toBe("KeepER");
    expect(floor.attributes("aria-label")).toBe("Keep: Energy Regen is kept, the app knows no need for this resonator");
    expect(floor.attributes("title")).toMatch(/knows no Energy Regen need for this resonator \(in no saved team\)/);
    const note = view.find("[data-test-echo-lab-reroll-er-note]").text();
    expect(note).toMatch(/^Keep ER 8\.6%: the app knows no Energy Regen need for Mornye \(in no saved team\)/);
    expect(note).toMatch(/Save the team you play them in/);
    expect(note).not.toMatch(/the build needs/);
    view.unmount();
  });

  it("marks nothing when no line holds an ER need up", async () => {
    const view = await chips(null);
    expect(view.findAll('[data-test-echo-lab-reroll-line="keep"]')).toHaveLength(5);
    expect(view.find("[data-test-echo-lab-reroll-er-floor]").exists()).toBe(false);
    expect(view.text()).not.toContain("KeepER");
    view.unmount();
  });
});
