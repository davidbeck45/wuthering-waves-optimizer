// Wuthering Tools+ — recover from a stale tab after a deploy (perf track, 2026-10-12).
//
// Most pages, the damage chart and the echo importer now load as separate chunks (see src/sim/README.md, "Bundle
// diet"). A tab opened before a deploy still runs the old index.html, whose chunk names no longer exist, so the next
// lazy import fails. Vite's preload helper announces that as a `vite:preloadError` event on window; reloading once
// picks up the new build (index.html is served no-store). The error is left alone (it surfaces as before) when:
// - a reload already happened in the last minute, so a chunk that is really broken shows its error instead of looping;
// - sessionStorage cannot record the reload (storage blocked), since nothing would then stop that loop;
// - the browser is offline: the import failed for want of a network, and a reload would only show the offline page.
//
// A chunk a navigation was waiting on goes to that route, not back to the page it left, or the click that found the
// missing chunk is lost (hunt round 1, 2026-11-06). A worker's script goes missing the same way and raises no such
// event: the worker's own `error` is the only sign, so its callers ask for the same guarded reload (`workerWouldNotLoad`,
// `reloadOnce`). A page that holds work a reload would lose says to reload instead (`STALE_TAB_ERROR`).

export const CHUNK_RELOAD_KEY = "wtplus:chunkReloadAt";
const RETRY_WINDOW_MS = 60_000;

/** What a page says when its worker's script is gone and "Try again" can only fail the same way. */
export const STALE_TAB_ERROR = "This tab is older than the site, so the optimizer cannot start here. Reload the page, then run it again.";

interface ReloadHost {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  sessionStorage?: Pick<Storage, "getItem" | "setItem">;
  navigator?: { onLine?: boolean };
  location: { reload: () => void; assign: (url: string) => void; pathname: string; search: string };
}

/** The one guarded reload: to `target` when that is another page of this site, else this page again. False when the
 *  guard stands aside (see the top of this file) and the caller's own error has to speak. */
export function reloadOnce(target: string | null = null, host: ReloadHost = window, now: () => number = Date.now): boolean {
  if (host.navigator?.onLine === false) return false;
  const at = now();
  try {
    const storage = host.sessionStorage;
    if (!storage) return false;
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY)) || 0;
    if (at - last < RETRY_WINDOW_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(at));
  } catch {
    return false; // storage blocked: no way to guard against a reload loop
  }
  const elsewhere = target !== null && /^\/(?!\/)/.test(target) && target.split("#")[0] !== `${host.location.pathname}${host.location.search}`;
  if (elsewhere) host.location.assign(target);
  else host.location.reload();
  return true;
}

export function installChunkReload(host: ReloadHost = window, now: () => number = Date.now, pendingRoute: () => string | null = () => null): void {
  host.addEventListener("vite:preloadError", (event) => {
    if (reloadOnce(pendingRoute(), host, now)) event.preventDefault();
  });
}

interface RouteHooks {
  beforeEach: (guard: (to: { fullPath: string }) => void) => unknown;
  afterEach: (hook: () => void) => unknown;
  onError: (hook: () => void) => unknown;
}

/** The route a navigation is on its way to, while one is. A lazy route's chunk fails between these hooks. `afterEach`
 *  does not run for a navigation that throws, so `onError` clears it too. */
export function watchPendingRoute(router: RouteHooks): () => string | null {
  let pending: string | null = null;
  router.beforeEach((to) => {
    pending = to.fullPath;
  });
  const settled = (): void => {
    pending = null;
  };
  router.afterEach(settled);
  router.onError(settled);
  return () => pending;
}

/** A worker whose script would not load fires a bare `error` Event; one that threw while running fires an ErrorEvent
 *  carrying the message. Only the first is a tab older than the site (or a blocked script), and such a worker is dead. */
export function workerWouldNotLoad(event: Event | { message?: string } | null | undefined): boolean {
  return !(event as { message?: string } | null | undefined)?.message;
}

/** One answer for a page whose worker failed and that holds nothing a reload would lose (Ryan's Optimize team: its run
 *  and its loadout count). A script that would not load is a tab older than the site: reload once, and say so in case
 *  the guard stood aside (a reload in the last minute, storage blocked, offline). Anything else is the page's own
 *  `otherwise`. Returns what the page should show. */
export function workerFailureMessage(event: Event | { message?: string } | null | undefined, otherwise: string, host?: ReloadHost): string {
  if (!workerWouldNotLoad(event)) return otherwise;
  reloadOnce(null, host ?? window);
  return STALE_TAB_ERROR;
}
