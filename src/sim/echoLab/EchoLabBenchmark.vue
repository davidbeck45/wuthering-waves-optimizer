<template>
  <section class="space-y-3" data-test-echo-lab-benchmark>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-base font-semibold">Build benchmark</h2>
      <EchoLabPopover id="benchmark" label="What the benchmark score means" align="left">
        <p>Your echo substats, measured against three builds the damage engine makes for the same character: same weapon, chains, main stats, sets and main echo, on the same best rotation.</p>
        <ul class="space-y-1.5">
          <li><b>0 %, B (blank):</b> every substat line removed.</li>
          <li><b>100 %, R (reference):</b> a realistic spread, Riley31415's ChemX32 from wuwa_calc: 5 / 5 / 2 / 2 / 2 median rolls on Crit Rate, Crit DMG and the three stats this build values most, plus one median roll of every other stat.</li>
          <li><b>200 %, P (perfect):</b> 25 best-tier rolls, each placed where the engine gains most, at most one line of a stat per echo.</li>
        </ul>
        <p>Score = (D − B) / (R − B) below the reference, 1 + (D − R) / (P − R) above it, where D is your build.</p>
        <p class="opacity-70">Compare builds of one character, not characters with each other. Team buffs are worth nothing to a damage engine, so supports read low. Energy Regen is a floor: up to the need wuwa_calc measures in the character's saved teams (the Energy check) every build scores damage × (1 − ER deficit), and the reference spends its ER rolls there first.</p>
      </EchoLabPopover>
      <div class="ml-auto flex items-center gap-2">
        <span v-if="status.ms !== null && result && !status.running" class="text-xs opacity-60">{{ status.cached ? "cached" : `${(status.ms / 1000).toFixed(1)} s` }}</span>
        <button type="button" class="btn btn-sm" :disabled="status.running" data-test-echo-lab-benchmark-run @click="emit('run', true)">
          {{ result ? "Re-run" : "Benchmark all" }}
        </button>
      </div>
    </div>

    <div v-if="status.running" class="rounded-box border border-base-300 bg-base-100 px-4 py-3" data-test-echo-lab-benchmark-progress>
      <div class="mb-1 flex items-center justify-between text-sm">
        <span>Benchmarking {{ status.progress?.label ?? "builds" }}…</span>
        <span class="font-mono text-xs tabular-nums opacity-60">{{ status.progress?.done ?? 0 }} / {{ status.progress?.total ?? "…" }}</span>
      </div>
      <progress class="progress progress-primary w-full" :value="status.progress?.done ?? 0" :max="status.progress?.total || 1"></progress>
    </div>
    <div v-if="status.error" class="alert alert-error text-sm">{{ status.error }}</div>

    <div v-if="rows.length" class="bench-row bench-row--axis px-4 font-mono text-[0.65rem] uppercase tracking-wide opacity-60" aria-hidden="true">
      <span class="bench-row__who font-sans font-semibold">Character · best rotation</span>
      <span class="bench-row__bar relative flex justify-between">
        <span>B 0 %</span><span class="absolute left-1/2 -translate-x-1/2">R 100 %</span><span>P 200 %</span>
      </span>
      <span class="bench-row__score text-right font-sans font-semibold">Score</span>
    </div>
    <ul v-if="rows.length" class="grid grid-cols-1 gap-2">
      <li
        v-for="r in rows"
        :key="r.characterId"
        class="bench-row cursor-pointer rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:border-base-content/20"
        :data-test-echo-lab-benchmark-row="r.characterId"
        @click="open = open === r.characterId ? null : r.characterId">
        <div class="bench-row__who flex min-w-0 items-center gap-3">
          <img :src="portrait(r.characterId)" :alt="characterName(r.characterId)" class="el-portrait size-10" loading="lazy" />
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-1.5">
              <span class="truncate font-semibold">{{ characterName(r.characterId) }}</span>
              <EnergyChip v-if="r.erNeed != null" :check="checkOf(r.erNeed, r.erHave)" :character-id="r.characterId" label="ER" mini note="Scores count Energy Regen up to this need (damage × (1 − ER deficit))" data-test-echo-lab-benchmark-er />
            </div>
            <div class="truncate text-xs opacity-60" :title="r.rotationName">{{ r.rotationName }}</div>
          </div>
        </div>
        <div class="bench-row__bar min-w-0">
          <div class="el-score-track" role="meter" :aria-valuenow="Math.round((r.score ?? 0) * 100)" aria-valuemin="0" aria-valuemax="200" :aria-label="`${characterName(r.characterId)} benchmark`">
            <div class="el-score-fill" :class="`el-score-fill--${scoreBand(r.score)}`" :style="{ width: `${((r.score ?? 0) / 2) * 100}%` }"></div>
            <div class="el-score-mark" style="left: 50%" title="100 % = the reference spread"></div>
          </div>
        </div>
        <div class="bench-row__score text-right">
          <div class="font-mono text-2xl font-extrabold tabular-nums leading-none" :class="`el-score-text--${scoreBand(r.score)}`" data-test-echo-lab-benchmark-score>
            {{ r.score === null ? "—" : pct(r.score, 0) }}
          </div>
          <div class="mt-1 text-[0.7rem] tabular-nums opacity-60">{{ compact(r.D) }} vs R {{ compact(r.R) }}</div>
        </div>
        <div v-if="open === r.characterId" class="bench-row__detail cursor-default" @click.stop>
          <table class="w-full max-w-3xl text-sm tabular-nums">
            <thead>
              <tr class="text-[0.65rem] uppercase tracking-wide opacity-60">
                <th class="pb-1 text-left font-semibold">Substat</th>
                <th class="pb-1 text-right font-semibold">Yours</th>
                <th class="pb-1 text-right font-semibold">Reference</th>
                <th class="pb-1 text-right font-semibold">Perfect</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in spreadRows(r)" :key="s.key" class="border-t border-base-200">
                <td class="py-1">
                  <span class="flex items-center gap-1.5">
                    <img v-if="substatIcon(s.key)" :src="substatIcon(s.key) ?? undefined" alt="" class="el-icon" loading="lazy" />{{ s.label }}
                    <span v-if="r.named.includes(s.key)" class="badge badge-ghost badge-xs">valued</span>
                  </span>
                </td>
                <td class="py-1 text-right font-mono text-xs">{{ s.yours }}</td>
                <td class="py-1 text-right font-mono text-xs opacity-70">{{ s.reference }}</td>
                <td class="py-1 text-right font-mono text-xs opacity-70">{{ s.perfect }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-xs opacity-60">Rolls × the value of one roll (yours: the average of your lines). Damage per rotation: B {{ compact(r.B) }} · R {{ compact(r.R) }} · P {{ compact(r.P) }} · you {{ compact(r.D) }}.</p>
        </div>
      </li>
    </ul>
    <div v-if="result?.errors.length" class="text-xs opacity-60">
      Not benchmarked: <span v-for="(e, i) in result.errors" :key="e.id">{{ characterName(e.id) }} ({{ e.reason }}){{ i < result.errors.length - 1 ? ", " : "" }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Build benchmark" tab: each built character's echo substats on a 0–200 % scale
// against engine-made blank / reference / perfect spreads (benchmarkScore.ts; one worker job for everyone).
import { computed, ref } from "vue";
import { SUBSTAT_KEYS, SUBSTAT_LABELS, isFlatSubstat, type SubstatKey } from "../substats/substatWeights";
import type { BenchmarkResult, SpreadLine } from "./benchmarkScore";
import type { BenchmarkBatchResult } from "./pass";
import EchoLabPopover from "./EchoLabPopover.vue";
import EnergyChip from "../energy/EnergyChip.vue";
import { checkOf } from "../energy/energyNeed";
import { characterName, compact, pct, portrait, scoreBand, substatIcon } from "./echoLabView";
import type { JobStatus } from "./useEchoLab";

const props = defineProps<{ result: BenchmarkBatchResult | null; status: JobStatus }>();
// eslint-disable-next-line no-unused-vars -- the parameters of an emit signature
const emit = defineEmits<{ (e: "run", force: boolean): void }>();
const open = ref<string | null>(null);

const rows = computed<BenchmarkResult[]>(() => [...(props.result?.results ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)));

const cell = (line: SpreadLine | undefined): string => {
  if (!line) return "—";
  const v = isFlatSubstat(line.key) ? Math.round(line.total) : `${(Math.round(line.total * 10) / 10).toFixed(1)}%`;
  return `${line.rolls}× · ${v}`;
};
function spreadRows(r: BenchmarkResult): Array<{ key: SubstatKey; label: string; yours: string; reference: string; perfect: string }> {
  const find = (list: SpreadLine[], key: SubstatKey): SpreadLine | undefined => list.find((l) => l.key === key);
  return SUBSTAT_KEYS.filter((k) => find(r.yours, k) || find(r.reference, k) || find(r.perfect, k) || r.named.includes(k))
    .map((key) => ({ key, label: SUBSTAT_LABELS[key], yours: cell(find(r.yours, key)), reference: cell(find(r.reference, key)), perfect: cell(find(r.perfect, key)) }))
    .sort((a, b) => Number(r.named.includes(b.key)) - Number(r.named.includes(a.key)));
}
</script>

<style scoped>
.bench-row {
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) minmax(12rem, 2fr) 8rem;
  align-items: center;
  gap: 1rem;
}
.bench-row__detail {
  grid-column: 1 / -1;
}
.bench-row--axis {
  margin-bottom: -0.25rem;
}
@media (max-width: 767px) {
  .bench-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "who score"
      "bar bar";
    gap: 0.6rem;
  }
  .bench-row__who {
    grid-area: who;
  }
  .bench-row__score {
    grid-area: score;
  }
  .bench-row__bar {
    grid-area: bar;
  }
  .bench-row--axis {
    grid-template-areas: "bar bar";
  }
  .bench-row--axis .bench-row__who,
  .bench-row--axis .bench-row__score {
    display: none;
  }
}
</style>
