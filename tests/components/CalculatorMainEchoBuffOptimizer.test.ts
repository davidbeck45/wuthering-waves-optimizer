import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { render } from "@testing-library/vue";
import CalculatorMainEchoBuff from "../../src/components/CalculatorMainEchoBuff.vue";
import { useCharacterStore } from "../../src/stores/character";

const buffProps = {
  character: "Carlotta",
  buffKey: "TestEchoBuff",
  details: "Glacio DMG +10%.",
  effects: [{ modifier: "Glacio", modifierValue: 10 }],
  storageMode: "optimizer" as const,
};

function renderBuff(props: Record<string, unknown>) {
  return render(CalculatorMainEchoBuff, {
    props: { ...buffProps, ...props },
    global: { directives: { tooltip: {} } },
  });
}

function isChecked(container: Element) {
  return container.querySelector<HTMLInputElement>(
    '[data-test-optimizer-main-echo-passive-enabled="TestEchoBuff"]',
  )!.checked;
}

describe("CalculatorMainEchoBuff in the v3 optimizer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCharacterStore().setCharacterData("Carlotta", {
      mainEcho: { echo: "EquippedEcho", buffs: { TestEchoBuff: { isEnabled: true } } },
    });
  });

  it("uses the calculator's setting for the calculator's equipped main echo", () => {
    const { container, getByText } = renderBuff({
      echoKey: "EquippedEcho",
      calculatorFallback: true,
    });
    expect(isChecked(container)).toBe(true);
    expect(getByText("On")).toBeTruthy();
    expect(getByText("From calculator")).toBeTruthy();
  });

  it("has nothing to start from for a different main echo", () => {
    const { container, getByText } = renderBuff({
      echoKey: "OtherEcho",
      calculatorFallback: true,
    });
    expect(isChecked(container)).toBe(false);
    expect(getByText("Not set")).toBeTruthy();
  });

  it("classic: ignores the calculator's setting", () => {
    const { container } = renderBuff({ echoKey: "EquippedEcho" });
    expect(isChecked(container)).toBe(false);
    expect(container.querySelector("[data-test-optimizer-buff-status]")).toBeNull();
  });
});
