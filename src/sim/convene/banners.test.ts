// Wuthering Tools+: the Convene banner calendar from Kuro's news feed — parsing on trimmed REAL notices
// (__fixtures__/kuroNotices.json: 846, 4691, 5431 and 5546 with their full HTML, the rest rebuilt from their own
// lines with the rule bullets dropped; fetched once on 2026-10-12), folding, starts, labels, the released-only
// filter, record linking, and the stale-while-revalidate cache (fetch mocked — no live network).
import { describe, expect, it, vi } from "vitest";
import menu from "./__fixtures__/kuroArticleMenu.json";
import notices from "./__fixtures__/kuroNotices.json";
import seed from "./data/bannerSeed.json";
import {
  BANNER_CACHE_KEY,
  BANNER_FEED_OFFLINE,
  NEWS_BASE,
  articleLines,
  awaitingRelease,
  buildBannerList,
  decodeBannerCache,
  featuredRuns,
  isConveneNotice,
  linkRecordsToBanners,
  liveBanners,
  loadBanners,
  parseConveneArticle,
  releasedVersionOf,
  splitItemList,
  unreleasedArticleIds,
  versionReleases,
  wallClockMs,
  type BannerCache,
  type ConveneBanner,
  type KeyValueStorage,
} from "./banners";
import type { ConveneRecord } from "./gachaImport";

const parsed = notices.map(parseConveneArticle);
const byId = (id: number) => parsed.find((p) => p.id === id)!;
/** 2026-10-13 12:30 CST — 3.7 Phase I is live */
const NOW = Date.UTC(2026, 9, 13, 4, 30);
const banners = buildBannerList(parsed, { now: NOW });
const find = (pred: (b: ConveneBanner) => boolean) => banners.find(pred)!;
const withFive = (name: string, label?: string) => find((b) => b.fiveStars.some((f) => f.name === name) && (!label || b.label === label));

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("parseConveneArticle", () => {
  it("reads the 2024 format: bracketed names, slashed dates", () => {
    expect(byId(846).banners).toEqual([
      {
        title: "When Thunder Pours",
        category: "featured",
        type: "resonator",
        selectable: false,
        fiveStars: ["Yinlin"],
        fourStars: ["Taoqi", "Aalto", "Yuanwu"],
        start: "2024-06-06 10:00",
        end: "2024-06-26 11:59",
        version: null,
      },
    ]);
  });

  it("reads every duration wording", () => {
    expect(byId(973).banners[0]).toMatchObject({ start: null, end: "2024-07-22 09:59", version: "1.1" }); // "From the 1.1 update - …"
    expect(byId(1065).banners[0]).toMatchObject({ start: "2024-07-22 10:00", end: "2024-08-14 11:59" }); // "From … - …"
    expect(byId(1170).banners[0]).toMatchObject({ start: null, version: "1.2" }); // "1.2 update - …"
    expect(byId(1280).banners[0]).toMatchObject({ type: "weapon", fiveStars: ["Verity's Handle"], start: "2024-09-07 10:00" }); // "10:00- 2024…"
    expect(byId(3858).banners[0]).toMatchObject({ fiveStars: ["Lynae"], version: "3.0", start: null }); // "Version 3.0 Update"
  });

  it("reads selectable Anniversary / Reverb banners and Collab banners", () => {
    expect(byId(2533).banners[0]).toMatchObject({
      category: "anniversary",
      selectable: true,
      fiveStars: ["Jiyan", "Yinlin", "Zhezhi", "Xiangli Yao", "Phoebe"],
      fourStars: ["Lumi", "Taoqi", "Yuanwu"],
    });
    expect(byId(2535).banners[0]).toMatchObject({ category: "anniversary", type: "weapon", selectable: true });
    expect(byId(5065).banners[0]).toMatchObject({ category: "reverb", selectable: true, fiveStars: ["Jiyan", "Yinlin", "Jinhsi", "Changli", "Zhezhi", "Xiangli Yao"] });
    expect(byId(4836).banners[0]).toMatchObject({ category: "collab", fiveStars: ["Lucy"], version: "3.4" });
  });

  it("splits a per-phase notice into its banners, with or without a header line", () => {
    const p = byId(4691);
    expect(p).toMatchObject({ version: "3.3", phase: "II" });
    expect(p.banners.map((b) => [b.title, b.fiveStars[0], b.type])).toEqual([
      ["False Promise for Tomorrow", "Denia", "resonator"],
      ["Forged Dwarf Star", "Forged Dwarf Star", "weapon"],
      ["Horizon of Dawnbreak", "Chisa", "resonator"],
      ["Kumokiri", "Kumokiri", "weapon"],
      ["Requiem Without End", "Phrolova", "resonator"], // the header sits after an NBSP
      ["Lethean Elegy", "Lethean Elegy", "weapon"],
    ]);
    expect(byId(5546)).toMatchObject({ version: "3.7", phase: "I" });
    expect(byId(5546).banners).toHaveLength(4);
    expect(byId(2527).banners).toEqual([]); // a teaser with no featured line
  });

  it("helpers: lines, lists, notice filter, wall clocks", () => {
    expect(articleLines("<div>a&nbsp;b</div><p>c<br/>d &amp; e</p>")).toEqual(["a b", "c", "d & e"]);
    expect(splitItemList("Buling, Danjin and Chixia")).toEqual(["Buling", "Danjin", "Chixia"]);
    expect(splitItemList("[Taoqi], [Aalto], and [Yuanwu]!")).toEqual(["Taoqi", "Aalto", "Yuanwu"]);
    expect(menu.filter(isConveneNotice).map((m) => m.articleId)).not.toContain(758);
    expect(menu.filter(isConveneNotice).some((m) => m.articleId === 4792)).toBe(false); // "Event Preview | …"
    expect(menu.filter(isConveneNotice).some((m) => m.articleId === 5607)).toBe(false); // not a Convene notice
    expect(wallClockMs("2026-09-10 10:00", 8)).toBe(Date.UTC(2026, 8, 10, 2, 0));
    expect(wallClockMs("2026-09-10 10:00", -5)).toBe(Date.UTC(2026, 8, 10, 15, 0));
  });
});

describe("buildBannerList", () => {
  it("folds a per-phase notice and the single notices posted beside it", () => {
    const denia = banners.filter((b) => b.fiveStars[0]?.name === "Denia" && b.label === "3.3 Phase II");
    expect(denia).toHaveLength(1);
    expect(denia[0]!.sourceIds.sort()).toEqual(["4691:0", "4712:0"]);
    expect(banners.filter((b) => b.label === "3.3 Phase II")).toHaveLength(6);
  });

  it("maps names onto the app's keys", () => {
    expect(withFive("Yangyang: Xuanling").fiveStars[0]!.key).toBe("YangyangXuanling");
    expect(withFive("Luuk Herssen").fiveStars[0]!.key).toBe("LuukHerssen");
    expect(withFive("Moongazer's Sigil", "3.7 Phase I").fiveStars[0]!.key).toBe("MoongazersSigil");
    const fourStars = withFive("Kumokiri", "3.7 Phase I").fourStars.map((f) => f.key);
    expect(fourStars).toEqual(["FusionAccretion", "CommandoOfConviction", "DauntlessEvernight"]);
    expect(withFive("Jiyan", "3.5 Phase I").poolTypes).toEqual([12]);
    expect(withFive("Lucy").poolTypes).toEqual([10]);
    expect(withFive("Jinhsi", "1.1 Phase I").poolTypes).toEqual([1]);
  });

  it("starts a version-update banner with the update, never before the phase it replaces", () => {
    // 3.7's notice went up at 11:15 CST; 3.6 Phase II ran until 11:59
    const chisa = withFive("Chisa", "3.7 Phase I");
    expect(chisa.startApprox).toBe(true);
    expect(chisa.startMs).toBe(Date.UTC(2026, 8, 29, 4, 0));
    expect(chisa.endMs).toBe(Date.UTC(2026, 9, 22, 1, 59, 59, 999));
    // Qingxiao's notice came three hours after 3.6's — the banner still opened with the update
    expect(withFive("Qingxiao").startMs).toBe(withFive("Denia", "3.6 Phase I").startMs);
    // 1.2's notice posted 11:00 CST; 1.1 Phase II ended 11:59
    expect(withFive("Zhezhi", "1.2 Phase I").startMs).toBe(Date.UTC(2024, 7, 14, 4, 0));
  });

  it("starts a version-update banner when its version's patch notes go up, and holds it until then", () => {
    // Kuro's real menu titles (2026-10-26): every wording of a release entry, and the pre-release ones that aren't
    const releases = versionReleases([
      { articleTitle: "Version 1.1: Thaw of Eons Patch Notes", startTime: "2024-06-28 12:00:00" },
      { articleTitle: "Patch Notes for Version 3.6: Lamplight in Mirage, Sword's Resolve in Heart", startTime: "2026-08-20 10:00:00" },
      { articleTitle: "Version 3.5 Blade of Past Resounds, Lingering Dream Hymns Content Overview", startTime: "2026-07-10 10:00:00" },
      { articleTitle: "Wuthering Waves Update Content | Version 3.7 \"Prism's Illusion, Heart's Illumination\" Planned for Release on September 30th (UTC+8)", startTime: "2026-09-28 18:00:00" },
      { articleTitle: "[Version 3.7 Featured Resonator/Weapon Convene: Phase Ⅰ]", startTime: "2026-09-29 11:15:00" },
    ]);
    expect(releases).toEqual({ "1.1": "2024-06-28 12:00:00", "3.5": "2026-07-10 10:00:00", "3.6": "2026-08-20 10:00:00" });
    expect(releasedVersionOf("Patch Notes for Wuthering Waves Version 3.7: Prism's Illusion, Heart's Illumination")).toBe("3.7");

    // 3.6 went live with its patch notes (10:00 CST on Aug 20), not with the notice posted the day before
    const list = buildBannerList(parsed, { now: NOW, releases });
    const denia = list.find((b) => b.fiveStars[0]?.name === "Denia" && b.label === "3.6 Phase I")!;
    expect(denia.startMs).toBe(Date.UTC(2026, 7, 20, 2, 0));
    // 3.7's notice (Sep 29, 11:15 CST) is newer than every release: not started on Sep 29 evening…
    const sep29 = Date.UTC(2026, 8, 29, 12, 0);
    expect(buildBannerList(parsed, { now: sep29, releases }).some((b) => b.label === "3.7 Phase I")).toBe(false);
    expect(liveBanners(buildBannerList(parsed, { now: sep29, releases }), sep29)).toEqual([]);
    expect(unreleasedArticleIds(parsed, sep29, releases)).toEqual(new Set([5546]));
    expect(awaitingRelease(parsed, releases, sep29)).toBe(true);
    // …starts with 3.7's patch notes once the menu has them (10:00 CST on Sep 30, servers open at 11:00)…
    const with37 = { ...releases, "3.7": "2026-09-30 10:00:00" };
    const chisa = buildBannerList(parsed, { now: NOW, releases: with37 }).find((b) => b.fiveStars[0]?.name === "Chisa" && b.label === "3.7 Phase I")!;
    expect(chisa.startMs).toBe(Date.UTC(2026, 8, 30, 2, 0));
    expect(chisa.startApprox).toBe(true);
    expect(awaitingRelease(parsed, with37, sep29)).toBe(false);
    // …and a renamed release title can't hide it for good: two days after the notice the old estimate stands in
    const later = Date.UTC(2026, 9, 2, 4, 0);
    expect(buildBannerList(parsed, { now: later, releases }).find((b) => b.label === "3.7 Phase I")!.startMs).toBe(Date.UTC(2026, 8, 29, 4, 0));
    // explicit starts and every label are untouched
    expect(list.map((b) => b.label)).toEqual(buildBannerList(parsed, { now: NOW }).map((b) => b.label));
    expect(list.find((b) => b.fiveStars[0]?.name === "Hiyuki")!.startMs).toBe(withFive("Hiyuki").startMs);
  });

  it("labels versions and phases: stated, inherited from a twin, or inferred", () => {
    expect(withFive("Hiyuki", "3.6 Phase II")).toBeTruthy();
    expect(withFive("Changli", "1.1 Phase II")).toBeTruthy(); // inferred: 1.1's second start
    expect(find((b) => b.articleId === 1280).label).toBe("1.2 Phase II"); // inferred the same way
    expect(find((b) => b.articleId === 2533).label).toBe("2.3 Phase I"); // stated in the title
    expect(find((b) => b.articleId === 846).label).toBeNull(); // 1.0 never had a version-update notice in the feed
  });

  it("lists released banners only, newest first, on the player's server clock", () => {
    const before = buildBannerList(parsed, { now: Date.UTC(2026, 8, 29, 3, 0) }); // 11:00 CST on release day
    expect(before.some((b) => b.label === "3.7 Phase I")).toBe(false);
    expect(banners[0]!.label).toBe("3.7 Phase I");
    for (let i = 1; i < banners.length; i++) expect(banners[i - 1]!.startMs).toBeGreaterThanOrEqual(banners[i]!.startMs);
    const america = buildBannerList(parsed, { now: NOW, serverOffsetHours: -5 });
    const hiyuki = america.find((b) => b.fiveStars[0]?.name === "Hiyuki")!;
    expect(hiyuki.startMs).toBe(Date.UTC(2026, 8, 10, 15, 0));
    expect(liveBanners(banners, NOW).map((b) => b.fiveStars[0]!.name).sort()).toEqual(["Chisa", "Iuno", "Kumokiri", "Moongazer's Sigil"]);
    expect(unreleasedArticleIds(parsed, Date.UTC(2026, 8, 29, 3, 0))).toEqual(new Set([5546]));
  });

  it("collects every run of a featured 5★", () => {
    const chisa = featuredRuns(banners).get("Chisa")!;
    expect(chisa.map((r) => r.label)).toEqual(["3.3 Phase II", "3.7 Phase I"]);
  });
});

describe("linkRecordsToBanners", () => {
  const rec = (time: string, name: string, qualityLevel: number): ConveneRecord => ({ time, name, qualityLevel, resourceId: 0 });

  it("pins a pull to its banner when the time or the featured 5★ settles it", () => {
    const links = linkRecordsToBanners(
      1,
      [
        rec("2026-09-15 20:00:00", "Hiyuki", 5), // two Featured Resonator banners live: the 5★ decides
        rec("2026-09-15 20:00:00", "Sword of Night", 3), // either of them
        rec("2026-09-15 20:00:00", "Verina", 5), // a lost 50/50 names no banner
        rec("2026-07-01 12:00:00", "Lucilla", 5), // no Featured Resonator banner of the fixture runs then
      ],
      banners,
    );
    const hiyuki = withFive("Hiyuki").id;
    const mornye = withFive("Mornye", "3.6 Phase II").id;
    expect(links[0]).toEqual({ bannerId: hiyuki, candidates: [hiyuki, mornye], approximate: false });
    expect(links[1]).toEqual({ bannerId: null, candidates: [hiyuki, mornye], approximate: false });
    expect(links[2]!.bannerId).toBeNull();
    expect(links[3]).toEqual({ bannerId: null, candidates: [], approximate: false });
  });

  it("a single live banner takes every pull; the tolerance bridges a version-update gap", () => {
    const lucy = withFive("Lucy").id;
    expect(linkRecordsToBanners(10, [rec("2026-06-20 09:00:00", "Lumi", 4)], banners)[0]).toEqual({ bannerId: lucy, candidates: [lucy], approximate: false });
    // 11:30 CST on 3.7 release day: our start (12:00, the end of 3.6) is half an hour later, and 3.6's weapon
    // banners still read as live — the featured 5★ claims its own banner anyway
    const kumokiri = withFive("Kumokiri", "3.7 Phase I").id;
    const [early, filler] = linkRecordsToBanners(2, [rec("2026-09-29 11:30:00", "Kumokiri", 5), rec("2026-09-29 11:30:00", "Cadenza", 4)], banners);
    expect(early).toEqual({ bannerId: kumokiri, candidates: [kumokiri], approximate: true });
    expect(filler!.candidates).toEqual([withFive("Frostburn").id, withFive("Starfield Calibrator", "3.6 Phase II").id]);
    // a gap with no banner at all: the nearest within 12 h, flagged
    const gap = linkRecordsToBanners(10, [rec("2026-07-09 20:00:00", "Lumi", 4)], banners)[0]!;
    expect(gap).toEqual({ bannerId: lucy, candidates: [lucy], approximate: true });
  });
});

describe("the shipped seed", () => {
  it("decodes, holds only released banners, and every featured 5★ resolves to an app key", () => {
    const cache = decodeBannerCache(JSON.stringify(seed))!;
    expect(cache).not.toBeNull();
    expect(cache.fetchedAt).toBe(0);
    expect(Object.keys(cache.releases ?? {}).length).toBeGreaterThanOrEqual(21); // 1.1 … 3.7
    expect(cache.releases!["3.7"]).toBe("2026-09-30 10:00:00");
    const all = buildBannerList(Object.values(cache.articles), { now: Number.POSITIVE_INFINITY, releases: cache.releases });
    const released = buildBannerList(Object.values(cache.articles), { now: Date.now(), releases: cache.releases });
    expect(all.length).toBeGreaterThan(150);
    expect(released).toHaveLength(all.length);
    const unresolved = all.flatMap((b) => [...b.fiveStars, ...b.fourStars]).filter((f) => !f.key);
    expect(unresolved).toEqual([]);
  });
});

describe("loadBanners (stale-while-revalidate)", () => {
  const cacheOf = (ids: number[], fetchedAt: number): BannerCache => ({
    v: 1,
    fetchedAt,
    articles: Object.fromEntries(parsed.filter((p) => ids.includes(p.id)).map((p) => [String(p.id), p])),
  });
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
  function feedServer(ids: number[]) {
    return vi.fn(async (url: string) => {
      if (url === `${NEWS_BASE}/ArticleMenu.json`) return json(menu.filter((m) => ids.includes(m.articleId) || !isConveneNotice(m)));
      const id = Number(/article\/(\d+)\.json$/.exec(url)?.[1]);
      const n = notices.find((x) => x.articleId === id);
      return n ? json(n) : json({}, 404);
    });
  }

  it("a fresh cache is served as is", () => {
    const storage = memoryStorage({ [BANNER_CACHE_KEY]: JSON.stringify(cacheOf([5431], NOW - 3600_000)) });
    const fetchImpl = vi.fn();
    const { feed, refreshed } = loadBanners({ storage, fetchImpl: fetchImpl as never, now: NOW });
    expect(refreshed).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(feed).toMatchObject({ source: "cache", stale: false, error: null });
    expect(feed.banners).toHaveLength(4);
  });

  it("a stale cache is served at once and revalidated: only new notices are fetched, the cache is rewritten", async () => {
    const storage = memoryStorage({ [BANNER_CACHE_KEY]: JSON.stringify(cacheOf([5431], NOW - 2 * 86_400_000)) });
    const fetchImpl = feedServer([5431, 5546]);
    const { feed, refreshed } = loadBanners({ storage, fetchImpl: fetchImpl as never, now: NOW });
    expect(feed).toMatchObject({ source: "cache", stale: true });
    const fresh = await refreshed!;
    expect(fresh).toMatchObject({ source: "network", stale: false, error: null });
    expect(fresh.banners[0]!.label).toBe("3.7 Phase I");
    const urls = fetchImpl.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([`${NEWS_BASE}/ArticleMenu.json`, `${NEWS_BASE}/article/5546.json`]);
    const saved = decodeBannerCache(storage.data.get(BANNER_CACHE_KEY)!)!;
    expect(saved.fetchedAt).toBe(NOW);
    expect(Object.keys(saved.articles).sort()).toEqual(["5431", "5546"]);
  });

  it("offline: the cached (or seeded) list with a message; nothing at all → an empty list that says so", async () => {
    const offline = vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")));
    const storage = memoryStorage({ [BANNER_CACHE_KEY]: JSON.stringify(cacheOf([5431], Date.UTC(2026, 9, 1))) });
    const cached = await loadBanners({ storage, fetchImpl: offline as never, now: NOW }).refreshed!;
    expect(cached.banners).toHaveLength(4);
    expect(cached.error).toBe(`${BANNER_FEED_OFFLINE} Showing the banners saved on 2026-10-01.`);
    expect(storage.data.get(BANNER_CACHE_KEY)).toContain('"fetchedAt":' + Date.UTC(2026, 9, 1));

    const seeded = await loadBanners({ storage: memoryStorage(), seed: cacheOf([5431], 0), fetchImpl: offline as never, now: NOW }).refreshed!;
    expect(seeded).toMatchObject({ source: "seed", stale: true });
    expect(seeded.error).toContain("saved with the app");

    const none = loadBanners({ storage: memoryStorage(), fetchImpl: offline as never, now: NOW });
    expect(none.feed).toMatchObject({ banners: [], source: "none" });
    const empty = await none.refreshed!;
    expect(empty.banners).toEqual([]);
    expect(empty.error).toBe(`${BANNER_FEED_OFFLINE} No banners saved yet — try again when you're online.`);
  });

  it("with the seed, a first visit fetches only the menu and what the seed lacks, and stores only that", async () => {
    const fetchImpl = feedServer([5431, 5546]);
    const storage = memoryStorage();
    const { feed, refreshed } = loadBanners({ storage, seed: cacheOf([5431], 0), fetchImpl: fetchImpl as never, now: NOW });
    expect(feed.source).toBe("seed");
    await refreshed;
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([`${NEWS_BASE}/ArticleMenu.json`, `${NEWS_BASE}/article/5546.json`]);
    expect(Object.keys(decodeBannerCache(storage.data.get(BANNER_CACHE_KEY)!)!.articles)).toEqual(["5546"]);
    // the next visit: seed ∪ cache, fresh, no requests
    const again = loadBanners({ storage, seed: cacheOf([5431], 0), fetchImpl: fetchImpl as never, now: NOW + 3600_000 });
    expect(again.refreshed).toBeNull();
    expect(again.feed.banners).toHaveLength(8);
  });

  it("reads release times from the menu, keeps them, and re-reads hourly while a version-update banner waits", async () => {
    const patch = { articleId: 5357, articleTitle: "Patch Notes for Version 3.6: Lamplight in Mirage, Sword's Resolve in Heart", articleType: 58, startTime: "2026-08-20 10:00:00" };
    const server = vi.fn(async (url: string) => {
      if (url === `${NEWS_BASE}/ArticleMenu.json`) return json([...menu.filter((m) => [5431, 5546].includes(m.articleId) || !isConveneNotice(m)), patch]);
      const id = Number(/article\/(\d+)\.json$/.exec(url)?.[1]);
      const n = notices.find((x) => x.articleId === id);
      return n ? json(n) : json({}, 404);
    });
    const storage = memoryStorage();
    // Sep 29, 20:00 CST: 3.7's notice is out, its patch notes aren't
    const sep29 = Date.UTC(2026, 8, 29, 12, 0);
    const fresh = await loadBanners({ storage, seed: cacheOf([5431], 0), fetchImpl: server as never, now: sep29 }).refreshed!;
    expect(decodeBannerCache(storage.data.get(BANNER_CACHE_KEY)!)!.releases).toEqual({ "3.6": "2026-08-20 10:00:00" });
    expect(fresh.banners.some((b) => b.label === "3.7 Phase I")).toBe(false);
    // half an hour later: fresh; two hours later: stale again (the release is due), though the day isn't up
    expect(loadBanners({ storage, seed: cacheOf([5431], 0), fetchImpl: server as never, now: sep29 + 1800_000 }).refreshed).toBeNull();
    expect(loadBanners({ storage, seed: cacheOf([5431], 0), fetchImpl: server as never, now: sep29 + 2 * 3600_000 }).feed.stale).toBe(true);
  });

  it("a notice that fails to load is skipped and retried next time; a broken menu keeps the cache", async () => {
    const flaky = vi.fn(async (url: string) => (url.endsWith("ArticleMenu.json") ? json(menu) : json({}, 500)));
    const storage = memoryStorage();
    const res = await loadBanners({ storage, seed: cacheOf([5431], 0), fetchImpl: flaky as never, now: NOW }).refreshed!;
    expect(res.source).toBe("network");
    expect(res.banners).toHaveLength(4); // only the seeded notice
    const badMenu = vi.fn(async () => json({ not: "a list" }));
    const kept = await loadBanners({ storage: memoryStorage(), seed: cacheOf([5431], 0), fetchImpl: badMenu as never, now: NOW }).refreshed!;
    expect(kept.error).toContain(BANNER_FEED_OFFLINE);
    expect(kept.banners).toHaveLength(4);
  });
});
