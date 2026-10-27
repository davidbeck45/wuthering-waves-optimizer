<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="root"
      :class="['rv-play fixed inset-0 z-[70] flex flex-col bg-base-100 text-base-content', `rv-play--${prefs.size}`]"
      role="dialog"
      aria-modal="true"
      aria-label="Rotation play mode"
      data-test-rotation-play
    >
      <div class="mx-auto flex h-full w-full max-w-5xl flex-col min-h-0">
      <div class="flex items-center gap-1 sm:gap-2 shrink-0 mb-2">
        <button type="button" class="btn btn-sm btn-ghost btn-square" aria-label="Leave play mode" data-test-rotation-play-exit @click="emit('close')">
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
        </button>
        <div class="min-w-0 flex-1 truncate text-sm font-semibold">{{ title }}</div>
        <span
          class="badge badge-sm gap-1 shrink-0"
          :class="wake.state.value === 'on' ? 'badge-success badge-outline' : 'badge-ghost'"
          :title="wakeTitle"
          data-test-rotation-wake
        >
          <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke-linecap="round" /></svg>
          <span class="max-sm:hidden">{{ wakeLabel }}</span>
        </span>
        <button type="button" class="btn btn-sm btn-ghost btn-square" :aria-label="paused ? 'Resume' : 'Pause'" :disabled="!player.state.value.started" data-test-rotation-pause @click="player.togglePause()">
          <svg v-if="!paused" viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          <svg v-else viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
        </button>
        <button type="button" class="btn btn-sm btn-ghost btn-square" aria-label="Start over" data-test-rotation-reset @click="player.reset()">
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button v-if="canPop" type="button" class="btn btn-sm btn-ghost btn-square max-md:hidden" aria-label="Pop out" title="Pop out a small window over the game" data-test-rotation-play-pop @click="emit('pop')">
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" /></svg>
        </button>
        <div class="dropdown dropdown-end">
          <button type="button" tabindex="0" class="btn btn-sm btn-ghost btn-square" aria-label="Play settings" data-test-rotation-play-settings>
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke-linecap="round" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
          </button>
          <div tabindex="0" class="dropdown-content z-[80] mt-2 w-64 rounded-box border border-base-300 bg-base-200 p-3 shadow-xl text-sm space-y-3">
            <label class="flex items-center justify-between gap-2 cursor-pointer">
              <span>Beep when a swap is due</span>
              <input v-model="prefs.beep" type="checkbox" class="toggle toggle-sm toggle-primary" data-test-rotation-beep />
            </label>
            <div>
              <div class="mb-1 opacity-70">Walk on by itself</div>
              <div class="join w-full">
                <button v-for="p in PACES" :key="p.value" type="button" class="btn btn-xs join-item flex-1" :class="prefs.pace === p.value ? 'btn-primary' : ''" :data-test-rotation-pace="p.value" @click="prefs.pace = p.value">{{ p.label }}</button>
              </div>
            </div>
            <div>
              <div class="mb-1 opacity-70">Text size</div>
              <div class="join w-full">
                <button v-for="s in SIZES" :key="s" type="button" class="btn btn-xs join-item flex-1" :class="prefs.size === s ? 'btn-primary' : ''" :data-test-rotation-size="s" @click="prefs.size = s">{{ s.toUpperCase() }}</button>
              </div>
            </div>
            <button v-if="fullscreenOk" type="button" class="btn btn-xs w-full" data-test-rotation-fullscreen @click="toggleFullscreen">{{ fullscreen ? "Leave full screen" : "Full screen" }}</button>
          </div>
        </div>
      </div>

      <CueStage class="flex-1" :player="player" :plan="plan" :members="members" :hues="hues" />

      <div class="shrink-0 mt-3 flex items-center gap-2">
        <button type="button" class="btn btn-sm sm:btn-md flex-1 sm:flex-none sm:w-32" data-test-rotation-back @mousedown.prevent @click="player.back()">◀ Back</button>
        <div class="flex-1 text-center text-xs opacity-60 max-sm:hidden">Space / → next · ← back · P pause · Esc leave</div>
        <button type="button" class="btn btn-sm sm:btn-md btn-primary flex-[2] sm:flex-none sm:w-40" data-test-rotation-next-button @mousedown.prevent @click="player.advance()">
          {{ player.state.value.started ? "Next ▶" : "Start ▶" }}
        </button>
      </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { RunMember } from "../engine/rileyRun";
import CueStage from "./CueStage.vue";
import type { CuePlan } from "./cueModel";
import type { PlaySize, RotationPrefs } from "./prefs";
import type { Player } from "./usePlayer";
import { useWakeLock } from "./useWakeLock";

const props = defineProps<{ open: boolean; player: Player; plan: CuePlan; members: RunMember[]; hues: Map<string, string>; prefs: RotationPrefs; title: string; canPop: boolean }>();
const emit = defineEmits<{ close: []; pop: [] }>();

const PACES: Array<{ value: RotationPrefs["pace"]; label: string }> = [
  { value: 0, label: "Off" },
  { value: 1, label: "100 %" },
  { value: 0.85, label: "85 %" },
  { value: 0.7, label: "70 %" },
];
const SIZES: PlaySize[] = ["m", "l", "xl"];

const root = ref<HTMLElement | null>(null);
const wake = useWakeLock(computed(() => props.open));
const paused = computed(() => props.player.state.value.pausedAt != null);
const wakeLabel = computed(() => ({ on: "Screen stays on", off: "Screen may sleep", unsupported: "No wake lock", denied: "Wake lock refused" })[wake.state.value]);
const wakeTitle = computed(() =>
  wake.state.value === "on"
    ? "The screen stays on while play mode is open"
    : wake.state.value === "unsupported"
      ? "This browser cannot keep the screen on (Screen Wake Lock): set the screen timeout longer while you practise"
      : "The screen may dim: it is kept on again when the page is visible",
);

const fullscreenOk = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
const fullscreen = ref(false);
const onFullscreen = (): void => {
  fullscreen.value = !!document.fullscreenElement;
};
async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.value?.requestFullscreen();
  } catch {
    /* refused: the overlay already covers the page */
  }
}

function onKey(e: KeyboardEvent): void {
  if (!props.open) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
  if (e.key === " " || e.key === "ArrowRight" || e.key === "PageDown" || e.key === "Enter") {
    e.preventDefault();
    props.player.advance();
  } else if (e.key === "ArrowLeft" || e.key === "Backspace" || e.key === "PageUp") {
    e.preventDefault();
    props.player.back();
  } else if (e.key === "p" || e.key === "P") {
    props.player.togglePause();
  } else if (e.key === "Escape" && !document.fullscreenElement) {
    emit("close");
  }
}

// the page under the overlay stops scrolling while it is open; only a lock this overlay took is let go
let locked = false;
const lockPage = (on: boolean): void => {
  if (on === locked) return;
  locked = on;
  document.documentElement.classList.toggle("overflow-hidden", on);
};
watch(
  () => props.open,
  (on) => {
    if (on) props.player.open();
    lockPage(on);
  },
  { immediate: true },
);
onMounted(() => {
  window.addEventListener("keydown", onKey);
  document.addEventListener("fullscreenchange", onFullscreen);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("fullscreenchange", onFullscreen);
  lockPage(false);
});
</script>
