import { describe, expect, it } from "vitest";
import {
  buildOptimizerBuffBulkUpdate,
  getCalculatorMainEchoBuffEntry,
  getMainEchoBuffEntry,
  needsAttention,
  resolveOptimizerBuff,
  type OptimizerBuffItem,
  type ResolveOptimizerBuffInput,
} from "../../src/calculator/optimizerBuffStatus";

function resolve(overrides: Partial<ResolveOptimizerBuffInput>) {
  return resolveOptimizerBuff({
    optimizerEntry: undefined,
    calculatorEntry: undefined,
    hasStacks: false,
    alwaysEnabled: false,
    calculatorFallback: true,
    ...overrides,
  });
}

describe("resolveOptimizerBuff", () => {
  it("is unset and off when nothing is saved anywhere", () => {
    expect(resolve({})).toEqual({
      source: "none",
      isEnabled: false,
      stacks: 0,
      status: "unset",
      canUseCalculatorSetting: false,
    });
  });

  it("follows the calculator when the optimizer has no setting", () => {
    const result = resolve({
      calculatorEntry: { isEnabled: true, stacks: 2 },
      hasStacks: true,
    });
    expect(result).toMatchObject({ source: "calculator", isEnabled: true, stacks: 2, status: "on" });
    expect(result.canUseCalculatorSetting).toBe(false);
  });

  it("prefers the optimizer's own setting over the calculator's", () => {
    const result = resolve({
      optimizerEntry: { isEnabled: false },
      calculatorEntry: { isEnabled: true },
    });
    expect(result).toMatchObject({ source: "optimizer", isEnabled: false, status: "off" });
  });

  it("ignores the calculator without calculatorFallback (classic)", () => {
    const result = resolve({
      calculatorEntry: { isEnabled: true },
      calculatorFallback: false,
    });
    expect(result).toMatchObject({ source: "none", isEnabled: false, status: "unset" });
    expect(
      resolve({
        optimizerEntry: { isEnabled: true },
        calculatorEntry: { isEnabled: false },
        calculatorFallback: false,
      }).canUseCalculatorSetting,
    ).toBe(false);
  });

  it("flags an enabled stacking buff at 0 stacks", () => {
    expect(resolve({ optimizerEntry: { isEnabled: true }, hasStacks: true }).status).toBe(
      "zero-stacks",
    );
    expect(
      resolve({ calculatorEntry: { isEnabled: true, stacks: 0 }, hasStacks: true }).status,
    ).toBe("zero-stacks");
  });

  it("ignores stacks for a non-stacking buff", () => {
    expect(resolve({ optimizerEntry: { isEnabled: true }, hasStacks: false }).status).toBe("on");
  });

  it("treats always-enabled buffs as on and never needing attention", () => {
    const result = resolve({ alwaysEnabled: true });
    expect(result).toMatchObject({ isEnabled: true, status: "always" });
    expect(needsAttention(result.status)).toBe(false);
  });

  it("offers 'Use calculator setting' only when the optimizer setting differs", () => {
    expect(
      resolve({
        optimizerEntry: { isEnabled: false },
        calculatorEntry: { isEnabled: true },
      }).canUseCalculatorSetting,
    ).toBe(true);
    expect(
      resolve({
        optimizerEntry: { isEnabled: true, stacks: 1 },
        calculatorEntry: { isEnabled: true, stacks: 2 },
        hasStacks: true,
      }).canUseCalculatorSetting,
    ).toBe(true);
    expect(
      resolve({
        optimizerEntry: { isEnabled: true, stacks: 2 },
        calculatorEntry: { isEnabled: true, stacks: 2 },
        hasStacks: true,
      }).canUseCalculatorSetting,
    ).toBe(false);
    // Stacks don't matter for a non-stacking buff.
    expect(
      resolve({
        optimizerEntry: { isEnabled: true, stacks: 1 },
        calculatorEntry: { isEnabled: true },
      }).canUseCalculatorSetting,
    ).toBe(false);
    // Nothing in the calculator to go back to.
    expect(resolve({ optimizerEntry: { isEnabled: false } }).canUseCalculatorSetting).toBe(false);
  });
});

describe("needsAttention", () => {
  it("warns only for unset and zero-stack buffs", () => {
    expect(needsAttention("unset")).toBe(true);
    expect(needsAttention("zero-stacks")).toBe(true);
    expect(needsAttention("on")).toBe(false);
    expect(needsAttention("off")).toBe(false);
    expect(needsAttention("always")).toBe(false);
  });
});

describe("getMainEchoBuffEntry", () => {
  it("reads one buff from the per-buff map", () => {
    const state = { buffs: { a: { isEnabled: true, stacks: 3 }, b: { isEnabled: false } } };
    expect(getMainEchoBuffEntry(state, "a")).toEqual({ isEnabled: true, stacks: 3 });
    expect(getMainEchoBuffEntry(state, "c")).toBeUndefined();
  });

  it("applies the legacy single setting to every buff", () => {
    expect(getMainEchoBuffEntry({ isEnabled: true, stacks: 2 }, "any")).toEqual({
      isEnabled: true,
      stacks: 2,
    });
  });

  it("is undefined when nothing is saved", () => {
    expect(getMainEchoBuffEntry(undefined, "a")).toBeUndefined();
    expect(getMainEchoBuffEntry({ echo: "X", rank: 5 }, "a")).toBeUndefined();
    expect(getMainEchoBuffEntry({ buffs: {} }, "a")).toBeUndefined();
  });
});

describe("getCalculatorMainEchoBuffEntry", () => {
  const mainEcho = { echo: "Lorelei", buffs: { buff1: { isEnabled: true } } };

  it("uses the calculator's setting for its equipped main echo", () => {
    expect(getCalculatorMainEchoBuffEntry(mainEcho, "Lorelei", "buff1")).toEqual({
      isEnabled: true,
    });
  });

  it("has nothing for a main echo the calculator doesn't have equipped", () => {
    expect(getCalculatorMainEchoBuffEntry(mainEcho, "Hecate", "buff1")).toBeUndefined();
    expect(getCalculatorMainEchoBuffEntry(undefined, "Lorelei", "buff1")).toBeUndefined();
  });
});

describe("buildOptimizerBuffBulkUpdate", () => {
  const items: OptimizerBuffItem[] = [
    {
      kind: "setPassive",
      key: "SetStacking",
      hasStacks: true,
      maxStacks: 2,
      alwaysEnabled: false,
      resolved: resolve({ calculatorEntry: { isEnabled: true, stacks: 1 }, hasStacks: true }),
    },
    {
      kind: "setPassive",
      key: "SetAlways",
      hasStacks: false,
      maxStacks: 0,
      alwaysEnabled: true,
      resolved: resolve({ alwaysEnabled: true }),
    },
    {
      kind: "mainEcho",
      key: "EchoFlat",
      echoKey: "Lorelei",
      hasStacks: false,
      maxStacks: 0,
      alwaysEnabled: false,
      resolved: resolve({}),
    },
    {
      kind: "mainEcho",
      key: "EchoStacking",
      echoKey: "Lorelei",
      hasStacks: true,
      maxStacks: 4,
      alwaysEnabled: false,
      resolved: resolve({ hasStacks: true }),
    },
  ];

  it("Enable all turns optional buffs on and keeps their stacks", () => {
    expect(buildOptimizerBuffBulkUpdate(items, "enable")).toEqual({
      echoSetPassives: { SetStacking: { isEnabled: true, stacks: 1 } },
      mainEchoBuffs: {
        Lorelei: {
          buffs: {
            EchoFlat: { isEnabled: true },
            EchoStacking: { isEnabled: true, stacks: 0 },
          },
        },
      },
    });
  });

  it("Max all also sets stacking buffs to their max", () => {
    expect(buildOptimizerBuffBulkUpdate(items, "max")).toEqual({
      echoSetPassives: { SetStacking: { isEnabled: true, stacks: 2 } },
      mainEchoBuffs: {
        Lorelei: {
          buffs: {
            EchoFlat: { isEnabled: true },
            EchoStacking: { isEnabled: true, stacks: 4 },
          },
        },
      },
    });
  });

  it("is empty when there are only always-enabled buffs", () => {
    expect(buildOptimizerBuffBulkUpdate([items[1]], "max")).toEqual({});
  });
});
