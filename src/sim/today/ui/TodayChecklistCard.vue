<template>
  <!-- Wuthering Tools+ /today: the caps checklist — each item clears itself at its own reset -->
  <section class="td-card" aria-labelledby="td-check-title" data-test-today-checklist>
    <div class="td-card__head td-card__head--tight">
      <h2 id="td-check-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
        Caps checklist
        <span class="td-count td-num" data-test-today-checklist-done>{{ t.checklistDone.value.done }}/{{ t.checklistDone.value.total }}</span>
      </h2>
      <button type="button" class="td-head-actions td-link text-xs font-semibold" :aria-pressed="editing" data-test-today-checklist-edit @click="editing = !editing">
        {{ editing ? "Done" : "Edit list" }}
      </button>
    </div>

    <div v-for="g in groups" :key="g.id" class="td-ck__group">
      <h3 class="td-ck__group-head">
        <span>{{ g.label }}</span>
        <span v-if="g.resetsAt" class="td-meta td-num">resets {{ fmtIn(g.resetsAt, t.now.value) }}</span>
      </h3>
      <ul class="td-list">
        <li v-for="s in g.items" :key="s.rule.id" class="td-ck" :class="{ 'td-ck--done': s.done, 'td-ck--counter': s.max > 1 && !editing }" :data-test-today-check="s.rule.id" :data-done="s.done">
          <button
            v-if="s.max === 1"
            type="button"
            class="td-ck__box"
            role="checkbox"
            :aria-checked="s.done"
            :aria-label="s.rule.label"
            :data-test-today-check-toggle="s.rule.id"
            @click="t.setTick(s.rule, s.done ? 0 : 1)">
            <svg v-if="s.done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
          </button>
          <span v-else class="td-ck__ring" :style="{ '--td-p': `${(s.count / s.max) * 360}deg` }" aria-hidden="true">
            <svg v-if="s.done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          </span>
          <div class="td-ck__text">
            <div class="td-ck__label">{{ s.rule.label }}</div>
            <div class="td-ck__detail">
              <template v-if="s.done && s.resetsAt">Done · back {{ fmtIn(s.resetsAt, t.now.value) }}{{ s.resetsApprox ? " (≈)" : "" }}</template>
              <template v-else>{{ s.rule.detail }}</template>
              <a v-if="sourceUrl(s.rule.source)" :href="sourceUrl(s.rule.source)!" target="_blank" rel="noopener noreferrer" class="td-link td-ck__src" :title="`Source: ${s.rule.source!.label}`" :aria-label="`Source: ${s.rule.source!.label}`">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              </a>
            </div>
          </div>
          <div v-if="editing" class="td-ck__ctrl">
            <button type="button" class="td-icon-btn" :aria-label="`Hide ${s.rule.label}`" :data-test-today-check-hide="s.rule.id" @click="t.hideItem(s.rule.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A10 10 0 0112 5c5 0 9 4.5 10 7a12 12 0 01-2.7 3.9M6.6 6.6A12 12 0 002 12c1 2.5 5 7 10 7a10 10 0 005.4-1.6" /></svg>
            </button>
          </div>
          <div v-else-if="s.max > 1" class="td-ck__ctrl">
            <button type="button" class="td-ck__step" :disabled="s.count <= 0" :aria-label="`One fewer ${s.rule.label}`" :data-test-today-check-dec="s.rule.id" @click="t.setTick(s.rule, s.count - 1)">−</button>
            <span class="td-ck__n td-num" :data-test-today-check-count="s.rule.id">{{ s.count }}<span>/{{ s.max }}</span></span>
            <button type="button" class="td-ck__step" :disabled="s.done" :aria-label="`One more ${s.rule.label}`" :data-test-today-check-inc="s.rule.id" @click="t.setTick(s.rule, s.count + 1)">+</button>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="t.hiddenItems.value.length && editing" class="td-ck__hidden">
      <span class="td-meta">Hidden:</span>
      <button v-for="r in t.hiddenItems.value" :key="r.id" type="button" class="td-chip td-ck__unhide" :data-test-today-check-unhide="r.id" @click="t.hideItem(r.id, false)">+ {{ r.label }}</button>
    </div>
    <p v-else-if="t.hiddenItems.value.length" class="td-meta mt-2">{{ t.hiddenItems.value.length }} hidden · <button type="button" class="td-link" @click="editing = true">show</button></p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import type { ItemState } from "../checklist";
import { fmtIn } from "../format";
import { sourceUrl } from "../rules";
import { TODAY_KEY, type TodayModel } from "../useToday";

const t = inject(TODAY_KEY) as TodayModel;
const editing = ref(false);

const groups = computed(() => {
  const items = t.checklist.value;
  const r = t.resets.value;
  const out: { id: string; label: string; resetsAt: number | null; items: ItemState[] }[] = [
    { id: "daily", label: "Today", resetsAt: r.daily.nextMs, items: items.filter((s) => s.rule.reset === "daily") },
    { id: "weekly", label: "This week", resetsAt: r.weekly.nextMs, items: items.filter((s) => s.rule.reset === "weekly") },
    { id: "cycle", label: "This endgame cycle", resetsAt: null, items: items.filter((s) => s.rule.reset !== "daily" && s.rule.reset !== "weekly") },
  ];
  return out.filter((g) => g.items.length);
});
</script>

<style scoped>
.td-ck__group + .td-ck__group {
  margin-top: 0.7rem;
}
.td-ck__group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.1rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.7);
}
.td-ck {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.1rem;
  transition: opacity 0.2s;
}
.td-ck--done .td-ck__text {
  opacity: 0.55;
}
.td-ck--done .td-ck__label {
  text-decoration: line-through;
  text-decoration-color: oklch(var(--bc) / 0.35);
}
.td-ck__box,
.td-ck__ring {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  border-radius: 0.45rem;
  color: oklch(var(--pc));
  box-shadow: inset 0 0 0 2px oklch(var(--bc) / 0.25);
}
.td-ck__box:hover {
  box-shadow: inset 0 0 0 2px oklch(var(--p));
}
.td-ck__box:focus-visible,
.td-ck__step:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.td-ck--done .td-ck__box {
  background: oklch(var(--p));
  box-shadow: none;
}
.td-ck__ring {
  border-radius: 9999px;
  box-shadow: none;
  background: conic-gradient(oklch(var(--p)) var(--td-p, 0deg), oklch(var(--bc) / 0.14) 0);
  -webkit-mask: radial-gradient(circle, transparent 0.42rem, #000 0.45rem);
  mask: radial-gradient(circle, transparent 0.42rem, #000 0.45rem);
}
.td-ck--done .td-ck__ring {
  -webkit-mask: none;
  mask: none;
  background: oklch(var(--p));
}
.td-ck__ring svg,
.td-ck__box svg {
  width: 0.95rem;
  height: 0.95rem;
}
.td-ck__label {
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.25;
}
.td-ck__detail {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.55);
  line-height: 1.35;
}
.td-ck__src {
  display: inline-grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  margin-left: 0.15rem;
  vertical-align: -0.3rem;
}
.td-ck__src svg {
  width: 0.8rem;
  height: 0.8rem;
}
.td-ck__ctrl {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}
.td-ck__step {
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.7);
  background: oklch(var(--bc) / 0.06);
}
.td-ck__step:hover:not(:disabled) {
  background: oklch(var(--bc) / 0.12);
  color: oklch(var(--bc));
}
.td-ck__step:disabled {
  opacity: 0.35;
}
.td-ck__n {
  min-width: 2.6rem;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 750;
}
.td-ck__n span {
  font-weight: 600;
  color: oklch(var(--bc) / 0.45);
}
/* phones: a counter's stepper goes under its text, so labels keep their width */
@media (max-width: 480px) {
  .td-ck--counter {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }
  .td-ck--counter > .td-ck__ring {
    margin-top: 0.1rem;
  }
  .td-ck--counter > .td-ck__ctrl {
    grid-column: 2;
    margin-top: 0.15rem;
  }
}
.td-ck__hidden {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.6rem;
}
.td-ck__unhide:hover {
  color: oklch(var(--bc));
  background: oklch(var(--bc) / 0.12);
}
</style>
