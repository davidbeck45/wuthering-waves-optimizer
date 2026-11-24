<template>
  <!-- Wuthering Tools+ "Over time" on /whats-new › Your numbers: every figure of the log as a small line, the ones that
       moved first; a row opens into a larger chart with what happened between records. -->
  <section class="ntr" aria-labelledby="ntr-title" data-test-trends>
    <h3 id="ntr-title" class="ntr__h">Over time</h3>
    <p class="ntr__intro">
      Every record in the log, oldest to newest, as one small line per figure. Each small line is scaled to its own lowest and highest value, so read the change in
      words beside it. Tap a row for the full chart and what happened between records.
    </p>

    <template v-for="g in groups" :key="g.key">
      <template v-if="g.show">
        <h4 class="ntr__h4">{{ g.title }} <span class="ntr__count">{{ g.rows.length }}</span></h4>
        <ul v-if="g.rows.length" class="ntr__list" :data-test-trends-group="g.key">
          <li v-for="t in g.rows" :key="t.key" class="ntr__row" :class="{ 'ntr__row--open': open === t.key }" data-test-trend-row :data-key="t.key">
            <button type="button" class="ntr__btn" :aria-expanded="open === t.key" :aria-controls="`ntr-${slug(t.key)}`" @click="toggle(t.key)">
              <span class="ntr__who">
                <span class="ntr__faces" aria-hidden="true"><CharacterAvatar v-for="id in t.members" :id="id" :key="id" :size="24" /></span>
                <span class="ntr__name">{{ title(t) }}</span>
              </span>
              <span class="ntr__fig">
                <TrendSpark :points="t.points" />
                <span class="ntr__nums" data-test-trend-figures>
                  <span>{{ compact(t.first.value) }} <span class="ntr__muted">{{ dayText(t.first.at, now) }}</span></span>
                  <span aria-hidden="true"> → </span><span class="sr-only"> to </span>
                  <b>{{ compact(t.last.value) }}</b> <span class="ntr__muted">{{ dayText(t.last.at, now) }}</span>
                </span>
              </span>
              <span class="ntr__change" :class="t.delta > 0 ? 'ntr__up' : t.delta < 0 ? 'ntr__down' : ''" data-test-trend-change>
                <span aria-hidden="true">{{ t.delta > 0 ? "▲" : t.delta < 0 ? "▼" : "=" }}</span>
                {{ changeWords(t) }}
              </span>
              <span v-if="trendNote(t)" class="ntr__note" data-test-trend-note>{{ trendNote(t) }}</span>
              <span class="ntr__chev" aria-hidden="true">{{ open === t.key ? "▴" : "▾" }}</span>
            </button>
            <div v-if="open === t.key" :id="`ntr-${slug(t.key)}`" class="ntr__body">
              <TrendChart :trend="t" :steps="stepsOf(t)" :now="now" />
            </div>
          </li>
        </ul>
        <p v-if="g.unmoved" class="ntr__still" :data-test-trends-unmoved="g.key">{{ g.unmoved }} {{ g.noun }}{{ g.unmoved === 1 ? "" : "s" }} did not move in any record.</p>
      </template>
    </template>

    <button v-if="stockTotal" type="button" class="btn btn-outline btn-sm ntr__toggle" :aria-pressed="showStock" data-test-trends-stock-toggle @click="showStock = !showStock">
      {{ showStock ? "Hide stock teams" : `Show stock teams (${stockTotal})` }}
    </button>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "Over time" (src/sim/numbersLog/trends.ts reads the log; this draws it). The open row is in the
// address (`?trend=<key>`, a replace), so Back leaves the page and a link from /account can open one.
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterShortName } from "../display/names";
import { compact, fmt } from "../myRankings/format";
import { dayText } from "./compare";
import type { NumbersLog } from "./log";
import TrendChart from "./TrendChart.vue";
import { buildTrends, trendChangeText, trendNote, trendList, trendSteps, type Trend, type TrendStep } from "./trends";
import TrendSpark from "./TrendSpark.vue";
import { NAMES } from "./useNumbersLog";

const props = defineProps<{ log: NumbersLog; now: number }>();
const route = useRoute();
const router = useRouter();

const trends = computed(() => buildTrends(props.log));
const list = computed(() => trendList(trends.value));
const showStock = ref(false);
const stockTotal = computed(() => list.value.stock.length + list.value.unmoved.stock);
const groups = computed(() => [
  { key: "saved", title: "Your teams", rows: list.value.saved, unmoved: list.value.unmoved.saved, noun: "saved team", show: true },
  { key: "characters", title: "Characters", rows: list.value.characters, unmoved: list.value.unmoved.characters, noun: "character", show: true },
  { key: "stock", title: "Stock teams", rows: list.value.stock, unmoved: list.value.unmoved.stock, noun: "stock team", show: showStock.value },
]);

const open = computed(() => {
  const key = typeof route.query.trend === "string" ? route.query.trend : null;
  return key && trends.value.some((t) => t.key === key) ? key : null;
});
// an opened stock team stays reachable when the page is opened on its link
if (open.value?.startsWith("t:") && trends.value.find((t) => t.key === open.value)?.group === "stock") showStock.value = true;
function toggle(key: string): void {
  const query = { ...route.query };
  if (open.value === key) delete query.trend;
  else query.trend = key;
  void router.replace({ query });
}

const stepCache = new Map<string, TrendStep[]>();
const stepsOf = (t: Trend): TrendStep[] => {
  const id = `${props.log.entries.length}|${props.log.entries[props.log.entries.length - 1]?.at}|${t.key}`;
  let s = stepCache.get(id);
  if (!s) stepCache.set(id, (s = trendSteps(props.log, t, NAMES)));
  return s;
};

const title = (t: Trend): string => (t.kind === "team" ? t.members.map((id) => characterShortName(id) || id).join(" · ") : NAMES.character(t.id));
const changeWords = (t: Trend): string => trendChangeText(t, fmt, (at) => dayText(at, props.now));
const slug = (key: string): string => key.replace(/[^A-Za-z0-9_-]/g, "_");
</script>

<style scoped>
.ntr {
  margin-top: 1.5rem;
}
.ntr__h {
  font-size: 1rem;
  font-weight: 700;
}
.ntr__intro {
  margin-top: 0.25rem;
  font-size: 0.84rem;
  line-height: 1.5;
  color: oklch(var(--bc) / 0.65);
}
.ntr__h4 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 1rem 0 0.45rem;
  font-size: 0.92rem;
  font-weight: 700;
}
.ntr__count {
  padding: 0.05rem 0.45rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.65);
  background: oklch(var(--bc) / 0.08);
}
.ntr__list {
  display: grid;
  gap: 0.4rem;
}
.ntr__row {
  border-radius: 0.8rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.ntr__btn {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.3rem 0.6rem;
  width: 100%;
  min-height: 44px;
  padding: 0.55rem 0.75rem;
  text-align: left;
  border-radius: 0.8rem;
}
.ntr__btn:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.ntr__who {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}
.ntr__faces {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}
.ntr__name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 650;
  font-size: 0.88rem;
}
.ntr__chev {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
  color: oklch(var(--bc) / 0.6);
}
.ntr__fig {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.7rem;
}
.ntr__nums {
  font-size: 0.84rem;
  font-variant-numeric: tabular-nums;
}
.ntr__muted {
  font-size: 0.74rem;
  color: oklch(var(--bc) / 0.65);
}
.ntr__change {
  grid-column: 1 / -1;
  font-size: 0.8rem;
  line-height: 1.4;
}
.ntr__up {
  color: oklch(var(--su));
}
.ntr__down {
  color: oklch(var(--er));
}
.ntr__note {
  grid-column: 1 / -1;
  font-size: 0.76rem;
  line-height: 1.4;
  color: oklch(var(--bc) / 0.7);
}
.ntr__body {
  padding: 0 0.75rem 0.7rem;
}
.ntr__still {
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.65);
}
.ntr__toggle {
  margin-top: 0.8rem;
  min-height: 44px;
}
</style>
