// Wuthering Tools+ — recover from a stale tab after a deploy (perf track, 2026-10-12).
//
// Most pages, the damage chart and the echo importer now load as separate chunks (see src/sim/README.md, "Bundle
// diet"). A tab opened before a deploy still runs the old index.html, whose chunk names no longer exist, so the next
// lazy import fails. Vite's preload helper announces that as a `vite:preloadError` event on window; reloading once
// picks up the new build (index.html is served no-store). The error is left alone (it surfaces as before) when:
// - a reload already happened in the last minute, so a chunk that is really broken shows its error instead of looping;
// - sessionStorage cannot record the reload (storage blocked), since nothing would then stop that loop;
// - the browser is offline: the import failed for want of a network, and a reload would only show the offline page.

export const CHUNK_RELOAD_KEY = "wtplus:chunkReloadAt";
const RETRY_WINDOW_MS = 60_000;

interface ReloadHost {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  sessionStorage?: Pick<Storage, "getItem" | "setItem">;
  navigator?: { onLine?: boolean };
  location: { reload: () => void };
}

export function installChunkReload(host: ReloadHost = window, now: () => number = Date.now): void {
  host.addEventListener("vite:preloadError", (event) => {
    if (host.navigator?.onLine === false) return;
    const at = now();
    try {
      const storage = host.sessionStorage;
      if (!storage) return;
      const last = Number(storage.getItem(CHUNK_RELOAD_KEY)) || 0;
      if (at - last < RETRY_WINDOW_MS) return;
      storage.setItem(CHUNK_RELOAD_KEY, String(at));
    } catch {
      return; // storage blocked: no way to guard against a reload loop
    }
    event.preventDefault();
    host.location.reload();
  });
}
