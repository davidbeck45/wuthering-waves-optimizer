// Wuthering Tools+: the "On your account" block of a brief, on made-up accounts (no real account data here): not
// owned, owned at S0, owned at a sequence past a breakpoint, and a male Rover. The kit tables are the shipped ones.
import { describe, expect, it } from "vitest";
import kitsFile from "./data/kits.json";
import indexFile from "./data/kitIndex.json";
import { isRosterCharacter } from "../display/names";
import { accountCharacterOf } from "../account/accountState";
import type { KitIndexFile, KitsFile } from "./kits";
import { nextText, onAccountOf, ownedText, type AccountSide, type RankedTeam } from "./onAccount";

const file = kitsFile as unknown as KitsFile;
const index = (indexFile as KitIndexFile).kits;

/** a character record as the store holds one: a weapon, its rank, and the sequence nodes up to `sequence` */
const record = (weapon: string, sequence = 0, refinement = 1): Record<string, any> => ({
  weapon,
  weapons: { [weapon]: { refinement } },
  resonanceChains: Object.fromEntries(Array.from({ length: sequence }, (_, i) => [`SequenceNode${i + 1}Made`, { isEnabled: true }])),
});
const block = (name: string, characters: Record<string, any>, rankedTeams: RankedTeam[] | null = null) =>
  onAccountOf({
    file,
    kit: file.kits[name]!,
    index,
    inApp: isRosterCharacter,
    characters,
    side: (key): AccountSide | null => (characters[key] ? accountCharacterOf(key, characters[key]) : null),
    rankedTeams,
  });

describe("On your account", () => {
  it("the synthetic record reads as the Account State reads a real one", () => {
    expect(accountCharacterOf("Camellya", record("RedSpring", 6, 2))).toMatchObject({ owned: true, sequence: 6, weapon: "RedSpring", refinement: 2 });
    expect(accountCharacterOf("Camellya", {})).toMatchObject({ owned: false, sequence: 0 });
  });

  it("not owned: says so, names Riley's best team and who of it is missing, and offers no account links", () => {
    const b = block("Aemeath", { Mornye: record("StarfieldCalibrator") });
    expect(b).toMatchObject({ owned: false, sequence: 0, weapon: null, team: null, ranked: null, hasRanking: false });
    expect(b.wanted).not.toBeNull();
    expect(b.wanted!.cost).toBe("s0r1"); // his default view
    expect(b.wanted!.missing.map((m) => m.name)).toContain("Aemeath");
    expect(b.wanted!.missing.map((m) => m.name)).not.toContain("Mornye"); // owned, so not missing
    expect(b.links.map((l) => l.id)).toEqual(["echo-plan", "rank"]);
    expect(ownedText(b, "Aemeath", "")).toBe("Aemeath is not on your account in this app: no weapon is equipped on them.");
    // from S0, the first change is still ahead
    expect(b.next).toMatchObject({ level: 1, kind: "chain" });
    expect(nextText(b, "Aemeath")).toMatch(/^The next sequence that changes how Aemeath is played: S1 changes only the opener/);
  });

  it("owned at S0 with her team: the best of Riley's teams the account can field, with links that carry the team", () => {
    const first = file.kits.Aemeath!.best.s0r1![0]!;
    const mates = first.m.map((i) => file.builds[i]![1]).filter((n) => n !== "Aemeath");
    const characters = { Aemeath: record("EverbrightPolestar", 0, 1), ...Object.fromEntries(mates.map((n) => [n.replace(/ /g, ""), record("X")])) };
    const b = block("Aemeath", characters);
    expect(b).toMatchObject({ owned: true, sequence: 0, weapon: "EverbrightPolestar", refinement: 1, wanted: null });
    expect(b.team!.cost).toBe("s0r1");
    expect(b.team!.team.dps).toBe(first.dps);
    expect(b.team!.keys.slice().sort()).toEqual(Object.keys(characters).sort());
    expect(b.team!.main).toBe("Aemeath");
    expect(b.links.map((l) => l.id)).toEqual(["build", "rotation", "cost", "weapons", "echo-plan", "rank"]);
    expect(b.links.find((l) => l.id === "build")!.to).toBe(`/build-team?members=${b.team!.keys.join(",")}&only=Aemeath`);
    expect(b.links.find((l) => l.id === "rotation")!.to).toBe(`/rotation#chars=${b.team!.keys.join(",")}`);
    expect(b.links.find((l) => l.id === "cost")!.to).toBe("/account?focus=Aemeath&section=cost");
    expect(b.links.find((l) => l.id === "weapons")!.to).toBe("/weapons?focus=Aemeath");
    expect(ownedText(b, "Aemeath", "Everbright Polestar")).toBe("You have Aemeath at S0 with Everbright Polestar at R1.");
    expect(nextText(b, "Aemeath")).toMatch(/^You are at S0\. The next sequence that changes how Aemeath is played: S1 /);
    // the same account at S6: his Team Cost that runs a main DPS at S6 is read first, and at R5 the R5 one
    const mateRecords = Object.fromEntries(Object.keys(characters).filter((k) => k !== "Aemeath").map((k) => [k, characters[k as keyof typeof characters]]));
    const at6 = block("Aemeath", { ...mateRecords, Aemeath: record("EverbrightPolestar", 6, 1) });
    expect(at6.team!.cost).toBe("s6r1mdps");
    expect(at6.team!.team.members.find((m) => m.name === "Aemeath")!.sequence).toBe(6);
    expect(block("Aemeath", { ...mateRecords, Aemeath: record("EverbrightPolestar", 6, 5) }).team!.cost).toBe("s6r5mdps");
  });

  it("owned alone: no team the account can field, so the best team and its missing members are named", () => {
    const b = block("Aemeath", { Aemeath: record("EverbrightPolestar") });
    expect(b.team).toBeNull();
    expect(b.wanted!.missing.map((m) => m.name)).not.toContain("Aemeath");
    expect(b.wanted!.missing.length).toBe(2);
    expect(b.links.map((l) => l.id)).toEqual(["cost", "weapons", "echo-plan", "rank"]);
  });

  it("owned past a breakpoint: nothing is ahead, and the change already in play is named", () => {
    // Camellya's loop switches at S6; at S6 she has it
    const at6 = block("Camellya", { Camellya: record("RedSpring", 6, 1) });
    expect(at6.sequence).toBe(6);
    expect(at6.next).toBeNull();
    expect(at6.passed.map((c) => c.level)).toEqual([6]);
    expect(nextText(at6, "Camellya")).toBe("You are at S6. No later sequence changes how Camellya is played: you already have S6, the last that does.");
    // one below it, the switch is the next thing
    const at5 = block("Camellya", { Camellya: record("RedSpring", 5, 1) });
    expect(at5.next).toMatchObject({ level: 6, kind: "loop" });
    expect(at5.passed).toEqual([]);
    expect(nextText(at5, "Camellya")).toMatch(/^You are at S5\. The next sequence that changes how Camellya is played: S6 switches the loop/);
    // a kit with one loop throughout
    const jiyan = block("Jiyan", { Jiyan: record("VerdantSummit", 2, 1) });
    expect(nextText(jiyan, "Jiyan")).toBe("You are at S2. No sequence changes how Jiyan is played: one loop at every level.");
  });

  it("a male Rover reads his own record, and his teams carry the key the account holds", () => {
    const first = file.kits["Aero Rover"]!.best.s0r1![0]!;
    const mates = first.m.map((i) => file.builds[i]![1]).filter((n) => n !== "Aero Rover");
    const characters: Record<string, any> = { RoverAeroMale: record("BloodpactsPledge", 6, 1), ...Object.fromEntries(mates.map((n) => [n.replace(/ /g, ""), record("X")])) };
    const b = block("Aero Rover", characters);
    expect(b.key).toBe("RoverAeroMale");
    expect(b).toMatchObject({ owned: true, sequence: 6, weapon: "BloodpactsPledge", free: true });
    expect(b.team!.keys).toContain("RoverAeroMale");
    expect(b.team!.keys).not.toContain("RoverAeroFemale");
    expect(b.links.find((l) => l.id === "cost")!.to).toBe("/account?focus=RoverAeroMale&section=cost");
    // the female form on another account reads the female record
    expect(block("Aero Rover", { RoverAeroFemale: record("BloodpactsPledge", 6, 1) }).key).toBe("RoverAeroFemale");
    // a ranking row filed under either key is his
    const ranked: RankedTeam[] = [{ id: "a", name: "A", source: "yours", characterIds: ["RoverAeroMale", "Ciaccona", "Cartethyia"], avgDamage: 5, dps: 1 }];
    expect(block("Aero Rover", characters, ranked).ranked?.id).toBe("a");
  });

  it("a 4★ nobody set up still counts as fieldable, as on Team rankings, but gets no account links", () => {
    const b = block("Sanhua", {});
    expect(b).toMatchObject({ owned: false, free: true });
    expect(ownedText(b, "Sanhua", "")).toMatch(/counts a 4★ or a Rover form as owned at S6/);
    expect(b.links.map((l) => l.id)).toEqual(["echo-plan", "rank"]);
  });

  it("a cached ranking: the best team with them by this app's figure, and no Rank my teams link", () => {
    const ranked: RankedTeam[] = [
      { id: "t1", name: "low", source: "yours", characterIds: ["Aemeath", "Mornye", "Lynae"], avgDamage: 100, dps: 4 },
      { id: "t2", name: "high", source: "wuwa_calc", characterIds: ["Chisa", "Denia", "Aemeath"], avgDamage: 300, dps: 12 },
      { id: "t3", name: "not hers", source: "yours", characterIds: ["Chisa", "Denia", "Jiyan"], avgDamage: 900, dps: 40 },
    ];
    const b = block("Aemeath", { Aemeath: record("EverbrightPolestar") }, ranked);
    expect(b.hasRanking).toBe(true);
    expect(b.ranked).toMatchObject({ id: "t2", avgDamage: 300 });
    expect(b.links.map((l) => l.id)).not.toContain("rank");
    // a ranking with no team of hers: still nothing to show, and the link is back
    const none = block("Aemeath", { Aemeath: record("EverbrightPolestar") }, [ranked[2]!]);
    expect(none.ranked).toBeNull();
    expect(none.hasRanking).toBe(true);
    expect(none.links.map((l) => l.id)).toContain("rank");
  });
});
