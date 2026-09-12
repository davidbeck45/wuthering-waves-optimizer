// Wuthering Tools+: the TypeScript cast mapper must reproduce the validated
// Python mapper (wuwa-tools/rotation-port) on Riley's executed loops.
import { describe, expect, it } from "vitest";
import loops from "./__fixtures__/wuwaCalcLoops.json";
import { getCharByName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { OVERRIDES, appRowsOf, echoRowsOf, emptyReport, knownRatios, mvOf, ratio, toActions, type Cast } from "./castMapper";

describe("cast mapper: primitives", () => {
  it("sums level-10 talent expressions into motion values", () => {
    expect(mvOf("37.88%*4+117.83%*3")).toBe(505.01);
    expect(mvOf("105.97%*2")).toBe(211.94);
    expect(mvOf("20.00%+100")).toBe(20);
    expect(mvOf("abc")).toBeNull();
    expect(mvOf(null)).toBeNull();
  });
  it("matches Python's difflib ratio on simple cases", () => {
    expect(ratio("abcd", "abcd")).toBe(1);
    expect(ratio("abcd", "bcde")).toBeCloseTo(0.75, 5);
    expect(ratio("", "x")).toBe(0);
  });
});

describe("cast mapper: Riley's loops replayed", () => {
  it("reproduces the Python mapper's actions for every fixture loop", async () => {
    const echoRows = echoRowsOf(mainEchoesData as never);
    const rowsByKey = new Map<string, ReturnType<typeof appRowsOf>>();
    const castsByResonator = new Map<string, Cast[]>();
    for (const loop of loops) castsByResonator.set(loop.resonator, [...(castsByResonator.get(loop.resonator) ?? []), ...(loop.casts as Cast[])]);
    let checked = 0;
    for (const loop of loops) {
      if (!rowsByKey.has(loop.appKey)) rowsByKey.set(loop.appKey, appRowsOf((await getCharByName(loop.appKey)) as Record<string, unknown>));
      const rows = rowsByKey.get(loop.appKey)!;
      const overrides = OVERRIDES[loop.resonator] ?? {};
      // kit multipliers: recomputed over the fixture's loops must match Python on the same loops …
      const ratios = knownRatios(castsByResonator.get(loop.resonator)!, rows, overrides);
      expect([...ratios].sort((a, b) => a - b), `${loop.resonator} ratios`).toEqual(loop.ratiosTop3);
      // … and the actions are mapped with the pooled set Python used (every loop of the character)
      const report = emptyReport();
      const actions = toActions(loop.casts as Cast[], rows, echoRows, overrides, report, new Set(loop.ratiosPooled));
      const got = actions.map((a) => [a.key, a.type, a.count, a.mainEcho ?? null]);
      expect(got, `${loop.resonator} loop ${checked}`).toEqual(loop.expected);
      expect(report.unmatched, `${loop.resonator} unmatched`).toEqual(loop.unmatched);
      checked += 1;
    }
    expect(checked).toBe(loops.length);
  });
});
