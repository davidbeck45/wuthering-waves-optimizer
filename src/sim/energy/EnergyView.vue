<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="en-ui en-page px-4 py-4 mx-auto w-full max-w-6xl" data-test-energy-page>
    <header class="en-page__head">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold">Energy check</h1>
        <p class="en-page__lead">
          How much Energy Regen each member of your teams needs — measured frame by frame in Riley31415's wuwa_calc loop for
          that team, at your own sequences, weapons and echoes — and how much their build has.
        </p>
      </div>
      <div class="en-page__actions">
        <RouterLink to="/my-rankings" class="btn btn-sm btn-ghost" data-test-energy-to-my-rankings>My roster rankings</RouterLink>
        <button type="button" class="btn btn-sm btn-primary" :disabled="energy.busy.value || !teams.length" data-test-energy-recheck @click="energy.recheck()">
          <span v-if="energy.busy.value" class="loading loading-spinner loading-xs"></span>
          {{ energy.busy.value ? "Checking…" : "Re-check" }}
        </button>
      </div>
    </header>

    <!-- summary -->
    <section v-if="teams.length" class="en-kpis" aria-label="Summary" data-test-energy-summary>
      <div class="en-kpi">
        <span class="en-kpi__label">Teams checked</span>
        <span class="en-kpi__value">{{ summary.measured }}<span class="en-kpi__of"> / {{ summary.teams }}</span></span>
        <span class="en-kpi__sub">{{ summary.members }} members measured</span>
      </div>
      <div class="en-kpi" :class="{ 'en-kpi--short': summary.shortCharacters.length }" data-test-energy-kpi-short>
        <span class="en-kpi__label"><EnergyStatusIcon status="short" class="en-kpi__icon en-kpi__icon--short" />Short on ER</span>
        <span class="en-kpi__value">{{ summary.shortCharacters.length }}</span>
        <span class="en-kpi__sub">{{ summary.shortCharacters.length ? summary.shortCharacters.map(nameOf).join(", ") : "every Liberation paid" }}</span>
      </div>
      <div class="en-kpi" data-test-energy-kpi-tight>
        <span class="en-kpi__label"><EnergyStatusIcon status="tight" class="en-kpi__icon en-kpi__icon--tight" />Tight · within {{ TIGHT_MARGIN }}%</span>
        <span class="en-kpi__value">{{ tightCharacters.length }}</span>
        <span class="en-kpi__sub">{{ tightCharacters.length ? tightCharacters.map(nameOf).join(", ") : "nobody one bad loop from late" }}</span>
      </div>
      <div class="en-kpi" data-test-energy-kpi-crit>
        <span class="en-kpi__label">Crit Rate past 100&nbsp;%</span>
        <span class="en-kpi__value">{{ summary.overcapCharacters.length }}</span>
        <span class="en-kpi__sub">{{ summary.overcapCharacters.length ? summary.overcapCharacters.map(nameOf).join(", ") : "no damage wasted on crit" }}</span>
      </div>
    </section>

    <!-- empty states -->
    <div v-if="!setUpCount" class="en-empty" data-test-energy-empty>
      <h2 class="en-empty__title">No character is set up yet</h2>
      <p class="en-empty__text">The energy check compares the Energy Regen each build has with what its team needs. Give your characters a weapon and echoes, or bring your account in.</p>
      <div class="en-empty__actions">
        <RouterLink to="/" class="btn btn-sm btn-primary">Open the calculator</RouterLink>
        <RouterLink to="/settings" class="btn btn-sm btn-ghost">Import a backup</RouterLink>
      </div>
    </div>
    <div v-else-if="!teams.length" class="en-empty" data-test-energy-no-teams>
      <h2 class="en-empty__title">No saved team yet</h2>
      <p class="en-empty__text">Each team asks its own ER: import one from wuwa_calc's rankings (sync my teams) or Teams › List Presets, or scan every team your account can field below.</p>
      <div class="en-empty__actions">
        <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash() }" class="btn btn-sm btn-primary" title="wuwa_calc team rankings at your account: import a team from there">wuwa_calc rankings</RouterLink>
        <RouterLink to="/teams" class="btn btn-sm btn-ghost">Team Rotations</RouterLink>
      </div>
    </div>

    <!-- your teams -->
    <section v-if="teams.length" class="en-section" aria-labelledby="en-teams">
      <div class="en-section__head">
        <h2 id="en-teams" class="en-h2">Your teams</h2>
        <span class="en-section__note">Worst first. Click a member for where their energy comes from.</span>
      </div>
      <div v-if="teams.length > 3" class="en-filter" role="group" aria-label="Which of your teams">
        <button
          v-for="f in TEAM_FILTERS"
          v-show="f.id === 'all' || teamCount(f.id) > 0"
          :key="f.id"
          type="button"
          class="btn btn-xs"
          :class="teamFilter === f.id ? 'btn-primary' : 'btn-ghost'"
          :aria-pressed="teamFilter === f.id"
          :data-test-energy-team-filter="f.id"
          @click="teamFilter = f.id">
          {{ f.label }} <span class="opacity-70 tabular-nums">{{ teamCount(f.id) }}</span>
        </button>
      </div>
      <div class="en-grid">
        <EnergyTeamCard v-for="t in shownTeams" :key="t.id" :view="t" @retry="energy.measure(t.characterIds, { force: true })" />
      </div>
      <button v-if="filteredTeams.length > TEAM_LIMIT" type="button" class="btn btn-sm btn-ghost justify-self-start" data-test-energy-teams-more @click="showAllTeams = !showAllTeams">
        {{ showAllTeams ? `Show the first ${TEAM_LIMIT}` : `Show all ${filteredTeams.length} teams` }}
      </button>
    </section>

    <!-- per character: the floor substat weights respect -->
    <section v-if="floorRows.length" class="en-section" aria-labelledby="en-chars">
      <div class="en-section__head">
        <h2 id="en-chars" class="en-h2">ER floor per character</h2>
        <span class="en-section__note">The highest need among your saved teams — substat weights count Energy Regen up to it.</span>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-sm table--cards en-floors" data-test-energy-floors>
          <thead>
            <tr>
              <th>Character</th>
              <th class="text-right">Needs</th>
              <th class="text-right">Has</th>
              <th>Status</th>
              <th>Set by</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in floorRows" :key="r.id" :data-test-energy-floor="r.id">
              <td class="cell--who">
                <div class="flex items-center gap-2 min-w-0">
                  <img class="en-face" :src="characterPortraitUrl(r.id)" alt="" loading="lazy" />
                  <span class="font-semibold truncate">{{ nameOf(r.id) }}</span>
                </div>
              </td>
              <td class="text-right tabular-nums font-semibold cell--need" data-label="Needs">{{ needText(r.floor.need) }}</td>
              <td class="text-right tabular-nums cell--have" data-label="Has">{{ haveText(r.check.have) }}</td>
              <td class="cell--status">
                <EnergyChip :check="r.check" :character-id="r.id" :clickable="Boolean(r.view?.checks)" @open="r.view && (sheet = { view: r.view, id: r.id })" />
              </td>
              <td class="text-sm cell--team" :title="r.floor.setBy === 'kit' ? 'wuwa_calc keeps this kit at a minimum Energy Regen in every team: it turns ER into buffs' : r.floor.team.name">
                <!-- a kit floor is the same in every team: no team "sets" it -->
                <span v-if="r.floor.setBy === 'kit'" class="en-floors__team">the kit's own floor</span>
                <span v-else class="en-floors__team">
                  <span class="en-floors__mates" aria-hidden="true">
                    <img v-for="id in r.mates" :key="id" class="en-floors__mate" :src="characterPortraitUrl(id)" alt="" loading="lazy" />
                  </span>
                  <span class="truncate">with {{ r.mates.map(shortName).join(" + ") }}</span>
                </span>
                <span class="en-floors__why">
                  {{ r.floor.setBy === "kit" ? "ER turns into buffs" : `the ${r.view?.energy?.teamKey ?? "team's"} loop` }}<template v-if="r.floor.all.length > 1"> · {{ r.floor.all.length }} teams<template v-if="r.floor.setBy !== 'kit'"> ({{ rangeText(r.floor.all) }})</template></template>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- every team the account can field (opt-in) -->
    <section v-if="setUpCount" class="en-section" aria-labelledby="en-scan">
      <div class="en-section__head">
        <h2 id="en-scan" class="en-h2">Other teams you can field</h2>
        <span v-if="checked.length" class="en-section__note">{{ checked.length }} measured</span>
      </div>

      <div v-if="scan.status === 'running'" class="en-scan" data-test-energy-scan-progress>
        <div class="flex items-center justify-between gap-3 text-sm">
          <span><span class="loading loading-spinner loading-xs"></span> Measuring every composition your account can field… <span class="tabular-nums">{{ scan.done }} / {{ scan.total || "…" }}</span></span>
          <button type="button" class="btn btn-xs btn-ghost" data-test-energy-scan-cancel @click="energy.cancelScan()">Cancel</button>
        </div>
        <progress class="progress progress-primary w-full" :value="scan.done" :max="scan.total || 1"></progress>
      </div>
      <div v-else-if="!checked.length" class="en-scan en-scan--cta" data-test-energy-scan-cta>
        <p class="text-sm">
          Check every composition in wuwa_calc's list whose three members your account can field — usually a hundred or more, about
          a tenth of a second each on background workers. You can keep using the page meanwhile.
        </p>
        <button type="button" class="btn btn-sm btn-outline" data-test-energy-scan @click="energy.scanAll()">Scan every team I can field</button>
        <p v-if="scan.status === 'error'" class="text-xs text-error">The scan failed: {{ scan.message }}</p>
        <p v-else-if="scan.status === 'cancelled'" class="text-xs opacity-70">Scan cancelled.</p>
        <p v-else-if="scan.status === 'done' && scan.message" class="text-xs text-warning">{{ scan.message }}</p>
        <p v-else-if="scan.status === 'done'" class="text-xs opacity-70" data-test-energy-scan-none>
          Scan done: wuwa_calc has no composition your account can field beyond your saved teams.
        </p>
      </div>

      <template v-if="checked.length">
        <div class="en-filter" role="group" aria-label="Which teams">
          <button v-for="f in FILTERS" :key="f.id" type="button" class="btn btn-xs" :class="filter === f.id ? 'btn-primary' : 'btn-ghost'" :aria-pressed="filter === f.id" :data-test-energy-filter="f.id" @click="filter = f.id">
            {{ f.label }} <span class="opacity-70 tabular-nums">{{ filterCount(f.id) }}</span>
          </button>
          <button v-if="scan.status !== 'running'" type="button" class="btn btn-xs btn-ghost ml-auto" data-test-energy-rescan @click="energy.scanAll()">Scan for more</button>
        </div>
        <p v-if="scan.status === 'done' && scan.message" class="text-xs text-warning">{{ scan.message }}</p>
        <ul class="en-list" data-test-energy-checked>
          <li v-for="t in shownChecked" :key="t.id" class="en-list__row" :data-test-energy-checked-team="t.key">
            <div class="en-list__team">
              <div class="en-trio" aria-hidden="true">
                <img v-for="id in t.characterIds" :key="id" class="en-trio__face" :src="characterPortraitUrl(id)" alt="" loading="lazy" />
              </div>
              <div class="min-w-0">
                <div class="en-list__name">{{ t.name }}</div>
                <div class="en-list__meta">{{ t.energy?.teamKey }} · <span class="tabular-nums">{{ intText(t.energy?.total) }}</span> DPS</div>
              </div>
            </div>
            <div class="en-list__chips">
              <EnergyChip v-for="c in t.checks ?? []" :key="c.characterId" :check="c" :label="nameOf(c.characterId)" :character-id="c.characterId" compact clickable @open="sheet = { view: t, id: c.characterId }" />
            </div>
          </li>
        </ul>
        <button v-if="filtered.length > LIMIT" type="button" class="btn btn-sm btn-ghost mt-2" data-test-energy-checked-more @click="showAll = !showAll">
          {{ showAll ? `Show the top ${LIMIT}` : `Show all ${filtered.length}` }}
        </button>
      </template>
    </section>

    <details class="en-help" data-test-energy-help>
      <summary>How to read these numbers</summary>
      <ul>
        <li><b>Needs</b>: the constant Energy Regen at which every Liberation in this team's wuwa_calc loop is paid on time, or the kit's own floor where that is higher (Shorekeeper, Mornye). Each team asks its own number: the same character can need 110 % in one team and 135 % in another.</li>
        <li><b>Has</b>: the character screen's Energy Regen of the build the team runs — weapon, echoes, sets and permanent bonuses. Buffs that only hold during the fight (an inherent "while in a Stellarealm", an ally's Outro) are already inside the need, so they are not added here.</li>
        <li><b>Short / tight / OK</b>: below the need; within {{ TIGHT_MARGIN }}% above it; comfortably above. Rolls = Energy Regen substat rolls of {{ pctText(erRoll()) }} (the median tier) that close the gap.</li>
        <li><b>Where the energy comes from</b>: the member's own hits and the share each ally's hits pass on, before ER, scaled by the ER that pays one Liberation exactly; flat gains (no ER applies); and what ER buffs added on their own hits.</li>
        <li><b>Crit Rate past 100 %</b>: the share of a member's damage that already lands at 100 % Crit Rate or more, so more Crit Rate does nothing there — often a kit's own guaranteed crit.</li>
        <li><b>In scores</b>: substat weights on My roster rankings treat Energy Regen as a floor — below the need an ER roll is worth the share of the deficit it closes (damage × (1 − deficit)), at or above it nothing.</li>
        <li>The need belongs to that loop: a rotation played differently asks a different number. The loop starts from each kit's own steady state, not from a full bar. A team that is not one of wuwa_calc's compositions is not measured — no formula stands in for the simulation.</li>
      </ul>
    </details>
    <p class="en-credit">
      Energy model, rotations and runs: <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">Riley31415's wuwa_calc</a> (ISC), engine {{ energy.commit }}, run at your account.
    </p>

    <EnergySheet v-if="sheet" :view="sheet.view" :character-id="sheet.id" @close="sheet = null" />
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /energy: the energy check for every saved team (src/sim/energy/). Measures on open (kept in
// localStorage per account and engine commit, so a revisit is instant), the per-character ER floor, and an opt-in scan
// of every composition the account can field.
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { characterPortraitUrl } from "../../characters/characters";
import { rankingsMineHash } from "../account/accountState";
import { useCharacterStore } from "../../stores/character";
import EnergyChip from "./EnergyChip.vue";
import EnergySheet from "./EnergySheet.vue";
import EnergyStatusIcon from "./EnergyStatusIcon.vue";
import EnergyTeamCard from "./EnergyTeamCard.vue";
import { haveText, intText, nameOf, needText, pctText } from "./energyFormat";
import { checkOf, erRoll, OVERCAP_FLAG, overcapWeight, showNeed, TIGHT_MARGIN } from "./energyNeed";
import { useEnergyNeeds, type TeamView } from "./useEnergyNeeds";
import "../phone-tables.css";
import "./energy.css";

useDocumentTitle(
  "Energy check — Wuthering Waves Calculator & Optimizer",
  "How much Energy Regen each member of your Wuthering Waves teams needs, measured in wuwa_calc at your account, against the ER their builds have.",
);

const energy = useEnergyNeeds();
onMounted(() => energy.activate());
onBeforeUnmount(() => energy.release());

const characterStore = useCharacterStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, { weapon?: string }> } };
const setUpCount = computed(() => Object.values(characters.value ?? {}).filter((c) => c?.weapon).length);

const teams = computed(() => energy.savedTeams.value);

// ---- your teams: worst first (someone short, then tight, then paid; not measured last). The order is taken once the
// saved teams are measured and kept while a re-check runs, so cards don't jump about as results come in.
const TEAM_LIMIT = 8;
type TeamFilter = "all" | "short" | "tight" | "unmeasured";
const TEAM_FILTERS: Array<{ id: TeamFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "short", label: "Someone short" },
  { id: "tight", label: "Tight" },
  { id: "unmeasured", label: "Not measured" },
];
const teamFilter = ref<TeamFilter>("all");
const showAllTeams = ref(false);
const rankOf = (t: TeamView): number => {
  if (t.checks) return t.checks.some((c) => c.status === "short") ? 0 : t.checks.some((c) => c.status === "tight") ? 1 : 2;
  return t.state?.status === "notMeasured" || t.state?.status === "error" ? 4 : 3;
};
const deficitOf = (t: TeamView): number => (t.checks ?? []).reduce((n, c) => n + c.short, 0);
const settled = computed(() => energy.havesReady.value && teams.value.every((t) => t.state && t.state.status !== "loading" && (t.state.status !== "ok" || t.checks)));
const order = ref<string[]>([]);
watchEffect(() => {
  if (!settled.value) return;
  order.value = [...teams.value].sort((a, b) => rankOf(a) - rankOf(b) || deficitOf(b) - deficitOf(a)).map((t) => t.id);
});
const orderedTeams = computed(() => {
  const at = new Map(order.value.map((id, i) => [id, i]));
  return [...teams.value].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9));
});
const teamMatches = (t: TeamView, f: TeamFilter): boolean => {
  if (f === "all") return true;
  if (f === "unmeasured") return t.state?.status === "notMeasured" || t.state?.status === "error";
  return (t.checks ?? []).some((c) => c.status === f);
};
const teamCount = (f: TeamFilter): number => teams.value.filter((t) => teamMatches(t, f)).length;
const filteredTeams = computed(() => orderedTeams.value.filter((t) => teamMatches(t, teamFilter.value)));
const shownTeams = computed(() => (showAllTeams.value ? filteredTeams.value : filteredTeams.value.slice(0, TEAM_LIMIT)));
const summary = computed(() => energy.summary.value);
/** characters tight in some saved team and short in none (the "Short on ER" tile has those) */
const tightCharacters = computed(() => {
  const short = new Set(summary.value.shortCharacters);
  const tight = new Set<string>();
  for (const t of teams.value) for (const c of t.checks ?? []) if (c.status === "tight" && !short.has(c.characterId)) tight.add(c.characterId);
  return [...tight].sort();
});
const scan = energy.scan;
const sheet = ref<{ view: TeamView; id: string } | null>(null);

const FLOOR_RANK: Record<string, number> = { short: 0, tight: 1, ok: 2, noGate: 3, unknown: 4 };
const shortName = (id: string): string => nameOf(id).split(":").pop()!.trim();
const floorRows = computed(() =>
  [...energy.floors.value.values()]
    .map((floor) => {
      const view = teams.value.find((t) => t.id === floor.team.id) ?? null;
      // the floor's team may run another build than the active one: its own check carries that build's ER
      const check = view?.checks?.find((c) => c.characterId === floor.characterId) ?? checkOf(floor.need, energy.haves[floor.characterId] ?? null);
      return { id: floor.characterId, floor, view, check, mates: floor.team.characterIds.filter((id) => id !== floor.characterId) };
    })
    .sort((a, b) => FLOOR_RANK[a.check.status] - FLOOR_RANK[b.check.status] || b.floor.need - a.floor.need),
);
const rangeText = (all: Array<{ need: number | null }>): string => {
  const needs = all.map((a) => a.need).filter((n): n is number => n != null);
  if (!needs.length) return "";
  const lo = showNeed(Math.min(...needs));
  const hi = showNeed(Math.max(...needs));
  return lo === hi ? `${lo.toFixed(1)}%` : `${lo.toFixed(0)}–${hi.toFixed(0)}%`;
};

// ---- other teams
const LIMIT = 20;
type Filter = "all" | "short" | "crit";
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "short", label: "Someone short" },
  { id: "crit", label: "Crit past 100\u00a0%" },
];
const filter = ref<Filter>("all");
const showAll = ref(false);
const checked = computed(() => energy.checkedTeams.value);
const matches = (t: TeamView, f: Filter): boolean =>
  f === "all" || (f === "short" ? (t.checks ?? []).some((c) => c.status === "short") : (t.checks ?? []).some((c) => overcapWeight(c.member) >= OVERCAP_FLAG));
const filterCount = (f: Filter): number => checked.value.filter((t) => matches(t, f)).length;
const filtered = computed(() => checked.value.filter((t) => matches(t, filter.value)));
const shownChecked = computed(() => (showAll.value ? filtered.value : filtered.value.slice(0, LIMIT)));
</script>

<style scoped>
.en-page {
  display: grid;
  gap: 1.5rem;
  align-content: start;
}
.en-page__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
}
.en-page__lead {
  margin-top: 0.35rem;
  max-width: 46rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--en-ink-2);
}
.en-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.en-empty {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  padding: 1.1rem 1.25rem;
  border-radius: var(--rounded-box, 1rem);
  border: 1px dashed oklch(var(--bc) / 0.2);
  background: oklch(var(--b2) / 0.4);
}
.en-empty__title {
  font-size: 1rem;
  font-weight: 650;
}
.en-empty__text {
  max-width: 46rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--en-ink-2);
}
.en-empty__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
  max-width: 100%;
}
.en-empty__actions .btn {
  max-width: 100%;
}
.en-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}
.en-kpi {
  display: grid;
  gap: 0.2rem;
  align-content: start;
  padding: 0.8rem 1rem;
  border-radius: var(--rounded-box, 1rem);
  background: oklch(var(--b2) / 0.55);
  border: 1px solid oklch(var(--bc) / 0.08);
  min-width: 0;
}
.en-kpi--short {
  box-shadow: inset 3px 0 0 oklch(var(--er));
}
.en-kpi__label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--en-ink-2);
}
.en-kpi__icon {
  width: 0.9rem;
  height: 0.9rem;
}
.en-kpi__icon--short {
  color: oklch(var(--er));
}
.en-kpi__icon--tight {
  color: oklch(var(--wa));
}
.en-kpi__value {
  font-size: 1.75rem;
  font-weight: 650;
  line-height: 1.1;
}
.en-kpi__of {
  font-size: 1rem;
  font-weight: 500;
  color: var(--en-ink-3);
}
.en-kpi__sub {
  font-size: 0.72rem;
  color: var(--en-ink-3);
  overflow-wrap: anywhere;
}
.en-section {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.en-section__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
}
.en-h2 {
  font-size: 1.125rem;
  font-weight: 700;
}
.en-section__note {
  font-size: 0.78rem;
  color: var(--en-ink-3);
}
.en-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 34rem), 1fr));
  align-items: start;
  gap: 1rem;
}
.en-face {
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 9999px;
  object-fit: cover;
  background: oklch(var(--b3));
  flex: none;
}
.en-floors__team {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  max-width: 26rem;
  min-width: 0;
  font-weight: 500;
}
.en-floors__mates {
  display: flex;
  flex: none;
}
.en-floors__mate {
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 9999px;
  object-fit: cover;
  background: oklch(var(--b3));
  box-shadow: 0 0 0 2px oklch(var(--b1));
}
.en-floors__mate + .en-floors__mate {
  margin-left: -0.35rem;
}
.en-floors__why {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.72rem;
  color: var(--en-ink-3);
}
.en-scan {
  display: grid;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  border-radius: var(--rounded-box, 1rem);
  border: 1px dashed oklch(var(--bc) / 0.2);
}
.en-scan--cta {
  justify-items: start;
}
.en-scan--cta p {
  max-width: 46rem;
  color: var(--en-ink-2);
}
.en-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.en-list {
  display: grid;
  border: 1px solid oklch(var(--bc) / 0.1);
  border-radius: var(--rounded-box, 1rem);
  overflow: hidden;
}
.en-list__row {
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) auto;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.6rem 1rem;
}
.en-list__row + .en-list__row {
  border-top: 1px solid oklch(var(--bc) / 0.07);
}
.en-list__team {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}
.en-list__name {
  font-size: 0.875rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.en-list__meta {
  font-size: 0.72rem;
  color: var(--en-ink-3);
}
.en-list__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}
.en-trio {
  display: flex;
  flex: none;
}
.en-trio__face {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 9999px;
  object-fit: cover;
  background: oklch(var(--b3));
  box-shadow: 0 0 0 2px oklch(var(--b1));
}
.en-trio__face + .en-trio__face {
  margin-left: -0.5rem;
}
.en-help {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--en-ink-2);
}
.en-help summary {
  cursor: pointer;
  font-weight: 600;
  color: oklch(var(--bc));
}
.en-help ul {
  list-style: disc;
  padding-left: 1.2rem;
  margin-top: 0.5rem;
  display: grid;
  gap: 0.35rem;
  max-width: 60rem;
}
.en-credit {
  font-size: 0.72rem;
  color: var(--en-ink-3);
}
@media (min-width: 768px) {
  /* the Needs and Has columns carry the numbers on a desktop: the chip keeps the verdict ("short 4.4% · 1 roll") */
  .en-floors :deep(.en-chip__nums) {
    display: none;
  }
}
@media (max-width: 1023px) {
  .en-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .en-list__row {
    grid-template-columns: minmax(0, 1fr);
  }
  .en-list__chips {
    justify-content: flex-start;
  }
  /* name · need on the first line; the chip (have / need, the verdict) under it; the team that sets it last — the
     "Has" column is the chip's first number, so it stays off the card */
  .en-floors.table--cards {
    .cell--who { order: 0; flex: 1 1 0; min-width: 0; }
    .cell--need { order: 0; margin-left: auto; }
    .cell--have { display: none; }
    .cell--status { order: 1; flex-basis: 100%; margin-top: 0.3rem; }
    .cell--team { order: 2; flex-basis: 100%; min-width: 0; margin-top: 0.3rem; }
  }
}
</style>
