import { describe, expect, it } from "vitest";
import { goodTry } from "./transducerRank";
import { bestHeading, critErBoundText, jointErRows, chanceText, DEFAULT_VIEW, NO_GOOD_TRY, goodTryText, costOfKeep, extraOf, notWorthText, oneIn, readCharacters, rerollExtraKey, runQueue, unfinished, viewFromQuery, viewToQuery, withCost, withKeep } from "./transducerView";

const five = [1, 2, 3, 4, 5];

describe("transducerView", () => {
  it("adds nothing to the cache key for the Re-roll tab's own job", () => {
    expect(rerollExtraKey()).toBe("");
    expect(rerollExtraKey({})).toBe("");
    expect(rerollExtraKey({ canRepeat: true, keepUnknownEr: false })).toBe("");
    expect(rerollExtraKey({ canRepeat: false })).toBe("|norepeat");
    expect(rerollExtraKey({ canRepeat: false, keepUnknownEr: true })).toBe("|norepeat,keepEr");
    expect(extraOf(DEFAULT_VIEW)).toBeUndefined();
    expect(extraOf({ repeat: false, keepEr: false })).toEqual({ canRepeat: false });
    expect(extraOf({ repeat: true, keepEr: true })).toEqual({ keepUnknownEr: true });
  });

  it("costs a try by the game's rule", () => {
    expect([0, 1, 2, 3, 4].map(costOfKeep)).toEqual([1, 1, 1, 2, 3]);
  });

  it("reads a view from the address and writes back only what differs", () => {
    expect(viewFromQuery({})).toEqual(DEFAULT_VIEW);
    expect(viewToQuery(DEFAULT_VIEW)).toEqual({});
    const q = { character: "Zani", cost: "2", keep: "3", who: "everyone", sort: "chance", have: "7", repeat: "0", keepEr: "1" };
    const v = viewFromQuery(q);
    expect(v).toEqual({ character: "Zani", cost: 2, keep: 3, who: "everyone", sort: "chance", have: 7, repeat: false, keepEr: true });
    expect(viewToQuery(v)).toEqual(q);
    // nonsense falls back to the default
    expect(viewFromQuery({ cost: "9", keep: "x", sort: "nope", have: "0", who: "all" })).toEqual(DEFAULT_VIEW);
    expect(viewFromQuery({ have: "61" }).have).toBe(3);
    // a cost the lines kept cannot have: the lines kept win
    expect(viewFromQuery({ cost: "3", keep: "1" })).toMatchObject({ cost: null, keep: 1 });
  });

  it("clears the other filter when cost and lines kept cannot go together, and only then", () => {
    expect(withKeep({ ...DEFAULT_VIEW, cost: 1 }, 4)).toMatchObject({ keep: 4, cost: null });
    expect(withKeep({ ...DEFAULT_VIEW, cost: 1 }, 2)).toMatchObject({ keep: 2, cost: 1 });
    expect(withCost({ ...DEFAULT_VIEW, keep: 0 }, 3)).toMatchObject({ cost: 3, keep: null });
    expect(withCost({ ...DEFAULT_VIEW, keep: 3 }, 2)).toMatchObject({ cost: 2, keep: 3 });
    expect(withCost({ ...DEFAULT_VIEW, keep: 3 }, null)).toMatchObject({ cost: null, keep: 3 });
  });

  it("queues damage dealers first, biggest rotation first, five-line echoes only", () => {
    const characters = [
      { id: "Sup", base: 9e6, slots: [{ slot: 0, lines: five }] },
      { id: "Small", base: 1e5, slots: [{ slot: 0, lines: five }, null, { slot: 2, lines: [1, 2] }] },
      { id: "Big", base: 5e5, slots: [{ slot: 1, lines: five }, { slot: 3, lines: five }] },
    ];
    const queue = runQueue(characters, (id) => id !== "Sup");
    expect(queue).toEqual([
      { characterId: "Big", slot: 1 },
      { characterId: "Big", slot: 3 },
      { characterId: "Small", slot: 0 },
      { characterId: "Sup", slot: 0 },
    ]);
    expect(unfinished(characters)).toEqual([{ characterId: "Small", slot: 2, lines: 2 }]);
    const answered = new Set(["Big|1", "Big|3", "Small|0"]);
    expect([...readCharacters(queue, (i) => answered.has(`${i.characterId}|${i.slot}`))].sort()).toEqual(["Big", "Small"]);
    answered.delete("Big|3");
    expect([...readCharacters(queue, (i) => answered.has(`${i.characterId}|${i.slot}`))]).toEqual(["Small"]);
  });

  it("says in words why a row does not pay and how rare a result is", () => {
    expect(notWorthText({ pays: true, blocked: null, plan: null })).toBeNull();
    expect(notWorthText({ pays: false, blocked: "erFloor", plan: null })).toContain("Energy Regen the build needs");
    expect(notWorthText({ pays: false, blocked: null, plan: null })).toContain("under 0.05 %");
    expect(oneIn(0)).toBeNull();
    expect(oneIn(0.8)).toBe("almost every try");
    expect(oneIn(0.01)).toBe("1 try in 100");
    expect(oneIn(1 / 12345)).toBe("1 try in 12,345");
  });

  it("says in words when fewer than one try in ten beats the echo, never +0.00%", () => {
    // 8 % chance to improve: the tenth-best try is no better than the lines the echo has
    expect(goodTryText(goodTry({ pImprove: 0.08, p90: 0 }))).toBe(NO_GOOD_TRY);
    expect(goodTryText(goodTry({ pImprove: 0.08, p90: 0.0001 }))).toBe(NO_GOOD_TRY);
    expect(goodTryText(goodTry({ pImprove: 0.4, p90: 0.0336 }))).toBe("+3.36%");
    expect(goodTryText(goodTry({ pImprove: 0.4, p90: 0 }))).not.toContain("0.00");
  });

  it("never prints a chance that is not certain as 100 %, nor one that is not zero as 0 %", () => {
    // 12 tries at 61 %: 99.999 %
    expect(chanceText(1 - 0.39 ** 12)).toBe("over 99%");
    expect(chanceText(0.996)).toBe("over 99%");
    expect(chanceText(0.994)).toBe("99%");
    expect(chanceText(1)).toBe("100%");
    expect(chanceText(0.003)).toBe("under 1%");
    expect(chanceText(0)).toBe("0%");
    expect(chanceText(0.61)).toBe("61%");
  });

  it("flags rows of one resonator that each re-roll Energy Regen the build can lose alone but not together", () => {
    const er = (field: number, value: number) => ({ field, key: "EnergyRegen", value });
    const row = (characterId: string, slot: number, value: number, erHave: number | null, erNeed: number | null, pays = true) => ({
      key: `${characterId}|${slot}`,
      pays,
      plan: { rerolledFields: [2, 3] },
      advice: { characterId, erHave, erNeed, lines: [{ field: 1, key: "CritRate", value: 8.1 }, er(2, value)] },
    });
    // Lynae on David's account: 130.8 against 118.9, three 10 to 10.8 lines (each alone fine, together 100 %)
    const rows = [row("Lynae", 2, 10, 130.8, 118.9), row("Lynae", 3, 10.8, 130.8, 118.9), row("Lynae", 4, 10, 130.8, 118.9), row("Mornye", 0, 10, 287, 260), row("Mornye", 1, 10, 287, 260), row("Phrolova", 0, 10.8, null, null), row("Phrolova", 1, 10.8, null, null)];
    const flagged = jointErRows(rows);
    expect([...flagged.keys()].sort()).toEqual(["Lynae|2", "Lynae|3", "Lynae|4"]);
    expect(flagged.get("Lynae|3")).toBe(3);
    // one row alone, or a row that does not pay, is never flagged
    expect(jointErRows([row("Lynae", 2, 10, 130.8, 118.9), row("Lynae", 3, 10.8, 130.8, 118.9, false)]).size).toBe(0);
  });

  it("says how many echoes the crit check left out for Energy Regen, and why", () => {
    expect(critErBoundText(0)).toBeNull();
    expect(critErBoundText(1)).toBe("1 echo is left out: keeping exactly the crit lines there would re-roll Energy Regen the build needs, so the rule cannot be followed on it.");
    expect(critErBoundText(2)).toContain("2 echoes are left out");
  });

  it("says the best use may still change while echoes are being read", () => {
    expect(bestHeading(true, 12, 114)).toBe("Best use so far: 12 of 114 echoes read, it may still change");
    expect(bestHeading(false, 114, 114)).toBe("Best use of a Transducer");
    expect(bestHeading(true, 114, 114)).toBe("Best use of a Transducer");
  });
});
