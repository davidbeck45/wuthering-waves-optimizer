<template>
  <Nav cur-page="echo-plan" :disable-mobile-nav="true"></Nav>
  <div class="echo-plan mx-auto w-full max-w-7xl px-3 py-4 sm:px-6" :class="phoneBar ? 'max-sm:pb-24' : ''" data-test-echo-plan>
    <!-- header -->
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-box border border-base-300 bg-base-200 px-4 py-3 max-sm:px-3 max-sm:py-2.5">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary max-sm:size-9" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="size-6 max-sm:size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <path d="M14.5 17l2 2 3.5-4" />
          </svg>
        </div>
        <div class="min-w-0">
          <h1 class="flex items-center gap-2 text-xl font-bold leading-tight">
            Echo plan <span class="badge badge-primary badge-outline badge-sm font-semibold">Tools+</span>
          </h1>
          <p class="text-xs opacity-60 max-sm:hidden">
            The in-game Echo Management plan for your roster: which COST 4 / 3 / 1 main stats to lock and which to discard, per Sonata.
          </p>
          <p class="text-xs opacity-60 sm:hidden">Lock / discard plan for your roster</p>
        </div>
      </div>
      <div class="flex items-center gap-2 max-sm:w-full">
        <button type="button" class="btn btn-ghost btn-sm max-sm:flex-1" :aria-expanded="showHelp" data-test-echo-plan-help-toggle @click="showHelp = !showHelp">
          How it works
        </button>
        <button v-if="hasRoster" type="button" class="btn btn-sm max-sm:flex-1" data-test-echo-plan-copy @click="copyPlan">Copy as text</button>
      </div>
    </header>

    <section v-if="showHelp" class="mt-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm max-sm:px-3" data-test-echo-plan-help>
      <ol class="list-decimal space-y-1 pl-5">
        <li>In game, open <b>Echo Management</b> and pick a Sonata Effect. Since 3.2 every new echo is locked or marked for discard by its main stat, per COST 4 / 3 / 1 row of that Sonata.</li>
        <li>Lock the main stats marked <span class="ep-chip ep-chip--keep pointer-events-none !min-h-0 py-0">Lock</span> here and set the rest of the row to discard.</li>
        <li>Tick <b>Done</b> on the card. After a patch, a roster change or a switch flip, the cards you have to redo light up — nothing else.</li>
      </ol>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-xs opacity-75">
        <li>Plan Codes are server-side: WT+ can't create or read one, so the grid is tapped in by hand once. Share your plan in game and keep its code here.</li>
        <li>A Sonata nobody on your roster uses gets <b>no plan</b> (the game leaves its echoes alone) unless you switch on <b>Throw unused Sonatas</b>.</li>
        <li>The game's own <b>Auto-Discard Non-5-Star Echoes</b> switch handles 2–4★ echoes; <b>Manage Owned Echoes</b> applies the plan to echoes you already own — check its discard list before you confirm.</li>
        <li>Since 3.7 un-upgraded echoes of the same type, Sonata and main stat stack: Locked + unmarked stays Locked, Discarded + unmarked stays Discarded, Locked + Discarded becomes Locked. The plan doesn't change for it.</li>
        <li>Each character counts what they wear now, every saved build, Ryan's curated presets and Riley31415's wuwa_calc loadouts. A split build (3pc + 2pc) is kept in both Sonatas, and a wanted 4-cost Crit. Rate or Crit. DMG keeps its pair unless you switch that off. Tap any chip to see who wants it and to pin it yourself.</li>
      </ul>
    </section>

    <!-- empty: no roster yet -->
    <section v-if="!hasRoster" class="mt-3 rounded-box border border-base-300 bg-base-100 p-6 max-sm:p-4" data-test-echo-plan-empty>
      <h2 class="text-lg font-semibold">Bring your roster in</h2>
      <p class="mt-1 max-w-2xl text-sm opacity-70">
        The plan is built from the characters you own — a weapon equipped in the calculator — and what they wear, their saved
        builds, the curated presets and wuwa_calc's loadouts. No character is set up in this browser yet.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <RouterLink to="/settings" class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content no-underline transition-colors hover:border-primary" data-test-echo-plan-cta="import">
          <div class="font-semibold text-primary">Import your account ›</div>
          <p class="mt-1 text-sm text-base-content/70">Settings › Backup &amp; Restore takes a Wuthering Tools export; Wavescan imports land there too.</p>
        </RouterLink>
        <button type="button" class="rounded-box border border-base-300 bg-base-200 p-4 text-left transition-colors hover:border-primary" data-test-echo-plan-cta="planned" @click="roster?.focusPicker()">
          <div class="font-semibold text-primary">Plan for characters you want ›</div>
          <p class="mt-1 text-sm text-base-content/70">Pick the characters you play or plan to pull; their presets and wuwa_calc loadouts make the plan.</p>
        </button>
      </div>
    </section>

    <template v-if="hasRoster">
      <!-- KPIs -->
      <div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4" data-test-echo-plan-kpis>
        <div class="min-w-0 rounded-box border border-base-300 bg-base-100 px-3 py-2.5">
          <div class="truncate text-[0.65rem] font-semibold uppercase tracking-wide opacity-60"><span class="max-sm:hidden">Sonatas with a plan</span><span class="sm:hidden">With a plan</span></div>
          <div class="mt-0.5 flex items-baseline gap-1.5">
            <span class="font-mono text-2xl font-bold tabular-nums max-sm:text-xl" data-test-echo-plan-kpi="planned">{{ ready ? plan.summary.planned + plan.summary.thrown : "–" }}</span>
            <span class="truncate text-xs opacity-60">of {{ plan.cards.length }}</span>
          </div>
        </div>
        <div class="min-w-0 rounded-box border border-base-300 bg-base-100 px-3 py-2.5">
          <div class="truncate text-[0.65rem] font-semibold uppercase tracking-wide opacity-60"><span class="max-sm:hidden">Main stats to lock</span><span class="sm:hidden">To lock</span></div>
          <div class="mt-0.5 flex items-baseline gap-1.5">
            <span class="ep-text-keep font-mono text-2xl font-bold tabular-nums max-sm:text-xl" data-test-echo-plan-kpi="keep">{{ ready ? plan.summary.keep : "–" }}</span>
            <span class="truncate text-xs opacity-60 max-sm:hidden">{{ plan.summary.discard }} to discard</span>
          </div>
        </div>
        <button
          type="button"
          class="min-w-0 rounded-box border bg-base-100 px-3 py-2.5 text-left transition-colors hover:border-base-content/30"
          :class="filter === 'todo' ? 'border-primary' : 'border-base-300'"
          title="Show the Sonatas still to set in game"
          data-test-echo-plan-kpi-todo
          @click="setFilter(filter === 'todo' ? 'all' : 'todo')">
          <div class="truncate text-[0.65rem] font-semibold uppercase tracking-wide opacity-60"><span class="max-sm:hidden">To set in game</span><span class="sm:hidden">To set</span></div>
          <div class="mt-0.5 flex items-baseline gap-1.5">
            <span class="font-mono text-2xl font-bold tabular-nums max-sm:text-xl" :class="progress.changed.length ? 'ep-text-changed' : ''" data-test-echo-plan-kpi="todo">{{ ready ? progress.toUpdate.length : "–" }}</span>
            <span class="truncate text-xs opacity-60">{{ progress.done.length }} done</span>
          </div>
        </button>
        <div class="min-w-0 rounded-box border border-base-300 bg-base-100 px-3 py-2.5">
          <div class="truncate text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">Characters</div>
          <div class="mt-0.5 flex items-baseline gap-1.5">
            <span class="font-mono text-2xl font-bold tabular-nums max-sm:text-xl" data-test-echo-plan-kpi="characters">{{ includedCount }}</span>
            <span class="truncate text-xs opacity-60">{{ plannedKeys.length ? `${plannedKeys.length} planned` : "owned" }}</span>
          </div>
        </div>
      </div>

      <!-- rules + plan code (folded behind one button on a phone) -->
      <button
        type="button"
        class="btn btn-sm mt-3 h-auto min-h-9 w-full flex-nowrap justify-between border-base-300 bg-base-100 py-1.5 font-medium sm:hidden"
        :aria-expanded="phoneSettings"
        data-test-echo-plan-phone-settings
        @click="phoneSettings = !phoneSettings">
        <span class="min-w-0 truncate text-left">Rules &amp; Plan Code<span v-if="rulesOn" class="ml-1 opacity-60">· {{ rulesOn }} on</span></span>
        <svg viewBox="0 0 20 20" class="size-4 shrink-0 opacity-60 transition-transform" :class="phoneSettings ? 'rotate-180' : ''" fill="currentColor" aria-hidden="true">
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]" :class="phoneSettings ? '' : 'max-sm:hidden'">
        <section class="min-w-0 rounded-box border border-base-300 bg-base-100 px-4 py-3 max-sm:px-3" data-test-echo-plan-options>
          <h2 class="text-sm font-semibold">Plan rules</h2>
          <div class="mt-2 grid gap-x-5 gap-y-2.5 md:grid-cols-2">
            <label v-for="o in RULES" :key="o.id" class="flex cursor-pointer items-start gap-2.5">
              <input
                v-model="state.options[o.id]"
                type="checkbox"
                class="toggle toggle-primary toggle-sm mt-0.5 shrink-0"
                :data-test-echo-plan-option="o.id" />
              <span class="min-w-0">
                <span class="block text-sm font-medium leading-tight">{{ o.label }}</span>
                <span class="block text-xs leading-snug opacity-60">{{ o.hint }}</span>
              </span>
            </label>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-base-300 pt-2.5">
            <span class="text-[0.65rem] font-semibold uppercase tracking-wider opacity-60">Count</span>
            <label v-for="s in SOURCES" :key="s.id" class="flex cursor-pointer items-center gap-1.5 text-sm" :title="s.hint">
              <input v-model="state.options.sources[s.id]" type="checkbox" class="checkbox checkbox-xs" :data-test-echo-plan-source="s.id" />
              {{ s.label }}
            </label>
            <span v-if="loading" class="flex items-center gap-1 text-xs opacity-60" data-test-echo-plan-loading>
              <span class="loading loading-spinner loading-xs"></span> loading presets…
            </span>
          </div>
        </section>
        <EchoPlanCodes :codes="state.codes" :server="state.server" @server="(id) => (state.server = id)" @code="setCode" />
      </div>
    </template>

    <div class="mt-3">
      <EchoPlanRoster
        ref="roster"
        :roster="wants.roster"
        :owned-keys="ownedKeys"
        :planned-keys="plannedKeys"
        :unarmed-keys="unarmedKeys"
        :include-planned="state.options.includePlanned"
        @add="addPlanned"
        @remove="removePlanned"
        @toggle-excluded="toggleExcluded" />
    </div>

    <template v-if="hasRoster">
      <div v-if="failed.length" role="alert" class="mt-3 flex flex-wrap items-center gap-2 rounded-box border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm" data-test-echo-plan-load-error>
        <span class="min-w-0 flex-1">
          Couldn't load the presets for {{ failed.map(characterShortName).join(", ") }} — the plan uses what they wear and their saved builds for now.
        </span>
        <button type="button" class="btn btn-sm" @click="retrySources">Retry</button>
      </div>
      <div v-if="!storageOk" role="alert" class="mt-3 rounded-box border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm" data-test-echo-plan-storage-error>
        This browser isn't saving the page (storage blocked or full): your ticks and codes last until you close the tab.
      </div>

      <!-- what changed since the plan was set -->
      <div
        v-if="ready && (progress.changed.length || progress.newSets.length)"
        class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-box border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm max-sm:px-3"
        data-test-echo-plan-diff>
        <svg viewBox="0 0 20 20" class="ep-text-changed size-5 shrink-0 self-start" fill="currentColor" aria-hidden="true">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.9 4.2-.2 5.1H9.3l-.2-5.1h1.8ZM10 15a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
        </svg>
        <div class="min-w-0 flex-1 basis-40">
          <template v-if="progress.changed.length">
            <b>{{ progress.changed.length }} Sonata{{ progress.changed.length === 1 ? "" : "s" }} changed</b>
            <span v-if="savedLabel"> since you set the plan ({{ savedLabel }})</span>:
            {{ names(progress.changed) }}.
          </template>
          <template v-if="newToSet.length">
            <b>New in the app:</b> {{ names(newToSet) }} — set {{ newToSet.length === 1 ? "this card" : `these ${newToSet.length} cards` }} in game.
          </template>
          <template v-if="newIdle.length">
            <b>{{ newToSet.length ? "Also new" : "New in the app" }}:</b> {{ names(newIdle) }} — nobody on your roster uses
            {{ newIdle.length === 1 ? "it" : "them" }} yet, so {{ newIdle.length === 1 ? "it needs" : "they need" }} no plan.
          </template>
        </div>
        <div class="flex gap-2 max-sm:ml-8">
          <button type="button" class="btn btn-sm" data-test-echo-plan-diff-show @click="setFilter('changed')">Show {{ progress.changed.length + newOnly.length === 1 ? "it" : "them" }}</button>
          <button v-if="progress.newSets.length" type="button" class="btn btn-ghost btn-sm" data-test-echo-plan-diff-ack @click="acknowledgeNew">Got it</button>
        </div>
      </div>

      <!-- filters -->
      <div ref="gridTop" class="mt-4 flex flex-wrap items-center gap-2 scroll-mt-24">
        <div class="join max-sm:w-full" role="group" aria-label="Show">
          <button
            v-for="f in filters"
            :key="f.id"
            type="button"
            class="btn join-item btn-sm max-sm:h-auto max-sm:min-h-11 max-sm:flex-1 max-sm:flex-col max-sm:flex-nowrap max-sm:gap-0 max-sm:px-1 max-sm:py-1"
            :class="filter === f.id ? 'btn-primary' : 'btn-ghost border-base-300'"
            :aria-pressed="filter === f.id"
            :data-test-echo-plan-filter="f.id"
            @click="setFilter(f.id)">
            <span class="whitespace-nowrap">{{ f.label }}</span><span class="font-mono text-xs tabular-nums opacity-70 sm:ml-1">{{ f.count }}</span>
          </button>
        </div>
        <label class="input input-bordered input-sm flex min-w-0 items-center gap-2 max-sm:w-full sm:ml-auto sm:w-64">
          <svg viewBox="0 0 20 20" class="size-4 shrink-0 opacity-50" fill="currentColor" aria-hidden="true">
            <path d="M8.5 3a5.5 5.5 0 1 0 3.4 9.8l3.6 3.7a1 1 0 0 0 1.5-1.4l-3.7-3.6A5.5 5.5 0 0 0 8.5 3Zm-3.5 5.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z" />
          </svg>
          <input v-model="query" type="search" class="min-w-0 grow" placeholder="Sonata or character" aria-label="Filter by Sonata or character" data-test-echo-plan-search />
        </label>
        <div class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-70">
          <span class="flex items-center gap-1"><span class="ep-chip ep-chip--keep pointer-events-none !min-h-0 py-0">Lock</span> wanted by someone</span>
          <span class="flex items-center gap-1"><span class="ep-chip ep-chip--discard pointer-events-none !min-h-0 py-0">Discard</span> nobody wants it</span>
          <span class="flex items-center gap-1"><span class="relative inline-block size-2 rounded-full bg-primary"></span> set by you</span>
          <span class="max-sm:hidden">Tap a chip for who wants it.</span>
          <button v-if="progress.toUpdate.length" type="button" class="btn btn-ghost btn-xs ml-auto max-sm:ml-0" data-test-echo-plan-mark-all @click="markAllDone">
            Mark all {{ progress.toUpdate.length }} done
          </button>
          <button v-else-if="progress.done.length" type="button" class="btn btn-ghost btn-xs ml-auto max-sm:ml-0" data-test-echo-plan-clear-ticks @click="clearTicks">
            Clear ticks
          </button>
        </div>
      </div>

      <!-- loading -->
      <div v-if="!ready" class="mt-3 grid gap-3 md:grid-cols-2" aria-busy="true" data-test-echo-plan-skeleton>
        <div v-for="i in 6" :key="i" class="rounded-box border border-base-300 bg-base-100 p-3">
          <div class="flex items-center gap-3">
            <div class="skeleton size-11 shrink-0 rounded-lg"></div>
            <div class="flex-1 space-y-2">
              <div class="skeleton h-4 w-2/3"></div>
              <div class="skeleton h-3 w-1/3"></div>
            </div>
          </div>
          <div class="mt-4 space-y-2">
            <div class="skeleton h-7 w-full"></div>
            <div class="skeleton h-7 w-5/6"></div>
            <div class="skeleton h-7 w-1/2"></div>
          </div>
        </div>
      </div>

      <template v-else>
        <section v-if="shownTodo.length" class="mt-3 grid items-start gap-3 md:grid-cols-2" data-test-echo-plan-grid>
          <SonataCard
            v-for="c in shownTodo"
            :key="c.set"
            :card="c"
            :progress="progress.cards[c.set]!"
            @chip="openChip"
            @toggle-done="toggleDone" />
        </section>

        <template v-if="shownDone.length">
          <h2 class="mt-5 mb-2 flex items-baseline gap-2 text-sm font-semibold">
            Set in game <span class="font-normal opacity-60">· {{ shownDone.length }} ticked — a card comes back up here if its plan changes</span>
          </h2>
          <section class="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-test-echo-plan-done-list>
            <SonataCard v-for="c in shownDone" :key="c.set" :card="c" :progress="progress.cards[c.set]!" @chip="openChip" @toggle-done="toggleDone" />
          </section>
        </template>

        <template v-if="shownOff.length">
          <h2 class="mt-5 mb-2 flex items-baseline gap-2 text-sm font-semibold">
            No plan <span class="font-normal opacity-60">· nobody on your roster uses these — leave them off in game</span>
          </h2>
          <section class="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-test-echo-plan-off>
            <SonataCard v-for="c in shownOff" :key="c.set" :card="c" :progress="progress.cards[c.set]!" @chip="openChip" @toggle-done="toggleDone" />
          </section>
        </template>

        <div v-if="!shownTodo.length && !shownDone.length && !shownOff.length" class="mt-3 rounded-box border border-dashed border-base-300 px-4 py-8 text-center text-sm opacity-70" data-test-echo-plan-none>
          <template v-if="query">No Sonata or character matches “{{ query }}”.</template>
          <template v-else-if="filter === 'todo'">Every Sonata is set in game. Nice.</template>
          <template v-else-if="filter === 'changed'">Nothing changed since you set the plan.</template>
          <template v-else>Nothing ticked yet.</template>
          <button type="button" class="btn btn-ghost btn-xs ml-1" @click="resetFilters">Show all</button>
        </div>
      </template>
    </template>

    <p class="mt-6 text-xs opacity-55">
      Sonata names as the game writes them; released content only. wuwa_calc loadouts by Riley31415, curated presets by the
      Wuthering Tools community.
    </p>

    <EchoPlanChipSheet :card="sheetCard" :chip="sheetChip" @override="onOverride" @close="sheet = null" />

    <!-- phone: the cards still to set, always in reach -->
    <div
      v-if="phoneBar"
      class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-base-300 bg-base-200/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
      data-test-echo-plan-phone-bar>
      <span class="min-w-0 flex-1 text-sm">
        <b class="tabular-nums" :class="progress.changed.length ? 'ep-text-changed' : ''">{{ progress.toUpdate.length }}</b>
        Sonata{{ progress.toUpdate.length === 1 ? "" : "s" }} to set in game
      </span>
      <button type="button" class="btn btn-primary btn-sm" @click="setFilter(filter === 'todo' ? 'all' : 'todo')">{{ filter === "todo" ? "Show all" : "Show" }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ /echo-plan — the Echo Management Plan builder (batch 2). See useEchoPlan.ts for the state and
// plan.ts for the rules; src/sim/README.md § "Echo plan" for the whole picture.
import { computed, ref } from "vue";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useToast } from "../../composables/useToast";
import type { ChipId } from "./catalog";
import EchoPlanChipSheet from "./EchoPlanChipSheet.vue";
import EchoPlanCodes from "./EchoPlanCodes.vue";
import EchoPlanRoster from "./EchoPlanRoster.vue";
import { characterName, characterShortName } from "./names";
import type { Verdict } from "./plan";
import SonataCard from "./SonataCard.vue";
import type { ServerId } from "./storage";
import { useEchoPlan } from "./useEchoPlan";
import "./echoPlan.css";

useDocumentTitle(
  "Echo plan — Wuthering Waves Calculator & Optimizer",
  "Build the in-game Echo Management plan from your roster: which COST 4 / 3 / 1 main stats to lock and which to discard for every Sonata, and what changed since the last patch.",
);

const model = useEchoPlan();
const {
  state,
  storageOk,
  plan,
  progress,
  wants,
  ownedKeys,
  unarmedKeys,
  plannedKeys,
  hasRoster,
  loading,
  ready,
  failed,
  retrySources,
  toggleDone,
  markAllDone,
  clearTicks,
  acknowledgeNew,
  setOverride,
  addPlanned,
  removePlanned,
  toggleExcluded,
} = model;
const { showToast } = useToast();

const RULES = [
  {
    id: "pairCrit",
    label: "Pair the crit 4-costs",
    hint: "Where someone wants a 4-cost Crit. Rate, lock Crit. DMG too (and the other way): a build takes whichever its substats need.",
  },
  { id: "keepAll4", label: "Keep every 4-cost", hint: "Lock all six 4-cost main stats of a planned Sonata, to re-roll the main stat later." },
  { id: "throwUnused", label: "Throw unused Sonatas", hint: "Discard every echo of a Sonata nobody on your roster uses. Off: those get no plan." },
  { id: "includePlanned", label: "Count planned characters", hint: "Add the characters you plan to pull or build (under Characters)." },
] as const;
const SOURCES = [
  { id: "builds", label: "What they wear & saved builds", hint: "Each owned character's equipped echoes and every saved build" },
  { id: "presets", label: "Curated presets", hint: "The echo presets shipped with each character" },
  { id: "engine", label: "wuwa_calc loadouts", hint: "Riley31415's engine: the sets and main stats it runs each character with" },
] as const;

const showHelp = ref(false);
const phoneSettings = ref(false);
const rulesOn = computed(() => RULES.filter((r) => state.options[r.id]).length);
const roster = ref<InstanceType<typeof EchoPlanRoster> | null>(null);
const gridTop = ref<HTMLElement | null>(null);

type Filter = "all" | "todo" | "changed" | "done";
const filter = ref<Filter>("all");
const query = ref("");

const includedCount = computed(() => wants.value.roster.filter((r) => !r.excluded).length);
const newOnly = computed(() => progress.value.newSets.filter((s) => !progress.value.changed.includes(s)));
/** a patch's new Sonatas: the ones the roster wants (a card to set in game) and the ones nobody uses (no plan needed) */
const newToSet = computed(() => newOnly.value.filter((s) => progress.value.cards[s]?.status === "todo"));
const newIdle = computed(() => newOnly.value.filter((s) => progress.value.cards[s]?.status !== "todo"));
const filters = computed(() => [
  { id: "all" as const, label: "All", count: plan.value.cards.length },
  { id: "todo" as const, label: "To set", count: progress.value.toUpdate.length },
  { id: "changed" as const, label: "Changed", count: progress.value.changed.length + newOnly.value.length },
  { id: "done" as const, label: "Done", count: progress.value.done.length },
]);

const savedLabel = computed(() =>
  state.savedAt ? new Date(state.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
);

function matches(set: string): boolean {
  const card = plan.value.cards.find((c) => c.set === set)!;
  const q = query.value.trim().toLowerCase();
  if (q) {
    const hay = [card.name, card.appName ?? "", ...card.characters.map(characterName)].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const p = progress.value.cards[set]!;
  switch (filter.value) {
    case "todo":
      return p.status === "todo" || p.status === "changed";
    case "changed":
      return p.status === "changed" || p.isNew;
    case "done":
      return p.status === "done";
    default:
      return true;
  }
}

const statusOf = (set: string) => progress.value.cards[set]?.status;
/** the working list (still to set, or changed since ticked), then the ticked ones, then the Sonatas with no plan */
const shownTodo = computed(() => plan.value.cards.filter((c) => (statusOf(c.set) === "todo" || statusOf(c.set) === "changed") && matches(c.set)));
const shownDone = computed(() => plan.value.cards.filter((c) => statusOf(c.set) === "done" && matches(c.set)));
const shownOff = computed(() => plan.value.cards.filter((c) => statusOf(c.set) === "idle" && matches(c.set)));
const phoneBar = computed(() => hasRoster.value && ready.value && progress.value.toUpdate.length > 0);

function setFilter(f: Filter): void {
  filter.value = f;
  gridTop.value?.scrollIntoView({ block: "start", behavior: "smooth" });
}
function resetFilters(): void {
  filter.value = "all";
  query.value = "";
}

const names = (sets: string[]): string => {
  const list = sets.map((s) => plan.value.cards.find((c) => c.set === s)?.name ?? s);
  return list.length > 4 ? `${list.slice(0, 4).join(", ")} and ${list.length - 4} more` : list.join(", ");
};

// chip sheet
const sheet = ref<{ set: string; chip: ChipId } | null>(null);
const sheetCard = computed(() => (sheet.value ? (plan.value.cards.find((c) => c.set === sheet.value!.set) ?? null) : null));
const sheetChip = computed(() => sheetCard.value?.rows.flatMap((r) => r.chips).find((c) => c.id === sheet.value!.chip) ?? null);
const openChip = (set: string, chip: ChipId): void => {
  sheet.value = { set, chip };
};
const onOverride = (verdict: Verdict | null): void => {
  if (sheet.value) setOverride(sheet.value.set, sheet.value.chip, verdict);
};

function setCode(server: ServerId, code: string): void {
  model.setCode(server, code);
}

async function copyPlan(): Promise<void> {
  try {
    await navigator.clipboard.writeText(model.text());
    showToast("Plan copied as text", "success", 2500);
  } catch {
    showToast("Couldn't reach the clipboard", "warning");
  }
}
</script>
