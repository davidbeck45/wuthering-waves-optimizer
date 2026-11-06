import { describe, it, expect, vi } from "vitest";
import { CHUNK_RELOAD_KEY, installChunkReload, reloadOnce, watchPendingRoute, workerWouldNotLoad } from "./chunkReload";

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
      location: { reload: vi.fn(), assign: vi.fn(), pathname: "/inventory", search: "" },
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

describe("a route the failed chunk was for", () => {
  it("goes there rather than back to the page it left: a reload dropped the click that caused it", () => {
    const { host, fire } = fakeHost();
    installChunkReload(host, () => 1_000_000, () => "/my-rankings?tab=2#row");
    const event = fire();
    expect(host.location.assign).toHaveBeenCalledWith("/my-rankings?tab=2#row");
    expect(host.location.reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("reloads when no navigation is under way: a chunk a page asked for, the page stays", () => {
    const { host, fire } = fakeHost();
    installChunkReload(host, () => 1_000_000, () => null);
    fire();
    expect(host.location.reload).toHaveBeenCalledTimes(1);
    expect(host.location.assign).not.toHaveBeenCalled();
  });

  it("reloads when the route is this very address: assigning a URL with a hash to itself would not load anything", () => {
    const { host, fire } = fakeHost();
    installChunkReload(host, () => 1_000_000, () => "/inventory#list");
    fire();
    expect(host.location.reload).toHaveBeenCalledTimes(1);
    expect(host.location.assign).not.toHaveBeenCalled();
  });

  it("never leaves the site: a protocol-relative path is not a route", () => {
    const { host, fire } = fakeHost();
    installChunkReload(host, () => 1_000_000, () => "//elsewhere.example/x");
    fire();
    expect(host.location.assign).not.toHaveBeenCalled();
    expect(host.location.reload).toHaveBeenCalledTimes(1);
  });

  it("the guard still holds on the way to a route", () => {
    const { host, fire, store } = fakeHost();
    store.set(CHUNK_RELOAD_KEY, String(1_000_000));
    installChunkReload(host, () => 1_030_000, () => "/my-rankings");
    const event = fire();
    expect(host.location.assign).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("watchPendingRoute", () => {
  function fakeRouter() {
    const hooks: { before?: (to: { fullPath: string }) => void; after?: () => void; error?: () => void } = {};
    return {
      hooks,
      router: {
        beforeEach: (fn: (to: { fullPath: string }) => void) => void (hooks.before = fn),
        afterEach: (fn: () => void) => void (hooks.after = fn),
        onError: (fn: () => void) => void (hooks.error = fn),
      },
    };
  }

  it("names the route only while a navigation is under way", () => {
    const { router, hooks } = fakeRouter();
    const pending = watchPendingRoute(router);
    expect(pending()).toBeNull();
    hooks.before!({ fullPath: "/account" });
    expect(pending()).toBe("/account");
    hooks.after!();
    expect(pending()).toBeNull();
  });

  it("forgets a navigation that threw: afterEach never runs for one, and a later chunk must not go there", () => {
    const { router, hooks } = fakeRouter();
    const pending = watchPendingRoute(router);
    hooks.before!({ fullPath: "/account" });
    hooks.error!();
    expect(pending()).toBeNull();
  });
});

describe("reloadOnce", () => {
  it("says whether a reload is on its way, so the caller knows to show its own message", () => {
    const { host, store } = fakeHost();
    expect(reloadOnce(null, host, () => 1_000_000)).toBe(true);
    expect(host.location.reload).toHaveBeenCalledTimes(1);
    expect(store.get(CHUNK_RELOAD_KEY)).toBe("1000000");
    expect(reloadOnce(null, host, () => 1_030_000)).toBe(false);
    expect(host.location.reload).toHaveBeenCalledTimes(1);
  });

  it("goes to the target it is given: a plain reload lands a calculator tab back on Character", () => {
    const { host } = fakeHost();
    expect(reloadOnce("/?screen=optimizer", host, () => 1_000_000)).toBe(true);
    expect(host.location.assign).toHaveBeenCalledWith("/?screen=optimizer");
  });

  it("stands aside offline and with storage blocked", () => {
    const { host } = fakeHost();
    expect(reloadOnce(null, { ...host, navigator: { onLine: false } }, () => 1_000_000)).toBe(false);
    expect(reloadOnce(null, { ...host, sessionStorage: undefined }, () => 1_000_000)).toBe(false);
    expect(host.location.reload).not.toHaveBeenCalled();
  });
});

describe("workerWouldNotLoad", () => {
  it("tells a script that never loaded from one that threw: only the second carries a message", () => {
    expect(workerWouldNotLoad(new Event("error"))).toBe(true);
    expect(workerWouldNotLoad({})).toBe(true);
    expect(workerWouldNotLoad(null)).toBe(true);
    expect(workerWouldNotLoad({ message: "Uncaught TypeError: x is not a function" })).toBe(false);
  });
});
