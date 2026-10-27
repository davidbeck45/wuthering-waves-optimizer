<template>
  <!-- Wuthering Tools+ /today: the server clock and the daily / weekly reset countdowns -->
  <section class="td-card td-now" aria-labelledby="td-now-title" data-test-today-now>
    <div class="td-card__head">
      <h2 id="td-now-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        Server clock
      </h2>
      <label class="td-head-actions">
        <span class="sr-only">Your server</span>
        <select
          class="select select-bordered select-xs td-now__region"
          :value="t.serverId.value"
          data-test-today-region
          @change="t.setRegion(($event.target as HTMLSelectElement).value as ServerRegionId)">
          <option v-for="region in SERVER_REGIONS" :key="region.id" :value="region.id">{{ region.label }} · {{ utcLabel(region.offsetHours) }}</option>
        </select>
      </label>
    </div>

    <div class="td-now__clock">
      <span class="td-now__time td-num" data-test-today-server-time>{{ fmtClock(t.nowSec.value, "server", offset) }}<span class="td-now__sec">{{ secs }}</span></span>
      <span class="td-now__day">
        <span>{{ fmtDay(t.nowSec.value, "server", offset) }}</span>
        <span v-if="showLocal" class="td-meta td-num">your time {{ fmtClock(t.nowSec.value, "local", offset) }}</span>
      </span>
    </div>

    <div class="td-now__resets">
      <div class="td-now__reset" data-test-today-daily>
        <div class="td-now__reset-head">
          <span class="td-now__reset-label">Daily reset</span>
          <span class="td-now__reset-in td-num" :class="{ 'td-urgent': dailyLeft < 2 * HOUR }">{{ fmtDuration(dailyLeft) }}</span>
        </div>
        <div class="td-bar" :class="dailyLeft < 2 * HOUR ? 'td-bar--accent' : ''"><span :style="{ width: pct(r.daily.progress) }"></span></div>
        <div class="td-meta">{{ whenText(r.daily.nextMs) }}</div>
      </div>
      <div class="td-now__reset" data-test-today-weekly>
        <div class="td-now__reset-head">
          <span class="td-now__reset-label">Weekly reset</span>
          <span class="td-now__reset-in td-num" :class="{ 'td-urgent': weeklyLeft < 12 * HOUR }">{{ fmtDuration(weeklyLeft) }}</span>
        </div>
        <div class="td-bar td-bar--secondary"><span :style="{ width: pct(r.weekly.progress) }"></span></div>
        <div class="td-meta">{{ whenText(r.weekly.nextMs) }}</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { SERVER_REGIONS } from "../../convene/banners";
import type { ServerRegionId } from "../../convene/prefs";
import { fmtClock, fmtDay, fmtDuration, fmtWhen, modeLabel } from "../format";
import { browserOffsetMinutes, HOUR_MS as HOUR, utcLabel } from "../resets";
import { TODAY_KEY, type TodayModel } from "../useToday";

const t = inject(TODAY_KEY) as TodayModel;
const offset = computed(() => t.offsetHours.value);
const r = computed(() => t.resets.value);
const secs = computed(() => `:${String(new Date(t.nowSec.value).getUTCSeconds()).padStart(2, "0")}`);
const dailyLeft = computed(() => r.value.daily.nextMs - t.nowSec.value);
const weeklyLeft = computed(() => r.value.weekly.nextMs - t.nowSec.value);
/** the device's clock differs from the server's */
const showLocal = computed(() => browserOffsetMinutes(t.now.value) !== offset.value * 60);
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
function whenText(ms: number): string {
  return `${fmtWhen(ms, t.now.value, t.timeMode.value, offset.value)} ${modeLabel(t.timeMode.value)}`;
}
</script>

<style scoped>
.td-now__region {
  max-width: 11.5rem;
  font-size: 0.75rem;
}
.td-now__clock {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.25rem 0.85rem;
}
.td-now__time {
  font-size: 2.6rem;
  font-weight: 750;
  line-height: 1;
  letter-spacing: -0.02em;
}
.td-now__sec {
  font-size: 1.15rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.4);
  margin-left: 0.1rem;
}
.td-now__day {
  display: flex;
  flex-direction: column;
  padding-bottom: 0.2rem;
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.3;
}
.td-now__resets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  margin-top: 1rem;
}
.td-now__reset {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.65rem 0.7rem;
  border-radius: 0.7rem;
  background: oklch(var(--b1) / 0.6);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.06);
}
.td-now__reset-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 0.5rem;
}
.td-now__reset-label {
  font-size: 0.72rem;
  font-weight: 650;
  color: oklch(var(--bc) / 0.65);
}
.td-now__reset-in {
  font-size: 1.1rem;
  font-weight: 750;
}
@media (max-width: 380px) {
  .td-now__resets {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
