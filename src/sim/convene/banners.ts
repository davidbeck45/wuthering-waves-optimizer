// Wuthering Tools+ — the official Convene banner calendar, read from Kuro's own news feed (the JSON behind
// wutheringwaves.kurogames.com/en/main/news): `ArticleMenu.json` lists every notice, `article/<id>.json` carries one
// notice's HTML. Both answer `access-control-allow-origin: *` (checked 2026-10-12), so the browser reads them
// directly. 132 of the 703 notices were Convene announcements on that date, back to 2024-06 (1.0's Jiyan banner
// was never posted there).
//
// Article formats handled (all seen in the feed):
//   - one banner per notice: "[Title] Featured Resonator Convene: Boosted Drop Rate for X" (2024–2025),
//     "[Title] Featured Resonator Convene: X" (3.0), "[Title] Featured Weapon Convene" (3.1+), Collab / Reverb /
//     Anniversary notices;
//   - one notice per phase from 3.1 on: "[Version 3.7 Featured Resonator/Weapon Convene: Phase Ⅰ]" with a
//     "[Title] … Convene" header per banner (sometimes missing — the "During the event" line starts the section);
//   - the featured line: "5-Star Resonator: Chisa, 4-Star Resonators: Buling, Taoqi, and Youhu receive boosted drop
//     rates!", the 2024 "boosted drop rates for 5-star Resonator [Yinlin], 4-star Resonators [Taoqi], …!", and
//     "selectable 5-Star Resonators: …" on Reverb / Anniversary banners;
//   - the duration: "2026-09-10 10:00 - 2026-09-29 11:59 (server time)", "2024/06/06 10:00 - …", "From …",
//     or "Version 3.7 update - 2026-10-22 09:59 (server time)" (starts with the version update).
//
// Released content only: a banner is listed once its start has passed. A "starts with the version update" banner
// starts when that version's patch notes go up (the menu's "Patch Notes for Version 3.7: …" / "Version 1.1: … Patch
// Notes" / 3.5's "… Content Overview" entry — posted as the update maintenance ends: 3.7's at 10:00 CST, servers open
// 11:00). Kuro posts the Convene notice itself the day before release (16–25 h early, every version 1.1–3.7), so until
// the patch notes are in the menu such a banner counts as not started. Without any release entry (an old cache) or
// 48 h after its notice (a renamed title must not hide a running banner for long) the old estimate stands in: the
// notice's publish time (CST), never earlier than the end of the phase before it.
// Cache: localStorage `wtplus:convene:banners` (parsed notices + release times, 24 h, stale-while-revalidate — 1 h
// while a version-update banner waits for its release); a shipped seed
// (data/bannerSeed.json, emitted by tools/emitBannerSeed.ts) means a first visit fetches only the menu and the
// notices newer than the seed. Offline → the cached / seeded list, or an empty list with a message.
// Pure module: fetch and storage are injected.
import type { ConveneRecord } from "./gachaImport";
import { resolveItem, normalizeItemName } from "./items";
import { recordTimeMs } from "./pity";
import type { PoolKind } from "./pools";

export const NEWS_BASE = "https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en";
export const BANNER_CACHE_KEY = "wtplus:convene:banners";
export const BANNER_CACHE_VERSION = 1;
export const BANNER_CACHE_TTL_MS = 24 * 3600_000;
export const BANNER_AWAITING_TTL_MS = 3600_000;

/** Kuro's fixed server clocks ("server time" in every notice); CN runs on CST too */
export const SERVER_REGIONS = [
  { id: "asia", label: "Asia", offsetHours: 8 },
  { id: "america", label: "America", offsetHours: -5 },
  { id: "europe", label: "Europe", offsetHours: 1 },
  { id: "hmt", label: "HMT (TW / HK / MO)", offsetHours: 8 },
  { id: "sea", label: "SEA", offsetHours: 8 },
  { id: "cn", label: "China", offsetHours: 8 },
] as const;

export type BannerCategory = "featured" | "collab" | "reverb" | "anniversary";

/** one banner as a notice states it (wall clocks, unresolved) */
export interface RawBanner {
  title: string | null;
  category: BannerCategory;
  type: PoolKind;
  selectable: boolean;
  fiveStars: string[];
  fourStars: string[];
  /** "YYYY-MM-DD HH:mm" server time; null = starts with the version update */
  start: string | null;
  /** "YYYY-MM-DD HH:mm" server time (inclusive minute) */
  end: string;
  version: string | null;
}

export interface ParsedArticle {
  id: number;
  title: string;
  /** the notice's publish time, CST "YYYY-MM-DD HH:mm:ss" */
  published: string;
  /** from a per-phase notice's title */
  version: string | null;
  phase: string | null;
  banners: RawBanner[];
}

export interface BannerItem {
  name: string;
  /** the app's character / weapon key, null when the app doesn't carry it */
  key: string | null;
}

export interface ConveneBanner {
  id: string;
  articleId: number;
  /** every notice banner folded into this one ("<articleId>:<index>") */
  sourceIds: string[];
  title: string | null;
  category: BannerCategory;
  type: PoolKind;
  /** the record API pool types this banner's pulls are filed under */
  poolTypes: number[];
  selectable: boolean;
  fiveStars: BannerItem[];
  fourStars: BannerItem[];
  version: string | null;
  phase: string | null;
  /** "3.7 Phase I", "3.4", or null */
  label: string | null;
  startMs: number;
  endMs: number;
  /** starts with a version update — the start is the notice's publish time, not a stated minute */
  startApprox: boolean;
}

// ── HTML → lines ───────────────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** a notice's HTML as trimmed, non-empty text lines */
export function articleLines(html: string): string[] {
  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|h\d|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ── one notice ─────────────────────────────────────────────────────────────────────────────────────────────────

const ROMAN: Record<string, string> = { "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "1": "I", "2": "II", "3": "III", "4": "IV" };

function normalizePhase(p: string): string {
  const t = p.trim();
  return ROMAN[t] ?? t.toUpperCase();
}

const FEATURED_RE =
  /5-star\s+(resonators?|weapons?)\s*:?\s*(.+?)(?:,?\s*(?:and\s+)?4-star\s+(?:resonators?|weapons?)\s*:?\s*(.+?))?\s*(?:receive boosted drop rates|!|$)/i;
const RANGE_RE =
  /(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})\s*[-–~]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/;
const VERSION_RANGE_RE = /(\d+\.\d+)\s+update\s*[-–~]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/i;
const HEADER_RE = /^\[([^\]]+)\][^[]*convene/i;

function wall(y: string, mo: string, d: string, h: string, mi: string): string {
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")} ${h.padStart(2, "0")}:${mi}`;
}

export function splitItemList(s: string): string[] {
  return s
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map((x) => x.replace(/[[\]]/g, "").replace(/[!.。]+$/, "").trim())
    .filter(Boolean);
}

function categoryOf(text: string): BannerCategory {
  if (/collab/i.test(text)) return "collab";
  if (/reverb/i.test(text)) return "reverb";
  if (/anniversary/i.test(text)) return "anniversary";
  return "featured";
}

/** the banners one notice announces (empty for notices that aren't banner announcements) */
export function parseConveneArticle(article: { articleId: number; articleTitle: string; startTime: string; articleContent: string }): ParsedArticle {
  const title = (article.articleTitle ?? "").trim();
  const lines = articleLines(article.articleContent ?? "");
  const titleVersion = /version\s+(\d+\.\d+)/i.exec(title)?.[1] ?? null;
  const titlePhase = /phase\s+([ⅠⅡⅢⅣ]|[IV]+(?![a-z])|\d)/i.exec(title)?.[1] ?? null;
  const combined = /resonator\/weapon/i.test(title);
  const featuredAt: number[] = [];
  lines.forEach((l, i) => {
    if (/during the event/i.test(l) && /5-star/i.test(l)) featuredAt.push(i);
  });
  const banners: RawBanner[] = [];
  featuredAt.forEach((at, n) => {
    const m = FEATURED_RE.exec(lines[at]!);
    if (!m) return;
    const sectionEnd = featuredAt[n + 1] ?? lines.length;
    const sectionStart = n === 0 ? 0 : featuredAt[n - 1]! + 1;
    let header: string | null = null;
    for (let i = at - 1; i >= sectionStart; i--) {
      if (HEADER_RE.test(lines[i]!) && !/resonator\/weapon/i.test(lines[i]!)) {
        header = lines[i]!;
        break;
      }
    }
    if (!header && !combined && featuredAt.length === 1) header = title;
    let start: string | null = null;
    let end: string | null = null;
    let version: string | null = null;
    for (let i = at + 1; i < sectionEnd; i++) {
      const r = RANGE_RE.exec(lines[i]!);
      if (r) {
        start = wall(r[1]!, r[2]!, r[3]!, r[4]!, r[5]!);
        end = wall(r[6]!, r[7]!, r[8]!, r[9]!, r[10]!);
        break;
      }
      const v = VERSION_RANGE_RE.exec(lines[i]!);
      if (v) {
        version = v[1]!;
        end = wall(v[2]!, v[3]!, v[4]!, v[5]!, v[6]!);
        break;
      }
    }
    if (!end) return;
    const fiveStars = splitItemList(m[2]!);
    if (!fiveStars.length) return;
    const bracket = header ? /^\[([^\]]+)\]/.exec(header)?.[1] ?? null : null;
    banners.push({
      title: bracket,
      category: categoryOf(header ?? title),
      type: /weapon/i.test(m[1]!) ? "weapon" : "resonator",
      selectable: /selectable/i.test(lines[at]!) || fiveStars.length > 1,
      fiveStars,
      fourStars: m[3] ? splitItemList(m[3]) : [],
      start,
      end,
      version: version ?? titleVersion,
    });
  });
  return {
    id: article.articleId,
    title,
    published: article.startTime,
    version: titleVersion,
    phase: titlePhase ? normalizePhase(titlePhase) : null,
    banners,
  };
}

/** is a menu entry a Convene banner notice worth fetching? */
export function isConveneNotice(entry: { articleId: number; articleTitle: string }): boolean {
  const t = entry.articleTitle ?? "";
  return /convene/i.test(t) && !/convene details/i.test(t) && !/^event preview/i.test(t);
}

/**
 * The version a menu entry announces as LIVE: its patch notes ("Version 1.1: Thaw of Eons Patch Notes", "Patch Notes
 * for Version 2.1: …", "Patch Notes for Wuthering Waves Version 3.7: …") or 3.5's "Version 3.5 … Content Overview".
 * The pre-release "Update Content | Version 3.7 … Planned for Release on …" entries don't count.
 */
export function releasedVersionOf(title: string): string | null {
  const t = title ?? "";
  if (!/patch notes|content overview/i.test(t) || /convene/i.test(t)) return null;
  return /version\s+(\d+\.\d+)/i.exec(t)?.[1] ?? null;
}

/** version → when it went live (the release entry's publish time, CST "YYYY-MM-DD HH:mm:ss"; the earliest wins) */
export function versionReleases(menu: readonly { articleTitle?: unknown; startTime?: unknown }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of menu) {
    if (!e || typeof e.articleTitle !== "string" || typeof e.startTime !== "string") continue;
    const v = releasedVersionOf(e.articleTitle);
    if (v && Number.isFinite(wallClockMs(e.startTime, 8)) && (!out[v] || e.startTime < out[v]!)) out[v] = e.startTime;
  }
  return out;
}

function mergeReleases(...sets: (Record<string, string> | undefined)[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sets) for (const [v, t] of Object.entries(s ?? {})) if (!out[v] || t < out[v]!) out[v] = t;
  return out;
}

/** "3.10" > "3.7" */
function compareVersions(a: string, b: string): number {
  const [a1 = 0, a2 = 0] = a.split(".").map(Number);
  const [b1 = 0, b2 = 0] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2;
}

// ── notices → the banner list ──────────────────────────────────────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** how long a version-update banner may wait for its version's release entry before the publish-time estimate stands in */
export const RELEASE_GRACE_MS = 2 * DAY_MS;

/** "YYYY-MM-DD HH:mm[:ss]" at a fixed UTC offset → epoch ms */
export function wallClockMs(text: string, offsetHours: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!m) return Number.NaN;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0)) - offsetHours * 3600_000;
}

const POOLS_OF: Record<BannerCategory, Record<PoolKind, number[]>> = {
  featured: { resonator: [1], weapon: [2] },
  anniversary: { resonator: [1], weapon: [2] },
  collab: { resonator: [10], weapon: [11] },
  reverb: { resonator: [12], weapon: [13] },
};

function item(name: string, kind: PoolKind): BannerItem {
  return { name, key: resolveItem(name, kind)?.key ?? null };
}

interface Draft {
  raw: RawBanner;
  article: ParsedArticle;
  index: number;
  sources: string[];
  phase: string | null;
  version: string | null;
}

export interface BuildOptions {
  /** the player's server clock (SERVER_REGIONS); default 8 (Asia / HMT / SEA / CN) */
  serverOffsetHours?: number;
  /** only banners whose start has passed (default: Date.now()); pass Infinity to keep everything */
  now?: number;
  /** version → release time (versionReleases); a version-update banner starts then */
  releases?: Record<string, string>;
  /** the real clock for the release wait (default: `now` when finite, else Date.now()) */
  clock?: number;
}

/**
 * Every banner from a set of parsed notices: duplicates folded (a per-phase notice and the single-banner notices
 * posted beside it), starts resolved, version / phase labels inferred, unreleased banners dropped, newest first.
 */
export function buildBannerList(articles: readonly ParsedArticle[], opts: BuildOptions = {}): ConveneBanner[] {
  const offset = opts.serverOffsetHours ?? 8;
  const now = opts.now ?? Date.now();
  // fold duplicates: same kind, same 5★ set, same stated start / end
  const byKey = new Map<string, Draft>();
  const ordered = [...articles].sort((a, b) => a.id - b.id);
  for (const article of ordered) {
    article.banners.forEach((raw, index) => {
      const key = [raw.type, raw.fiveStars.map(normalizeItemName).sort().join("+"), raw.start ?? `v${raw.version ?? ""}`, raw.end].join("|");
      const prev = byKey.get(key);
      const draft: Draft = { raw, article, index, sources: [`${article.id}:${index}`], phase: article.phase, version: raw.version ?? article.version };
      if (!prev) byKey.set(key, draft);
      else {
        prev.sources.push(...draft.sources);
        prev.phase ??= draft.phase;
        prev.version ??= draft.version;
        if (!prev.raw.title && raw.title) prev.raw = { ...prev.raw, title: raw.title };
      }
    });
  }
  const drafts = [...byKey.values()];
  // ends in CST — the version-update clamp below is a global moment, not a per-server one
  const endCst = (d: Draft) => wallClockMs(d.raw.end, 8) + MINUTE_MS - 1;
  const startOf = new Map<Draft, number>();
  for (const d of drafts) {
    if (d.raw.start) {
      startOf.set(d, wallClockMs(d.raw.start, offset));
      continue;
    }
    const published = wallClockMs(d.article.published, 8);
    let start = published;
    const ownEnd = endCst(d);
    for (const o of drafts) {
      const e = endCst(o);
      if (e > published - DAY_MS && e < published + 2 * DAY_MS && e < ownEnd - 7 * DAY_MS) start = Math.max(start, e + 1);
    }
    startOf.set(d, start);
  }
  // every "with the version update" banner of one version starts at the same moment: the earliest of them (a
  // notice posted hours later — 3.6's Qingxiao — still went live with the update)
  const versionStart = new Map<string, number>();
  for (const d of drafts) {
    if (d.raw.start || !d.version) continue;
    const s = startOf.get(d)!;
    versionStart.set(d.version, Math.min(versionStart.get(d.version) ?? s, s));
  }
  for (const d of drafts) if (!d.raw.start && d.version) startOf.set(d, versionStart.get(d.version)!);
  // the version's release entry (its patch notes) is the real start; a version newer than every released one hasn't
  // gone live yet — its notice goes up the day before — so it waits (up to RELEASE_GRACE_MS after the notice)
  const releases = opts.releases ?? {};
  const released = Object.keys(releases);
  const newest = released.reduce((m, v) => (compareVersions(v, m) > 0 ? v : m), "0.0");
  const clock = opts.clock ?? (Number.isFinite(now) ? now : Date.now());
  for (const d of drafts) {
    if (d.raw.start || !d.version) continue;
    const at = releases[d.version];
    if (at) startOf.set(d, wallClockMs(at, 8));
    else if (released.length && compareVersions(d.version, newest) > 0 && clock - wallClockMs(d.article.published, 8) < RELEASE_GRACE_MS)
      startOf.set(d, Number.POSITIVE_INFINITY);
  }
  // version: a stated one, else the latest version-update banner that started before
  const versionStarts = drafts
    .filter((d) => !d.raw.start && d.version)
    .map((d) => ({ version: d.version!, start: startOf.get(d)! }))
    .sort((a, b) => a.start - b.start);
  for (const d of drafts) {
    if (d.version) continue;
    const s = startOf.get(d)!;
    for (const v of versionStarts) if (v.start <= s + MINUTE_MS) d.version = v.version;
  }
  // phase: a per-phase notice's title, a twin with the same dates, else I for the version update and the next
  // number for each later start day within the version
  for (const d of drafts) {
    if (d.phase) continue;
    if (!d.raw.start) {
      d.phase = d.version ? "I" : null;
      continue;
    }
    const twin = drafts.find((o) => o !== d && o.phase && o.raw.start === d.raw.start && o.raw.end === d.raw.end);
    if (twin) {
      d.phase = twin.phase;
      continue;
    }
    if (!d.version) continue;
    const day = d.raw.start.slice(0, 10);
    const sameVersion = drafts.filter((o) => o.version === d.version);
    const earlierDays = new Set(sameVersion.filter((o) => o.raw.start && o.raw.start.slice(0, 10) < day).map((o) => o.raw.start!.slice(0, 10)));
    const hasVersionStart = sameVersion.some((o) => !o.raw.start);
    d.phase = normalizePhase(String(earlierDays.size + (hasVersionStart ? 2 : 1)));
  }
  const banners: ConveneBanner[] = drafts.map((d) => {
    const { raw } = d;
    const label = d.version ? (d.phase ? `${d.version} Phase ${d.phase}` : d.version) : null;
    return {
      id: `${d.article.id}:${d.index}`,
      articleId: d.article.id,
      sourceIds: d.sources,
      title: raw.title,
      category: raw.category,
      type: raw.type,
      poolTypes: POOLS_OF[raw.category][raw.type].slice(),
      selectable: raw.selectable,
      fiveStars: raw.fiveStars.map((n) => item(n, raw.type)),
      fourStars: raw.fourStars.map((n) => item(n, raw.type)),
      version: d.version,
      phase: d.phase,
      label,
      startMs: startOf.get(d)!,
      endMs: wallClockMs(raw.end, offset) + MINUTE_MS - 1,
      startApprox: !raw.start,
    };
  });
  // a start of +Infinity is a version-update banner waiting for its release: kept only when asked for everything
  return banners
    .filter((b) => !Number.isNaN(b.startMs) && Number.isFinite(b.endMs) && b.startMs <= now)
    .sort((a, b) => (b.startMs === a.startMs ? 0 : b.startMs - a.startMs) || (a.type === b.type ? 0 : a.type === "resonator" ? -1 : 1) || a.articleId - b.articleId);
}

/** notices that still announce a banner not yet started (at the earliest server clock, UTC+8) */
export function unreleasedArticleIds(articles: readonly ParsedArticle[], now: number, releases?: Record<string, string>): Set<number> {
  const out = new Set<number>();
  for (const b of buildBannerList(articles, { now: Number.POSITIVE_INFINITY, serverOffsetHours: 8, releases, clock: now })) {
    if (b.startMs > now) for (const id of b.sourceIds) out.add(Number(id.split(":")[0]));
  }
  return out;
}

/** a version-update banner is waiting for its version's release entry (the feed is then re-read hourly) */
export function awaitingRelease(articles: readonly ParsedArticle[], releases: Record<string, string> | undefined, now: number): boolean {
  if (!releases || !Object.keys(releases).length) return false;
  return buildBannerList(articles, { now: Number.POSITIVE_INFINITY, releases, clock: now }).some((b) => b.startMs === Number.POSITIVE_INFINITY);
}

export function isLive(b: ConveneBanner, now: number): boolean {
  return b.startMs <= now && now <= b.endMs;
}

export function liveBanners(banners: readonly ConveneBanner[], now: number): ConveneBanner[] {
  return banners.filter((b) => isLive(b, now));
}

export interface ItemRun {
  bannerId: string;
  startMs: number;
  endMs: number;
  label: string | null;
}

/** every run of each featured 5★ (keyed by app key, else normalised name), oldest first — rerun gaps, last run */
export function featuredRuns(banners: readonly ConveneBanner[]): Map<string, ItemRun[]> {
  const runs = new Map<string, ItemRun[]>();
  for (const b of banners) {
    for (const f of b.fiveStars) {
      const k = f.key ?? normalizeItemName(f.name);
      const list = runs.get(k) ?? [];
      list.push({ bannerId: b.id, startMs: b.startMs, endMs: b.endMs, label: b.label });
      runs.set(k, list);
    }
  }
  for (const list of runs.values()) list.sort((a, b) => a.startMs - b.startMs);
  return runs;
}

// ── records ↔ banners ──────────────────────────────────────────────────────────────────────────────────────────

export interface RecordBannerLink {
  /** the banner this pull was made on, when the time (and for a featured 5★, the item) pins it down */
  bannerId: string | null;
  /** every banner of this pool type running at that moment */
  candidates: string[];
  /** no banner ran at that exact moment; the candidates are the nearest within the tolerance */
  approximate: boolean;
}

/**
 * Tag each pull with the banner it came from. Banners of one pool type often run side by side (a new 5★ and a
 * rerun share the Featured pool and its 4★s), so a pull pins one banner only when a single one was live — or when
 * it is that banner's featured 5★. Record times are CST; banner times are whatever server clock the list was built
 * with; `toleranceHours` absorbs the gap around a version update.
 */
export function linkRecordsToBanners(
  poolType: number,
  records: readonly ConveneRecord[],
  banners: readonly ConveneBanner[],
  opts: { toleranceHours?: number } = {},
): RecordBannerLink[] {
  const tol = (opts.toleranceHours ?? 12) * 3600_000;
  const pool = banners.filter((b) => b.poolTypes.includes(poolType));
  return records.map((r) => {
    const t = recordTimeMs(r.time);
    let live = pool.filter((b) => b.startMs <= t && t <= b.endMs);
    let approximate = false;
    if (!live.length && Number.isFinite(t)) {
      const near = pool
        .map((b) => ({ b, gap: t < b.startMs ? b.startMs - t : t > b.endMs ? t - b.endMs : 0 }))
        .filter((x) => x.gap <= tol);
      const best = Math.min(...near.map((x) => x.gap));
      live = near.filter((x) => x.gap === best).map((x) => x.b);
      approximate = live.length > 0;
    }
    if (r.qualityLevel >= 5 && Number.isFinite(t)) {
      const n = normalizeItemName(r.name);
      const features = (b: ConveneBanner) => b.fiveStars.some((f) => normalizeItemName(f.name) === n);
      const own = live.filter(features);
      if (own.length === 1) return { bannerId: own[0]!.id, candidates: live.map((b) => b.id), approximate };
      if (!own.length) {
        // a featured 5★ none of the live banners carries: its own banner just outside our window (release day —
        // a version-update start is conservative)
        const near = pool.filter((b) => features(b) && t >= b.startMs - tol && t <= b.endMs + tol);
        if (near.length === 1) return { bannerId: near[0]!.id, candidates: [near[0]!.id], approximate: true };
      }
    }
    return { bannerId: live.length === 1 ? live[0]!.id : null, candidates: live.map((b) => b.id), approximate };
  });
}

// ── fetch, cache, stale-while-revalidate ───────────────────────────────────────────────────────────────────────

export interface BannerCache {
  v: number;
  /** when the menu was last read (0 for the shipped seed) */
  fetchedAt: number;
  articles: Record<string, ParsedArticle>;
  /** version → release time from the menu (versionReleases); absent in caches written before 2026-10-26 */
  releases?: Record<string, string>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isParsedArticle(a: unknown): a is ParsedArticle {
  if (!a || typeof a !== "object") return false;
  const o = a as ParsedArticle;
  return typeof o.id === "number" && typeof o.published === "string" && Array.isArray(o.banners);
}

export function decodeBannerCache(raw: string | null): BannerCache | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as BannerCache;
    if (!o || o.v !== BANNER_CACHE_VERSION || typeof o.fetchedAt !== "number" || !o.articles || typeof o.articles !== "object") return null;
    const articles: Record<string, ParsedArticle> = {};
    for (const [id, a] of Object.entries(o.articles)) if (isParsedArticle(a)) articles[id] = a;
    const releases: Record<string, string> = {};
    if (o.releases && typeof o.releases === "object")
      for (const [v, t] of Object.entries(o.releases)) if (/^\d+\.\d+$/.test(v) && typeof t === "string" && Number.isFinite(wallClockMs(t, 8))) releases[v] = t;
    return { v: BANNER_CACHE_VERSION, fetchedAt: o.fetchedAt, articles, releases };
  } catch {
    return null;
  }
}

export function readBannerCache(storage: KeyValueStorage | null = defaultStorage()): BannerCache | null {
  try {
    return decodeBannerCache(storage?.getItem(BANNER_CACHE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeBannerCache(cache: BannerCache, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BANNER_CACHE_KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

/** seed ∪ cache (the cache wins per notice; the newer fetch time is kept) */
export function mergeBannerCaches(...caches: (BannerCache | null | undefined)[]): BannerCache {
  const out: BannerCache = { v: BANNER_CACHE_VERSION, fetchedAt: 0, articles: {}, releases: {} };
  for (const c of caches) {
    if (!c) continue;
    out.fetchedAt = Math.max(out.fetchedAt, c.fetchedAt);
    Object.assign(out.articles, c.articles);
    out.releases = mergeReleases(out.releases, c.releases);
  }
  return out;
}

/** what the cache must hold beyond the seed (localStorage is shared with the pull history — don't store the seed twice) */
export function withoutSeed(cache: BannerCache, seed: BannerCache | null | undefined): BannerCache {
  if (!seed) return cache;
  const articles: Record<string, ParsedArticle> = {};
  for (const [id, a] of Object.entries(cache.articles)) if (seed.articles[id]?.published !== a.published) articles[id] = a;
  const releases: Record<string, string> = {};
  for (const [v, t] of Object.entries(cache.releases ?? {})) if (seed.releases?.[v] !== t) releases[v] = t;
  return { ...cache, articles, releases };
}

interface MenuEntry {
  articleId: number;
  articleTitle: string;
  startTime: string;
}

async function getJson(url: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const res = await fetchImpl(url, { credentials: "omit", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface RefreshOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: number;
  /** parallel notice fetches (default 6) */
  concurrency?: number;
}

/**
 * Read the menu and fetch every Convene notice the cache doesn't hold yet (or whose publish time changed); the menu's
 * release entries (patch notes) come along for free. A notice that fails to load is left out and retried next time; a
 * menu that fails rejects the whole refresh.
 */
export async function refreshBannerCache(base: BannerCache, opts: RefreshOptions = {}): Promise<BannerCache> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const menu = await getJson(`${NEWS_BASE}/ArticleMenu.json`, fetchImpl, opts.signal);
  if (!Array.isArray(menu)) throw new Error("bad menu");
  const wanted = (menu as MenuEntry[]).filter(
    (e) => e && typeof e.articleId === "number" && typeof e.articleTitle === "string" && isConveneNotice(e),
  );
  const todo = wanted.filter((e) => base.articles[String(e.articleId)]?.published !== e.startTime);
  const articles = { ...base.articles };
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const e = todo[next++]!;
      try {
        const a = (await getJson(`${NEWS_BASE}/article/${e.articleId}.json`, fetchImpl, opts.signal)) as Record<string, unknown>;
        if (typeof a.articleContent !== "string") continue;
        articles[String(e.articleId)] = parseConveneArticle({
          articleId: e.articleId,
          articleTitle: typeof a.articleTitle === "string" ? a.articleTitle : e.articleTitle,
          startTime: typeof a.startTime === "string" ? a.startTime : e.startTime,
          articleContent: a.articleContent,
        });
      } catch {
        if (opts.signal?.aborted) return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 6, todo.length)) }, worker));
  if (opts.signal?.aborted) throw new Error("aborted");
  return { v: BANNER_CACHE_VERSION, fetchedAt: opts.now ?? Date.now(), articles, releases: mergeReleases(base.releases, versionReleases(menu as MenuEntry[])) };
}

export type BannerFeedSource = "network" | "cache" | "seed" | "none";

export interface BannerFeed {
  banners: ConveneBanner[];
  /** when Kuro's menu was last read (null: never in this browser) */
  fetchedAt: number | null;
  source: BannerFeedSource;
  /** older than the TTL (a refresh is due or failed) */
  stale: boolean;
  /** a user-facing line when the feed couldn't be refreshed */
  error: string | null;
}

export interface LoadBannersOptions extends BuildOptions {
  storage?: KeyValueStorage | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** the shipped seed (lazy-import data/bannerSeed.json) */
  seed?: BannerCache | null;
  ttlMs?: number;
  /** the TTL while a version-update banner waits for its release entry (default 1 h) */
  awaitingTtlMs?: number;
  concurrency?: number;
  /** false: serve seed ∪ cache only, never touch the network (a glance at the live banners; default true) */
  revalidate?: boolean;
  /**
   * true: the list also holds banners that haven't started (a start of +Infinity: waiting for a release) — for a
   * caller that filters `startMs <= now` on its own live clock, so a phase that starts while the page is open shows
   * up. Default false: released banners only.
   */
  listAll?: boolean;
}

export const BANNER_FEED_OFFLINE = "Couldn't reach Kuro's news feed.";

function feedOf(cache: BannerCache, source: BannerFeedSource, stale: boolean, error: string | null, opts: BuildOptions): BannerFeed {
  const banners = buildBannerList(Object.values(cache.articles), { ...opts, releases: cache.releases });
  const fetchedAt = cache.fetchedAt > 0 ? cache.fetchedAt : null;
  let message = error;
  if (error) {
    message = banners.length
      ? `${error} Showing the banners saved ${fetchedAt ? "on " + new Date(fetchedAt).toISOString().slice(0, 10) : "with the app"}.`
      : `${error} No banners saved yet — try again when you're online.`;
  }
  return { banners, fetchedAt, source: banners.length ? source : "none", stale, error: message };
}

/**
 * Stale-while-revalidate: `feed` is what the cache (or the seed) holds right now; `refreshed` resolves with the
 * network result when the cache is older than the TTL (null when it is fresh). A failed refresh resolves (never
 * rejects) with the cached list and a message.
 */
export function loadBanners(opts: LoadBannersOptions = {}): { feed: BannerFeed; refreshed: Promise<BannerFeed> | null } {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const nowMs = opts.now ?? Date.now();
  const build: BuildOptions = { serverOffsetHours: opts.serverOffsetHours, now: opts.listAll ? Number.POSITIVE_INFINITY : nowMs, clock: nowMs };
  const cache = readBannerCache(storage);
  const base = mergeBannerCaches(opts.seed, cache);
  const age = cache ? nowMs - cache.fetchedAt : Number.POSITIVE_INFINITY;
  const stale =
    age > (opts.ttlMs ?? BANNER_CACHE_TTL_MS) ||
    (age > (opts.awaitingTtlMs ?? BANNER_AWAITING_TTL_MS) && awaitingRelease(Object.values(base.articles), base.releases, nowMs));
  const feed = feedOf(base, cache ? "cache" : opts.seed ? "seed" : "none", stale, null, build);
  if (!stale || opts.revalidate === false) return { feed, refreshed: null };
  const refreshed = refreshBannerCache(base, { fetchImpl: opts.fetchImpl, signal: opts.signal, now: nowMs, concurrency: opts.concurrency })
    .then((fresh) => {
      writeBannerCache(withoutSeed(fresh, opts.seed), storage);
      return feedOf(fresh, "network", false, null, build);
    })
    .catch(() => feedOf(base, cache ? "cache" : opts.seed ? "seed" : "none", true, BANNER_FEED_OFFLINE, build));
  return { feed, refreshed };
}
