// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sameSettings, slotsAlreadyWorn, wearsSameEchoes } from "./teamOptimizerSave";

/* eslint-disable @typescript-eslint/no-explicit-any */

const echo = (echoId: string, name = "FallacyOfNoReturn") => ({ echoId, echo: name, echoSet: "RejuvenatingGlow", type: 1 });
const loadout = ["m", "a", "b", "c", "d"].map((id) => echo(id));
const record = (): any => ({ echoes: Object.fromEntries(loadout.map((e, i) => [i, { echoId: e.echoId }])), mainEcho: { echo: "FallacyOfNoReturn", rank: 5, buffs: {} }, echoSetPassives: {}, teamBuffs: { buffs: { X: { isEnabled: true } } } });
const base = (over: Partial<Parameters<typeof slotsAlreadyWorn>[0]> = {}): Parameters<typeof slotsAlreadyWorn>[0] => ({
  picks: [{ slot: 0, characterId: "A", loadout }],
  teamBuffsBySlot: {},
  echoBuffsBySlot: [null],
  record,
  wornIds: () => ["m", "a", "b", "c", "d"],
  flat: { A: record() },
  total: async () => 100,
  ...over,
});

describe("what Optimize team's Save has to save", () => {
  it("the same echoes with the same main echo are worn already, in any order of the other four", () => {
    expect(wearsSameEchoes(loadout, ["m", "d", "c", "b", "a"])).toBe(true);
    expect(wearsSameEchoes(loadout, ["a", "m", "b", "c", "d"])).toBe(false); // another main echo
    expect(wearsSameEchoes(loadout, ["m", "a", "b", "c", "x"])).toBe(false);
    expect(wearsSameEchoes(loadout, ["m", "a", "b", "c"])).toBe(false);
  });

  it("reads settings alike whatever the key order, with a missing stack count as 0", () => {
    expect(sameSettings({ isEnabled: true, stacks: 0 }, { isEnabled: true })).toBe(true);
    expect(sameSettings({ b: 1, a: { y: null, x: 2 } }, { a: { x: 2 }, b: 1 })).toBe(true);
    expect(sameSettings({ isEnabled: true }, { isEnabled: false })).toBe(false);
    expect(sameSettings({ isEnabled: true, stacks: 2 }, { isEnabled: true })).toBe(false);
  });

  it("a pick of today's echoes is not saved; one new echo, another main echo or a changed panel is", async () => {
    expect(await slotsAlreadyWorn(base())).toEqual([0]);
    expect(await slotsAlreadyWorn(base({ wornIds: () => ["m", "a", "b", "c", "x"] }))).toEqual([]);
    expect(await slotsAlreadyWorn(base({ teamBuffsBySlot: { 0: { buffs: { X: { isEnabled: true } } } } }))).toEqual([0]);
    expect(await slotsAlreadyWorn(base({ teamBuffsBySlot: { 0: { buffs: { X: { isEnabled: false } } } } }))).toEqual([]);
    // a kept member has no loadout: saved only for a panel change
    expect(await slotsAlreadyWorn(base({ picks: [{ slot: 0, characterId: "A", loadout: null }] }))).toEqual([0]);
  });

  it("echo settings written differently count as today's only when the page reads the same with them", async () => {
    const echoBuffs = { echoSetPassives: {}, mainEchoBuffConfigs: { FallacyOfNoReturn: { Buff: { isEnabled: true } } } };
    const seen: any[] = [];
    const same = await slotsAlreadyWorn(base({ echoBuffsBySlot: [echoBuffs], total: async (records) => (seen.push(records.A.mainEcho.buffs), 100) }));
    expect(same).toEqual([0]);
    expect(seen).toEqual([{}, { Buff: { isEnabled: true } }]); // today's record, then the record with the pick's settings
    let call = 0;
    expect(await slotsAlreadyWorn(base({ echoBuffsBySlot: [echoBuffs], total: async () => (call++ ? 101 : 100) }))).toEqual([]);
  });
});
