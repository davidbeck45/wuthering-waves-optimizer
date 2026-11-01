// Wuthering Tools+ AI tools — the /today page headless (src/sim/today/): the daily and weekly resets on the player's
// server clock, the Waveplates they logged (when they are full), the events ending soon / running / starting soon read
// from Kuro's own notices, double drops, the endgame cycles and the Convene banners running now. Reads the page's own
// caches: an event list exists only once /today has fetched Kuro's notices in this browser.
import seedFile from "../../convene/data/bannerSeed.json";
import { BANNER_CACHE_KEY, liveBanners, loadBanners, type BannerCache } from "../../convene/banners";
import { CONVENE_PREFS_KEY, guessServerRegion, readConvenePrefs, serverOffsetHours } from "../../convene/prefs";
import { bucketEvents, buildEventList, doubleDropsAt, type TimedEvent } from "../../today/durations";
import { fmtIn, fmtWhen } from "../../today/format";
import { readNewsCache, TODAY_NEWS_KEY } from "../../today/news";
import { cycleWindow, nextDailyReset, nextWeeklyReset, utcLabel } from "../../today/resets";
import { RULES } from "../../today/rules";
import { readTodayState, TODAY_STATE_KEY } from "../../today/state";
import { projectWaveplates } from "../../today/waveplates";
import { compactJson, defineTool, topN } from "./shared";

const seed = ((seedFile as { default?: unknown }).default ?? seedFile) as unknown as BannerCache;

export const todayTool = defineTool<Record<string, never>>({
  name: "today",
  description:
    "The /today page: what to do before the reset, on the player's server clock (Asia / Europe / America, from their Convene " +
    "setting or time zone): the next daily reset (04:00) and weekly reset (Monday 04:00) with countdowns; the Waveplates they " +
    "logged on /today projected to now and when they are full (1 per 6 min to 240); events ending within 3 days, running, and " +
    "starting within 14 days, with end times, read from Kuro's own patch notes and notices; double-drop events running now " +
    "and their claim rule; the endgame cycles (Tower of Adversity, Whimpering Wastes: community dates, check in game); and the " +
    "Convene banners running now. Times are the device's own clock ('21:34 today') plus a countdown. Events are known only " +
    "once /today has loaded Kuro's notices in this browser; the tool says when it hasn't.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  provenance: "Kuro's notices + the reset rules · /today",
  reads: [TODAY_NEWS_KEY, TODAY_STATE_KEY, CONVENE_PREFS_KEY, BANNER_CACHE_KEY],
  async run(_input, ctx) {
    const now = ctx.now.getTime();
    const storage = ctx.storage ?? null;
    const prefs = readConvenePrefs(storage);
    const server = prefs.server ?? guessServerRegion(-ctx.now.getTimezoneOffset());
    const offset = serverOffsetHours(server);
    const when = (ms: number): string => `${fmtWhen(ms, now, "local", offset)} (${fmtIn(ms, now)})`;
    const daily = nextDailyReset(now, offset, RULES.resets.hour);
    const weekly = nextWeeklyReset(now, offset, RULES.resets.hour, RULES.resets.weekday);

    const news = readNewsCache(storage);
    const events = news ? buildEventList(Object.values(news.articles), { offsetHours: offset, releases: news.releases, now }) : [];
    const buckets = bucketEvents(events, now);
    const row = (e: TimedEvent, at: "end" | "start"): Record<string, unknown> => ({
      event: e.name,
      ...(e.type ? { type: e.type } : {}),
      [at === "end" ? "ends" : "starts"]: when(at === "end" ? e.endMs : e.startMs),
      ...(e.tz === "utc+8" ? { clock: "UTC+8 (a web event)" } : {}),
    });
    const ending = topN(buckets.endingSoon, 10);
    const live = topN(buckets.live, 10);
    const upcoming = topN(buckets.upcoming, 8);

    const state = readTodayState(storage);
    const wp = state.waveplates ? projectWaveplates(state.waveplates, now) : null;
    const cache = loadBanners({ seed, storage, serverOffsetHours: offset, revalidate: false, now }).feed;
    const banners = liveBanners(cache.banners, now);

    return compactJson({
      serverClock: `${server} (${utcLabel(offset)})`,
      nextDailyReset: when(daily),
      nextWeeklyReset: when(weekly),
      waveplates: wp
        ? { now: wp.waveplates, crystals: wp.crystals, full: wp.full ? "full now: spend them" : when(wp.fullAt!), loggedAt: when(state.waveplates!.atMs) }
        : "not logged on /today in this browser",
      events: news
        ? {
            endingWithin3Days: ending.items.map((e) => row(e, "end")),
            running: live.items.map((e) => row(e, "end")),
            startingWithin14Days: upcoming.items.map((e) => row(e, "start")),
            ...(ending.omitted + live.omitted + upcoming.omitted ? { omitted: ending.omitted + live.omitted + upcoming.omitted } : {}),
            noticesReadAt: news.fetchedAt > 0 ? when(news.fetchedAt) : null,
          }
        : "Kuro's notices aren't loaded in this browser yet: open /today once",
      doubleDrops: doubleDropsAt(events, now).map((d) => ({ event: d.event.name, ends: when(d.event.endMs), claimsPerDay: d.rule.claimsPerDay ?? null })),
      endgameCycles: RULES.cycles.map((rule) => {
        const w = cycleWindow(rule, now, offset);
        return { mode: rule.name, ...(w ? { resets: when(w.nextMs), ...(w.season != null ? { season: w.season } : {}) } : {}), dates: rule.confidence === "official" ? "Kuro's" : "community: check in game" };
      }),
      bannersRunning: banners.map((b) => ({ banner: b.label ?? b.title, featured: b.fiveStars.map((i) => i.name), ends: when(b.endMs) })),
      path: "/today",
      label: "Today",
    });
  },
});
