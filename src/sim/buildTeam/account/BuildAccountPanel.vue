<template>
  <div class="ba" data-test-build-account :data-phase="phase">
    <ol class="bt-steps ba-steps" aria-label="Steps">
      <li v-for="(s, i) in STEPS" :key="s" :class="{ 'bt-steps__on': stepIndex === i, 'bt-steps__done': stepIndex > i }" :aria-current="stepIndex === i ? 'step' : undefined">
        <span class="bt-steps__n">{{ i + 1 }}</span><span class="bt-steps__t"><span class="bt-steps__long">{{ s }}</span><span class="bt-steps__short">{{ STEPS_SHORT[i] }}</span></span>
      </li>
    </ol>

    <div v-if="error && phase !== 'error'" role="alert" class="alert alert-warning mb-3 text-sm">{{ error }}</div>

    <!-- loading the teams -->
    <section v-if="phase === 'loading'" class="bt-card" aria-busy="true" data-test-build-account-loading>
      <p class="text-sm">Finding the teams your account can field<template v-if="scored.total"> ({{ scored.done }} of {{ scored.total }} scored)</template>…</p>
      <progress class="progress progress-primary w-full" :value="scored.done" :max="scored.total || 1"></progress>
    </section>

    <section v-else-if="phase === 'error'" class="bt-card bt-fatal" role="alert" data-test-build-account-fatal>
      <p class="font-semibold">Something went wrong</p>
      <p class="text-sm opacity-80">{{ error }}</p>
      <button type="button" class="btn btn-primary btn-sm mt-3" @click="retry">Try again</button>
    </section>

    <!-- step 1: teams, priority, weights -->
    <template v-else-if="phase === 'choose'">
      <div v-if="!choices.length" class="bt-empty" data-test-build-account-empty>
        <p class="font-semibold">No team your account can field yet</p>
        <p class="text-sm opacity-75">A team counts when all three members have a weapon in the calculator and it has a team rotation: one of your saved teams, or a curated or wuwa_calc team of characters you own.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <RouterLink to="/account" class="btn btn-primary btn-sm">My account</RouterLink>
          <RouterLink to="/teams" class="btn btn-ghost btn-sm">Teams</RouterLink>
        </div>
      </div>
      <template v-else>
        <section class="ba-section" data-test-build-account-chosen>
          <div class="bt-section-head">
            <h2 class="bt-h2">Teams to gear <span class="bt-count">{{ chosen.length }}</span></h2>
          </div>
          <p class="ba-hint">Higher teams pick echoes first. “How much this team matters” weighs its damage when two teams want the same echo.</p>
          <p v-if="!chosen.length" class="ba-hint" data-test-build-account-none>Tick at least one team below.</p>
          <ol class="ba-list">
            <li v-for="(c, i) in chosen" :key="c.id" class="ba-row ba-row--on" :data-test-build-account-team="c.id" :data-priority="i + 1">
              <span class="bt-prio" :aria-label="`Priority ${i + 1}`">{{ i + 1 }}</span>
              <span class="ba-row__trio"><CharacterAvatar v-for="id in c.characterIds" :id="id" :key="id" :size="32" /></span>
              <span class="ba-row__text">
                <PresetNameLabel class="ba-row__name" :name="c.name" :owned="ownedKeys" :max-chips="2" />
                <span class="ba-row__meta">{{ sourceWord(c.source) }} · <span class="tabular-nums">{{ compactNum(c.avgDamage) }}</span> team damage per rotation</span>
              </span>
              <span class="ba-row__controls">
                <label class="ba-weight">
                  <span class="ba-weight__k">How much this team matters</span>
                  <select class="select select-bordered select-xs" :value="weights[c.id]" data-test-build-account-weight @change="setWeight(c.id, Number(($event.target as HTMLSelectElement).value))">
                    <option v-for="w in weightChoices(weights[c.id])" :key="w.value" :value="w.value">{{ w.label }}</option>
                  </select>
                </label>
                <span class="ba-move">
                  <button type="button" class="btn btn-ghost btn-xs btn-square" :disabled="i === 0" :aria-label="`Move ${spokenName(c)} up`" data-test-build-account-up @click="move(c.id, -1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                  <button type="button" class="btn btn-ghost btn-xs btn-square" :disabled="i === chosen.length - 1" :aria-label="`Move ${spokenName(c)} down`" data-test-build-account-down @click="move(c.id, 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </button>
                  <button type="button" class="btn btn-ghost btn-xs btn-square" :aria-label="`Remove ${spokenName(c)}`" data-test-build-account-remove @click="toggle(c.id, false)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
                  </button>
                </span>
              </span>
            </li>
          </ol>
          <ul v-if="shared.length" class="ba-shared" data-test-build-account-shared>
            <li v-for="s in shared" :key="s.characterId">
              <b>{{ characterDisplayName(s.characterId) }}</b> is in teams {{ s.teams.map((t) => t + 1).join(" and ") }}: one build, scored on their part of team {{ s.teams[0]! + 1 }}'s rotation and worn in both.
            </li>
          </ul>
        </section>

        <details class="ba-more" :open="!chosen.length" data-test-build-account-more>
          <summary>More teams your account can field <span class="bt-count">{{ others.length }}</span></summary>
          <p v-if="chosen.length >= MAX_TEAMS" class="ba-hint">At most {{ MAX_TEAMS }} teams in one plan.</p>
          <ul class="ba-list">
            <li v-for="c in others" :key="c.id" class="ba-row">
              <label class="ba-row__pick">
                <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" :checked="false" :disabled="chosen.length >= MAX_TEAMS" :data-test-build-account-pick="c.id" @change="toggle(c.id, ($event.target as HTMLInputElement).checked)" />
                <span class="ba-row__trio"><CharacterAvatar v-for="id in c.characterIds" :id="id" :key="id" :size="28" /></span>
                <span class="ba-row__text">
                  <PresetNameLabel class="ba-row__name" :name="c.name" :owned="ownedKeys" :max-chips="2" />
                  <span class="ba-row__meta">{{ sourceWord(c.source) }} · <span class="tabular-nums">{{ compactNum(c.avgDamage) }}</span> team damage per rotation</span>
                </span>
              </label>
            </li>
          </ul>
        </details>

        <section class="bt-options" data-test-build-account-options>
          <h2 class="bt-h2">Options</h2>
          <div class="bt-options__grid">
            <label class="bt-opt"><input v-model="options.useSets" type="checkbox" class="toggle toggle-sm toggle-primary" /><span><b>The plans' sets</b><small>Only echoes of each member's planned Sonata sets.</small></span></label>
            <label class="bt-opt"><input v-model="options.useMainStats" type="checkbox" class="toggle toggle-sm toggle-primary" /><span><b>The plans' main stats</b><small>Per cost, only the main stats the plan wears; relaxed when your echoes can't fill it.</small></span></label>
            <label class="bt-opt"><input v-model="options.keepMainEcho" type="checkbox" class="toggle toggle-sm toggle-primary" /><span><b>Keep current main echoes</b><small>Each member keeps the main echo they wear.</small></span></label>
          </div>
          <p class="ba-hint">Echoes worn by characters outside these teams stay where they are. Each member's Energy Regen need comes from wuwa_calc; to change one, build that team on its own.</p>
        </section>

        <div ref="runBar" class="bt-actions wt-plus-bar">
          <button type="button" class="btn btn-primary" :disabled="!chosen.length" data-test-build-account-run @click="run">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5" aria-hidden="true"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke-linejoin="round" /></svg>
            Plan {{ chosen.length }} team{{ chosen.length === 1 ? "" : "s" }}
          </button>
          <span class="bt-actions__hint text-xs opacity-65">Nothing is saved until you review it. Takes about {{ estimate }}.</span>
        </div>
      </template>
    </template>

    <!-- step 2: running -->
    <section v-else-if="phase === 'planning' || phase === 'running'" class="bt-card bt-run" aria-live="polite" data-test-build-account-running>
      <div class="bt-section-head">
        <h2 class="bt-h2">Planning…</h2>
        <span class="text-xs tabular-nums opacity-70">{{ secondsText(elapsed) }}</span>
      </div>
      <p class="ba-stage" data-test-build-account-stage>
        {{ STAGE_TEXT[stage] }}<template v-if="stage === 'plans'"> ({{ stageInfo.done }} of {{ stageInfo.total }})</template><template v-else-if="stage === 'improve'"> · {{ stageInfo.accepted }} kept so far</template>
      </p>
      <ul class="bt-run__list">
        <li v-for="id in runIds" :key="id" class="bt-run__row" :data-test-build-account-progress="id">
          <CharacterAvatar :id="id" :size="28" />
          <div class="bt-run__body">
            <div class="bt-run__top">
              <span class="font-semibold">{{ shortName(id) }}</span>
              <span class="bt-run__phase">{{ PHASE_TEXT[progress[id]?.phase ?? "waiting"] }}</span>
            </div>
            <span class="bt-run__n tabular-nums">{{ fmtInt(progress[id]?.processed ?? 0) }} combination{{ (progress[id]?.processed ?? 0) === 1 ? "" : "s" }} checked</span>
          </div>
        </li>
      </ul>
      <div class="ba-run__actions">
        <button v-if="stage === 'improve'" type="button" class="btn btn-sm btn-primary" data-test-build-account-stop @click="stopImproving">Stop improving, show the plan</button>
        <button type="button" class="btn btn-sm" data-test-build-account-cancel @click="cancel">Cancel</button>
      </div>
      <p class="text-xs opacity-60">Runs in the optimizer's workers (Settings › Preferences sets how many). The improvement pass stops by itself after 60 s.</p>
    </section>

    <!-- step 3: result -->
    <template v-else-if="phase === 'result' && result">
      <section class="bt-summary ba-summary" data-test-build-account-summary>
        <div class="bt-kpi" data-test-build-account-score>
          <span class="bt-kpi__k">Weighted team damage</span>
          <span class="bt-kpi__v tabular-nums">{{ ratioText(accountRatio(result.score, result.score.final)) }}</span>
          <span class="bt-kpi__s">vs today, every team weighted by how much it matters</span>
        </div>
        <div class="bt-kpi" data-test-build-account-greedy>
          <span class="bt-kpi__k">First pass alone</span>
          <span class="bt-kpi__v tabular-nums">{{ ratioText(accountRatio(result.score, result.score.greedy)) }}</span>
          <span class="bt-kpi__s">each member in priority order, before the improvement pass</span>
        </div>
        <div v-if="er.of" class="bt-kpi" data-test-build-account-er>
          <span class="bt-kpi__k">Energy Regen needs met</span>
          <span class="bt-kpi__v tabular-nums">{{ er.before }} → {{ er.after }} <small class="opacity-70">of {{ er.of }}</small></span>
          <span class="bt-kpi__s">a build that meets its need comes before damage</span>
        </div>
        <p v-if="whyLower(result)" class="bt-summary__line" data-test-build-account-why>{{ whyLower(result) }}</p>
        <p class="bt-summary__line" data-test-build-account-search>{{ searchLine(result) }}</p>
        <p class="bt-summary__line">
          {{ result.members.filter((m) => m.status === "ok").length }} builds, {{ result.moves.length }} echo{{ result.moves.length === 1 ? "" : "es" }} change hands, {{ secondsText(result.ms) }}. Numbers are this app's calculator: average damage per rotation on each team's rotation (enemy level 100, 20 % resistance, for every team, so a saved team with its own enemy reads differently on Teams). The split of echoes between members is a best effort (a heuristic), each member's build within it is the optimizer's exact best.
        </p>
      </section>

      <div class="ba-teams">
      <section v-for="t in result.teams" :key="t.index" class="bt-card ba-team" :data-test-build-account-result-team="t.index">
        <header class="ba-team__head">
          <span class="bt-prio">{{ t.index + 1 }}</span>
          <span class="ba-row__trio"><CharacterAvatar v-for="s in t.slots" :id="s.characterId" :key="s.slot" :size="30" /></span>
          <span class="ba-row__text">
            <PresetNameLabel class="ba-row__name" :name="t.spec.name" :owned="ownedKeys" :max-chips="2" />
            <span class="ba-row__meta">matters {{ t.weight }} · team damage per rotation</span>
          </span>
          <span class="ba-team__nums">
            <span class="tabular-nums">{{ compactNum(t.before) }} → {{ compactNum(t.after) }}</span>
            <span class="bt-delta" :class="`bt-delta--${deltaTone(t.before, t.after)}`" data-test-build-account-team-delta>{{ deltaText(t.before, t.after) || "±0 %" }}</span>
          </span>
        </header>
        <ul class="ba-members">
          <li v-for="s in t.slots" :key="s.slot" class="ba-member" :data-test-build-account-member="s.characterId" :data-status="result.members[s.member]!.status" :data-shared="s.sharedFrom != null ? 'yes' : 'no'">
            <template v-if="s.sharedFrom == null">
              <div class="ba-member__top">
                <CharacterAvatar :id="s.characterId" :size="28" />
                <span class="ba-member__name">{{ shortName(s.characterId) }}</span>
                <template v-if="memberOf(s).after && memberOf(s).before">
                  <span class="ba-member__nums tabular-nums" :title="`${fmtInt(memberOf(s).before!.value)} → ${fmtInt(memberAfter(memberOf(s)))}`">{{ compactNum(memberOf(s).before!.value) }} → {{ compactNum(memberAfter(memberOf(s))) }}</span>
                  <span class="bt-delta" :class="`bt-delta--${deltaTone(memberOf(s).before!.value, memberAfter(memberOf(s)))}`">{{ deltaText(memberOf(s).before!.value, memberAfter(memberOf(s))) || "±0 %" }}</span>
                </template>
              </div>
              <p v-if="memberOf(s).after" class="ba-member__line">
                Damage on their part of this rotation · <span class="whitespace-nowrap">Energy Regen <b class="tabular-nums">{{ pctText(memberOf(s).after!.menuEr) }}</b></span><template v-if="memberOf(s).erFloor != null"> · need <span class="whitespace-nowrap">{{ pctText(memberOf(s).erFloor) }}</span></template><template v-if="memberOf(s).alsoIn.length"> · also worn in team {{ memberOf(s).alsoIn.map((x) => x + 1).join(", ") }}</template>
              </p>
              <p v-if="memberNote(memberOf(s))" class="ba-member__note" :class="{ 'ba-member__note--fail': memberOf(s).status !== 'ok' }">{{ memberNote(memberOf(s)) }}</p>
              <details v-if="memberOf(s).after" class="ba-echoes">
                <summary>Their 5 echoes<template v-if="movedIn(s.characterId)"> · {{ movedIn(s.characterId) }} from other characters</template></summary>
                <div class="bt-tiles">
                  <BuildTeamEchoTile v-for="(p, i) in memberOf(s).after!.picks" :key="p.echo.echoId" :echo="p.echo" :slot="i" :source="p.source" :worn-by="p.wornBy" :shared-with="p.sharedWith" :character-id="s.characterId" />
                </div>
              </details>
            </template>
            <div v-else class="ba-member__top ba-member--shared">
              <CharacterAvatar :id="s.characterId" :size="28" />
              <span class="ba-member__name">{{ shortName(s.characterId) }}</span>
              <span class="ba-member__line">wears the build planned in team {{ s.sharedFrom + 1 }}</span>
            </div>
          </li>
        </ul>
      </section>
      </div>

      <section v-if="result.moves.length" class="bt-card ba-moves" data-test-build-account-moves>
        <h2 class="bt-h2">Echoes that change hands</h2>
        <ul>
          <li v-for="mv in result.moves" :key="mv.echoId + mv.to">{{ moveText(mv) }}</li>
        </ul>
      </section>

      <div v-if="applied" role="status" class="alert alert-success mt-3 text-sm" data-test-build-account-saved>
        <span>
          Saved {{ applied.created.length }} “Account plan” build{{ applied.created.length === 1 ? "" : "s" }}<template v-if="applied.pinnedTeams.length">, pinned in {{ applied.pinnedTeams.length }} saved team{{ applied.pinnedTeams.length === 1 ? "" : "s" }}</template><template v-if="applied.activated.length"> and made active</template>.
          <template v-if="historyFull">This browser would not store every build from before it, so those are in Build history only until you leave this page.</template>
          <template v-else>Each character's build before it is in <RouterLink to="/build-history" class="link">Build history</RouterLink>.</template>
          <template v-if="applied.undoInMemoryOnly"> Undo lasts until you leave this page (this browser would not store it).</template>
        </span>
      </div>
    </template>

    <div v-if="(phase === 'result' && result) || undoBar" ref="saveBar" class="bt-savebar" :class="phase === 'result' ? 'wt-plus-bar' : 'ba-savebar--flow'" data-test-build-account-savebar>
      <button v-if="undoLive" type="button" class="btn btn-ghost btn-sm" data-test-build-account-undo @click="onUndo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" stroke-linecap="round" stroke-linejoin="round" /></svg>
        Undo account plan
      </button>
      <template v-if="phase === 'result' && result">
        <label class="bt-savebar__active" title="Switch each character to their Account plan build everywhere (the build they wear now stays saved)">
          <input v-model="makeActive" type="checkbox" class="checkbox checkbox-sm" data-test-build-account-make-active />
          <span>Also make active</span>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" data-test-build-account-back @click="backToTeams">Change teams</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!toSave.length || !!applied" data-test-build-account-save @click="onSave">
          {{ applied ? "Saved" : toSave.length ? `Save ${toSave.length} build${toSave.length === 1 ? "" : "s"}` : "Nothing to save" }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "Whole account" mode of /build-team (?mode=account): pick the teams to gear (default: your saved
// teams, then presets, strongest first), their priority and how much each matters, plan them together (greedy in
// priority order, then the improvement pass), review per team and member, save as "Account plan" builds with undo.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useConfirm } from "../../../composables/useConfirm";
import { useToast } from "../../../composables/useToast";
import { useCharacterStore } from "../../../stores/character";
import CharacterAvatar from "../../display/CharacterAvatar.vue";
import { characterDisplayName, characterShortName } from "../../display/names";
import PresetNameLabel from "../../display/PresetNameLabel.vue";
import { teamTierLine, teamTitle } from "../../display/teamName";
import { usePlusBar } from "../../shell/plusBar";
import BuildTeamEchoTile from "../BuildTeamEchoTile.vue";
import { historyInMemoryOnly } from "../../buildHistory/history";
import { saveFailedText } from "../apply";
import { memberAfter } from "../buildTeam";
import { compactNum, deltaText, deltaTone, fmtInt, pctText, undoConfirm, undoDoneText } from "../buildTeamView";
import { WEIGHT_CHOICES, type AccountTeamChoice } from "./accountTeams";
import { accountBuildName } from "./accountApply";
import { accountRatio, confirmItems, erNeedsMet, memberNote, moveText, ratioText, searchLine, secondsText, STAGE_TEXT, whyLower } from "./accountView";
import { MAX_TEAMS, useBuildAccount, type AccountMemberProgress } from "./useBuildAccount";
import "./buildAccount.css";

const STEPS = ["Teams", "Plan", "Review & save"];
// a phone shows the short words (One team does the same): "Review & save" was cut to "Review & …"
const STEPS_SHORT = ["Teams", "Plan", "Review"];
const PHASE_TEXT: Record<AccountMemberProgress["phase"], string> = { waiting: "Waiting", prepare: "Setting up", search: "Searching your echoes", searched: "Searched", improve: "Improving", verify: "Checking the build", done: "Done" };

const characterStore = useCharacterStore();
const { confirm } = useConfirm();
const { showToast } = useToast();
const ba = useBuildAccount();
const { phase, error, choices, scored, selected, chosen, weights, options, shared, stage, stageInfo, progress, result, applied, undoLive, makeActive, toSave, elapsed } = ba;
const { toggle, move, setWeight, run, stopImproving, cancel, backToTeams } = ba;

const runBar = ref<HTMLElement | null>(null);
const saveBar = ref<HTMLElement | null>(null);
const historyFull = ref(false);
usePlusBar(runBar);
usePlusBar(saveBar);

// away from the review the undo is a plain row in the page: on a phone the Plan bar owns the bottom edge and two fixed
// bars cover each other. Not during a run or while the teams load: it would change what they are reading
const undoBar = computed(() => undoLive.value && (phase.value === "choose" || phase.value === "error"));
const stepIndex = computed(() => (phase.value === "planning" || phase.value === "running" ? 1 : phase.value === "result" ? 2 : 0));
const others = computed(() => choices.value.filter((c) => !selected.value.includes(c.id)));
const runIds = computed(() => [...new Set(chosen.value.flatMap((c) => c.characterIds))]);
const er = computed(() => erNeedsMet(result.value?.members ?? []));
const estimate = computed(() => {
  const n = chosen.value.length;
  return n <= 1 ? "half a minute" : n <= 4 ? "one to two minutes" : "two minutes or more";
});
const shortName = (id: string): string => characterShortName(id) || characterDisplayName(id);
const SOURCE_WORD: Record<string, string> = { yours: "Your saved team", curated: "Curated team", wuwa_calc: "wuwa_calc team" };
const sourceWord = (s: string): string => SOURCE_WORD[s] ?? s;
const ownedKeys = computed(() => Object.keys(characterStore.characters ?? {}));
/** a button's name: the title the row shows and its tier, which is what tells two tiers of the same three apart */
const spokenName = (c: AccountTeamChoice): string => [teamTitle(c.name, c.characterIds, null, { owned: ownedKeys.value }), teamTierLine(c.name)].filter(Boolean).join(", ");
const weightChoices = (current: number | undefined) => (current == null || WEIGHT_CHOICES.some((w) => w.value === current) ? WEIGHT_CHOICES : [...WEIGHT_CHOICES, { value: current, label: String(current) }]);
const memberOf = (s: { member: number }) => result.value!.members[s.member]!;
const movedIn = (characterId: string): number => result.value?.moves.filter((m) => m.to === characterId).length ?? 0;

function retry(): void {
  void ba.load();
}

async function onSave(): Promise<void> {
  const r = result.value;
  if (!r || !toSave.value.length) return;
  const names = Object.fromEntries(toSave.value.map((m) => [m.characterId, accountBuildName((characterStore.characters?.[m.characterId]?.builds ?? []).map((b: { name?: string }) => String(b.name ?? "")))]));
  const ok = await confirm(
    makeActive.value
      ? "Every character below switches to their Account plan build everywhere, and no two of these builds share an echo. The builds they wear now stay saved, and each one is kept in Build history first."
      : "New builds only: every active build stays as it is and no echo is taken off anyone; switch to the Account plan builds when you are ready. Each character's build is kept in Build history first.",
    { title: `Save ${toSave.value.length} Account plan build${toSave.value.length === 1 ? "" : "s"}?`, items: confirmItems(r, toSave.value, makeActive.value, names), confirmLabel: "Save", variant: makeActive.value ? "warning" : "primary" },
  );
  if (!ok) return;
  try {
    const out = await ba.save();
    historyFull.value = historyInMemoryOnly();
    if (out) showToast(`Saved ${out.created.length} Account plan build${out.created.length === 1 ? "" : "s"}. Undo is on this page.`, "success", 6000);
  } catch (e) {
    showToast(saveFailedText(e), "error", 10000);
  }
}

async function onUndo(): Promise<void> {
  const rec = ba.undoRecord.value;
  const words = undoConfirm(ba.undoPreview(), (n) => `${n} Account plan build${n === 1 ? "" : "s"}`, "put every pin back");
  const ok = await confirm(rec ? words.message : "Undo the account plan?", {
    title: "Undo account plan",
    items: rec ? words.items : undefined,
    confirmLabel: "Undo",
    variant: "warning",
  });
  if (!ok) return;
  const out = ba.undo();
  if (!out) return;
  const done = undoDoneText(out);
  showToast(done.text, done.tone, done.tone === "success" ? 6000 : 9000);
}

onMounted(() => void ba.load());
onBeforeUnmount(() => ba.cancel());
</script>
