// Wuthering Tools+ speed track (2026-11-02): /rankings' first rows must not wait for the whole My account solve.
import { describe, expect, it } from "vitest";
import { SO_FAR_COST_RATIO, SO_FAR_EVERY_MS, SO_FAR_FIRST_MS, soFarScheduler, type SoFarTimers } from "./soFar";

/** a hand-driven clock: `advance(ms)` runs every timer due by then, in order */
function clock() {
  let now = 0;
  let seq = 0;
  const queue: Array<{ at: number; id: number; fn: () => void }> = [];
  const timers: SoFarTimers = {
    now: () => now,
    set: (fn, ms) => {
      const id = ++seq;
      queue.push({ at: now + ms, id, fn });
      return id;
    },
    clear: (handle) => {
      const i = queue.findIndex((t) => t.id === handle);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  const advance = (ms: number): void => {
    const until = now + ms;
    for (;;) {
      queue.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = queue[0];
      if (!next || next.at > until) break;
      queue.shift();
      now = next.at;
      next.fn();
    }
    now = until;
  };
  /** a paint that takes `ms` of main thread */
  const spend = (ms: number): void => {
    now += ms;
  };
  return { timers, advance, spend, now: () => now };
}

/** `total` teams on `wave` workers, each team landing `every` ms after the last; returns when each paint happened */
function solve(total: number, wave: number, every: number, paintOk: (n: number) => boolean = () => true, paintMs = 0) {
  const c = clock();
  const paints: Array<{ at: number; done: number }> = [];
  const updates: number[] = [];
  let attempts = 0;
  const s = soFarScheduler({
    timers: c.timers,
    wave: () => wave,
    stale: () => false,
    paint: (done) => {
      attempts += 1;
      if (!paintOk(attempts)) return false;
      paints.push({ at: c.now(), done });
      c.spend(paintMs);
      return true;
    },
    update: (done) => updates.push(done),
  });
  for (let done = 1; done <= total; done++) {
    c.advance(every);
    s.onTeam(done, total);
  }
  const lastAt = c.now();
  s.stop();
  c.advance(10 * SO_FAR_EVERY_MS);
  return { paints, updates, lastAt, attempts, drawn: s.drawn() };
}

describe("rows so far on /rankings", () => {
  it("draws the first rows once one team per worker is in — long before the last team (104 teams, 8 workers)", () => {
    const { paints, lastAt } = solve(104, 8, 25);
    expect(paints[0]).toEqual({ at: 8 * 25, done: 8 });
    expect(paints[0]!.at).toBeLessThan(lastAt / 10);
    // then about once a second, and never on the last team (the pass draws the whole table itself)
    for (let i = 1; i < paints.length; i++) expect(paints[i]!.at - paints[i - 1]!.at).toBeGreaterThanOrEqual(SO_FAR_EVERY_MS);
    expect(paints.every((p) => p.done < 104)).toBe(true);
  });

  it("with slow answers, draws a short moment after the first team lands instead of waiting for a whole wave", () => {
    const { paints } = solve(20, 8, 700);
    expect(paints[0]).toEqual({ at: 700 + SO_FAR_FIRST_MS, done: 1 });
  });

  it("one worker (CI's 2-core runner): the first team is the first wave", () => {
    const { paints } = solve(10, 1, 400);
    expect(paints[0]).toEqual({ at: 400, done: 1 });
  });

  it("keeps the count beside the rows current once they are drawn, through the last team", () => {
    const { paints, updates } = solve(12, 4, 100);
    expect(paints.length).toBeGreaterThan(0);
    expect(updates.at(-1)).toBe(12);
    expect(updates[0]).toBe(paints[0]!.done + 1);
  });

  it("tries again when it was not the moment, and draws nothing for a solve that ends in its first wave", () => {
    const refused = solve(30, 4, 50, (n) => n > 2);
    expect(refused.attempts).toBeGreaterThan(2);
    expect(refused.paints[0]!.done).toBeGreaterThan(4);
    const small = solve(3, 8, 50);
    expect(small.paints).toEqual([]);
    expect(small.drawn).toBe(false);
  });

  it("spaces paints by what they cost, so the workers are not kept waiting on a slow phone", () => {
    const { paints } = solve(104, 8, 50, () => true, 400);
    expect(paints.length).toBeGreaterThan(1);
    for (let i = 1; i < paints.length; i++) expect(paints[i]!.at - paints[i - 1]!.at).toBeGreaterThanOrEqual(400 * SO_FAR_COST_RATIO);
  });

  it("stops at once when the pass is stopped or superseded", () => {
    const c = clock();
    let stale = false;
    const paints: number[] = [];
    const s = soFarScheduler({ timers: c.timers, wave: () => 8, stale: () => stale, paint: (d) => (paints.push(d), true), update: () => {} });
    s.onTeam(1, 50); // arms the first-paint timer
    stale = true;
    c.advance(SO_FAR_FIRST_MS * 2);
    s.onTeam(9, 50);
    expect(paints).toEqual([]);
    stale = false;
    s.stop();
    s.onTeam(10, 50);
    c.advance(SO_FAR_EVERY_MS * 3);
    expect(paints).toEqual([]);
  });
});
