<template>
  <div ref="barEl" class="wt-account-bar relative z-30 border-b border-base-300 bg-base-100 px-3 py-1.5 text-sm" :class="{ 'wt-account-bar--compact': compact }" data-test-rankings-account-bar>
    <div class="flex items-start gap-2">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
        <!-- the one state control: My account, or one of Riley's investment tiers (his Team Cost box, hidden) -->
        <!-- min-w-0, never shrink-0: between 768 px and a wide desktop the summary truncates rather than running under the buttons on the right -->
        <div class="flex min-w-0 max-w-full items-center gap-1.5" :class="compact ? 'w-full' : ''">
          <div class="join shrink-0" role="group" aria-label="Investment state">
            <button type="button" class="btn btn-xs join-item" :class="isMine ? 'btn-primary' : 'btn-ghost border-base-300'" :aria-pressed="isMine" data-test-rankings-mine :title="mineTitle" @click="setMine(true)">
              <span class="max-[389px]:hidden">My account</span><span class="min-[390px]:hidden">Mine</span>
            </button>
            <button type="button" class="btn btn-xs join-item" :class="isMine ? 'btn-ghost border-base-300' : 'btn-primary'" :aria-pressed="!isMine" data-test-rankings-riley title="Riley's investment tiers: every team at one sequence / refinement level" @click="setMine(false)">
              <!-- the narrowest phones at 130 % text: short labels, so the tier select keeps a readable width -->
              <span class="max-[389px]:hidden">Riley's tiers</span><span class="min-[390px]:hidden">Riley</span>
            </button>
          </div>
          <select v-if="!isMine" class="select select-bordered select-xs" :class="compact ? 'w-0 min-w-0 flex-1 pr-6' : 'w-auto max-w-48'" :value="tierCode" :title="tierTitle" aria-label="Investment tier" data-test-rankings-tier @change="setTier(($event.target as HTMLSelectElement).value)">
            <option v-for="t in RILEY_TIERS" :key="t.code" :value="t.code" :title="t.title">{{ t.label }}</option>
          </select>
          <template v-else-if="!compact">
            <label class="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs" title="hide teams with a limited resonator you have not set up (equipped a weapon on)">
              <input type="checkbox" class="checkbox checkbox-primary checkbox-xs" :checked="ownedOnly" data-test-rankings-owned-only @change="setOwnedOnly(($event.target as HTMLInputElement).checked)" />
              <span>Teams I can field</span>
            </label>
            <span class="min-w-0 truncate text-xs tabular-nums opacity-60" :title="`${summaryText}. ${OWNED_NOTE}`" data-test-rankings-account-summary>
              {{ account.summary.owned }} of {{ account.summary.characters }} set up · {{ account.summary.s6 }} at S6<template v-if="!account.summary.owned"> · equip a weapon on a character to count it as owned</template>
            </span>
          </template>
          <button v-else type="button" class="btn btn-ghost btn-xs min-w-0 shrink flex-nowrap gap-1 overflow-hidden border-base-300 px-2 tabular-nums" :aria-expanded="open === 'info'" aria-label="Your account" data-test-rankings-info @click="toggle('info', $event)">
            <svg viewBox="0 0 24 24" class="size-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" stroke-linecap="round" /></svg>
            <span class="truncate">{{ account.summary.owned }}/{{ account.summary.characters }}</span>
          </button>
        </div>

        <label v-if="!compact" class="flex items-center gap-1.5 text-xs">
          <span class="opacity-70">Substats</span>
          <select class="select select-bordered select-xs" :value="subsMode" :title="subsTitle" data-test-rankings-subs @change="setSubs(($event.target as HTMLSelectElement).value)">
            <option value="">ChemX32 (Riley's default)</option>
            <option value="h">High investment, everyone</option>
            <option value="m">My builds</option>
          </select>
        </label>
        <span v-if="!compact && subsMode === 'm'" class="text-xs opacity-60" data-test-rankings-subs-hint>{{ builtCount }} character{{ builtCount === 1 ? "" : "s" }} with echoes in the app; the rest run ChemX32</span>

        <!-- Main DPS / With / Without: Riley's own resonator filter (hash r= / x=) as chips -->
        <div class="wt-chips flex min-w-0 items-center gap-1.5" :class="compact ? 'order-last w-full flex-nowrap overflow-x-auto' : 'flex-wrap'" data-test-rankings-chips>
          <div v-for="g in CHIP_GROUPS" :key="g.id" class="flex shrink-0 items-center gap-1" :data-test-rankings-chip-group="g.id">
            <button
              type="button"
              class="wt-chip-add btn btn-ghost btn-xs max-w-44 flex-nowrap gap-1 border border-dashed border-base-content/25 px-2 font-medium"
              :class="{ 'border-primary text-primary': open === `pick-${g.id}`, 'border-solid border-base-content/30 bg-base-200': compact && groups[g.id].length }"
              :aria-expanded="open === `pick-${g.id}`"
              :title="g.title"
              :data-test-rankings-chip-add="g.id"
              @click="toggle(`pick-${g.id}`, $event)">
              <span class="shrink-0">{{ g.label }}</span>
              <!-- a phone shows what a group holds in its button (the picker lists and removes them) -->
              <span v-if="compact && groups[g.id].length" class="min-w-0 truncate font-normal opacity-80" :class="{ 'line-through': g.id === 'without' }" :data-test-rankings-chip-summary="g.id">{{ groups[g.id].length === 1 ? groups[g.id][0] : `${groups[g.id].length}` }}</span>
              <svg v-else viewBox="0 0 24 24" class="size-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-linecap="round" /></svg>
            </button>
            <button
              v-for="name in compact ? [] : groups[g.id]"
              :key="name"
              type="button"
              class="wt-chip"
              :class="{ 'wt-chip--out': g.id === 'without' }"
              :title="`${g.id === 'without' ? 'Teams without' : g.id === 'main' ? 'Teams led by' : 'Teams with'} ${name} — click to remove`"
              :data-test-rankings-chip="name"
              @click="removeName(name)">
              <span class="wt-dot" :style="{ background: colorOf(name) }"></span>
              <span class="truncate">{{ name }}</span>
              <svg viewBox="0 0 24 24" class="size-3 opacity-60" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" /></svg>
            </button>
          </div>
          <button v-if="chipCount > 1" type="button" class="btn btn-ghost btn-xs shrink-0 px-1.5 opacity-70" title="remove every Main DPS / With / Without filter" data-test-rankings-chips-clear @click="clearChips">Clear</button>
        </div>
      </div>

      <!-- right: stays on the first row however the left wraps -->
      <div class="flex min-h-6 shrink-0 items-center gap-1.5">
        <template v-if="!compact">
          <button type="button" class="wt-beta btn btn-ghost btn-xs gap-1.5 border-base-300 font-normal" :aria-expanded="open === 'beta'" data-test-rankings-beta @click="toggle('beta', $event)">
            <span class="badge badge-ghost badge-xs font-semibold uppercase tracking-wide">Beta</span>
            how to read
          </button>
          <button type="button" class="btn btn-xs btn-ghost border-base-300" :disabled="syncing" :title="syncTitle" data-test-rankings-sync @click="sync">
            <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
            {{ syncing ? "Syncing…" : "Sync my teams" }}
          </button>
          <button type="button" class="btn btn-xs btn-ghost max-w-56 gap-1 border-base-300" :aria-expanded="open === 'views'" title="saved views: named copies of the current tier, filters and compares" data-test-rankings-views @click="toggle('views', $event)">
            <span class="truncate" data-test-rankings-views-current>{{ selectedView || "Views" }}</span>
            <svg viewBox="0 0 24 24" class="size-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </template>
        <button v-else type="button" class="btn btn-ghost btn-xs btn-square border-base-300" :aria-expanded="open === 'menu'" aria-label="More: substats, sync, views, how to read" data-test-rankings-menu @click="toggle('menu', $event)">
          <svg viewBox="0 0 24 24" class="size-4 fill-current" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
      </div>
    </div>

    <!-- popovers: one open at a time, anchored under their trigger (a full-width sheet under the bar on a phone) -->
    <div v-if="open" ref="popEl" class="wt-pop" :class="compact ? 'wt-pop--sheet' : ''" :style="panelStyle" role="dialog" :data-test-rankings-pop="open">
      <template v-if="pickGroup">
        <input
          ref="searchEl"
          v-model="query"
          type="search"
          class="input input-bordered input-sm w-full"
          :placeholder="pickGroup === 'main' ? 'Find a main DPS' : 'Find a resonator'"
          autocomplete="off"
          data-test-rankings-chip-search
          @keydown.enter.prevent="pickFirst" />
        <p class="mt-1.5 px-1 text-xs opacity-60">{{ pickHint }}</p>
        <div class="mt-1 max-h-72 overflow-y-auto overscroll-contain">
          <p v-if="!roster.length" class="px-2 py-3 text-xs opacity-60">Loading Riley's roster…</p>
          <p v-else-if="!sections.length" class="px-2 py-3 text-xs opacity-60">No resonator matches “{{ query }}”.</p>
          <template v-for="s in sections" :key="s.label">
            <div class="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">{{ s.label }}</div>
            <button
              v-for="o in s.options"
              :key="o.name"
              type="button"
              class="wt-opt"
              :class="{ 'wt-opt--on': inGroup(pickGroup, o.name) }"
              :aria-pressed="inGroup(pickGroup, o.name)"
              :data-test-rankings-chip-option="o.name"
              @click="pick(pickGroup, o.name)">
              <span class="wt-dot" :style="{ background: o.color }"></span>
              <span class="min-w-0 flex-1 truncate">{{ o.name }}</span>
              <span v-if="o.owned" class="badge badge-sm tabular-nums" :class="o.section === 0 ? 'badge-primary badge-outline' : 'badge-ghost'" :title="o.assumed ? '4★ / Rover form: counts as owned at S6' : `your ${o.name}: S${o.sequence}`">S{{ o.sequence }}</span>
              <span v-else class="text-[11px] opacity-50">not owned</span>
              <svg v-if="inGroup(pickGroup, o.name)" viewBox="0 0 24 24" class="size-4 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </template>
        </div>
      </template>

      <template v-else-if="open === 'info'">
        <p class="text-xs font-semibold">Your account</p>
        <p class="mt-1 text-xs tabular-nums opacity-80" data-test-rankings-account-summary>
          {{ account.summary.owned }} of {{ account.summary.characters }} set up · {{ account.summary.s6 }} at S6<template v-if="!account.summary.owned"> · equip a weapon on a character to count it as owned</template>
        </p>
        <p class="mt-1 text-xs opacity-60">{{ OWNED_NOTE }}</p>
        <label class="mt-2 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" :checked="ownedOnly" data-test-rankings-owned-only @change="setOwnedOnly(($event.target as HTMLInputElement).checked)" />
          <span>Teams I can field</span>
        </label>
      </template>

      <template v-else-if="open === 'menu'">
        <label class="flex flex-col gap-1 text-xs">
          <span class="opacity-70">Substats every row runs</span>
          <select class="select select-bordered select-sm w-full" :value="subsMode" :title="subsTitle" data-test-rankings-subs @change="setSubs(($event.target as HTMLSelectElement).value)">
            <option value="">ChemX32 (Riley's default)</option>
            <option value="h">High investment, everyone</option>
            <option value="m">My builds</option>
          </select>
          <span v-if="subsMode === 'm'" class="opacity-60" data-test-rankings-subs-hint>{{ builtCount }} character{{ builtCount === 1 ? "" : "s" }} with echoes in the app; the rest run ChemX32</span>
        </label>
        <div class="mt-2 grid gap-1">
          <button type="button" class="wt-opt" :disabled="syncing" :title="syncTitle" data-test-rankings-sync @click="sync">
            <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
            <span class="flex-1">{{ syncing ? "Syncing…" : "Sync my teams" }}</span>
          </button>
          <button type="button" class="wt-opt" data-test-rankings-views @click="switchTo('views')">
            <span class="flex-1">Saved views</span>
            <span class="truncate text-xs opacity-60" data-test-rankings-views-current>{{ selectedView || views.length || "none" }}</span>
          </button>
          <button type="button" class="wt-opt" data-test-rankings-beta @click="switchTo('beta')">
            <span class="badge badge-ghost badge-xs font-semibold uppercase tracking-wide">Beta</span>
            <span class="flex-1">How to read this table</span>
          </button>
        </div>
      </template>

      <template v-else-if="open === 'views'">
        <p class="px-1 text-xs font-semibold">Saved views</p>
        <div class="mt-1 grid max-h-60 gap-0.5 overflow-y-auto">
          <button v-for="v in views" :key="v.name" type="button" class="wt-opt" :class="{ 'wt-opt--on': v.name === selectedView }" :data-test-rankings-view="v.name" @click="applyView(v.name)">
            <span class="min-w-0 flex-1 truncate">{{ v.name }}</span>
            <svg v-if="v.name === selectedView" viewBox="0 0 24 24" class="size-4 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <p v-if="!views.length" class="px-1 py-1 text-xs opacity-60">None yet: a view remembers the tier, filters and compares on screen under a name.</p>
        </div>
        <div class="mt-2 border-t border-base-300 pt-2">
          <form v-if="saving" class="flex items-center gap-1" @submit.prevent="saveView">
            <input ref="nameEl" v-model="newName" type="text" class="input input-bordered input-sm min-w-0 flex-1" placeholder="name this view" data-test-rankings-view-name @keydown.escape.prevent="saving = false" />
            <button type="submit" class="btn btn-primary btn-sm" :disabled="!newName.trim()" data-test-rankings-view-save>Save</button>
          </form>
          <button v-else type="button" class="wt-opt" title="remember the current tier, filters and compares under a name" data-test-rankings-view-new @click="startSave">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-linecap="round" /></svg>
            <span class="flex-1">Save current view…</span>
          </button>
          <button v-if="selectedView && !saving" type="button" class="wt-opt text-error" title="forget this saved view" data-test-rankings-view-forget @click="forgetView">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span class="min-w-0 flex-1 truncate">Forget “{{ selectedView }}”</span>
          </button>
        </div>
      </template>

      <template v-else-if="open === 'beta'">
        <div class="flex items-center gap-2">
          <span class="badge badge-ghost badge-sm font-semibold uppercase tracking-wide">Beta</span>
          <p class="text-sm font-semibold">How to read this table</p>
        </div>
        <ul class="wt-howto mt-2 grid gap-1.5 text-xs leading-relaxed" data-test-rankings-howto>
          <li><b>Team Avg DPR</b> is the damage of one rotation, averaged over four. It does not account for how long a rotation takes (the small grey figure beside it); click the heading (on a phone, the DPR · DPS switch over the cards) to rank by DPS instead.</li>
          <li><b>% of top</b> is each team's figure (DPR or DPS, whichever the team column reads) as a share of the best row listed, shaded from neutral to the accent colour. Click a row's figure to measure every team against that one.</li>
          <li><b>My account</b> runs every member at the sequence, weapon and refinement you set up in the calculator; <b>Riley's tiers</b> run everyone at one investment level.</li>
          <li><b>Main DPS · With · Without</b> filter the teams. A name in the table opens its own menu: show or hide its teams, compare its sequences, weapons and echoes.</li>
          <li>On a phone each team is a card: the main DPS first, each member's sequence and weapon rank (R0 = no signature weapon) and, under Riley's tiers, whether your account reaches it (✓, "you S2", "no sig", "not owned"). A team's rotation shows the same for its members, with their weapon and whether they have a build.</li>
          <li>Target: a level 100 enemy at 20% resistance; resonators level 90, skills level 10.</li>
          <li>All calculations are a beta and still change. The engine, kits, rotations and solves are by Riley31415 (<a href="https://github.com/Riley31415/wuwa_calc" target="_blank" rel="noopener" class="link">wuwa_calc</a>); engine bugs reach him on Discord, @rileyy._.</li>
        </ul>
      </template>
    </div>
  </div>
  <div v-if="report" class="border-b border-base-300 bg-base-200/60 px-3 py-2 text-sm" data-test-rankings-sync-report>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="font-semibold">Sync my teams</span>
      <span class="text-xs opacity-70">at your account's state · {{ report.updated }} updated · {{ report.unchanged }} unchanged · {{ report.skipped }} left alone<template v-if="report.failed"> · {{ report.failed }} failed</template></span>
      <span v-if="syncError" class="text-xs text-error">{{ syncError }}</span>
      <button type="button" class="btn btn-ghost btn-xs ml-auto" data-test-rankings-sync-close @click="report = null">Close</button>
    </div>
    <ul class="mt-1 grid gap-1">
      <li v-for="t in report.teams" :key="t.id" class="flex flex-wrap items-baseline gap-x-2" :data-test-rankings-sync-team="t.name" :data-test-rankings-sync-status="t.status">
        <span class="badge badge-xs" :class="badgeClass(t.status)">{{ t.status }}</span>
        <span class="font-medium">{{ t.name }}</span>
        <span v-if="t.newName" class="text-xs opacity-70">→ {{ t.newName }}</span>
        <span v-if="t.total" class="text-xs tabular-nums opacity-60">Riley {{ Math.round(t.total).toLocaleString() }} DPS</span>
        <span v-if="t.reason" class="text-xs opacity-70">{{ t.reason }}</span>
        <span v-if="t.deltas.length" class="w-full pl-2 text-xs opacity-80">
          <template v-for="(d, i) in t.deltas.slice(0, 12)" :key="i">
            <span class="tabular-nums">{{ d.characterId ? getCharacterRosterDisplayName(d.characterId) + " · " : "" }}{{ humanKey(d.key) }}{{ d.mainEcho ? ` (${d.mainEcho})` : "" }}{{ d.stacks != null ? ` @${d.stacks}` : "" }} {{ d.from }}→{{ d.to }}</span><span v-if="i < Math.min(t.deltas.length, 12) - 1"> · </span>
          </template>
          <span v-if="t.deltas.length > 12"> · +{{ t.deltas.length - 12 }} more</span>
        </span>
        <span v-if="t.durationDelta" class="w-full pl-2 text-xs tabular-nums opacity-80" data-test-rankings-sync-duration>
          rotation time: {{ t.durationDelta.from == null ? "none" : `${t.durationDelta.from}s` }} → {{ t.durationDelta.to }}s
        </span>
        <span v-if="t.enemyDeltas.length" class="w-full pl-2 text-xs opacity-80" data-test-rankings-sync-enemy>
          enemy settings:
          <template v-for="(e, i) in t.enemyDeltas" :key="e.key">
            <span class="tabular-nums">{{ e.label }} {{ e.from }}→{{ e.to }}</span><span v-if="i < t.enemyDeltas.length - 1"> · </span>
          </template>
        </span>
        <span v-if="t.members.some((m) => m.nextLoopChange)" class="w-full pl-2 text-xs opacity-70" data-test-rankings-sync-breakpoints>
          loop changes:
          <template v-for="(m, i) in t.members.filter((m) => m.nextLoopChange)" :key="m.name">
            <span>{{ m.name }} S{{ m.sequence }} → S{{ m.nextLoopChange }}</span><span v-if="i < t.members.filter((m) => m.nextLoopChange).length - 1"> · </span>
          </template>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+: the account-first controls above Riley's comparison page. Everything here is a
// URL-hash edit — his page owns the filter state and re-reads the hash (controller.ts
// onLocationChange) — so a saved view is just a named hash, and the chips are his own r= / x= filter.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import type { AccountState } from "../account/accountState";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useToast } from "../../composables/useToast";
import { rankingsRoster, syncMyTeams } from "./controller";
import { humanKey, type SyncReport, type SyncStatus, type TeamLike } from "./syncTeams";
import { chipGroups, compactName, hashText, pickerOptions, RILEY_TIERS, withResonatorFilter, type ChipGroup, type OwnedInfo, type PickerOption } from "./filterChips";

const props = defineProps<{ account: AccountState; builtCount?: number }>();
const route = useRoute();
const router = useRouter();

const VIEWS_KEY = "wtplus:rankings:views";
interface SavedView { name: string; hash: string }
const OWNED_NOTE = "A character counts as owned once it has a weapon equipped in the calculator; 4★ resonators and Rover forms always count, at S6.";

const params = computed(() => new URLSearchParams((route.hash ?? "").replace(/^#/, "")));
const isMine = computed(() => params.value.get("tc") === "mine");
const ownedOnly = computed(() => params.value.get("own") !== "0");
// the spread every row wears (Riley's substats compare shows all three side by side; this runs one for everyone)
const subsMode = computed(() => params.value.get("sb") ?? "");
const subsTitle = "the substat spread every row runs: Riley's ChemX32 default, his High Invest spread for every member, or the echoes each character has equipped in the app";
const builtCount = computed(() => props.builtCount ?? 0);
function setSubs(code: string): void {
  const p = new URLSearchParams(params.value);
  if (code === "h" || code === "m") p.set("sb", code);
  else p.delete("sb");
  void go(p);
}
const summaryText = computed(() => `${props.account.summary.owned} of ${props.account.summary.characters} set up · ${props.account.summary.s6} at S6`);
const mineTitle = computed(() => `every resonator at the sequence, weapon and refinement you have set up (${props.account.summary.owned} characters)`);

// ---- one layout per width: below 768 px (where Riley's aside becomes a bottom sheet) the bar folds into
// two rows: the state control + a menu, then the chips
const compact = ref(false);
let media: MediaQueryList | null = null;
const onMedia = (): void => {
  compact.value = !!media?.matches;
  open.value = null;
};

// ---- Riley's tiers: his Team Cost box (hidden in skittle-theme.css) through the same hash parameter
const KNOWN_TIERS = new Set(RILEY_TIERS.map((t) => t.code));
const tierCode = computed(() => {
  const code = params.value.get("tc") ?? "";
  return KNOWN_TIERS.has(code) ? code : "";
});
const tierTitle = computed(() => RILEY_TIERS.find((t) => t.code === tierCode.value)?.title ?? "");
/** the tier "Riley's tiers" goes back to after a visit to My account */
let lastTier = "";
function setTier(code: string): void {
  const p = new URLSearchParams(params.value);
  if (code) p.set("tc", code);
  else p.delete("tc");
  p.delete("own");
  lastTier = code;
  void go(p);
}

function readViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    const list = raw ? (JSON.parse(raw) as SavedView[]) : [];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.name === "string" && typeof v.hash === "string") : [];
  } catch {
    return [];
  }
}
const views = ref<SavedView[]>(readViews());
function writeViews(): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views.value));
  } catch {
    /* no storage */
  }
}
/** the current hash, without the detail page's own team parameter */
function currentHash(): string {
  const p = new URLSearchParams(params.value);
  p.delete("team");
  const text = hashText(p);
  return text ? `#${text}` : "";
}
/** a hash's parameters in a fixed order: Riley's `syncHash()` writes them in his own order, so a view
 *  saved from the bar still reads as the current one once his page has rewritten the URL */
const canonHash = (h: string): string => {
  const p = [...new URLSearchParams(h.replace(/^#/, ""))].filter(([k]) => k !== "team");
  return p.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
};
const selectedView = computed(() => {
  const now = canonHash(currentHash());
  return views.value.find((v) => canonHash(v.hash) === now)?.name ?? "";
});

async function go(p: URLSearchParams): Promise<void> {
  p.delete("team");
  const text = hashText(p);
  await router.replace({ path: route.path, hash: text ? `#${text}` : "" });
}
function setMine(on: boolean): void {
  if (!on) {
    if (isMine.value) setTier(lastTier);
    return;
  }
  const p = new URLSearchParams(params.value);
  p.set("tc", "mine");
  void go(p);
}
function setOwnedOnly(on: boolean): void {
  const p = new URLSearchParams(params.value);
  if (on) p.delete("own");
  else p.set("own", "0");
  void go(p);
}

// ---- Main DPS / With / Without chips (filterChips.ts)
const roster = rankingsRoster;
const CHIP_GROUPS: ReadonlyArray<{ id: ChipGroup; label: string; title: string }> = [
  { id: "main", label: "Main DPS", title: "teams these resonators lead (Riley's filter: a lone name also brings every team fielding them)" },
  { id: "with", label: "With", title: "teams that field these resonators" },
  { id: "without", label: "Without", title: "hide every team fielding these resonators" },
];
/** which group the player added a name from (this visit); the rest follow who leads a team */
const intents = ref(new Map<string, ChipGroup>());
const groups = computed(() => chipGroups(params.value, roster.value, intents.value));
const chipCount = computed(() => groups.value.main.length + groups.value.with.length + groups.value.without.length);
const colors = computed(() => new Map(roster.value.flatMap((r) => [[r.name, r.color], [compactName(r.name), r.color]] as const)));
const colorOf = (name: string): string => colors.value.get(name) ?? "oklch(var(--bc) / 0.4)";
const inGroup = (g: ChipGroup, name: string): boolean => groups.value[g].includes(name);
const accountByRiley = computed(() => {
  const m = new Map<string, OwnedInfo>();
  for (const c of Object.values(props.account.characters)) m.set(c.rileyName, { owned: c.owned, sequence: c.sequence });
  return m;
});
function setName(name: string, group: ChipGroup | null): void {
  const mode = group === null ? null : group === "without" ? "exclude" : "include";
  const next = new Map(intents.value);
  if (group && group !== "without") next.set(name, group);
  else next.delete(name);
  intents.value = next;
  void go(withResonatorFilter(params.value, name, mode, roster.value));
}
function pick(group: ChipGroup, name: string): void {
  setName(name, inGroup(group, name) ? null : group);
}
const removeName = (name: string): void => setName(name, null);
function clearChips(): void {
  const p = new URLSearchParams(params.value);
  p.delete("r");
  p.delete("x");
  intents.value = new Map();
  void go(p);
}

// ---- popovers: one open at a time; anchored under the trigger on desktop, a sheet under the bar on a phone
const open = ref<string | null>(null);
const query = ref("");
const barEl = ref<HTMLElement | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
const nameEl = ref<HTMLInputElement | null>(null);
const anchor = ref({ left: 0, right: 0, top: 0, width: 0 });
function toggle(name: string, ev?: Event): void {
  if (open.value === name) {
    open.value = null;
    return;
  }
  const trigger = ev?.currentTarget as HTMLElement | null;
  if (trigger && barEl.value) {
    const b = barEl.value.getBoundingClientRect();
    const t = trigger.getBoundingClientRect();
    anchor.value = { left: t.left - b.left, right: b.right - t.right, top: t.bottom - b.top, width: b.width };
  }
  open.value = name;
  query.value = "";
  saving.value = false;
  if (name.startsWith("pick-") && !compact.value) void nextTick(() => searchEl.value?.focus({ preventScroll: true }));
}
/** from the phone menu to one of its panels, which keep the menu's place */
function switchTo(name: string): void {
  open.value = name;
  saving.value = false;
}
const PANEL_W = 320;
const panelStyle = computed((): Record<string, string> => {
  if (compact.value) return {};
  const a = anchor.value;
  const top = `${Math.round(a.top + 4)}px`;
  // right-hand triggers open leftwards; everything stays inside the bar
  if (a.left + PANEL_W > a.width - 8) return { top, right: `${Math.max(8, Math.round(a.right))}px` };
  return { top, left: `${Math.max(8, Math.round(a.left))}px` };
});
const pickGroup = computed((): ChipGroup | null => (open.value?.startsWith("pick-") ? (open.value.slice(5) as ChipGroup) : null));
const pickHint = computed(() =>
  pickGroup.value === "main"
    ? "Teams led by the resonators you pick. Your S6 resonators first."
    : pickGroup.value === "with"
      ? "Teams fielding every resonator you pick. Your S6 resonators first."
      : "Teams fielding any resonator you pick are hidden.",
);
const sections = computed((): Array<{ label: string; options: PickerOption[] }> => {
  if (!pickGroup.value) return [];
  const q = query.value.trim().toLowerCase();
  const options = pickerOptions(roster.value, accountByRiley.value, pickGroup.value).filter((o) => !q || o.name.toLowerCase().includes(q));
  const group = pickGroup.value;
  const chosen = options.filter((o) => inGroup(group, o.name));
  const rest = options.filter((o) => !inGroup(group, o.name));
  const LABELS = ["Yours at S6", "Yours", "Not owned"];
  return [
    { label: "Picked", options: chosen },
    ...[0, 1, 2].map((s) => ({ label: LABELS[s]!, options: rest.filter((o) => o.section === s) })),
  ].filter((s) => s.options.length);
});
function pickFirst(): void {
  const first = sections.value[0]?.options[0];
  if (first && pickGroup.value) {
    pick(pickGroup.value, first.name);
    query.value = "";
  }
}
/** a press anywhere but the open panel or its own trigger (which toggles it) closes it */
const popEl = ref<HTMLElement | null>(null);
const onPointerDown = (e: PointerEvent): void => {
  if (!open.value) return;
  const target = e.target as Element | null;
  if (popEl.value?.contains(target)) return;
  if (target?.closest?.('[data-test-rankings-account-bar] [aria-expanded="true"]')) return;
  open.value = null;
};
const onKeydown = (e: KeyboardEvent): void => {
  if (e.key === "Escape" && open.value) open.value = null;
};
onMounted(() => {
  media = window.matchMedia("(max-width: 767px)");
  compact.value = media.matches;
  media.addEventListener("change", onMedia);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  media?.removeEventListener("change", onMedia);
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("keydown", onKeydown);
});

// ---- Sync my teams: every saved wuwa_calc team re-imported at the account's own state, in place
const teamStore = useTeamRotationsStore();
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: TeamLike[] } };
const syncing = ref(false);
const report = ref<SyncReport | null>(null);
const syncError = ref<string | null>(null);
const syncTitle = "re-import every saved wuwa_calc team (imports and presets) at your account's sequences, weapons and refinements, updating each in place; your own teams are left alone";
const badgeClass = (s: SyncStatus): string => (s === "updated" ? "badge-primary" : s === "unchanged" ? "badge-ghost" : s === "failed" ? "badge-error" : "badge-outline");
async function sync(): Promise<void> {
  if (syncing.value) return;
  syncing.value = true;
  syncError.value = null;
  open.value = null;
  const { showToast } = useToast();
  try {
    const snapshot: TeamLike[] = JSON.parse(JSON.stringify(teams.value ?? []));
    report.value = await syncMyTeams(snapshot);
    const r = report.value;
    showToast(`Sync my teams: ${r.updated} updated, ${r.unchanged} unchanged, ${r.skipped} left alone${r.failed ? `, ${r.failed} failed` : ""}.`, r.failed ? "warning" : "success", 7000);
  } catch (err) {
    syncError.value = err instanceof Error ? err.message : String(err);
    report.value ??= { at: new Date().toISOString(), cost: "mine", teams: [], updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    showToast(syncError.value, "error", 8000);
  } finally {
    syncing.value = false;
  }
}

const saving = ref(false);
const newName = ref("");
function startSave(): void {
  newName.value = selectedView.value;
  saving.value = true;
  void nextTick(() => nameEl.value?.focus({ preventScroll: true }));
}
function saveView(): void {
  const name = newName.value.trim();
  if (!name) return;
  const hash = currentHash();
  views.value = [...views.value.filter((v) => v.name !== name), { name, hash }].sort((a, b) => a.name.localeCompare(b.name));
  writeViews();
  saving.value = false;
}
function applyView(name: string): void {
  const v = views.value.find((x) => x.name === name);
  if (!v) return;
  open.value = null;
  void router.replace({ path: route.path, hash: v.hash });
}
function forgetView(): void {
  const name = selectedView.value;
  if (!name) return;
  views.value = views.value.filter((v) => v.name !== name);
  writeViews();
}
</script>

<style scoped>
.wt-dot {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border-radius: 9999px;
  box-shadow: 0 0 0 1px oklch(var(--bc) / 0.15);
}
.wt-chip {
  display: inline-flex;
  max-width: 11rem;
  align-items: center;
  gap: 0.35rem;
  height: 1.5rem;
  padding: 0 0.5rem;
  border: 1px solid oklch(var(--bc) / 0.14);
  border-radius: 9999px;
  background: oklch(var(--b2));
  color: oklch(var(--bc));
  font-size: 0.75rem;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.wt-chip:hover {
  border-color: oklch(var(--bc) / 0.3);
  background: oklch(var(--b3));
}
.wt-chip--out {
  border-style: dashed;
  color: oklch(var(--bc) / 0.75);
}
.wt-chip--out .truncate {
  text-decoration: line-through;
  text-decoration-color: oklch(var(--bc) / 0.45);
}
.wt-chips {
  scrollbar-width: none;
}
/* a phone's chip strip scrolls sideways: its far end fades out rather than cutting a button in half */
.wt-account-bar--compact .wt-chips {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.25rem), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 1.25rem), transparent);
  padding-right: 1rem;
}
.wt-chips::-webkit-scrollbar {
  display: none;
}
.wt-pop {
  position: absolute;
  z-index: 40;
  width: 20rem;
  max-width: calc(100% - 1rem);
  padding: 0.6rem;
  border: 1px solid oklch(var(--bc) / 0.1);
  border-radius: var(--rounded-box, 0.75rem);
  background: oklch(var(--b2));
  color: oklch(var(--bc));
  box-shadow: 0 18px 40px -16px oklch(0 0 0 / 0.45);
}
.wt-pop {
  max-height: min(70vh, 36rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.wt-pop--sheet {
  top: calc(100% + 0.25rem);
  left: 0.5rem;
  right: 0.5rem;
  width: auto;
  max-width: none;
}
.wt-opt {
  display: flex;
  width: 100%;
  min-height: 2rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--rounded-btn, 0.5rem);
  font-size: 0.8125rem;
  text-align: left;
}
.wt-opt:hover:not(:disabled) {
  background: oklch(var(--bc) / 0.07);
}
.wt-opt:disabled {
  opacity: 0.6;
}
.wt-opt--on {
  background: oklch(var(--p) / 0.1);
}
.wt-howto li {
  padding-left: 0.75rem;
  position: relative;
  color: oklch(var(--bc) / 0.82);
}
.wt-howto li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.35);
}
.wt-howto b {
  color: oklch(var(--bc));
  font-weight: 600;
}
</style>
