<template>
  <!-- Wuthering Tools+: the pull advisor — the featured 5★s on the running banners, priced in Astrite from your pity and
       scored by the app's engine on your own builds. Engine and simulator numbers only. -->
  <div class="convene-advisor" data-test-convene-advisor>
    <header class="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      <!-- phones: the intro takes the whole row and Re-score sits under it (a 0 basis squeezed the text beside it) -->
      <div class="min-w-0 flex-1 max-sm:basis-full">
        <h1 class="text-2xl font-semibold md:text-3xl">Pull advisor <span class="block text-base font-normal text-base-content/50 sm:inline sm:text-[length:inherit]"><span class="max-sm:hidden">· </span>damage per Astrite</span></h1>
        <p class="mt-1 max-w-3xl text-sm text-base-content/70">
          For each featured 5★ on the banners running now: what the next copy adds to <b>your</b> build, scored by the
          calculator's engine on that character's best rotation, and what it costs in Astrite from your current pity.
          Ranked by damage gained per 1,000 Astrite.
        </p>
      </div>
      <button type="button" class="btn btn-sm" :disabled="running || !targets.length" data-test-convene-advisor-rescore @click="score(true)">
        <span v-if="running" class="loading loading-spinner loading-xs"></span>
        {{ running ? "Scoring…" : "Re-score" }}
      </button>
    </header>

    <!-- inputs: pity per pool + budget -->
    <section class="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]" data-test-convene-advisor-inputs>
      <div class="rounded-box border border-base-content/5 bg-base-200 p-4">
        <div class="mb-2 flex flex-wrap items-baseline gap-2">
          <h2 class="font-semibold">Your pity</h2>
          <span class="text-xs text-base-content/60">{{ hasHistory ? "read from My pulls — change it to try another state" : "type it in, or import your history under My pulls" }}</span>
          <button v-if="!hasHistory" type="button" class="link link-primary ml-auto text-xs" data-test-convene-advisor-import @click="emit('go', 'pulls')">Import my pulls ▸</button>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div v-for="p in pityPools" :key="p.type" class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-base-100/55 px-3 py-2" :data-test-convene-advisor-pity="p.type">
            <span class="w-full text-sm font-medium">{{ p.name }}</span>
            <label class="flex items-center gap-1.5 text-sm">
              <span class="text-base-content/60">pity</span>
              <input
                type="number"
                min="0"
                max="79"
                class="input input-bordered input-xs w-16 tabular-nums"
                :value="p.state.pity"
                data-test-convene-advisor-pity-input
                @change="setPity(p.type, { pity: Number(($event.target as HTMLInputElement).value), guaranteed: p.state.guaranteed })" />
            </label>
            <label v-if="!p.alwaysFeatured" class="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                class="checkbox checkbox-xs"
                :checked="p.state.guaranteed"
                data-test-convene-advisor-guaranteed
                @change="setPity(p.type, { pity: p.state.pity, guaranteed: ($event.target as HTMLInputElement).checked })" />
              <span>guaranteed</span>
            </label>
            <span class="ml-auto text-[0.7rem] text-base-content/50">
              <template v-if="p.source === 'typed' && p.fromHistory">
                edited · <button type="button" class="link" @click="clearPity(p.type)">use my history</button>
              </template>
              <template v-else-if="p.source === 'history'">
                from your history<template v-if="p.note"> · <span class="text-warning" :title="p.noteTitle">{{ p.note }}</span></template>
              </template>
              <template v-else>{{ p.source === "typed" ? "typed" : "no history: 0" }}</template>
            </span>
          </div>
        </div>
      </div>
      <div class="rounded-box border border-base-content/5 bg-base-200 p-4">
        <h2 class="mb-2 font-semibold">Budget <span class="text-xs font-normal text-base-content/60">(optional)</span></h2>
        <label class="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="160"
            class="input input-bordered input-sm w-full tabular-nums"
            placeholder="Astrite + Lunite you can spend"
            :value="prefs.budgetAstrite ?? ''"
            data-test-convene-advisor-budget
            @change="setBudget(($event.target as HTMLInputElement).value)" />
        </label>
        <p class="mt-1.5 text-xs text-base-content/60">
          <template v-if="budgetPulls != null">{{ fmtInt(budgetPulls) }} pulls — adds the chance of getting each step with it.</template>
          <template v-else>Adds the chance of getting each step with that much.</template>
        </p>
      </div>
    </section>

    <div v-if="!targets.length && banners.length && !feedLoading" class="alert" data-test-convene-advisor-none>
      <span>No banner is running right now, so there's nothing to price. The Banners tab lists what ran before.</span>
    </div>

    <div v-if="running" class="mb-4 rounded-box bg-base-200 p-3" role="status" data-test-convene-advisor-progress>
      <div class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-sm text-primary"></span> Scoring {{ progress.label }} ({{ Math.min(progress.done + 1, progress.total) }}/{{ progress.total }}) on your builds…</div>
      <progress class="progress progress-primary mt-2 w-full" :value="progress.done" :max="progress.total || 1"></progress>
    </div>
    <div v-if="error" class="alert alert-error mb-4 text-sm" role="alert">{{ error }}</div>

    <template v-if="rows.length && !running">
      <!-- the headline -->
      <div class="summary mb-5" data-test-convene-advisor-summary>
        <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
        </svg>
        <p class="text-sm leading-relaxed">{{ summary }}</p>
      </div>

      <ol class="grid grid-cols-1 gap-3" data-test-convene-advisor-rows>
        <li v-for="r in rows" :key="r.target.id" class="adv-row" :class="{ 'adv-row--muted': r.rank == null }" :data-test-convene-advisor-row="r.target.item.name" :data-status="r.status">
          <div class="adv-row__head">
            <div class="adv-rank" :class="r.rank === 1 ? 'adv-rank--top' : ''">{{ r.rank != null ? `#${r.rank}` : "—" }}</div>
            <div class="relative shrink-0">
              <ConveneItemIcon :name="r.target.item.name" :item-key="r.target.item.key" :kind="r.target.kind" size="lg" />
              <ConveneItemIcon
                v-if="r.target.kind === 'weapon' && r.characterKey"
                :name="r.characterName ?? ''"
                :item-key="r.characterKey"
                kind="resonator"
                size="xs"
                class="absolute -bottom-1 -right-1 ring-2 ring-base-200" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="line-clamp-2 break-words font-semibold leading-tight sm:truncate">
                <template v-if="r.status === 'ok' && r.steps[0]">{{ headline(r) }}</template>
                <template v-else>{{ r.target.item.name }}</template>
              </div>
              <div class="truncate text-xs text-base-content/60">
                <template v-if="r.status === 'ok'">
                  {{ r.target.kind === "weapon" ? `${r.characterName} uses ${r.current}` : `you have ${r.current}` }} · best rotation: {{ r.rotation }}
                </template>
                <template v-else>{{ r.target.bannerLabel ?? r.target.bannerTitle ?? "" }} · {{ r.target.kind === "weapon" ? "weapon" : "resonator" }}</template>
              </div>
            </div>
            <div v-if="r.status === 'ok' && r.steps[0]" class="adv-metrics">
              <div class="adv-metric">
                <div class="adv-metric__value" :class="r.steps[0].gain > 0.0005 ? 'text-success' : 'text-base-content/60'" data-test-convene-advisor-gain>{{ fmtGain(r.steps[0].gain) }}</div>
                <div class="adv-metric__label">
                  damage<template v-if="r.steps[0].low"> · stats only {{ fmtGain(r.steps[0].low.gain) }}</template>
                </div>
              </div>
              <div class="adv-metric">
                <div class="adv-metric__value">{{ fmtK(r.steps[0].cost.meanAstrite) }}</div>
                <div class="adv-metric__label">Astrite expected</div>
              </div>
              <div class="adv-metric adv-metric--key">
                <div class="adv-metric__value" data-test-convene-advisor-per1k>{{ r.steps[0].perThousand.toFixed(2) }}%</div>
                <div class="adv-metric__label">per 1k Astrite</div>
              </div>
            </div>
          </div>

          <template v-if="r.status === 'ok' && r.steps[0]">
            <div class="adv-bar" aria-hidden="true"><div :style="{ width: `${Math.max(2, (r.steps[0].perThousand / bestPerThousand) * 100)}%` }"></div></div>
            <p class="mt-2 text-xs text-base-content/60">
              About {{ fmtInt(r.steps[0].cost.meanPulls) }} pulls on average from your pity — half of players get it within {{ r.steps[0].cost.p50Pulls }}, nine in ten within
              {{ r.steps[0].cost.p90Pulls }}<template v-if="r.steps[0].chance != null">; <b class="text-base-content">{{ fmtPct(r.steps[0].chance, 0) }}</b> with your budget</template>.
              <template v-if="r.note"> {{ capitalize(r.note) }}.</template>
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" class="btn btn-xs btn-ghost" :aria-expanded="open[r.target.id] === true" :data-test-convene-advisor-ladder-toggle="r.target.item.name" @click="open[r.target.id] = !open[r.target.id]">
                {{ open[r.target.id] ? "Hide" : "Show" }} every step to {{ r.target.kind === "weapon" ? "R5" : "S6" }}
              </button>
              <button type="button" class="btn btn-xs btn-ghost" :data-test-convene-advisor-simulate="r.target.item.name" @click="simulate(r, r.steps[0])">Odds for {{ r.steps[0].label }} in the simulator</button>
            </div>
            <div v-if="open[r.target.id]" class="mt-2 overflow-x-auto" :data-test-convene-advisor-ladder="r.target.item.name">
              <table class="table table-xs ladder">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th class="text-right">Copies</th>
                    <th class="text-right">Damage</th>
                    <th class="text-right">Astrite (avg)</th>
                    <th class="text-right">9 in 10 within</th>
                    <th class="text-right">% per 1k</th>
                    <th class="text-right" title="the gain of this step over the one before, per 1,000 extra Astrite">this step, per 1k</th>
                    <th v-if="r.steps[0].chance != null" class="text-right">Budget</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in r.steps" :key="s.label">
                    <td class="font-medium">{{ s.label }}</td>
                    <td class="text-right tabular-nums">{{ s.copies }}</td>
                    <td class="text-right tabular-nums" :class="s.gain > 0.0005 ? 'text-success' : 'text-base-content/60'">{{ fmtGain(s.gain) }}</td>
                    <td class="text-right tabular-nums">{{ fmtK(s.cost.meanAstrite) }}</td>
                    <td class="text-right tabular-nums">{{ s.cost.p90Pulls }} pulls</td>
                    <td class="text-right tabular-nums">{{ s.perThousand.toFixed(2) }}%</td>
                    <td class="text-right tabular-nums">{{ s.marginalPerThousand.toFixed(2) }}%</td>
                    <td v-if="s.chance != null" class="text-right tabular-nums">{{ fmtPct(s.chance, 0) }}</td>
                    <td class="text-right"><button type="button" class="link link-hover text-xs" @click="simulate(r, s)">odds ▸</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <p v-else class="mt-2 text-sm text-base-content/70" :data-test-convene-advisor-status="r.status">
            <template v-if="r.status === 'not-owned'">
              {{ r.target.kind === "weapon" ? `${r.characterName}, whose signature this is, isn't` : `${r.characterName ?? r.target.item.name} isn't` }} in your account.
              Scoring {{ r.target.kind === "weapon" ? "it" : "a resonator you don't own" }} would need a made-up S0 build, so the advisor leaves it out —
              <RouterLink to="/rankings" class="link link-primary" data-test-convene-advisor-rankings>see how {{ r.characterName ?? r.target.item.name }} does in Team rankings ▸</RouterLink>
            </template>
            <template v-else-if="r.status === 'not-set-up'">
              {{ r.characterName }} is in your calculator without a weapon, so there's no build to score.
              <button type="button" class="link link-primary" @click="openInCalculator(r.characterKey)">Set {{ r.characterName }} up ▸</button>
            </template>
            <template v-else-if="r.status === 'maxed'">{{ r.target.kind === "weapon" ? `${r.characterName} already has it at R5` : `You already have ${r.characterName} at S6` }} — another copy adds no damage.</template>
            <template v-else-if="r.status === 'no-owner'">No resonator in the app lists this as a signature weapon, so there's no build to score it on.</template>
            <template v-else-if="r.status === 'not-in-app'">The calculator doesn't have this item yet.</template>
            <template v-else>Couldn't score this one{{ r.note ? `: ${r.note}` : "" }}.</template>
          </p>
        </li>
      </ol>
    </template>

    <details class="mt-6 rounded-box border border-base-content/5 bg-base-200/60 px-4 py-3 text-sm" data-test-convene-advisor-assumptions>
      <summary class="cursor-pointer font-medium">How this is worked out</summary>
      <ul class="mt-2 list-disc space-y-1.5 pl-5 text-base-content/75">
        <li><b>Damage</b> is the calculator's own engine on your saved build (weapon, echoes, chains, buffs), on the character's best rotation among your saved ones, the curated presets and the wuwa_calc loops — the same scoring as My roster rankings. Enemy: level 100, 20% resistance. It's that one character's rotation damage, not a whole team's.</li>
        <li><b>A sequence</b> switches on that node's chains and re-scores the same rotation. <b>A signature weapon</b> you don't use yet is shown with its passive at full stacks; "stats only" is the same weapon with the passive off. A refinement of the weapon you already use keeps your own passive settings.</li>
        <li><b>Cost</b> comes from the odds simulator's pity curve (about 54.1 pulls to any 5★, 81.15 to a featured one from zero), with your current pity and guarantee carried in and a 50/50 on every later resonator copy. 160 Astrite per pull. The average is exact, not sampled.</li>
        <li><b>Not counted:</b> 4★s, Afterglow Coral and the Wavebands it buys, team-wide effects, and anything that isn't damage — comfort, survivability, energy. A resonator you don't own isn't scored.</li>
        <li>Numbers move with your builds: re-score after you change gear in the calculator.</li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw, watch } from "vue";
import { useRouter } from "vue-router";
import { useCharacterStore } from "../../../stores/character";
import { useInventoryStore } from "../../../stores/inventory";
import { MAX_PULLS_SINCE_LAST_FIVE } from "../../../convene/simulateConvene";
import { refinementOf, sequenceOf } from "../../myRankings/rankRoster";
import { scoreAdvisorTargets } from "../advisorEngine";
import { adviceSummary, advisorTargets, priceAdvice, pullsForAstrite, stepTitle, type AdviceDamage, type AdviceRow, type AdviceStep, type PoolPityInput } from "../advisor";
import { poolOf } from "../pools";
import type { ConveneTab, ManualPity } from "../prefs";
import ConveneItemIcon from "./ConveneItemIcon.vue";
import { useBannerFeed, useConveneHistory, useConvenePrefs, useNow } from "./useConvene";
import { fmtGain, fmtInt, fmtK, fmtPct } from "./format";
import type { ConvenePrefillRequest } from "./types";

const emit = defineEmits<{ prefill: [request: ConvenePrefillRequest]; go: [tab: ConveneTab] }>();

const router = useRouter();
const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const prefs = useConvenePrefs();
const now = useNow();
const { banners, feedLoading, load } = useBannerFeed();
const { pity: historyPity, hasPulls } = useConveneHistory();

const targets = computed(() => advisorTargets(banners.value, now.value));
const hasHistory = computed(() => hasPulls.value);

// ── pity per pool ──
const pityPools = computed(() => {
  const types = [...new Set(targets.value.map((t) => t.poolType))].sort((a, b) => a - b);
  if (!types.length) types.push(1, 2);
  return types.map((type) => {
    const pool = poolOf(type);
    const hist = historyPity.value?.pools.find((p) => p.poolType === type) ?? null;
    const typed = prefs.value.manualPity[String(type)];
    const fromHistory: PoolPityInput | null = hist ? { pity: hist.pity5, guaranteed: hist.guaranteed === true } : null;
    const state: PoolPityInput = typed ?? fromHistory ?? { pity: 0, guaranteed: false };
    // a history that starts mid-count: the counter is a minimum and the 50/50 state unread until a 5★ settles them
    const note = !hist ? null : hist.pity5LowerBound ? (hist.guaranteeKnown ? "pity is a minimum" : "minimum · 50/50 unknown") : !hist.guaranteeKnown ? "50/50 unknown" : null;
    return {
      type,
      name: pool ? `${pool.short} pool` : `Pool ${type}`,
      alwaysFeatured: pool?.alwaysFeatured ?? false,
      state,
      source: typed ? "typed" : fromHistory ? "history" : "none",
      fromHistory: fromHistory != null,
      note,
      noteTitle: "Kuro keeps six months of pulls and your history has no 5★ on this pool yet, so pulls from before the window are missing. Type your real pity if you know it.",
    };
  });
});

const pityByPool = computed(() => {
  const out: Record<number, PoolPityInput> = {};
  for (const p of pityPools.value) out[p.type] = { pity: Math.min(MAX_PULLS_SINCE_LAST_FIVE, p.state.pity), guaranteed: p.state.guaranteed };
  return out;
});

function setPity(type: number, v: ManualPity): void {
  const pity = Math.min(79, Math.max(0, Math.floor(Number(v.pity)) || 0));
  prefs.value = { ...prefs.value, manualPity: { ...prefs.value.manualPity, [String(type)]: { pity, guaranteed: v.guaranteed } } };
}

function clearPity(type: number): void {
  const manualPity = { ...prefs.value.manualPity };
  delete manualPity[String(type)];
  prefs.value = { ...prefs.value, manualPity };
}

const budgetPulls = computed(() => (prefs.value.budgetAstrite ? pullsForAstrite(prefs.value.budgetAstrite) : null));

function setBudget(raw: string): void {
  const n = Math.floor(Number(raw));
  prefs.value = { ...prefs.value, budgetAstrite: Number.isFinite(n) && n > 0 ? n : null };
}

// ── scoring (main thread, yielding — the same pieces /my-rankings runs) ──
const damage = ref<AdviceDamage[]>([]);
const running = ref(false);
const error = ref<string | null>(null);
const progress = ref({ done: 0, total: 0, label: "" });
const open = reactive<Record<string, boolean>>({});

/** kept across tab switches: the targets and the account they were scored on */
let cache: { key: string; damage: AdviceDamage[] } | null = null;
let runId = 0;

/** the targets plus a fingerprint of the account (characters and echoes) they were scored on */
function accountKey(): string {
  const text = JSON.stringify([toRaw(characterStore.characters), toRaw(inventoryStore.echoes)]);
  return `${targets.value.map((t) => t.id).join("|")}#${text.length}:${hashString(text)}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

async function score(force = false): Promise<void> {
  if (!targets.value.length) {
    damage.value = [];
    return;
  }
  const key = accountKey();
  if (!force && cache?.key === key) {
    damage.value = cache.damage;
    return;
  }
  const id = ++runId;
  running.value = true;
  error.value = null;
  progress.value = { done: 0, total: targets.value.length, label: targets.value[0]?.item.name ?? "" };
  try {
    const result = await scoreAdvisorTargets(
      {
        targets: targets.value,
        characters: (toRaw(characterStore.characters) ?? {}) as Record<string, any>,
        echoes: (toRaw(inventoryStore.echoes) ?? []) as any[],
      },
      { onProgress: (done, total, label) => id === runId && (progress.value = { done, total, label }) },
    );
    if (id !== runId) return;
    damage.value = result;
    cache = { key, damage: result };
  } catch (e) {
    if (id === runId) error.value = `The engine stopped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    if (id === runId) running.value = false;
  }
}

onMounted(async () => {
  void score();
  await load({ revalidate: true });
});
watch(
  () => targets.value.map((t) => t.id).join("|"),
  () => void score(),
);

const rows = computed<AdviceRow[]>(() =>
  damage.value.length ? priceAdvice(targets.value, damage.value, { pity: pityByPool.value, budgetAstrite: prefs.value.budgetAstrite }) : [],
);
const summary = computed(() => adviceSummary(rows.value));
const bestPerThousand = computed(() => Math.max(0.0001, ...rows.value.filter((r) => r.rank != null).map((r) => r.steps[0]?.perThousand ?? 0)));

const headline = (r: AdviceRow): string => stepTitle(r, r.steps[0]!);

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** what the simulator needs to show the odds of reaching `step` from where the account is */
function simulate(r: AdviceRow, step: AdviceStep): void {
  const chars = toRaw(characterStore.characters) as Record<string, any>;
  const state = pityByPool.value[r.target.poolType] ?? { pity: 0, guaranteed: false };
  const mode = r.target.kind === "weapon" ? "weapon" : "character";
  let owned = -1;
  if (r.target.kind === "resonator" && r.characterKey && chars[r.characterKey]) owned = sequenceOf(chars[r.characterKey]);
  if (r.target.kind === "weapon" && r.characterKey && chars[r.characterKey]?.weapon === r.target.item.key) owned = refinementOf(chars[r.characterKey]) - 1;
  const targetIndex = Math.min(mode === "character" ? 6 : 5, owned + step.copies);
  const what = r.target.kind === "weapon" ? `${r.target.item.name} R${targetIndex + 1}` : `${r.characterName} S${targetIndex}`;
  emit("prefill", {
    prefill: { mode, startingPity: state.pity, guaranteedNextFeatured: mode === "character" && state.guaranteed, currentOwnedIndex: owned, targetIndex },
    note: `The simulator now aims for ${what} from pity ${state.pity}${mode === "character" ? (state.guaranteed ? " with the guarantee" : " on a 50/50") : ""}. Add your Astrite to see the chance.`,
  });
}

function openInCalculator(key: string | null): void {
  if (!key) return;
  characterStore.setActiveCharacter(key);
  void router.push("/");
}
</script>

<style scoped>
.summary {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: var(--rounded-box, 1rem);
  background: linear-gradient(135deg, oklch(var(--p) / 0.12), oklch(var(--p) / 0.04));
  /* a neutral edge: a saturated primary border antialiases into odd hues at the corners on light themes */
  border: 1px solid oklch(var(--bc) / 0.1);
}
.adv-row {
  padding: 0.85rem 1rem;
  border-radius: var(--rounded-box, 1rem);
  background: oklch(var(--b2));
  border: 1px solid oklch(var(--bc) / 0.06);
}
.adv-row--muted {
  background: oklch(var(--b2) / 0.55);
}
.adv-row__head {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}
.adv-rank {
  width: 2.4rem;
  flex-shrink: 0;
  text-align: center;
  font-weight: 700;
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
  color: oklch(var(--bc) / 0.45);
}
.adv-rank--top {
  color: oklch(var(--p));
}
.adv-metrics {
  display: flex;
  gap: 1.1rem;
  flex-shrink: 0;
}
.adv-metric {
  min-width: 5.5rem;
  text-align: right;
}
.adv-metric__value {
  font-size: 1.15rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.adv-metric__label {
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.55);
}
.adv-metric--key .adv-metric__value {
  color: oklch(var(--p));
}
.adv-bar {
  margin-top: 0.7rem;
  height: 0.35rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.07);
  overflow: hidden;
}
.adv-bar > div {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, oklch(var(--p) / 0.6), oklch(var(--p)));
}
.ladder th {
  font-weight: 500;
  white-space: nowrap;
}
/* phones: the three numbers drop under the name as one row of three */
@media (max-width: 639px) {
  .adv-row__head > .min-w-0 {
    flex: 1 1 0;
  }
  .adv-metrics {
    flex-basis: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .adv-metric {
    min-width: 0;
    text-align: left;
  }
  .adv-rank {
    width: auto;
  }
}
</style>
