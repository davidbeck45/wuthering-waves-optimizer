// Wuthering Tools+: the /rankings account bar's Main DPS / With / Without chips over Riley's r= / x= hash.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chipGroups, hashText, pickerOptions, readResonatorFilters, RILEY_TIERS, rosterOf, withResonatorFilter, type OwnedInfo } from "./filterChips";

const member = (name: string, mainDps: boolean, tier = 0) => ({ name, color: "#888888", mainDps, loadout: { resonator: { tier } } });
// a miniature of his TEAMS: Suoming leads her own team and supports Hsin; Electro Rover is a free form
const TEAMS = {
  t0: [member("Shorekeeper", false), member("Suoming", false), member("Hsin", true)],
  t1: [member("Shorekeeper", false), member("Electro Rover", false, 2), member("Suoming", true)],
  t2: [member("Mornye", false), member("Lynae", false), member("Aemeath", true)],
};
const roster = rosterOf(TEAMS);

describe("rankings filter chips", () => {
  it("builds the roster once per resonator, with who leads and who is free", () => {
    expect(roster.map((r) => r.name)).toEqual(["Aemeath", "Electro Rover", "Hsin", "Lynae", "Mornye", "Shorekeeper", "Suoming"]);
    expect(roster.find((r) => r.name === "Suoming")).toMatchObject({ leads: true, free: false });
    expect(roster.find((r) => r.name === "Shorekeeper")).toMatchObject({ leads: false });
    expect(roster.find((r) => r.name === "Electro Rover")).toMatchObject({ free: true, leads: false });
  });

  it("reads r= and x= as real names, an include winning over an exclude", () => {
    const p = new URLSearchParams("r=ElectroRover,Aemeath&x=Aemeath,Lynae&tc=mine");
    expect(readResonatorFilters(p, roster)).toEqual({ include: ["Electro Rover", "Aemeath"], exclude: ["Lynae"] });
    // a name the roster does not know is kept as written
    expect(readResonatorFilters(new URLSearchParams("r=Nobody"), roster).include).toEqual(["Nobody"]);
  });

  it("splits includes into Main DPS and With by who leads, unless the player said otherwise", () => {
    const p = new URLSearchParams("r=Aemeath,Lynae,Suoming&x=Mornye");
    expect(chipGroups(p, roster)).toEqual({ main: ["Aemeath", "Suoming"], with: ["Lynae"], without: ["Mornye"] });
    expect(chipGroups(p, roster, new Map([["Suoming", "with" as const]]))).toEqual({ main: ["Aemeath"], with: ["Lynae", "Suoming"], without: ["Mornye"] });
  });

  it("moves a name between r= and x= and keeps every other parameter", () => {
    const start = new URLSearchParams("tc=mine&r=Aemeath&x=ElectroRover&cb=Aemeath");
    const a = withResonatorFilter(start, "Electro Rover", "include", roster);
    expect(a.get("r")).toBe("Aemeath,ElectroRover");
    expect(a.has("x")).toBe(false);
    expect(a.get("tc")).toBe("mine");
    expect(a.get("cb")).toBe("Aemeath");
    const b = withResonatorFilter(a, "Aemeath", "exclude", roster);
    expect(b.get("r")).toBe("ElectroRover");
    expect(b.get("x")).toBe("Aemeath");
    const c = withResonatorFilter(b, "Aemeath", null, roster);
    expect(c.has("x")).toBe(false);
    expect(hashText(withResonatorFilter(new URLSearchParams(""), "Lynae", "include", roster))).toBe("r=Lynae");
    expect(hashText(new URLSearchParams("r=Aemeath,Lynae&tc=mine"))).toBe("r=Aemeath,Lynae&tc=mine");
  });

  it("lists the account's S6 resonators first, then the rest it owns, then the ones it lacks", () => {
    const account = new Map<string, OwnedInfo>([
      ["Lynae", { owned: true, sequence: 6 }],
      ["Mornye", { owned: true, sequence: 1 }],
      ["Aemeath", { owned: true, sequence: 6 }],
      ["Hsin", { owned: false, sequence: 0 }],
    ]);
    const all = pickerOptions(roster, account, "with");
    expect(all.map((o) => `${o.name}:${o.section}`)).toEqual([
      "Aemeath:0", "Electro Rover:0", "Lynae:0", // a free form the account never set up is everyone's, at S6
      "Mornye:1",
      "Hsin:2", "Shorekeeper:2", "Suoming:2",
    ]);
    expect(all.find((o) => o.name === "Electro Rover")).toMatchObject({ owned: true, assumed: true, sequence: 6 });
    expect(all.find((o) => o.name === "Mornye")).toMatchObject({ owned: true, assumed: false, sequence: 1 });
    // Main DPS offers only the resonators who lead a team
    expect(pickerOptions(roster, account, "main").map((o) => o.name)).toEqual(["Aemeath", "Hsin", "Suoming"]);
  });

  it("offers every Riley tier except My account, his default as the empty code", () => {
    expect(RILEY_TIERS.map((t) => t.code)).toEqual(["r0", "r1m", "", "s2m", "s3m", "s6m", "s6ms2", "s6r5m", "s6r5"]);
  });

  it("keeps up with the tiers Riley's page writes (his model.ts COST_CODE): his own Team Cost box is hidden behind the bar", () => {
    // read off his source, not imported: a tier he adds would otherwise be unreachable from the page
    const model = readFileSync(resolve(__dirname, "../../../vendor/wuwa_calc/src/page/model.ts"), "utf8");
    const block = /const COST_CODE[^{]*\{([^}]*)\}/.exec(model)?.[1] ?? "";
    const codes = [...block.matchAll(/(\w+):\s*"([^"]*)"/g)].map((m) => ({ cost: m[1]!, code: m[2]! }));
    expect(codes.length).toBeGreaterThan(5);
    // his default (s0r1) is written as no tc= at all; My account is the bar's own button
    const want = codes.filter((c) => c.cost !== "mine").map((c) => (c.cost === "s0r1" ? "" : c.code));
    expect(RILEY_TIERS.map((t) => t.code).sort()).toEqual(want.sort());
  });
});
