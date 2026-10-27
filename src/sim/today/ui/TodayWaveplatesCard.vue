<template>
  <!-- Wuthering Tools+ /today: when Waveplates (and then crystals) are full -->
  <section class="td-card td-wp" aria-labelledby="td-wp-title" data-test-today-waveplates>
    <div class="td-card__head">
      <h2 id="td-wp-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
        Waveplates
      </h2>
      <span v-if="p" class="td-meta td-head-actions" :title="`Typed ${fmtWhen(entry!.atMs, t.now.value, t.timeMode.value, t.offsetHours.value)}. A typed count is taken as just ticked, so times can be up to ${W.regenMinutes} minutes early.`">
        updated {{ fmtAgo(entry!.atMs, t.now.value) }} · ±{{ W.regenMinutes }} min
      </span>
    </div>

    <!-- the count -->
    <div class="td-wp__inputs">
      <label class="td-wp__field">
        <span class="td-wp__label">Waveplates</span>
        <span class="td-wp__box">
          <button type="button" class="td-step" aria-label="One fewer Waveplate" data-test-today-wp-dec @click="nudge(-1)">−</button>
          <input
            v-model="draft"
            class="td-wp__input td-num"
            inputmode="numeric"
            enterkeyhint="done"
            aria-label="Waveplates you have now"
            placeholder="–"
            data-test-today-wp-input
            @focus="editing = true"
            @blur="commit"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
          <button type="button" class="td-step" aria-label="One more Waveplate" data-test-today-wp-inc @click="nudge(1)">+</button>
        </span>
        <span class="td-wp__of td-num">/ {{ W.max }}</span>
      </label>
      <label class="td-wp__field td-wp__field--crystal">
        <span class="td-wp__label">Crystals</span>
        <input
          v-model="crystalDraft"
          class="td-wp__input td-wp__input--small td-num"
          inputmode="numeric"
          enterkeyhint="done"
          aria-label="Waveplate Crystals you have now"
          placeholder="–"
          data-test-today-crystal-input
          @focus="editingCrystals = true"
          @blur="commitCrystals"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
        <span class="td-wp__of td-num">/ {{ W.crystalMax }}</span>
      </label>
    </div>

    <div v-if="p" class="td-wp__spend" role="group" aria-label="Spend Waveplates">
      <span class="td-meta">Spent</span>
      <button v-for="n in SPEND" :key="n.n" type="button" class="td-chip-btn" :title="n.title" :data-test-today-wp-spend="n.n" @click="t.spendWaveplates(n.n)">−{{ n.n }}</button>
      <span class="td-meta ml-2">Solvent</span>
      <button type="button" class="td-chip-btn" :title="`Used a Crystal Solvent (+${W.solvent})`" data-test-today-wp-solvent @click="t.spendWaveplates(-W.solvent)">+{{ W.solvent }}</button>
    </div>

    <template v-if="p">
      <div class="td-wp__bar" :aria-label="`${p.waveplates} of ${W.max} Waveplates`" role="img">
        <span class="td-wp__fill" :style="{ width: `${Math.min(100, (p.waveplates / W.max) * 100)}%` }"></span>
        <span class="td-wp__now td-num">{{ p.waveplates }}</span>
      </div>

      <div class="td-wp__out">
        <div class="td-wp__stat" data-test-today-wp-full>
          <span class="td-wp__stat-label">{{ p.fullAt && !p.full ? "Full at" : "Full" }}</span>
          <template v-if="p.fullAt && !p.full">
            <span class="td-wp__stat-big td-num">{{ fmtClock(p.fullAt, t.timeMode.value, t.offsetHours.value) }}</span>
            <span class="td-meta">{{ dayWord(p.fullAt) }} · {{ fmtIn(p.fullAt, t.nowSec.value) }}</span>
          </template>
          <template v-else>
            <span class="td-wp__stat-big td-wp__stat-big--warn">now</span>
            <span class="td-meta">{{ p.waveplates > W.max ? `${p.waveplates - W.max} over the cap` : "regen goes to crystals" }}</span>
          </template>
        </div>
        <div class="td-wp__stat" data-test-today-wp-crystals>
          <span class="td-wp__stat-label">Crystals full</span>
          <template v-if="p.crystalsFullAt && !p.crystalsFull">
            <span class="td-wp__stat-big td-wp__stat-big--soft td-num">{{ fmtClock(p.crystalsFullAt, t.timeMode.value, t.offsetHours.value) }}</span>
            <span class="td-meta">{{ dayWord(p.crystalsFullAt) }} · {{ fmtIn(p.crystalsFullAt, t.nowSec.value) }}</span>
          </template>
          <template v-else>
            <span class="td-wp__stat-big td-wp__stat-big--warn">now</span>
            <span class="td-meta">regeneration is wasted</span>
          </template>
        </div>
      </div>

      <p class="td-wp__hint" data-test-today-wp-hint>{{ hint }}</p>

      <div class="td-wp__actions">
        <button type="button" class="td-btn" :disabled="!canCalendar" data-test-today-wp-ics @click="t.downloadWaveplatesIcs()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M12 14v4M10 16h4" /></svg>
          Add to calendar
        </button>
        <button
          v-if="t.notifySupported"
          type="button"
          class="td-btn"
          :class="{ 'td-btn--on': t.state.value.notify }"
          :aria-pressed="t.state.value.notify"
          :disabled="t.notifyDenied.value && !t.state.value.notify"
          :title="t.notifyDenied.value ? 'Notifications are blocked for this site in your browser settings' : 'A browser notification when Waveplates fill — only while a tab of this site is open'"
          data-test-today-wp-notify
          @click="t.toggleNotify()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
          {{ t.state.value.notify ? "Notifying" : "Notify me" }}
        </button>
        <button type="button" class="td-link td-wp__clear" data-test-today-wp-clear @click="t.clearWaveplates()">Clear</button>
      </div>
      <p v-if="t.state.value.notify" class="td-meta mt-2">The notification comes only while a tab of this site is open — the calendar file works with the browser closed.</p>
    </template>
    <p v-else class="td-empty" data-test-today-wp-empty>
      Type how many Waveplates you have and this works out when they're full — {{ W.regenMinutes }} minutes each up to {{ W.max }}, then crystals at
      half speed up to {{ W.crystalMax }}.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { fmtAgo } from "../../convene/ui/format";
import { fmtClock, fmtIn, fmtWhen } from "../format";
import { RULES } from "../rules";
import { dailyRegen } from "../waveplates";
import { TODAY_KEY, type TodayModel } from "../useToday";

const t = inject(TODAY_KEY) as TodayModel;
const W = RULES.waveplates;
const SPEND = [
  { n: 40, title: "A Simulation or Forgery claim (40)" },
  { n: 60, title: "A Tacet Suppression, Boss or Weekly claim (60)" },
];

const entry = computed(() => t.state.value.waveplates);
const p = computed(() => t.waveplates.value);

// drafts: the inputs show the projected counts and follow them until focused
const draft = ref("");
const crystalDraft = ref("");
const editing = ref(false);
const editingCrystals = ref(false);
watch(
  () => p.value?.waveplates,
  (v) => {
    if (!editing.value) draft.value = v == null ? "" : String(v);
  },
  { immediate: true },
);
watch(
  () => p.value?.crystals,
  (v) => {
    if (!editingCrystals.value) crystalDraft.value = v == null || (v === 0 && !p.value) ? "" : String(v);
  },
  { immediate: true },
);

function parse(s: string): number | null {
  const n = Number(String(s).replace(/[^\d]/g, ""));
  return String(s).trim() === "" || !Number.isFinite(n) ? null : n;
}
function commit(): void {
  editing.value = false;
  const n = parse(draft.value);
  if (n == null) {
    draft.value = p.value ? String(p.value.waveplates) : "";
    return;
  }
  if (n !== p.value?.waveplates) t.setWaveplates(n);
  draft.value = String(Math.min(999, n));
}
function commitCrystals(): void {
  editingCrystals.value = false;
  const n = parse(crystalDraft.value) ?? 0;
  const value = p.value?.waveplates ?? parse(draft.value) ?? 0;
  if (!p.value || n !== p.value.crystals) t.setWaveplates(value, Math.min(W.crystalMax, n));
}
function nudge(d: number): void {
  const base = p.value?.waveplates ?? parse(draft.value) ?? 0;
  t.setWaveplates(Math.max(0, base + d));
}

function dayWord(ms: number): string {
  const s = fmtWhen(ms, t.now.value, t.timeMode.value, t.offsetHours.value);
  return s.replace(/^\d\d:\d\d /, "").replace(/, \d\d:\d\d$/, "").replace(/ \d\d:\d\d$/, "");
}

const canCalendar = computed(() => !!p.value && ((p.value.fullAt != null && !p.value.full) || (p.value.crystalsFullAt != null && !p.value.crystalsFull)));

const hint = computed(() => {
  const v = p.value;
  if (!v) return "";
  if (v.full && v.crystalsFull) return `Both are full: every ${W.regenMinutes} minutes another Waveplate is lost. Spend some now.`;
  if (v.full) return `Capped: new Waveplates go to crystals at half speed (1 per ${W.crystalRegenMinutes} min). Spending now keeps the full rate.`;
  const toFull = v.fullAt! - t.nowSec.value;
  const perDay = dailyRegen();
  if (toFull < 2 * 3_600_000) return `Less than two hours to the cap — spend ${Math.min(v.waveplates, 60)} or more to keep regenerating at full speed.`;
  return `You regenerate ${perDay} a day. Spend before the cap and none of it slows down.`;
});
</script>

<style scoped>
.td-wp__inputs {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1.25rem;
}
.td-wp__field {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 0.4rem;
  row-gap: 0.25rem;
}
.td-wp__label {
  grid-column: 1 / -1;
  font-size: 0.7rem;
  font-weight: 650;
  color: oklch(var(--bc) / 0.6);
}
.td-wp__box {
  display: inline-flex;
  align-items: stretch;
  border-radius: 0.7rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.14);
}
.td-wp__box:focus-within {
  box-shadow: inset 0 0 0 2px oklch(var(--p));
}
.td-step {
  width: 2.4rem;
  font-size: 1.15rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.65);
  border-radius: 0.7rem;
}
.td-step:hover {
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.06);
}
.td-wp__input {
  width: 4.2rem;
  min-height: 2.6rem;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 750;
  background: transparent;
  outline: none;
}
.td-wp__input::placeholder {
  color: oklch(var(--bc) / 0.3);
}
.td-wp__input--small {
  width: 4.2rem;
  min-height: 2.6rem;
  font-size: 1.05rem;
  border-radius: 0.7rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.14);
}
.td-wp__input--small:focus {
  box-shadow: inset 0 0 0 2px oklch(var(--p));
}
.td-wp__of {
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.5);
}
.td-wp__spend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.7rem;
}
.td-chip-btn {
  min-height: 1.9rem;
  padding: 0.15rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: oklch(var(--bc) / 0.07);
  transition: background-color 0.15s;
}
.td-chip-btn:hover {
  background: oklch(var(--bc) / 0.13);
}
.td-chip-btn:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 1px;
}
.td-wp__bar {
  position: relative;
  height: 1.35rem;
  margin-top: 0.85rem;
  border-radius: 0.5rem;
  background: oklch(var(--bc) / 0.07);
  overflow: hidden;
}
.td-wp__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, oklch(var(--p) / 0.55), oklch(var(--p)));
}
.td-wp__now {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.72rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.75);
}
.td-wp__out {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.85rem;
}
.td-wp__stat {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.td-wp__stat-label {
  font-size: 0.7rem;
  font-weight: 650;
  color: oklch(var(--bc) / 0.6);
}
.td-wp__stat-big {
  font-size: 1.85rem;
  font-weight: 750;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: oklch(var(--p));
}
:root[data-theme-style="light"] .td-wp__stat-big {
  color: color-mix(in oklab, oklch(var(--p)) 80%, black);
}
.td-wp__stat-big--soft {
  color: oklch(var(--bc) / 0.85) !important;
}
.td-wp__stat-big--warn {
  color: oklch(var(--wa)) !important;
}
:root[data-theme-style="light"] .td-wp__stat-big--warn {
  color: color-mix(in oklab, oklch(var(--wa)) 60%, black) !important;
}
.td-wp__hint {
  margin-top: 0.7rem;
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.65);
}
.td-wp__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.8rem;
}
.td-wp__clear {
  margin-left: auto;
  font-size: 0.75rem;
}
</style>
