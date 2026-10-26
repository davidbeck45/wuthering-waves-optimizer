<template>
  <!-- Wuthering Tools+: one Convene pool — pity counters, the guarantee, the 50/50 record, luck and every 5★ -->
  <article class="card bg-base-200 border border-base-content/5 shadow-sm" :data-test-convene-pool="pool.poolType">
    <div class="card-body gap-4 p-4 sm:p-5">
      <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 class="text-base font-semibold">{{ pool.pool.name }}</h3>
        <span class="text-sm text-base-content/60 tabular-nums">{{ fmtInt(pool.pulls) }} pulls · {{ fmtK(pool.astrite) }} Astrite</span>
        <span v-if="pool.truncated" class="badge badge-ghost badge-sm ml-auto" title="Kuro keeps six months of records; the history most likely starts after your first pull here, so the first 5★'s pity is a lower bound">starts mid-count</span>
      </header>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div class="min-w-0">
          <!-- wraps as whole pieces on a phone at 130 % text ("30+ / 80 pity" stays together) -->
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span class="text-4xl font-semibold tabular-nums leading-none" :class="pityTone"
              ><span data-test-convene-pity5>{{ pool.pity5 }}</span
              ><span
                v-if="pool.pity5LowerBound"
                class="text-2xl text-base-content/60"
                title="your history starts mid-count with no 5★ in it yet, so the real pity is at least this"
                data-test-convene-pity5-min>+</span></span>
            <span class="whitespace-nowrap text-sm text-base-content/60">/ {{ pool.pool.hardPity5 }} pity</span>
            <span class="ml-auto whitespace-nowrap text-xs text-base-content/60 tabular-nums">{{ pool.pity5LowerBound ? "at most " : "" }}{{ pool.toHardPity5 }} to a sure 5★</span>
          </div>
          <div class="pity-track mt-2" :style="{ '--soft': `${(softPityAt / pool.pool.hardPity5) * 100}%` }" aria-hidden="true">
            <div class="pity-fill" :style="{ width: `${Math.min(100, (pool.pity5 / pool.pool.hardPity5) * 100)}%` }"></div>
          </div>
          <div class="relative mt-1 h-4 text-[0.68rem] text-base-content/45 tabular-nums" :style="{ '--soft': `${(softPityAt / pool.pool.hardPity5) * 100}%` }">
            <span class="absolute left-0">0</span>
            <span v-if="pool.pool.hardPity5 === 80" class="soft-label absolute">{{ softPityAt }}</span>
            <span class="absolute right-0">{{ pool.pool.hardPity5 }}</span>
          </div>
        </div>
        <div class="flex gap-4 sm:flex-col sm:items-end sm:gap-1 text-sm">
          <span class="tabular-nums"><span class="text-base-content/60">4★ pity</span> <b>{{ pool.pity4 }}{{ pool.pity4LowerBound ? "+" : "" }}</b>/{{ pool.pool.hardPity4 }}</span>
          <span v-if="pool.fourStars" class="tabular-nums text-base-content/60">{{ pool.fourStars }} × 4★</span>
        </div>
      </div>

      <div v-if="pool.guaranteed !== null || pool.pool.alwaysFeatured || simulatable" class="flex flex-wrap items-center gap-2">
        <span v-if="pool.guaranteed === true" class="badge badge-success gap-1 py-3" data-test-convene-guarantee="guaranteed">
          <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l4 4L19 6" /></svg>
          Next 5★ is the featured one
        </span>
        <span v-else-if="pool.guaranteed === false && pool.guaranteeKnown" class="badge badge-outline py-3" data-test-convene-guarantee="coin">Next 5★ is a 50/50</span>
        <span v-else-if="pool.guaranteed === false" class="badge badge-ghost py-3" data-test-convene-guarantee="unknown" title="your history starts mid-count and no 5★ has settled it yet">50/50 state unknown</span>
        <span v-else-if="pool.pool.alwaysFeatured" class="badge badge-ghost py-3">every 5★ is the featured weapon</span>
        <button
          v-if="simulatable"
          type="button"
          class="btn btn-sm btn-primary btn-outline ml-auto normal-case"
          :data-test-convene-use-pity="pool.poolType"
          @click="emit('simulate', pool)">
          Use my pity in the simulator
        </button>
      </div>

      <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div class="stat-cell">
          <dt>Average pity</dt>
          <dd>
            <template v-if="pool.avgPity5 != null">{{ pool.avgPity5.toFixed(1) }}</template><template v-else>—</template>
            <small v-if="pool.luck">model {{ pool.luck.modelAverage.toFixed(1) }}</small>
          </dd>
        </div>
        <div v-if="pool.fiftyFifty" class="stat-cell">
          <dt>50/50</dt>
          <dd>
            {{ pool.fiftyFifty.won }}–{{ pool.fiftyFifty.lost }}
            <small v-if="pool.fiftyFifty.winRate != null">{{ fmtPct(pool.fiftyFifty.winRate, 0) }} won</small>
          </dd>
        </div>
        <div v-if="pool.luck" class="stat-cell" title="how your 5★ pity compares with players who pulled the same number of 5★s, on the simulator's pity model">
          <dt>Luckier than</dt>
          <dd>
            <template v-if="pool.luck.percentile != null">{{ Math.round(pool.luck.percentile * 100) }}%</template><template v-else>—</template>
            <small>of players · {{ pool.luck.samples }} full count{{ pool.luck.samples === 1 ? "" : "s" }}</small>
          </dd>
        </div>
      </dl>

      <div v-if="pool.fiveStars.length" class="border-t border-base-content/10 pt-3">
        <div class="mb-2 text-xs font-medium uppercase tracking-wide text-base-content/50">5★ pulls</div>
        <ul class="flex flex-wrap gap-2">
          <li
            v-for="f in fiveStarsNewestFirst"
            :key="`${f.index}`"
            class="five-chip"
            :class="`five-chip--${f.outcome}`"
            :title="`${f.name} · pity ${f.pity}${f.lowerBound ? '+' : ''} · ${fmtRecordDate(f.time)} · ${OUTCOME[f.outcome]}`">
            <ConveneItemIcon :name="f.name" :item-key="keyOf(f)" :kind="kindOf(f)" size="sm" />
            <span class="min-w-0">
              <span class="block truncate text-xs font-medium leading-tight">{{ f.name }}</span>
              <span class="block text-[0.68rem] leading-tight tabular-nums" :class="chipPityTone(f.pity)">{{ f.pity }}{{ f.lowerBound ? "+" : "" }} pulls</span>
            </span>
            <span v-if="f.outcome === 'lost'" class="five-chip__tag">50/50 lost</span>
            <span v-else-if="f.outcome === 'won'" class="five-chip__tag five-chip__tag--won">won</span>
          </li>
        </ul>
      </div>
      <p v-else class="text-sm text-base-content/55">No 5★ on this pool yet.</p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FiveStarOutcome, FiveStarPull, PoolPity } from "../pity";
import { kindOfResourceId } from "../pools";
import { resolveItem } from "../items";
import ConveneItemIcon from "./ConveneItemIcon.vue";
import { fmtInt, fmtK, fmtPct, fmtRecordDate } from "./format";

const props = defineProps<{ pool: PoolPity; simulatable: boolean }>();
const emit = defineEmits<{ simulate: [pool: PoolPity] }>();

/** upstream's curve: flat 0.8 % to pull 65, rising from 66 */
const softPityAt = 66;

const OUTCOME: Record<FiveStarOutcome, string> = {
  won: "won the 50/50",
  lost: "lost the 50/50",
  guaranteed: "guaranteed",
  unknown: "50/50 unknown",
  featured: "featured",
  standard: "standard",
};

const fiveStarsNewestFirst = computed(() => props.pool.fiveStars.slice().reverse());

const pityTone = computed(() => {
  const p = props.pool.pity5 / props.pool.pool.hardPity5;
  return p >= 66 / 80 ? "text-warning" : "text-base-content";
});

function chipPityTone(pity: number): string {
  if (props.pool.pool.hardPity5 !== 80) return "text-base-content/60";
  if (pity <= 40) return "text-success";
  if (pity >= 70) return "text-warning";
  return "text-base-content/60";
}

function kindOf(f: FiveStarPull): "resonator" | "weapon" {
  return kindOfResourceId(f.resourceId) ?? props.pool.pool.kind;
}

function keyOf(f: FiveStarPull): string | null {
  return resolveItem(f.name, kindOf(f))?.key ?? null;
}
</script>

<style scoped>
.pity-track {
  position: relative;
  height: 0.5rem;
  border-radius: 9999px;
  background: linear-gradient(90deg, oklch(var(--bc) / 0.08) 0 var(--soft), oklch(var(--wa) / 0.18) var(--soft) 100%);
  overflow: hidden;
}
.pity-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, oklch(var(--p) / 0.75), oklch(var(--p)));
  transition: width 0.4s ease;
}
.soft-label {
  left: var(--soft);
  transform: translateX(-50%);
}
.stat-cell {
  border-radius: 0.6rem;
  padding: 0.45rem 0.6rem;
  background: oklch(var(--b1) / 0.55);
}
.stat-cell dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: oklch(var(--bc) / 0.55);
}
.stat-cell dd {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat-cell small {
  display: block;
  font-weight: 400;
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.55);
}
.five-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  max-width: 11rem;
  padding: 0.3rem 0.6rem 0.3rem 0.3rem;
  border-radius: 0.7rem;
  background: oklch(var(--b1) / 0.65);
  border: 1px solid oklch(var(--bc) / 0.06);
}
.five-chip--lost {
  border-color: oklch(var(--er) / 0.35);
}
.five-chip__tag {
  position: absolute;
  top: -0.45rem;
  right: 0.35rem;
  font-size: 0.6rem;
  line-height: 1;
  padding: 0.15rem 0.3rem;
  border-radius: 0.3rem;
  color: oklch(var(--erc, var(--b1)));
  background: oklch(var(--er));
}
.five-chip__tag--won {
  color: oklch(var(--suc, var(--b1)));
  background: oklch(var(--su));
}
</style>
