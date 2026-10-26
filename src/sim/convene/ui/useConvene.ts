// Wuthering Tools+ — the Convene tabs' shared state: the stored pull history (one copy for every tab, kept in sync
// with other browser tabs through the `storage` event), Kuro's banner feed (seed ∪ cache, revalidated only when a tab
// that needs fresh data opens), the page preferences, and a shared clock for countdowns.
// The record link never passes through here except as the in-memory `ConveneQuery` handed straight to Kuro's API.
import { computed, effectScope, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef, type WritableComputedRef } from "vue";
import {
  CONVENE_HISTORY_KEY,
  deleteConvenePlayer,
  exportConveneBackup,
  importConveneFile,
  importConveneHistory,
  rawConveneHistory,
  readConveneHistory,
  resetConveneHistory,
  setActiveConvenePlayer,
  type ConveneHistory,
  type ConveneQuery,
  type FileImportResult,
  type ImportResult,
} from "../gachaImport";
import { historyPity } from "../pity";
import { BANNER_AWAITING_TTL_MS, loadBanners, liveBanners, type BannerCache, type BannerFeed, type ConveneBanner } from "../banners";
import { guessServerRegion, readConvenePrefs, serverOffsetHours, writeConvenePrefs, type ConvenePrefs, type ServerRegionId } from "../prefs";

// ── history ────────────────────────────────────────────────────────────────────────────────────────────────────

const history = shallowRef<ConveneHistory | null>(null);
const readError = ref<"corrupt" | "newer-version" | "unavailable" | null>(null);
let historyStarted = false;

function reloadHistory(): void {
  const r = readConveneHistory();
  if (r.ok) {
    history.value = r.history;
    readError.value = null;
  } else {
    history.value = null;
    readError.value = r.reason;
  }
}

export function useConveneHistory() {
  if (!historyStarted) {
    historyStarted = true;
    reloadHistory();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === CONVENE_HISTORY_KEY || e.key === null) reloadHistory();
      });
    }
  }
  const players = computed(() => Object.values(history.value?.players ?? {}));
  const player = computed(() => {
    const h = history.value;
    if (!h) return null;
    return h.players[h.activePlayerId ?? ""] ?? Object.values(h.players)[0] ?? null;
  });
  const pity = computed(() => (player.value ? historyPity(player.value) : null));
  const hasPulls = computed(() => (pity.value?.pulls ?? 0) > 0);

  async function importFromQuery(query: ConveneQuery, opts: { onProgress?: (done: number, total: number, poolType: number) => void; signal?: AbortSignal } = {}): Promise<ImportResult> {
    const result = await importConveneHistory(query, { onProgress: opts.onProgress, signal: opts.signal });
    if (result.ok) {
      history.value = result.history;
      readError.value = null;
    }
    return result;
  }

  function importFile(text: string): FileImportResult {
    const result = importConveneFile(text);
    if (result.ok) {
      history.value = result.history;
      readError.value = null;
    }
    return result;
  }

  function removePlayer(playerId: string): boolean {
    const r = deleteConvenePlayer(playerId);
    if (r.ok) history.value = r.history;
    return r.ok && r.saved;
  }

  function selectPlayer(playerId: string): void {
    const r = setActiveConvenePlayer(playerId);
    if (r.ok) history.value = r.history;
  }

  function backupText(playerId: string): string | null {
    return history.value ? exportConveneBackup(history.value, playerId) : null;
  }

  function resetUnreadable(): boolean {
    const ok = resetConveneHistory();
    reloadHistory();
    return ok;
  }

  return { history, readError, players, player, pity, hasPulls, importFromQuery, importFile, removePlayer, selectPlayer, backupText, rawText: () => rawConveneHistory(), resetUnreadable, reload: reloadHistory };
}

// ── preferences ────────────────────────────────────────────────────────────────────────────────────────────────

const prefs = ref<ConvenePrefs>(readConvenePrefs());
let prefsWatching = false;

export function useConvenePrefs() {
  if (!prefsWatching) {
    prefsWatching = true;
    // a detached scope: the watcher must outlive whichever component asked first
    effectScope(true).run(() => watch(prefs, (p) => void writeConvenePrefs(p), { deep: true }));
  }
  return prefs;
}

function browserOffsetMinutes(): number {
  try {
    return -new Date().getTimezoneOffset();
  } catch {
    return 480;
  }
}

// ── banners ────────────────────────────────────────────────────────────────────────────────────────────────────

const feed = shallowRef<BannerFeed | null>(null);
const feedLoading = ref(false);
const feedRefreshing = ref(false);
let seedPromise: Promise<BannerCache> | null = null;
/** when this page last let loadBanners go to the network (it only does when the cache is stale) */
let revalidatedAt = 0;

function loadSeed(): Promise<BannerCache> {
  seedPromise ??= import("../data/bannerSeed.json").then((m) => ((m as { default?: unknown }).default ?? m) as BannerCache);
  return seedPromise;
}

interface BannerState {
  serverId: WritableComputedRef<ServerRegionId>;
  offsetHours: ComputedRef<number>;
  banners: ComputedRef<BannerFeed["banners"]>;
}
let bannerState: BannerState | null = null;
const REVALIDATE_FLOOR_MS = Math.min(5 * 60_000, BANNER_AWAITING_TTL_MS);

/**
 * read seed ∪ cache; `revalidate` also asks Kuro's feed when the cache is stale (older than a day, or an hour while a
 * version-update banner waits for its release) — at most every few minutes per page. The feed holds every banner
 * (`listAll`); `banners` below keeps the started ones on the live clock.
 */
async function loadFeed(opts: { revalidate?: boolean } = {}): Promise<void> {
  const offset = bannerState!.offsetHours.value;
  const wantNetwork = opts.revalidate === true && Date.now() - revalidatedAt > REVALIDATE_FLOOR_MS;
  if (feed.value && !wantNetwork) {
    // the server clock may have changed: rebuild from what we hold, no network
    const seed = await loadSeed();
    feed.value = { ...loadBanners({ seed, serverOffsetHours: offset, revalidate: false, listAll: true }).feed, error: feed.value.error };
    return;
  }
  if (!feed.value) feedLoading.value = true;
  try {
    const seed = await loadSeed();
    const { feed: current, refreshed } = loadBanners({ seed, serverOffsetHours: offset, revalidate: wantNetwork, listAll: true });
    feed.value = current;
    feedLoading.value = false;
    if (wantNetwork) revalidatedAt = Date.now();
    if (refreshed) {
      feedRefreshing.value = true;
      feed.value = await refreshed;
    }
  } finally {
    feedLoading.value = false;
    feedRefreshing.value = false;
  }
}

export function useBannerFeed() {
  if (!bannerState) {
    const p = useConvenePrefs();
    // a detached scope: these outlive whichever tab asked first
    bannerState = effectScope(true).run(() => {
      const serverId = computed<ServerRegionId>({
        get: () => p.value.server ?? guessServerRegion(browserOffsetMinutes()),
        set: (id) => (p.value = { ...p.value, server: id }),
      });
      const offsetHours = computed(() => serverOffsetHours(serverId.value));
      watch(offsetHours, () => void loadFeed());
      // released only, on the shared clock (a phase that starts while the page is open appears); the same array
      // while nothing new has started, so the tabs' derived lists don't recompute on every tick
      let last: ConveneBanner[] = [];
      const banners = computed(() => {
        const t = now.value;
        const next = (feed.value?.banners ?? []).filter((b) => b.startMs <= t);
        if (next.length === last.length && next.every((b, i) => b === last[i])) return last;
        return (last = next);
      });
      return { serverId, offsetHours, banners };
    })!;
  }
  const { serverId, offsetHours, banners } = bannerState;
  return { feed, banners, feedLoading, feedRefreshing, serverId, offsetHours, load: loadFeed };
}

/** the banners running now on the player's clock */
export function useLiveBanners(now: { value: number }) {
  const { banners } = useBannerFeed();
  return computed(() => liveBanners(banners.value, now.value));
}

// ── a shared clock ─────────────────────────────────────────────────────────────────────────────────────────────

const now = ref(Date.now());
let clockUsers = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;

/** Date.now(), refreshed every 30 s while a component that shows a countdown is mounted */
export function useNow() {
  clockUsers += 1;
  now.value = Date.now();
  if (!clockTimer) clockTimer = setInterval(() => (now.value = Date.now()), 30_000);
  onBeforeUnmount(() => {
    clockUsers -= 1;
    if (clockUsers <= 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  });
  return now;
}
