<template>
  <Nav cur-page="matrix" :disable-mobile-nav="true"></Nav>
  <div class="matrix-planner px-4 py-4 mx-auto w-full max-w-6xl" data-test-matrix>
    <div class="flex flex-wrap items-center gap-3 mb-2">
      <h1 class="text-2xl font-bold">Endstate Matrix planner</h1>
      <span class="badge badge-outline">{{ phase.version }} · {{ phase.season }} · {{ phase.from }} → {{ phase.to }}</span>
      <div class="ml-auto join">
        <RouterLink to="/rankings" class="btn btn-sm join-item">wuwa_calc rankings</RouterLink>
        <RouterLink to="/my-rankings" class="btn btn-sm join-item">My roster</RouterLink>
      </div>
    </div>
    <p class="text-sm opacity-70 mb-4">
      Teams of three plus a Power Circuit fight the phase's bosses in succession; score is damage dealt, later rounds
      multiply it (×{{ phase.rounds.join(" / ×") }}), every Resonator fights once (the designated healers twice) and each
      boss resists its own element. The planner scores every team your roster can field with Riley's wuwa_calc engine
      (main DPS at your sequence and weapon rank, supports S0R1), then fields the most teams it can under Vigor and lists
      them weakest → strongest: send them in that order and hold the last ones for the multiplied rounds.
    </p>

    <!-- bosses + circuits -->
    <div class="grid gap-3 md:grid-cols-2 mb-6">
      <div class="card bg-base-200/60 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Bosses this phase</h2>
          <ul class="space-y-2" data-test-matrix-bosses>
            <li v-for="b in phase.bosses" :key="b.stage" class="text-sm">
              <div class="flex items-center gap-2">
                <span class="badge badge-sm">{{ b.stage }}</span>
                <b>{{ b.name }}</b>
                <span v-if="b.resists" class="badge badge-warning badge-sm">resists {{ b.resists }}</span>
                <span v-else class="badge badge-ghost badge-sm">equal RES</span>
              </div>
              <div class="text-xs opacity-70 pl-8">{{ b.mechanics.join(" ") }}<span v-if="b.round2"> Round 2+: {{ b.round2 }}</span></div>
            </li>
          </ul>
        </div>
      </div>
      <div class="card bg-base-200/60 border border-base-300">
        <div class="card-body p-4">
          <h2 class="card-title text-base">Power Circuits</h2>
          <ul class="space-y-2">
            <li v-for="c in phase.circuits" :key="c.id" class="text-sm"><b>{{ c.name }}</b><div class="text-xs opacity-70">{{ c.effect }}</div></li>
          </ul>
          <div class="text-xs opacity-60 mt-2">Vigor: 1 fight each; {{ phase.vigor.two.join(", ") }} have 2<span v-for="(n, who) in phase.vigor.emergency" :key="who">; {{ who }} +{{ n }} this phase</span>.</div>
        </div>
      </div>
    </div>

    <!-- roster -->
    <div class="card bg-base-200/60 border border-base-300 mb-6">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="card-title text-base">Your roster</h2>
          <label class="label gap-2 py-0 text-sm">
            <span>DPS must be at least S</span>
            <input v-model.number="dpsFloor" type="number" min="0" max="6" class="input input-bordered input-xs w-14" data-test-matrix-dps-floor />
          </label>
          <label class="label gap-2 py-0 text-sm">
            <span>team floor</span>
            <input v-model.number="minScore" type="number" min="0" step="100000" class="input input-bordered input-xs w-28" data-test-matrix-min-score />
          </label>
          <span class="text-xs opacity-60">{{ roster.length }} Resonators · {{ dpsCandidates.length }} can lead</span>
        </div>
        <p class="text-xs opacity-70">
          Characters built in the calculator come in with their sequence and weapon rank. Tick anything else you own
          below (4-stars, Rover forms, healers) — they count as S0 R1 supports. Untick "use" to bench someone.
        </p>
        <div class="overflow-x-auto max-h-72">
          <table class="table table-xs">
            <thead><tr><th>use</th><th>Resonator</th><th>element</th><th>S</th><th>weapon</th><th>Vigor</th><th>role</th></tr></thead>
            <tbody>
              <tr v-for="r in roster" :key="r.name" :data-test-matrix-roster-row="r.name" :class="{ 'opacity-50': excluded.has(r.name) }">
                <td><input type="checkbox" class="checkbox checkbox-xs" :checked="!excluded.has(r.name)" @change="toggleExcluded(r.name)" /></td>
                <td>{{ r.name }}<span v-if="!r.fromData" class="badge badge-ghost badge-xs ml-1">ticked</span></td>
                <td class="text-xs">{{ elementOf(r.name) ?? catalogElement(r.name) ?? "?" }}</td>
                <td>S{{ r.sequence }}</td>
                <td class="text-xs">{{ r.weapon ? `${r.weapon} R${r.refinement}` : "—" }}</td>
                <td>{{ vigorOf(r.name) }}</td>
                <td class="text-xs opacity-70">{{ roleLabel(r) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center gap-2 mt-2">
          <input v-model="extraFilter" type="text" placeholder="add owned Resonators… (Sanhua, Aero Rover, Verina)" class="input input-bordered input-sm w-72" data-test-matrix-extra-filter />
          <div class="flex flex-wrap gap-1">
            <label v-for="name in extraChoices" :key="name" class="label cursor-pointer gap-1 py-0 px-2 rounded-box bg-base-100 border border-base-300 text-xs">
              <input type="checkbox" class="checkbox checkbox-xs" :checked="extras.includes(name)" :data-test-matrix-extra="name" @change="toggleExtra(name)" />
              {{ name }}
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- scoring -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <button type="button" class="btn btn-primary btn-sm" :disabled="isScoring || !dpsCandidates.length" data-test-matrix-score @click="scoreAll">
        <span v-if="isScoring" class="loading loading-spinner loading-xs"></span>
        {{ isScoring ? `Scoring ${progress.done} / ${progress.total}…` : scores.size ? "Rescore teams" : "Score my teams with Riley's engine" }}
      </button>
      <span class="text-xs opacity-70" data-test-matrix-progress>{{ statusText }}</span>
    </div>

    <!-- plan -->
    <template v-if="plan">
      <div class="flex flex-wrap items-center gap-3 mb-2">
        <h2 class="text-lg font-bold">The plan</h2>
        <span class="badge badge-primary" data-test-matrix-plan-count>{{ plan.count }} team{{ plan.count === 1 ? "" : "s" }}</span>
        <span class="text-xs opacity-70">score-weight {{ fmt(plan.total) }} · weakest first · {{ pinned.length ? `${pinned.length} pinned · ` : "" }}{{ dropped.size ? `${dropped.size} dropped · ` : "" }}</span>
        <button v-if="pinned.length || dropped.size" type="button" class="btn btn-ghost btn-xs" @click="resetEdits">reset edits</button>
      </div>
      <div class="space-y-2 mb-4">
        <div v-for="(t, i) in plan.teams" :key="t.team.join('|')" class="card bg-base-100 border border-base-300" :data-test-matrix-plan-team="t.dps">
          <div class="card-body p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge badge-neutral">{{ i + 1 }}</span>
              <span class="badge badge-outline badge-sm">{{ roundLabels(plan.teams.length)[i] }}</span>
              <b>{{ t.order.join(" → ") }}</b>
              <span class="text-xs opacity-60">DPS {{ t.dps }} · S{{ sequenceOf(t.dps) }} R{{ t.refinement }} · {{ t.state }}</span>
              <span class="ml-auto tabular-nums font-semibold" :title="`engine total ${fmt(t.base)} × matrix ${t.matrix} × circuit ${t.circuitMult}`">{{ fmt(t.score) }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs mt-1">
              <span class="badge badge-info badge-sm" :title="circuitEffect(t.circuit)">{{ circuitName(t.circuit) }}</span>
              <span v-if="t.avoid.length" class="badge badge-warning badge-sm">avoid {{ t.avoid.join(", ") }}</span>
              <span v-if="t.matrix > 1" class="badge badge-ghost badge-sm">Matrix ×{{ t.matrix }}</span>
              <span class="opacity-70">{{ t.picks.map((p) => `${p.name}: ${p.weapon}, ${p.echo}, ${p.mainstat}`).join(" · ") }}</span>
              <span class="ml-auto flex gap-1">
                <select class="select select-bordered select-xs max-w-56" :value="''" @change="swapTeam(t, ($event.target as HTMLSelectElement).value)">
                  <option value="">swap for…</option>
                  <option v-for="alt in alternativesFor(t)" :key="alt.team.join('|')" :value="alt.team.join('|')">{{ alt.team.join(" + ") }} — {{ fmt(alt.score) }} ({{ circuitName(alt.circuit) }})</option>
                </select>
                <button type="button" class="btn btn-ghost btn-xs" :class="{ 'btn-active': isPinned(t) }" @click="togglePin(t)">{{ isPinned(t) ? "pinned" : "pin" }}</button>
                <button type="button" class="btn btn-ghost btn-xs" @click="dropTeam(t)">drop</button>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div class="text-sm mb-6">
        <b>Vigor left</b>
        <div class="text-xs opacity-80">{{ vigorLeftText }}</div>
        <div v-if="unfielded.length" class="mt-2 text-xs">
          <b>Not fielded:</b>
          <div v-for="u in unfielded" :key="u.name">{{ u.name }} — {{ u.reason }}</div>
        </div>
      </div>
    </template>

    <div v-if="plan || savedPlans.length" class="card bg-base-200/60 border border-base-300 mb-6">
      <div class="card-body p-4 text-sm">
        <h2 class="card-title text-base">Saved plans</h2>
        <div class="flex flex-wrap items-center gap-2">
          <input v-model="saveName" type="text" placeholder="plan name" class="input input-bordered input-xs w-40" data-test-matrix-save-name />
          <button type="button" class="btn btn-xs" :disabled="!plan || !saveName.trim()" data-test-matrix-save @click="savePlan">Save this plan</button>
          <button type="button" class="btn btn-xs" :disabled="!plan" data-test-matrix-export @click="exportPlan">Copy JSON</button>
          <button type="button" class="btn btn-xs" @click="showImport = !showImport">Import JSON</button>
        </div>
        <textarea v-if="showImport" v-model="importText" class="textarea textarea-bordered w-full mt-2 text-xs" rows="3" placeholder="paste a plan's JSON"></textarea>
        <button v-if="showImport" type="button" class="btn btn-xs mt-1 w-fit" @click="importPlan">Load pasted plan</button>
        <div v-if="savedPlans.length" class="mt-2 space-y-1">
          <div v-for="p in savedPlans" :key="p.id" class="flex items-center gap-2 text-xs" data-test-matrix-saved-plan>
            <span>{{ p.name }} · {{ p.teams.length }} teams · {{ new Date(p.savedAt).toLocaleDateString() }}</span>
            <button type="button" class="btn btn-ghost btn-xs" @click="loadPlan(p)">load</button>
            <button type="button" class="btn btn-ghost btn-xs" @click="deletePlan(p)">delete</button>
          </div>
        </div>
      </div>
    </div>

    <details v-if="candidates.length" class="collapse collapse-arrow bg-base-200/60 border border-base-300">
      <summary class="collapse-title text-sm font-semibold">All {{ candidates.length }} scored teams</summary>
      <div class="collapse-content overflow-x-auto">
        <table class="table table-xs">
          <thead><tr><th>team</th><th class="text-right">score</th><th>circuit</th><th>state</th><th>avoid</th></tr></thead>
          <tbody>
            <tr v-for="c in candidates" :key="c.team.join('|')">
              <td>{{ c.order.join(" → ") }}</td>
              <td class="text-right tabular-nums">{{ fmt(c.score) }}</td>
              <td class="text-xs">{{ circuitName(c.circuit) }}</td>
              <td class="text-xs">{{ c.state }}</td>
              <td class="text-xs">{{ c.avoid.join(", ") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
    <p v-if="failures.length" class="text-xs opacity-60 mt-2">{{ failures.length }} compositions could not be run (no kit in wuwa_calc, or no member can lead the fight).</p>
    <p class="text-xs opacity-50 mt-4">Rules and bosses from {{ phase.sources.join("; ") }}. Scores come from Riley31415/wuwa_calc's engine on his standard builds, not your echoes.</p>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+: Endstate Matrix planner — see planMatrix.ts (decisions) and matrix.worker.ts (engine).
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import Nav from "../../components/navigation/Nav.vue";
import { useCharacterStore } from "../../stores/character";
import {
  PHASE,
  ROVER_FORMS,
  bestPlan,
  compositionsFor,
  elementOf,
  finishCandidate,
  rosterFrom,
  roundLabels,
  statesFor,
  vigorLeft,
  vigorOf,
  type Candidate,
  type CircuitId,
  type Composition,
  type EngineScore,
  type Plan,
  type RosterEntry,
  type SolveState,
} from "./planMatrix";
import type { CatalogEntry } from "./matrix.worker";

const phase = PHASE;
const SETTINGS_KEY = "wuthering-tools-plus.matrix.settings";
const PLANS_KEY = "wuthering-tools-plus.matrix.plans";

interface SavedPlan {
  id: string;
  name: string;
  savedAt: string;
  phase: string;
  teams: Candidate[];
}

const characterStore = useCharacterStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, unknown>> } };

const extras = ref<string[]>([]);
const excluded = ref<Set<string>>(new Set());
const dpsFloor = ref(6);
const minScore = ref(1_500_000);
const extraFilter = ref("");
const catalog = ref<CatalogEntry[]>([]);
const scores = ref<Map<string, EngineScore>>(new Map());
const failures = ref<string[]>([]);
const isScoring = ref(false);
const progress = ref({ done: 0, total: 0 });
const statusText = ref("");
const pinned = ref<Candidate[]>([]);
const dropped = ref<Set<string>>(new Set());
const saveName = ref("");
const savedPlans = ref<SavedPlan[]>([]);
const showImport = ref(false);
const importText = ref("");

function loadSettings(): void {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as { extras?: string[]; excluded?: string[]; dpsFloor?: number; minScore?: number };
    extras.value = s.extras ?? [];
    excluded.value = new Set(s.excluded ?? []);
    if (typeof s.dpsFloor === "number") dpsFloor.value = s.dpsFloor;
    if (typeof s.minScore === "number") minScore.value = s.minScore;
    savedPlans.value = JSON.parse(localStorage.getItem(PLANS_KEY) ?? "[]") as SavedPlan[];
  } catch {
    /* fresh */
  }
}
function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ extras: extras.value, excluded: [...excluded.value], dpsFloor: dpsFloor.value, minScore: minScore.value }));
  } catch {
    /* storage unavailable */
  }
}

const roster = computed<RosterEntry[]>(() => rosterFrom(characters.value ?? {}, extras.value));
const activeRoster = computed(() => roster.value.filter((r) => !excluded.value.has(r.name)));
const catalogNames = computed(() => new Set(catalog.value.map((c) => c.name)));
const dpsCapable = computed(() => new Set(catalog.value.filter((c) => c.dps).map((c) => c.name)));
const dpsCandidates = computed(() => activeRoster.value.filter((r) => r.sequence >= dpsFloor.value && dpsCapable.value.has(r.name)));
const extraChoices = computed(() => {
  const have = new Set(roster.value.filter((r) => r.fromData).map((r) => r.name));
  const q = extraFilter.value.trim().toLowerCase();
  return catalog.value.map((c) => c.name).filter((n) => !have.has(n) && (extras.value.includes(n) || (q.length >= 2 && n.toLowerCase().includes(q))));
});
const catalogElement = (name: string): string | null => catalog.value.find((c) => c.name === name)?.element ?? null;
const sequenceOf = (name: string): number => roster.value.find((r) => r.name === name)?.sequence ?? 0;
function roleLabel(r: RosterEntry): string {
  if (!catalogNames.value.has(r.name)) return "not in wuwa_calc";
  const c = catalog.value.find((x) => x.name === r.name)!;
  const dps = c.dps && r.sequence >= dpsFloor.value;
  return dps ? (c.support ? "DPS or support" : "DPS") : c.support ? "support" : `DPS below S${dpsFloor.value}`;
}
const fmt = (n: number): string => Math.round(n).toLocaleString();
const circuitName = (id: CircuitId): string => phase.circuits.find((c) => c.id === id)?.name ?? id;
const circuitEffect = (id: CircuitId): string => phase.circuits.find((c) => c.id === id)?.effect ?? "";

function toggleExtra(name: string): void {
  extras.value = extras.value.includes(name) ? extras.value.filter((n) => n !== name) : [...extras.value, name];
  saveSettings();
}
function toggleExcluded(name: string): void {
  const next = new Set(excluded.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  excluded.value = next;
  saveSettings();
}

// ---- engine workers
let pool: Worker[] = [];
function makeWorker(): Worker {
  return new Worker(new URL("./matrix.worker.ts", import.meta.url), { type: "module" });
}
async function fetchCatalog(): Promise<void> {
  const w = pool[0] ?? makeWorker();
  if (!pool.length) pool = [w];
  catalog.value = await new Promise<CatalogEntry[]>((resolve) => {
    const onMessage = (e: MessageEvent<{ type: string; entries?: CatalogEntry[] }>): void => {
      if (e.data?.type === "catalog") {
        w.removeEventListener("message", onMessage);
        resolve(e.data.entries ?? []);
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "catalog" });
  });
}

const keyOf = (c: Composition, state: SolveState): string => `${c.dps}|${[...c.mates].sort().join("+")}|${state}`;

async function scoreAll(): Promise<void> {
  if (isScoring.value) return;
  isScoring.value = true;
  failures.value = [];
  try {
    if (!catalog.value.length) await fetchCatalog();
    const comps = compositionsFor(activeRoster.value, dpsFloor.value, { dpsNames: [...dpsCapable.value], supportNames: [...catalogNames.value] });
    const jobs: Array<{ comp: Composition; state: SolveState }> = [];
    for (const comp of comps) {
      const entry = roster.value.find((r) => r.name === comp.dps)!;
      for (const state of statesFor(entry.refinement, entry.sequence)) if (!scores.value.has(keyOf(comp, state))) jobs.push({ comp, state });
    }
    progress.value = { done: 0, total: jobs.length };
    statusText.value = jobs.length ? `${comps.length} compositions, ${jobs.length} engine runs` : "nothing new to score";
    const want = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    while (pool.length < want) pool.push(makeWorker());
    let next = 0;
    let id = 0;
    const run = (w: Worker): Promise<void> =>
      new Promise((resolve) => {
        const pump = (): void => {
          if (next >= jobs.length) { resolve(); return; }
          const job = jobs[next++];
          const myId = ++id;
          const onMessage = (e: MessageEvent<Record<string, unknown> & { type: string; id: number; ok: boolean }>): void => {
            if (e.data?.type !== "score" || e.data.id !== myId) return;
            w.removeEventListener("message", onMessage);
            if (e.data.ok) scores.value.set(keyOf(job.comp, job.state), e.data as unknown as EngineScore);
            else failures.value.push(`${job.comp.dps} + ${job.comp.mates.join(" + ")}: ${String(e.data.error)}`);
            progress.value = { ...progress.value, done: progress.value.done + 1 };
            pump();
          };
          w.addEventListener("message", onMessage);
          w.postMessage({ type: "score", id: myId, dps: job.comp.dps, mates: job.comp.mates, state: job.state });
        };
        pump();
      });
    await Promise.all(pool.map((w) => run(w)));
    scores.value = new Map(scores.value);
    statusText.value = `${scores.value.size} engine scores`;
  } finally {
    isScoring.value = false;
  }
}

// ---- candidates and the plan
const candidates = computed<Candidate[]>(() => {
  const byComp = new Map<string, Partial<Record<SolveState, EngineScore>>>();
  for (const [key, s] of scores.value) {
    const compKey = key.slice(0, key.lastIndexOf("|"));
    const entry = byComp.get(compKey) ?? {};
    entry[s.state] = s;
    byComp.set(compKey, entry);
  }
  const active = new Set(activeRoster.value.map((r) => r.name));
  const out: Candidate[] = [];
  for (const entry of byComp.values()) {
    const c = finishCandidate(entry, roster.value);
    if (!c) continue;
    if (!c.team.every((m) => active.has(m))) continue;
    if (sequenceOf(c.dps) < dpsFloor.value) continue;
    out.push(c);
  }
  return out.sort((a, b) => b.score - a.score);
});
const plan = computed<Plan | null>(() => {
  if (!candidates.value.length) return null;
  const usable = candidates.value.filter((c) => !dropped.value.has(c.team.join("|")));
  return bestPlan(usable, minScore.value, phase, pinned.value.filter((p) => usable.some((c) => c.team.join("|") === p.team.join("|"))));
});
const vigorLeftText = computed(() => {
  if (!plan.value) return "";
  const left = vigorLeft(plan.value.teams, activeRoster.value);
  return [...left].map(([n, v]) => `${n} ${v}/${vigorOf(n)}`).join(" · ");
});
const unfielded = computed(() => {
  if (!plan.value) return [];
  const used = new Set(plan.value.teams.flatMap((t) => t.team));
  return activeRoster.value
    .filter((r) => r.sequence >= dpsFloor.value && !used.has(r.name))
    .map((r) => ({ name: r.name, reason: !catalogNames.value.has(r.name) ? "no kit in wuwa_calc yet — place by hand" : candidates.value.some((c) => c.dps === r.name) ? "no team fits the remaining Vigor" : "no scored team" }));
});
function alternativesFor(t: Candidate): Candidate[] {
  if (!plan.value) return [];
  const others = plan.value.teams.filter((x) => x !== t);
  const left = vigorLeft(others, activeRoster.value);
  const roverUsed = others.some((x) => x.team.some((m) => ROVER_FORMS.includes(m)));
  return candidates.value
    .filter((c) => c.dps === t.dps && c.team.join("|") !== t.team.join("|"))
    .filter((c) => c.team.every((m) => (left.get(m) ?? vigorOf(m)) >= 1) && !(roverUsed && c.team.some((m) => ROVER_FORMS.includes(m))))
    .slice(0, 6);
}
const isPinned = (t: Candidate): boolean => pinned.value.some((p) => p.team.join("|") === t.team.join("|"));
function togglePin(t: Candidate): void {
  pinned.value = isPinned(t) ? pinned.value.filter((p) => p.team.join("|") !== t.team.join("|")) : [...pinned.value, t];
}
function dropTeam(t: Candidate): void {
  dropped.value = new Set([...dropped.value, t.team.join("|")]);
  pinned.value = pinned.value.filter((p) => p.team.join("|") !== t.team.join("|"));
}
function swapTeam(t: Candidate, key: string): void {
  const alt = candidates.value.find((c) => c.team.join("|") === key);
  if (!alt) return;
  dropTeam(t);
  pinned.value = [...pinned.value, alt];
}
function resetEdits(): void {
  pinned.value = [];
  dropped.value = new Set();
}

// ---- saved plans
function persistPlans(): void {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(savedPlans.value));
  } catch {
    /* storage unavailable */
  }
}
function savePlan(): void {
  if (!plan.value || !saveName.value.trim()) return;
  savedPlans.value = [...savedPlans.value, { id: `${Date.now()}`, name: saveName.value.trim(), savedAt: new Date().toISOString(), phase: phase.version, teams: plan.value.teams }];
  saveName.value = "";
  persistPlans();
}
function loadPlan(p: SavedPlan): void {
  for (const t of p.teams) {
    const key = `${t.team.join("|")}`;
    if (!candidates.value.some((c) => c.team.join("|") === key)) {
      // the scores are not in memory: seed the candidate list from the saved plan so it renders
      const state = t.state;
      scores.value.set(`${t.dps}|${[...t.team.slice(1)].sort().join("+")}|${state}`, {
        dps: t.dps, mates: [t.team[1], t.team[2]], state, order: t.order, total: t.base, bySlot: [[t.dps, t.base]], casts: [], picks: t.picks,
      });
    }
  }
  scores.value = new Map(scores.value);
  dropped.value = new Set();
  pinned.value = [...p.teams];
}
function deletePlan(p: SavedPlan): void {
  savedPlans.value = savedPlans.value.filter((x) => x.id !== p.id);
  persistPlans();
}
function exportPlan(): void {
  if (!plan.value) return;
  const text = JSON.stringify({ phase: phase.version, exportedAt: new Date().toISOString(), teams: plan.value.teams }, null, 1);
  void navigator.clipboard?.writeText(text);
  importText.value = text;
  showImport.value = true;
}
function importPlan(): void {
  try {
    const data = JSON.parse(importText.value) as { name?: string; teams: Candidate[] };
    if (!Array.isArray(data.teams)) throw new Error("no teams");
    loadPlan({ id: `${Date.now()}`, name: data.name ?? "imported", savedAt: new Date().toISOString(), phase: phase.version, teams: data.teams });
    showImport.value = false;
  } catch (error) {
    statusText.value = `could not read that plan: ${error instanceof Error ? error.message : String(error)}`;
  }
}

onMounted(() => {
  loadSettings();
  void fetchCatalog();
});
onBeforeUnmount(() => {
  for (const w of pool) w.terminate();
  pool = [];
  saveSettings();
});
</script>
