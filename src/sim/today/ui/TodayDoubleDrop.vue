<template>
  <!-- Wuthering Tools+ /today: a double-drop event, stated as numbers — only while one runs (a quiet line before) -->
  <section v-for="d in live" :key="d.event.id" class="td-dd" role="status" :data-test-today-double-drop="d.rule.id">
    <div class="td-dd__badge" aria-hidden="true">2×</div>
    <div class="td-dd__body">
      <h2 class="td-dd__title">
        {{ d.event.name }} is on — doubled {{ d.rule.activity }} rewards
        <span class="td-dd__left td-num">{{ fmtDuration(d.event.endMs - t.now.value) }} left</span>
      </h2>
      <p class="td-dd__text">
        <b>{{ d.rule.claimsPerDay }} doubled claims a day</b>, back at 04:00 server time. Each one is worth exactly one extra run, so the
        event adds <b>{{ d.rule.claimsPerDay }} runs a day</b><template v-if="days(d) > 0"> — {{ math(d).extraRuns }} over the {{ days(d) }} {{ days(d) === 1 ? "day" : "days" }} left</template>.
        The {{ d.rule.claimsPerDay }} claims cost {{ math(d).waveplatesPerDay }} Waveplates, less than the {{ regen }} you regenerate in a day:
        <b>saving Waveplates or crystals for it gains nothing</b> — just don't skip a day.
        <template v-if="d.rule.note">{{ d.rule.note }}</template>
      </p>
      <div class="td-dd__claims">
        <span class="td-meta">Today's doubled claims</span>
        <button
          v-for="i in d.rule.claimsPerDay"
          :key="i"
          type="button"
          class="td-dd__pip"
          :class="{ 'td-dd__pip--on': claims >= i }"
          :aria-label="`${i} of ${d.rule.claimsPerDay} doubled claims used`"
          :aria-pressed="claims >= i"
          :data-test-today-double-claim="i"
          @click="setClaims(claims >= i ? i - 1 : i)"></button>
        <a :href="KURO_NOTICE_URL(d.event.articleId)" target="_blank" rel="noopener noreferrer" class="td-link text-xs ml-auto">Kuro ↗</a>
      </div>
    </div>
  </section>
  <p v-if="!live.length && upcoming" class="td-dd-soon" data-test-today-double-drop-soon>
    <span class="td-dd-soon__badge">2×</span>
    <span>
      <b>{{ upcoming.event.name }}</b> starts {{ fmtWhen(upcoming.event.startMs, t.now.value, t.timeMode.value, t.offsetHours.value) }} — {{ upcoming.rule!.claimsPerDay }}
      doubled {{ upcoming.rule!.activity }} claims a day ({{ upcoming.rule!.claimsPerDay * upcoming.rule!.costPerClaim }} Waveplates). That fits in a day's
      regeneration, so there's no need to save up for it.
    </span>
  </p>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import type { LiveDoubleDrop } from "../durations";
import { fmtDuration, fmtWhen } from "../format";
import { DAY_MS } from "../resets";
import { KURO_NOTICE_URL, RULES } from "../rules";
import { dailyRegen } from "../waveplates";
import { TODAY_KEY, type TodayModel } from "../useToday";

const t = inject(TODAY_KEY) as TodayModel;
const regen = dailyRegen();
const live = computed(() => t.liveDoubleDrops.value);
const upcoming = computed(() => t.upcomingDoubleDrops.value[0] ?? null);
/** whole server days left, today included */
const days = (d: LiveDoubleDrop) => Math.max(0, Math.ceil((d.event.endMs - t.resets.value.daily.startMs) / DAY_MS));
const math = (d: LiveDoubleDrop) => t.doubleDropMath(d.rule, days(d));

const claimsRule = RULES.checklist.find((r) => r.id === "double-claims")!;
const claims = computed(() => t.checklist.value.find((s) => s.rule.id === "double-claims")?.count ?? 0);
function setClaims(n: number): void {
  t.setTick(claimsRule, n);
}
</script>

<style scoped>
.td-dd {
  display: flex;
  gap: 0.9rem;
  margin-bottom: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 0.95rem;
  background: linear-gradient(120deg, oklch(var(--a) / 0.16), oklch(var(--a) / 0.05) 60%);
  box-shadow: inset 0 0 0 1px oklch(var(--a) / 0.4);
}
.td-dd__badge {
  display: grid;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  flex-shrink: 0;
  border-radius: 0.8rem;
  font-size: 1.15rem;
  font-weight: 800;
  color: oklch(var(--ac));
  background: oklch(var(--a));
}
.td-dd__body {
  min-width: 0;
  flex: 1;
}
.td-dd__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.75rem;
  font-size: 0.98rem;
  font-weight: 750;
}
.td-dd__left {
  font-size: 0.8rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.65);
}
.td-dd__text {
  margin-top: 0.3rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: oklch(var(--bc) / 0.8);
}
.td-dd__claims {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.55rem;
}
.td-dd__pip {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.45rem;
  box-shadow: inset 0 0 0 2px oklch(var(--a) / 0.6);
}
.td-dd__pip--on {
  background: oklch(var(--a));
  box-shadow: none;
}
.td-dd__pip:focus-visible {
  outline: 2px solid oklch(var(--a));
  outline-offset: 2px;
}
.td-dd-soon {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 1rem;
  padding: 0.55rem 0.8rem;
  border-radius: 0.8rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: oklch(var(--bc) / 0.75);
  background: oklch(var(--a) / 0.07);
  box-shadow: inset 0 0 0 1px oklch(var(--a) / 0.22);
}
.td-dd-soon__badge {
  flex-shrink: 0;
  padding: 0 0.4rem;
  border-radius: 0.4rem;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.35rem;
  color: oklch(var(--ac));
  background: oklch(var(--a));
}
@media (max-width: 767px) {
  .td-dd {
    gap: 0.7rem;
    padding: 0.8rem 0.85rem;
  }
  .td-dd__badge {
    width: 2.3rem;
    height: 2.3rem;
    font-size: 1rem;
  }
}
</style>
