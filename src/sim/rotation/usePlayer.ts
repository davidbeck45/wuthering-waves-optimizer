// Wuthering Tools+ — the play mode's live clock over player.ts: one state shared by the full-screen overlay and the
// pop-out window. The tick runs on the animation frames of whichever window is showing the cue (the pop-out's own
// frames while it is open — the page under a game is hidden and its frames stop), and only redraws; every time is a
// difference of `performance.now()` readings, so a throttled tick never skews a lap.
import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import type { CuePlan } from "./cueModel";
import { advancePlayer, backPlayer, elapsedOf, expectedOf, initPlayer, isDue, pausePlayer, resumePlayer, type PlayerState } from "./player";

/** A short sine beep through Web Audio (created on the first user gesture that asks for one). */
export function createBeeper() {
  let ctx: AudioContext | null = null;
  return {
    beep(freq = 880, ms = 110): void {
      try {
        const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
        if (!AC) return;
        ctx ??= new AC();
        if (ctx.state === "suspended") void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + ms / 1000 + 0.02);
      } catch {
        /* no audio: the bar still shows the time */
      }
    },
    close(): void {
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}

export function usePlayer(plan: Ref<CuePlan | null>, opts: { beep: Ref<boolean>; pace: Ref<number>; host: Ref<Window | null> }) {
  const state = shallowRef<PlayerState>(initPlayer());
  const now = ref(performance.now());
  const active = ref(false);
  const beeper = createBeeper();
  let frame: { win: Window; id: number } | null = null;

  const steps = computed(() => plan.value?.steps ?? []);
  const step = computed(() => steps.value[state.value.step] ?? null);
  const next = computed(() => {
    const p = plan.value;
    if (!p || !p.steps.length) return null;
    const i = state.value.step + 1 < p.steps.length ? state.value.step + 1 : p.loopStart;
    return p.steps[i] ?? null;
  });
  const elapsed = computed(() => elapsedOf(state.value, now.value));
  const expected = computed(() => (plan.value ? expectedOf(plan.value, state.value.step, opts.pace.value || 1) : 0));
  const lapTarget = computed(() => plan.value?.passSeconds[state.value.lapSection] ?? 0);

  const tick = (): void => {
    frame = null;
    if (!active.value) return;
    now.value = performance.now();
    const p = plan.value;
    if (p && isDue(state.value, p, now.value, opts.pace.value)) {
      if (opts.beep.value) beeper.beep(opts.pace.value ? 660 : 880);
      state.value = { ...state.value, beeped: true };
      if (opts.pace.value > 0) state.value = advancePlayer(state.value, p, now.value);
    }
    schedule();
  };
  function schedule(): void {
    if (frame || !active.value) return;
    const win = opts.host.value && !opts.host.value.closed ? opts.host.value : window;
    frame = { win, id: win.requestAnimationFrame(tick) };
  }
  function stopTick(): void {
    if (frame) {
      try {
        frame.win.cancelAnimationFrame(frame.id);
      } catch {
        /* the pop-out closed */
      }
    }
    frame = null;
  }
  // the window carrying the frames changed (pop-out opened / closed): move the tick
  watch(opts.host, () => {
    stopTick();
    schedule();
  });

  const t = (): number => performance.now();
  const api = {
    state,
    now,
    active,
    step,
    next,
    elapsed,
    expected,
    lapTarget,
    /** show the player (the clock waits for the first tap) */
    open(): void {
      active.value = true;
      schedule();
    },
    close(): void {
      active.value = false;
      stopTick();
    },
    advance(): void {
      if (!plan.value) return;
      if (opts.beep.value && !state.value.started) beeper.beep(1046, 60);
      state.value = advancePlayer(state.value, plan.value, t());
      now.value = t();
      schedule();
    },
    back(): void {
      if (!plan.value) return;
      state.value = backPlayer(state.value, plan.value, t());
      now.value = t();
    },
    togglePause(): void {
      state.value = state.value.pausedAt != null ? resumePlayer(state.value, t()) : pausePlayer(state.value, t());
      now.value = t();
    },
    reset(): void {
      state.value = initPlayer();
      now.value = t();
    },
    /** jump to a swap (the progress dots); the clock keeps running from there */
    jump(i: number): void {
      if (!plan.value?.steps[i]) return;
      state.value = { ...state.value, step: i, stepStart: t(), beeped: false, lapSection: state.value.started ? plan.value.steps[i]!.section : state.value.lapSection, ...(state.value.started && plan.value.steps[i]!.section !== state.value.lapSection ? { lapStart: t() } : {}) };
      now.value = t();
    },
  };
  // a new run resets the player
  watch(plan, () => api.reset());
  onBeforeUnmount(() => {
    api.close();
    beeper.close();
  });
  return api;
}

export type Player = ReturnType<typeof usePlayer>;
