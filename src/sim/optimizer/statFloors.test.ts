// @vitest-environment node
import { describe, expect, it } from "vitest";
import { appliedStatFloors, isStatFloor } from "./statFloors";

describe("appliedStatFloors", () => {
  it("drops a row with no stat picked, and keeps the saved list as it was", () => {
    const saved = [{ id: "373ytdazci", stat: null, minValue: null }];
    expect(appliedStatFloors(saved)).toEqual([]);
    expect(saved).toEqual([{ id: "373ytdazci", stat: null, minValue: null }]);
  });

  it("keeps a filled row beside a blank one, in order", () => {
    const rows = [
      { id: "a", stat: "energyRegen", minValue: 125 },
      { id: "b", stat: null, minValue: 40 },
      { id: "c", stat: "", minValue: 40 },
      { id: "d", stat: "totalCritRate", minValue: "70" },
      { id: "e", stat: "totalAtk", minValue: null },
      { id: "f", stat: "totalAtk", minValue: "" },
      { id: "g", stat: "totalAtk", minValue: 0 },
    ];
    expect(appliedStatFloors(rows).map((row) => row.id)).toEqual(["a", "d", "g"]);
  });

  it("reads a list that is not one as no floors", () => {
    expect(appliedStatFloors(null)).toEqual([]);
    expect(appliedStatFloors(undefined)).toEqual([]);
    expect(appliedStatFloors("energyRegen" as unknown as unknown[])).toEqual([]);
    expect(isStatFloor(null)).toBe(false);
    expect(isStatFloor({ stat: "totalAtk", minValue: "abc" })).toBe(false);
  });
});
