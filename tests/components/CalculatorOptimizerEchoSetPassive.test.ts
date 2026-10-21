import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { render, fireEvent } from "@testing-library/vue";
import CalculatorOptimizerEchoSetPassive from "../../src/components/CalculatorOptimizerEchoSetPassive.vue";
import { useCharacterStore } from "../../src/stores/character";

// FrostyResolve 5pc's stacking passive (src/echoes/sets.ts).
const passiveKey = "FrostyResolve5Set5SetSkillDMGBonus";
const passiveProps = {
  character: "Carlotta",
  passiveKey,
  details: "Resonance Skill DMG +18%, stacks up to 2 times.",
  hasStacks: true,
  minStacks: 0,
  maxStacks: 2,
  modifiers: [{ modifier: "ResonanceSkillDMGBonus", modifierValue: 18 }],
};

function seed(data: Record<string, unknown>) {
  useCharacterStore().setCharacterData("Carlotta", data);
}

function renderPassive(calculatorFallback: boolean) {
  return render(CalculatorOptimizerEchoSetPassive, {
    props: { ...passiveProps, calculatorFallback },
    global: { directives: { tooltip: {} } },
  });
}

function lastEmittedStats(emitted: Record<string, unknown[][]>) {
  const events = emitted["updated-optimizer-echo-passive-stats"];
  return (events[events.length - 1][0] as { stats: Record<string, unknown> }).stats;
}

describe("CalculatorOptimizerEchoSetPassive", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("classic: ignores the calculator's setting and shows no status", () => {
    seed({ echoSetPassives: { [passiveKey]: { isEnabled: true, stacks: 2 } } });
    const { container, emitted } = renderPassive(false);

    const checkbox = container.querySelector<HTMLInputElement>(
      `[data-test-echo-set-passive-enabled="${passiveKey}"]`,
    )!;
    expect(checkbox.checked).toBe(false);
    expect(container.querySelector("[data-test-optimizer-buff-status]")).toBeNull();
    expect(lastEmittedStats(emitted())).toEqual({});
  });

  it("v3: follows the calculator's setting and sends its stats to the optimizer", () => {
    seed({ echoSetPassives: { [passiveKey]: { isEnabled: true, stacks: 2 } } });
    const { container, getByText, emitted } = renderPassive(true);

    const checkbox = container.querySelector<HTMLInputElement>(
      `[data-test-echo-set-passive-enabled="${passiveKey}"]`,
    )!;
    expect(checkbox.checked).toBe(true);
    expect(getByText("On · 2 stacks")).toBeTruthy();
    expect(getByText("From calculator")).toBeTruthy();
    expect(lastEmittedStats(emitted())).toEqual({ ResonanceSkillDMGBonus: 36 });
  });

  it("v3: flags a passive with no setting anywhere", () => {
    const { container, getByText } = renderPassive(true);
    expect(getByText("Not set")).toBeTruthy();
    expect(
      container.querySelector(`[data-test-echo-set-passive="${passiveKey}"]`)!.className,
    ).toContain("border-warning");
  });

  it("v3: changing it saves the whole setting, and 'Use calculator setting' goes back", async () => {
    seed({ echoSetPassives: { [passiveKey]: { isEnabled: true, stacks: 2 } } });
    const store = useCharacterStore();
    const { container, getByText, queryByText, emitted } = renderPassive(true);

    const checkbox = container.querySelector<HTMLInputElement>(
      `[data-test-echo-set-passive-enabled="${passiveKey}"]`,
    )!;
    await fireEvent.click(checkbox);

    // Stacks are kept with the override, so reticking restores 2 stacks.
    expect(store.characters.Carlotta.optimizer.echoSetPassives[passiveKey]).toEqual({
      isEnabled: false,
      stacks: 2,
    });
    expect(getByText("Off")).toBeTruthy();
    expect(queryByText("From calculator")).toBeNull();
    expect(lastEmittedStats(emitted())).toEqual({});

    await fireEvent.click(getByText("Use calculator setting"));

    expect(store.characters.Carlotta.optimizer.echoSetPassives[passiveKey]).toBeUndefined();
    expect(getByText("On · 2 stacks")).toBeTruthy();
    expect(getByText("From calculator")).toBeTruthy();
    expect(lastEmittedStats(emitted())).toEqual({ ResonanceSkillDMGBonus: 36 });
  });
});
