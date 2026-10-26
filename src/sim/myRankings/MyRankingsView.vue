<template>
  <Nav cur-page="my-rankings" :disable-mobile-nav="true"></Nav>
  <div class="my-rankings" data-test-my-rankings>
    <header class="mr-head">
      <div class="mr-head__title">
        <h1 class="mr-h1">My roster rankings</h1>
        <MyRankingsInfo />
      </div>
      <nav class="mr-pages" aria-label="Rankings">
        <RouterLink to="/account" class="mr-pages__item" title="Your account dashboard" data-test-my-rankings-to-account>Account</RouterLink>
        <span class="mr-pages__item mr-pages__item--on" aria-current="page">My roster</span>
        <RouterLink to="/rankings" class="mr-pages__item" title="Riley31415's wuwa_calc team table" data-test-rankings-switch-calc>Team rankings</RouterLink>
      </nav>
      <MyRankingsToolbar
        v-if="characterCount"
        v-model:investment="investment"
        v-model:sort="sort"
        class="mr-head__tools"
        :running="isRunning"
        :can-compute="characterCount > 0"
        :has-ranking="!!ranking"
        @compute="compute" />
      <p class="mr-head__sub">
        Your characters and teams on their real builds, scored by this app's engine — every rotation tried, the best one
        counts. Enemy level 100 · 20 % RES.
      </p>
    </header>

    <MyRankingsEmpty v-if="!characterCount" />
    <template v-else>
      <MyRankingsKpis :account="account" :status="status" />

      <section class="mr-section">
        <div class="mr-section-head">
          <h2 class="mr-h2">
            Characters
            <span v-if="shown" class="mr-count">{{ shown.characters.length }}</span>
          </h2>
          <span class="mr-section-head__meta">{{ sortLabel }}</span>
        </div>
        <div v-if="error" class="alert alert-error text-sm mb-2">{{ error }}</div>
        <div v-if="isRunning" class="mr-progress" aria-hidden="true"><span :style="{ width: `${progress.total ? (progress.done / progress.total) * 100 : 3}%` }"></span></div>
        <MyRankingsCharacters
          v-if="shown || isRunning"
          v-model:sort="sort"
          :ranks="shown?.characters ?? []"
          :investment="shownInvestment"
          :pending="pendingCharacters"
          :owned="ownedKeys"
          :focus="focus" />
        <p v-if="errorCount" class="text-xs text-warning mt-2">
          {{ errorCount }} rotation{{ errorCount === 1 ? "" : "s" }} could not be scored (unknown actions on this build) and
          {{ errorCount === 1 ? "was" : "were" }} skipped — open a row's Rotations tab for which.
        </p>
      </section>

      <MyRankingsTeams
        v-if="shown || isRunning"
        class="mr-section"
        :teams="shown?.teams ?? []"
        :pending="pendingTeams"
        :teams-skipped="ranking && !isRunning ? ranking.teamsSkipped : 0"
        :owned="ownedKeys" />

      <p v-if="ranking && !isRunning" class="mr-foot">
        Computed {{ new Date(ranking.computedAt).toLocaleString() }} · enemy level {{ ranking.enemy.enemyLevel }},
        {{ Math.round(ranking.enemy.enemyResist * 100) }} % RES · {{ rotationsScored }} rotations and {{ ranking.teams.length }} teams scored.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ phase E — /my-rankings, the app's own engine ranking the roster you have set up
// (rankRoster.ts does the scoring). This file only orchestrates: the cache (rankingCache.ts), the
// progressive run, the options; the tables and panels are the MyRankings*.vue children.
import { computed, onMounted, ref, shallowRef, toRaw, watch } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { isSetUp, rankRoster, type CharacterRank, type RosterRanking, type TeamRank } from "./rankRoster";
import { rankingFingerprint, readCachedRanking, writeCachedRanking } from "./rankingCache";
import type { SortDir, SortKey } from "./rows";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { accountStateOf } from "../account/accountState";
import MyRankingsInfo from "./MyRankingsInfo.vue";
import MyRankingsToolbar from "./MyRankingsToolbar.vue";
import MyRankingsKpis, { type RankingStatus } from "./MyRankingsKpis.vue";
import MyRankingsEmpty from "./MyRankingsEmpty.vue";
import MyRankingsCharacters from "./MyRankingsCharacters.vue";
import MyRankingsTeams from "./MyRankingsTeams.vue";
import "../phone-tables.css";

// each page sets its own tab title (Ryan's #672)
useDocumentTitle(
  "My roster rankings — Wuthering Waves Calculator & Optimizer",
  "Your own characters and teams ranked by the calculator's engine on your real builds, with what-if sequences, weapons and substat weights.",
);
// `?focus=<id>&tab=substats|whatif|rotations` (from /account's drawer) opens that row on that tab once it is scored
const route = useRoute();
const focus = computed<{ id: string; tab: "whatif" | "substats" | "rotations" } | null>(() => {
  const id = typeof route?.query.focus === "string" ? route.query.focus : null;
  const tab = route?.query.tab;
  if (!id) return null;
  return { id, tab: tab === "whatif" || tab === "rotations" ? tab : "substats" };
});
const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, unknown>> } };
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, unknown>> } };

// ---- preferences (per browser)
const PREFS_KEY = "wtplus:myRankings:prefs";
interface Prefs {
  investment: boolean;
  sort: { key: SortKey; dir: SortDir };
}
function readPrefs(): Prefs {
  const fallback: Prefs = { investment: true, sort: { key: "damage", dir: "desc" } };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    const key = raw?.sort?.key;
    return {
      investment: typeof raw?.investment === "boolean" ? raw.investment : fallback.investment,
      sort: key === "damage" || key === "upgrade" || key === "name" ? { key, dir: raw?.sort?.dir === "asc" ? "asc" : "desc" } : fallback.sort,
    };
  } catch {
    return fallback;
  }
}
const prefs = readPrefs();
const investment = ref(prefs.investment);
const sort = ref<Prefs["sort"]>(prefs.sort);
watch([investment, sort], () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ investment: investment.value, sort: sort.value }));
  } catch {
    /* storage unavailable: the choice lasts this visit */
  }
});

// ---- the data the ranking reads
const characterCount = computed(() => Object.values(characters.value ?? {}).filter((c) => isSetUp(c)).length);
const ownedKeys = computed(() => Object.keys(characters.value ?? {}).filter((k) => isSetUp(characters.value[k])));
// the Account State (src/sim/account): what the `mine` cost on /rankings runs, summarised
const account = computed(() =>
  accountStateOf(characters.value ?? {}, { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} }, teams.value ?? []),
);
const fingerprint = (): string =>
  rankingFingerprint({
    characters: toRaw(characters.value ?? {}),
    echoes: toRaw(inventoryStore.echoes ?? []),
    teams: toRaw(teams.value ?? []),
    investment: investment.value,
    autoTeamBuffs: autoTeamBuffs.value,
  });

// ---- results: the finished ranking, and the rows of a run in progress
const ranking = shallowRef<RosterRanking | null>(null);
const rankedInvestment = ref(investment.value);
const restored = ref(false);
const live = shallowRef<{ characters: CharacterRank[]; teams: TeamRank[]; investment: boolean } | null>(null);
const isRunning = ref(false);
const progress = ref({ done: 0, total: 0, label: "" });
const error = ref<string | null>(null);

const shown = computed(() => live.value ?? ranking.value);
const shownInvestment = computed(() => (live.value ? live.value.investment : rankedInvestment.value));
const pendingCharacters = computed(() => (isRunning.value ? Math.max(0, Math.min(8, characterCount.value - (live.value?.characters.length ?? 0))) : 0));
const pendingTeams = computed(() => (isRunning.value && !(live.value?.teams.length ?? 0) ? 3 : 0));
const errorCount = computed(() => shown.value?.characters.reduce((n, c) => n + c.errors.length, 0) ?? 0);
const rotationsScored = computed(() => ranking.value?.characters.reduce((n, c) => n + c.rotationsEvaluated, 0) ?? 0);
const sortLabel = computed(() => {
  const by = sort.value.key === "damage" ? "damage" : sort.value.key === "upgrade" ? "best upgrade" : "name";
  return `sorted by ${by}${sort.value.dir === "asc" ? " ↑" : " ↓"}`;
});
const status = computed<RankingStatus>(() => ({
  state: isRunning.value ? "scoring" : ranking.value ? "live" : "idle",
  done: progress.value.done,
  total: progress.value.total,
  label: progress.value.label,
  computedAt: ranking.value?.computedAt ?? null,
  restored: restored.value,
}));

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(toRaw(value) ?? null)) as T;
let rerun = false;

async function compute(): Promise<void> {
  if (isRunning.value) {
    rerun = true; // an option changed mid-run: run again with it when this one ends
    return;
  }
  isRunning.value = true;
  error.value = null;
  const key = fingerprint();
  const withInvestment = investment.value;
  live.value = { characters: [], teams: [], investment: withInvestment };
  progress.value = { done: 0, total: 0, label: "starting" };
  try {
    const result = await rankRoster(clone(characters.value ?? {}), clone(inventoryStore.echoes ?? []), clone(teams.value ?? []), {
      investment: withInvestment,
      autoTeamBuffs: autoTeamBuffs.value,
      onProgress: (done, total, label, finished) => {
        progress.value = { done, total, label };
        const run = live.value;
        if (!run || !finished) return;
        // hand each scored row to the table as it lands (the same objects as the final result's)
        if (finished.kind === "character") live.value = { ...run, characters: [...run.characters, finished.rank] };
        else live.value = { ...run, teams: [...run.teams, finished.rank] };
      },
    });
    ranking.value = result;
    rankedInvestment.value = withInvestment;
    restored.value = false;
    writeCachedRanking(key, result);
  } catch (err) {
    error.value = `Ranking failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    live.value = null;
    isRunning.value = false;
    if (rerun) {
      rerun = false;
      void refresh();
    }
  }
}

/** Show the cached ranking for the data as it is now, else score it. */
function refresh(): void {
  if (!characterCount.value) return;
  const cached = readCachedRanking(fingerprint());
  if (cached) {
    ranking.value = cached;
    rankedInvestment.value = investment.value;
    restored.value = true;
    return;
  }
  void compute();
}

onMounted(refresh);
watch([investment, autoTeamBuffs], refresh);
</script>

<style scoped>
.my-rankings {
  width: 100%;
  max-width: 76rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 2.5rem;
}
.mr-head {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
  margin-bottom: 1rem;
}
.mr-head__title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.mr-h1 {
  font-size: 1.5rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.mr-pages {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.mr-pages__item {
  padding: 0.3rem 0.7rem;
  border-radius: 0.45rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.6);
  white-space: nowrap;
}
a.mr-pages__item:hover {
  color: oklch(var(--bc));
}
.mr-pages__item--on {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.mr-head__tools {
  margin-left: auto;
}
.mr-head__sub {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.55);
}
.mr-section {
  margin-top: 1.5rem;
}
.mr-progress {
  height: 2px;
  margin-bottom: -2px;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.06);
  overflow: hidden;
}
.mr-progress > span {
  display: block;
  height: 100%;
  background: oklch(var(--in));
  transition: width 0.2s ease;
}
.mr-foot {
  margin-top: 1.25rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.45);
}
@media (max-width: 767px) {
  .my-rankings {
    padding: 0.9rem 0.75rem 2rem;
  }
  .mr-head {
    gap: 0.5rem 0.6rem;
    margin-bottom: 0.75rem;
  }
  .mr-head__title {
    flex-basis: 100%;
  }
  .mr-h1 {
    font-size: 1.25rem;
  }
  .mr-pages__item {
    padding: 0.3rem 0.55rem;
  }
  .mr-head__sub {
    display: none;
  }
  .mr-section {
    margin-top: 1.1rem;
  }
}
</style>

<style>
/* shared by the /my-rankings children (section heads, counts, segmented filters) */
.my-rankings .mr-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.4rem;
}
.my-rankings .mr-section-head__meta {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.45);
}
.my-rankings .mr-h2 {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
}
.my-rankings .mr-count {
  padding: 0.05rem 0.45rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.6);
  background: oklch(var(--bc) / 0.08);
}
.my-rankings .mr-note {
  font-size: 0.85rem;
  color: oklch(var(--bc) / 0.65);
}
.my-rankings .mr-seg {
  display: inline-flex;
  padding: 0.15rem;
  border-radius: 0.55rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.my-rankings .mr-seg__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.6);
}
.my-rankings .mr-seg__btn--on {
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}
.my-rankings .mr-seg__n {
  font-size: 0.65rem;
  opacity: 0.6;
}
</style>
