// Wuthering Tools+ — /today's state for the page and the /account card: the player's server clock (convene's `server`
// preference — one setting for both pages), a ticking clock, the stored Waveplate count / checklist ticks
// (state.ts), Kuro's news (news.ts, read once a day; the same menu read refreshes convene's banner cache when that is
// stale too) and everything derived from them. The feed and the stored state are module-level, so the card and the
// page share them; the clock runs while any user of it is mounted.
import { computed, effectScope, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from "vue";
import { loadBanners, wallClockMs, type BannerCache } from "../convene/banners";
import { guessServerRegion, type ServerRegionId } from "../convene/prefs";
import { useBannerFeed, useConvenePrefs, useLiveBanners } from "../convene/ui/useConvene";
import { checklistSummary, itemState, setCount, visibleItems, type ChecklistContext } from "./checklist";
import { bucketEvents, buildEventList, compareVersions, doubleDropMath, doubleDropsAt, newestVersion, versionEndMs, type TimedEvent } from "./durations";
import { fmtClock, fmtDate } from "./format";
import { buildIcs, type IcsEvent } from "./ics";
import { loadNews, shareMenuFetch, type NewsFeed } from "./news";
import { browserOffsetMinutes, cycleWindow, DAY_MS, lastDailyReset, lastWeeklyReset, nextDailyReset, nextWeeklyReset, progressOf, utcLabel } from "./resets";
import { KURO_NOTICE_URL, RULES, doubleDropRuleFor, type ChecklistRule } from "./rules";
import { TODAY_STATE_KEY, readTodayState, writeTodayState, type TodayState } from "./state";
import { projectWaveplates, type WaveplateEntry } from "./waveplates";

// ── stored state (shared, synced across tabs) ───────────────────────────────────────────────────────────────────

const state = ref<TodayState>(readTodayState());
let stateWatching = false;
function startState(): void {
  if (stateWatching) return;
  stateWatching = true;
  effectScope(true).run(() => watch(state, (s) => void writeTodayState(s), { deep: true }));
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === TODAY_STATE_KEY || e.key === null) state.value = readTodayState();
    });
  }
}

// ── the news feed (shared) ──────────────────────────────────────────────────────────────────────────────────────

const news = shallowRef<NewsFeed>(loadNews({ revalidate: false }).feed);
const newsLoading = ref(false);
let refreshing: Promise<void> | null = null;
let seedPromise: Promise<BannerCache> | null = null;
function bannerSeed(): Promise<BannerCache> {
  seedPromise ??= import("../convene/data/bannerSeed.json").then((m) => ((m as { default?: unknown }).default ?? m) as BannerCache);
  return seedPromise;
}

// ── a ticking clock (1 s while a user is mounted and the tab is visible) ──────────────────────────────────────

const clock = ref(Date.now());
let clockUsers = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
function tick(): void {
  clock.value = Date.now();
}
function onVisibility(): void {
  if (typeof document !== "undefined" && document.visibilityState === "visible") tick();
}
function useClock(): Ref<number> {
  onMounted(() => {
    clockUsers += 1;
    tick();
    if (!clockTimer) {
      clockTimer = setInterval(() => {
        if (typeof document === "undefined" || document.visibilityState !== "hidden") tick();
      }, 1000);
      document.addEventListener("visibilitychange", onVisibility);
    }
  });
  onBeforeUnmount(() => {
    clockUsers -= 1;
    if (clockUsers <= 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
      document.removeEventListener("visibilitychange", onVisibility);
    }
  });
  return clock;
}

/** save a text file (the .ics) through a temporary link */
export function downloadText(filename: string, text: string, type = "text/calendar;charset=utf-8"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface VersionPhase {
  startMs: number;
  endMs: number | null;
  approx: boolean;
  /** Kuro stated the end (rules.versionEnds), not the 40-day estimate */
  stated: boolean;
}

/** "3.7" → 307, so phases count across "3.9" → "3.10" */
function versionIndex(v: string): number {
  const [a = 0, b = 0] = v.split(".").map(Number);
  return a * 100 + b;
}

export interface UseTodayOptions {
  /** read Kuro's feed when the cache is stale (the page); false: the cache only (the /account card) */
  network?: boolean;
}

export function useToday(opts: UseTodayOptions = {}) {
  startState();
  const nowSec = useClock();
  /** minute resolution for everything but the ticking clock face */
  const now = computed(() => Math.floor(nowSec.value / 60_000) * 60_000);

  // ── region ──
  const prefs = useConvenePrefs();
  const bannerFeed = useBannerFeed();
  const { serverId, offsetHours } = bannerFeed;
  const regionGuessed = computed(() => prefs.value.server == null);
  const guessedRegion = computed<ServerRegionId>(() => guessServerRegion(browserOffsetMinutes()));
  function setRegion(id: ServerRegionId): void {
    serverId.value = id;
  }

  // ── resets ──
  const resets = computed(() => {
    const o = offsetHours.value;
    const t = now.value;
    const dailyStart = lastDailyReset(t, o, RULES.resets.hour);
    const weeklyStart = lastWeeklyReset(t, o, RULES.resets.hour, RULES.resets.weekday);
    return {
      daily: { startMs: dailyStart, nextMs: nextDailyReset(t, o, RULES.resets.hour), progress: progressOf(dailyStart, dailyStart + DAY_MS, t) },
      weekly: { startMs: weeklyStart, nextMs: nextWeeklyReset(t, o, RULES.resets.hour, RULES.resets.weekday), progress: progressOf(weeklyStart, weeklyStart + 7 * DAY_MS, t) },
    };
  });

  // ── news, events ──
  const releases = computed(() => news.value.cache.releases);
  const newest = computed(() => newestVersion(releases.value));
  const events = computed<TimedEvent[]>(() =>
    buildEventList(Object.values(news.value.cache.articles), { offsetHours: offsetHours.value, releases: releases.value, now: now.value }),
  );
  const buckets = computed(() => bucketEvents(events.value, now.value));
  const liveDoubleDrops = computed(() => doubleDropsAt(events.value, now.value));
  const upcomingDoubleDrops = computed(() =>
    buckets.value.upcoming.filter((e) => e.kind === "double-drop").map((e) => ({ event: e, rule: doubleDropRuleFor(e.name) })).filter((x) => x.rule),
  );
  const fetchedAt = computed(() => (news.value.cache.fetchedAt > 0 ? news.value.cache.fetchedAt : null));
  const newsError = computed(() => news.value.error);
  const hasNews = computed(() => Object.keys(news.value.cache.articles).length > 0);

  /**
   * Read Kuro's feed when the /today cache is stale (or `force`), and bring convene's banner cache up to date when that
   * one is stale — one shared menu read for both; the shared banner list then rebuilds from the cache.
   */
  async function refresh(force = false): Promise<void> {
    if (refreshing) return refreshing;
    const fetchImpl = shareMenuFetch(globalThis.fetch.bind(globalThis));
    const n = loadNews({ fetchImpl, force });
    news.value = { ...n.feed, error: news.value.error };
    newsLoading.value = !!n.refreshed;
    refreshing = (async () => {
      // without the shipped seed a banner refresh would fetch every Convene notice ever posted: skip it then
      const seed = await bannerSeed().catch(() => null);
      const b = seed ? loadBanners({ seed, fetchImpl, serverOffsetHours: offsetHours.value, listAll: true }) : { refreshed: null };
      if (!n.refreshed && !b.refreshed) return;
      try {
        const [fresh] = await Promise.all([n.refreshed ?? Promise.resolve(null), b.refreshed ?? Promise.resolve(null)]);
        if (fresh) news.value = fresh;
        if (b.refreshed) await bannerFeed.load();
      } finally {
        newsLoading.value = false;
      }
    })().finally(() => {
      newsLoading.value = false;
      refreshing = null;
    });
    return refreshing;
  }

  // ── endgame ──
  const cycles = computed(() =>
    RULES.cycles.map((rule) => {
      const w = cycleWindow(rule, now.value, offsetHours.value);
      return { rule, window: w, progress: w ? progressOf(w.startMs, w.nextMs, now.value) : 0 };
    }),
  );
  /** the live version's start and (estimated) end — the Endstate Matrix phase */
  const phase = computed<VersionPhase | null>(() => {
    const v = newest.value;
    const at = v ? releases.value[v] : undefined;
    if (!v || !at) return null;
    return { startMs: wallClockMs(at, 8), endMs: versionEndMs(v, releases.value), approx: true, stated: !!RULES.versionEnds[v] };
  });
  const matrix = computed(() => {
    const m = RULES.matrix;
    const v = newest.value;
    const inCycle = !!v && compareVersions(v, m.fromVersion) >= 0 && compareVersions(v, m.toVersion) <= 0;
    const p = phase.value;
    return {
      rule: m,
      version: v,
      inCycle,
      phaseNumber: inCycle ? versionIndex(v!) - versionIndex(m.fromVersion) + 1 : null,
      phases: versionIndex(m.toVersion) - versionIndex(m.fromVersion) + 1,
      lastPhase: inCycle && v === m.toVersion,
      startMs: p?.startMs ?? null,
      /** only a stated version end is shown as a date */
      endMs: p?.stated ? p.endMs : null,
      progress: p?.stated && p.endMs ? progressOf(p.startMs, p.endMs, now.value) : null,
    };
  });

  // ── banners (convene's feed, the player's clock) ──
  const liveBanners = useLiveBanners(now);

  // ── Waveplates ──
  const waveplates = computed(() => (state.value.waveplates ? projectWaveplates(state.value.waveplates, nowSec.value) : null));
  function setWaveplates(value: number, crystals?: number): void {
    const prev = state.value.waveplates;
    const projected = waveplates.value;
    const entry: WaveplateEntry = { value, crystals: crystals ?? projected?.crystals ?? prev?.crystals ?? 0, atMs: Date.now() };
    state.value = { ...state.value, waveplates: entry };
  }
  function spendWaveplates(n: number): void {
    const p = waveplates.value;
    if (!p) return;
    setWaveplates(Math.max(0, p.waveplates - n), p.crystals);
  }
  function clearWaveplates(): void {
    state.value = { ...state.value, waveplates: null };
  }

  // ── checklist ──
  const checklistCtx = computed<ChecklistContext>(() => ({ now: now.value, offsetHours: offsetHours.value, phase: phase.value }));
  const checklist = computed(() =>
    visibleItems(RULES.checklist, { hidden: state.value.hidden, doubleDropLive: liveDoubleDrops.value.length > 0 }).map((r) =>
      itemState(r, state.value.ticks[r.id], checklistCtx.value),
    ),
  );
  const hiddenItems = computed(() => RULES.checklist.filter((r) => state.value.hidden.includes(r.id)));
  const checklistDone = computed(() => checklistSummary(checklist.value));
  function setTick(rule: ChecklistRule, n: number): void {
    state.value = { ...state.value, ticks: setCount(state.value.ticks, rule, n, Date.now()) };
  }
  function hideItem(id: string, hidden = true): void {
    const set = new Set(state.value.hidden);
    if (hidden) set.add(id);
    else set.delete(id);
    state.value = { ...state.value, hidden: [...set] };
  }

  // ── display ──
  const timeMode = computed({
    get: () => state.value.timeMode,
    set: (m) => (state.value = { ...state.value, timeMode: m }),
  });
  const showLive = computed({
    get: () => state.value.showLive,
    set: (v) => (state.value = { ...state.value, showLive: v }),
  });

  // ── calendar files ──
  function waveplateIcsEvents(): IcsEvent[] {
    const p = waveplates.value;
    if (!p) return [];
    const out: IcsEvent[] = [];
    if (p.fullAt && p.fullAt > Date.now())
      out.push({
        uid: "waveplates-full",
        start: p.fullAt,
        title: `Waveplates full (${RULES.waveplates.max})`,
        description: `Wuthering Waves: your Waveplates reach ${RULES.waveplates.max}. After that they turn into Waveplate Crystals at half speed.`,
        alarmMinutes: 0,
      });
    if (p.crystalsFullAt && p.crystalsFullAt > Date.now())
      out.push({
        uid: "waveplate-crystals-full",
        start: p.crystalsFullAt,
        title: `Waveplate Crystals full (${RULES.waveplates.crystalMax})`,
        description: "Wuthering Waves: Waveplates and crystals are both full — regeneration is wasted from here.",
        alarmMinutes: 0,
      });
    return out;
  }
  function eventIcs(e: TimedEvent): IcsEvent {
    const url = KURO_NOTICE_URL(e.articleId);
    const started = e.startMs <= Date.now();
    // an absolute date on the clock Kuro states it in ("tomorrow" would be wrong by the time the calendar shows it)
    const off = e.tz === "utc+8" ? 8 : offsetHours.value;
    const endText = `${fmtDate(e.endMs, "server", off)}, ${fmtClock(e.endMs, "server", off)} (${e.tz === "utc+8" ? "UTC+8" : `server time, ${utcLabel(off)}`})`;
    return {
      uid: `event-${e.articleId}-${e.name}`,
      start: e.endMs - 2 * 3_600_000,
      end: e.endMs,
      title: `${e.name} ends`,
      description: `Wuthering Waves: ${e.name}${e.type ? ` (${e.type})` : ""} ${started ? "ends" : "runs until"} ${endText}. Kuro's notice: ${url}`,
      url,
      alarmMinutes: 12 * 60,
    };
  }
  function downloadWaveplatesIcs(): void {
    const evs = waveplateIcsEvents();
    if (evs.length) downloadText("waveplates.ics", buildIcs(evs));
  }
  function downloadEventIcs(e: TimedEvent): void {
    downloadText(`${e.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}-ends.ics`, buildIcs([eventIcs(e)]));
  }
  function downloadAllIcs(): void {
    const evs = [...waveplateIcsEvents(), ...[...buckets.value.endingSoon, ...buckets.value.live].map(eventIcs)];
    if (evs.length) downloadText("wuthering-waves-deadlines.ics", buildIcs(evs));
  }

  // ── reminders (Notification API, opt-in, only while a tab is open) ──
  // phones only notify through a service worker (Android Chrome's `new Notification()` throws; iOS needs an installed
  // web app), which this site doesn't have — the calendar file is the phone's reminder, so the button is desktop-only
  const notifySupported =
    typeof window !== "undefined" && "Notification" in window && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? "");
  const notifyDenied = ref(notifySupported && Notification.permission === "denied");
  async function toggleNotify(): Promise<void> {
    if (state.value.notify) {
      state.value = { ...state.value, notify: false };
      return;
    }
    if (!notifySupported) return;
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    notifyDenied.value = p === "denied";
    state.value = { ...state.value, notify: p === "granted" };
  }

  if (opts.network) {
    // phones restore a tab without reloading it: coming back to it re-checks the feed (a no-op while the caches are fresh)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    onMounted(() => {
      void refresh();
      document.addEventListener("visibilitychange", onVisible);
    });
    onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisible));
  }

  return {
    state,
    nowSec,
    now,
    serverId,
    offsetHours,
    regionGuessed,
    guessedRegion,
    setRegion,
    resets,
    news,
    newsLoading,
    newsError,
    fetchedAt,
    hasNews,
    refresh,
    events,
    buckets,
    liveDoubleDrops,
    upcomingDoubleDrops,
    doubleDropMath,
    cycles,
    matrix,
    liveBanners,
    bannerFeed,
    waveplates,
    setWaveplates,
    spendWaveplates,
    clearWaveplates,
    checklist,
    hiddenItems,
    checklistDone,
    setTick,
    hideItem,
    timeMode,
    showLive,
    downloadWaveplatesIcs,
    downloadEventIcs,
    downloadAllIcs,
    notifySupported,
    notifyDenied,
    toggleNotify,
  };
}

export type TodayModel = ReturnType<typeof useToday>;
export const TODAY_KEY = Symbol("wtplus-today");

/** fire a browser notification when Waveplates fill, while this page is open and the player opted in */
export function useWaveplateReminder(model: TodayModel): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  watch(
    () => [model.state.value.notify, model.waveplates.value?.fullAt ?? null] as const,
    ([on, fullAt]) => {
      clear();
      if (!on || !fullAt || !model.notifySupported || Notification.permission !== "granted") return;
      const wait = fullAt - Date.now();
      if (wait <= 0 || wait > 2 ** 31 - 1) return;
      timer = setTimeout(() => {
        try {
          new Notification("Waveplates full", { body: `${RULES.waveplates.max} Waveplates — time to spend them.`, tag: "wtplus-waveplates" });
        } catch {
          /* some mobile browsers only notify from a service worker */
        }
      }, wait);
    },
    { immediate: true },
  );
  onBeforeUnmount(clear);
}
