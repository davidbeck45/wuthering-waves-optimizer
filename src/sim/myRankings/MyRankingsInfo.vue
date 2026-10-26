<template>
  <span ref="root" class="mr-info">
    <button
      type="button"
      class="mr-info__btn"
      :aria-expanded="open"
      aria-controls="mr-info-pop"
      aria-label="How this ranking is scored"
      title="How this ranking is scored"
      data-test-my-rankings-info
      @click="open = !open">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M12 11v5.5M12 7.6v.1" stroke-linecap="round" /></svg>
    </button>
    <div v-if="open" id="mr-info-pop" class="mr-info__pop" role="dialog" aria-label="How this ranking is scored" data-test-my-rankings-info-pop>
      <div class="mr-info__head">
        <span>How this is scored</span>
        <button type="button" class="btn btn-ghost btn-xs btn-square" aria-label="Close" @click="open = false">✕</button>
      </div>
      <ul class="mr-info__list">
        <li>
          Every character with a weapon is scored by <b>this app's own damage engine on your real build</b> — weapon,
          echoes, sequence nodes and buffs as you have them set up.
        </li>
        <li>Every saved rotation, curated preset and wuwa_calc loop is tried; <b>the best one counts</b>.</li>
        <li>
          Teams: your saved teams with actions, plus the curated and wuwa_calc team presets whose three members you
          have. Team buffs come from the real members when the switch is on.
        </li>
        <li>
          Enemy: <b>level 100, 20 % resistance</b>, no stacks — Riley's target, so the numbers sit beside the
          wuwa_calc rankings. Metric: average damage per rotation.
        </li>
        <li>
          <b>Best upgrade</b> estimates the next sequence node (its first entry when it has variants) and the weapon at
          R5, each on the same best rotation.
        </li>
      </ul>
    </div>
  </span>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the methodology behind an (i): it used to be a paragraph above the table.
import { onBeforeUnmount, onMounted, ref } from "vue";

const open = ref(false);
const root = ref<HTMLElement | null>(null);
function onPointer(event: PointerEvent): void {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}
function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") open.value = false;
}
onMounted(() => {
  document.addEventListener("pointerdown", onPointer);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointer);
  document.removeEventListener("keydown", onKey);
});
</script>

<style scoped>
.mr-info {
  display: inline-flex;
}
.mr-info__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 9999px;
  color: oklch(var(--bc) / 0.55);
}
.mr-info__btn:hover,
.mr-info__btn[aria-expanded="true"] {
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.08);
}
.mr-info__pop {
  position: absolute;
  z-index: 40;
  left: 0;
  top: calc(100% + 0.4rem);
  width: min(30rem, calc(100vw - 2rem));
  padding: 0.75rem 0.9rem 0.9rem;
  border-radius: 0.85rem;
  background: oklch(var(--b2));
  box-shadow:
    0 12px 32px -8px rgb(0 0 0 / 0.45),
    inset 0 0 0 1px oklch(var(--bc) / 0.1);
  font-size: 0.82rem;
  font-weight: 400;
  line-height: 1.45;
}
.mr-info__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.35rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: oklch(var(--bc) / 0.55);
}
.mr-info__list {
  display: grid;
  gap: 0.4rem;
  padding-left: 1rem;
  list-style: disc;
  color: oklch(var(--bc) / 0.8);
}
</style>
