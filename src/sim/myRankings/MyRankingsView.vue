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
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, i) in ranking.characters" :key="c.id" :data-test-my-rankings-row="c.id">
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
            </tr>
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
import { isSetUp, rankRoster, type InvestmentDelta, type RosterRanking, type RotationSource } from "./rankRoster";

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
