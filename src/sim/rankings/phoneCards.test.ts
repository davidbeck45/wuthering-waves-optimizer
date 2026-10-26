// Wuthering Tools+: /rankings on a phone (the card list) and the detail page's member strip — the pure part.
import { describe, expect, it } from "vitest";
import { compareScale } from "./compareColumn";
import {
  buildStatus,
  cardMemberOf,
  initialsOf,
  investmentToken,
  mainFirst,
  ownByRileyName,
  ownStatus,
  rankToken,
  tableOrder,
  teamCards,
  type ComboLike,
  type MemberLike,
  type RunRowLike,
} from "./phoneCards";

const LIMITED = 0;
const STANDARD = 1;
const FREE = 2;
const member = (name: string, mainDps = false, tier = LIMITED, mode?: string): MemberLike => ({
  name,
  color: "#888888",
  mainDps,
  loadout: { resonator: { tier }, mode: mode ? { name: mode } : null },
});
const combo = (sequence: number, weapon: string, refinement = 1, weaponTier = LIMITED, extra: Partial<ComboLike> = {}): ComboLike => ({
  key: `0.0.0.s${sequence}.r${refinement - 1}`,
  sequence,
  weapon: { name: `${weapon} R${refinement}`, refinement, tier: weaponTier },
  ...extra,
});
// his rows list the supports first: index 0 is Slot 3, the main DPS sits in Slot 1
const run = (teamKey: string, damage: number, seconds: number, combos?: ComboLike[], sectionSeconds = [25, 25.4, 26.2]): RunRowLike => ({
  teamKey,
  members: [member("Shorekeeper"), member("Suoming"), member("Hsin", true, LIMITED, "Resonance Mode - Unison")],
  combo: combos ?? [combo(0, "Variation", 1, STANDARD), combo(0, "Unspoken Rue"), combo(0, "Blooming Jadehaven")],
  sectionTotals: [damage, damage, damage, damage],
  seconds,
  sectionSeconds,
});

describe("investment tokens (his table's rankToken)", () => {
  it("reads a standard or 4★ weapon at R1 as R0 (no signature), a signature or any higher rank as itself", () => {
    expect(rankToken(1, false)).toBe("R0");
    expect(rankToken(1, true)).toBe("R1");
    expect(rankToken(5, false)).toBe("R5");
    // a compared refine reads its rank whatever the weapon
    expect(rankToken(1, false, true)).toBe("R1");
    expect(investmentToken(6, 1, true)).toBe("S6R1");
    expect(investmentToken(0, 1, false)).toBe("S0R0");
  });
});

describe("members", () => {
  it("numbers his slots from the end, labels a Resonance Mode by its last word, and keeps the weapon without its rank", () => {
    const r = run("t0", 1000, 100);
    const m = r.members.map((x, j) => cardMemberOf(x, r.combo[j]!, j, r.members.length));
    expect(m.map((x) => x.slot)).toEqual([3, 2, 1]);
    expect(m[2]).toMatchObject({ name: "Hsin", label: "Hsin (Unison)", appKey: "Hsin", mainDps: true, token: "S0R1", weapon: "Blooming Jadehaven", limitedWeapon: true });
    expect(m[0]).toMatchObject({ token: "S0R0", limitedWeapon: false, free: false, subs: "" });
    const rover = cardMemberOf(member("Aero Rover", false, FREE), combo(6, "Bloodpact's Pledge", 1, LIMITED, { highSubs: true }), 0, 3);
    expect(rover).toMatchObject({ appKey: "RoverAeroFemale", free: true, subs: "h", token: "S6R1" });
    expect(cardMemberOf(member("Lupa"), combo(3, "Wildfire Mark", 1, LIMITED, { mySubs: true, highSubs: true }), 0, 3).subs).toBe("u");
  });

  it("puts the main DPS first, then the rest from Slot 1's side (his rows are support-first)", () => {
    const at = (name: string, slot: number, mainDps = false) => ({ name, slot, mainDps });
    expect(mainFirst([at("Mornye", 3), at("Lynae", 2), at("Aemeath", 1, true)]).map((m) => m.name)).toEqual(["Aemeath", "Lynae", "Mornye"]);
    expect(mainFirst([at("A", 3), at("B", 2, true), at("C", 1)]).map((m) => m.name)).toEqual(["B", "C", "A"]);
    // a dual-DPS team keeps both mains ahead, in slot order
    expect(mainFirst([at("A", 3), at("B", 2, true), at("C", 1, true)]).map((m) => m.name)).toEqual(["C", "B", "A"]);
  });
});

describe("table order", () => {
  it("is best first with one row per team, and leaves out a row with no run yet", () => {
    const runs: Record<string, RunRowLike> = { a: run("t0", 1000, 100), b: run("t1", 3000, 100), c: run("t2", 2000, 100) };
    const ordered = tableOrder([{ key: "a" }, { key: "b" }, { key: "c" }, { key: "gone" }], (k) => runs[k], "dpr");
    expect(ordered.map((o) => o.key)).toEqual(["b", "c", "a"]);
    expect(ordered[0]!.figure).toBe(3000);
  });

  it("nests a compare's rows inside their team, the team standing where its best row would", () => {
    // t0 at S0 and S2 (a sequence compare), t1 in between: t0's S0 row stays with its own team
    const s0 = run("t0", 1000, 100);
    const s2 = run("t0", 3000, 100, [combo(0, "Variation", 1, STANDARD), combo(0, "Unspoken Rue"), { ...combo(2, "Blooming Jadehaven"), key: "0.0.0.s2.r0" }]);
    const other = run("t1", 2000, 100);
    const runs: Record<string, RunRowLike> = { s0, s2, other };
    expect(tableOrder([{ key: "s0" }, { key: "other" }, { key: "s2" }], (k) => runs[k], "dpr").map((o) => o.key)).toEqual(["s2", "s0", "other"]);
  });

  it("ranks by DPS over the run's seconds in DPS mode", () => {
    const runs: Record<string, RunRowLike> = { slow: run("t0", 1000, 400), fast: run("t1", 900, 100) };
    expect(tableOrder([{ key: "slow" }, { key: "fast" }], (k) => runs[k], "dpr").map((o) => o.key)).toEqual(["slow", "fast"]);
    const dps = tableOrder([{ key: "slow" }, { key: "fast" }], (k) => runs[k], "dps");
    expect(dps.map((o) => o.key)).toEqual(["fast", "slow"]);
    expect(dps[0]!.figure).toBe(36); // 3,600 damage over 100 s
  });

  it("stands the rows the player pinned (his pinnedRows, hash pin=) above the rest, best first among themselves", () => {
    const runs: Record<string, RunRowLike> = { a: run("t0", 3000, 100), b: run("t1", 1000, 100), c: run("t2", 2000, 100), d: run("t3", 500, 100) };
    const pinned = new Set(["b", "d"]);
    const ordered = tableOrder([{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }], (k) => runs[k], "dpr", (k) => pinned.has(k));
    expect(ordered.map((o) => [o.key, !!o.pinned])).toEqual([["b", true], ["d", true], ["a", false], ["c", false]]);
    // the card says so, and its share is still of the top row
    const cards = teamCards(ordered, compareScale(ordered.map((o) => o.figure)), "dpr");
    expect(cards.map((c) => [c.rank, c.pinned, c.share])).toEqual([[1, true, "33.3%"], [2, true, "16.6%"], [3, false, "100.0%"], [4, false, "66.6%"]]);
  });
});

describe("cards", () => {
  it("numbers the cards, reads each as a share of the top row with the main DPS first, and keeps the loop time for DPR only", () => {
    const runs: Record<string, RunRowLike> = { a: run("t0", 2000, 100), b: run("t1", 1500, 100) };
    const ordered = tableOrder([{ key: "a" }, { key: "b" }], (k) => runs[k], "dpr");
    const cards = teamCards(ordered, compareScale(ordered.map((o) => o.figure)), "dpr");
    expect(cards.map((c) => [c.rank, c.key, c.share])).toEqual([[1, "a", "100.0%"], [2, "b", "75.0%"]]);
    expect(cards[0]!.members.map((m) => m.name)).toEqual(["Hsin", "Suoming", "Shorekeeper"]);
    expect(cards[0]!.loop).toBe(26.2);
    expect(cards[0]!.strength).toBe(1);
    expect(cards[1]!.strength).toBe(0);
    const dps = teamCards(tableOrder([{ key: "a" }], (k) => runs[k], "dps"), compareScale([80]), "dps");
    expect(dps[0]!.loop).toBeNull();
  });

  it("measures every card against a pinned row when one is pinned", () => {
    const runs: Record<string, RunRowLike> = { a: run("t0", 2000, 100), b: run("t1", 1000, 100) };
    const ordered = tableOrder([{ key: "a" }, { key: "b" }], (k) => runs[k], "dpr");
    const cards = teamCards(ordered, compareScale([2000, 1000], 1000), "dpr");
    expect(cards.map((c) => c.share)).toEqual(["200.0%", "100.0%"]);
    expect(cards[0]!.width).toBe(1);
  });

  it("asks whether a member's refine is compared for the rank token", () => {
    const runs: Record<string, RunRowLike> = { a: run("t0", 2000, 100) };
    const ordered = tableOrder([{ key: "a" }], (k) => runs[k], "dpr");
    const cards = teamCards(ordered, compareScale([2000]), "dpr", (_, j) => j === 0);
    expect(cards[0]!.members.find((m) => m.name === "Shorekeeper")!.token).toBe("S0R1");
  });
});

describe("against the account", () => {
  const row = { name: "Hsin", sequence: 2, refinement: 1, weapon: "Blooming Jadehaven", limitedWeapon: true, free: false };
  const owns = (sequence: number, weapon: string | null, refinement = 1) => ({ owned: true, sequence, refinement, weapon });

  it("counts a free resonator the account never set up as owned at S6, and says when one is not owned", () => {
    expect(ownStatus({ ...row, name: "Aero Rover", free: true }, undefined, false)).toMatchObject({ kind: "assumed", own: "S6" });
    expect(ownStatus(row, { owned: false, sequence: 0, refinement: 1, weapon: null }, false)).toMatchObject({ kind: "missing", text: "not owned", own: null });
    expect(ownStatus(row, null, true).title).toContain("S0R1");
  });

  it("under My account the row already runs the account's own state", () => {
    expect(ownStatus(row, owns(0, "Variation", 3), true)).toMatchObject({ kind: "same", text: "✓", own: "S0R3" });
  });

  it("under one of Riley's tiers says whether the account reaches the row's sequence and signature", () => {
    expect(ownStatus(row, owns(2, "BloomingJadehaven"), false)).toMatchObject({ kind: "same", text: "✓" });
    expect(ownStatus(row, owns(6, "BloomingJadehaven", 2), false)).toMatchObject({ kind: "above", text: "✓ S6R2" });
    expect(ownStatus(row, owns(0, "BloomingJadehaven"), false)).toMatchObject({ kind: "below", text: "you S0", own: "S0R1" });
    expect(ownStatus(row, owns(0, "BloomingJadehaven"), false).weaponGap).toBeUndefined();
    const noSig = ownStatus(row, owns(2, "Variation", 5), false);
    expect(noSig).toMatchObject({ kind: "below", text: "no sig", weaponGap: "other" });
    expect(noSig.title).toContain("another weapon than Blooming Jadehaven");
    expect(ownStatus(row, owns(0, "Variation"), false)).toMatchObject({ kind: "below", text: "you S0 · no sig", weaponGap: "other" });
    expect(ownStatus({ ...row, refinement: 5 }, owns(2, "BloomingJadehaven", 1), false)).toMatchObject({ kind: "below", text: "you R1", weaponGap: "rank" });
    // a standard weapon the row runs is never a gap
    expect(ownStatus({ ...row, weapon: "Variation", limitedWeapon: false }, owns(2, "Cosmic Ripples"), false).kind).toBe("same");
  });

  it("reads the build off the echoes on the build the calculator runs", () => {
    const five = ["a", "b", "c", "d", "e"];
    expect(buildStatus({ ...owns(0, "x"), echoes: five })).toMatchObject({ kind: "full", text: "build", echoes: 5 });
    expect(buildStatus({ ...owns(0, "x"), echoes: ["a", null, "c", null, null] })).toMatchObject({ kind: "partial", text: "2/5 echoes" });
    expect(buildStatus({ ...owns(0, "x"), echoes: [null, null, null, null, null] })).toMatchObject({ kind: "none", text: "no build" });
    expect(buildStatus({ owned: false, sequence: 0, refinement: 1, weapon: null, echoes: five }).kind).toBe("missing");
    expect(buildStatus(undefined).kind).toBe("missing");
  });

  it("maps the account by Riley's names, the owned Rover gender winning", () => {
    const map = ownByRileyName({
      RoverAeroFemale: { rileyName: "Aero Rover", owned: false, sequence: 0, refinement: 1, weapon: null },
      RoverAeroMale: { rileyName: "Aero Rover", owned: true, sequence: 6, refinement: 1, weapon: "Emerald of Genesis" },
      Lupa: { rileyName: "Lupa", owned: true, sequence: 3, refinement: 1, weapon: "WildfireMark" },
    });
    expect(map.get("Aero Rover")?.weapon).toBe("Emerald of Genesis");
    expect(map.get("Lupa")?.sequence).toBe(3);
  });
});

describe("initials for a portrait that did not load", () => {
  it("takes two words' initials, or a single name's first two letters", () => {
    expect(initialsOf("Aero Rover")).toBe("AR");
    expect(initialsOf("Lupa")).toBe("Lu");
  });
});
