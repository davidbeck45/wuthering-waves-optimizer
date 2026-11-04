<template>
  <section class="own" data-test-account-own :data-state="status.state">
    <div class="own__head">
      <h3 class="own__h3">
        With what you own
        <span v-if="countable" class="acc-count" data-test-account-own-count>{{ countable }}</span>
      </h3>
      <!-- one button for both, never v-if / v-else: swapping the element would drop a keyboard user's focus to the page, as it starts and again as it ends -->
      <button
        type="button"
        class="btn btn-sm own__check"
        :class="{ 'btn-primary': !running }"
        :disabled="!running && !rankingReady"
        :title="running ? undefined : rankingReady ? 'Re-gear each character from your inventory with Build my team\'s engine. Nothing is saved.' : 'Waiting for the roster ranking'"
        v-bind="running ? { 'data-test-account-own-cancel': '' } : { 'data-test-account-own-check': '' }"
        @click="running ? emit('cancel') : emit('check')">
        <svg v-if="!running" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z" stroke-linecap="round" /></svg>
        {{ running ? "Cancel" : status.state === "done" && !status.cancelled ? "Check again" : "Check my echoes" }}
      </button>
    </div>
    <p class="own__sub">
      Free today: better echoes already in your inventory, the Tuners you have, the Energy Regen your teams are short of.
      Each button opens the page that does it; nothing changes until you save there.
    </p>

    <div v-if="status.state === 'running'" class="own__progress" aria-live="polite" data-test-account-own-progress>
      <span class="own__track"><span :style="{ width: `${status.total ? Math.max(4, (status.done / status.total) * 100) : 4}%` }"></span></span>
      <span class="own__progress-text"><template v-if="status.label">Checking {{ status.label }}'s echoes · {{ status.done }} / {{ status.total || "…" }} characters</template><template v-else>Getting the check ready (your teams and the plans)…</template><template v-if="tunerRunning"> · Tuner plan</template></span>
    </div>
    <p v-else-if="status.state === 'idle'" class="own__hint" data-test-account-own-idle>
      <b>Check my echoes</b> re-gears each character on their own from the echoes you have, with Build my team's engine
      (about a second each; you can cancel).<template v-if="!rankingReady"> It turns on once your roster is scored.</template>
    </p>
    <p v-else-if="status.state === 'error'" class="own__hint own__hint--bad" role="alert">The check stopped: {{ status.error }}</p>
    <p v-else-if="summary" class="own__hint" data-test-account-own-summary>{{ summary }}</p>

    <ol v-if="views.length" class="own__list">
      <template v-for="(v, i) in shownViews" :key="v.row.id">
        <li v-if="v.divider" class="own__divider" aria-hidden="true">{{ investBy === "team" ? "No team figure · reason on each row" : "No damage figure" }}</li>
        <li class="own-row" :data-test-account-own-row="v.row.id" :data-kind="v.row.kind" :data-own="v.row.own ?? undefined" :data-team="v.row.team?.gain ?? undefined">
          <component
            :is="v.row.characterId ? 'button' : 'div'"
            :type="v.row.characterId ? 'button' : undefined"
            class="own-row__main"
            :class="{ 'own-row__main--btn': !!v.row.characterId }"
            :title="v.row.characterId ? `${characterShortName(v.row.characterId)}: open the details` : undefined"
            @click="v.row.characterId && emit('open', v.row.characterId)">
            <span class="own-row__n" aria-hidden="true">{{ i + 1 }}</span>
            <span class="own-row__av">
              <CharacterAvatar v-if="v.row.characterId" :id="v.row.characterId" :size="34" dot title="" />
              <span v-else class="own-row__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1m-8.6 8.6l-2.1 2.1" stroke-linecap="round" /><circle cx="12" cy="12" r="3" /></svg>
              </span>
            </span>
            <span class="own-row__top">
              <span v-if="v.row.characterId" class="own-row__who">{{ characterShortName(v.row.characterId) }}</span>
              <span class="own-tag" :class="`own-tag--${v.row.kind}`">{{ OWN_KIND_LABELS[v.row.kind] }}</span>
            </span>
            <span v-if="v.value != null || v.row.figure" class="own-row__gain">
              <template v-if="v.value != null">
                <span class="own-row__value" :class="v.value >= 0 ? 'acc-gain-up' : 'acc-gain-down'" data-test-account-own-gain>{{ pct(v.value) }}</span>
                <span class="own-row__scope">{{ v.scope === "team" ? "team" : v.row.ownLabel || "own" }}</span>
              </template>
              <template v-else-if="v.row.figure">
                <span class="own-row__value own-row__value--warn" data-test-account-own-figure>{{ v.row.figure.text }}</span>
                <span class="own-row__scope">{{ v.row.figure.caption }}</span>
              </template>
            </span>
            <span class="own-row__body">
              <span class="own-row__title">{{ v.row.title }}</span>
              <span class="own-row__todo">{{ v.row.todo }}</span>
              <span v-if="otherLine(v)" class="own-row__other">{{ otherLine(v) }}</span>
              <span v-if="v.row.note" class="own-row__note">{{ v.row.note }}</span>
            </span>
          </component>
          <RouterLink :to="v.row.link.to" class="btn btn-outline btn-xs own-row__go" :data-test-account-own-go="v.row.id">
            {{ v.row.link.label }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5" aria-hidden="true"><path d="M5 12h14m-5-5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </RouterLink>
        </li>
      </template>
    </ol>
    <p v-if="energyBusy && !views.some((v) => v.row.kind === 'energy')" class="own__hint own__hint--small">Measuring your teams' Energy Regen needs…</p>

    <button v-if="views.length > limit" type="button" class="own__more" :aria-expanded="expanded" data-test-account-own-more @click="expanded = !expanded">
      {{ expanded ? "Show fewer" : `Show all ${views.length}` }}
    </button>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /account "With what you own": the free upgrades (ownUpgrades.ts) at the top of "What to invest
// in next". "Check my echoes" runs the echo check (useOwnUpgrades.ts); every row says what to do in plain words and
// has a button to the page that does it; the character's part opens the drawer.
import { computed, ref } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterShortName } from "../display/names";
import { pct } from "../myRankings/format";
import type { EchoCheck } from "./echoCheck";
import { OWN_KIND_LABELS, sortOwnRows, type OwnRow, type OwnRowView } from "./ownUpgrades";
import type { EchoCheckStatus } from "./useOwnUpgrades";

const props = defineProps<{
  rows: OwnRow[];
  status: EchoCheckStatus;
  check: EchoCheck | null;
  rankingReady: boolean;
  investBy: "own" | "team";
  energyBusy?: boolean;
  tunerRunning?: boolean;
}>();
const emit = defineEmits<{ check: []; cancel: []; open: [characterId: string] }>();

const expanded = ref(false);
const limit = 4;
const running = computed(() => props.status.state === "running");
const views = computed(() => sortOwnRows(props.rows, props.investBy));
const shownViews = computed(() => (expanded.value ? views.value : views.value.slice(0, limit)));
/** rows that are an upgrade to make (not the "enter your Tuners" kind of row) */
const countable = computed(() => props.rows.filter((r) => r.characterId).length);

/** the figure the gain column doesn't show: the own gain in team mode, the team gain (or why not) in own mode */
function otherLine(v: OwnRowView): string {
  const r = v.row;
  const parts: string[] = [];
  if (v.scope === "team" && r.own != null) parts.push(`${r.ownLabel === "expected own" ? "Expected own" : "Own"} ${pct(r.own)}`);
  if (v.scope !== "team" && r.team) parts.push(`Team ${pct(r.team.gain)}`);
  if (r.ownDetail && r.own != null) parts.push(r.ownDetail);
  if (!r.team && r.teamNote && r.characterId) parts.push(`No team figure: ${r.teamNote}`);
  return parts.join(" · ");
}

const summary = computed((): string => {
  const c = props.check;
  if (!c) return "";
  const better = c.items.length;
  if (props.status.cancelled) return `Stopped after ${c.done} of ${c.total} characters · ${better ? `${better} with better echoes so far` : "nothing found so far"} · stopped early, not kept.`;
  const parts = [`Checked ${c.done} of ${c.total}`, better ? `${better} can wear better echoes` : "nobody can wear better echoes from your inventory"];
  if (c.best.length) parts.push(`${c.best.length} already wear the best`);
  if (c.skipped.length) parts.push(`${c.skipped.length} couldn't be built (their details say why)`);
  // an engine error (a character's run, or the team it is scored on): counted here, never silently dropped
  if (c.errors.length) parts.push(`${c.errors.length} engine ${c.errors.length === 1 ? "error" : "errors"} (a character or team it couldn't score)`);
  const when = c.computedAt ? new Date(c.computedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const tail = props.status.restored ? ` · checked at ${when}, kept for this tab` : "";
  return `${parts.join(" · ")}${tail}.`;
});
</script>

<style scoped>
.own {
  margin-top: 0.75rem;
  padding: 0.7rem 0.75rem 0.6rem;
  border-radius: 0.8rem;
  background: oklch(var(--su) / 0.06);
  box-shadow: inset 0 0 0 1px oklch(var(--su) / 0.2);
}
.own__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.6rem;
}
.own__h3 {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.95rem;
  font-weight: 700;
}
.own__check {
  min-height: 2.25rem;
  gap: 0.35rem;
}
/* small text at 80 % of the base colour: AA (≥ 4.5:1) on the tinted box in light and dark themes (72 % measured
   4.1–4.4:1 on dark) */
.own__sub {
  margin-top: 0.25rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.8);
}
.own__hint {
  margin-top: 0.5rem;
  font-size: 0.74rem;
  color: oklch(var(--bc) / 0.8);
}
.own__hint--small {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.8);
}
.own__hint--bad {
  color: oklch(var(--er));
}
.own__progress {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.6rem;
}
.own__track {
  display: block;
  height: 0.25rem;
  border-radius: 9999px;
  background: oklch(var(--in) / 0.15);
  overflow: hidden;
}
.own__track > span {
  display: block;
  height: 100%;
  background: oklch(var(--in));
  transition: width 0.2s ease;
}
.own__progress-text {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.8);
}
.own__list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin: 0.5rem -0.35rem 0;
}
.own__divider {
  margin: 0.45rem 0.35rem 0.15rem;
  padding-top: 0.45rem;
  border-top: 1px dashed oklch(var(--bc) / 0.15);
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.8);
}
.own-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0.35rem 0.35rem 0.45rem;
  border-radius: 0.6rem;
}
.own-row + .own-row {
  border-top: 1px solid oklch(var(--bc) / 0.06);
}
/* number · portrait · name and kind · figure on the first line; the words under them use the figure's width too */
.own-row__main {
  display: grid;
  grid-template-columns: 1.1rem auto minmax(0, 1fr) auto;
  grid-template-areas:
    "n av top gain"
    "n av body body";
  align-items: start;
  gap: 0.1rem 0.55rem;
  width: 100%;
  text-align: left;
  color: inherit;
  border-radius: 0.5rem;
}
.own-row__av {
  grid-area: av;
  display: flex;
}
.own-row__top {
  grid-area: top;
  align-self: center;
}
.own-row__main--btn:hover {
  background: oklch(var(--bc) / 0.05);
}
.own-row__main--btn:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
  background: oklch(var(--bc) / 0.05);
}
.own-row__n {
  grid-area: n;
  padding-top: 0.55rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-align: right;
  color: oklch(var(--bc) / 0.75);
}
.own-row__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  color: oklch(var(--bc) / 0.6);
  background: oklch(var(--bc) / 0.08);
}
.own-row__body {
  grid-area: body;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}
.own-row__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.own-row__who {
  font-size: 0.85rem;
  font-weight: 650;
}
.own-tag {
  padding: 0 0.4rem;
  border-radius: 0.35rem;
  font-size: 0.66rem;
  font-weight: 650;
  line-height: 1.2rem;
  color: oklch(var(--bc) / 0.92);
  background: oklch(var(--bc) / 0.08);
}
.own-tag--echoes {
  background: oklch(var(--su) / 0.16);
}
.own-tag--tuner {
  background: oklch(var(--in) / 0.14);
}
.own-tag--energy {
  background: oklch(var(--wa) / 0.18);
}
.own-row__title {
  font-size: 0.8rem;
  font-weight: 650;
}
.own-row__todo {
  font-size: 0.74rem;
  line-height: 1.35;
  color: oklch(var(--bc) / 0.85);
}
.own-row__other,
.own-row__note {
  font-size: 0.68rem;
  line-height: 1.35;
  color: oklch(var(--bc) / 0.8);
}
.own-row__gain {
  grid-area: gain;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-top: 0.15rem;
  min-width: 3.6rem;
}
.own-row__value {
  font-size: 0.88rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.own-row__value--warn {
  color: oklch(var(--wa));
}
html[data-theme-style="light"] .own-row__value--warn {
  color: color-mix(in oklch, oklch(var(--wa)) 55%, black);
}
.own-row__scope {
  font-size: 0.6rem;
  text-align: right;
  color: oklch(var(--bc) / 0.8);
}
.own-row__go {
  align-self: flex-end;
  min-height: 2rem;
  height: auto;
  gap: 0.3rem;
  font-weight: 600;
}
.own__more {
  display: block;
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.45rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--p));
}
.own__more:hover {
  background: oklch(var(--bc) / 0.05);
}
@media (max-width: 767px) {
  .own {
    padding: 0.6rem 0.55rem 0.5rem;
  }
  .own-row__main {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "av top gain"
      "av body body";
    column-gap: 0.45rem;
  }
  .own-row__n {
    display: none;
  }
  .own-row__go {
    min-height: 2.5rem;
    padding-left: 0.9rem;
    padding-right: 0.9rem;
  }
}
</style>
