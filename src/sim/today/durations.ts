// Wuthering Tools+ — limited-time events from Kuro's own text: every event in a version's patch notes carries a
// `✦Duration:` line under its heading, and the stand-alone event notices (double drops, "Event Preview | …") a
// `✦Duration✦` line with the dates on the next line. Formats handled (all seen in the feed, 2024–2026):
//   - "2026-10-08 04:00 - 2026-10-26 03:59 (server time)" (slashed dates and "~" too) and "… (UTC+8)" for web events;
//   - "Version 3.7 Update - 2026-11-11 03:59 (server time)": starts with the version update (its patch notes' publish
//     time — the same release moment convene's banner calendar uses);
//   - "Permanently available after Version 3.7 update." — dropped; so is anything else (a "(PT)" clock, prose).
// Each event keeps its clock: "server" rows move with the player's region, "utc+8" rows are one global moment.
// Released content only: an event of a version that hasn't gone live is never listed, and an upcoming event is listed
// only while it starts inside the version that is live (before that version's end — rules.versionEnds, else its
// release + 40 days). Where sources disagree Kuro's text wins: a hand-entered row (rules.manualEvents, for posts Kuro
// made as images) gives way to a parsed row of the same event.
// Pure: no fetch, no storage, no clock.
import { articleLines, releasedVersionOf, wallClockMs } from "../convene/banners";
import { DAY_MS, MINUTE_MS } from "./resets";
import { RULES, doubleDropRuleFor, type DoubleDropRule, type ManualEventRule, type TodayRules } from "./rules";

export type EventTz = "server" | "utc+8";
export type EventKind = "combat" | "exploration" | "login" | "web" | "leisure" | "double-drop" | "other";

/** one event as a notice states it (wall clocks, unresolved) */
export interface RawEvent {
  name: string;
  /** "Featured Combat Event", "Web Event", … (null when the notice names none) */
  type: string | null;
  kind: EventKind;
  /** "YYYY-MM-DD HH:mm" on the event's clock; null = starts with the version update */
  start: string | null;
  /** "YYYY-MM-DD HH:mm", inclusive minute */
  end: string;
  tz: EventTz;
  /** the version whose update starts it (start === null) */
  version: string | null;
  articleId: number;
}

/** a notice read for /today: a version's patch notes or a stand-alone event notice */
export interface NewsArticle {
  id: number;
  title: string;
  /** publish time, CST "YYYY-MM-DD HH:mm:ss" */
  published: string;
  kind: "patch-notes" | "event";
  /** the released version a patch-notes notice announces */
  version: string | null;
  events: RawEvent[];
}

export interface TimedEvent {
  /** stable across reloads and regions: "<articleId>:<name>@<end wall clock>" (one notice may list a name twice) */
  id: string;
  name: string;
  type: string | null;
  kind: EventKind;
  startMs: number;
  endMs: number;
  tz: EventTz;
  articleId: number;
  /** starts with a version update: the start is the patch notes' publish time, not a stated minute */
  startApprox: boolean;
  source: "kuro" | "manual";
}

export type DurationParse =
  | { kind: "range"; start: string; end: string; tz: EventTz }
  | { kind: "version"; version: string; end: string; tz: EventTz }
  | { kind: "permanent" };

const DATE = String.raw`(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})`;
const RANGE_RE = new RegExp(`${DATE}\\s*[-–~]\\s*${DATE}`);
const VERSION_RE = new RegExp(String.raw`version\s+(\d+\.\d+)\s+update\s*[-–~]\s*${DATE}`, "i");
const DURATION_INLINE_RE = /^✦\s*duration\s*[:：]\s*(.+)$/i;
const DURATION_HEAD_RE = /^✦\s*duration\s*✦?\s*$/i;
/** "[Special Events] [Cubie Wars] Leisure Event" → name "Cubie Wars", type "Leisure Event" */
const HEADING_RE = /^(?:\[[^\]]+\]\s*)*\[([^\]]+)\]\s*(.*)$/;

function wall(y: string, mo: string, d: string, h: string, mi: string): string {
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")} ${h.padStart(2, "0")}:${mi}`;
}

/** the clock a duration states: "(server time)" or "(UTC+8)"; null for any other ("(PT)") */
function tzOf(text: string): EventTz | null {
  const paren = /\(([^)]*)\)\s*\.?\s*$/.exec(text)?.[1] ?? null;
  if (paren == null) return "server";
  if (/server\s*time/i.test(paren)) return "server";
  if (/utc\s*\+\s*8(?::00)?\b|gmt\s*\+\s*8|\bcst\b/i.test(paren)) return "utc+8";
  return null;
}

/** one duration text (what follows "✦Duration:"); null when it isn't a format we trust */
export function parseDuration(text: string): DurationParse | null {
  const t = text.trim();
  if (/^permanent/i.test(t)) return { kind: "permanent" };
  const tz = tzOf(t);
  if (!tz) return null;
  const v = VERSION_RE.exec(t);
  if (v) return { kind: "version", version: v[1]!, end: wall(v[2]!, v[3]!, v[4]!, v[5]!, v[6]!), tz };
  const r = RANGE_RE.exec(t);
  if (r) return { kind: "range", start: wall(r[1]!, r[2]!, r[3]!, r[4]!, r[5]!), end: wall(r[6]!, r[7]!, r[8]!, r[9]!, r[10]!), tz };
  return null;
}

export function kindOf(name: string, type: string | null): EventKind {
  const t = `${type ?? ""} ${name}`;
  if (/double\s*drop/i.test(t) || doubleDropRuleFor(name)) return "double-drop";
  if (/log\s*-?\s*in/i.test(t)) return "login";
  if (/web\s+event/i.test(t)) return "web";
  if (/combat|challenge|battle/i.test(t)) return "combat";
  if (/exploration/i.test(t)) return "exploration";
  if (/leisure|photo|collection|mini-?game|fishing/i.test(t)) return "leisure";
  return "other";
}

/** "Event Preview | [Resonance Sim Realm] Combat Event, Coming Soon!" → the bracketed name and the words after it */
function headingFromTitle(title: string): { name: string; type: string | null } | null {
  const m = /\[([^\]]+)\]\s*([^[]*)$/.exec(title);
  if (!m) return null;
  const type = m[2]!.replace(/,?\s*(?:is\s+)?(?:coming\s+soon|now\s+live|available\s+soon)[!.]*\s*$/i, "").replace(/[!.,\s]+$/, "").trim();
  return { name: m[1]!.trim(), type: type || null };
}

function headingFromLine(line: string): { name: string; type: string | null } | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  const type = m[2]!.trim();
  // "[Log in for 1 day in total]: Radiant Tide x5" is a reward line, not a heading
  if (type.startsWith(":")) return null;
  return { name: m[1]!.trim(), type: type || null };
}

/** the events one notice lists (permanent and unreadable lines skipped) */
export function parseNewsArticle(article: { articleId: number; articleTitle: string; startTime: string; articleContent: string }): NewsArticle {
  const title = (article.articleTitle ?? "").trim();
  const lines = articleLines(article.articleContent ?? "");
  const patchVersion = releasedVersionOf(title);
  const events: RawEvent[] = [];
  let sectionStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let text: string | null = null;
    let consumed = 0;
    const inline = DURATION_INLINE_RE.exec(line);
    if (inline) text = inline[1]!;
    else if (DURATION_HEAD_RE.test(line) && i + 1 < lines.length) {
      text = lines[i + 1]!;
      consumed = 1;
    }
    if (text == null) continue;
    const d = parseDuration(text);
    // the heading: the nearest bracketed line above, inside this section; else the notice's own title
    let heading: { name: string; type: string | null } | null = null;
    for (let j = i - 1; j >= sectionStart && !heading; j--) heading = headingFromLine(lines[j]!);
    heading ??= headingFromTitle(title);
    sectionStart = i + 1 + consumed;
    if (!d || d.kind === "permanent" || !heading) continue;
    events.push({
      name: heading.name,
      type: heading.type,
      kind: kindOf(heading.name, heading.type),
      start: d.kind === "range" ? d.start : null,
      end: d.end,
      tz: d.tz,
      version: d.kind === "version" ? d.version : null,
      articleId: article.articleId,
    });
  }
  return { id: article.articleId, title, published: article.startTime, kind: patchVersion ? "patch-notes" : "event", version: patchVersion, events };
}

/** is a menu entry worth reading for /today? a released version's patch notes, a double drop or an event preview */
export function isTodayNotice(entry: { articleTitle: string }): boolean {
  const t = entry.articleTitle ?? "";
  return releasedVersionOf(t) != null || /double\s*drop/i.test(t) || /^event\s+preview\b/i.test(t);
}

// ── resolve to moments ─────────────────────────────────────────────────────────────────────────────────────────

/** "3.10" > "3.7" */
export function compareVersions(a: string, b: string): number {
  const [a1 = 0, a2 = 0] = a.split(".").map(Number);
  const [b1 = 0, b2 = 0] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2;
}

export function newestVersion(releases: Record<string, string>): string | null {
  const vs = Object.keys(releases);
  return vs.length ? vs.reduce((m, v) => (compareVersions(v, m) > 0 ? v : m)) : null;
}

/** a version runs about six weeks (3.6 → 3.7: 41 days, 3.7 → 3.8: 43); the cut-off for upcoming rows when Kuro gave no end */
export const VERSION_SPAN_FALLBACK_MS = 40 * DAY_MS;

/** when the live version ends: its stated end day (rules.versionEnds; 04:00 UTC+8, when 3.7's update maintenance began) or its release + 40 days */
export function versionEndMs(version: string | null, releases: Record<string, string>, rules: TodayRules = RULES): number | null {
  if (!version) return null;
  const stated = rules.versionEnds[version];
  if (stated) {
    const ms = wallClockMs(`${stated.date} 04:00`, 8);
    if (Number.isFinite(ms)) return ms;
  }
  const at = releases[version];
  return at ? wallClockMs(at, 8) + VERSION_SPAN_FALLBACK_MS : null;
}

export interface ResolveOptions {
  /** the player's server clock */
  offsetHours: number;
  /** version → release time (convene's versionReleases) */
  releases: Record<string, string>;
  now: number;
  rules?: TodayRules;
}

function resolveRaw(raw: RawEvent, published: string, opts: ResolveOptions, newest: string | null, source: TimedEvent["source"]): TimedEvent | null {
  const offset = raw.tz === "utc+8" ? 8 : opts.offsetHours;
  let startMs: number;
  if (raw.start) startMs = wallClockMs(raw.start, offset);
  else {
    const at = raw.version ? opts.releases[raw.version] : undefined;
    if (at) startMs = wallClockMs(at, 8);
    // a version newer than every released one hasn't gone live: never listed
    else if (raw.version && newest && compareVersions(raw.version, newest) > 0) return null;
    else startMs = wallClockMs(published, 8);
  }
  const endMs = wallClockMs(raw.end, offset) + MINUTE_MS - 1;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return {
    id: `${raw.articleId}:${raw.name}@${raw.end}`,
    name: raw.name,
    type: raw.type,
    kind: raw.kind,
    startMs,
    endMs,
    tz: raw.tz,
    articleId: raw.articleId,
    startApprox: !raw.start,
    source,
  };
}

export function manualToRaw(m: ManualEventRule): RawEvent {
  return { name: m.name, type: m.type, kind: kindOf(m.name, m.type), start: m.start, end: m.end, tz: m.tz, version: null, articleId: m.articleId };
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Every listed event from the notices read so far plus the hand-entered rows: resolved on the player's clock, an
 * unreleased version's rows dropped, upcoming rows only inside the live version, duplicates folded (Kuro's text over a
 * hand-entered row), ordered by end.
 */
export function buildEventList(articles: readonly NewsArticle[], opts: ResolveOptions): TimedEvent[] {
  const rules = opts.rules ?? RULES;
  const newest = newestVersion(opts.releases);
  const cutoff = versionEndMs(newest, opts.releases, rules) ?? opts.now;
  const out = new Map<string, TimedEvent>();
  const add = (e: TimedEvent | null) => {
    if (!e) return;
    if (e.startMs > opts.now && e.startMs >= cutoff) return;
    const key = `${normName(e.name)}|${e.endMs}`;
    const prev = out.get(key);
    if (!prev || (prev.source === "manual" && e.source === "kuro") || (prev.startApprox && !e.startApprox && prev.source === e.source)) out.set(key, e);
  };
  for (const a of [...articles].sort((x, y) => x.id - y.id)) for (const raw of a.events) add(resolveRaw(raw, a.published, opts, newest, "kuro"));
  // a hand-entered row stands for a post Kuro had already made: none before its publish time (no teasers)
  for (const m of rules.manualEvents) if (!(wallClockMs(m.published, 8) > opts.now)) add(resolveRaw(manualToRaw(m), m.published, opts, newest, "manual"));
  return [...out.values()].sort((a, b) => a.endMs - b.endMs || a.startMs - b.startMs || a.name.localeCompare(b.name));
}

export const ENDING_SOON_MS = 3 * DAY_MS;
export const UPCOMING_MS = 14 * DAY_MS;

export interface EventBuckets {
  /** running, ending within 3 days — soonest first */
  endingSoon: TimedEvent[];
  /** running, ending later — soonest end first */
  live: TimedEvent[];
  /** starting within 14 days — soonest start first */
  upcoming: TimedEvent[];
}

export function bucketEvents(events: readonly TimedEvent[], now: number, opts: { soonMs?: number; upcomingMs?: number } = {}): EventBuckets {
  const soon = opts.soonMs ?? ENDING_SOON_MS;
  const ahead = opts.upcomingMs ?? UPCOMING_MS;
  const endingSoon: TimedEvent[] = [];
  const live: TimedEvent[] = [];
  const upcoming: TimedEvent[] = [];
  for (const e of events) {
    if (e.endMs < now) continue;
    if (e.startMs <= now) (e.endMs - now <= soon ? endingSoon : live).push(e);
    else if (e.startMs - now <= ahead) upcoming.push(e);
  }
  endingSoon.sort((a, b) => a.endMs - b.endMs);
  live.sort((a, b) => a.endMs - b.endMs);
  upcoming.sort((a, b) => a.startMs - b.startMs);
  return { endingSoon, live, upcoming };
}

export interface LiveDoubleDrop {
  event: TimedEvent;
  rule: DoubleDropRule;
}

/** the double-drop events running at `now`, with their claim rules */
export function doubleDropsAt(events: readonly TimedEvent[], now: number, rules: TodayRules = RULES): LiveDoubleDrop[] {
  const out: LiveDoubleDrop[] = [];
  for (const e of events) {
    if (e.kind !== "double-drop" || e.startMs > now || e.endMs < now) continue;
    const rule = doubleDropRuleFor(e.name, rules);
    if (rule) out.push({ event: e, rule });
  }
  return out;
}

/** what a double-drop event is worth: each doubled claim is exactly one extra run */
export function doubleDropMath(rule: DoubleDropRule, days: number) {
  return {
    extraRunsPerDay: rule.claimsPerDay,
    extraRuns: rule.claimsPerDay * Math.max(0, days),
    waveplatesPerDay: rule.claimsPerDay * rule.costPerClaim,
  };
}
