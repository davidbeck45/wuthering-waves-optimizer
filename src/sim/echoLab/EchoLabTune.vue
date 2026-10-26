<template>
  <section class="space-y-3" data-test-echo-lab-tune>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-base font-semibold">Echoes still being tuned</h2>
      <span class="badge badge-ghost">{{ rows.length }}</span>
      <EchoLabPopover id="tune" label="How Tune or Feed is worked out" align="left">
        <p>For an echo with fewer than five substat lines, the lines still to come are rolled out in full: every combination when there are few enough, otherwise a seeded simulation (the same answer every time). Each outcome is scored by the damage engine with the echo in the slot of its most promising owner.</p>
        <p><b>Chance to upgrade</b> is the share of outcomes that beat the echo in that slot today. The bar shows the 10th to 90th percentile of the gain, the tick the median, the diamond the echo as it is now.</p>
        <ul class="list-disc space-y-1 pl-4 opacity-80">
          <li v-for="a in assumptions" :key="a">{{ a }}</li>
        </ul>
      </EchoLabPopover>
      <div v-if="rows.length" class="ml-auto hidden items-center gap-3 text-xs opacity-60 sm:flex">
        <span class="flex items-center gap-1"><span class="inline-block h-2 w-5 rounded-full bg-primary/45"></span> p10–p90</span>
        <span class="flex items-center gap-1"><span class="inline-block h-3 w-[3px] rounded bg-primary"></span> median</span>
        <span class="flex items-center gap-1"><span class="inline-block size-2 rotate-45 bg-base-content"></span> now</span>
      </div>
    </div>

    <div v-if="!rows.length && !noSlot.length" class="rounded-box border border-dashed border-base-300 px-4 py-10 text-center" data-test-echo-lab-tune-empty>
      <p class="font-medium">Every echo in your inventory has all five substat lines.</p>
      <p class="mt-1 text-sm opacity-70">Add echoes you are still levelling to judge them before you spend tuners on them.</p>
      <RouterLink to="/inventory" class="btn btn-primary btn-sm mt-4">Add or scan echoes</RouterLink>
    </div>

    <ul v-if="rows.length" class="grid grid-cols-1 gap-2">
      <li
        v-for="row in rows"
        :key="row.echoId"
        class="tune-row rounded-box border border-base-300 bg-base-100 px-4 py-3"
        :data-test-echo-lab-tune-row="row.echoId">
        <div class="tune-row__echo min-w-0">
          <EchoLabEcho :echo="row.echo" :set="row.set" :cost="row.cost" :main="row.main" :rank="row.rank" :lines="row.lines" />
        </div>
        <div class="tune-row__target flex min-w-0 items-center gap-2 text-sm">
          <img :src="portrait(row.p.characterId)" :alt="characterName(row.p.characterId)" class="el-portrait size-8" loading="lazy" />
          <div class="min-w-0 leading-tight">
            <div class="truncate">{{ characterName(row.p.characterId) }}</div>
            <div class="truncate text-xs opacity-60">vs {{ slotLabel(row.p.slot).toLowerCase() }}<template v-if="replacedName(row)">: {{ replacedName(row) }}</template></div>
          </div>
        </div>
        <div class="tune-row__stats grid grid-cols-2 gap-3 text-right sm:grid-cols-[auto_auto]">
          <div>
            <div class="text-[0.65rem] uppercase tracking-wide opacity-60">Chance to upgrade</div>
            <div class="font-mono text-lg font-bold tabular-nums" data-test-echo-lab-tune-pbeat>{{ pct(row.p.pBeat, 0) }}</div>
          </div>
          <div>
            <div class="text-[0.65rem] uppercase tracking-wide opacity-60">Expected</div>
            <div class="font-mono text-lg font-bold tabular-nums" :class="row.p.expectedGain > 0 ? 'el-up' : 'opacity-70'">{{ signedPct(row.p.expectedGain, 1) }}</div>
          </div>
        </div>
        <div class="tune-row__range min-w-0">
          <div class="el-range" :title="`p10 ${signedPct(row.p.p10)} · median ${signedPct(row.p.p50)} · p90 ${signedPct(row.p.p90)}`">
            <div class="el-range__axis"></div>
            <div class="el-range__zero" :style="{ left: at(0) }"></div>
            <div class="el-range__band" :style="{ left: at(row.p.p10), width: span(row.p.p10, row.p.p90) }"></div>
            <div class="el-range__median" :style="{ left: `calc(${at(row.p.p50)} - 1.5px)` }"></div>
            <div class="el-range__now" :style="{ left: at(row.p.current) }"></div>
          </div>
          <div class="mt-0.5 flex justify-between font-mono text-[0.65rem] tabular-nums opacity-60">
            <span>{{ signedPct(row.p.p10) }}</span>
            <span>{{ signedPct(row.p.p90) }}</span>
          </div>
        </div>
        <div class="tune-row__verdict flex flex-col items-end text-right">
          <span class="el-chip" :class="`el-chip--${row.p.verdict}`" :data-test-echo-lab-tune-verdict="row.p.verdict">{{ VERDICT_TEXT[row.p.verdict] }}</span>
        </div>
        <div class="tune-row__cost text-[0.7rem] leading-tight opacity-60" :title="row.p.cost.note">
          To +25: ≈ {{ row.p.cost.tuners }} tuners · {{ compact(row.p.cost.exp) }} EXP <span class="opacity-80">(approx.)</span>
        </div>
      </li>
    </ul>

    <div v-if="noSlot.length" class="rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm" data-test-echo-lab-tune-noslot>
      <div class="mb-2 flex items-center gap-2">
        <span class="el-chip el-chip--feed">Feed</span>
        <span>{{ noSlot.length }} partly tuned echo{{ noSlot.length === 1 ? "" : "es" }} no built character can slot</span>
      </div>
      <div class="flex flex-wrap gap-3">
        <EchoLabEcho v-for="row in noSlot" :key="row.echoId" :echo="row.echo" :set="row.set" :cost="row.cost" :main="row.main" :rank="row.rank" :lines="row.lines" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Tune or Feed" tab: echoes with fewer than five lines, what they can still become
// in their most promising owner's slot (echoPotential.ts, run during the pass), on one shared gain axis.
import { computed } from "vue";
import type { BestOwnerResult, EchoVerdict } from "./bestOwner";
import { POTENTIAL_ASSUMPTIONS, type EchoPotentialResult, type PotentialVerdict } from "./echoPotential";
import EchoLabEcho from "./EchoLabEcho.vue";
import EchoLabPopover from "./EchoLabPopover.vue";
import { characterName, compact, echoName, pct, portrait, signedPct, slotLabel } from "./echoLabView";

const props = defineProps<{ result: BestOwnerResult }>();
const assumptions = POTENTIAL_ASSUMPTIONS;

const VERDICT_TEXT: Record<PotentialVerdict, string> = { tune: "Tune", gamble: "Gamble", feed: "Feed", done: "Done" };
const ORDER: Record<PotentialVerdict, number> = { tune: 0, gamble: 1, feed: 2, done: 3 };

type Row = EchoVerdict & { p: EchoPotentialResult };
const rows = computed<Row[]>(() =>
  props.result.echoes
    .filter((e): e is Row => e.lines < 5 && e.potential !== null)
    .map((e) => ({ ...e, p: e.potential as EchoPotentialResult }))
    .sort((a, b) => ORDER[a.p.verdict] - ORDER[b.p.verdict] || b.p.pBeat - a.p.pBeat || b.p.expectedGain - a.p.expectedGain),
);
const noSlot = computed(() => props.result.echoes.filter((e) => e.lines < 5 && !e.potential));

const characterById = computed(() => new Map(props.result.characters.map((c) => [c.id, c])));
const replacedName = (row: Row): string | null => {
  const key = characterById.value.get(row.p.characterId)?.slots[row.p.slot]?.echo;
  return key ? echoName(key) : null;
};

// one gain axis for every row, so the bars compare: the widest p10–p90 seen, at least ±2 %, at most ±25 %
const bounds = computed(() => {
  const lo = Math.max(-0.25, Math.min(-0.02, ...rows.value.map((r) => Math.min(r.p.p10, r.p.current))));
  const hi = Math.min(0.25, Math.max(0.02, ...rows.value.map((r) => Math.max(r.p.p90, r.p.current))));
  return { lo, hi };
});
const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const at = (g: number): string => `${(clamp((g - bounds.value.lo) / (bounds.value.hi - bounds.value.lo)) * 100).toFixed(2)}%`;
const span = (a: number, b: number): string => `max(4px, ${((clamp((b - bounds.value.lo) / (bounds.value.hi - bounds.value.lo)) - clamp((a - bounds.value.lo) / (bounds.value.hi - bounds.value.lo))) * 100).toFixed(2)}%)`;
</script>

<style scoped>
.tune-row {
  display: grid;
  grid-template-columns: minmax(12rem, 1.3fr) minmax(10rem, 1fr) auto minmax(10rem, 1.3fr) 9.5rem;
  grid-template-areas:
    "echo target stats range verdict"
    "echo target stats range cost";
  align-items: center;
  column-gap: 1rem;
  row-gap: 0.25rem;
}
.tune-row__echo {
  grid-area: echo;
}
.tune-row__target {
  grid-area: target;
}
.tune-row__stats {
  grid-area: stats;
}
.tune-row__range {
  grid-area: range;
}
.tune-row__verdict {
  grid-area: verdict;
  align-self: end;
}
.tune-row__cost {
  grid-area: cost;
  align-self: start;
  text-align: right;
}
@media (max-width: 1023px) {
  .tune-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "echo verdict"
      "target stats"
      "range range"
      "cost cost";
    row-gap: 0.75rem;
  }
  .tune-row__verdict {
    align-self: start;
  }
  .tune-row__cost {
    text-align: left;
    margin-top: -0.4rem;
  }
}
@media (max-width: 639px) {
  .tune-row {
    grid-template-areas:
      "echo verdict"
      "target target"
      "stats stats"
      "range range"
      "cost cost";
  }
  .tune-row__stats {
    text-align: left;
  }
}
</style>
