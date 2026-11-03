import { describe, expect, it } from "vitest";
import { dmg, int } from "./format";
import { displayDamage } from "../../utils/numbers";

describe("CLI number formats", () => {
  it("prints damage rounded up like the app, so a CLI table matches Teams and Stats & Damages digit for digit", () => {
    // the 2026-11-02 audit's cross-check: the CLI said 9,458,277 / 378,331 DPS, /teams 9,458,278 / 378,332
    expect(dmg(9_458_277.4)).toBe("9,458,278");
    expect(dmg(378_331.09)).toBe("378,332");
    expect(dmg(3_494.5)).toBe(displayDamage(3_494.5).toLocaleString("en-US"));
    expect(dmg(12_614)).toBe("12,614");
    expect(dmg(0)).toBe("0");
  });

  it("prints a dash for a missing figure, and counts stay rounded to the nearest", () => {
    expect(dmg(null)).toBe("-");
    expect(dmg(undefined)).toBe("-");
    expect(dmg(Number.NaN)).toBe("-");
    expect(int(2.4)).toBe("2");
    expect(int(1234.5)).toBe("1,235");
  });
});
