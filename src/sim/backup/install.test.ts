// The part the shell starts: when the day's backup is looked at, and where backups stand aside.
import { describe, expect, it, vi } from "vitest";
import { BACKUP_E2E_KEY, backupAllowed, DAILY_RECHECK_MS, DAILY_START_DELAY_MS, installAutoBackup } from "./install";

function host(state: DocumentVisibilityState = "visible") {
  const listeners = new Set<() => void>();
  return {
    visibilityState: state,
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
    listeners,
    becomes(next: DocumentVisibilityState) {
      this.visibilityState = next;
      for (const fn of listeners) fn();
    },
  };
}

function setup(allowed = true) {
  const doc = host();
  const clock = { now: 1_000_000 };
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const daily = vi.fn(async () => undefined);
  const stop = installAutoBackup({
    allowed: () => allowed,
    daily,
    now: () => clock.now,
    doc: doc as unknown as Document,
    setTimer: (fn, ms) => timers[timers.push({ fn, ms, cleared: false }) - 1],
    clearTimer: (handle) => void ((handle as { cleared: boolean }).cleared = true),
  });
  return { doc, clock, timers, daily, stop };
}

describe("when the day's backup is looked at", () => {
  it("once, a few seconds after the page opened: not during its first paint", () => {
    const { timers, daily } = setup();
    expect(daily).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(DAILY_START_DELAY_MS);
    expect(DAILY_START_DELAY_MS).toBeGreaterThanOrEqual(3000);
    timers[0]!.fn();
    expect(daily).toHaveBeenCalledTimes(1);
  });

  it("again when the tab is looked at after an hour or more: a site on the home screen stays open for days", () => {
    const { timers, daily, doc, clock } = setup();
    timers[0]!.fn();
    clock.now += DAILY_RECHECK_MS - 1;
    doc.becomes("hidden");
    doc.becomes("visible");
    expect(daily).toHaveBeenCalledTimes(1); // back within the hour: nothing
    clock.now += 2;
    doc.becomes("hidden");
    expect(daily).toHaveBeenCalledTimes(1); // going away is no reason
    doc.becomes("visible");
    expect(daily).toHaveBeenCalledTimes(2);
    doc.becomes("visible");
    expect(daily).toHaveBeenCalledTimes(2); // and the hour starts again
  });

  it("a tab that comes into view before the first look does not jump the queue", () => {
    const { daily, doc, clock } = setup();
    clock.now += 5 * DAILY_RECHECK_MS;
    doc.becomes("visible");
    expect(daily).not.toHaveBeenCalled();
  });

  it("where backups stand aside, nothing is looked at, at the start or later", () => {
    const { timers, daily, doc, clock } = setup(false);
    timers[0]!.fn();
    clock.now += 2 * DAILY_RECHECK_MS;
    doc.becomes("visible");
    expect(daily).not.toHaveBeenCalled();
  });

  it("a look that fails is nobody's error, and stopping takes the timer and the listener away", async () => {
    const doc = host();
    const timers: Array<{ fn: () => void; cleared: boolean }> = [];
    const stop = installAutoBackup({
      allowed: () => true,
      daily: () => Promise.reject(new Error("the chunk did not load")),
      now: () => 5,
      doc: doc as unknown as Document,
      setTimer: (fn) => timers[timers.push({ fn, cleared: false }) - 1],
      clearTimer: (handle) => void ((handle as { cleared: boolean }).cleared = true),
    });
    expect(() => timers[0]!.fn()).not.toThrow();
    await Promise.resolve();
    expect(doc.listeners.size).toBe(1);
    stop();
    expect(timers[0]!.cleared).toBe(true);
    expect(doc.listeners.size).toBe(0);
  });
});

describe("where backups stand aside", () => {
  const storage = (value: string | null) => ({ getItem: (key: string) => (key === BACKUP_E2E_KEY ? value : null) });

  it("a browser: they run", () => {
    expect(backupAllowed({ localStorage: storage(null) })).toBe(true);
  });

  it("under Cypress: only when a spec sets the switch", () => {
    expect(backupAllowed({ Cypress: {}, localStorage: storage(null) })).toBe(false);
    expect(backupAllowed({ Cypress: {}, localStorage: storage("0") })).toBe(false);
    expect(backupAllowed({ Cypress: {}, localStorage: storage("1") })).toBe(true);
  });

  it("no window (a script), or a storage that cannot be read under Cypress: they do not", () => {
    expect(backupAllowed(null)).toBe(false);
    const blocked = {
      Cypress: {},
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    };
    expect(backupAllowed(blocked)).toBe(false);
  });
});
