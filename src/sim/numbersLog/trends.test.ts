// Wuthering Tools+ numbers log — "Over time": the log read as one line per figure. Synthetic account (testAccount.ts).
import { describe, expect, it } from "vitest";
import { causeText, compareEntries, type Namer } from "./compare";
import { entryFromRanking, type RankedAccount } from "./entry";
import { appendEntry, decodeLog, emptyLog, encodeLog, MAX_ENTRIES, type LogEntry, type NumbersLog } from "./log";
import { DAY, HOUR, T0, account, ranking, teamRank } from "./testAccount";
import { bestSavedTeam, buildTrends, DID_NOT_MOVE_TEXT, lineRuns, NO_CAUSE_TEXT, trendChangeText, trendList, trendNote, trendSteps, type Trend } from "./trends";
import { IMPORT_CARD_TEXT } from "./view";

const BUILD = "0.0.1+abc+aaaaaaaaaaaa";
const NEXT_BUILD = "0.0.1+abc+bbbbbbbbbbbb";
const names: Namer = { character: (id) => `<${id}>`, weapon: (key) => (key ? `[${key}]` : "no weapon") };

const entry = (over: Parameters<typeof ranking>[0] = {}, at = T0, opts: { acc?: RankedAccount; build?: string; auto?: boolean; teams?: ReturnType<typeof teamRank>[] } = {}): LogEntry => {
  const r = ranking(over);
  if (opts.teams) r.teams = opts.teams;
  return entryFromRanking(r, opts.acc ?? account(), { at, build: opts.build ?? BUILD, autoTeamBuffs: opts.auto ?? true }) as LogEntry;
};
const logOf = (...entries: LogEntry[]): NumbersLog => ({ entries, seen: null });
const trend = (log: NumbersLog, key: string): Trend => buildTrends(log).find((t) => t.key === key)!;

describe("over time: the lines", () => {
  it("draws one point per record, oldest first, and reads the change from the first to the newest", () => {
    const log = logOf(entry({}, T0), entry({ Aaa: 1_100_000 }, T0 + DAY), entry({ Aaa: 1_200_000 }, T0 + 2 * DAY));
    const t = trend(log, "c:Aaa");
    expect(t.points.map((p) => p.value)).toEqual([1_000_000, 1_100_000, 1_200_000]);
    expect(t.points.map((p) => p.at)).toEqual([T0, T0 + DAY, T0 + 2 * DAY]);
    expect(t).toMatchObject({ kind: "character", group: "character", moved: true, delta: 200_000, current: true });
    expect(t.change).toBeCloseTo(0.2, 10);
    expect(trendChangeText(t, (n) => n.toLocaleString("en-US"), () => "9 Nov")).toBe("up 20.0 % of the first figure, +200,000 damage since 9 Nov");
  });

  it("leaves a gap where a team was not in a record, never a zero, and does not join the line across it", () => {
    const mine = teamRank("t-mine", 2_000_000);
    const stock = teamRank("wuwa_calc:Aaa hypercarry", 2_400_000);
    const log = logOf(entry({}, T0, { teams: [mine, stock] }), entry({}, T0 + DAY, { teams: [stock] }), entry({}, T0 + 2 * DAY, { teams: [teamRank("t-mine", 2_200_000), stock] }));
    const t = trend(log, "t:t-mine");
    expect(t.points.map((p) => p.value)).toEqual([2_000_000, null, 2_200_000]);
    expect(lineRuns(t.points)).toEqual([[0], [2]]);
    expect(t.group).toBe("saved");
  });

  it("breaks a team's line where the team-aware buffs switch was flipped, and reads the change inside the newest stretch", () => {
    const log = logOf(entry({ mine: 2_000_000 }, T0), entry({ mine: 2_100_000 }, T0 + DAY), entry({ mine: 1_500_000 }, T0 + 2 * DAY, { auto: false }), entry({ mine: 1_650_000 }, T0 + 3 * DAY, { auto: false }));
    const t = trend(log, "t:t-mine");
    expect(t.points.map((p) => p.seg)).toEqual([0, 0, 1, 1]);
    expect(lineRuns(t.points)).toEqual([[0, 1], [2, 3]]);
    expect(t.switched).toBe(true);
    expect(t.first).toMatchObject({ value: 1_500_000, index: 2 });
    expect(t.change).toBeCloseTo(0.1, 10);
    // a character's figure is scored solo: the switch does not break it
    expect(trend(log, "c:Aaa").points.map((p) => p.seg)).toEqual([0, 0, 0, 0]);
    const step = trendSteps(log, t, names).find((s) => s.to === 2)!;
    expect(step.marks).toEqual(["switch"]);
    expect(step.text).toBe("The team-aware buffs switch was turned off.");
    expect(trendNote(t)).toContain("the line breaks there");
    // the newest record alone on its side of the switch: nothing to compare it with, said so, never "no change"
    const alone = trend(logOf(entry({ mine: 2_000_000 }, T0), entry({ mine: 1_500_000 }, T0 + DAY, { auto: false })), "t:t-mine");
    expect(trendChangeText(alone, String, () => "9 Nov")).toBe("nothing to compare with since the team-aware buffs switch was flipped");
    expect(trendNote(alone)).toContain("not compared with the ones before");
  });

  it("sorts lines by the size of the change, largest first, in three groups, and folds the ones that never moved", () => {
    const log = logOf(entry({}, T0), entry({ Aaa: 1_020_000, Ccc: 150_000, stock: 2_160_000 }, T0 + DAY));
    const l = trendList(buildTrends(log));
    expect(l.characters.map((t) => t.id)).toEqual(["Ccc", "Aaa"]); // +25 %, +2 %
    expect(l.stock.map((t) => t.id)).toEqual(["wuwa_calc:Aaa hypercarry"]);
    expect(l.saved).toEqual([]);
    expect(l.unmoved).toEqual({ saved: 1, characters: 1, stock: 0 });
  });

  it("a line that went down and came back is a line that moved, with no change from first to newest", () => {
    const log = logOf(entry({}, T0), entry({ Bbb: 300_000 }, T0 + DAY), entry({}, T0 + 2 * DAY));
    const t = trend(log, "c:Bbb");
    expect(t.moved).toBe(true);
    expect(t.delta).toBe(0);
    expect(trendChangeText(t, String, () => "9 Nov")).toBe("no change since 9 Nov");
    expect(trendList(buildTrends(log)).characters.map((x) => x.id)).toEqual(["Bbb"]);
  });

  it("is nothing for an empty log, and a single point for one record", () => {
    expect(buildTrends(emptyLog())).toEqual([]);
    const t = trend(logOf(entry()), "c:Aaa");
    expect(t.points).toHaveLength(1);
    expect(t.moved).toBe(false);
    expect(lineRuns(t.points)).toEqual([[0]]);
  });

  it("finds the account's best saved team in the newest record", () => {
    const log = logOf(entry({ mine: 2_000_000 }, T0), entry({ mine: 2_300_000 }, T0 + DAY));
    expect(bestSavedTeam(buildTrends(log))?.id).toBe("t-mine");
    expect(bestSavedTeam(buildTrends(logOf(entry({}, T0, { teams: [teamRank("wuwa_calc:x", 1)] }))))).toBeNull();
  });
});

describe("over time: the marks and their words", () => {
  it("marks an app update, with compare.ts's words, and says when nothing recorded explains a step", () => {
    const log = logOf(entry({}, T0), entry({ Aaa: 1_100_000 }, T0 + DAY, { build: NEXT_BUILD }), entry({ Aaa: 1_050_000 }, T0 + 2 * DAY, { build: NEXT_BUILD }));
    const steps = trendSteps(log, trend(log, "c:Aaa"), names);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ from: 0, to: 1, before: 1_000_000, after: 1_100_000, marks: ["update"], change: "+10.0 %", text: "An app update: no build in it changed." });
    expect(steps[1]).toMatchObject({ marks: [], text: NO_CAUSE_TEXT });
  });

  it("names the step's cause exactly as the two-record comparison does", () => {
    const acc = account();
    acc.characters.Aaa.weapon = "SwordTwo";
    const a = entry({}, T0);
    const b = entry({ Aaa: 900_000, mine: 1_900_000 }, T0 + DAY, { acc });
    const log = logOf(a, b);
    const c = compareEntries(a, b);
    for (const key of ["c:Aaa", "t:t-mine"]) {
      const t = trend(log, key);
      const m = c.moves.find((x) => x.id === t.id)!;
      const [step] = trendSteps(log, t, names);
      expect(step.text).toBe(causeText(m.cause, names, false, m.kind));
      expect(step.marks).toContain("build");
    }
  });

  it("marks a Sync, a team edit and an import between two records", () => {
    const synced = account();
    synced.teams[0].actions = [{ id: "a2", characterId: "Bbb" }];
    synced.teams[0].syncedAt = T0 + 12 * HOUR;
    const edited = account();
    edited.teams[0].duration = 25;
    const log = logOf(entry({}, T0), entry({ mine: 2_200_000 }, T0 + DAY, { acc: synced }), { ...entry({ mine: 2_250_000 }, T0 + 2 * DAY, { acc: edited }), importedAt: T0 + 2 * DAY - HOUR });
    const steps = trendSteps(log, trend(log, "t:t-mine"), names);
    expect(steps[0].marks).toEqual(["synced"]);
    expect(steps[0].text).toContain("You synced this team with Team rankings");
    expect(steps[1].marks).toEqual(["import", "team"]);
    expect(steps[1].text.startsWith(IMPORT_CARD_TEXT)).toBe(true);
    expect(steps[1].text).toContain("This team is different"); // an import: nothing is put on "you"
  });

  it("marks a known event where the figure did not move, and says it did not", () => {
    const log = logOf(entry({}, T0), entry({}, T0 + DAY, { build: NEXT_BUILD }));
    const [step] = trendSteps(log, trend(log, "c:Bbb"), names);
    expect(step.marks).toEqual(["update"]);
    expect(step.text.endsWith(DID_NOT_MOVE_TEXT)).toBe(true);
  });

  it("reads a step across a gap as one step, from the record before the gap", () => {
    const stock = teamRank("wuwa_calc:Aaa hypercarry", 2_400_000);
    const log = logOf(entry({}, T0), entry({}, T0 + DAY, { teams: [stock] }), entry({ mine: 2_400_000 }, T0 + 2 * DAY));
    const steps = trendSteps(log, trend(log, "t:t-mine"), names);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ from: 0, to: 2, before: 2_000_000, after: 2_400_000 });
  });
});

describe("over time: at the caps", () => {
  it("draws a log at its caps (30 records, 100 teams) in well under a frame budget per figure", () => {
    const teams = (k: number) => [teamRank("t-mine", 2_000_000 + k * 1000), ...Array.from({ length: 99 }, (_, i) => teamRank(`wuwa_calc:Stock ${i}`, 1_000_000 + ((i * k) % 7) * 1000))];
    let log = emptyLog();
    for (let k = 0; k < 40; k++) log = appendEntry(log, entry({ Aaa: 1_000_000 + k }, T0 + k * HOUR, { teams: teams(k) }), null).log;
    const stored = decodeLog(encodeLog(log));
    expect(stored.entries).toHaveLength(MAX_ENTRIES);
    const started = performance.now();
    const trends = buildTrends(stored);
    const list = trendList(trends);
    for (const t of [...list.saved, ...list.characters, ...list.stock]) lineRuns(t.points);
    const steps = trendSteps(stored, trends.find((t) => t.key === "t:t-mine")!, names);
    const ms = performance.now() - started;
    expect(trends).toHaveLength(103);
    expect(trends.every((t) => t.points.length === MAX_ENTRIES)).toBe(true);
    expect(steps).toHaveLength(MAX_ENTRIES - 1);
    expect(ms).toBeLessThan(250);
  });
});
