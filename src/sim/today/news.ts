// Wuthering Tools+ — /today's read of Kuro's news feed: the newest released patch notes (two, so a web event that
// outlives its version stays), plus the stand-alone double-drop and "Event Preview" notices of the last 60 days,
// parsed by durations.ts. The feed, its base URL, the HTML → lines step, the release times and the clock helpers are
// convene's (banners.ts); this module only picks other notices and keeps its own cache.
// Cache: localStorage `wtplus:today:news:v1` — parsed notices + release times, 24 h, stale-while-revalidate. A failed
// read leaves the cache as it was ("as of <time>"). Pure: fetch and storage are injected.
// One menu read serves both caches: `shareMenuFetch` hands the same ArticleMenu.json response to this refresh and to
// convene's `loadBanners` when both run in one page load.
import { NEWS_BASE, releasedVersionOf, versionReleases, wallClockMs, type KeyValueStorage } from "../convene/banners";
import { compareVersions, isTodayNotice, parseNewsArticle, type NewsArticle, type RawEvent } from "./durations";
import { DAY_MS } from "./resets";

export const TODAY_NEWS_KEY = "wtplus:today:news:v1";
export const TODAY_NEWS_VERSION = 1;
export const TODAY_NEWS_TTL_MS = 24 * 3600_000;
/** stand-alone event notices older than this are not read (their events have ended) */
export const EVENT_NOTICE_WINDOW_MS = 60 * DAY_MS;
/** how many released versions' patch notes are kept */
export const PATCH_NOTES_KEPT = 2;

export interface TodayNewsCache {
  v: number;
  /** when the menu was last read */
  fetchedAt: number;
  articles: Record<string, NewsArticle>;
  /** version → release time (convene's versionReleases) */
  releases: Record<string, string>;
}

export function emptyNewsCache(): TodayNewsCache {
  return { v: TODAY_NEWS_VERSION, fetchedAt: 0, articles: {}, releases: {} };
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const TZS = new Set(["server", "utc+8"]);
const isWall = (s: unknown): s is string => typeof s === "string" && Number.isFinite(wallClockMs(s, 0));

function isRawEvent(e: unknown): e is RawEvent {
  if (!e || typeof e !== "object") return false;
  const o = e as RawEvent;
  return typeof o.name === "string" && isWall(o.end) && (o.start === null || isWall(o.start)) && TZS.has(o.tz) && typeof o.articleId === "number";
}

export function decodeNewsCache(raw: string | null): TodayNewsCache | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as TodayNewsCache;
    if (!o || o.v !== TODAY_NEWS_VERSION || typeof o.fetchedAt !== "number" || !o.articles || typeof o.articles !== "object") return null;
    const articles: Record<string, NewsArticle> = {};
    for (const [id, a] of Object.entries(o.articles)) {
      if (!a || typeof a !== "object" || typeof a.id !== "number" || typeof a.published !== "string" || !Array.isArray(a.events)) continue;
      articles[id] = { ...a, events: a.events.filter(isRawEvent) };
    }
    const releases: Record<string, string> = {};
    if (o.releases && typeof o.releases === "object")
      for (const [v, t] of Object.entries(o.releases)) if (/^\d+\.\d+$/.test(v) && isWall(t)) releases[v] = t;
    return { v: TODAY_NEWS_VERSION, fetchedAt: o.fetchedAt, articles, releases };
  } catch {
    return null;
  }
}

export function readNewsCache(storage: KeyValueStorage | null = defaultStorage()): TodayNewsCache | null {
  try {
    return decodeNewsCache(storage?.getItem(TODAY_NEWS_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeNewsCache(cache: TodayNewsCache, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(TODAY_NEWS_KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

interface MenuEntry {
  articleId: number;
  articleTitle: string;
  startTime: string;
}

/** the notices /today reads from a menu: the newest released patch notes and the recent event notices */
export function pickTodayNotices(menu: readonly unknown[], now: number): MenuEntry[] {
  const entries = menu.filter(
    (e): e is MenuEntry =>
      !!e && typeof (e as MenuEntry).articleId === "number" && typeof (e as MenuEntry).articleTitle === "string" && typeof (e as MenuEntry).startTime === "string",
  );
  const posted = (e: MenuEntry) => {
    const at = wallClockMs(e.startTime, 8);
    return Number.isFinite(at) && at <= now;
  };
  // released content only: a notice is read once its publish time has passed
  const notes = entries
    .map((e) => ({ e, v: releasedVersionOf(e.articleTitle) }))
    .filter((x): x is { e: MenuEntry; v: string } => x.v != null && posted(x.e))
    .sort((a, b) => compareVersions(b.v, a.v) || b.e.startTime.localeCompare(a.e.startTime));
  const keptVersions: string[] = [];
  const patchNotes: MenuEntry[] = [];
  for (const { e, v } of notes) {
    if (!keptVersions.includes(v)) {
      if (keptVersions.length >= PATCH_NOTES_KEPT) break;
      keptVersions.push(v);
    }
    patchNotes.push(e);
  }
  const events = entries.filter(
    (e) => releasedVersionOf(e.articleTitle) == null && isTodayNotice(e) && posted(e) && now - wallClockMs(e.startTime, 8) <= EVENT_NOTICE_WINDOW_MS,
  );
  return [...patchNotes, ...events];
}

async function getJson(url: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const res = await fetchImpl(url, { credentials: "omit", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface NewsRefreshOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: number;
  concurrency?: number;
}

/**
 * Read the menu, fetch the picked notices the cache doesn't hold yet (or whose publish time changed), drop the ones no
 * longer picked. A notice that fails to load is left out and retried next time; a failed menu rejects.
 */
export async function refreshNewsCache(base: TodayNewsCache, opts: NewsRefreshOptions = {}): Promise<TodayNewsCache> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = opts.now ?? Date.now();
  const menu = await getJson(`${NEWS_BASE}/ArticleMenu.json`, fetchImpl, opts.signal);
  if (!Array.isArray(menu)) throw new Error("bad menu");
  const wanted = pickTodayNotices(menu, now);
  const articles: Record<string, NewsArticle> = {};
  for (const e of wanted) {
    const held = base.articles[String(e.articleId)];
    if (held && held.published === e.startTime) articles[String(e.articleId)] = held;
  }
  const todo = wanted.filter((e) => !articles[String(e.articleId)]);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const e = todo[next++]!;
      try {
        const a = (await getJson(`${NEWS_BASE}/article/${e.articleId}.json`, fetchImpl, opts.signal)) as Record<string, unknown>;
        if (typeof a.articleContent !== "string") continue;
        articles[String(e.articleId)] = parseNewsArticle({
          articleId: e.articleId,
          articleTitle: typeof a.articleTitle === "string" ? a.articleTitle : e.articleTitle,
          startTime: e.startTime,
          articleContent: a.articleContent,
        });
      } catch {
        if (opts.signal?.aborted) return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, todo.length)) }, worker));
  if (opts.signal?.aborted) throw new Error("aborted");
  const releases = { ...base.releases };
  for (const [v, t] of Object.entries(versionReleases(menu as MenuEntry[]))) if (!releases[v] || t < releases[v]!) releases[v] = t;
  return { v: TODAY_NEWS_VERSION, fetchedAt: now, articles, releases };
}

export type NewsSource = "network" | "cache" | "none";

export interface NewsFeed {
  cache: TodayNewsCache;
  source: NewsSource;
  /** older than the TTL (a refresh is due or failed) */
  stale: boolean;
  /** set when the feed couldn't be read */
  error: string | null;
}

export const NEWS_OFFLINE = "Couldn't reach Kuro's news feed.";

export interface LoadNewsOptions extends NewsRefreshOptions {
  storage?: KeyValueStorage | null;
  ttlMs?: number;
  /** false: the cache only, never the network */
  revalidate?: boolean;
  /** true: read the network even when the cache is fresh (the "check now" button) */
  force?: boolean;
}

/**
 * Stale-while-revalidate: `feed` is what the cache holds now; `refreshed` resolves with the network result when the
 * cache is older than the TTL (or `force`), null otherwise. A failed refresh resolves (never rejects) with the cache
 * and a message.
 */
export function loadNews(opts: LoadNewsOptions = {}): { feed: NewsFeed; refreshed: Promise<NewsFeed> | null } {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now();
  const cache = readNewsCache(storage);
  const base = cache ?? emptyNewsCache();
  const stale = !cache || now - cache.fetchedAt > (opts.ttlMs ?? TODAY_NEWS_TTL_MS);
  const feed: NewsFeed = { cache: base, source: cache ? "cache" : "none", stale, error: null };
  if (opts.revalidate === false || (!stale && !opts.force)) return { feed, refreshed: null };
  const refreshed = refreshNewsCache(base, { fetchImpl: opts.fetchImpl, signal: opts.signal, now, concurrency: opts.concurrency })
    .then((fresh): NewsFeed => {
      writeNewsCache(fresh, storage);
      return { cache: fresh, source: "network", stale: false, error: null };
    })
    .catch((): NewsFeed => ({ ...feed, stale: true, error: NEWS_OFFLINE }));
  return { feed, refreshed };
}

/**
 * A fetch that reads ArticleMenu.json once and hands every caller its own copy of the body (the banner refresh and
 * this one share a page load); every other URL passes straight through.
 */
export function shareMenuFetch(fetchImpl: typeof fetch): typeof fetch {
  let menu: Promise<{ status: number; body: string }> | null = null;
  const shared = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/ArticleMenu.json")) return fetchImpl(input, init);
    menu ??= fetchImpl(input, init).then(async (r) => ({ status: r.status, body: await r.text() }));
    try {
      const { status, body } = await menu;
      return new Response(body, { status, headers: { "content-type": "application/json" } });
    } catch (err) {
      menu = null;
      throw err;
    }
  }) as typeof fetch;
  return shared;
}
