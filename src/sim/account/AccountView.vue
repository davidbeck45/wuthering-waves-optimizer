<template>
  <Nav cur-page="account" :disable-mobile-nav="true"></Nav>
  <div class="acc" data-test-account>
    <header class="acc-head">
      <div class="acc-head__title">
        <h1 class="acc-h1">My account</h1>
        <span
          class="acc-source"
          :data-state="sourceState"
          data-test-account-source
          title="Read from this browser's saved data — characters, inventory and teams. Nothing leaves the device.">
          <span class="acc-source__dot" aria-hidden="true"></span>
          {{ sourceLabel }}
        </span>
      </div>
      <nav class="acc-pages" aria-label="Account pages">
        <span class="acc-pages__item acc-pages__item--on" aria-current="page">Account</span>
        <RouterLink to="/my-rankings" class="acc-pages__item" data-test-account-to-my-rankings>Roster rankings</RouterLink>
        <RouterLink :to="{ path: '/rankings', hash: rankingsMineHash() }" class="acc-pages__item" data-test-account-to-rankings>Team rankings</RouterLink>
      </nav>
      <button
        v-if="setUpCount"
        type="button"
        class="acc-refresh"
        :disabled="busy"
        :title="busy ? 'Scoring…' : 'Score everything again from the data as saved'"
        data-test-account-recompute
        @click="refresh(true)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" :class="{ 'acc-spin': busy }" aria-hidden="true">
          <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="max-sm:hidden">{{ busy ? "Scoring…" : "Recompute" }}</span>
      </button>
      <p class="acc-head__sub">
        Your roster at a glance — builds, sequences, the teams you can field and what to invest in next, scored by this
        app's engine on your real builds (enemy level 100 · 20 % RES).
      </p>
    </header>

    <section v-if="!setUpCount" data-test-account-empty>
      <MyRankingsEmpty
        title="Your account, scored on your real builds"
        text="No character has a weapon equipped yet. Bring your account in or build someone, and this page lays out your roster, the teams you can field and what to invest in next." />
    </section>

    <template v-else>
      <div v-if="runError" role="alert" class="alert alert-error text-sm mb-3" data-test-account-error>
        <span>{{ runError }}</span>
        <button type="button" class="btn btn-sm" @click="refresh(true)">Try again</button>
      </div>
      <AccountHero :kpis="kpis" :status="rankingStatus" :owned="ownedKeys" />

      <div class="acc-grid">
        <AccountInvest
          class="acc-grid__invest"
          :items="shownItems"
          :status="planStatus"
          :ranking-ready="!!ranking"
          :owned="ownedKeys"
          :invest-by="prefs.investBy"
          @update:invest-by="prefs.investBy = $event"
          @open="openCharacter" />
        <AccountRoster
          v-model:filter="prefs.filter"
          v-model:sort="prefs.sort"
          class="acc-grid__roster"
          :cards="cards"
          :scoring="rankingStatus.state === 'running'"
          :owned="ownedKeys"
          @open="openCharacter" />
        <AccountTeams class="acc-grid__teams" :teams="teamRows" :scoring="rankingStatus.state === 'running'" :owned="ownedKeys" />
      </div>

      <p v-if="ranking" class="acc-foot">
        Scored {{ new Date(ranking.computedAt).toLocaleString() }}{{ rankingStatus.restored ? " (kept for this tab)" : "" }} · average damage
        per rotation on each character's best rotation, enemy level 100, 20 % RES · {{ ranking.characters.length }} characters,
        {{ ranking.teams.length }} team rotations.
      </p>
    </template>

    <AccountCharacterDrawer
      :card="drawerCard"
      :items="drawerItems"
      :rank="drawerRank"
      :roster-size="ranking?.characters.length ?? 0"
      :owned="ownedKeys"
      @close="drawerId = null"
      @calculator="toCalculator" />
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /account, "My account": the account dashboard (the plus landing page in the nav hub). The
// Account State as KPI tiles, a roster grid of character cards (upstream's Build Score, the roster ranking's best
// rotation, the headline investment, the teams each one is in), "What to invest in next" (investPlan.ts: engine
// gains on each character's best rotation and their strongest fieldable team) and the teams the roster can field.
// Data and runs: useAccountData.ts; the view model: accountView.ts.
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { rankingsMineHash } from "./accountState";
import { useAccountData } from "./useAccountData";
import { PREFS_KEY, accountKpis, fieldableTeams, readAccountPrefs, rosterCards, type AccountPrefs } from "./accountView";
import { sortInvestItems } from "./investPlan";
import MyRankingsEmpty from "../myRankings/MyRankingsEmpty.vue";
import AccountHero from "./AccountHero.vue";
import AccountInvest from "./AccountInvest.vue";
import AccountRoster from "./AccountRoster.vue";
import AccountTeams from "./AccountTeams.vue";
import AccountCharacterDrawer from "./AccountCharacterDrawer.vue";

useDocumentTitle(
  "My account — Wuthering Waves Calculator & Optimizer",
  "Your Wuthering Waves roster at a glance: builds, sequences, the teams you can field and what to invest in next, scored on your own builds.",
);

const router = useRouter();
const data = useAccountData();
const { account, setUpCount, ownedKeys, ranking, shownRanking, rankingStatus, shownItems, planStatus, refresh } = data;

// ---- preferences (per browser)
const prefs = reactive<AccountPrefs>(readStoredPrefs());
function readStoredPrefs(): AccountPrefs {
  try {
    return readAccountPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return readAccountPrefs(null);
  }
}
watch(
  prefs,
  () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: the choice lasts this visit */
    }
  },
  { deep: true },
);

// ---- view model
const cards = computed(() =>
  rosterCards({
    state: account.value,
    characters: data.characters.value ?? {},
    inventoryEchoes: data.inventoryEchoes.value,
    ranking: shownRanking.value,
    plan: shownItems.value,
    favorites: data.favorites.value ?? [],
  }),
);
const kpis = computed(() => accountKpis(account.value, cards.value, shownRanking.value));
const teamRows = computed(() => fieldableTeams(shownRanking.value));
const busy = computed(() => rankingStatus.value.state === "running" || planStatus.value.state === "running");

const runError = computed(() =>
  rankingStatus.value.state === "error"
    ? `The roster could not be scored: ${rankingStatus.value.error}`
    : planStatus.value.state === "error"
      ? `The investment list could not be computed: ${planStatus.value.error}`
      : null,
);
const sourceState = computed(() => (busy.value ? "scoring" : ranking.value ? "live" : "idle"));
const sourceLabel = computed(() => (busy.value ? "Scoring · this browser" : ranking.value ? "Live · this browser" : "This browser"));

// ---- the character drawer
const drawerId = ref<string | null>(null);
const drawerCard = computed(() => cards.value.find((c) => c.id === drawerId.value) ?? null);
const drawerItems = computed(() => sortInvestItems((shownItems.value ?? []).filter((i) => i.characterId === drawerId.value), prefs.investBy));
const drawerRank = computed(() => shownRanking.value?.characters.find((c) => c.id === drawerId.value) ?? null);
function openCharacter(id: string): void {
  drawerId.value = id;
}
function toCalculator(id: string): void {
  data.setActiveCharacter(id);
  void router.push("/");
}

onMounted(() => void refresh());
</script>

<style scoped>
.acc {
  width: 100%;
  max-width: 88rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 2.5rem;
}
.acc-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
  margin-bottom: 1rem;
}
.acc-head__title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.acc-h1 {
  font-size: 1.5rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.acc-source {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.6rem 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.75);
  background: oklch(var(--bc) / 0.06);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.acc-source__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.35);
}
.acc-source[data-state="live"] .acc-source__dot {
  background: oklch(var(--su));
  box-shadow: 0 0 0 3px oklch(var(--su) / 0.2);
}
.acc-source[data-state="scoring"] .acc-source__dot {
  background: oklch(var(--in));
  animation: acc-pulse 1s ease-in-out infinite;
}
@keyframes acc-pulse {
  50% {
    box-shadow: 0 0 0 5px oklch(var(--in) / 0.15);
  }
}
.acc-pages {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.acc-pages__item {
  padding: 0.3rem 0.7rem;
  border-radius: 0.45rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.6);
  white-space: nowrap;
}
a.acc-pages__item:hover {
  color: oklch(var(--bc));
}
.acc-pages__item--on {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.acc-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  padding: 0.4rem 0.8rem;
  border-radius: 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.acc-refresh:hover:not(:disabled) {
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.6);
}
.acc-refresh:disabled {
  opacity: 0.6;
  cursor: progress;
}
.acc-spin {
  animation: acc-spin 1s linear infinite;
}
@keyframes acc-spin {
  to {
    transform: rotate(360deg);
  }
}
.acc-head__sub {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.55);
}
/* the roster beside a rail (invest, then teams) on wide screens; one column, invest first, below that */
.acc-grid {
  display: grid;
  gap: 1.5rem;
  margin-top: 1.5rem;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "invest"
    "roster"
    "teams";
}
.acc-grid__invest {
  grid-area: invest;
}
.acc-grid__roster {
  grid-area: roster;
}
.acc-grid__teams {
  grid-area: teams;
}
@media (min-width: 1280px) {
  .acc-grid {
    grid-template-columns: minmax(0, 1fr) 25rem;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      "roster invest"
      "roster teams";
    align-items: start;
  }
}
.acc-foot {
  margin-top: 1.5rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.45);
}
@media (max-width: 767px) {
  .acc {
    padding: 0.9rem 0.75rem 2rem;
  }
  .acc-head {
    gap: 0.5rem 0.6rem;
    margin-bottom: 0.75rem;
  }
  .acc-h1 {
    font-size: 1.25rem;
  }
  .acc-pages {
    order: 3;
    flex: 1 1 auto;
    min-width: 0;
  }
  .acc-pages__item {
    flex: 1 1 auto;
    padding: 0.3rem 0.45rem;
    text-align: center;
    font-size: 0.72rem;
  }
  .acc-refresh {
    padding: 0.4rem 0.55rem;
  }
  .acc-head__sub {
    display: none;
  }
  .acc-grid {
    gap: 1.1rem;
    margin-top: 1.1rem;
  }
}
</style>

<style>
/* shared by the /account children: section heads, counts, segmented controls */
.acc .acc-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.6rem;
}
.acc .acc-h2 {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
}
.acc .acc-count {
  padding: 0.05rem 0.45rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.6);
  background: oklch(var(--bc) / 0.08);
}
.acc .acc-meta {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.5);
}
.acc .acc-seg {
  display: inline-flex;
  max-width: 100%;
  padding: 0.15rem;
  border-radius: 0.55rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.acc .acc-seg__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.6);
}
.acc .acc-seg__btn:hover {
  color: oklch(var(--bc));
}
.acc .acc-seg__btn--on {
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}
.acc .acc-seg__n {
  font-size: 0.65rem;
  opacity: 0.6;
}
.acc .acc-panel {
  border-radius: 0.9rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.acc .acc-gain-up {
  color: oklch(var(--su));
}
.acc .acc-gain-down {
  color: oklch(var(--er));
}
:root[data-theme-style="light"] .acc .acc-gain-up {
  color: color-mix(in oklab, oklch(var(--su)) 70%, black);
}
</style>
