import { describe, it, expect, vi } from "vitest";
import { CHUNK_RELOAD_KEY, installChunkReload } from "./chunkReload";

function fakeHost() {
  const listeners: Record<string, ((event: Event) => void)[]> = {};
  const store = new Map<string, string>();
  return {
    host: {
      addEventListener: (type: string, listener: (event: Event) => void) => {
        (listeners[type] ??= []).push(listener);
      },
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
      location: { reload: vi.fn() },
    },
    fire: () => {
      const event = new Event("vite:preloadError", { cancelable: true });
      for (const listener of listeners["vite:preloadError"] ?? []) listener(event);
      return event;
    },
    store,
  };
}

describe("installChunkReload", () => {
  it("reloads once on a failed chunk import and swallows the error", () => {
    const { host, fire, store } = fakeHost();
    installChunkReload(host, () => 1_000_000);
    const event = fire();
    expect(host.location.reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(store.get(CHUNK_RELOAD_KEY)).toBe("1000000");
  });

  it("does not loop: a second failure within a minute surfaces normally", () => {
    const { host, fire, store } = fakeHost();
    store.set(CHUNK_RELOAD_KEY, String(1_000_000));
    installChunkReload(host, () => 1_030_000);
    const event = fire();
    expect(host.location.reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("reloads again once the minute has passed", () => {
    const { host, fire, store } = fakeHost();
    store.set(CHUNK_RELOAD_KEY, String(1_000_000));
    installChunkReload(host, () => 1_061_000);
    fire();
    expect(host.location.reload).toHaveBeenCalledTimes(1);
  });

  it("leaves the error alone offline: a reload would only show the browser's offline page", () => {
    const { host, fire, store } = fakeHost();
    installChunkReload({ ...host, navigator: { onLine: false } }, () => 1_000_000);
    const event = fire();
    expect(host.location.reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(store.has(CHUNK_RELOAD_KEY)).toBe(false);
  });

  it("does not reload when sessionStorage is blocked (nothing could stop a reload loop)", () => {
    const { host, fire } = fakeHost();
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    installChunkReload({ ...host, sessionStorage: blocked }, () => 1_000_000);
    expect(fire().defaultPrevented).toBe(false);
    installChunkReload({ ...host, sessionStorage: undefined }, () => 1_000_000);
    expect(fire().defaultPrevented).toBe(false);
    expect(host.location.reload).not.toHaveBeenCalled();
  });
});
