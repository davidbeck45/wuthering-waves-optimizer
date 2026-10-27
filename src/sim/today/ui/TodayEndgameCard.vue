<template>
  <!-- Wuthering Tools+ /today: the endgame cycles — Tower of Adversity, Whimpering Wastes, the Endstate Matrix phase -->
  <section class="td-card" aria-labelledby="td-endgame-title" data-test-today-endgame>
    <div class="td-card__head">
      <h2 id="td-endgame-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M9 9h.01M15 9h.01M9 13h.01M15 13h.01" /></svg>
        Endgame
      </h2>
    </div>

    <ul class="td-eg">
      <li v-for="c in t.cycles.value" :key="c.rule.id" class="td-eg__row" :data-test-today-cycle="c.rule.id">
        <div class="td-eg__top">
          <div class="min-w-0">
            <component :is="hasRoute(c.rule.link) ? RouterLink : 'span'" :to="c.rule.link ?? undefined" class="td-eg__name" :class="{ 'td-eg__name--link': hasRoute(c.rule.link) }">
              {{ c.rule.name }}
            </component>
            <div class="td-eg__detail">
              {{ c.rule.detail }}<template v-if="c.window?.season"> · Season {{ c.window.season }}</template>
            </div>
          </div>
          <div v-if="c.window" class="td-row__when" :class="{ 'td-urgent': c.window.nextMs - t.now.value < 2 * DAY }">
            {{ fmtDuration(c.window.nextMs - t.now.value) }}
            <small>to reset</small>
          </div>
        </div>
        <template v-if="c.window">
          <div class="td-bar" :class="c.rule.id === 'ww' ? 'td-bar--secondary' : ''"><span :style="{ width: pct(c.progress) }"></span></div>
          <div class="td-eg__foot">
            <span class="td-num">{{ fmtDate(c.window.startMs, mode, offset) }} → {{ fmtWhen(c.window.nextMs - 1, t.now.value, mode, offset) }}</span>
            <a v-if="c.rule.confidence !== 'official'" :href="sourceUrl(c.rule.source) ?? undefined" target="_blank" rel="noopener noreferrer" class="td-chip td-chip--warn" :title="c.rule.source.label">check in game</a>
          </div>
        </template>
      </li>

      <li class="td-eg__row" data-test-today-cycle="matrix">
        <div class="td-eg__top">
          <div class="min-w-0">
            <RouterLink to="/rankings" class="td-eg__name td-eg__name--link">{{ m.rule.name }}</RouterLink>
            <div class="td-eg__detail">
              {{ m.rule.cycle }}
              <template v-if="m.phaseNumber"> · Phase {{ m.phaseNumber }} of {{ m.phases }}</template>
            </div>
          </div>
          <div v-if="m.endMs" class="td-row__when">
            ≈ {{ fmtDuration(m.endMs - t.now.value) }}
            <small>to reset</small>
          </div>
        </div>
        <div v-if="m.progress != null" class="td-bar td-bar--accent"><span :style="{ width: pct(m.progress) }"></span></div>
        <div class="td-eg__foot">
          <span v-if="m.inCycle">{{ matrixLine }}</span>
          <template v-else-if="m.version">
            <span>A new cycle — check in game</span>
          </template>
          <template v-else>
            <span>Phases reset with each version update</span>
          </template>
          <a :href="sourceUrl(m.rule.source) ?? undefined" target="_blank" rel="noopener noreferrer" class="td-link" :title="m.rule.source.label">Kuro ↗</a>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { fmtDate, fmtDuration, fmtWhen } from "../format";
import { DAY_MS as DAY } from "../resets";
import { sourceUrl } from "../rules";
import { TODAY_KEY, type TodayModel } from "../useToday";

const t = inject(TODAY_KEY) as TodayModel;
const router = useRouter();
const mode = computed(() => t.timeMode.value);
const offset = computed(() => t.offsetHours.value);
const m = computed(() => t.matrix.value);
const nextVersion = computed(() => {
  const v = m.value.version;
  if (!v) return "next";
  const [a = 0, b = 0] = v.split(".").map(Number);
  return `${a}.${b + 1}`;
});
const matrixLine = computed(() => {
  const v = m.value;
  const when = v.endMs ? `Resets with the ${nextVersion.value} update, ≈ ${fmtDate(v.endMs, mode.value, offset.value)}` : "Resets with the next version update";
  return `${when} · ${v.lastPhase ? "the cycle's last phase" : `the cycle runs through ${v.rule.toVersion}`}`;
});
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** a mode's page exists in this build (the ToA planner lives in another track until it is merged) */
function hasRoute(path: string | null): boolean {
  if (!path) return false;
  try {
    return router.resolve(path).matched.length > 0;
  } catch {
    return false;
  }
}
</script>

<style scoped>
.td-eg {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.td-eg__row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.65rem 0.7rem;
  border-radius: 0.7rem;
  background: oklch(var(--b1) / 0.6);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.06);
}
.td-eg__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.td-eg__name {
  font-size: 0.9rem;
  font-weight: 700;
  color: oklch(var(--bc));
}
.td-eg__name--link::after {
  content: " ›";
  color: oklch(var(--p));
}
.td-eg__name--link:hover {
  color: oklch(var(--p));
}
.td-eg__detail {
  font-size: 0.74rem;
  color: oklch(var(--bc) / 0.6);
}
.td-eg__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.5rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.55);
}
</style>
