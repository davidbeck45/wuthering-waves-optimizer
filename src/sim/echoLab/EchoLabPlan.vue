<template>
  <section class="space-y-3" data-test-echo-lab-plan>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-base font-semibold">Tuner plan</h2>
      <EchoLabPopover id="plan" label="How the Tuner plan is worked out" align="left">
        <p>Every echo you own that has not rolled all five substat lines is rolled out in full (every outcome when there are few enough, else a seeded simulation) and scored by the damage engine on its owner's best rotation: where it sits when someone wears it, else in its most promising owner's slot, as Tune or Feed does.</p>
        <p><b>Expected gain</b> counts a spare echo only when it ends up beating the echo in that slot. The plan goes from the most expected damage per Tuner down, and takes each echo while what is left still pays for it.</p>
        <ul class="list-disc space-y-1 pl-4 opacity-80">
          <li v-for="a in assumptions" :key="a">{{ a }}</li>
        </ul>
      </EchoLabPopover>
    </div>
    <p class="max-w-3xl text-sm opacity-70" data-test-echo-lab-plan-intro>
      Type how many Tuners and how much Echo EXP you have: the plan lists which echoes to finish tuning first, most expected damage per Tuner first, until it runs out.
    </p>

    <!-- the budget: what the player has, and (optional) what they earn a week -->
    <div class="rounded-box border border-base-300 bg-base-100 px-4 py-3 max-sm:px-3" data-test-echo-lab-plan-budget>
      <div class="grid grid-cols-2 gap-3 sm:max-w-xl">
        <label class="form-control min-w-0">
          <span class="label-text pb-1 text-xs font-semibold">Tuners you have</span>
          <input v-model="form.tuners" type="number" inputmode="numeric" min="0" step="1" placeholder="e.g. 120" class="input input-sm input-bordered w-full min-w-0" data-test-echo-lab-plan-tuners @change="save" />
        </label>
        <label class="form-control min-w-0">
          <span class="label-text pb-1 text-xs font-semibold">Echo EXP you have</span>
          <input v-model="form.exp" type="number" inputmode="numeric" min="0" step="1000" placeholder="e.g. 300000" class="input input-sm input-bordered w-full min-w-0" data-test-echo-lab-plan-exp @change="save" />
        </label>
      </div>
      <p class="mt-1.5 text-xs opacity-60">A Premium Sealed Tube is 5,000 EXP. Left blank, EXP is not counted.</p>
      <button type="button" class="btn btn-ghost btn-xs mt-2 -ml-2" :aria-expanded="weeklyOpen" data-test-echo-lab-plan-weekly-toggle @click="weeklyOpen = !weeklyOpen">
        {{ weeklyOpen ? "Hide weekly income" : "Add a weekly income (optional)" }}
      </button>
      <div v-if="weeklyOpen" class="mt-2" data-test-echo-lab-plan-weekly>
        <div class="grid grid-cols-2 gap-3 sm:max-w-xl">
          <label class="form-control min-w-0">
            <span class="label-text pb-1 text-xs font-semibold">Tuners a week</span>
            <input v-model="form.weeklyTuners" type="number" inputmode="numeric" min="0" step="1" class="input input-sm input-bordered w-full min-w-0" data-test-echo-lab-plan-weekly-tuners @change="save" />
          </label>
          <label class="form-control min-w-0">
            <span class="label-text pb-1 text-xs font-semibold">Echo EXP a week</span>
            <input v-model="form.weeklyExp" type="number" inputmode="numeric" min="0" step="1000" class="input input-sm input-bordered w-full min-w-0" data-test-echo-lab-plan-weekly-exp @change="save" />
          </label>
        </div>
        <p class="mt-1.5 text-xs opacity-60">Only what you type here: the plan never guesses your income. With it, the echoes that do not fit now get the week they will.</p>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-60">
        <span>Saved in this browser only.</span>
        <button v-if="hasInput" type="button" class="link" data-test-echo-lab-plan-clear @click="clear">Clear</button>
      </div>
    </div>

    <!-- progress / error -->
    <div v-if="status.running" class="rounded-box border border-primary/40 bg-base-100 px-4 py-3" data-test-echo-lab-plan-progress>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="loading loading-spinner loading-sm text-primary"></span>
        <span class="text-sm font-medium">{{ phaseLabel(status.progress?.phase) }}</span>
        <span v-if="status.progress?.label" class="truncate text-xs opacity-60">{{ status.progress.label }}</span>
      </div>
    </div>
    <div v-if="!result && !status.running && !status.error" class="flex flex-wrap items-center gap-2 text-sm" data-test-echo-lab-plan-idle>
      <span class="opacity-70">The plan has not been worked out for this account yet.</span>
      <button type="button" class="btn btn-sm" data-test-echo-lab-plan-run @click="emit('run', false)">Work it out</button>
    </div>
    <div v-if="status.error" class="alert alert-error text-sm" data-test-echo-lab-plan-error>
      <span>The Tuner plan stopped: {{ status.error }}</span>
      <button type="button" class="btn btn-sm" @click="emit('run', true)">Try again</button>
    </div>

    <template v-if="result">
      <!-- what the budget buys -->
      <div class="grid grid-cols-3 gap-2" data-test-echo-lab-plan-summary>
        <div v-for="k in kpis" :key="k.id" class="min-w-0 rounded-box border border-base-300 bg-base-100 px-3 py-2.5 max-sm:px-2.5 max-sm:py-2" :data-test-echo-lab-plan-kpi="k.id">
          <div class="text-[0.65rem] font-semibold uppercase leading-tight tracking-wide opacity-60">{{ k.label }}</div>
          <div class="mt-0.5 font-mono text-xl font-bold tabular-nums" data-test-echo-lab-plan-kpi-value>{{ k.value }}</div>
          <div v-if="k.sub" class="text-xs leading-tight opacity-60">{{ k.sub }}</div>
        </div>
      </div>
      <p v-if="weeklyLine" class="text-sm opacity-80" data-test-echo-lab-plan-weekly-line>{{ weeklyLine }}</p>

      <!-- the plan -->
      <ol v-if="plan.steps.length" class="grid grid-cols-1 gap-2" data-test-echo-lab-plan-steps>
        <li
          v-for="step in plan.steps"
          :key="step.candidate.echoId"
          class="plan-card rounded-box border bg-base-100 px-4 py-3 max-sm:px-3"
          :class="step.when.kind === 'now' ? 'border-primary/50' : 'border-base-300'"
          :data-test-echo-lab-plan-step="step.candidate.echoId"
          :data-when="step.when.kind">
          <div class="flex min-w-0 items-start gap-3">
            <span class="grid size-7 shrink-0 place-items-center rounded-full bg-base-200 font-mono text-sm font-bold tabular-nums" :aria-label="`Step ${step.order}`">{{ step.order }}</span>
            <div class="min-w-0 flex-1">
              <EchoLabEcho :echo="step.candidate.echo" :set="step.candidate.set" :cost="step.candidate.echoCost" :main="step.candidate.main" :rank="step.candidate.rank" :lines="step.candidate.lines" />
            </div>
            <span v-if="whenText(step.when)" class="el-chip shrink-0" :class="step.when.kind === 'now' ? 'el-chip--keep' : 'el-chip--spare'" data-test-echo-lab-plan-when>{{ whenText(step.when) }}</span>
          </div>
          <div class="mt-2 flex min-w-0 items-center gap-2 text-sm">
            <img :src="portrait(step.candidate.characterId)" :alt="characterName(step.candidate.characterId)" class="el-portrait size-7" loading="lazy" />
            <div class="min-w-0 leading-tight">
              <div class="truncate">
                <template v-if="step.candidate.kind === 'worn'">Worn by {{ characterName(step.candidate.characterId) }}</template>
                <template v-else>For {{ characterName(step.candidate.characterId) }}</template>
              </div>
              <div class="text-xs opacity-60">
                {{ slotLabel(step.candidate.slot) }}<template v-if="step.candidate.kind === 'spare' && step.candidate.replacedEcho">, would replace {{ echoName(step.candidate.replacedEcho) }}</template>
              </div>
              <div class="text-xs opacity-60" data-test-echo-lab-plan-level>+{{ step.candidate.level }} → +25: {{ 5 - step.candidate.lines }} line{{ 5 - step.candidate.lines === 1 ? "" : "s" }} still to roll</div>
            </div>
          </div>
          <dl class="plan-stats mt-2">
            <div>
              <dt>Expected gain</dt>
              <dd>
                <span class="font-mono font-bold tabular-nums el-up" data-test-echo-lab-plan-gain>{{ signedPct(step.candidate.expectedGain, 2) }}</span>
                <span class="block text-xs opacity-60">+{{ compact(step.candidate.expectedDamage) }} damage per rotation</span>
              </dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>
                <span class="font-mono font-bold tabular-nums" data-test-echo-lab-plan-cost>{{ step.candidate.resources.tuners }} Tuners</span>
                <span class="block text-xs opacity-60">{{ compact(step.candidate.resources.exp) }} EXP · {{ compact(step.candidate.resources.shellCredits) }} Shell Credits</span>
              </dd>
            </div>
            <div>
              <dt>Chance it ends up worth keeping</dt>
              <dd>
                <template v-if="step.candidate.pKeep === null">
                  <span class="font-semibold">Worn</span>
                  <span class="block text-xs opacity-60">it stays on, so every line counts</span>
                </template>
                <template v-else>
                  <span class="font-mono font-bold tabular-nums" data-test-echo-lab-plan-keep>{{ pct(step.candidate.pKeep, 0) }}</span>
                  <span class="block text-xs opacity-60">that it beats the echo there now</span>
                </template>
              </dd>
            </div>
          </dl>
          <p v-if="step.when.kind !== 'now' && (step.shortTuners || step.shortExp)" class="mt-1.5 text-xs opacity-70" data-test-echo-lab-plan-short>
            Needs {{ shortText(step) }} more than what is left now.
          </p>
        </li>
      </ol>
      <div v-else class="rounded-box border border-dashed border-base-300 px-4 py-8 text-center" data-test-echo-lab-plan-empty>
        <p class="font-medium">Nothing of yours to finish tuning.</p>
        <p class="mt-1 text-sm opacity-70">Every 5★ echo you own has all five substat lines, or none is worth a Tuner. Your Tuners go into new echoes: see below.</p>
      </div>

      <p v-if="plan.notWorth.length" class="text-xs opacity-70" data-test-echo-lab-plan-notworth>
        Not worth a Tuner (feed instead):
        <span v-for="(c, i) in plan.notWorth" :key="c.echoId">{{ echoName(c.echo) }}<template v-if="i < plan.notWorth.length - 1">, </template></span>
      </p>
      <p v-if="result.leftOut.length" class="text-xs opacity-60" data-test-echo-lab-plan-leftout>
        Left out: {{ leftOutText }}
      </p>

      <!-- a new echo: where it pays most -->
      <div v-if="result.fresh.length" class="space-y-2 pt-2" data-test-echo-lab-plan-fresh>
        <h3 class="text-base font-semibold">Then farm: where a new echo pays most</h3>
        <p class="max-w-3xl text-sm opacity-70">
          A new copy of the echo in that slot (same set, cost and main stat), levelled to +25 with all five lines tuned, against the one there now; most damage per rotation first. One try costs {{ freshCost }}.
        </p>
        <p v-if="freshLine" class="text-sm" data-test-echo-lab-plan-fresh-line>{{ freshLine }}</p>
        <ul class="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <li v-for="f in result.fresh" :key="`${f.characterId}|${f.slot}`" class="rounded-box border border-base-300 bg-base-100 px-4 py-3 max-sm:px-3" :data-test-echo-lab-plan-fresh-row="`${f.characterId}|${f.slot}`">
            <div class="flex min-w-0 items-center gap-2 text-sm">
              <img :src="portrait(f.characterId)" :alt="characterName(f.characterId)" class="el-portrait size-8" loading="lazy" />
              <div class="min-w-0 leading-tight">
                <div class="truncate font-semibold">{{ characterName(f.characterId) }} · {{ slotLabel(f.slot) }}</div>
                <div class="text-xs opacity-60">{{ f.echoCost }}-cost {{ setLabel(f.set) }} · {{ mainLabel(f.main) }} main</div>
              </div>
            </div>
            <dl class="plan-stats plan-stats--two mt-2">
              <div>
                <dt>Chance a new one beats it</dt>
                <dd><span class="font-mono font-bold tabular-nums" data-test-echo-lab-plan-fresh-keep>{{ pct(f.pKeep, 0) }}</span></dd>
              </div>
              <div>
                <dt>Expected gain per try</dt>
                <dd>
                  <span class="font-mono font-bold tabular-nums el-up">{{ signedPct(f.expectedGain, 2) }}</span>
                  <span class="block text-xs opacity-60">+{{ compact(f.expectedDamage) }} damage per rotation</span>
                </dd>
              </div>
            </dl>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — the "Tuner plan" tab: what the player has (Tuners, Echo EXP and an optional weekly
// income, all typed in and remembered in this browser) → which unfinished echoes to tune next for the most
// expected damage per Tuner (tunerBudget.ts over the worker's tunerPlan.ts candidates), then the slots where a newly
// farmed echo pays most. Editing a number re-plans at once; the engine only runs once per account state.
import { computed, reactive, ref } from "vue";
import type { JobStatus } from "./useEchoLab";
import EchoLabEcho from "./EchoLabEcho.vue";
import EchoLabPopover from "./EchoLabPopover.vue";
import { characterName, compact, echoName, mainLabel, pct, phaseLabel, portrait, setLabel, signedPct, slotLabel } from "./echoLabView";
import { EMPTY_BUDGET, TUNER_BUDGET_KEY, WEEKS_AHEAD, normalizeBudget, planTuners, readTunerBudget, whenText, writeTunerBudget, type PlanStep, type TunerBudget } from "./tunerBudget";
import { TUNER_PLAN_ASSUMPTIONS, tuneToMaxResources, type TunerCandidatesResult } from "./tunerPlan";

const props = defineProps<{ result: TunerCandidatesResult | null; status: JobStatus }>();
// eslint-disable-next-line no-unused-vars -- the parameters of an emit signature
const emit = defineEmits<{ (e: "run", force: boolean): void }>();
const assumptions = TUNER_PLAN_ASSUMPTIONS;

const loadBudget = (): TunerBudget => {
  try {
    return readTunerBudget(typeof localStorage !== "undefined" ? localStorage.getItem(TUNER_BUDGET_KEY) : null);
  } catch {
    return { ...EMPTY_BUDGET };
  }
};
const initial = loadBudget();
type Form = Record<keyof TunerBudget, string | number | null>;
const form = reactive<Form>({ ...initial });
const weeklyOpen = ref(initial.weeklyTuners !== null || initial.weeklyExp !== null);
const budget = computed(() => normalizeBudget(form));
const hasInput = computed(() => Object.values(budget.value).some((v) => v !== null));

function save(): void {
  try {
    localStorage.setItem(TUNER_BUDGET_KEY, writeTunerBudget(budget.value));
  } catch {
    // no storage: the numbers still plan for this visit
  }
}
function clear(): void {
  Object.assign(form, EMPTY_BUDGET);
  weeklyOpen.value = false;
  try {
    localStorage.removeItem(TUNER_BUDGET_KEY);
  } catch {
    // nothing stored
  }
}

const plan = computed(() => planTuners(props.result?.candidates ?? [], budget.value, props.result?.fresh ?? []));

const kpis = computed(() => {
  const b = budget.value;
  const p = plan.value;
  const dash = "—";
  return [
    {
      id: "now",
      label: "Echoes to tune now",
      value: b.tuners === null ? dash : String(p.now.count),
      sub: b.tuners === null ? "type your Tuners" : p.now.count ? `+${compact(p.now.expectedDamage)} damage in all` : `of ${p.steps.length} worth it`,
    },
    {
      id: "tuners",
      label: "Tuners left after",
      value: p.left.tuners === null ? dash : p.left.tuners.toLocaleString("en-US"),
      sub: b.tuners === null ? "" : `${p.now.resources.tuners} used`,
    },
    {
      id: "exp",
      label: "EXP left after",
      value: p.left.exp === null ? dash : compact(p.left.exp),
      sub: b.exp === null ? "not counted" : `${compact(p.now.resources.exp)} used`,
    },
  ];
});

const weeklyLine = computed((): string | null => {
  const p = plan.value;
  if (!p.weekly || budget.value.tuners === null) return null;
  const waiting = p.steps.filter((s) => s.when.kind !== "now");
  if (!waiting.length) return null;
  const weeks = waiting.filter((s) => s.when.kind === "week").map((s) => (s.when as { week: number }).week);
  const later = waiting.length - weeks.length;
  if (!later) return `With your weekly income, the rest is tuned by week ${Math.max(...weeks)}.`;
  const line = weeks.length
    ? `With your weekly income, ${weeks.length} more fit within ${WEEKS_AHEAD} weeks; ${later} wait longer.`
    : later === 1
      ? `With your weekly income, the other one does not fit within ${WEEKS_AHEAD} weeks.`
      : `With your weekly income, none of the other ${later} fit within ${WEEKS_AHEAD} weeks.`;
  // Echo EXP on hand typed, none a week: the EXP never grows, so an echo short of EXP never fits — say so
  const expStuck = budget.value.exp !== null && !budget.value.weeklyExp && waiting.some((s) => s.when.kind === "later" && s.shortExp > 0);
  return expStuck ? `${line} Echo EXP holds ${later === 1 ? "it" : "them"} back: type the Echo EXP you get a week too.` : line;
});

const freshCost = (() => {
  const r = tuneToMaxResources(0);
  return `${r.tuners} Tuners, ${compact(r.exp)} EXP and ${compact(r.shellCredits)} Shell Credits`;
})();

const freshLine = computed((): string | null => {
  const p = plan.value;
  const parts: string[] = [];
  if (p.freshTries !== null) parts.push(p.freshTries ? `What is left after the plan pays for ${p.freshTries} full tune${p.freshTries === 1 ? "" : "s"} of a new echo.` : "What is left after the plan does not pay for a full tune of a new echo.");
  if (p.freshPerWeek !== null) parts.push(p.freshPerWeek >= 1 ? `Your weekly income pays for about ${p.freshPerWeek.toFixed(1)} a week.` : p.freshPerWeek > 0 ? `Your weekly income pays for one about every ${Math.ceil(1 / p.freshPerWeek)} weeks.` : "");
  return parts.filter(Boolean).join(" ") || null;
});

const leftOutText = computed(() => {
  const r = props.result;
  if (!r) return "";
  const notFive = r.leftOut.filter((l) => l.reason === "not-5-star").length;
  const noSlot = r.leftOut.filter((l) => l.reason === "no-slot").length;
  const parts: string[] = [];
  if (notFive) parts.push(`${notFive} unfinished echo${notFive === 1 ? "" : "es"} below 5★ (other Tuners)`);
  if (noSlot) parts.push(`${noSlot} no built character can slot`);
  return parts.join(" · ");
});

function shortText(step: PlanStep): string {
  const parts: string[] = [];
  if (step.shortTuners) parts.push(`${step.shortTuners} Tuner${step.shortTuners === 1 ? "" : "s"}`);
  if (step.shortExp) parts.push(`${compact(step.shortExp)} EXP`);
  return parts.join(" and ");
}
</script>

<style scoped>
.plan-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
.plan-stats--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.plan-stats dt {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  line-height: 1.2;
  opacity: 0.6;
}
.plan-stats dd {
  margin-top: 0.125rem;
}
/* a phone: one stat per line, the caption on the left and the number on the right */
@media (max-width: 639px) {
  .plan-stats,
  .plan-stats--two {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.4rem;
  }
  /* the caption left, the number right; its small print on a line of its own, so it never squeezes the caption */
  .plan-stats > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.75rem;
    align-items: baseline;
  }
  .plan-stats dd {
    display: contents;
  }
  .plan-stats dd > :first-child {
    grid-column: 2;
    grid-row: 1;
    text-align: right;
  }
  .plan-stats dd > :nth-child(2) {
    grid-column: 1 / -1;
    text-align: right;
  }
}
</style>
