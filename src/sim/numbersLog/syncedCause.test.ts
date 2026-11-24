// Wuthering Tools+ numbers log — a saved team Sync my teams rewrote reads "you synced this team", not "you changed this
// team" or "an app update" (batch 5, src/sim/syncNotice). Synthetic account (testAccount.ts).
import { describe, expect, it } from "vitest";
import { ALSO_UPDATED_TEXT, SYNCED_TEXT, causeText, compareEntries, type Move, type Namer } from "./compare";
import { entryFromRanking, type RankedAccount } from "./entry";
import { decodeLog, emptyLog, encodeLog, type LogEntry } from "./log";
import { DAY, T0, account, ranking } from "./testAccount";

const BUILD = "0.0.1+abc+aaaaaaaaaaaa";
const NEXT_BUILD = "0.0.1+abc+bbbbbbbbbbbb";
const names: Namer = { character: (id) => `<${id}>`, weapon: (key) => (key ? `[${key}]` : "no weapon") };
const entry = (over: Parameters<typeof ranking>[0], acc: RankedAccount, at: number, build = BUILD): LogEntry =>
  entryFromRanking(ranking(over), acc, { at, build, autoTeamBuffs: true }) as LogEntry;
const say = (c: ReturnType<typeof compareEntries>): string => {
  const m = c.moves.find((x) => x.id === "t-mine") as Move;
  return causeText(m.cause, names, false, m.kind);
};

/** the account after a Sync rewrote its saved team: other actions, and the time of the sync on the team */
const synced = (at: number): RankedAccount => {
  const acc = account();
  acc.teams = acc.teams.map((t) => ({ ...t, actions: [{ id: "b1", characterId: "Aaa", count: 2 }], syncedAt: at }));
  return acc;
};

describe("a team Sync my teams rewrote", () => {
  it("reads as synced, not as an edit", () => {
    const c = compareEntries(entry({}, account(), T0), entry({ mine: 2_100_000 }, synced(T0 + 1000), T0 + DAY));
    expect(say(c)).toBe(SYNCED_TEXT);
  });

  it("says the update too when the app was updated between the two records (tonight: a new engine and a Sync)", () => {
    const c = compareEntries(entry({}, account(), T0), entry({ mine: 2_100_000 }, synced(T0 + 1000), T0 + DAY, NEXT_BUILD));
    expect(say(c)).toBe(`${SYNCED_TEXT} ${ALSO_UPDATED_TEXT}`);
  });

  it("an edit after an earlier sync is an edit: the sync time did not move", () => {
    const before = entry({}, synced(T0 - DAY), T0);
    const acc = synced(T0 - DAY);
    acc.teams[0].actions = [{ id: "c1", characterId: "Aaa", count: 3 }];
    expect(say(compareEntries(before, entry({ mine: 2_100_000 }, acc, T0 + DAY)))).toBe("You changed this team: its rotation, its timing or the builds it pins.");
  });

  it("without a sync the old reasons stand: an edit is an edit", () => {
    const acc = account();
    acc.teams[0].actions = [{ id: "c1", characterId: "Aaa", count: 3 }];
    expect(say(compareEntries(entry({}, account(), T0), entry({ mine: 2_100_000 }, acc, T0 + DAY)))).toBe("You changed this team: its rotation, its timing or the builds it pins.");
  });

  it("the sync time survives the stored log, and a log without one stores as it did", () => {
    const e = entry({}, synced(T0 + 1000), T0 + DAY);
    expect(e.teams.find((t) => t.id === "t-mine")?.synced).toBe(T0 + 1000);
    const log = { ...emptyLog(), entries: [e] };
    expect(decodeLog(encodeLog(log))).toEqual(log);
    const plain = { ...emptyLog(), entries: [entry({}, account(), T0)] };
    expect(encodeLog(plain)).not.toContain('"y"');
    expect(decodeLog(encodeLog(plain))).toEqual(plain);
  });
});

describe("a Sync that also gave the members' saved loops the team's loop time", () => {
  // what production's account met tonight: Sync my teams writes the team's rotation time into each member's saved loop
  // that had none, which moves those members' records, and every synced team read "The builds of … changed."
  const withLoopTimes = (acc: ReturnType<typeof synced>): ReturnType<typeof synced> => {
    for (const c of Object.values(acc.characters)) (c as { rotations?: unknown[] }).rotations = [{ name: "loop", duration: 25 }];
    return acc;
  };

  it("reads as synced, not as the members' builds", () => {
    const c = compareEntries(entry({}, account(), T0), entry({ mine: 2_100_000 }, withLoopTimes(synced(T0 + 1000)), T0 + DAY, NEXT_BUILD));
    expect(say(c)).toBe(`${SYNCED_TEXT} ${ALSO_UPDATED_TEXT}`);
  });

  it("still names a member whose echoes changed too", () => {
    const acc = withLoopTimes(synced(T0 + 1000));
    acc.characters.Aaa.echoes = { 0: { echoId: "e3" }, 1: { echoId: "e2" } };
    const c = compareEntries(entry({}, account(), T0), entry({ mine: 2_100_000 }, acc, T0 + DAY));
    expect(say(c)).toBe("<Aaa>'s build changed.");
  });
});
