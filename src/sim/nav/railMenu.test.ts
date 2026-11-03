import { describe, expect, it } from "vitest";
import { railMenuTop } from "./railMenu";

describe("railMenuTop", () => {
  it("lines the menu up with its rail item when it fits below it", () => {
    expect(railMenuTop(376, 400, 900)).toBe(376);
  });

  it("moves it up only as far as it must to fit the window (1440 × 900: the item at 376, the menu 632 tall)", () => {
    expect(railMenuTop(376, 632, 900)).toBe(256);
    expect(railMenuTop(376, 632, 1080)).toBe(376);
  });

  it("never goes above the margin, even when the menu is taller than the window", () => {
    expect(railMenuTop(376, 900, 700)).toBe(12);
    expect(railMenuTop(4, 100, 900)).toBe(12);
  });
});
