<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="my-rankings px-4 py-4 mx-auto w-full max-w-6xl" data-test-my-rankings>
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <h1 class="text-2xl font-bold">My roster rankings</h1>
      <div class="join">
        <RouterLink to="/rankings" class="btn btn-sm join-item" data-test-rankings-switch-calc>wuwa_calc rankings</RouterLink>
        <span class="btn btn-sm btn-primary join-item no-animation pointer-events-none">My roster</span>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <label class="label cursor-pointer gap-2 py-0">
          <input v-model="investment" type="checkbox" class="checkbox checkbox-sm" :disabled="isRunning" />
          <span class="label-text text-sm">estimate next sequence &amp; R5</span>
        </label>
        <button type="button" class="btn btn-primary btn-sm" :disabled="isRunning || !characterCount" data-test-my-rankings-compute @click="compute">
          <span v-if="isRunning" class="loading loading-spinner loading-xs"></span>
          {{ isRunning ? "Ranking…" : ranking ? "Recompute" : "Rank my roster" }}
        </button>
      </div>
    </div>
    <p class="text-sm opacity-70 mb-3">
      Your characters and teams, scored by this app's own damage engine on your real builds — weapon, echoes,
      resonance chains and buffs as you have them set up. Every saved rotation, curated preset and wuwa_calc loop is
      tried and the best one counts. Enemy: level 100, 20 % resistance, no stacks (Riley's target, so the numbers sit
      beside the wuwa_calc rankings).
    </p>

    <div v-if="!characterCount" class="alert" data-test-my-rankings-empty>
      <span>No character has a weapon equipped yet. Build a character in the calculator (weapon, echoes, chains), or import your data under Settings › Backup &amp; Restore.</span>
    </div>

    <div v-if="isRunning" class="mb-3">
      <progress class="progress progress-primary w-full" :value="progress.done" :max="progress.total || 1"></progress>
      <div class="text-xs opacity-70" data-test-my-rankings-progress>{{ progress.done }} / {{ progress.total }} · {{ progress.label }}</div>
    </div>

    <template v-if="ranking">
      <h2 class="text-lg font-bold mt-2 mb-1">Characters</h2>
      <div class="overflow-x-auto">
        <table class="table table-sm" data-test-my-rankings-characters>
          <thead>
            <tr>
              <th>#</th>
              <th>Character</th>
              <th>Weapon</th>
              <th>Best rotation</th>
              <th class="text-right">Avg DMG / rotation</th>
              <th></th>
              <th v-if="investment" class="text-right" title="estimate: the next sequence node's chains switched on, best rotation">next S</th>
              <th v-if="investment" class="text-right" title="estimate: the weapon at R5, best rotation">R5</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(c, i) in ranking.characters" :key="c.id">
            <tr :data-test-my-rankings-row="c.id">
              <td class="opacity-60">{{ i + 1 }}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="size-9 rounded-full bg-cover bg-center border border-base-300 shrink-0" :style="{ backgroundImage: `url(${characterPortraitUrl(c.id)})` }"></div>
                  <div>
                    <div class="font-semibold">{{ c.name }}</div>
                    <div class="text-xs opacity-60">S{{ c.sequence }} · R{{ c.refinement }}</div>
                  </div>
                </div>
              </td>
              <td class="text-sm">{{ c.weapon ?? "—" }}</td>
              <td class="text-sm">
                <template v-if="c.best">
                  <div>{{ c.best.name }}</div>
                  <div class="text-xs opacity-60">{{ sourceLabel(c.best.source) }} · {{ c.rotationsEvaluated }} tried</div>
                </template>
                <span v-else class="opacity-60">no rotation with actions</span>
              </td>
              <td class="text-right tabular-nums font-semibold" data-test-my-rankings-damage>{{ c.best ? fmt(c.best.avgDamage) : "—" }}</td>
              <td class="w-40"><progress class="progress progress-primary w-full" :value="c.best?.avgDamage ?? 0" :max="maxCharacterDamage || 1"></progress></td>
              <td v-if="investment" class="text-right tabular-nums text-sm" :class="deltaClass(c.nextSequence)">{{ c.nextSequence ? `${c.nextSequence.label} ${pct(c.nextSequence.gain)}` : c.sequence >= 6 ? "S6" : "—" }}</td>
              <td v-if="investment" class="text-right tabular-nums text-sm" :class="deltaClass(c.refineFive)">{{ c.refineFive ? pct(c.refineFive.gain) : c.refinement >= 5 ? "R5" : "—" }}</td>
              <td>
                <button type="button" class="btn btn-ghost btn-xs whitespace-nowrap" :disabled="!c.bestRotation" :data-test-my-rankings-whatif="c.id" title="score this character at another sequence, weapon or refinement on the same rotation" @click="toggleWhatIf(c)">
                  what if…
                </button>
              </td>
            </tr>
            <tr v-if="whatIfs[c.id]?.open" :data-test-my-rankings-whatif-panel="c.id">
              <td :colspan="investment ? 9 : 7" class="bg-base-200/40">
                <div class="flex flex-wrap items-end gap-3 py-1">
                  <label class="form-control">
                    <span class="label-text text-xs">Sequence</span>
                    <select v-model.number="whatIfs[c.id].sequence" class="select select-bordered select-xs" data-test-my-rankings-whatif-sequence>
                      <option v-for="n in [0, 1, 2, 3, 4, 5, 6]" :key="n" :value="n">S{{ n }}{{ n === c.sequence ? " (now)" : "" }}</option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">Weapon</span>
                    <select v-model="whatIfs[c.id].weapon" class="select select-bordered select-xs max-w-60" data-test-my-rankings-whatif-weapon>
                      <option v-for="w in whatIfs[c.id].weapons" :key="w.key" :value="w.key">{{ weaponLabel(w) }}{{ w.key === c.weapon ? " (now)" : ownedWeapons(c.id).has(w.key) ? " (owned)" : "" }}</option>
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text text-xs">Refinement</span>
                    <select v-model.number="whatIfs[c.id].refinement" class="select select-bordered select-xs" data-test-my-rankings-whatif-refinement>
                      <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">R{{ n }}{{ n === c.refinement && whatIfs[c.id].weapon === c.weapon ? " (now)" : "" }}</option>
                    </select>
                  </label>
                  <button type="button" class="btn btn-primary btn-xs" :disabled="whatIfs[c.id].running" data-test-my-rankings-whatif-run @click="runWhatIf(c)">
                    <span v-if="whatIfs[c.id].running" class="loading loading-spinner loading-xs"></span>
                    Score this build
                  </button>
                  <span v-if="whatIfs[c.id].result" class="text-sm tabular-nums" data-test-my-rankings-whatif-result>
                    {{ whatIfs[c.id].result?.label }}: <b>{{ fmt(whatIfs[c.id].result?.avgDamage ?? 0) }}</b>
                    <span :class="gainClass(whatIfs[c.id].result?.gain ?? 0)">{{ pct(whatIfs[c.id].result?.gain ?? 0) }}</span>
                    <span class="opacity-60">vs {{ fmt(whatIfs[c.id].result?.base ?? 0) }} now, on {{ whatIfs[c.id].result?.rotation }}</span>
                  </span>
                  <span v-if="whatIfs[c.id].error" class="text-xs text-error">{{ whatIfs[c.id].error }}</span>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p v-if="errorCount" class="text-xs text-warning mt-1">{{ errorCount }} rotation{{ errorCount === 1 ? "" : "s" }} could not be scored (unknown actions on this build); they were skipped.</p>

      <h2 class="text-lg font-bold mt-6 mb-1">Teams</h2>
      <p v-if="!ranking.teams.length" class="text-sm opacity-70" data-test-my-rankings-no-teams>
        No team to rank yet: a team needs actions and all three members present in your data. Import one from the
        wuwa_calc rankings page or Teams › List Presets, then recompute.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="table table-sm" data-test-my-rankings-teams>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Source</th>
              <th class="text-right">Team avg DMG / rotation</th>
              <th class="text-right">Per slot</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in ranking.teams" :key="t.id" :data-test-my-rankings-team="t.name">
              <td class="opacity-60">{{ i + 1 }}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="flex -space-x-2">
                    <div v-for="cid in t.characterIds" :key="cid" class="size-8 rounded-full bg-cover bg-center border border-base-300" :style="{ backgroundImage: `url(${characterPortraitUrl(cid)})` }" :title="getCharacterRosterDisplayName(cid)"></div>
                  </div>
                  <div class="text-sm">
                    {{ t.name }}
                    <div v-if="t.unarmed.length" class="text-xs text-warning">no weapon: {{ t.unarmed.map((cid) => getCharacterRosterDisplayName(cid)).join(", ") }}</div>
                  </div>
                </div>
              </td>
              <td class="text-xs opacity-70">{{ sourceLabel(t.source) }}</td>
              <td class="text-right tabular-nums font-semibold">{{ fmt(t.avgDamage) }}</td>
              <td class="text-right tabular-nums text-xs opacity-80">{{ t.perSlot.map((d) => fmt(d)).join(" · ") }}</td>
              <td class="w-40"><progress class="progress progress-secondary w-full" :value="t.avgDamage" :max="maxTeamDamage || 1"></progress></td>
            </tr>
          </tbody>
        </table>
        <p v-if="ranking.teamsSkipped" class="text-xs opacity-60 mt-1">{{ ranking.teamsSkipped }} team{{ ranking.teamsSkipped === 1 ? "" : "s" }} skipped (no actions, or a member not set up).</p>
      </div>
      <p class="text-xs opacity-50 mt-4">Computed {{ new Date(ranking.computedAt).toLocaleString() }}.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ phase E — see rankRoster.ts for the scoring.
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import Nav from "../../components/navigation/Nav.vue";
import { characterPortraitUrl, getCharacterRosterDisplayName } from "../../characters/characters";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import {
  isSetUp,
  rankRoster,
  weaponOptionsFor,
  whatIf,
  type CharacterRank,
  type InvestmentDelta,
  type RosterRanking,
  type RotationSource,
  type WeaponOption,
  type WhatIfResult,
} from "./rankRoster";

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, unknown> } };
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: unknown[] } };

/** kept across visits so coming back to the page doesn't recompute */
let cachedRanking: RosterRanking | null = null;
let cachedKey = "";

const ranking = ref<RosterRanking | null>(cachedRanking);
const isRunning = ref(false);
const investment = ref(true);
const progress = ref({ done: 0, total: 0, label: "" });

const characterCount = computed(() => Object.values((characters.value ?? {}) as Record<string, Record<string, unknown>>).filter((c) => isSetUp(c)).length);
const maxCharacterDamage = computed(() => Math.max(0, ...(ranking.value?.characters.map((c) => c.best?.avgDamage ?? 0) ?? [0])));
const maxTeamDamage = computed(() => Math.max(0, ...(ranking.value?.teams.map((t) => t.avgDamage) ?? [0])));
const errorCount = computed(() => ranking.value?.characters.reduce((n, c) => n + c.errors.length, 0) ?? 0);

const fmt = (n: number): string => Math.round(n).toLocaleString();
const pct = (g: number): string => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`;
const deltaClass = (d: InvestmentDelta | null): string => (d ? (d.gain > 0.0005 ? "text-success" : "opacity-60") : "opacity-40");
const gainClass = (g: number): string => (g > 0.0005 ? "text-success" : g < -0.0005 ? "text-error" : "opacity-60");

// ---- what-if builds: the character at another sequence / weapon / refinement, scored on the same best rotation
interface WhatIfState {
  open: boolean;
  sequence: number;
  weapon: string;
  refinement: number;
  weapons: WeaponOption[];
  running: boolean;
  result: WhatIfResult | null;
  error: string | null;
}
const whatIfs = ref<Record<string, WhatIfState>>({});
const weaponLabel = (w: WeaponOption): string => `${w.rarity ? `${w.rarity}★ ` : ""}${w.name}`;
function ownedWeapons(id: string): Set<string> {
  const data = ((characters.value ?? {}) as Record<string, { weapons?: Record<string, unknown> }>)[id];
  return new Set(Object.keys(data?.weapons ?? {}));
}
async function toggleWhatIf(c: CharacterRank): Promise<void> {
  const current = whatIfs.value[c.id];
  if (current) {
    current.open = !current.open;
    return;
  }
  whatIfs.value = { ...whatIfs.value, [c.id]: { open: true, sequence: c.sequence, weapon: c.weapon ?? "", refinement: c.refinement, weapons: [], running: false, result: null, error: null } };
  const state = whatIfs.value[c.id];
  let options: WeaponOption[] = [];
  try {
    options = await weaponOptionsFor(c.id);
  } catch {
    /* no registry list: the equipped weapon alone */
  }
  if (c.weapon && !options.some((w) => w.key === c.weapon)) options.unshift({ key: c.weapon, name: c.weapon, rarity: 0 });
  state.weapons = options;
}
async function runWhatIf(c: CharacterRank): Promise<void> {
  const state = whatIfs.value[c.id];
  if (!state || !c.bestRotation || state.running) return;
  state.running = true;
  state.error = null;
  try {
    state.result = await whatIf(
      c.id,
      JSON.parse(JSON.stringify(characters.value ?? {})),
      JSON.parse(JSON.stringify(inventoryStore.echoes ?? [])),
      c.bestRotation,
      { sequence: state.sequence, weapon: state.weapon || undefined, refinement: state.refinement },
    );
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.running = false;
  }
}
const sourceLabel = (s: RotationSource): string => (s === "yours" ? "your rotation" : s === "curated" ? "curated preset" : "wuwa_calc");

function fingerprint(): string {
  return `${JSON.stringify(characters.value ?? {}).length}:${(inventoryStore.echoes ?? []).length}:${JSON.stringify(teams.value ?? []).length}:${investment.value}`;
}

async function compute(): Promise<void> {
  if (isRunning.value) return;
  isRunning.value = true;
  progress.value = { done: 0, total: 0, label: "starting" };
  try {
    const result = await rankRoster(
      JSON.parse(JSON.stringify(characters.value ?? {})),
      JSON.parse(JSON.stringify(inventoryStore.echoes ?? [])),
      JSON.parse(JSON.stringify(teams.value ?? [])),
      {
        investment: investment.value,
        onProgress: (done, total, label) => {
          progress.value = { done, total, label };
        },
      },
    );
    ranking.value = result;
    cachedRanking = result;
    cachedKey = fingerprint();
  } finally {
    isRunning.value = false;
  }
}

onMounted(() => {
  if (characterCount.value && (!cachedRanking || cachedKey !== fingerprint())) void compute();
});
</script>
