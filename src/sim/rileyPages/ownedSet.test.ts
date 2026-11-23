import { describe, expect, it } from "vitest";
import { accountOwnedSet, decideOwned, ownedLine, RARITY_FREE_S6, rosterOf } from "./ownedSet";
import { rankingsTargetOf } from "./links";
import { RARITY } from "../rankings/rileyNames";

const LIMITED = 0;
const FREE_S2 = 2;
const FREE_S0 = 3;
const roster = [
  { name: "Carlotta", rarity: LIMITED },
  { name: "Verina", rarity: LIMITED },
  { name: "Jianxin", rarity: FREE_S2 },
  { name: "Encore", rarity: FREE_S0 },
  { name: "Sanhua", rarity: RARITY_FREE_S6 },
  { name: "Havoc Rover", rarity: RARITY_FREE_S6 },
  { name: "Shorekeeper", rarity: LIMITED },
];
const own = (...names: string[]) => Object.fromEntries(names.map((n) => [n, { owned: true }]));

describe("the account's set (Roster value)", () => {
  it("is what the account owns plus the 4-stars and Rover forms his engine counts as everyone's", () => {
    expect(accountOwnedSet(roster, { ...own("Carlotta"), Shorekeeper: { owned: false } }))
      .toEqual(["Carlotta", "Havoc Rover", "Sanhua"]);
  });
  it("ticks his free 5-stars and Verina only when the account has them", () => {
    expect(accountOwnedSet(roster, own("Carlotta", "Encore", "Verina"))).toEqual(["Carlotta", "Encore", "Havoc Rover", "Sanhua", "Verina"]);
    expect(accountOwnedSet(roster, own("Carlotta"))).not.toContain("Jianxin");
  });
  it("is null with nothing set up, so his default stands", () => {
    expect(accountOwnedSet(roster, {})).toBeNull();
    expect(accountOwnedSet(roster, { Carlotta: { owned: false } })).toBeNull();
  });
  it("reads FreeS6 as the number his engine gives it", () => {
    expect(RARITY_FREE_S6).toBe(RARITY.FreeS6);
  });
  it("reads his roster off his teams", () => {
    const m = (name: string, tier: number) => ({ name, loadout: { resonator: { tier } } });
    expect(rosterOf({ t1: [m("Carlotta", 0), m("Sanhua", 1)], t2: [m("Sanhua", 1), m("Verina", 0)] }))
      .toEqual([{ name: "Carlotta", rarity: 0 }, { name: "Sanhua", rarity: 1 }, { name: "Verina", rarity: 0 }]);
  });
});

describe("who decides the ticks", () => {
  const A = ["Carlotta", "Havoc Rover", "Sanhua"];
  it("first open: writes the account's set", () => {
    const d = decideOwned(A, null, null);
    expect(d.write).toEqual(A);
    expect(d.source).toMatchObject({ kind: "account", added: [], removed: [] });
  });
  it("follows the account while the ticks are still what plus wrote, and says what moved", () => {
    const next = ["Carlotta", "Havoc Rover", "Sanhua", "Shorekeeper"];
    const d = decideOwned(next, A, A);
    expect(d.write).toEqual(next);
    expect(d.source).toMatchObject({ kind: "account", added: ["Shorekeeper"], removed: [] });
    expect(ownedLine(d.source, 4)).toBe("Ticked from your account: 4 resonators (your account changed: added Shorekeeper). Change a tick to try a pull.");
  });
  it("keeps ticks changed by hand, and says how many differ", () => {
    const mine = ["Carlotta", "Havoc Rover", "Sanhua", "Phoebe"];
    const d = decideOwned(["Carlotta", "Havoc Rover", "Sanhua", "Shorekeeper"], mine, A);
    expect(d.write).toBeNull();
    expect(d.source).toEqual({ kind: "hand", owned: mine, differ: 2 });
    expect(ownedLine(d.source, 4)).toBe("Your own ticks: 4 resonators, 2 different from your account.");
  });
  it("ticks saved before plus wrote any (a backup, his own page) are the player's", () => {
    expect(decideOwned(A, ["Carlotta"], null).write).toBeNull();
    // …unless they are the account's set already
    expect(decideOwned(A, [...A].reverse(), null).source.kind).toBe("account");
  });
  it("leaves his key alone with no account", () => {
    expect(decideOwned(null, ["Carlotta"], null)).toEqual({ source: { kind: "none" }, write: null });
    expect(ownedLine({ kind: "none" }, 9)).toMatch(/^Riley's default roster is ticked/);
  });
  it("after his Reset Account (key removed) the next open is the account's again", () => {
    expect(decideOwned(A, null, A).write).toEqual(A);
  });
});

describe("his relative links inside the app", () => {
  it("send a team or his comparison page to /rankings", () => {
    expect(rankingsTargetOf("./team#tc=s6r5&t=abc")).toBe("/rankings#tc=s6r5&t=abc");
    expect(rankingsTargetOf("./#tc=r1")).toBe("/rankings#tc=r1");
    expect(rankingsTargetOf("./")).toBe("/rankings");
    expect(rankingsTargetOf("https://github.com/x")).toBeNull();
    expect(rankingsTargetOf("./images/a.webp")).toBeNull();
  });
});
