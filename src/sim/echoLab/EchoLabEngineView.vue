<template>
  <section ref="root" class="echo-lab-engine mt-4 rounded-lg border border-base-300 bg-base-200/50 p-3" data-test-echo-lab-engine>
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="flex items-center gap-1.5 text-sm font-semibold">
          Engine view for this build
          <span class="badge badge-primary badge-outline badge-xs">Tools+</span>
          <span v-if="loading" class="loading loading-spinner loading-xs opacity-60" data-test-echo-lab-engine-loading></span>
        </h3>
        <p class="truncate text-xs opacity-60" :title="view?.rotationName">
          <template v-if="view">On {{ view.rotationName }} · level 100, 20 % RES</template>
          <template v-else>Best rotation · level 100, 20 % RES</template>
        </p>
      </div>
      <RouterLink :to="labLink" class="link link-primary shrink-0 text-xs no-underline hover:underline" data-test-echo-lab-engine-link>Echo Lab ›</RouterLink>
    </div>

    <p v-if="error" class="mt-2 text-xs opacity-70" data-test-echo-lab-engine-error>{{ error }}</p>

    <div v-else-if="!view" class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden="true">
      <div class="skeleton h-16 rounded-lg"></div>
      <div class="skeleton h-16 rounded-lg"></div>
      <div class="skeleton h-12 rounded-lg sm:col-span-2"></div>
    </div>

    <div v-else class="mt-3 grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2" :class="{ 'opacity-60': loading }">
      <!-- benchmark -->
      <div class="rounded-lg bg-base-100 px-3 py-2" data-test-echo-lab-engine-benchmark>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">Benchmark</span>
          <span v-if="score !== null" class="font-mono text-2xl font-extrabold tabular-nums leading-none" :class="`el-score-text--${scoreBand(score)}`">{{ pct(score, 0) }}</span>
          <span v-else class="text-xs opacity-60">—</span>
        </div>
        <div v-if="score !== null" class="el-score-track mt-2" role="meter" :aria-valuenow="Math.round(score * 100)" aria-valuemin="0" aria-valuemax="200" aria-label="Benchmark score">
          <div class="el-score-fill" :class="`el-score-fill--${scoreBand(score)}`" :style="{ width: `${(score / 2) * 100}%` }"></div>
          <div class="el-score-mark" style="left: 50%"></div>
        </div>
        <p class="mt-1 text-[0.7rem] leading-snug opacity-60">{{ score !== null ? "100 % = a realistic spread, 200 % = perfect rolls" : view.benchmarkNote }}</p>
      </div>

      <!-- substats by worth -->
      <div class="rounded-lg bg-base-100 px-3 py-2" data-test-echo-lab-engine-substats>
        <div class="text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">One more roll is worth</div>
        <ol class="mt-1 space-y-1">
          <li v-for="(s, i) in topSubstats" :key="s.key" class="flex items-center gap-2 text-xs" :data-test-echo-lab-engine-substat="s.key">
            <span class="w-3 font-mono opacity-50">{{ i + 1 }}</span>
            <img v-if="substatIcon(s.key)" :src="substatIcon(s.key) ?? undefined" alt="" class="el-icon" loading="lazy" />
            <span class="min-w-0 flex-1 truncate">{{ s.label }}</span>
            <span class="font-mono font-semibold tabular-nums el-up">{{ signedPct(s.gain, 2) }}</span>
          </li>
        </ol>
      </div>

      <!-- re-roll first: the same pick as the Echo Lab's re-roll tab -->
      <div class="rounded-lg bg-base-100 px-3 py-2 sm:col-span-2" data-test-echo-lab-engine-reroll>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">Re-roll first</span>
          <span v-if="reroll.running" class="flex items-center gap-1.5 text-[0.7rem] tabular-nums opacity-60" data-test-echo-lab-engine-reroll-loading>
            <span class="loading loading-spinner loading-xs"></span>Simulating echo {{ Math.min(reroll.done + 1, reroll.total) }} of {{ reroll.total }}
          </span>
        </div>
        <div v-if="first" class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <EchoLabEcho :echo="first.echo" :subtitle="false" :lines="null" />
          <span class="text-xs opacity-60">{{ slotLabel(first.slot) }}<template v-if="first.worth !== null"> · substats add {{ signedPct(first.worth, 1) }}</template></span>
          <span v-if="first.line" class="el-chip el-chip--reroll" data-test-echo-lab-engine-reroll-line>Re-roll {{ lineText(first.line.key, first.line.value) }}</span>
          <span v-if="first.plan" class="w-full text-xs tabular-nums opacity-80">
            {{ first.plan.locks ? `Lock ${first.plan.locks}, re-roll ${first.plan.rerolledFields.length}` : `Re-roll all ${first.plan.rerolledFields.length}` }}:
            {{ pct(first.plan.pImprove, 0) }} to improve, <span class="el-up">{{ signedPct(first.plan.expectedGain, 2) }}</span> expected,
            {{ first.plan.cost }} Transducer{{ first.plan.cost === 1 ? "" : "s" }} a try <span class="opacity-60">(verify in game)</span>
          </span>
        </div>
        <p v-else-if="!reroll.running" class="mt-1 text-xs opacity-70" data-test-echo-lab-engine-reroll-none>{{ rerollNote }}</p>
        <div v-else class="skeleton mt-1 h-10 rounded-lg" aria-hidden="true"></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — "Engine view for this build" inside the v3 calculator's Echo Insights: the benchmark
// score, the three substats one more roll of is worth most on the best rotation, and the echo (and line) to re-roll
// first. Two steps in the worker: one `engineView` job (engineView.ts, without its re-roll part) for the first
// numbers, then one `reroll` job per full echo — the very jobs the /echo-lab re-roll tab runs, so the worker's cache
// answers the tab at once — picked with `pickRerollFirst`, the tab's rule. Re-run a moment after the build changes,
// and only in the displayed panel (upstream renders a hidden twin of Echo Insights for the other breakpoint).
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { CANCELLED } from "./core";
import EchoLabEcho from "./EchoLabEcho.vue";
import { getEchoLabClient, labAccountOf } from "./echoLabClient";
import { lineText, pct, scoreBand, signedPct, slotLabel, substatIcon } from "./echoLabView";
import type { EngineViewResult } from "./engineView";
import type { LineAdvice, LockPlan, RerollAdviceResult } from "./rerollAdvice";
import { pickRerollFirst } from "./rerollPick";
import "./echoLab.css";

const props = defineProps<{ character: string }>();

interface PanelResult {
  view: EngineViewResult;
  /** re-roll advice of each full echo (weakest first), filled in as the jobs finish */
  advices: RerollAdviceResult[];
}

/** the last answer per character, so a re-run after an edit dims the old numbers instead of blanking them */
const lastByCharacter = new Map<string, PanelResult>();

const characterStore = useCharacterStore() as unknown as { characters: Record<string, any> };
const inventoryStore = useInventoryStore() as unknown as { echoes: any[]; equipped: Record<string, Record<string, number>> };
const teamStore = useTeamRotationsStore() as unknown as { teams: any[] };

const root = ref<HTMLElement | null>(null);
const result = shallowRef<PanelResult | null>(lastByCharacter.get(props.character) ?? null);
const view = computed(() => result.value?.view ?? null);
const loading = ref(false);
const error = ref<string | null>(null);
const visible = ref(false);
const reroll = reactive({ running: false, done: 0, total: 0 });

const score = computed(() => view.value?.benchmark?.score ?? null);
const topSubstats = computed(() => (view.value?.substats ?? []).filter((s) => s.gain > 0).slice(0, 3));
const labLink = computed(() => ({ path: "/echo-lab", query: { tab: "reroll", character: props.character } }));

/** the echo to re-roll first, once every full echo has its advice (never a half-done pick) */
const first = computed<{ slot: number; echo: string | null; worth: number | null; line: LineAdvice | null; plan: LockPlan | null } | null>(() => {
  const r = result.value;
  if (!r || reroll.running) return null;
  const pick = pickRerollFirst(r.advices);
  if (!pick) return null;
  const top = pick.lines.find((l) => l.rank === 1) ?? null;
  return {
    slot: pick.slot,
    echo: pick.echo,
    worth: r.view.echoes.find((e) => e.slot === pick.slot)?.worth ?? null,
    line: top && top.advice === "reroll" ? top : null,
    plan: pick.recommended,
  };
});
const fullEchoes = computed(() => (view.value?.echoes ?? []).filter((e) => e.lines >= 5));
const rerollNote = computed(() => {
  const v = view.value;
  if (!v) return "";
  if (v.rerollNote) return v.rerollNote;
  if (!fullEchoes.value.length) return "No echo has all five lines yet: finish tuning first";
  return "No re-roll is expected to gain even 0.05 % on any echo: every line is worth keeping.";
});

let controller: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** the build changed since the last run (runs wait until the panel is displayed) */
let dirty = true;

async function run(): Promise<void> {
  controller?.abort();
  const mine = new AbortController();
  controller = mine;
  const id = props.character;
  dirty = false;
  loading.value = true;
  const client = getEchoLabClient();
  try {
    const account = labAccountOf({ characters: characterStore.characters, echoes: inventoryStore.echoes, equipped: inventoryStore.equipped, teams: teamStore.teams });
    const engine = await client.run({ kind: "engineView", characterId: id, options: { reroll: false } }, account, { signal: mine.signal });
    if (controller !== mine || id !== props.character) return;
    const next: PanelResult = { view: engine, advices: [] };
    const full = engine.echoes.filter((e) => e.lines >= 5).sort((a, b) => a.worth - b.worth || a.slot - b.slot);
    Object.assign(reroll, { running: full.length > 0, done: 0, total: full.length });
    result.value = next;
    error.value = null;
    loading.value = false;
    for (const e of full) {
      const advice = await client.run({ kind: "reroll", characterId: id, slot: e.slot }, account, { signal: mine.signal });
      if (controller !== mine) return;
      next.advices = [...next.advices, advice];
      reroll.done += 1;
    }
    reroll.running = false;
    result.value = { ...next };
    lastByCharacter.set(id, next);
  } catch (err) {
    if (controller !== mine || (err instanceof Error && err.name === CANCELLED)) return;
    const message = err instanceof Error ? err.message : String(err);
    error.value = /no weapon/.test(message) ? "Equip a weapon to see the engine view." : /no rotation/.test(message) ? "No rotation scores on this build yet." : message;
    result.value = null;
    reroll.running = false;
  } finally {
    if (controller === mine) {
      loading.value = false;
      controller = null;
    }
  }
}

function schedule(delay: number): void {
  dirty = true;
  if (!visible.value) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void run(), delay);
}

watch(
  () => props.character,
  (id) => {
    result.value = lastByCharacter.get(id) ?? null;
    reroll.running = false;
    error.value = null;
    schedule(0);
  },
);
// any build or inventory edit: run again once the edits settle
watch(
  () => [characterStore.characters?.[props.character], inventoryStore.echoes, inventoryStore.equipped],
  () => schedule(900),
  { deep: true },
);

// Upstream renders two Echo Insights panels and hides one with CSS per breakpoint, and mounts the calculator's
// screens hidden (v-show): only the displayed panel runs, from the moment it shows. An IntersectionObserver answers
// at once in a browser; a 1 s check of the panel's boxes backs it up (the observer never fires in headless
// Electron, like rAF — Cypress) and catches a resize across the breakpoint.
const displayed = (): boolean => !!root.value && root.value.getClientRects().length > 0;
function checkDisplayed(): void {
  const was = visible.value;
  visible.value = displayed();
  if (visible.value && !was && dirty) schedule(0);
}
let observer: IntersectionObserver | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  checkDisplayed();
  poll = setInterval(checkDisplayed, 1000);
  window.addEventListener("resize", checkDisplayed, { passive: true });
  if (typeof IntersectionObserver !== "undefined" && root.value) {
    observer = new IntersectionObserver(() => checkDisplayed());
    observer.observe(root.value);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  if (poll) clearInterval(poll);
  window.removeEventListener("resize", checkDisplayed);
  if (timer) clearTimeout(timer);
  controller?.abort();
});
</script>
