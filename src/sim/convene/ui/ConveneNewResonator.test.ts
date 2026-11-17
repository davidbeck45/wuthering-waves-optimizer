import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import type { ResonatorPickRow } from "../../weaponValue/selector";

// the engine side is the weapon page's selector (its own tests run Riley's engine): here it is a stub that records
// what the button asks for, so the test holds the question and what the page does with each kind of answer
const calls: Array<{ items: string[]; ranking: unknown }> = [];
let answer: () => Promise<ResonatorPickRow[]> = async () => [];
vi.mock("../../weaponValue/selector", () => ({
  rankResonatorPool: vi.fn(async (input: { items: string[]; ranking: unknown }, _riley: unknown, options: { onProgress?: (p: { done: number; total: number; label: string }) => void }) => {
    calls.push({ items: [...input.items], ranking: input.ranking });
    options.onProgress?.({ done: 3, total: 266, label: "your teams as they are" });
    return answer();
  }),
}));
vi.mock("../../weaponValue/selectorRiley", () => ({ browserSelectorRiley: vi.fn(async () => ({ commit: "test", account: { key: "a", entries: {}, builds: [], buildsKey: "" }, teams: [], blocked: [], solve: async () => [] })) }));

import ConveneNewResonator from "./ConveneNewResonator.vue";

const row = (over: Partial<ResonatorPickRow>): ResonatorPickRow => ({ key: "Lily", status: "new", setUp: false, sequence: null, dupe: null, uplift: null, newTeams: null, ran: null, note: null, ...over });
const mount = () => render(ConveneNewResonator, { props: { characterKey: "Lily", name: "Lily" }, global: { plugins: [createPinia()] } });

describe("ConveneNewResonator: the advisor's answer for a featured resonator the account lacks", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    calls.length = 0;
  });

  it("runs nothing until asked, then asks the selector about this one resonator and prints its verdict", async () => {
    answer = async () => [
      row({
        uplift: { gain: 0, mainDps: "Aemeath", with: { team: ["Lily", "Lynae", "Aemeath"], teamKey: "t273", dps: 317008 }, base: { team: ["Lupa", "Lynae", "Aemeath"], teamKey: "t279", dps: 371652 } },
        newTeams: { count: 36, best: null, top: [] },
        ran: { weapon: "Cadenza", refinement: 1, sequence: 0, approximated: true },
      }),
    ];
    const { container } = mount();
    const button = container.querySelector<HTMLButtonElement>("[data-test-convene-new-resonator-run]")!;
    expect(button.textContent?.trim()).toBe("Check Lily on my account");
    expect(calls).toEqual([]);
    expect(container.querySelector("[data-test-convene-new-resonator-verdict]")).toBeNull();

    await fireEvent.click(button);
    await waitFor(() => expect(container.querySelector("[data-test-convene-new-resonator-verdict]")).not.toBeNull());
    expect(calls).toEqual([{ items: ["Lily"], ranking: null }]);
    const verdict = container.querySelector("[data-test-convene-new-resonator-verdict]")!;
    expect(verdict.getAttribute("data-tone")).toBe("none");
    expect(verdict.textContent).toContain("Lily would not raise the best team of any main DPS you own.");
    expect(verdict.textContent).toContain("does 317,008 DPS with Lily");
    expect(verdict.textContent).toContain("does 371,652 DPS: 17.2% more");
    // every figure on the card has its unit and its engine named beside it
    expect(verdict.textContent).toContain("DPS is damage per second in his engine");
    expect(container.querySelector("[data-test-convene-new-resonator-run]")!.textContent?.trim()).toBe("Check Lily again");
  });

  it("says the engine failed, keeps the button, and shows no verdict from a run that did not finish", async () => {
    answer = async () => {
      throw new Error("the solver worker stopped");
    };
    const { container } = mount();
    await fireEvent.click(container.querySelector("[data-test-convene-new-resonator-run]")!);
    await waitFor(() => expect(container.querySelector("[data-test-convene-new-resonator-error]")).not.toBeNull());
    expect(container.querySelector("[data-test-convene-new-resonator-error]")!.textContent).toBe("wuwa_calc could not run Lily's teams: the solver worker stopped. Nothing was changed; try again.");
    expect(container.querySelector("[data-test-convene-new-resonator-verdict]")).toBeNull();
    // a second press runs again and the error goes once it works
    answer = async () => [row({ status: "no-teams" })];
    await fireEvent.click(container.querySelector("[data-test-convene-new-resonator-run]")!);
    await waitFor(() => expect(container.querySelector("[data-test-convene-new-resonator-verdict]")).not.toBeNull());
    expect(container.querySelector("[data-test-convene-new-resonator-error]")).toBeNull();
    expect(container.querySelector("[data-test-convene-new-resonator-verdict]")!.getAttribute("data-tone")).toBe("unknown");
  });

  it("shows how far the run is and stops when cancelled, without a verdict", async () => {
    let finish: (rows: ResonatorPickRow[]) => void = () => {};
    answer = () => new Promise<ResonatorPickRow[]>((resolve) => (finish = resolve));
    const { container } = mount();
    await fireEvent.click(container.querySelector("[data-test-convene-new-resonator-run]")!);
    await waitFor(() => expect(container.querySelector("[data-test-convene-new-resonator-busy]")?.textContent).toContain("3 of 266 teams"));
    expect(container.querySelector("[data-test-convene-new-resonator-run]")).toBeNull();
    await fireEvent.click(container.querySelector("[data-test-convene-new-resonator-cancel]")!);
    expect(container.querySelector("[data-test-convene-new-resonator-run]")).not.toBeNull();
    // the cancelled run's answer arrives late and is dropped
    finish([row({ status: "no-teams" })]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector("[data-test-convene-new-resonator-verdict]")).toBeNull();
    expect(container.querySelector("[data-test-convene-new-resonator-error]")).toBeNull();
  });
});
