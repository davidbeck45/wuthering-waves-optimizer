<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="my-rankings px-4 py-4 mx-auto w-full max-w-6xl" data-test-my-rankings>
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <h1 class="text-2xl font-bold">My roster rankings</h1>
      <div class="join">
        <RouterLink to="/rankings" class="btn btn-sm join-item" data-test-rankings-switch-calc>wuwa_calc rankings</RouterLink>
        <span class="btn btn-sm btn-primary join-item no-animation pointer-events-none">My roster</span>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2 max-md:w-full max-md:ml-0">
        <label class="label cursor-pointer gap-2 py-0">
          <input v-model="investment" type="checkbox" class="checkbox checkbox-sm" :disabled="isRunning" />
          <span class="label-text text-sm">estimate next sequence &amp; R5</span>
        </label>
          <AutoTeamBuffsToggle />
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

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3 px-3 py-2 rounded-box bg-base-200/60" data-test-my-rankings-account>
      <span class="font-semibold">Account</span>
      <span><b class="tabular-nums">{{ account.summary.owned }}</b> characters set up <span class="opacity-60">(of {{ account.summary.characters }} in the calculator)</span></span>
      <span><b class="tabular-nums">{{ account.summary.s6 }}</b> at S6</span>
      <span><b class="tabular-nums">{{ account.echoes.total }}</b> echoes <span class="opacity-60">({{ account.echoes.equipped }} equipped)</span></span>
      <span><b class="tabular-nums">{{ account.summary.teamsFieldable }}</b> of {{ account.summary.teams }} teams fieldable</span>
      <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash() }" class="link link-primary ml-auto" data-test-my-rankings-open-mine>wuwa_calc rankings at my account ▸</RouterLink>
    </div>

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
        <table class="table table-sm table--cards" data-test-my-rankings-characters>
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
              <td class="opacity-60 cell--rank">{{ i + 1 }}</td>
              <td class="cell--who">
                <div class="flex items-center gap-2">
                  <div class="size-9 rounded-full bg-cover bg-center border border-base-300 shrink-0" :style="{ backgroundImage: `url(${characterPortraitUrl(c.id)})` }"></div>
                  <div>
                    <div class="font-semibold">{{ c.name }}</div>
                    <div class="text-xs opacity-60">S{{ c.sequence }} · R{{ c.refinement }}</div>
                  </div>
                </div>
              </td>
              <td class="text-sm cell--weapon" data-label="Weapon">{{ c.weapon ?? "—" }}</td>
              <td class="text-sm cell--best" data-label="Best rotation">
                <template v-if="c.best">
                  <div>{{ c.best.name }}</div>
                  <div class="text-xs opacity-60">{{ sourceLabel(c.best.source) }} · {{ c.rotationsEvaluated }} tried</div>
                </template>
                <span v-else class="opacity-60">no rotation with actions</span>
              </td>
              <td class="text-right tabular-nums font-semibold cell--dmg" data-test-my-rankings-damage>{{ c.best ? fmt(c.best.avgDamage) : "—" }}</td>
              <td class="w-40 cell--bar"><progress class="progress progress-primary w-full" :value="c.best?.avgDamage ?? 0" :max="maxCharacterDamage || 1"></progress></td>
              <td v-if="investment" class="text-right tabular-nums text-sm cell--delta" data-label="next S" :class="deltaClass(c.nextSequence)">{{ c.nextSequence ? `${c.nextSequence.label} ${pct(c.nextSequence.gain)}` : c.sequence >= 6 ? "S6" : "—" }}</td>
              <td v-if="investment" class="text-right tabular-nums text-sm cell--delta" data-label="R5" :class="deltaClass(c.refineFive)">{{ c.refineFive ? pct(c.refineFive.gain) : c.refinement >= 5 ? "R5" : "—" }}</td>
              <td class="cell--actions">
                <button type="button" class="btn btn-ghost btn-xs whitespace-nowrap" :disabled="!c.bestRotation" :data-test-my-rankings-whatif="c.id" title="score this character at another sequence, weapon or refinement on the same rotation" @click="toggleWhatIf(c)">
                  what if…
                </button>
                <button type="button" class="btn btn-ghost btn-xs whitespace-nowrap" :disabled="!c.bestRotation" :data-test-my-rankings-substats="c.id" title="what one more roll of each substat is worth on this build, on the same rotation — what to look for as you roll echoes" @click="toggleSubstats(c)">
                  substats
                </button>
                <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash([c.id]) }" class="btn btn-ghost btn-xs whitespace-nowrap" title="wuwa_calc's teams with this character, at your account's sequences and weapons" :data-test-my-rankings-mine-link="c.id">rankings ▸</RouterLink>
              </td>
            </tr>
            <tr v-if="whatIfs[c.id]?.open" class="row--panel" :data-test-my-rankings-whatif-panel="c.id">
              <td :colspan="investment ? 9 : 7" class="bg-base-200/40 cell--panel">
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
            <tr v-if="substats[c.id]?.open" class="row--panel" :data-test-my-rankings-substats-panel="c.id">
              <td :colspan="investment ? 9 : 7" class="bg-base-200/40 cell--panel">
                <div class="subs py-1">
                  <div class="text-xs opacity-70 mb-1">
                    Substat weights: what one more line of each substat on one of your equipped echoes would add to this build's
                    <template v-if="substats[c.id].result">{{ fmt(substats[c.id].result!.baseline) }} average damage</template><template v-else>damage</template>
                    on {{ c.best?.name }}. Left of each arrow is the size of the roll, right of it the damage it adds. The top of the list is what to look for.
                  </div>
                  <details class="subs__help text-xs mb-2" data-test-my-rankings-substats-help>
                    <summary class="cursor-pointer opacity-70 hover:opacity-100">How to read these numbers</summary>
                    <ul class="subs__help-list opacity-80">
                      <li><b>Expected roll</b>: the average roll of the stat, every tier weighted by how often it drops. An average, so not always a tier the game can show — flat ATK averages {{ rollLabel(expectedRoll("ATK_FLAT"), true) }} between the 40 and 50 tiers.</li>
                      <li><b>Median roll</b>: the middle tier, half of all rolls land on it or lower. Always a real tier ({{ rollLabel(medianRoll("ATK_FLAT"), true) }} flat ATK, {{ rollLabel(medianRoll("CritDMG"), false) }} Crit DMG).</li>
                      <li><b>Best roll</b>: the top tier, the most one line can pay.</li>
                      <li><b>+1 tier</b>: one step up the tier ladder ({{ rollLabel(tierStep("CritRate"), false) }} Crit Rate, {{ rollLabel(tierStep("CritDMG"), false) }} Crit DMG, {{ rollLabel(tierStep("ATK_FLAT"), true) }} flat ATK). What a line you already have gains from rolling one tier higher — the gap between two echoes whose lines differ by one tier.</li>
                      <li><b>The bar</b>: the expected gain next to the best substat's. A full bar is the stat to look for, an empty one does nothing on this rotation.</li>
                      <li>The gains do not follow the roll sizes: what a roll pays depends on what the build already has (Crit Rate past 100 % is wasted, a stat you stack pays a little less each time). Compare rolls, not points — every substat line on an echo is one roll.</li>
                      <li>A stat at +0.0 % does not feed this rotation. Energy Regen always reads 0 here: the engine has no energy model, so keep the ER the rotation needs.</li>
                    </ul>
                  </details>
                  <div v-if="substats[c.id].running" class="text-sm"><span class="loading loading-spinner loading-xs"></span> scoring…</div>
                  <span v-if="substats[c.id].error" class="text-xs text-error">{{ substats[c.id].error }}</span>
                  <div v-if="substats[c.id].result" class="subs__grid tabular-nums text-sm" data-test-my-rankings-substats-result>
                    <div class="subs__row subs__row--head">
                      <div class="subs__head">Substat</div>
                      <div class="subs__head" title="the average roll, every tier weighted by how often it drops">Expected roll</div>
                      <div class="subs__head" title="the middle tier: half of all rolls land on it or lower">Median roll</div>
                      <div class="subs__head" title="the top tier">Best roll</div>
                      <div class="subs__head" title="one tier step: what an existing line gains from rolling one tier higher">+1 tier</div>
                      <div class="subs__head"></div>
                    </div>
                    <div v-for="w in substats[c.id].result?.weights ?? []" :key="w.key" class="subs__row">
                      <div class="subs__name"><span class="max-md:hidden">{{ w.label }}</span><span class="md:hidden">{{ w.short }}</span></div>
                      <div class="subs__gain" :class="gainClass(w.gain)" :data-test-my-rankings-substat="w.key"><span class="opacity-60">{{ rollLabel(w.roll, w.flat) }} →</span> {{ pct(w.gain) }}</div>
                      <div class="subs__more">
                        <div class="subs__gain subs__gain--more" :class="gainClass(w.medianGain)" :data-test-my-rankings-substat-median="w.key"><span class="opacity-60"><span class="md:hidden">median </span>{{ rollLabel(w.medianRoll, w.flat) }} →</span> {{ pct(w.medianGain) }}</div>
                        <div class="subs__gain subs__gain--more" :class="gainClass(w.maxGain)"><span class="opacity-60"><span class="md:hidden">best </span>{{ rollLabel(w.maxRoll, w.flat) }} →</span> {{ pct(w.maxGain) }}</div>
                        <div class="subs__gain subs__gain--more" :class="gainClass(w.stepGain)" :data-test-my-rankings-substat-step="w.key"><span class="opacity-60"><span class="md:hidden">+1 tier </span>{{ rollLabel(w.step, w.flat) }} →</span> {{ pct2(w.stepGain) }}</div>
                      </div>
                      <div class="subs__bar"><div class="subs__fill" :style="{ width: `${Math.round(w.weight * 100)}%` }"></div></div>
                    </div>
                  </div>
                  <p v-if="substats[c.id].result" class="text-xs mt-1">
                    <span class="opacity-70">Look for:</span> <b>{{ lookFor(substats[c.id].result!) }}</b>
                    <span v-if="erReadsZero(substats[c.id].result!)" class="opacity-70"> · Energy Regen reads 0 here — the engine has no energy model, keep the ER the rotation needs</span>
                  </p>
                  <div v-if="substats[c.id].echoes?.length" class="mt-2 text-xs flex flex-wrap items-center gap-1" data-test-my-rankings-substats-echoes>
                    <span class="opacity-70 mr-1">Your echoes' substats on this rotation (lowest = re-roll first):</span>
                    <span v-for="e in echoesWorstFirst(substats[c.id].echoes ?? [])" :key="e.slot" class="badge badge-ghost badge-sm tabular-nums">
                      {{ e.cost }}-cost {{ echoLabel(e.echo) }} · {{ e.main }} · <b class="ml-1" :class="gainClass(e.worth)">{{ pct(e.worth) }}</b>
                    </span>
                  </div>
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
        <table class="table table-sm table--cards" data-test-my-rankings-teams>
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
              <td class="opacity-60 cell--rank">{{ i + 1 }}</td>
              <td class="cell--who">
                <div class="flex items-center gap-2">
                  <div class="flex -space-x-2 shrink-0">
                    <div v-for="cid in t.characterIds" :key="cid" class="size-8 rounded-full bg-cover bg-center border border-base-300" :style="{ backgroundImage: `url(${characterPortraitUrl(cid)})` }" :title="getCharacterRosterDisplayName(cid)"></div>
                  </div>
                  <div class="text-sm">
                    {{ t.name }}
                    <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash(t.characterIds) }" class="link link-primary text-xs ml-2" title="wuwa_calc's teams with these three, at your account's sequences and weapons" :data-test-my-rankings-team-mine-link="t.name">rankings ▸</RouterLink>
                    <div v-if="t.unarmed.length" class="text-xs text-warning">no weapon: {{ t.unarmed.map((cid) => getCharacterRosterDisplayName(cid)).join(", ") }}</div>
                  </div>
                </div>
              </td>
              <td class="text-xs opacity-70 cell--weapon" data-label="Source">{{ sourceLabel(t.source) }}</td>
              <td class="text-right tabular-nums font-semibold cell--dmg">{{ fmt(t.avgDamage) }}</td>
              <td class="text-right tabular-nums text-xs opacity-80 cell--best" data-label="Per slot">{{ t.perSlot.map((d) => fmt(d)).join(" · ") }}</td>
              <td class="w-40 cell--bar"><progress class="progress progress-secondary w-full" :value="t.avgDamage" :max="maxTeamDamage || 1"></progress></td>
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
import { RANKING_ENEMY } from "./rankRoster";
import { equippedSubstatWorth, rotationScorer, substatWeights, type EchoSubstatWorth, type SubstatWeightsResult, expectedRoll, medianRoll, tierStep } from "../substats/substatWeights";
import { mainEchoesData } from "../../echoes/index";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import AutoTeamBuffsToggle from "../teamContext/AutoTeamBuffsToggle.vue";
import { accountStateOf, rankingsMineHash } from "../account/accountState";
import "../phone-tables.css";

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
// the Account State (src/sim/account): what the `mine` cost on /rankings runs, summarised
const account = computed(() =>
  accountStateOf(
    (characters.value ?? {}) as Record<string, Record<string, unknown>>,
    { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} },
    (teams.value ?? []) as Array<Record<string, unknown>>,
  ),
);
const maxCharacterDamage = computed(() => Math.max(0, ...(ranking.value?.characters.map((c) => c.best?.avgDamage ?? 0) ?? [0])));
const maxTeamDamage = computed(() => Math.max(0, ...(ranking.value?.teams.map((t) => t.avgDamage) ?? [0])));
const errorCount = computed(() => ranking.value?.characters.reduce((n, c) => n + c.errors.length, 0) ?? 0);

const fmt = (n: number): string => Math.round(n).toLocaleString();
const pct = (g: number): string => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`;
/** two decimals for the one-tier column, whose gains sit an order below a whole roll's */
const pct2 = (g: number): string => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(2)}%`;
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

// ---- substat weights: one more roll of each substat on the build, scored on the same best rotation (src/sim/substats)
interface SubstatsState {
  open: boolean;
  running: boolean;
  result: SubstatWeightsResult | null;
  echoes: EchoSubstatWorth[] | null;
  error: string | null;
}
const substats = ref<Record<string, SubstatsState>>({});
const rollLabel = (value: number, flat: boolean): string => (flat ? `+${Math.round(value)}` : `+${value.toFixed(1)}%`);
const echoLabel = (key: string | null): string => (key ? ((mainEchoesData as Record<string, { name?: string }>)[key]?.name ?? key) : "echo");
const lookFor = (r: SubstatWeightsResult): string => r.weights.filter((w) => w.weight >= 0.5).map((w) => w.label).join(", ") || "nothing moves this number";
const erReadsZero = (r: SubstatWeightsResult): boolean => Math.abs(r.weights.find((w) => w.key === "EnergyRegen")?.gain ?? 0) < 0.0005;
const echoesWorstFirst = (list: EchoSubstatWorth[]): EchoSubstatWorth[] => [...list].sort((a, b) => a.worth - b.worth);
async function toggleSubstats(c: CharacterRank): Promise<void> {
  const current = substats.value[c.id];
  if (current) {
    current.open = !current.open;
    return;
  }
  substats.value = { ...substats.value, [c.id]: { open: true, running: true, result: null, echoes: null, error: null } };
  const state = substats.value[c.id];
  if (!c.bestRotation) {
    state.running = false;
    state.error = "no rotation to score";
    return;
  }
  try {
    const chars = JSON.parse(JSON.stringify(characters.value ?? {}));
    const echoes = JSON.parse(JSON.stringify(inventoryStore.echoes ?? []));
    const score = rotationScorer(c.id, c.bestRotation, RANKING_ENEMY);
    const baseline = await score(chars, echoes);
    state.result = await substatWeights(c.id, chars, echoes, score, { baseline });
    state.echoes = await equippedSubstatWorth(c.id, chars, echoes, score, { baseline });
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.running = false;
  }
}

function fingerprint(): string {
  return `${JSON.stringify(characters.value ?? {}).length}:${(inventoryStore.echoes ?? []).length}:${JSON.stringify(teams.value ?? []).length}:${investment.value}:${autoTeamBuffs.value}`;
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
        autoTeamBuffs: autoTeamBuffs.value,
        onProgress: (done, total, label) => {
          progress.value = { done, total, label };
        },
      },
    );
    ranking.value = result;
    cachedRanking = result;
    cachedKey = fingerprint();
    substats.value = {}; // scored on the previous data

  } finally {
    isRunning.value = false;
  }
}

onMounted(() => {
  if (characterCount.value && (!cachedRanking || cachedKey !== fingerprint())) void compute();
});
</script>

<style scoped lang="scss">
/* the substat weights panel: a grid, not a nested table (the phone card rules turn every td into a block);
   each row is a `display: contents` wrapper so a phone can turn it into a wrapping flex line instead */
.subs__grid {
  display: grid;
  grid-template-columns: max-content max-content max-content max-content max-content minmax(4rem, 1fr);
  column-gap: 1rem;
  row-gap: 0.15rem;
  align-items: center;
  max-width: 60rem;
}
.subs__row,
.subs__more {
  display: contents;
}
.subs__help {
  max-width: 60rem;
}
.subs__help-list {
  list-style: disc;
  padding-left: 1.1rem;
  margin-top: 0.25rem;
  display: grid;
  row-gap: 0.15rem;
}
.subs__head {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.55;
}
.subs__bar {
  height: 0.5rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.1);
  overflow: hidden;
}
.subs__fill {
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p));
}
@media (max-width: 767px) {
  /* one wrapping line per substat: name · expected roll → gain · bar; the median, best and one-tier rolls underneath in small print */
  .subs__grid {
    display: block;
  }
  .subs__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 0.6rem;
    padding: 0.15rem 0;
  }
  .subs__row--head {
    display: none;
  }
  .subs__gain {
    font-size: 0.8rem;
  }
  .subs__bar {
    flex: 1 1 4rem;
    order: 1;
  }
  .subs__more {
    order: 2;
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.75rem;
  }
  .subs__gain--more {
    font-size: 0.7rem;
    opacity: 0.85;
  }
}

/* the card order below 768 px - the generic reflow lives in ../phone-tables.css */
@media (max-width: 767px) {
  .table--cards {
    .cell--rank {
      order: 0;
      min-width: 1.25rem;
    }
    .cell--who {
      order: 0;
      flex: 1 1 0;
      min-width: 0;
    }
    .cell--dmg {
      order: 0;
      margin-left: auto;
    }
    .cell--weapon,
    .cell--best {
      order: 1;
      flex-basis: 100%;
      text-align: left;
    }
    .cell--bar {
      order: 2;
      flex-basis: 100%;
      width: auto;
    }
    .cell--delta {
      order: 3;
      text-align: left;
    }
    .cell--actions {
      order: 4;
      flex-basis: 100%;
      display: flex;
      gap: 0.25rem;
    }
    .row--panel {
      padding: 0;
      border-bottom: 0;
    }
    .cell--panel {
      flex-basis: 100%;
      min-width: 0;
      padding: 0.5rem;
    }
  }
}
</style>
