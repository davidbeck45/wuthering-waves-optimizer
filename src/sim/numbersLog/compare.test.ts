// Wuthering Tools+ numbers log — two records against each other: what moved and the cause given for it, from facts
// only. Synthetic account (testAccount.ts).
import { describe, expect, it } from "vitest";
import { ALSO_UPDATED_TEXT, biggestMoves, causeText, changeText, compareEntries, dayText, whenText, type Move, type Namer } from "./compare";
import { entryFromRanking, type RankedAccount } from "./entry";
import type { LogEntry } from "./log";
import { DAY, T0, account, charRank, ranking, teamRank } from "./testAccount";

const BUILD = "0.0.1+abc+aaaaaaaaaaaa";
const NEXT_BUILD = "0.0.1+abc+bbbbbbbbbbbb";
const names: Namer = { character: (id) => `<${id}>`, weapon: (key) => (key ? `[${key}]` : "no weapon") };

const entry = (over: Parameters<typeof ranking>[0] = {}, acc: RankedAccount = account(), at = T0, build = BUILD, auto = true): LogEntry =>
  entryFromRanking(ranking(over), acc, { at, build, autoTeamBuffs: auto }) as LogEntry;
const move = (c: ReturnType<typeof compareEntries>, id: string): Move => c.moves.find((m) => m.id === id) as Move;
const say = (m: Move, imported = false): string => causeText(m.cause, names, imported, m.kind);

describe("what moved", () => {
  it("lists a figure that moved with before, after and the change as a share of the old figure", () => {
    const c = compareEntries(entry(), entry({ Aaa: 1_050_000 }, account(), T0 + DAY));
    expect(c.moves).toHaveLength(1);
    expect(c.moves[0]).toMatchObject({ kind: "character", id: "Aaa", before: 1_000_000, after: 1_050_000, rotationNow: "Aaa loop", rotation: null });
    expect(c.moves[0].change).toBeCloseTo(0.05, 10);
    expect(c.steady).toBe(4); // Bbb, Ccc and the two teams
    expect(c.appeared).toEqual([]);
    expect(c.gone).toEqual([]);
  });

  it("reports nothing for two equal records", () => {
    const c = compareEntries(entry(), entry({}, account(), T0 + DAY));
    expect(c.moves).toEqual([]);
    expect(c.steady).toBe(5);
    expect(c.appUpdated).toBe(false);
  });

  it("puts the biggest change first, measured against the old figure, not in raw damage", () => {
    const c = compareEntries(entry(), entry({ Aaa: 1_020_000, Ccc: 150_000, stock: 2_160_000 }, account(), T0 + DAY));
    expect(c.moves.map((m) => m.id)).toEqual(["Ccc", "wuwa_calc:Aaa hypercarry", "Aaa"]); // +25 %, −10 %, +2 %
  });

  it("lists a character or team in only one record as appeared or gone, never as a move", () => {
    const before = entry();
    const r = ranking();
    r.characters = [r.characters[0], r.characters[1], charRank("Ddd", 300_000)]; // Ccc left, Ddd came
    r.teams = [teamRank("wuwa_calc:Aaa with Ddd", 2_100_000, ["Aaa", "Bbb", "Ddd"])];
    const acc = account();
    acc.characters.Ddd = { weapon: "BroadOne" };
    delete acc.characters.Ccc;
    const after = entryFromRanking(r, acc, { at: T0 + DAY, build: BUILD, autoTeamBuffs: true }) as LogEntry;
    const c = compareEntries(before, after);
    expect(c.moves).toEqual([]);
    expect(c.appeared.map((x) => [x.kind, x.id, x.damage])).toEqual([
      ["character", "Ddd", 300_000],
      ["team", "wuwa_calc:Aaa with Ddd", 2_100_000],
    ]);
    expect(c.gone.map((x) => [x.kind, x.id]).sort()).toEqual([
      ["character", "Ccc"],
      ["team", "t-mine"],
      ["team", "wuwa_calc:Aaa hypercarry"],
    ]);
  });

  it("says when a character's best rotation is another one now", () => {
    const r = ranking({ Aaa: 1_200_000 });
    r.characters[0] = charRank("Aaa", 1_200_000, "Aaa quickswap");
    const after = entryFromRanking(r, account(), { at: T0 + DAY, build: BUILD, autoTeamBuffs: true }) as LogEntry;
    expect(move(compareEntries(entry(), after), "Aaa").rotation).toEqual({ before: "Aaa loop", after: "Aaa quickswap" });
  });

  it("has no share to give when the old figure was 0", () => {
    const r = ranking();
    r.characters[2] = charRank("Ccc", 0, null);
    const before = entryFromRanking(r, account(), { at: T0, build: BUILD, autoTeamBuffs: true }) as LogEntry;
    const m = move(compareEntries(before, entry({}, account(), T0 + DAY)), "Ccc");
    expect(m).toMatchObject({ before: 0, after: 120_000, change: null });
    expect(changeText(m.change)).toBeNull();
  });
});

describe("the cause", () => {
  it("you changed this build: says which part", () => {
    const cases: Array<[(a: ReturnType<typeof account>) => void, string]> = [
      [(a) => (a.characters.Aaa.echoes[1] = { echoId: "e9" }), "You changed this build: echoes."],
      [(a) => (a.echoes[0].echoSubStatsValue1 = 21), "You changed this build: echoes."], // the same echo, tuned further
      [(a) => (a.characters.Aaa.weapon = "SwordTwo"), "You changed this build: weapon ([SwordOne] → [SwordTwo])."],
      [(a) => (a.characters.Aaa.weapons.SwordOne.refinement = "5"), "You changed this build: weapon refinement (R1 → R5)."],
      [(a) => (a.characters.Aaa.weapons.SwordOne.weaponLevel = "80"), "You changed this build: weapon level or passive switches."],
      [(a) => (a.characters.Aaa.resonanceChains.SequenceNode3Third.isEnabled = true), "You changed this build: sequence (S2 → S3)."],
      [(a) => (a.characters.Aaa.resonanceChains.SequenceNode2Second.stacks = 3), "You changed this build: Resonance Chain switches."],
      [(a) => (a.characters.Aaa.talents.basic = 8), "You changed this build: levels."],
      [(a) => (a.characters.Aaa.buffs.OwnBuff.isEnabled = false), "You changed this build: buffs, rotations or other settings."],
    ];
    for (const [edit, text] of cases) {
      const acc = account();
      edit(acc);
      const c = compareEntries(entry(), entry({ Aaa: 1_090_000 }, acc, T0 + DAY));
      expect(say(move(c, "Aaa")), text).toBe(text);
    }
  });

  it("names every part that changed, in one sentence", () => {
    const acc = account();
    acc.characters.Aaa.weapon = "SwordTwo";
    acc.characters.Aaa.echoes[0] = { echoId: "e9" };
    acc.characters.Aaa.characterLevel = "80";
    const c = compareEntries(entry(), entry({ Aaa: 900_000 }, acc, T0 + DAY));
    expect(say(move(c, "Aaa"))).toBe("You changed this build: weapon ([SwordOne] → [SwordTwo]), echoes and levels.");
  });

  it("a team: a member's build changed, by name", () => {
    const acc = account();
    acc.characters.Bbb.weapons.GunOne.refinement = "1";
    const c = compareEntries(entry(), entry({ Bbb: 380_000, mine: 1_950_000, stock: 2_300_000 }, acc, T0 + DAY));
    expect(say(move(c, "t-mine"))).toBe("<Bbb>'s build changed.");
    expect(say(move(c, "wuwa_calc:Aaa hypercarry"))).toBe("<Bbb>'s build changed.");
    expect(say(move(c, "Bbb"))).toBe("You changed this build: weapon refinement (R5 → R1).");
    acc.characters.Ccc.buffs = { New: { isEnabled: true } };
    expect(say(move(compareEntries(entry(), entry({ mine: 1_900_000 }, acc, T0 + DAY)), "t-mine"))).toBe("The builds of <Bbb> and <Ccc> changed.");
  });

  it("a team: a member's saved build that is not the one worn still counts, because a team can pin it", () => {
    const acc = account();
    acc.echoes[2].echoSubStatsValue1 = 11; // e3, worn by Aaa's other build only
    const after = entry({ mine: 2_050_000 }, acc, T0 + DAY);
    const c = compareEntries(entry(), after);
    expect(say(move(c, "t-mine"))).toBe("<Aaa>'s build changed.");
    expect(c.moves.some((m) => m.id === "Aaa")).toBe(false); // the build she wears did not move
  });

  it("a team: you changed the team itself", () => {
    const acc = account();
    acc.teams[0].actions.push({ id: "a2", characterId: "Bbb" });
    expect(say(move(compareEntries(entry(), entry({ mine: 2_200_000 }, acc, T0 + DAY)), "t-mine"))).toBe("You changed this team: its rotation, its timing or the builds it pins.");
    const pinned = account();
    pinned.teams[0].buildIds = ["b2", null, null];
    expect(say(move(compareEntries(entry(), entry({ mine: 1_800_000 }, pinned, T0 + DAY)), "t-mine"))).toMatch(/^You changed this team/);
  });

  it("a team: the team-aware buffs switch", () => {
    const off = entry({ mine: 1_700_000, stock: 2_000_000 }, account(), T0 + DAY, BUILD, false);
    const c = compareEntries(entry(), off);
    expect(say(move(c, "t-mine"))).toBe("The team-aware buffs switch was turned off.");
    expect(say(move(compareEntries(off, entry({}, account(), T0 + 2 * DAY)), "t-mine"))).toBe("The team-aware buffs switch was turned on.");
  });

  it("an app update, when the app build changed and no build did", () => {
    const c = compareEntries(entry(), entry({ Aaa: 1_030_000, stock: 2_500_000 }, account(), T0 + DAY, NEXT_BUILD));
    expect(c.appUpdated).toBe(true);
    expect(say(move(c, "Aaa"))).toBe("An app update: no build in it changed.");
    expect(say(move(c, "wuwa_calc:Aaa hypercarry"))).toBe("An app update: no build in it changed.");
  });

  it("the build first when both changed, and then that the update may be part of it: the log cannot split the two", () => {
    const acc = account();
    acc.characters.Aaa.echoes[1] = { echoId: "e9" };
    const c = compareEntries(entry(), entry({ Aaa: 1_030_000, Bbb: 410_000, mine: 2_100_000 }, acc, T0 + DAY, NEXT_BUILD));
    expect(say(move(c, "Aaa"))).toBe(`You changed this build: echoes. ${ALSO_UPDATED_TEXT}`);
    expect(say(move(c, "t-mine"))).toBe(`<Aaa>'s build changed. ${ALSO_UPDATED_TEXT}`);
    expect(say(move(c, "Bbb"))).toBe("An app update: no build in it changed."); // his build is as it was
    expect(ALSO_UPDATED_TEXT).toBe("The app was updated between the two records too, so part of this may be the update.");
    // the team itself, and the switch, the same way
    const edited = account();
    edited.teams[0].duration = 25;
    expect(say(move(compareEntries(entry(), entry({ mine: 2_300_000 }, edited, T0 + DAY, NEXT_BUILD)), "t-mine"))).toBe(`You changed this team: its rotation, its timing or the builds it pins. ${ALSO_UPDATED_TEXT}`);
    expect(say(move(compareEntries(entry(), entry({ mine: 1_700_000 }, account(), T0 + DAY, NEXT_BUILD, false)), "t-mine"))).toBe(`The team-aware buffs switch was turned off. ${ALSO_UPDATED_TEXT}`);
    // and never without an update
    expect(say(move(compareEntries(entry(), entry({ Aaa: 1_030_000 }, acc, T0 + DAY)), "Aaa"))).toBe("You changed this build: echoes.");
  });

  it("says so when nothing the log records explains a move", () => {
    const c = compareEntries(entry(), entry({ Aaa: 1_000_500, stock: 2_400_900 }, account(), T0 + DAY));
    expect(say(move(c, "Aaa"))).toBe("Nothing the log records changed: the build and the app are the same.");
    expect(say(move(c, "wuwa_calc:Aaa hypercarry"))).toBe("Nothing the log records changed: the members' builds, the team and the app are the same.");
  });

  it("never blames a change of bookkeeping: a build's saved time, notes, the optimizer's search panel", () => {
    const acc = account();
    acc.characters.Aaa.builds[0].updatedAt = 999;
    acc.characters.Aaa.notes = "try the other sword";
    acc.characters.Aaa.buildStatus = "wip";
    acc.characters.Aaa.optimizer = { mainEchoes: ["X"], echoSets: ["SetA"] };
    acc.teams[0].name = "Renamed";
    acc.teams[0].enemyConfig = { enemyLevel: 100 };
    const c = compareEntries(entry(), entry({ Aaa: 1_010_000, mine: 2_010_000 }, acc, T0 + DAY, NEXT_BUILD));
    expect(say(move(c, "Aaa"))).toBe("An app update: no build in it changed.");
    expect(say(move(c, "t-mine"))).toBe("An app update: no build in it changed.");
  });

  it("a Settings import between the two is one fact for the whole comparison, and no row says 'you'", () => {
    const acc = account();
    acc.characters.Aaa.echoes[1] = { echoId: "e9" };
    acc.teams[0].duration = 25;
    const a = entry();
    const b = entry({ Aaa: 1_100_000 }, acc, T0 + DAY);
    b.importedAt = T0 + DAY - 60_000;
    const later = entry({ Aaa: 1_100_000, mine: 2_300_000 }, acc, T0 + 2 * DAY);
    expect(compareEntries(a, b).importedAt).toBe(T0 + DAY - 60_000);
    expect(compareEntries(b, later).importedAt).toBeNull(); // the import was before the older of these two
    const wide = compareEntries(a, later, [b, later]); // newest against an older pick: the import sits in between
    expect(wide.importedAt).toBe(T0 + DAY - 60_000);
    expect(say(move(wide, "Aaa"), true)).toBe("This build is different: echoes.");
    expect(say(move(wide, "t-mine"), true)).toBe("<Aaa>'s build changed.");
    const teamOnly = account();
    teamOnly.teams[0].duration = 25;
    expect(say(move(compareEntries(a, entry({ mine: 2_300_000 }, teamOnly, T0 + DAY)), "t-mine"), true)).toBe("This team is different: its rotation, its timing or the builds it pins.");
  });
});

describe("rotations of one team that tie", () => {
  it("folds the same three with the same two figures into one row, his own team first, and counts them once", () => {
    const before = ranking();
    before.teams.push(teamRank("wuwa_calc:Aaa twin A", 2_000_000), teamRank("wuwa_calc:Aaa twin B", 2_000_000), teamRank("wuwa_calc:Aaa calm A", 1_500_000), teamRank("wuwa_calc:Aaa calm B", 1_500_000));
    const after = ranking({ mine: 2_200_000 });
    after.teams.push(teamRank("wuwa_calc:Aaa twin A", 2_200_000), teamRank("wuwa_calc:Aaa twin B", 2_200_000), teamRank("wuwa_calc:Aaa calm A", 1_500_000), teamRank("wuwa_calc:Aaa calm B", 1_500_000));
    const c = compareEntries(
      entryFromRanking(before, account(), { at: T0, build: BUILD, autoTeamBuffs: true }) as LogEntry,
      entryFromRanking(after, account(), { at: T0 + DAY, build: NEXT_BUILD, autoTeamBuffs: true }) as LogEntry,
    );
    expect(c.moves).toHaveLength(1); // t-mine and the two twins: 2,000,000 → 2,200,000, one row
    expect(c.moves[0]).toMatchObject({ id: "t-mine", teamName: "My trio", before: 2_000_000, after: 2_200_000 });
    expect(c.moves[0].alsoNamed).toEqual(["Aaa twin A", "Aaa twin B"]);
    // three characters, the stock team at 2.4M, and the two calm rotations as one
    expect(c.steady).toBe(5);
  });

  it("keeps apart rotations of the same three that moved differently", () => {
    const before = ranking();
    before.teams.push(teamRank("wuwa_calc:Aaa twin A", 2_000_000));
    const after = ranking({ mine: 2_200_000 });
    after.teams.push(teamRank("wuwa_calc:Aaa twin A", 2_300_000));
    const c = compareEntries(entryFromRanking(before, account(), { at: T0, build: BUILD, autoTeamBuffs: true }) as LogEntry, entryFromRanking(after, account(), { at: T0 + DAY, build: NEXT_BUILD, autoTeamBuffs: true }) as LogEntry);
    expect(c.moves.map((m) => [m.id, m.alsoNamed.length])).toEqual([
      ["wuwa_calc:Aaa twin A", 0],
      ["t-mine", 0],
    ]);
  });
});

describe("the card's three biggest moves", () => {
  it("takes one row per set of members, so three variants of one team do not fill it", () => {
    const r = ranking({ Aaa: 1_500_000, mine: 3_000_000, stock: 3_300_000 });
    r.teams.push(teamRank("wuwa_calc:Aaa quickswap", 3_100_000));
    const before = ranking();
    before.teams.push(teamRank("wuwa_calc:Aaa quickswap", 2_000_000));
    const acc = account();
    acc.characters.Aaa.weapon = "SwordTwo";
    const c = compareEntries(entryFromRanking(before, account(), { at: T0, build: BUILD, autoTeamBuffs: true }) as LogEntry, entryFromRanking(r, acc, { at: T0 + DAY, build: BUILD, autoTeamBuffs: true }) as LogEntry);
    expect(c.moves).toHaveLength(4);
    const top = biggestMoves(c.moves, 3);
    expect(top.map((m) => m.kind)).toEqual(["team", "character"]); // the trio once (its biggest mover), then her
    expect(top[0].id).toBe("wuwa_calc:Aaa quickswap");
    expect(biggestMoves(c.moves, 1)).toHaveLength(1);
    expect(biggestMoves([], 3)).toEqual([]);
  });
});

describe("the words for a change and a time", () => {
  it("writes the share with a sign and one decimal, and a tiny one as 'under 0.1 %'", () => {
    expect(changeText(0.0304)).toBe("+3.0 %");
    expect(changeText(-0.1239)).toBe("−12.4 %");
    expect(changeText(0.0004)).toBe("up under 0.1 %");
    expect(changeText(-0.0004)).toBe("down under 0.1 %");
    expect(changeText(null)).toBeNull();
  });

  it("writes a time in the reader's own zone, with the year only when it is another one", () => {
    const at = new Date(2026, 10, 9, 18, 20).getTime(); // local time, as the page shows it
    const now = new Date(2026, 10, 16, 21, 0).getTime();
    expect(whenText(at, now)).toBe("9 Nov, 18:20");
    expect(dayText(at, now)).toBe("9 Nov");
    expect(dayText(new Date(2025, 11, 31, 9, 5).getTime(), now)).toBe("31 Dec 2025");
  });
});
