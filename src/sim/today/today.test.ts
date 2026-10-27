// Wuthering Tools+: /today — events from Kuro's own text (__fixtures__/patch37.json is article 5571, the 3.7 patch
// notes, cut after the events section; eventNotices.json holds 4368, 4466 and 5365 whole; kuroMenu.json is a trimmed
// real ArticleMenu.json, all fetched 2026-10-26), server resets per region, the endgame cycle math, the Waveplate
// clock, the self-resetting checklist, the calendar file, the stored state and the news cache (fetch mocked — no
// live network).
import { describe, expect, it, vi } from "vitest";
import patch37 from "./__fixtures__/patch37.json";
import eventNotices from "./__fixtures__/eventNotices.json";
import kuroMenu from "./__fixtures__/kuroMenu.json";
import { NEWS_BASE, versionReleases, type KeyValueStorage } from "../convene/banners";
import {
  bucketEvents,
  buildEventList,
  doubleDropMath,
  doubleDropsAt,
  kindOf,
  parseDuration,
  parseNewsArticle,
  versionEndMs,
  type NewsArticle,
} from "./durations";
import { cycleWindow, lastDailyReset, lastWeeklyReset, nextDailyReset, nextWeeklyReset } from "./resets";
import { projectWaveplates, normalizeEntry, dailyRegen } from "./waveplates";
import { countIn, itemState, periodOf, setCount, visibleItems, type ChecklistContext } from "./checklist";
import { buildIcs, icsDate, icsEscape, icsFold, icsSequence } from "./ics";
import { decodeTodayState, TODAY_STATE_KEY, writeTodayState, defaultTodayState } from "./state";
import { decodeNewsCache, emptyNewsCache, loadNews, NEWS_OFFLINE, pickTodayNotices, refreshNewsCache, shareMenuFetch, TODAY_NEWS_KEY, type TodayNewsCache } from "./news";
import { fmtWhen, fmtIn } from "./format";
import { RULES, type ChecklistRule, type TodayRules } from "./rules";

const H = 3_600_000;
const MIN = 60_000;
/** a wall clock at a fixed UTC offset → epoch ms */
const at = (y: number, mo: number, d: number, h: number, mi: number, offset: number) => Date.UTC(y, mo - 1, d, h, mi) - offset * H;

const notes = parseNewsArticle(patch37);
const notices = eventNotices.map(parseNewsArticle);
const releases = versionReleases(kuroMenu);
const ev = (name: string) => notes.events.find((e) => e.name === name)!;

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("parseDuration", () => {
  it("reads the three formats Kuro uses, and drops the rest", () => {
    expect(parseDuration("2026-10-08 04:00 - 2026-10-26 03:59 (server time)")).toEqual({ kind: "range", start: "2026-10-08 04:00", end: "2026-10-26 03:59", tz: "server" });
    expect(parseDuration("2026-10-15 10:00 - 2026-11-01 09:59 (UTC+8)")).toEqual({ kind: "range", start: "2026-10-15 10:00", end: "2026-11-01 09:59", tz: "utc+8" });
    expect(parseDuration("Version 3.7 Update - 2026-11-11 03:59 (server time)")).toEqual({ kind: "version", version: "3.7", end: "2026-11-11 03:59", tz: "server" });
    expect(parseDuration("Permanently available after Version 3.7 update.")).toEqual({ kind: "permanent" });
    expect(parseDuration("2024/6/6 10:00 ~ 2024/6/26 11:59 (server time)")).toEqual({ kind: "range", start: "2024-06-06 10:00", end: "2024-06-26 11:59", tz: "server" });
    // a clock we can't place, or prose
    expect(parseDuration("2026/09/30 - 2026/10/28 (PT)")).toBeNull();
    expect(parseDuration("Until further notice")).toBeNull();
  });
});

describe("parseNewsArticle on the 3.7 patch notes (5571)", () => {
  it("is a patch-notes notice for 3.7", () => {
    expect(notes.kind).toBe("patch-notes");
    expect(notes.version).toBe("3.7");
  });

  it("pairs each Duration line with the heading above it", () => {
    expect(notes.events.map((e) => e.name)).toEqual([
      "Cubie Wars",
      "Dreams in the Capsule",
      "Artisan's Search",
      "Echo Erase",
      "Beyond the Waves: Land of Xuanfang",
      "Gifts of Waking Moon",
      "Gifts of Singing Drizzle",
      "Waking Moon Fishing",
      "Back to Solaris",
    ]);
    expect(ev("Cubie Wars").type).toBe("Leisure Event");
    expect(ev("Artisan's Search").kind).toBe("combat");
    expect(ev("Gifts of Singing Drizzle").kind).toBe("login");
    expect(ev("Waking Moon Fishing").kind).toBe("web");
  });

  it("reads Artisan's Search as 2026-10-08 04:00 → 10-26 03:59 server time", () => {
    expect(ev("Artisan's Search")).toMatchObject({ start: "2026-10-08 04:00", end: "2026-10-26 03:59", tz: "server", articleId: 5571 });
  });

  it("starts a 'Version 3.7 Update - …' event with the version", () => {
    expect(ev("Dreams in the Capsule")).toMatchObject({ start: null, version: "3.7", end: "2026-11-11 03:59", tz: "server" });
    const list = buildEventList([notes], { offsetHours: 8, releases, now: at(2026, 10, 1, 12, 0, 8), rules: RULES });
    const dreams = list.find((e) => e.name === "Dreams in the Capsule")!;
    // the release moment: the 3.7 patch notes went up 2026-09-30 10:00 CST
    expect(dreams.startMs).toBe(at(2026, 9, 30, 10, 0, 8));
    expect(dreams.startApprox).toBe(true);
  });

  it("drops permanent content (the main quest, the Tales quest, the new permanent event)", () => {
    const names = notes.events.map((e) => e.name);
    expect(names).not.toContain("Main Quest");
    expect(names.some((n) => /tales|blooms|permanent/i.test(n))).toBe(false);
  });

  it("keeps the UTC+8 flag on web events, whatever the player's server", () => {
    expect(ev("Waking Moon Fishing").tz).toBe("utc+8");
    expect(ev("Back to Solaris")).toMatchObject({ tz: "utc+8", start: null, version: "3.7", end: "2026-11-11 23:59" });
    const now = at(2026, 10, 20, 12, 0, 8);
    const america = buildEventList([notes], { offsetHours: -5, releases, now });
    const asia = buildEventList([notes], { offsetHours: 8, releases, now });
    const fishing = (l: typeof asia) => l.find((e) => e.name === "Waking Moon Fishing")!;
    expect(fishing(america).startMs).toBe(at(2026, 10, 15, 10, 0, 8));
    expect(fishing(america).endMs).toBe(fishing(asia).endMs);
    // a server-time event moves with the region
    const erase = (l: typeof asia) => l.find((e) => e.name === "Echo Erase")!;
    expect(erase(america).endMs - erase(asia).endMs).toBe(13 * H);
  });
});

describe("parseNewsArticle on stand-alone event notices", () => {
  it("reads the '✦Duration✦' + next line format and names the event from the title", () => {
    const [chord, bountiful, sim] = notices;
    expect(chord!.kind).toBe("event");
    expect(chord!.events).toEqual([
      {
        name: "Chord Cleansing",
        type: "Limited-Time Echo Double Drop Event",
        kind: "double-drop",
        start: "2026-03-11 04:00",
        end: "2026-03-18 03:59",
        tz: "server",
        version: null,
        articleId: 4368,
      },
    ]);
    expect(bountiful!.events[0]).toMatchObject({ name: "Bountiful Crescendo", kind: "double-drop", start: "2026-04-02 04:00" });
    expect(sim!.events[0]).toMatchObject({ name: "Resonance Sim Realm", type: "Combat Event", kind: "combat", end: "2026-09-29 11:59" });
  });

  it("classifies event types", () => {
    expect(kindOf("Bountiful Crescendo", null)).toBe("double-drop");
    expect(kindOf("Beyond the Waves", "Featured Exploration Event")).toBe("exploration");
    expect(kindOf("Echo Erase", "Leisure Event")).toBe("leisure");
    expect(kindOf("Something", null)).toBe("other");
  });
});

describe("buildEventList and the buckets", () => {
  /** Monday 2026-10-26 12:00 on the Asia clock */
  const NOW = at(2026, 10, 26, 12, 0, 8);
  const list = buildEventList([notes, ...notices], { offsetHours: 8, releases, now: NOW });

  it("adds the hand-entered rows for image-only posts (Chord Cleansing, 5653), only once Kuro had posted them", () => {
    const chord = list.find((e) => e.name === "Chord Cleansing" && e.articleId === 5653)!;
    expect(chord).toMatchObject({ source: "manual", kind: "double-drop", startMs: at(2026, 11, 4, 4, 0, 8), endMs: at(2026, 11, 11, 3, 59, 8) + MIN - 1 });
    // 5653 went up 2026-10-20 18:00 CST: a clock before that shows no row for it
    const before = buildEventList([notes], { offsetHours: 8, releases, now: at(2026, 10, 20, 17, 59, 8) });
    expect(before.some((e) => e.articleId === 5653)).toBe(false);
  });

  it("keeps two rows of one notice that share a name apart (distinct ids)", () => {
    const twice: NewsArticle = {
      id: 9001,
      title: "Event Preview | [Twice] Combat Event",
      published: "2026-10-20 10:00:00",
      kind: "event",
      version: null,
      events: [
        { name: "Twice", type: "Combat Event", kind: "combat", start: "2026-10-22 04:00", end: "2026-10-29 03:59", tz: "server", version: null, articleId: 9001 },
        { name: "Twice", type: "Combat Event", kind: "combat", start: "2026-10-29 04:00", end: "2026-11-05 03:59", tz: "server", version: null, articleId: 9001 },
      ],
    };
    const rows = buildEventList([twice], { offsetHours: 8, releases, now: NOW }).filter((e) => e.name === "Twice");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((e) => e.id)).size).toBe(2);
  });

  it("buckets ending soon (≤ 3 days), live and starting soon (≤ 14 days)", () => {
    const b = bucketEvents(list, NOW);
    expect(b.endingSoon.map((e) => e.name)).toEqual([]);
    // Artisan's Search ended at 03:59 this morning
    expect([...b.live, ...b.upcoming].some((e) => e.name === "Artisan's Search")).toBe(false);
    expect(b.live.map((e) => e.name)).toEqual([
      "Waking Moon Fishing",
      "Echo Erase",
      "Dreams in the Capsule",
      "Gifts of Waking Moon",
      "Gifts of Singing Drizzle",
      "Cubie Wars",
      "Back to Solaris",
    ]);
    expect(b.upcoming.map((e) => e.name)).toEqual(["Beyond the Waves: Land of Xuanfang", "Chord Cleansing"]);
    const later = bucketEvents(list, at(2026, 10, 30, 12, 0, 8));
    expect(later.endingSoon.map((e) => e.name)).toEqual(["Waking Moon Fishing"]);
  });

  it("never lists a version that hasn't gone live, nor upcoming rows past the live version's end", () => {
    const next: NewsArticle = {
      id: 9999,
      title: "Event Preview | [Somewhere New] Exploration Event Coming Soon!",
      published: "2026-10-26 18:00:00",
      kind: "event",
      version: null,
      events: [
        { name: "Version 3.8 thing", type: "Leisure Event", kind: "leisure", start: null, end: "2026-12-20 03:59", tz: "server", version: "3.8", articleId: 9999 },
        { name: "After the version", type: "Leisure Event", kind: "leisure", start: "2026-11-13 04:00", end: "2026-11-30 03:59", tz: "server", version: null, articleId: 9999 },
        { name: "Inside the version", type: "Leisure Event", kind: "leisure", start: "2026-11-01 04:00", end: "2026-11-08 03:59", tz: "server", version: null, articleId: 9999 },
      ],
    };
    const names = buildEventList([notes, next], { offsetHours: 8, releases, now: NOW }).map((e) => e.name);
    expect(names).not.toContain("Version 3.8 thing");
    expect(names).not.toContain("After the version");
    expect(names).toContain("Inside the version");
    // 3.7 ends with the 3.8 maintenance (5529: 2026-11-12, before maintenance)
    expect(versionEndMs("3.7", releases)).toBe(at(2026, 11, 12, 4, 0, 8));
  });

  it("lets Kuro's text win over a hand-entered row of the same event", () => {
    const parsedChord: NewsArticle = {
      id: 5700,
      title: "[Chord Cleansing] Limited-Time Echo Double Drop Event",
      published: "2026-11-03 11:00:00",
      kind: "event",
      version: null,
      events: [{ name: "Chord Cleansing", type: "Limited-Time Echo Double Drop Event", kind: "double-drop", start: "2026-11-04 04:00", end: "2026-11-11 03:59", tz: "server", version: null, articleId: 5700 }],
    };
    const chords = buildEventList([notes, parsedChord], { offsetHours: 8, releases, now: NOW }).filter((e) => e.name === "Chord Cleansing");
    expect(chords).toHaveLength(1);
    expect(chords[0]).toMatchObject({ articleId: 5700, source: "kuro" });
  });

  it("states a live double drop as numbers: 3 claims a day, each one extra run", () => {
    const during = at(2026, 11, 5, 12, 0, 8);
    const live = doubleDropsAt(buildEventList([notes], { offsetHours: 8, releases, now: during }), during);
    expect(live).toHaveLength(1);
    expect(live[0]!.rule).toMatchObject({ id: "chord-cleansing", claimsPerDay: 3, costPerClaim: 60 });
    expect(doubleDropMath(live[0]!.rule, 7)).toEqual({ extraRunsPerDay: 3, extraRuns: 21, waveplatesPerDay: 180 });
    // below a day's regeneration: banking Waveplates for it gains nothing
    expect(doubleDropMath(live[0]!.rule, 1).waveplatesPerDay).toBeLessThan(dailyRegen());
    expect(doubleDropsAt(list, NOW)).toEqual([]);
  });
});

describe("resets", () => {
  it("turns the week at Monday 04:00 on the Asia clock (UTC+8)", () => {
    const before = at(2026, 10, 26, 3, 59, 8);
    expect(lastWeeklyReset(before, 8)).toBe(at(2026, 10, 19, 4, 0, 8));
    expect(nextWeeklyReset(before, 8)).toBe(at(2026, 10, 26, 4, 0, 8));
    expect(lastWeeklyReset(at(2026, 10, 26, 4, 0, 8), 8)).toBe(at(2026, 10, 26, 4, 0, 8));
  });

  it("turns it at Monday 04:00 UTC+1 in Europe and 04:00 UTC−5 in America", () => {
    expect(nextWeeklyReset(at(2026, 10, 25, 22, 0, 1), 1)).toBe(Date.UTC(2026, 9, 26, 3, 0));
    expect(nextWeeklyReset(at(2026, 10, 25, 22, 0, -5), -5)).toBe(Date.UTC(2026, 9, 26, 9, 0));
    // Monday 08:59 UTC is still last week in America, already this week in Asia and Europe
    const t = Date.UTC(2026, 9, 26, 8, 59);
    expect(lastWeeklyReset(t, -5)).toBe(at(2026, 10, 19, 4, 0, -5));
    expect(lastWeeklyReset(t, 1)).toBe(at(2026, 10, 26, 4, 0, 1));
    expect(lastWeeklyReset(t, 8)).toBe(at(2026, 10, 26, 4, 0, 8));
  });

  it("turns the day at 04:00 server time", () => {
    expect(lastDailyReset(at(2026, 10, 27, 3, 0, 8), 8)).toBe(at(2026, 10, 26, 4, 0, 8));
    expect(nextDailyReset(at(2026, 10, 27, 3, 0, 8), 8)).toBe(at(2026, 10, 27, 4, 0, 8));
    expect(nextDailyReset(at(2026, 10, 27, 4, 0, -5), -5)).toBe(at(2026, 10, 28, 4, 0, -5));
  });

  it("runs the endgame cycles every 28 days from their anchors", () => {
    const toa = RULES.cycles.find((c) => c.id === "toa")!;
    const ww = RULES.cycles.find((c) => c.id === "ww")!;
    const now = at(2026, 10, 26, 12, 0, 8);
    expect(cycleWindow(toa, now, 8)).toEqual({ startMs: at(2026, 10, 12, 4, 0, 8), nextMs: at(2026, 11, 9, 4, 0, 8), index: 0, season: 41 });
    const next = cycleWindow(toa, at(2026, 11, 9, 4, 0, 8), 8)!;
    expect(next.season).toBe(42);
    expect(next.startMs).toBe(at(2026, 11, 9, 4, 0, 8));
    // a season ago, and the wiki's 2026-01-05 floor page is a cycle start
    expect(cycleWindow(toa, at(2026, 10, 1, 0, 0, 8), 8)!.startMs).toBe(at(2026, 9, 14, 4, 0, 8));
    expect(cycleWindow(toa, at(2026, 1, 5, 4, 0, 8), 8)!.startMs).toBe(at(2026, 1, 5, 4, 0, 8));
    // Whimpering Wastes turned this morning; the cycles follow the region's own 04:00
    expect(cycleWindow(ww, now, 8)!.startMs).toBe(at(2026, 10, 26, 4, 0, 8));
    expect(cycleWindow(ww, now, 8)!.nextMs).toBe(at(2026, 11, 23, 4, 0, 8));
    expect(cycleWindow(ww, at(2026, 10, 26, 3, 0, -5), -5)!.nextMs).toBe(at(2026, 10, 26, 4, 0, -5));
  });
});

describe("waveplates", () => {
  const noon = at(2026, 10, 26, 12, 0, 8);

  it("fills 100 typed at 12:00 by 02:00 (1 per 6 min to 240)", () => {
    const p = projectWaveplates({ value: 100, crystals: 0, atMs: noon }, noon);
    expect(p.fullAt).toBe(at(2026, 10, 27, 2, 0, 8));
    expect(p.waveplates).toBe(100);
    expect(projectWaveplates({ value: 100, crystals: 0, atMs: noon }, noon + 61 * MIN).waveplates).toBe(110);
  });

  it("overflows into crystals at half speed, capped at 480", () => {
    const full = at(2026, 10, 27, 2, 0, 8);
    const p = projectWaveplates({ value: 100, crystals: 0, atMs: noon }, full + 60 * MIN);
    expect(p).toMatchObject({ waveplates: 240, crystals: 5, full: true, crystalsFull: false });
    expect(p.crystalsFullAt).toBe(full + 480 * 12 * MIN);
    expect(projectWaveplates({ value: 100, crystals: 0, atMs: noon }, full + 200 * H)).toMatchObject({ crystals: 480, crystalsFull: true });
  });

  it("doesn't regenerate above the cap; crystals fill from the moment it's typed", () => {
    const p = projectWaveplates({ value: 300, crystals: 470, atMs: noon }, noon + 30 * MIN);
    expect(p).toMatchObject({ waveplates: 300, crystals: 472, fullAt: null, full: true });
    expect(p.crystalsFullAt).toBe(noon + 10 * 12 * MIN);
  });

  it("cleans a typed entry", () => {
    expect(normalizeEntry({ value: -5.5, crystals: 9999, atMs: Number.NaN })).toEqual({ value: 0, crystals: 480, atMs: 0 });
    expect(normalizeEntry({ value: 12.9, crystals: 3.2, atMs: 5 })).toEqual({ value: 12, crystals: 3, atMs: 5 });
  });
});

describe("checklist", () => {
  const weekly = RULES.checklist.find((r) => r.id === "weekly-boss")!;
  const daily = RULES.checklist.find((r) => r.id === "daily-activity")!;
  const toaItem = RULES.checklist.find((r) => r.id === "toa-hazard")!;
  const matrixItem = RULES.checklist.find((r) => r.id === "matrix-phase")!;
  const ctx = (now: number, offsetHours = 8, phase: ChecklistContext["phase"] = null): ChecklistContext => ({ now, offsetHours, phase });

  it("clears a weekly item ticked on Sunday at Monday 04:00 server time", () => {
    const sunday = at(2026, 10, 25, 20, 0, 8);
    const ticks = setCount({}, weekly, 3, sunday);
    expect(itemState(weekly, ticks[weekly.id], ctx(at(2026, 10, 26, 3, 59, 8)))).toMatchObject({ count: 3, done: true, resetsAt: at(2026, 10, 26, 4, 0, 8) });
    expect(itemState(weekly, ticks[weekly.id], ctx(at(2026, 10, 26, 4, 0, 8)))).toMatchObject({ count: 0, done: false });
    // in Europe the same Sunday tick lasts until Monday 04:00 UTC+1
    const euTick = setCount({}, weekly, 2, at(2026, 10, 25, 20, 0, 1));
    expect(itemState(weekly, euTick[weekly.id], ctx(at(2026, 10, 26, 3, 59, 1), 1)).count).toBe(2);
    expect(itemState(weekly, euTick[weekly.id], ctx(at(2026, 10, 26, 4, 0, 1), 1)).count).toBe(0);
  });

  it("clears daily items at 04:00 and cycle items at the cycle's turn", () => {
    const t = at(2026, 10, 26, 23, 0, 8);
    const ticks = setCount(setCount({}, daily, 1, t), toaItem, 1, t);
    expect(itemState(daily, ticks[daily.id], ctx(at(2026, 10, 27, 3, 59, 8))).done).toBe(true);
    expect(itemState(daily, ticks[daily.id], ctx(at(2026, 10, 27, 4, 0, 8))).done).toBe(false);
    expect(itemState(toaItem, ticks[toaItem.id], ctx(at(2026, 11, 9, 3, 59, 8))).done).toBe(true);
    expect(itemState(toaItem, ticks[toaItem.id], ctx(at(2026, 11, 9, 4, 0, 8))).done).toBe(false);
    expect(periodOf("cycle:toa", ctx(t))?.approx).toBe(true);
  });

  it("clears the Matrix phase with the version, and keeps a tick when the phase isn't known", () => {
    const t = at(2026, 10, 26, 12, 0, 8);
    const ticks = setCount({}, matrixItem, 1, t);
    const phase37 = { startMs: at(2026, 9, 30, 10, 0, 8), endMs: at(2026, 11, 12, 4, 0, 8), approx: true };
    const phase38 = { startMs: at(2026, 11, 12, 11, 0, 8), endMs: null, approx: true };
    expect(itemState(matrixItem, ticks[matrixItem.id], ctx(t, 8, phase37)).done).toBe(true);
    expect(itemState(matrixItem, ticks[matrixItem.id], ctx(at(2026, 11, 13, 0, 0, 8), 8, phase38)).done).toBe(false);
    expect(itemState(matrixItem, ticks[matrixItem.id], ctx(t)).done).toBe(true);
  });

  it("clamps counts, forgets zeros, and shows the double-claims counter only during a double drop", () => {
    const ticks = setCount({}, weekly, 9, 1000);
    expect(ticks[weekly.id]).toEqual({ n: 3, at: 1000 });
    expect(setCount(ticks, weekly, 0, 2000)).toEqual({});
    expect(countIn({ n: 2, at: 5 }, { startMs: 10, nextMs: 20 }, 3)).toBe(0);
    const ids = (live: boolean) => visibleItems(RULES.checklist, { hidden: ["targeted-merge"], doubleDropLive: live }).map((r) => r.id);
    expect(ids(false)).not.toContain("double-claims");
    expect(ids(true)).toContain("double-claims");
    expect(ids(true)).not.toContain("targeted-merge");
  });

  it("has a source on every capped rule", () => {
    const capped = RULES.checklist.filter((r: ChecklistRule) => r.reset === "daily" || r.reset === "weekly");
    for (const r of capped) expect(r.source?.articleId ?? r.source?.url, r.id).toBeTruthy();
  });
});

describe("ics", () => {
  it("writes a valid VEVENT with UTC timestamps, escaping and folding", () => {
    const start = at(2026, 10, 27, 2, 0, 8);
    const text = buildIcs([{ uid: "waveplates-full", start, title: "Waveplates full (240)", description: "Spend them; or they go to crystals, at half speed", alarmMinutes: 0 }], Date.UTC(2026, 9, 26, 4, 0));
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text).toContain("BEGIN:VEVENT\r\nUID:waveplates-full@wtplus\r\nDTSTAMP:20261026T040000Z\r\nSEQUENCE:429360\r\nDTSTART:20261026T180000Z\r\nDTEND:20261026T181500Z\r\n");
    // a later file for the same UID carries a higher SEQUENCE, so calendars that honour it update the entry
    expect(icsSequence(Date.UTC(2026, 9, 26, 4, 1))).toBe(429361);
    expect(text).toContain("DESCRIPTION:Spend them\\; or they go to crystals\\, at half speed");
    expect(text).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\n");
    expect(text).toContain("TRIGGER:-PT0M");
    expect(text.trimEnd().endsWith("END:VEVENT\r\nEND:VCALENDAR")).toBe(true);
    expect(text.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(icsDate(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe("20260102T030405Z");
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const folded = icsFold("SUMMARY:" + "★".repeat(40));
    expect(folded.split("\r\n ").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "★".repeat(40));
  });
});

describe("stored state", () => {
  it("round-trips and drops what it can't read", () => {
    const storage = memoryStorage();
    const s = { ...defaultTodayState(), waveplates: { value: 120, crystals: 30, atMs: 5 }, ticks: { "weekly-boss": { n: 2, at: 9 } }, hidden: ["absorption-13"], timeMode: "server" as const };
    writeTodayState(s, storage);
    expect(decodeTodayState(storage.data.get(TODAY_STATE_KEY)!)).toEqual(s);
    expect(decodeTodayState("{not json")).toEqual(defaultTodayState());
    expect(decodeTodayState(JSON.stringify({ v: 2, hidden: ["x"] }))).toEqual(defaultTodayState());
    const bad = decodeTodayState(JSON.stringify({ v: 1, waveplates: { value: "a" }, ticks: { "weekly-boss": { n: -1, at: 1 }, "BAD ID": { n: 1, at: 1 } }, hidden: [1, "ok-id"], timeMode: "utc" }));
    expect(bad).toMatchObject({ waveplates: null, ticks: {}, hidden: ["ok-id"], timeMode: "local" });
  });
});

describe("news cache", () => {
  const NOW = at(2026, 10, 26, 12, 0, 8);

  it("picks the two newest patch notes and the event notices of the last 60 days", () => {
    const ids = pickTodayNotices(kuroMenu, NOW).map((e) => e.articleId);
    expect(ids).toEqual([5571, 5357, 5555]);
    // "Update Content | Version 3.7 … Planned for Release" (5529) is a pre-release post, not patch notes
    expect(ids).not.toContain(5529);
    // a notice is read only once it is posted: the day before 3.7's patch notes, 3.6's and 3.4's are the newest
    expect(pickTodayNotices(kuroMenu, at(2026, 9, 29, 12, 0, 8)).map((e) => e.articleId)).toEqual([5357, 4819, 5365]);
  });

  function fakeFetch(handlers: Record<string, () => unknown>) {
    return vi.fn(async (url: string) => {
      const path = String(url).replace(NEWS_BASE, "");
      const h = handlers[path];
      if (!h) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(h()), { status: 200 });
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  }

  it("fetches what it doesn't hold, keeps what it does, and records release times", async () => {
    const fetchImpl = fakeFetch({ "/ArticleMenu.json": () => kuroMenu, "/article/5571.json": () => patch37, "/article/5555.json": () => ({ articleContent: "<div>image only</div>" }) });
    const fresh = await refreshNewsCache(emptyNewsCache(), { fetchImpl, now: NOW });
    expect(Object.keys(fresh.articles).sort()).toEqual(["5555", "5571"]);
    expect(fresh.articles["5571"]!.events).toHaveLength(9);
    expect(fresh.releases["3.7"]).toBe("2026-09-30 10:00:00");
    expect(fresh.fetchedAt).toBe(NOW);
    // 5357 failed (404) and is retried; 5571 is held and not fetched again
    fetchImpl.mockClear();
    const again = await refreshNewsCache(fresh, { fetchImpl, now: NOW + H });
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/article/5571.json"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/article/5357.json"))).toBe(true);
    expect(again.articles["5571"]).toBe(fresh.articles["5571"]);
    await expect(refreshNewsCache(fresh, { fetchImpl: fakeFetch({}), now: NOW })).rejects.toThrow();
  });

  it("serves the cache while fresh, refreshes when stale, keeps it when the feed is down", async () => {
    const cache: TodayNewsCache = { v: 1, fetchedAt: NOW - H, articles: { "5571": notes }, releases };
    const storage = memoryStorage({ [TODAY_NEWS_KEY]: JSON.stringify(cache) });
    const fresh = loadNews({ storage, now: NOW, fetchImpl: fakeFetch({}) });
    expect(fresh.refreshed).toBeNull();
    expect(fresh.feed).toMatchObject({ source: "cache", stale: false });
    const down = loadNews({ storage, now: NOW + 25 * H, fetchImpl: fakeFetch({}) });
    expect(down.feed.stale).toBe(true);
    const result = await down.refreshed!;
    expect(result).toMatchObject({ error: NEWS_OFFLINE, source: "cache" });
    expect(result.cache.articles["5571"]!.events).toHaveLength(9);
    const up = await loadNews({ storage, now: NOW + 25 * H, fetchImpl: fakeFetch({ "/ArticleMenu.json": () => kuroMenu, "/article/5571.json": () => patch37 }) }).refreshed!;
    expect(up).toMatchObject({ source: "network", error: null });
    expect(decodeNewsCache(storage.data.get(TODAY_NEWS_KEY)!)!.fetchedAt).toBe(NOW + 25 * H);
    // nothing stored, offline: an empty feed with the message
    const none = await loadNews({ storage: memoryStorage(), now: NOW, fetchImpl: fakeFetch({}) }).refreshed!;
    expect(none).toMatchObject({ source: "none", error: NEWS_OFFLINE });
  });

  it("decodes defensively", () => {
    expect(decodeNewsCache("nope")).toBeNull();
    expect(decodeNewsCache(JSON.stringify({ v: 9, fetchedAt: 1, articles: {} }))).toBeNull();
    const d = decodeNewsCache(JSON.stringify({ v: 1, fetchedAt: 1, articles: { "1": { id: 1, published: "x", events: [{ name: "ok", start: null, end: "2026-01-01 03:59", tz: "server", articleId: 1 }, { name: "bad", end: "never", tz: "server", articleId: 1 }] } }, releases: { "3.7": "2026-09-30 10:00:00", bad: "x" } }));
    expect(d!.articles["1"]!.events.map((e) => e.name)).toEqual(["ok"]);
    expect(d!.releases).toEqual({ "3.7": "2026-09-30 10:00:00" });
  });

  it("reads the menu once for every caller in a page load", async () => {
    const base = fakeFetch({ "/ArticleMenu.json": () => kuroMenu });
    const shared = shareMenuFetch(base);
    const [a, b] = await Promise.all([shared(`${NEWS_BASE}/ArticleMenu.json`), shared(`${NEWS_BASE}/ArticleMenu.json`)]);
    expect(await a.json()).toEqual(kuroMenu);
    expect(await b.json()).toEqual(kuroMenu);
    expect(base).toHaveBeenCalledTimes(1);
    await shared(`${NEWS_BASE}/article/1.json`);
    expect(base).toHaveBeenCalledTimes(2);
  });
});

describe("format", () => {
  it("says times the way people do", () => {
    const now = at(2026, 10, 26, 12, 0, 8);
    expect(fmtWhen(at(2026, 10, 26, 21, 34, 8), now, "server", 8)).toBe("21:34 today");
    expect(fmtWhen(at(2026, 10, 27, 4, 0, 8), now, "server", 8)).toBe("04:00 tomorrow");
    expect(fmtWhen(at(2026, 10, 29, 14, 0, 8), now, "server", 8)).toBe("Thu 14:00");
    expect(fmtWhen(at(2026, 11, 9, 3, 59, 8), now, "server", 8)).toBe("Nov 9, 03:59");
    expect(fmtIn(now + 3 * H + 10 * MIN, now)).toBe("in 3h 10m");
    expect(fmtIn(now - 2 * MIN, now)).toBe("2m ago");
  });

  it("keeps rules typed", () => {
    const r: TodayRules = RULES;
    expect(r.waveplates).toMatchObject({ max: 240, regenMinutes: 6, crystalMax: 480, crystalRegenMinutes: 12 });
  });
});
