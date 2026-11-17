<template>
  <section class="nm" data-test-numbers :data-state="state.kind" aria-labelledby="nm-title">
    <h2 id="nm-title" class="nm-h2">What moved in your numbers</h2>
    <p class="nm-intro">
      Each time your roster is scored, this browser keeps a record of every character's and team's damage. Here is the newest
      record against an older one: what moved, by how much, and why, as far as the two records can tell.
    </p>

    <p v-if="running" class="nm-note nm-note--info" role="status" data-test-numbers-running>
      <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
      {{ RUNNING_TEXT }}
    </p>
    <p v-else-if="stale && state.kind !== 'no-account'" class="nm-note nm-note--warn" role="status" data-test-numbers-stale>
      {{ staleText(stale) }}
      <RouterLink to="/account" class="nm-link">Open My account</RouterLink>
    </p>

    <div v-if="state.kind === 'no-account'" class="nm-card" data-test-numbers-no-account>
      <p>{{ NO_ACCOUNT_TEXT }}</p>
      <div class="nm-card__actions">
        <RouterLink to="/settings?section=backup-restore" class="btn btn-primary btn-sm">Import your data</RouterLink>
        <RouterLink to="/" class="btn btn-outline btn-sm">Open the calculator</RouterLink>
      </div>
    </div>

    <!-- while a ranking runs, the note above says a record is on its way: "open My account" would send him away from it -->
    <div v-else-if="state.kind === 'empty' && running" data-test-numbers-empty-running></div>
    <div v-else-if="state.kind === 'empty'" class="nm-card" data-test-numbers-empty>
      <p>{{ EMPTY_TEXT }}</p>
      <div class="nm-card__actions">
        <RouterLink to="/account" class="btn btn-primary btn-sm">Open My account</RouterLink>
      </div>
    </div>

    <div v-else-if="state.kind === 'first'" class="nm-card" data-test-numbers-first>
      <p class="font-semibold">{{ firstRecordText(state.entry, now) }}</p>
      <p class="nm-muted">
        It holds {{ state.entry.characters.length }} character{{ state.entry.characters.length === 1 ? "" : "s" }} and {{ state.entry.teams.length }} team{{
          state.entry.teams.length === 1 ? "" : "s"
        }}. The next time a figure moves, after you change a build or after an app update, the change shows here with its cause.
      </p>
      <p class="nm-muted">{{ BASIS_TEXT }}</p>
    </div>

    <template v-else>
      <div class="nm-range" data-test-numbers-range>
        <p class="nm-range__newest">
          <span class="nm-pick__label">Newest record</span>
          <b data-test-numbers-newest>{{ whenText(c.after.at, now) }}</b>
        </p>
        <label class="nm-pick">
          <span class="nm-pick__label">Compared with</span>
          <select v-model="baseAt" class="select select-bordered select-sm nm-pick__select" data-test-numbers-since>
            <option v-for="(e, i) in state.choices" :key="e.at" :value="i === 0 ? null : e.at">{{ i === 0 ? "the one before · " : "since " }}{{ whenText(e.at, now) }}</option>
          </select>
        </label>
      </div>

      <p v-if="c.importedAt" class="nm-note nm-note--info" data-test-numbers-import>
        A Settings import replaced your account on {{ whenText(c.importedAt, now) }}, between these two records. The builds and teams that
        differ below came with it.
      </p>
      <p v-if="c.appUpdated" class="nm-note nm-note--info" data-test-numbers-app-update>
        The app was updated between these two records.
        <RouterLink :to="{ path: '/whats-new' }" class="nm-link" data-test-numbers-to-whats-new>What's new on Tools+</RouterLink>
        and
        <RouterLink to="/updates" class="nm-link" data-test-numbers-to-updates>Ryan's Updates</RouterLink>
        list what changed. Which of those changes moved a figure, the record cannot tell.
      </p>

      <p class="nm-summary" data-test-numbers-summary>{{ summaryText(c) }}</p>

      <template v-if="characterMoves.length">
        <h3 class="nm-h3">Characters <span class="nm-count">{{ characterMoves.length }}</span></h3>
        <ul class="nm-list" data-test-numbers-characters>
          <NumbersMoveRow v-for="m in characterMoves" :key="`c:${m.id}`" :move="m" :imported="!!c.importedAt" />
        </ul>
      </template>

      <template v-if="teamMoves.length">
        <h3 class="nm-h3">Teams <span class="nm-count">{{ teamMoves.length }}</span></h3>
        <ul class="nm-list" data-test-numbers-teams>
          <NumbersMoveRow v-for="m in shownTeams" :key="`t:${m.id}`" :move="m" :imported="!!c.importedAt" />
        </ul>
        <button v-if="teamMoves.length > shownTeams.length" type="button" class="btn btn-outline btn-sm nm-more" data-test-numbers-more-teams @click="allTeams = true">
          Show all {{ teamMoves.length }} teams
        </button>
      </template>

      <template v-if="c.appeared.length">
        <h3 class="nm-h3">New since then <span class="nm-count">{{ c.appeared.length }}</span></h3>
        <ul class="nm-chips" data-test-numbers-appeared>
          <li v-for="x in shownAppeared" :key="`${x.kind}:${x.id}`" class="nm-chip" :data-id="x.id">
            <b>{{ listedName(x) }}</b> <span class="nm-muted">{{ x.kind === "team" ? "team" : "best rotation" }} · {{ compact(x.damage) }} damage per rotation</span>
          </li>
        </ul>
        <button v-if="c.appeared.length > shownAppeared.length" type="button" class="btn btn-outline btn-sm nm-more" @click="allAppeared = true">Show all {{ c.appeared.length }}</button>
      </template>

      <template v-if="c.gone.length">
        <h3 class="nm-h3">No longer there <span class="nm-count">{{ c.gone.length }}</span></h3>
        <ul class="nm-chips" data-test-numbers-gone>
          <li v-for="x in shownGone" :key="`${x.kind}:${x.id}`" class="nm-chip" :data-id="x.id">
            <b>{{ listedName(x) }}</b> <span class="nm-muted">{{ x.kind === "team" ? "team" : "best rotation" }} · it was {{ compact(x.damage) }} damage per rotation</span>
          </li>
        </ul>
        <button v-if="c.gone.length > shownGone.length" type="button" class="btn btn-outline btn-sm nm-more" @click="allGone = true">Show all {{ c.gone.length }}</button>
      </template>

      <p class="nm-basis" data-test-numbers-basis>{{ BASIS_TEXT }} The log keeps the last {{ MAX_ENTRIES }} records that differ, in this browser only.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "What moved in your numbers", the full list (the second part of /whats-new). Reads the numbers
// log (src/sim/numbersLog/): the newest record against the one before it or an older one the reader picks, every figure
// that moved with its cause, what appeared and what went. It starts no ranking itself: /account, /my-rankings and
// /weapons do, and each run that finishes whole is one record.
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { characterShortName } from "../display/names";
import { compact } from "../myRankings/format";
import { whenText, type Comparison, type Listed } from "./compare";
import { MAX_ENTRIES } from "./log";
import NumbersMoveRow from "./NumbersMoveRow.vue";
import { NAMES, useNumbersLog } from "./useNumbersLog";
import { BASIS_TEXT, EMPTY_TEXT, NO_ACCOUNT_TEXT, RUNNING_TEXT, firstRecordText, staleText, summaryText } from "./view";

const SHOWN = 8;
const { state, baseAt, running, stale, now } = useNumbersLog();

// only read while the state is "compared" (the template's last branch)
const c = computed(() => (state.value as { comparison: Comparison }).comparison);
const characterMoves = computed(() => (state.value.kind === "compared" ? c.value.moves.filter((m) => m.kind === "character") : []));
const teamMoves = computed(() => (state.value.kind === "compared" ? c.value.moves.filter((m) => m.kind === "team") : []));
const allTeams = ref(false);
const allAppeared = ref(false);
const allGone = ref(false);
const shownTeams = computed(() => (allTeams.value ? teamMoves.value : teamMoves.value.slice(0, SHOWN)));
const shownAppeared = computed(() => (allAppeared.value ? c.value.appeared : c.value.appeared.slice(0, SHOWN)));
const shownGone = computed(() => (allGone.value ? c.value.gone : c.value.gone.slice(0, SHOWN)));
// another pair of records: the long lists fold again
watch(baseAt, () => {
  allTeams.value = allAppeared.value = allGone.value = false;
});

const listedName = (x: Listed): string => (x.kind === "team" ? x.members.map((id) => characterShortName(id) || id).join(" · ") : NAMES.character(x.id));
</script>

<style scoped>
.nm-h2 {
  font-size: 1.05rem;
  font-weight: 700;
}
.nm-intro {
  margin-top: 0.3rem;
  font-size: 0.85rem;
  line-height: 1.5;
  color: oklch(var(--bc) / 0.6);
}
.nm-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin-top: 0.75rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.6rem;
  font-size: 0.84rem;
  line-height: 1.45;
}
.nm-note--info {
  background: oklch(var(--in) / 0.12);
  box-shadow: inset 0 0 0 1px oklch(var(--in) / 0.3);
}
.nm-note--warn {
  background: oklch(var(--wa) / 0.14);
  box-shadow: inset 0 0 0 1px oklch(var(--wa) / 0.4);
}
/* a paragraph with links in it reads as text, not as a row of flex items */
.nm-note[data-test-numbers-app-update],
.nm-note[data-test-numbers-import] {
  display: block;
}
.nm-link {
  color: oklch(var(--p));
  font-weight: 650;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.nm-card {
  margin-top: 0.9rem;
  padding: 0.9rem 1rem;
  border-radius: 0.9rem;
  font-size: 0.88rem;
  line-height: 1.5;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.nm-card p + p {
  margin-top: 0.5rem;
}
.nm-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.nm-muted {
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.6);
}
.nm-range {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.6rem 1.25rem;
  margin-top: 0.9rem;
  font-size: 0.9rem;
}
.nm-range__newest,
.nm-pick {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.nm-range__newest b {
  display: flex;
  align-items: center;
  min-height: 2rem;
}
.nm-pick {
  flex: 1 1 14rem;
  max-width: 22rem;
}
.nm-pick__label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.6);
}
.nm-pick__select {
  width: 100%;
  min-width: 0;
}
.nm-summary {
  margin-top: 0.75rem;
  font-size: 0.9rem;
  font-weight: 650;
}
.nm-h3 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 1.1rem 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 700;
}
.nm-count {
  padding: 0.05rem 0.45rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.65);
  background: oklch(var(--bc) / 0.08);
}
.nm-list {
  display: grid;
  gap: 0.5rem;
}
.nm-chips {
  display: grid;
  gap: 0.35rem;
}
.nm-chip {
  padding: 0.45rem 0.7rem;
  border-radius: 0.6rem;
  font-size: 0.84rem;
  line-height: 1.4;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.nm-more {
  margin-top: 0.5rem;
}
.nm-basis {
  margin-top: 1.25rem;
  font-size: 0.74rem;
  line-height: 1.5;
  color: oklch(var(--bc) / 0.55);
}
@media (max-width: 767px) {
  .nm-card__actions .btn,
  .nm-more,
  .nm-pick__select {
    min-height: 40px;
  }
}
</style>
