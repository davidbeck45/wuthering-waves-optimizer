// Wuthering Tools+ numbers log — what the page shows for a log as it stands: the four states and their sentences, the
// older records to pick from, and when the log is behind the account or the app. Synthetic account, pinned clock.
import { describe, expect, it } from "vitest";
import { entryFromRanking } from "./entry";
import { appendEntry, emptyLog, type LogEntry, type NumbersLog } from "./log";
import { DAY, HOUR, T0, account, ranking } from "./testAccount";
import { EMPTY_TEXT, NO_ACCOUNT_TEXT, agoText, firstRecordText, numbersState, pickedBase, staleness, staleText, summaryText } from "./view";

const BUILD = "0.0.1+abc+aaaaaaaaaaaa";
const entry = (over: Parameters<typeof ranking>[0] = {}, at = T0, build = BUILD): LogEntry => entryFromRanking(ranking(over), account(), { at, build, autoTeamBuffs: true }) as LogEntry;
function logOf(...entries: LogEntry[]): NumbersLog {
  let log = emptyLog();
  for (const e of entries) log = appendEntry(log, e, { fp: "v6:data:9:ia", build: e.build, at: e.at }).log;
  return log;
}

describe("what the page shows", () => {
  it("no account and nothing recorded: says what the page will do, and asks for nothing else", () => {
    expect(numbersState(emptyLog(), false)).toEqual({ kind: "no-account" });
    expect(NO_ACCOUNT_TEXT).toMatch(/^No account in this browser yet\./);
  });

  it("an account and no record yet: where the first one comes from", () => {
    expect(numbersState(emptyLog(), true)).toEqual({ kind: "empty" });
    expect(EMPTY_TEXT).toMatch(/Open My account/);
  });

  it("the first record ever: nothing to compare, and when it was taken", () => {
    const state = numbersState(logOf(entry()), true);
    expect(state.kind).toBe("first");
    expect(firstRecordText(entry(), T0 + 20_000)).toBe("Nothing to compare yet. This is the first record, taken just now.");
    expect(firstRecordText(entry(), T0 + 4 * 60_000)).toBe("Nothing to compare yet. This is the first record, taken 4 min ago.");
    expect(firstRecordText(entry(), T0 + 3 * HOUR)).toBe("Nothing to compare yet. This is the first record, taken 3 h ago.");
    expect(firstRecordText(entry(), T0 + 3 * DAY)).toMatch(/^Nothing to compare yet\. This is the first record, taken on \d{1,2} Nov, \d\d:\d\d\.$/);
    expect(agoText(T0 + 5000, T0)).toBe("just now"); // a clock that went back
  });

  it("two or more: the newest against the one before it, and the older ones to pick from, newest first", () => {
    const log = logOf(entry(), entry({ Aaa: 1_100_000 }, T0 + DAY), entry({ Aaa: 1_210_000 }, T0 + 2 * DAY));
    const state = numbersState(log, true);
    if (state.kind !== "compared") throw new Error(state.kind);
    expect(state.comparison.before.at).toBe(T0 + DAY);
    expect(state.comparison.after.at).toBe(T0 + 2 * DAY);
    expect(state.comparison.moves[0].change).toBeCloseTo(0.1, 10);
    expect(state.choices.map((e) => e.at)).toEqual([T0 + DAY, T0]);
  });

  it("'since' an older record he picked: the whole stretch as one comparison", () => {
    const log = logOf(entry(), entry({ Aaa: 1_100_000 }, T0 + DAY), entry({ Aaa: 1_210_000 }, T0 + 2 * DAY));
    const state = numbersState(log, true, T0);
    if (state.kind !== "compared") throw new Error(state.kind);
    expect(state.comparison.before.at).toBe(T0);
    expect(state.comparison.moves[0]).toMatchObject({ before: 1_000_000, after: 1_210_000 });
    expect(state.comparison.moves[0].change).toBeCloseTo(0.21, 10);
    // a pick that is no longer in the log (it was capped away) falls back to the one before
    const gone = numbersState(log, true, 12345);
    expect(gone.kind === "compared" && gone.comparison.before.at).toBe(T0 + DAY);
  });

  it("shows his pick in the picker only while that record is still in the log", () => {
    const log = logOf(entry(), entry({ Aaa: 1_100_000 }, T0 + DAY), entry({ Aaa: 1_210_000 }, T0 + 2 * DAY));
    const state = numbersState(log, true, T0);
    expect(pickedBase(state, T0)).toBe(T0);
    expect(pickedBase(state, null)).toBeNull();
    expect(pickedBase(state, T0 + DAY)).toBeNull(); // the one before the newest: the default, not a pick
    expect(pickedBase(state, 12345)).toBeNull(); // capped away: the picker falls back with the list
    expect(pickedBase(numbersState(logOf(entry()), true), T0)).toBeNull(); // nothing to pick from
  });

  it("sees an import anywhere in the stretch he picked", () => {
    const second = entry({ Aaa: 1_100_000 }, T0 + DAY);
    second.importedAt = T0 + DAY - 1000;
    const log = logOf(entry(), second, entry({ Aaa: 1_210_000 }, T0 + 2 * DAY));
    const newestOnly = numbersState(log, true);
    const whole = numbersState(log, true, T0);
    expect(newestOnly.kind === "compared" && newestOnly.comparison.importedAt).toBeNull();
    expect(whole.kind === "compared" && whole.comparison.importedAt).toBe(T0 + DAY - 1000);
  });

  it("still shows what was recorded when the account has since gone", () => {
    expect(numbersState(logOf(entry()), false).kind).toBe("first");
  });

  it("counts what moved, what did not, what is new and what went", () => {
    const moved = numbersState(logOf(entry(), entry({ Aaa: 1_100_000, mine: 2_100_000 }, T0 + DAY)), true);
    expect(moved.kind === "compared" && summaryText(moved.comparison)).toBe("2 figures moved, 3 did not.");
    const one = numbersState(logOf(entry(), entry({ Aaa: 1_100_000 }, T0 + DAY)), true);
    expect(one.kind === "compared" && summaryText(one.comparison)).toBe("1 figure moved, 4 did not.");
    const none = numbersState(logOf(entry(), entry({}, T0 + DAY, "0.0.1+abc+bbbbbbbbbbbb")), true); // an update that moved nothing
    expect(none.kind === "compared" && summaryText(none.comparison)).toBe("No figure moved (5 compared).");
    expect(none.kind === "compared" && none.comparison.appUpdated).toBe(true);
  });
});

describe("a log that is behind", () => {
  const seen = { fp: "v6:hash1:9:ia", build: BUILD, at: T0 };

  it("is up to date for the same data and build, whatever the investment option of the run was", () => {
    expect(staleness(seen, { fp: "v6:hash1:9:ia", build: BUILD })).toBeNull();
    expect(staleness({ ...seen, fp: "v6:hash1:9:-a" }, { fp: "v6:hash1:9:ia", build: BUILD })).toBeNull();
    expect(staleness(null, { fp: "v6:hash1:9:ia", build: BUILD })).toBeNull(); // nothing seen yet: the empty state speaks
    expect(staleness(null, { fp: "", build: BUILD }, BUILD)).toBeNull();
  });

  it("says the app was updated, or the account changed, with what to do about it", () => {
    expect(staleness(seen, { fp: "v6:hash1:9:ia", build: "0.0.1+abc+bbbbbbbbbbbb" })).toBe("app");
    expect(staleness(seen, { fp: "v6:hash2:9:ia", build: BUILD })).toBe("account");
    expect(staleness(seen, { fp: "v6:hash1:9:i-", build: BUILD })).toBe("account"); // the team-aware buffs switch
    // only the last build's ranking is in the log (the run after the update has not finished, or failed)
    expect(staleness(null, { fp: "", build: "0.0.1+abc+bbbbbbbbbbbb" }, BUILD)).toBe("app");
    expect(staleText("app")).toMatch(/^The app was updated since the last record\. Open My account/);
    expect(staleText("account")).toMatch(/^Your account changed since the last record\. Open My account/);
  });
});
