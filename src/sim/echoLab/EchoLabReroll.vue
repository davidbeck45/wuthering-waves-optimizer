<template>
  <section class="reroll grid grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]" data-test-echo-lab-reroll>
    <!-- character picker: a rail on desktop, a wrapping grid of portraits on a phone -->
    <nav class="min-w-0" aria-label="Characters">
      <div class="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">Built characters <span class="font-normal normal-case tracking-normal lg:hidden">· swipe for more</span></div>
      <ul ref="rail" class="reroll__rail flex gap-1.5 max-lg:-mx-1 max-lg:snap-x max-lg:overflow-x-auto max-lg:px-1 max-lg:py-1 lg:flex-col lg:gap-1">
        <li v-for="c in characters" :key="c.id" class="shrink-0 snap-start">
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg text-left transition-colors lg:w-full lg:px-2 lg:py-1.5"
            :class="c.id === selected ? 'bg-primary/15 ring-2 ring-primary lg:ring-1' : 'hover:bg-base-200'"
            :aria-pressed="c.id === selected"
            :title="characterName(c.id)"
            :data-test-echo-lab-reroll-character="c.id"
            @click="selected = c.id">
            <img :src="portrait(c.id)" :alt="characterName(c.id)" class="el-portrait size-10 lg:size-8" loading="lazy" />
            <span class="hidden min-w-0 flex-1 truncate text-sm lg:block">{{ characterName(c.id) }}</span>
            <span v-if="scoreOf(c.id) !== null" class="hidden font-mono text-xs tabular-nums lg:block" :class="`el-score-text--${scoreBand(scoreOf(c.id))}`">{{ pct(scoreOf(c.id) ?? 0, 0) }}</span>
          </button>
        </li>
      </ul>
    </nav>

    <div v-if="current" class="min-w-0 space-y-3">
      <header class="flex flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
        <img :src="portrait(current.id)" alt="" class="el-portrait size-11" />
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold leading-tight">{{ characterName(current.id) }}</h2>
          <p class="text-xs opacity-60 max-sm:line-clamp-2 sm:truncate" :title="current.rotationName">{{ compact(current.base) }} avg per rotation · {{ current.rotationName }}</p>
        </div>
        <div v-if="loadingCount" class="flex items-center gap-2 text-xs opacity-70" data-test-echo-lab-reroll-loading>
          <span class="loading loading-spinner loading-xs"></span> Simulating {{ loadingCount }} echo{{ loadingCount === 1 ? "" : "es" }}…
        </div>
        <EchoLabPopover id="reroll" label="How the re-roll advice is worked out">
          <p>Each line's <b>worth</b> is the damage the build loses without it. <b>Fresh</b> is what a brand-new random line in its place is worth on average: every open stat at every tier, weighted by Kuro's published tier odds, scored by the damage engine.</p>
          <p>A line worth less than a fresh roll is worth re-rolling. The plans lock the most valuable lines and re-roll the rest; you keep the old lines when the new ones are worse.</p>
          <ul class="list-disc space-y-1 pl-4 opacity-80">
            <li v-for="a in REROLL_ASSUMPTIONS" :key="a">{{ a }}</li>
          </ul>
        </EchoLabPopover>
        <p v-if="erLine" class="w-full text-xs leading-snug" :class="erLine.short ? 'el-er-short' : 'opacity-70'" data-test-echo-lab-reroll-er>
          {{ erLine.text }}<template v-if="erLine.short"> An Energy Regen line the build needs is never re-rolled.</template>
        </p>
        <p class="w-full text-xs leading-snug opacity-70" data-test-echo-lab-reroll-legend>
          <b>Worth</b> = the damage the build loses without that line. <b>Fresh</b> = what a new random line in its place adds on average. The chips follow the plan under each echo: <b>Re-roll</b> marks the lines it replaces, <b>Lock</b> the ones it keeps. A plan can re-roll a line worth a little more than a fresh roll when locking it too would cost another Transducer.
        </p>
      </header>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <article
          v-for="slot in slots"
          :key="slot.slot"
          class="flex min-w-0 flex-col rounded-box border bg-base-100 p-3"
          :class="slot.slot === firstSlot ? 'border-primary/60' : 'border-base-300'"
          :data-test-echo-lab-reroll-echo="slot.slot">
          <div class="mb-2 flex items-start justify-between gap-2">
            <EchoLabEcho :echo="slot.echo" :set="slot.set" :cost="slot.cost" :main="slot.main" :rank="slot.rank" :lines="slot.lines.length" />
            <div class="flex shrink-0 flex-col items-end gap-1">
              <span class="text-[0.65rem] uppercase tracking-wide opacity-60">{{ slotLabel(slot.slot) }}</span>
              <span v-if="slot.slot === firstSlot" class="el-chip el-chip--reroll" data-test-echo-lab-reroll-first>Re-roll first</span>
            </div>
          </div>

          <template v-if="slot.lines.length < 5">
            <p class="rounded-lg bg-base-200 px-3 py-2 text-sm opacity-80">{{ slot.lines.length }} of 5 lines: finish tuning it first (see Tune or Feed).</p>
          </template>
          <template v-else-if="adviceOf(slot.slot) && 'error' in adviceOf(slot.slot)!">
            <p class="rounded-lg bg-base-200 px-3 py-2 text-sm text-error">{{ (adviceOf(slot.slot) as { error: string }).error }}</p>
          </template>
          <template v-else>
            <!-- table-fixed: the line cell truncates instead of widening the card; below sm Fresh sits under Worth -->
            <table class="reroll__lines w-full table-fixed text-sm">
              <thead>
                <tr class="text-[0.65rem] uppercase tracking-wide opacity-60">
                  <th class="pb-1 text-left align-bottom font-semibold">Line</th>
                  <th class="w-[4.1rem] pb-1 text-right align-bottom font-semibold sm:w-[4.75rem]" title="what the build loses without this line">Worth<span class="block font-normal normal-case tracking-normal sm:hidden">fresh</span></th>
                  <th class="w-[4.75rem] pb-1 text-right align-bottom font-semibold max-sm:hidden" title="what a fresh random line in its place is worth on average">Fresh</th>
                  <th class="w-[3.2rem] pb-1 text-right align-bottom font-semibold sm:w-[6.25rem]"><span class="sr-only">Advice</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in linesFor(slot)" :key="line.key" class="border-t border-base-200" :data-test-echo-lab-reroll-line="line.chip ?? 'pending'" :data-test-echo-lab-reroll-er-floor="line.erFloor ? '' : undefined">
                  <td class="py-1 pr-1">
                    <span class="flex min-w-0 items-center gap-1.5">
                      <img v-if="substatIcon(line.key)" :src="substatIcon(line.key) ?? undefined" alt="" class="el-icon" loading="lazy" />
                      <span class="truncate">{{ lineText(line.key, line.value) }}</span>
                    </span>
                  </td>
                  <td class="py-1 text-right font-mono text-xs tabular-nums">
                    <span class="block">{{ line.worth === null ? "…" : signedPct(line.worth, 2) }}</span>
                    <span class="block opacity-60 sm:hidden">{{ line.fresh === null ? "…" : signedPct(line.fresh, 2) }}</span>
                  </td>
                  <td class="py-1 pl-2 text-right font-mono text-xs tabular-nums opacity-70 max-sm:hidden">{{ line.fresh === null ? "…" : signedPct(line.fresh, 2) }}</td>
                  <td class="py-1 pl-1 text-right sm:pl-2">
                    <!-- the chips follow the plan headlined under the table (planChips): its re-rolled lines, numbered, and its locks -->
                    <span v-if="line.chip === 'reroll'" class="el-chip el-chip--reroll max-sm:px-1.5" :title="`Re-roll this line (${ordinal(line.order ?? 1)} of the plan's ${planOf(slot.slot)?.rerolledFields.length ?? 1})`" :aria-label="`Re-roll, line ${line.order} of the plan`">
                      <svg viewBox="0 0 24 24" class="size-3 sm:hidden" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg><span class="max-sm:hidden">Re-roll</span><span class="opacity-60">#{{ line.order }}</span>
                    </span>
                    <span v-else-if="line.chip === 'lock'" class="el-chip el-chip--lock max-sm:px-1.5" :aria-label="line.erFloor ? 'Lock: the build needs this Energy Regen' : 'Lock'" :title="line.erFloor ? 'Lock: without this line the build falls under its Energy Regen need' : 'Lock this line when you re-roll'">
                      <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg><span class="max-sm:hidden">Lock</span><span v-if="line.erFloor" class="text-[0.65rem]">ER</span>
                    </span>
                    <span v-else-if="line.chip === 'keep'" class="el-chip el-chip--lock max-sm:px-1.5" aria-label="Keep: no re-roll pays on this echo" title="Keep: no re-roll pays on this echo">
                      <svg viewBox="0 0 24 24" class="size-3 sm:hidden" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span class="max-sm:hidden">Keep</span>
                    </span>
                    <span v-else class="loading loading-dots loading-xs opacity-50"></span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="erFloorNote(slot)" class="mt-1 text-xs leading-snug opacity-80" data-test-echo-lab-reroll-er-note>
              {{ erFloorNote(slot) }}
            </p>

            <div v-if="resultOf(slot.slot)" class="mt-auto pt-3">
              <div v-if="planOf(slot.slot)" class="rounded-lg bg-base-200 px-3 py-2 text-sm" data-test-echo-lab-reroll-plan>
                <div class="font-semibold">{{ planTitle(planOf(slot.slot)!) }}</div>
                <div class="text-xs" data-test-echo-lab-reroll-plan-lines>{{ planLinesText(planOf(slot.slot)!, resultOf(slot.slot)!.lines) }}</div>
                <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums opacity-80">
                  <span>{{ pct(planOf(slot.slot)!.pImprove, 0) }} to improve</span>
                  <span class="el-up">{{ signedPct(planOf(slot.slot)!.expectedGain, 2) }} expected</span>
                  <span>{{ planOf(slot.slot)!.cost }} Transducer{{ planOf(slot.slot)!.cost === 1 ? "" : "s" }} / try</span>
                  <span v-if="planOf(slot.slot)!.transducersPerSuccess">≈ {{ planOf(slot.slot)!.transducersPerSuccess!.toFixed(1) }} Transducers per success</span>
                </div>
              </div>
              <div v-else class="rounded-lg bg-base-200 px-3 py-2 text-sm opacity-80" data-test-echo-lab-reroll-keep>Keep as is: no re-roll gains even 0.05 % on average.</div>
              <details class="reroll__plans mt-2 text-xs">
                <summary class="cursor-pointer select-none opacity-70 hover:opacity-100">All lock plans</summary>
                <table class="mt-1 w-full table-fixed tabular-nums">
                  <thead>
                    <tr class="align-bottom leading-tight opacity-60">
                      <!-- below lg a card is too narrow for the long headers ("Transducers" broke mid-word): one short
                      word each, spelled out in the line under the table -->
                      <th class="w-[3.5rem] pb-1 text-left font-medium"><span class="max-lg:hidden">Lines locked</span><span class="lg:hidden">Locks</span></th>
                      <th class="pb-1 text-right font-medium"><span class="max-lg:hidden">Transducers a try</span><span class="lg:hidden">Cost</span></th>
                      <th class="pb-1 text-right font-medium"><span class="max-lg:hidden">Chance to improve</span><span class="lg:hidden">Odds</span></th>
                      <th class="pb-1 text-right font-medium"><span class="max-lg:hidden">Expected gain</span><span class="lg:hidden">Gain</span></th>
                      <th class="pb-1 text-right font-medium"><span class="max-lg:hidden">Transducers per success</span><span class="lg:hidden">Per win</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in resultOf(slot.slot)!.plans" :key="p.locks" :class="{ 'font-semibold text-primary': p === planOf(slot.slot) }">
                      <td>{{ p.locks }}</td>
                      <td class="text-right">{{ p.cost }}</td>
                      <td class="text-right">{{ pct(p.pImprove, 0) }}</td>
                      <td class="text-right">{{ signedPct(p.expectedGain, 2) }}</td>
                      <td class="text-right">{{ p.transducersPerSuccess ? p.transducersPerSuccess.toFixed(1) : "—" }}</td>
                    </tr>
                  </tbody>
                </table>
                <p class="mt-1 opacity-60 lg:hidden" data-test-echo-lab-reroll-plans-legend>
                  Locks = lines locked · Cost = Transducers a try · Odds = chance to improve · Gain = expected damage gain · Per win = Transducers per success.
                </p>
                <p class="mt-1 opacity-60">Expected gain keeps the better of the old and new lines. Transducer costs per lock count: verify in game.</p>
              </details>
            </div>
          </template>
        </article>
        <article v-for="n in emptySlots" :key="`empty-${n}`" class="grid place-items-center rounded-box border border-dashed border-base-300 p-6 text-sm opacity-60">Empty slot</article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Re-roll advisor" tab: a built character's five echoes, each line marked lock or
// re-roll against the expected worth of a fresh line, with the lock plan that pays best per Transducer
// (rerollAdvice.ts, one worker job per echo, run when the character is picked and cached per account state).
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { BestOwnerResult, LabCharacterSummary, LabSlotSummary } from "./bestOwner";
import type { BenchmarkBatchResult } from "./pass";
import { REROLL_ASSUMPTIONS, type LockPlan, type RerollAdviceResult } from "./rerollAdvice";
import { pickRerollFirst, planChips, type PlanChip } from "./rerollPick";
import EchoLabEcho from "./EchoLabEcho.vue";
import EchoLabPopover from "./EchoLabPopover.vue";
import { shortBy, showNeed } from "../energy/energyNeed";
import { characterName, compact, erFloorLine, lineText, pct, planLinesText, portrait, scoreBand, signedPct, slotLabel, substatIcon, worthwhilePlan } from "./echoLabView";
import { useEchoLab } from "./useEchoLab";

const props = defineProps<{ result: BestOwnerResult; benchmarks: BenchmarkBatchResult | null; preferred?: string | null }>();
const selected = defineModel<string | null>("character", { default: null });
const lab = useEchoLab();

const characters = computed<LabCharacterSummary[]>(() => [...props.result.characters].sort((a, b) => b.base - a.base));
const current = computed(() => characters.value.find((c) => c.id === selected.value) ?? null);
const slots = computed(() => (current.value?.slots ?? []).filter((s): s is LabSlotSummary => s !== null));
const emptySlots = computed(() => 5 - slots.value.length);

// pick a character: the one asked for (link / calculator), else the strongest build
watch(
  characters,
  (list) => {
    if (selected.value && list.some((c) => c.id === selected.value)) return;
    const wanted = props.preferred && list.some((c) => c.id === props.preferred) ? props.preferred : null;
    selected.value = wanted ?? list[0]?.id ?? null;
  },
  { immediate: true },
);

// on a phone the picker is a swipe strip: keep the picked portrait in view (horizontally only, never the page)
const rail = ref<HTMLElement | null>(null);
watch(
  selected,
  async (id) => {
    await nextTick();
    const strip = rail.value;
    if (!strip || strip.scrollWidth <= strip.clientWidth || !id) return;
    const button = strip.querySelector<HTMLElement>(`[data-test-echo-lab-reroll-character="${id}"]`);
    if (button) strip.scrollLeft = button.offsetLeft - strip.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2;
  },
  { immediate: true },
);

const scoreOf = (id: string): number | null => props.benchmarks?.results.find((r) => r.characterId === id)?.score ?? null;

const adviceOf = (slot: number): RerollAdviceResult | { error: string } | null => (current.value ? lab.rerollOf(current.value.id, slot) : null);
const resultOf = (slot: number): RerollAdviceResult | null => {
  const a = adviceOf(slot);
  return a && !("error" in a) ? a : null;
};

const planOf = (slot: number): LockPlan | null => worthwhilePlan(resultOf(slot)?.recommended);

const loadingCount = computed(() => slots.value.filter((s) => s.lines.length >= 5 && !adviceOf(s.slot)).length);

/** the echo whose best plan pays most per Transducer (pickRerollFirst, the calculator panel's rule), once all are in */
const firstSlot = computed<number | null>(() => {
  if (loadingCount.value) return null;
  const advices = slots.value.map((s) => resultOf(s.slot)).filter((r): r is RerollAdviceResult => r !== null);
  return pickRerollFirst(advices)?.slot ?? null;
});

interface LineRow {
  key: string;
  value: number;
  worth: number | null;
  fresh: number | null;
  /** the chip, from the plan the card headlines (planChips); null while the advice runs */
  chip: PlanChip | null;
  /** a re-rolled line's place in the plan (1 = most worth replacing) */
  order: number | null;
  /** an Energy Regen line the build needs to stay at its ER need */
  erFloor: boolean;
}
function linesFor(slot: LabSlotSummary): LineRow[] {
  const r = resultOf(slot.slot);
  if (!r) return slot.lines.map((l) => ({ ...l, worth: null, fresh: null, chip: null, order: null, erFloor: false }));
  const chips = planChips(r.lines, planOf(slot.slot));
  return [...r.lines]
    .sort((a, b) => a.field - b.field)
    .map((l) => ({ key: l.key, value: l.value, worth: l.worth, fresh: l.freshWorth, chip: chips.get(l.field)?.chip ?? "lock", order: chips.get(l.field)?.order ?? null, erFloor: !!l.erFloor }));
}
const ordinal = (n: number): string => (n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : n === 4 ? "fourth" : "fifth");

/** the character's ER against the need the advice respects (every echo's advice carries the same pair) */
const erLine = computed(() => {
  for (const s of slots.value) {
    const r = resultOf(s.slot);
    if (r && r.erNeed != null) return erFloorLine(r.erNeed, r.erHave);
  }
  return null;
});
/** the sentence under an echo whose ER line the floor locks */
function erFloorNote(slot: LabSlotSummary): string | null {
  const r = resultOf(slot.slot);
  const line = r?.lines.find((l) => l.erFloor);
  if (!r || !line || r.erNeed == null) return null;
  const keep = `Keep ${lineText(line.key, line.value)}`;
  const need = `${showNeed(r.erNeed).toFixed(1)}%`;
  if (r.erHave == null) return `${keep}: the build needs ${need} Energy Regen, and re-rolling this line would leave it short.`;
  const have = `${(Math.round(r.erHave * 10) / 10).toFixed(1)}%`;
  // how short the build would be without the line, and whether it is short already
  const without = shortBy(r.erNeed, r.erHave - line.value).toFixed(1);
  const already = shortBy(r.erNeed, r.erHave);
  return already > 0
    ? `${keep}: the build has ${have} Energy Regen against a need of ${need}, already ${already.toFixed(1)} points short; re-rolling this line would leave it ${without} points short.`
    : `${keep}: the build has ${have} Energy Regen against a need of ${need}; re-rolling this line would leave it ${without} points short.`;
}

const planTitle = (p: LockPlan): string => (p.locks ? `Lock ${p.locks}, re-roll ${p.rerolledFields.length}` : `Re-roll all ${p.rerolledFields.length}`);

// run the advice for the picked character's full echoes, one job at a time; a new pick cancels the rest
let controller: AbortController | null = null;
watch(
  () => current.value?.id,
  async (id) => {
    controller?.abort();
    if (!id) return;
    const mine = new AbortController();
    controller = mine;
    for (const s of slots.value) {
      if (mine.signal.aborted) return;
      if (s.lines.length >= 5) await lab.runReroll(id, s.slot, mine.signal);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
</script>
