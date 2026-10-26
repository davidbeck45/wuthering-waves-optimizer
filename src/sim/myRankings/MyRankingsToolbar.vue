<template>
  <div class="mr-toolbar">
    <!-- desktop: the controls inline -->
    <div class="mr-toolbar__inline">
      <label class="mr-switch" title="estimate the next sequence node and the weapon at R5 for every character, on their best rotation (slower)">
        <input :checked="investment" type="checkbox" class="toggle toggle-xs toggle-primary" :disabled="running" data-test-my-rankings-investment @change="setInvestment($event)" />
        <span>Upgrade estimates</span>
      </label>
      <label
        class="mr-switch"
        title="On: each team member's buffs come from the team's real members and their builds. Off: each character's Team Buffs panel as saved on the Calculator page.">
        <input v-model="autoTeamBuffs" type="checkbox" class="toggle toggle-xs toggle-primary" :disabled="running" data-test-auto-team-buffs />
        <span>Team buffs from members</span>
      </label>
      <button type="button" class="btn btn-primary btn-sm" :disabled="running || !canCompute" data-test-my-rankings-compute @click="$emit('compute')">
        <span v-if="running" class="loading loading-spinner loading-xs"></span>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {{ running ? "Ranking…" : hasRanking ? "Recompute" : "Rank my roster" }}
      </button>
    </div>

    <!-- phone: one Options button, the controls in a bottom sheet -->
    <button type="button" class="btn btn-sm px-3 mr-toolbar__options" :aria-expanded="sheet" data-test-my-rankings-options @click="sheet = true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" stroke-linecap="round" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
      Options
      <span v-if="running" class="loading loading-spinner loading-xs"></span>
    </button>
    <Teleport to="body">
      <div v-if="sheet" class="mr-sheet" data-test-my-rankings-sheet @keydown.esc="sheet = false">
        <div class="mr-sheet__backdrop" @click="sheet = false"></div>
        <div class="mr-sheet__panel" role="dialog" aria-modal="true" aria-label="Ranking options">
          <div class="mr-sheet__grip" aria-hidden="true"></div>
          <div class="mr-sheet__head">
            <span>Options</span>
            <button type="button" class="btn btn-ghost btn-sm btn-square" aria-label="Close" data-test-my-rankings-sheet-close @click="sheet = false">✕</button>
          </div>
          <div class="mr-sheet__group">
            <div class="mr-sheet__label">Sort characters by</div>
            <div class="mr-sheet__seg" role="group">
              <button
                v-for="o in SORTS"
                :key="o.key"
                type="button"
                class="btn btn-sm"
                :class="sort.key === o.key ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                :data-test-my-rankings-sheet-sort="o.key"
                @click="$emit('update:sort', { key: o.key, dir: DEFAULT_DIR[o.key] })">
                {{ o.label }}
              </button>
            </div>
          </div>
          <label class="mr-sheet__row">
            <span>
              <span class="font-semibold">Upgrade estimates</span>
              <span class="mr-sheet__hint">next sequence node and R5 on each best rotation</span>
            </span>
            <input :checked="investment" type="checkbox" class="toggle toggle-primary" :disabled="running" @change="setInvestment($event)" />
          </label>
          <label class="mr-sheet__row">
            <span>
              <span class="font-semibold">Team buffs from the members</span>
              <span class="mr-sheet__hint">off: each character's saved Team Buffs panel</span>
            </span>
            <input v-model="autoTeamBuffs" type="checkbox" class="toggle toggle-primary" :disabled="running" />
          </label>
          <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash() }" class="mr-sheet__row mr-sheet__row--link" @click="sheet = false">
            <span class="font-semibold">wuwa_calc rankings at my account</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </RouterLink>
          <button type="button" class="btn btn-primary w-full mt-3" :disabled="running || !canCompute" @click="computeFromSheet">
            <span v-if="running" class="loading loading-spinner loading-xs"></span>
            {{ running ? "Ranking…" : hasRanking ? "Recompute" : "Rank my roster" }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the /my-rankings controls: inline on desktop, one "Options" bottom sheet on a phone
// (like /rankings' "Filters & options").
import { onBeforeUnmount, ref, watch } from "vue";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { rankingsMineHash } from "../account/accountState";
import { DEFAULT_DIR, type SortDir, type SortKey } from "./rows";

defineProps<{ investment: boolean; sort: { key: SortKey; dir: SortDir }; running: boolean; canCompute: boolean; hasRanking: boolean }>();
const emit = defineEmits<{
  compute: [];
  "update:investment": [value: boolean];
  "update:sort": [value: { key: SortKey; dir: SortDir }];
}>();

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "damage", label: "Damage" },
  { key: "upgrade", label: "Best upgrade" },
  { key: "name", label: "Name" },
];

const sheet = ref(false);
const setInvestment = (event: Event): void => emit("update:investment", (event.target as HTMLInputElement).checked);
function computeFromSheet(): void {
  sheet.value = false;
  emit("compute");
}
function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") sheet.value = false;
}
watch(sheet, (open) => {
  if (open) document.addEventListener("keydown", onKey);
  else document.removeEventListener("keydown", onKey);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<style scoped>
.mr-toolbar {
  display: flex;
  align-items: center;
}
.mr-toolbar__inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.mr-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.75);
  cursor: pointer;
  white-space: nowrap;
}
.mr-toolbar__options {
  display: none;
}
@media (max-width: 767px) {
  .mr-toolbar__inline {
    display: none;
  }
  .mr-toolbar__options {
    display: inline-flex;
  }
}
.mr-sheet {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.mr-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.45);
}
.mr-sheet__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 85dvh;
  overflow-y: auto;
  padding: 0.5rem 1rem calc(1rem + env(safe-area-inset-bottom));
  border-radius: 1.1rem 1.1rem 0 0;
  background: oklch(var(--b2));
  color: oklch(var(--bc));
  box-shadow: 0 -12px 40px -10px rgb(0 0 0 / 0.5);
}
.mr-sheet__grip {
  width: 2.5rem;
  height: 0.25rem;
  margin: 0.15rem auto 0.4rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.2);
}
.mr-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.mr-sheet__group {
  padding: 0.5rem 0 0.75rem;
}
.mr-sheet__label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: oklch(var(--bc) / 0.55);
  margin-bottom: 0.4rem;
}
.mr-sheet__seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.mr-sheet__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0;
  border-top: 1px solid oklch(var(--bc) / 0.08);
  font-size: 0.9rem;
}
.mr-sheet__row > span:first-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.mr-sheet__row--link {
  color: oklch(var(--p));
}
.mr-sheet__hint {
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.55);
}
</style>
