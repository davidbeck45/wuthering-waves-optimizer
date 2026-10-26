<template>
  <div class="mr-kpis" data-test-my-rankings-account>
    <div class="mr-kpi">
      <div class="mr-kpi__label"><span class="max-md:hidden">Characters set up</span><span class="md:hidden">Set up</span></div>
      <div class="mr-kpi__value">
        {{ summary.owned }}<span class="mr-kpi__of">/ {{ summary.characters }}</span>
      </div>
      <div class="mr-kpi__meter"><span :style="{ width: ratio(summary.owned, summary.characters) }"></span></div>
      <div class="mr-kpi__sub">armed, of {{ summary.characters }} in the calculator</div>
    </div>
    <div class="mr-kpi">
      <div class="mr-kpi__label">At S6</div>
      <div class="mr-kpi__value">
        {{ summary.s6 }}<span class="mr-kpi__of">/ {{ summary.owned }}</span>
      </div>
      <div class="mr-kpi__meter mr-kpi__meter--gold"><span :style="{ width: ratio(summary.s6, summary.owned) }"></span></div>
      <div class="mr-kpi__sub">of your set-up characters</div>
    </div>
    <div class="mr-kpi">
      <div class="mr-kpi__label"><span class="max-md:hidden">Echoes equipped</span><span class="md:hidden">Echoes</span></div>
      <div class="mr-kpi__value">
        {{ echoes.equipped }}<span class="mr-kpi__of">/ {{ echoes.total }}</span>
      </div>
      <div class="mr-kpi__meter"><span :style="{ width: ratio(echoes.equipped, echoes.total) }"></span></div>
      <div class="mr-kpi__sub">of the echoes in your inventory</div>
    </div>
    <div class="mr-kpi">
      <div class="mr-kpi__label"><span class="max-md:hidden">Teams fieldable</span><span class="md:hidden">Teams</span></div>
      <div class="mr-kpi__value">
        {{ summary.teamsFieldable }}<span class="mr-kpi__of">/ {{ summary.teams }}</span>
      </div>
      <div class="mr-kpi__meter"><span :style="{ width: ratio(summary.teamsFieldable, summary.teams) }"></span></div>
      <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash() }" class="mr-kpi__link" data-test-my-rankings-open-mine>
        Rankings at my account
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </RouterLink>
    </div>
    <div class="mr-kpi mr-kpi--status" :data-status="status.state" data-test-my-rankings-status>
      <div class="mr-kpi__label">Data</div>
      <div class="mr-kpi__value mr-kpi__value--status">
        <span class="mr-dot" :class="`mr-dot--${status.state}`" aria-hidden="true"></span>
        {{ statusLabel }}
      </div>
      <div class="mr-kpi__meter mr-kpi__meter--status">
        <span :style="{ width: status.state === 'scoring' ? ratio(status.done, status.total) : '100%' }"></span>
      </div>
      <div class="mr-kpi__sub" data-test-my-rankings-progress :title="status.state === 'scoring' ? status.label : undefined">{{ statusSub }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the /my-rankings KPI header: the Account State (src/sim/account) as tiles, plus the
// state of the numbers below (live, scoring, restored from this tab's cache).
import { computed, onBeforeUnmount, ref } from "vue";
import { rankingsMineHash, type AccountState } from "../account/accountState";
import { ago } from "./format";

export interface RankingStatus {
  state: "live" | "scoring" | "idle";
  done: number;
  total: number;
  label: string;
  computedAt: string | null;
  /** restored from this tab's sessionStorage, not scored on this visit */
  restored: boolean;
}

const props = defineProps<{ account: AccountState; status: RankingStatus }>();
const summary = computed(() => props.account.summary);
const echoes = computed(() => props.account.echoes);
const ratio = (n: number, of: number): string => `${of > 0 ? Math.min(100, (n / of) * 100) : 0}%`;

// "scored 3 min ago" ticks over while the page is open
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 30000);
onBeforeUnmount(() => clearInterval(timer));

const statusLabel = computed(() => (props.status.state === "scoring" ? "Scoring" : props.status.state === "live" ? "Live" : "Not scored"));
const statusSub = computed(() => {
  const s = props.status;
  if (s.state === "scoring") return `${s.done} / ${s.total || "…"}${s.label && s.label !== "done" ? ` · ${s.label}` : ""}`;
  if (s.state === "live" && s.computedAt) return `your builds as saved · scored ${ago(s.computedAt, now.value)}${s.restored ? " (this tab)" : ""}`;
  return "press Rank my roster";
});
</script>

<style scoped>
.mr-kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.6rem;
}
.mr-kpi {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.7rem 0.85rem 0.75rem;
  border-radius: 0.8rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.mr-kpi__label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: oklch(var(--bc) / 0.55);
}
.mr-kpi__value {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.15;
}
.mr-kpi__value--status {
  align-items: center;
  font-family: inherit;
  font-size: 1.15rem;
  min-height: 1.67rem;
}
.mr-kpi__of {
  font-size: 0.8rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.45);
}
.mr-kpi__meter {
  height: 0.22rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.08);
  overflow: hidden;
}
.mr-kpi__meter > span {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p));
  transition: width 0.3s ease;
}
.mr-kpi__meter--gold > span {
  background: #e0ac46;
}
.mr-kpi__meter--status > span {
  background: oklch(var(--su));
}
[data-status="scoring"] .mr-kpi__meter--status > span {
  background: oklch(var(--in));
}
[data-status="idle"] .mr-kpi__meter--status > span {
  background: oklch(var(--bc) / 0.2);
}
.mr-kpi__sub,
.mr-kpi__link {
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mr-kpi__link {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: oklch(var(--p));
}
.mr-kpi__link:hover {
  text-decoration: underline;
}
.mr-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 9999px;
  flex-shrink: 0;
  background: oklch(var(--bc) / 0.3);
}
.mr-dot--live {
  background: oklch(var(--su));
  box-shadow: 0 0 0 3px oklch(var(--su) / 0.2);
}
.mr-dot--scoring {
  background: oklch(var(--in));
  animation: mr-pulse 1s ease-in-out infinite;
}
@keyframes mr-pulse {
  50% {
    box-shadow: 0 0 0 5px oklch(var(--in) / 0.15);
  }
}
@media (max-width: 1023px) {
  .mr-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
/* phones: four compact tiles (label + value) and the data state as one line under them */
@media (max-width: 767px) {
  .mr-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
  }
  .mr-kpi {
    padding: 0.45rem 0.45rem 0.5rem;
    gap: 0.15rem;
    border-radius: 0.65rem;
  }
  .mr-kpi__label {
    font-size: 0.55rem;
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mr-kpi__value {
    font-size: 0.95rem;
    flex-wrap: wrap;
    column-gap: 0.15rem;
    row-gap: 0;
  }
  .mr-kpi__of {
    font-size: 0.58rem;
  }
  .mr-kpi__sub,
  .mr-kpi__link {
    display: none;
  }
  .mr-kpi--status {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.65rem;
  }
  .mr-kpi--status .mr-kpi__label,
  .mr-kpi--status .mr-kpi__meter {
    display: none;
  }
  .mr-kpi--status .mr-kpi__value--status {
    font-size: 0.85rem;
    min-height: 0;
    flex-shrink: 0;
  }
  .mr-kpi--status .mr-kpi__sub {
    display: block;
    min-width: 0;
  }
}
</style>
