// Wuthering Tools+ — when /rankings draws the rows solved so far (speed track, 2026-11-02). Pure: the controller hands
// in what drawing means (controller.ts `paintSoFar`) and how many workers solve at once.
//
// His table used to wait for every team in play before it drew a row; at My account nothing is shipped and the page
// solves the whole roster in its workers. The pass now calls `onTeam(done, total)` as each team lands, and this decides
// when the list catches up: at once when one team per worker is in (they start together, so that is the first wave),
// else a short moment after the first one lands; then about once a second, or less often when a paint is dear (at most
// a fifth of the main thread goes to them); never on the last team (the pass itself draws the whole table then) and
// never after the pass is stopped or superseded.

/** the first rows wait this long after the first team lands, unless one team per worker is in sooner */
export const SO_FAR_FIRST_MS = 300;
/** then the list catches up about this often… */
export const SO_FAR_EVERY_MS = 1000;
/** …but never sooner than this many times what the last paint cost: a paint is a long task on the main thread, and a
 *  worker that finishes during one waits for its next team until it ends (a 4x-throttled phone paid 0.5-2 s a paint,
 *  and paints every second kept the workers waiting — the whole solve took 2.6x as long) */
export const SO_FAR_COST_RATIO = 5;

export interface SoFarTimers {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  set: (fn: () => void, ms: number) => unknown;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  clear: (handle: unknown) => void;
  /** milliseconds, for what a paint cost */
  now: () => number;
}

export interface SoFarHooks {
  /** draw the rows solved so far; false = not the moment (a detail page is up, the search box in use): tried again later */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  paint: (done: number, total: number) => boolean;
  /** the rows on screen are already this pass's: keep the count beside them current */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  update: (done: number, total: number) => void;
  /** how many teams are solved at once (the pool's workers; 1 without a pool) */
  wave: () => number;
  /** a newer pass took over */
  stale: () => boolean;
  timers?: SoFarTimers;
}

export interface SoFarScheduler {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onTeam: (done: number, total: number) => void;
  stop: () => void;
  /** a paint of this pass is on screen */
  drawn: () => boolean;
}

const browserTimers: SoFarTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => performance.now(),
};

export function soFarScheduler(hooks: SoFarHooks): SoFarScheduler {
  const timers = hooks.timers ?? browserTimers;
  let timer: unknown;
  let stopped = false;
  let drawn = false;
  let gap = SO_FAR_EVERY_MS;
  let last = { done: 0, total: 0 };
  const cancel = (): void => {
    if (timer !== undefined) timers.clear(timer);
    timer = undefined;
  };
  const fire = (): void => {
    timer = undefined;
    if (stopped || hooks.stale()) return;
    const t0 = timers.now();
    if (!hooks.paint(last.done, last.total)) return;
    drawn = true;
    gap = Math.max(SO_FAR_EVERY_MS, (timers.now() - t0) * SO_FAR_COST_RATIO);
  };
  return {
    onTeam: (done, total) => {
      last = { done, total };
      if (stopped || hooks.stale()) return;
      if (drawn) hooks.update(done, total);
      if (done >= total) return;
      if (!drawn && done >= Math.min(Math.max(1, hooks.wave()), total)) {
        cancel();
        fire();
        return;
      }
      if (timer === undefined) timer = timers.set(fire, drawn ? gap : SO_FAR_FIRST_MS);
    },
    stop: () => {
      stopped = true;
      cancel();
    },
    drawn: () => drawn,
  };
}
