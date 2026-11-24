// Wuthering Tools+ numbers log — "Over time", second check: a step's marks say what compare.ts's words say.
import { describe, expect, it } from "vitest";
import { SYNCED_TEXT, type Namer } from "./compare";
import { entryFromRanking, type RankedAccount } from "./entry";
import type { LogEntry, NumbersLog } from "./log";
import { DAY, T0, account, ranking } from "./testAccount";
import { buildTrends, trendSteps } from "./trends";

const BUILD = "0.0.1+abc+aaaaaaaaaaaa";
const names: Namer = { character: (id) => `<${id}>`, weapon: (key) => (key ? `[${key}]` : "no weapon") };
const entry = (over: Parameters<typeof ranking>[0], acc: RankedAccount, at: number): LogEntry => entryFromRanking(ranking(over), acc, { at, build: BUILD, autoTeamBuffs: true }) as LogEntry;
const logOf = (...entries: LogEntry[]): NumbersLog => ({ entries, seen: null });

describe("over time: a team step's marks", () => {
  it("a Sync that gave the members' saved loops the team's loop time is marked as a Sync only, not as a build change", () => {
    const acc = account();
    acc.teams = acc.teams.map((t) => ({ ...t, actions: [{ id: "b1", characterId: "Aaa", count: 2 }], syncedAt: T0 + 1000 }));
    for (const c of Object.values(acc.characters)) (c as { rotations?: unknown[] }).rotations = [{ name: "loop", duration: 25 }];
    const log = logOf(entry({}, account(), T0), entry({ mine: 2_100_000 }, acc, T0 + DAY));
    const t = buildTrends(log).find((x) => x.key === "t:t-mine")!;
    const [step] = trendSteps(log, t, names);
    expect(step!.text).toBe(SYNCED_TEXT);
    expect(step!.marks).toEqual(["synced"]);
  });
});

describe("over time: a team whose members changed", () => {
  it("a member swapped in whose own build changed is not marked as a build change: the words say the team changed", () => {
    const before = account();
    before.characters.Ddd = { weapon: "GunTwo", echoes: { 0: { echoId: "e9" } }, buffs: {} };
    before.teams[0].characterIds = ["Aaa", "Bbb", "Ddd"];
    const after = account();
    after.characters.Ddd = { weapon: "GunTwo", echoes: { 0: { echoId: "e9" } }, buffs: {} };
    // Ccc comes in for Ddd, and their own build changed meanwhile
    after.characters.Ccc.echoes = { 0: { echoId: "e9" } };
    const r0 = ranking({});
    r0.characters.push({ ...r0.characters[2]!, id: "Ddd", name: "Ddd" });
    r0.teams[0] = { ...r0.teams[0]!, characterIds: ["Aaa", "Bbb", "Ddd"] };
    const r1 = ranking({ mine: 2_300_000 });
    r1.characters.push({ ...r1.characters[2]!, id: "Ddd", name: "Ddd" });
    const log = logOf(entryFromRanking(r0, before, { at: T0, build: BUILD, autoTeamBuffs: true }) as LogEntry, entryFromRanking(r1, after, { at: T0 + DAY, build: BUILD, autoTeamBuffs: true }) as LogEntry);
    const t = buildTrends(log).find((x) => x.key === "t:t-mine")!;
    const [step] = trendSteps(log, t, names);
    expect(step!.text).toBe("You changed who is in this team.");
    expect(step!.marks).toEqual(["team"]);
  });
});
