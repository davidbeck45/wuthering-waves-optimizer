import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, costOfKeep, extraOf, notWorthText, oneIn, readCharacters, rerollExtraKey, runQueue, unfinished, viewFromQuery, viewToQuery, withCost, withKeep } from "./transducerView";

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
});
