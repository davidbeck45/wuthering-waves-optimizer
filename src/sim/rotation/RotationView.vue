<template>
  <Nav cur-page="rankings" :disable-mobile-nav="true"></Nav>
  <div class="rotation-page px-3 sm:px-4 py-4 mx-auto w-full max-w-6xl" data-test-rotation-page>
    <RotationPicker
      v-if="!parsed.target"
      :teams="teamList"
      :blocked="blocked"
      :loading="listLoading"
      :error="listError"
      :hues="huesAll"
      :last="last"
      @retry="loadList"
    />

    <template v-else>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <RouterLink to="/rotation" class="btn btn-sm btn-ghost px-2" data-test-rotation-back-to-teams>
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          Teams
        </RouterLink>
        <h1 class="text-xl font-bold min-w-0 truncate" data-test-rotation-title>{{ heading }}</h1>
        <div role="tablist" class="tabs tabs-boxed tabs-sm ml-auto max-sm:ml-0 max-sm:w-full" aria-label="View">
          <button
            v-for="t in TABS"
            :key="t.value"
            type="button"
            role="tab"
            class="tab max-sm:flex-1"
            :class="{ 'tab-active': parsed.tab === t.value }"
            :aria-selected="parsed.tab === t.value"
            :data-test-rotation-tab="t.value"
            @click="setTab(t.value)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- loading -->
      <div v-if="busy" class="flex flex-col gap-3" data-test-rotation-loading>
        <div class="flex items-center gap-2 text-sm opacity-80">
          <span class="loading loading-spinner loading-sm"></span>
          <span>{{ phaseText }}</span>
        </div>
        <div class="grid gap-2 sm:grid-cols-3">
          <div v-for="i in 3" :key="i" class="skeleton h-[5.5rem] rounded-box"></div>
        </div>
        <div class="skeleton h-40 rounded-box"></div>
        <div class="skeleton h-40 rounded-box"></div>
      </div>

      <!-- problems -->
      <div
        v-else-if="problem"
        class="alert flex flex-col items-start gap-3 text-start text-base-content sm:flex-row sm:items-center"
        :class="problem.kind === 'error' ? 'bg-error/10 border-error/40' : 'bg-warning/10 border-warning/40'"
        :data-test-rotation-problem="problem.kind"
      >
        <div class="flex-1">
          <div class="font-semibold">{{ problemTitle }}</div>
          <div class="text-sm">{{ problemText }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a v-if="problem.kind === 'code' && parsed.target?.kind === 'code'" :href="`/rankings#team=${encodeURIComponent(parsed.target.code)}`" class="btn btn-sm" @click.prevent="openRankings(parsed.target.code)">Open on Team rankings</a>
          <RouterLink v-if="problem.kind === 'noBuild'" to="/rankings" class="btn btn-sm">Team rankings at fixed tiers</RouterLink>
          <RouterLink v-if="problem.kind === 'unknownTeam'" to="/rankings" class="btn btn-sm">Find it on Team rankings</RouterLink>
          <button v-if="problem.kind === 'error'" type="button" class="btn btn-sm" data-test-rotation-retry @click="reload">Retry</button>
          <RouterLink to="/rotation" class="btn btn-sm btn-ghost">Pick another team</RouterLink>
        </div>
      </div>

      <!-- the run -->
      <template v-else-if="run && model && plan">
        <div v-if="notice" class="alert bg-info/10 text-base-content border-info/40 py-2 mb-3 text-sm grid-flow-col justify-items-start text-start" data-test-rotation-notice>
          <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-info" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 16v-5m0-3h.01" stroke-linecap="round" /></svg>
          <span>{{ notice }}</span>
        </div>
        <div v-if="notOwned.length" class="alert alert-warning bg-warning/10 text-base-content border-warning/40 py-2 mb-3 text-sm grid-flow-col justify-items-start text-start" data-test-rotation-not-fieldable>
          <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-warning" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>{{ notOwnedText }}</span>
        </div>
        <RotationHeader
          :run="run"
          :hues="hues"
          :variants="variants"
          :team-key="teamKey"
          :subs="exactRow ? rowSubs : parsed.subs"
          :exact-row="exactRow"
          class="mb-4"
          @subs="setSubs"
          @variant="setVariant"
        />
        <CueCard v-if="parsed.tab === 'cue'" :model="model" :plan="plan" :hues="hues" :prefs="prefs" :title="heading" :spread-label="spreadLabel" />
        <RotationTimeline v-else :model="model" :plan="plan" :hues="hues" :prefs="prefs" />
      </template>
    </template>

    <p class="mt-6 text-xs opacity-60">
      Rotations, engine and kits by
      <a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">Riley31415/wuwa_calc</a> (ISC), running in your
      browser. Released characters only.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { rileyClient } from "../engine/rileyClient";
import type { RileyTeamInfo, SubsMode } from "../engine/rileyRun";
import { useRileyAccount } from "../engine/useRileyAccount";
import CueCard from "./CueCard.vue";
import { buildRotationHash, parseRotationHash, type RotationTab, type RotationTarget } from "./hash";
import { readPrefs, writePrefs } from "./prefs";
import RotationHeader from "./RotationHeader.vue";
import RotationPicker from "./RotationPicker.vue";
import RotationTimeline from "./RotationTimeline.vue";
import { useRotationRun } from "./useRotationRun";
import "./rotation.css";

const TABS: Array<{ value: RotationTab; label: string }> = [
  { value: "cue", label: "Cue card" },
  { value: "timeline", label: "Fight timeline" },
];

const route = useRoute();
const router = useRouter();
const parsed = computed(() => parseRotationHash(route.hash));
const account = useRileyAccount();
const client = rileyClient();

const { phase, run, model, plan, problem, notice, variants, hues, progress, teamKey, reload } = useRotationRun(
  computed(() => parsed.value.target),
  computed(() => parsed.value.subs),
  account,
  client,
);

const exactRow = computed(() => parsed.value.target?.kind === "team" && !!parsed.value.target.rowKey);
const rowSubs = computed<SubsMode>(() => {
  const s = new Set(run.value?.members.map((m) => m.subs));
  return s.size === 1 ? [...s][0]! : ("" as SubsMode);
});
const notOwnedMembers = computed(() => (run.value?.members ?? []).filter((m) => !m.owned));
const notOwned = computed(() => notOwnedMembers.value.map((m) => m.name));
/** "A", "A and B", "A, B and C" */
const listText = (items: string[]): string => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] ?? "");
// what the run really wore (a /rankings row keeps its own sequences and ranks; a solve at the account runs a member
// it lacks at Wave 0's stand-in) — read off the run, never assumed
const notOwnedText = computed(() => {
  const list = notOwnedMembers.value;
  if (!list.length) return "";
  const who = listText(list.map((m) => m.name));
  const verb = list.length > 1 ? "are" : "is";
  // one member: their weapon by name; several at the same S / R: said once; else member by member
  const same = list.every((m) => m.sequence === list[0]!.sequence && m.refinement === list[0]!.refinement);
  const worn =
    list.length > 1 && same
      ? `them at S${list[0]!.sequence} with their weapons at R${list[0]!.refinement}`
      : listText(list.map((m) => `${m.name} at S${m.sequence} with ${m.weapon} R${m.refinement}`));
  return exactRow.value
    ? `${who} ${verb} not set up in the calculator: the Team rankings row you opened runs ${worn}, not your account's state.`
    : `Not fieldable at your account yet: ${who} ${verb} not set up in the calculator, so wuwa_calc runs ${worn}.`;
});
const names = computed(() => run.value?.members.map((m) => m.name).join(" · ") ?? "");
const heading = computed(() => names.value || "Rotation");
// the spread the run wore: a /rankings row carries its own (mixed where its members differ)
const spreadLabel = computed(() => {
  const subs = exactRow.value ? rowSubs.value : parsed.value.subs;
  const spread = subs === "standard" ? "ChemX32 substats" : subs === "high" ? "High Invest substats" : subs === "mine" ? "my echoes" : "mixed substats";
  return exactRow.value ? `Team rankings row, ${spread}` : spread;
});
/** A problem's message as a sentence (the solver's own messages start lower-case and carry no full stop). */
const sentence = (s: string): string => {
  const t = s.trim();
  if (!t) return "";
  const head = /^wuwa_calc\b/.test(t) ? t : `${t[0]!.toUpperCase()}${t.slice(1)}`; // his name stays lower-case
  return /[.!?]$/.test(head) ? head : `${head}.`;
};

useDocumentTitle(
  computed(() => (names.value ? `${names.value} rotation — Wuthering Waves Calculator & Optimizer` : "Rotation cue cards — Wuthering Waves Calculator & Optimizer")),
  "Any wuwa_calc team's frame-timed rotation at your own account: one line per swap with R and Outro checkpoints, a play-along timer, and a fight timeline of field time, buff uptime and kill times.",
);

const busy = computed(() => phase.value === "engine" || phase.value === "solving" || phase.value === "tracing");
const phaseText = computed(() =>
  phase.value === "engine"
    ? "Starting the rankings engine…"
    : phase.value === "solving"
      ? `Solving at your account${progress.value.total > 1 ? ` (${progress.value.done} of ${progress.value.total} loadouts)` : ""}…`
      : "Tracing the rotation frame by frame…",
);
const problemTitle = computed(() =>
  ({
    code: "A team code this engine does not know",
    notInApp: "Not released in this app",
    noBuild: "Not fieldable at your account",
    unknownTeam: "Not a wuwa_calc rotation",
    error: "The engine stopped",
  })[problem.value?.kind ?? "error"],
);
const problemText = computed(() => {
  const p = problem.value;
  if (!p) return "";
  if (p.kind === "noBuild") return `${sentence(p.message)} Team rankings can run it at a fixed investment tier.`;
  if (p.kind === "notInApp") return `${sentence(p.message)} Only released characters run here.`;
  return sentence(p.message);
});

function go(target: RotationTarget | null, patch: { subs?: SubsMode; tab?: RotationTab } = {}): void {
  const hash = buildRotationHash({ target, subs: patch.subs ?? parsed.value.subs, tab: patch.tab ?? parsed.value.tab });
  void router.replace({ path: "/rotation", hash });
}
const setTab = (tab: RotationTab): void => go(parsed.value.target, { tab });
function setSubs(subs: SubsMode): void {
  const t = parsed.value.target;
  // a Team rankings row carries its own spread in its picks: another spread is the team's best row in that spread
  if (t?.kind === "team" && t.rowKey) go({ kind: "team", teamKey: t.teamKey, rowKey: null, picks: null }, { subs });
  else go(t, { subs });
}
const setVariant = (key: string): void => go({ kind: "team", teamKey: key, rowKey: null, picks: null });
const openRankings = (code: string): void => void router.push({ path: "/rankings", hash: `#team=${encodeURIComponent(code)}` });

/* preferences (beep, text size, pace, HP line, last team) */
const prefs = reactive(readPrefs());
watch(prefs, () => writePrefs({ ...prefs }), { deep: true });
watch(
  () => [phase.value, route.fullPath],
  () => {
    if (phase.value === "ready" && names.value) {
      prefs.last = route.hash;
      prefs.lastTitle = names.value;
    }
  },
);
const last = computed(() => (prefs.last && prefs.lastTitle ? { path: `/rotation${prefs.last}`, title: prefs.lastTitle } : null));

/* the picker: his team list (the hues too) */
const teamList = shallowRef<RileyTeamInfo[]>([]);
const blocked = ref<string[]>([]);
const listLoading = ref(true);
const listError = ref<string | null>(null);
const huesAll = computed(() => {
  const map = new Map<string, string>();
  for (const t of teamList.value) for (const m of t.members) if (m.hue && !map.has(m.name)) map.set(m.name, m.hue);
  return map;
});
async function loadList(): Promise<void> {
  listLoading.value = true;
  listError.value = null;
  for (let attempt = 0; ; attempt++) {
    try {
      teamList.value = await client.teams();
      blocked.value = await client.blocked();
      break;
    } catch (e) {
      // the team list is one shared request: a run that started it and was then cancelled (the Teams link pressed
      // while the engine was starting) rejects it for every reader — ask again, the client has forgotten it by now
      if ((e as { name?: string })?.name === "AbortError" && attempt < 2) continue;
      listError.value = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  listLoading.value = false;
}
onMounted(() => void loadList());
</script>
