<template>
  <Nav cur-page="build-team" :disable-mobile-nav="true"></Nav>
  <div class="bt" data-test-build-team :data-phase="phase">
    <header class="bt-head">
      <div class="bt-head__title">
        <h1 class="bt-h1">Build my team</h1>
        <span class="bt-tag">from your echoes</span>
      </div>
      <ol v-if="team" class="bt-steps" aria-label="Steps">
        <li v-for="(s, i) in STEPS" :key="s" :class="{ 'bt-steps__on': stepIndex === i, 'bt-steps__done': stepIndex > i }" :aria-current="stepIndex === i ? 'step' : undefined">
          <span class="bt-steps__n">{{ i + 1 }}</span><span class="bt-steps__t"><span class="bt-steps__long">{{ s }}</span><span class="bt-steps__short">{{ STEPS_SHORT[i] }}</span></span>
        </li>
      </ol>
      <p class="bt-head__sub bt-head__sub--long">
        Re-gear a whole team from the echoes you own: wuwa_calc's pick at your account for each member (sets, main echo,
        main stats, the Energy Regen their loop needs), this app's optimizer on your inventory, never one echo twice.
      </p>
      <p class="bt-head__sub bt-head__sub--short">wuwa_calc's pick per member, your own echoes, never one echo twice.</p>
    </header>

    <div v-if="error && phase !== 'error'" role="alert" class="alert alert-warning mb-3 text-sm" data-test-build-team-error>{{ error }}</div>

    <BuildTeamPicker v-if="phase === 'pick'" :teams="teamStore.teams" :characters="characterStore.characters" />

    <template v-else-if="team">
      <!-- the team -->
      <section class="bt-team" data-test-build-team-team>
        <div class="bt-team__trio">
          <CharacterAvatar v-for="id in memberIds" :id="id" :key="id" :size="40" />
        </div>
        <div class="bt-team__text">
          <PresetNameLabel v-if="team.id" :name="team.name" source="yours" :owned="ownedKeys" :max-chips="2" />
          <span v-else class="bt-team__name">{{ team.name }}</span>
          <div class="bt-team__chips">
            <span class="bt-chip" :class="team.id ? 'bt-chip--saved' : 'bt-chip--adhoc'">{{ team.id ? `Saved team · ${team.actions?.length ?? 0} actions` : "Not a saved team" }}</span>
            <span v-if="plans?.riley" class="bt-chip bt-chip--riley" data-test-build-team-riley :title="`wuwa_calc team ${plans.riley.teamKey}, solved at your account's sequences, weapons and echoes`">
              wuwa_calc {{ plans.riley.teamKey }} · {{ fmtInt(plans.dpsMine) }} DPS
            </span>
            <span v-else-if="plans?.rileyNote" class="bt-chip bt-chip--muted" data-test-build-team-riley-note>{{ plans.rileyNote }}</span>
          </div>
        </div>
        <RouterLink to="/build-team" class="btn btn-ghost btn-sm bt-team__change" data-test-build-team-change>Change team</RouterLink>
      </section>

      <!-- loading the plan -->
      <section v-if="phase === 'loading'" class="bt-grid" aria-busy="true" data-test-build-team-loading>
        <div v-for="n in memberIds.length || 3" :key="n" class="bt-card bt-skel">
          <div class="flex items-center gap-3"><span class="skeleton size-11 rounded-full"></span><span class="skeleton h-4 w-28 rounded"></span></div>
          <span class="skeleton h-3 w-3/4 rounded"></span><span class="skeleton h-3 w-2/3 rounded"></span><span class="skeleton h-3 w-1/2 rounded"></span>
        </div>
        <p class="bt-grid__note">Asking wuwa_calc for its pick at your account…</p>
      </section>

      <section v-else-if="phase === 'error'" class="bt-card bt-fatal" role="alert" data-test-build-team-fatal>
        <p class="font-semibold">Something went wrong</p>
        <p class="text-sm opacity-80">{{ error }}</p>
        <div class="mt-3 flex gap-2">
          <button type="button" class="btn btn-primary btn-sm" data-test-build-team-retry @click="retry">Try again</button>
          <RouterLink to="/build-team" class="btn btn-ghost btn-sm">Pick another team</RouterLink>
        </div>
      </section>

      <!-- step 1: the plan -->
      <template v-if="phase === 'plan' && plans">
        <BuildTeamSwitch v-if="memberSlots.length > 1" v-model="shown" :slots="prioritySlots" :ids="team.characterIds" />
        <section class="bt-grid">
          <BuildTeamPlanCard
            v-for="slot in prioritySlots"
            :key="slot"
            :class="{ 'bt-phone-hide': shown !== slot }"
            :plan="plans.plans[slot]!"
            :character-id="team.characterIds[slot]!"
            :priority="order.indexOf(slot) + 1"
            :count="order.length"
            :er-floor="erFloors[slot] ?? null"
            :current-er="currentEr[slot] ?? null"
            :current-main-echo="currentMainEcho(slot)"
            :options="options"
            :objective="objectiveOf(slot)"
            @move="(d: number) => move(slot, d)"
            @update:er-floor="(v: number | null) => (erFloors[slot] = v)" />
        </section>

        <section class="bt-options" data-test-build-team-options>
          <h2 class="bt-h2">Options</h2>
          <div class="bt-options__grid">
            <label class="bt-opt"><input v-model="options.useSets" type="checkbox" class="toggle toggle-sm toggle-primary" data-test-build-team-opt="useSets" /><span><b>The plan's sets</b><small>Only echoes of each member's planned Sonata sets.</small></span></label>
            <label class="bt-opt"><input v-model="options.useMainStats" type="checkbox" class="toggle toggle-sm toggle-primary" data-test-build-team-opt="useMainStats" /><span><b>The plan's main stats</b><small>Per cost, only the main stats the plan wears; relaxed automatically when your echoes can't fill it.</small></span></label>
            <label class="bt-opt"><input v-model="options.keepMainEcho" type="checkbox" class="toggle toggle-sm toggle-primary" data-test-build-team-opt="keepMainEcho" /><span><b>Keep current main echoes</b><small>Each member keeps the main echo they wear.</small></span></label>
            <label class="bt-opt"><input v-model="options.takeFromOthers" type="checkbox" class="toggle toggle-sm toggle-warning" data-test-build-team-opt="takeFromOthers" /><span><b>Take echoes other characters wear</b><small>{{ wornOutsideCount }} echoes are worn by characters outside this team. Off: they stay out of the search. On: a build may share them (nothing is taken off anyone).</small></span></label>
            <label class="bt-opt"><input v-model="options.tryAllOrders" type="checkbox" class="toggle toggle-sm toggle-primary" data-test-build-team-opt="tryAllOrders" /><span><b>Try every priority order</b><small>When members compete for the same echoes, all six orders are tried and the best team kept.</small></span></label>
          </div>
        </section>

        <div class="bt-actions">
          <button type="button" class="btn btn-primary" :disabled="!runnable" data-test-build-team-run @click="run">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5" aria-hidden="true"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke-linejoin="round" /></svg>
            Build from my echoes
          </button>
          <span class="bt-actions__hint text-xs opacity-65">Priority order: {{ order.map((s) => shortName(team!.characterIds[s]!)).join(" → ") }}. Nothing is saved until you review it.</span>
        </div>
      </template>

      <!-- step 2: running -->
      <section v-else-if="phase === 'running'" class="bt-card bt-run" aria-live="polite" data-test-build-team-running>
        <div class="bt-section-head">
          <h2 class="bt-h2">Building…</h2>
          <button type="button" class="btn btn-sm" data-test-build-team-cancel @click="cancel">Cancel</button>
        </div>
        <ul class="bt-run__list">
          <li v-for="slot in prioritySlots" :key="slot" class="bt-run__row" :data-test-build-team-progress="team.characterIds[slot]">
            <CharacterAvatar :id="team.characterIds[slot]!" :size="32" />
            <div class="bt-run__body">
              <div class="bt-run__top">
                <span class="font-semibold">{{ shortName(team.characterIds[slot]!) }}</span>
                <span class="bt-run__phase">{{ phaseText(progress[slot]?.phase) }}</span>
              </div>
              <progress class="progress progress-primary w-full" :value="barValue(slot)" max="100"></progress>
              <span class="bt-run__n tabular-nums">{{ fmtInt(progress[slot]?.processed ?? 0) }} combinations checked</span>
            </div>
          </li>
        </ul>
        <p class="text-xs opacity-60">Runs in the optimizer's workers (Settings › Preferences sets how many); the page stays usable.</p>
      </section>

      <!-- step 3: result -->
      <template v-else-if="phase === 'result' && result">
        <section class="bt-summary" data-test-build-team-summary>
          <div v-if="result.team" class="bt-kpi" data-test-build-team-team-total>
            <span class="bt-kpi__k">Team rotation</span>
            <span class="bt-kpi__v tabular-nums">{{ compactNum(result.team.before) }} → {{ compactNum(result.team.after) }}</span>
            <span class="bt-delta" :class="`bt-delta--${deltaTone(result.team.before, result.team.after)}`">{{ deltaText(result.team.before, result.team.after) }}</span>
            <span class="bt-kpi__s">avg damage per rotation{{ result.team.dpsAfter ? ` · ${compactNum(result.team.dpsAfter)} DPS` : "" }}</span>
          </div>
          <div v-if="plans?.dpsMine" class="bt-kpi" data-test-build-team-riley-dps>
            <span class="bt-kpi__k">wuwa_calc at your account</span>
            <span class="bt-kpi__v tabular-nums">
              {{ compactNum(plans.dpsMine) }} → <template v-if="rileyAfter != null">{{ compactNum(rileyAfter) }}</template><span v-else class="loading loading-dots loading-xs align-middle"></span>
            </span>
            <span v-if="rileyAfter != null" class="bt-delta" :class="`bt-delta--${deltaTone(plans.dpsMine, rileyAfter)}`">{{ deltaText(plans.dpsMine, rileyAfter) }}</span>
            <span class="bt-kpi__s">team DPS in Riley's engine with the new echoes</span>
          </div>
          <div v-if="plans?.dpsHigh" class="bt-kpi" data-test-build-team-high>
            <span class="bt-kpi__k">Gap to High Invest</span>
            <span class="bt-kpi__v tabular-nums">{{ highGap }}</span>
            <span class="bt-kpi__s">his High Invest spread: {{ compactNum(plans.dpsHigh) }} DPS</span>
          </div>
          <p class="bt-summary__line">{{ runSummary(result) }}</p>
        </section>

        <BuildTeamSwitch v-if="memberSlots.length > 1" v-model="shown" :slots="prioritySlots" :ids="team.characterIds" :deltas="switchDeltas" />

        <section class="bt-grid">
          <BuildTeamResultCard
            v-for="slot in prioritySlots"
            :key="slot"
            :class="{ 'bt-phone-hide': shown !== slot }"
            :outcome="result.members[slot]!"
            :plan="plans?.plans[slot]"
            :priority="result.order.indexOf(slot) + 1 || order.indexOf(slot) + 1"
            :save="!!saveSlots[slot]"
            @update:save="(v: boolean) => (saveSlots[slot] = v)" />
        </section>

        <div v-if="applied" role="status" class="alert alert-success mt-3 text-sm" data-test-build-team-saved>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5 shrink-0" aria-hidden="true"><path d="M5 12l5 5 9-10" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>
            Saved {{ applied.created.length }} build{{ applied.created.length === 1 ? "" : "s" }}<template v-if="team.id">, pinned in “{{ team.name }}”</template><template v-if="applied.activated.length"> and made active</template>.
            <template v-if="applied.undoInMemoryOnly"> Undo lasts until you leave this page (this browser would not store it).</template>
          </span>
          <RouterLink to="/teams" class="btn btn-sm">Open Teams</RouterLink>
        </div>
      </template>

      <!-- the save bar: sticky on a phone -->
      <div v-if="(phase === 'result' && result) || undoLive" class="bt-savebar" data-test-build-team-savebar>
        <button v-if="undoLive" type="button" class="btn btn-ghost btn-sm" data-test-build-team-undo @click="onUndo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          Undo last build
        </button>
        <template v-if="phase === 'result' && result">
          <p v-if="conflicts.length && !applied" class="bt-savebar__warn" role="status" data-test-build-team-conflict>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="size-4 shrink-0" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span>{{ conflictText(conflicts) }}</span>
          </p>
          <label class="bt-savebar__active" title="Switch each saved member to the new build everywhere (the build they wear now stays saved)">
            <input v-model="makeActive" type="checkbox" class="checkbox checkbox-sm" data-test-build-team-make-active />
            <span>Also make active</span>
          </label>
          <button type="button" class="btn btn-ghost btn-sm" data-test-build-team-rebuild @click="backToPlan">Change plan</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="!toSave.length || !!applied" data-test-build-team-save @click="onSave">
            {{ applied ? "Saved" : toSave.length ? `Save ${toSave.length} team build${toSave.length === 1 ? "" : "s"}` : "Nothing to save" }}
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "Build it for me" (batch 2, Roadmap Phase 4): /build-team. Opens on a saved team (?team=<id>),
// a composition (?members=A,B,C, optionally &key=<wuwa_calc team key>), or a picker. Three steps: the plan (wuwa_calc's
// pick per member, priority, ER floors, options), the run (upstream's optimizer workers, progress, cancel), the result
// (the calculator's numbers for every produced build) and a confirmed save as new team builds, with undo.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useConfirm } from "../../composables/useConfirm";
import { useToast } from "../../composables/useToast";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import { characterDisplayName, characterShortName } from "../display/names";
import BuildTeamPicker from "./BuildTeamPicker.vue";
import BuildTeamPlanCard from "./BuildTeamPlanCard.vue";
import BuildTeamResultCard from "./BuildTeamResultCard.vue";
import BuildTeamSwitch from "./BuildTeamSwitch.vue";
import { menuErPercent, teamSlotRotation } from "./buildTeam";
import { buildNameFor } from "./apply";
import { compactNum, conflictText, deltaText, deltaTone, fmtInt, runSummary } from "./buildTeamView";
import { useBuildTeam, type MemberProgress } from "./useBuildTeam";
import "./buildTeam.css";

useDocumentTitle(
  "Build my team — Wuthering Waves Calculator & Optimizer",
  "Re-gear a Wuthering Waves team from your own echo inventory: wuwa_calc's pick per member, the app's optimizer, no echo used twice, saved as team builds with undo.",
);

const STEPS = ["Plan", "Build", "Review & save"];
const STEPS_SHORT = ["Plan", "Build", "Review"];
const route = useRoute();
const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const { confirm } = useConfirm();
const { showToast } = useToast();
const bt = useBuildTeam();
const { phase, error, team, plans, order, erFloors, options, progress, result, rileyAfter, saveSlots, applied, undoLive, wornOutsideCount, toSave, conflicts } = bt;
const { move, run, cancel } = bt;

const makeActive = ref(false);
const shown = ref(0);
const currentEr = ref<Array<number | null>>([]);

const stepIndex = computed(() => (phase.value === "running" ? 1 : phase.value === "result" ? 2 : 0));
const memberSlots = computed(() => (team.value?.characterIds ?? []).map((id, i) => (id ? i : -1)).filter((i) => i >= 0));
const memberIds = computed(() => memberSlots.value.map((i) => team.value!.characterIds[i]!) );
const prioritySlots = computed(() => {
  const o = result.value?.order.length ? [...result.value.order, ...order.value.filter((s) => !result.value!.order.includes(s))] : order.value;
  return [...o, ...memberSlots.value.filter((s) => !o.includes(s))];
});
const ownedKeys = computed(() => Object.keys(characterStore.characters ?? {}));
const runnable = computed(() => !!plans.value && memberSlots.value.some((s) => !!characterStore.characters?.[team.value!.characterIds[s]!]?.weapon));
const shortName = (id: string): string => characterShortName(id) || characterDisplayName(id);

function objectiveOf(slot: number): string {
  if (!team.value) return "";
  const rot = teamSlotRotation(team.value, slot);
  return rot ? `Their part of the team rotation · ${rot.actions.length} actions` : "Their best rotation (as roster rankings picks it)";
}
const currentMainEcho = (slot: number): string | null => characterStore.characters?.[team.value?.characterIds[slot] ?? ""]?.mainEcho?.echo ?? null;

const PHASE_TEXT: Record<MemberProgress["phase"], string> = { waiting: "Waiting", prepare: "Setting up", search: "Searching your echoes", swap: "Trying swaps", verify: "Checking the build", done: "Done" };
const phaseText = (p: MemberProgress["phase"] | undefined): string => PHASE_TEXT[p ?? "waiting"];
function barValue(slot: number): number {
  const p = progress.value[slot];
  if (!p) return 0;
  if (p.phase === "done" || p.phase === "verify") return 100;
  if (p.phase === "swap") return 92;
  if (p.phase === "search" && p.generated > 0) return Math.min(88, 8 + (p.processed / Math.max(p.generated, 1)) * 80);
  return p.phase === "prepare" ? 5 : 0;
}

const switchDeltas = computed(() =>
  (result.value?.members ?? []).map((m) => (m?.after && m.before ? { text: deltaText(m.before.value, m.after.value), tone: deltaTone(m.before.value, m.after.value) } : { text: m?.status === "ok" ? "" : "—", tone: "flat" })),
);
const highGap = computed(() => {
  const high = plans.value?.dpsHigh;
  const after = rileyAfter.value ?? plans.value?.dpsMine;
  if (!high || !after) return "—";
  const d = (after / high - 1) * 100;
  return Math.abs(d) < 0.05 ? "level" : d > 0 ? `${d.toFixed(1)} % above` : `${Math.abs(d).toFixed(1)} % below`;
});

async function loadFromRoute(): Promise<void> {
  const q = route.query;
  const teamId = typeof q.team === "string" ? q.team : null;
  const members = typeof q.members === "string" ? q.members.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const key = typeof q.key === "string" ? q.key : null;
  await bt.load({ teamId, members, key });
  shown.value = order.value[0] ?? 0;
  void loadCurrentEr();
}

async function loadCurrentEr(): Promise<void> {
  const ids = team.value?.characterIds ?? [];
  const chars = JSON.parse(JSON.stringify(characterStore.characters));
  const echoes = JSON.parse(JSON.stringify(inventoryStore.echoes));
  const out: Array<number | null> = [];
  for (const id of ids) out.push(id ? await menuErPercent(id, chars, echoes).catch(() => null) : null);
  currentEr.value = out;
}

function retry(): void {
  if (plans.value) void run();
  else void loadFromRoute();
}

function backToPlan(): void {
  phase.value = "plan";
}

async function onSave(): Promise<void> {
  if (!team.value || !result.value) return;
  const items = toSave.value.map((m) => {
    const existing = (characterStore.characters?.[m.characterId]?.builds ?? []).map((b: { name?: string }) => String(b.name ?? ""));
    const name = buildNameFor(m.characterId, team.value!.characterIds, existing);
    return `${characterDisplayName(m.characterId)}: new build “${name}”${team.value!.id ? `, pinned in slot ${m.slot + 1}` : ""}${makeActive.value ? ", made active" : ""}`;
  });
  // echoes a new build takes from a teammate whose build here stays: named, so the save is a choice, not a surprise
  for (const c of conflicts.value) items.push(`${c.echo}: also stays in ${characterDisplayName(c.teammate)}'s build in this team (${characterDisplayName(c.characterId)}'s new build wears it)`);
  const ok = await confirm(
    makeActive.value
      ? "These builds become each member's active build everywhere. The builds they wear now stay saved."
      : "New builds only: every member's active build stays as it is, and no echo is taken off anyone.",
    { title: `Save ${toSave.value.length} team build${toSave.value.length === 1 ? "" : "s"}?`, items, confirmLabel: "Save", variant: makeActive.value ? "warning" : "primary" },
  );
  if (!ok) return;
  const out = bt.save(makeActive.value);
  if (out) showToast(`Saved ${out.created.length} build${out.created.length === 1 ? "" : "s"} for ${team.value.name}. Undo is on this page.`, "success", 6000);
}

async function onUndo(): Promise<void> {
  const rec = bt.undoRecord.value;
  const ok = await confirm(rec ? `Remove the ${rec.created.length} build${rec.created.length === 1 ? "" : "s"} saved for “${rec.teamName}” and put the team's pins back?` : "Undo the last build?", {
    title: "Undo last build",
    items: rec?.created.map((c) => `${characterDisplayName(c.characterId)}: “${c.name}”`),
    confirmLabel: "Undo",
    variant: "warning",
  });
  if (!ok) return;
  const out = bt.undo();
  if (!out) return;
  if (out.kind === "exact") showToast(`Undone: ${out.removed.length} build${out.removed.length === 1 ? "" : "s"} removed and everything put back as it was.`, "success", 6000);
  else showToast(`Partly undone: ${out.removed.length} removed${out.kept.length ? `; kept ${out.kept.map((k) => `${characterDisplayName(k.characterId)} (${k.why})`).join(", ")}` : ""}.`, "warning", 9000);
}

watch(() => route.fullPath, () => {
  if (route.path === "/build-team") void loadFromRoute();
});
onMounted(() => void loadFromRoute());
onBeforeUnmount(() => bt.cancel());
</script>
