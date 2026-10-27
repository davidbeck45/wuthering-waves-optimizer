// Wuthering Tools+ — the play mode's clock: which swap is up, how long it has run against the engine's time, and the
// lap stopwatch (one lap = one pass of a section: the opener, then each loop). Pure: every function takes the time
// (`performance.now()` milliseconds) and returns a new state, so the play overlay, the pop-out window and the tests
// drive the same thing. A gap to the engine's time is shown as a gap, never as a failure — his loops are frame-tight.
import { nextStep, prevStep, type CuePlan } from "./cueModel";

export interface Lap {
  section: number;
  seconds: number;
  /** the engine's time for that pass */
  target: number;
}

export interface PlayerState {
  step: number;
  started: boolean;
  /** when paused: the time it was paused at */
  pausedAt: number | null;
  stepStart: number;
  lapStart: number;
  lapSection: number;
  laps: Lap[];
  /** the current swap's beep has sounded / its auto-advance fired */
  beeped: boolean;
}

type Plan = Pick<CuePlan, "steps" | "loopStart" | "passSeconds">;

export const initPlayer = (): PlayerState => ({ step: 0, started: false, pausedAt: null, stepStart: 0, lapStart: 0, lapSection: 0, laps: [], beeped: false });

export function startPlayer(s: PlayerState, plan: Plan, now: number): PlayerState {
  return { ...s, started: true, pausedAt: null, stepStart: now, lapStart: now, lapSection: plan.steps[s.step]?.section ?? 0, beeped: false };
}

/** The next swap (the first tap starts the clock on the swap shown). Crossing into another section closes a lap. */
export function advancePlayer(s: PlayerState, plan: Plan, now: number): PlayerState {
  if (!plan.steps.length) return s;
  if (!s.started) return startPlayer(s, plan, now);
  const t = s.pausedAt ?? now;
  const next = nextStep(plan, s.step);
  const nextSection = plan.steps[next]!.section;
  let { laps, lapStart, lapSection } = s;
  if (nextSection !== s.lapSection || next <= s.step) {
    laps = [...laps, { section: s.lapSection, seconds: (t - s.lapStart) / 1000, target: plan.passSeconds[s.lapSection] ?? 0 }];
    lapStart = t;
    lapSection = nextSection;
  }
  return { ...s, step: next, stepStart: t, laps, lapStart, lapSection, beeped: false };
}

/** One swap back (the clock of the swap restarts; laps stay as they were). */
export function backPlayer(s: PlayerState, plan: Plan, now: number): PlayerState {
  const step = prevStep(plan, s.step);
  const section = plan.steps[step]?.section ?? 0;
  return { ...s, step, stepStart: s.pausedAt ?? now, lapSection: s.started && section !== s.lapSection ? section : s.lapSection, beeped: false };
}

export function pausePlayer(s: PlayerState, now: number): PlayerState {
  return !s.started || s.pausedAt != null ? s : { ...s, pausedAt: now };
}

export function resumePlayer(s: PlayerState, now: number): PlayerState {
  if (s.pausedAt == null) return s;
  const gap = now - s.pausedAt;
  return { ...s, pausedAt: null, stepStart: s.stepStart + gap, lapStart: s.lapStart + gap };
}

/** Seconds the current swap and the current lap have run. */
export function elapsedOf(s: PlayerState, now: number): { step: number; lap: number } {
  if (!s.started) return { step: 0, lap: 0 };
  const t = s.pausedAt ?? now;
  return { step: (t - s.stepStart) / 1000, lap: (t - s.lapStart) / 1000 };
}

/** The swap's expected seconds at a pace (1 = the engine's, 0.85 = 15 % slower). */
export const expectedOf = (plan: Plan, step: number, pace = 1): number => (plan.steps[step]?.visit.seconds ?? 0) / (pace > 0 ? pace : 1);

/** Whether the current swap's time is up (beep, and auto-advance where a pace is set). */
export function isDue(s: PlayerState, plan: Plan, now: number, pace: number): boolean {
  return s.started && s.pausedAt == null && !s.beeped && elapsedOf(s, now).step >= expectedOf(plan, s.step, pace || 1);
}

/** "+1.4 s" / "−0.3 s" against the engine's time. */
export const gapText = (seconds: number, target: number): string => {
  const d = seconds - target;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} s`;
};
