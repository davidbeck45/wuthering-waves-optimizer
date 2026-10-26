<template>
  <section class="inv acc-panel" data-test-account-invest>
    <div class="inv__head">
      <h2 class="acc-h2">
        What to invest in next
        <span v-if="items" class="acc-count">{{ items.length }}</span>
      </h2>
      <div class="acc-seg" role="group" aria-label="Rank by">
        <button
          type="button"
          class="acc-seg__btn"
          :class="{ 'acc-seg__btn--on': investBy === 'team' }"
          :aria-pressed="investBy === 'team'"
          title="Rank by the gain on the character's strongest team you can field"
          data-test-account-invest-by="team"
          @click="emit('update:investBy', 'team')">
          Team
        </button>
        <button
          type="button"
          class="acc-seg__btn"
          :class="{ 'acc-seg__btn--on': investBy === 'own' }"
          :aria-pressed="investBy === 'own'"
          title="Rank by the gain on the character's own best rotation"
          data-test-account-invest-by="own"
          @click="emit('update:investBy', 'own')">
          Own DMG
        </button>
      </div>
    </div>
    <p class="inv__sub">
      Engine gains for one more step of each — on the character's best rotation and on their strongest team you can field.
    </p>

    <div v-if="items && items.length" class="inv__kinds" role="group" aria-label="Kind">
      <button
        v-for="k in kinds"
        :key="k.key"
        type="button"
        class="inv-chip"
        :class="{ 'inv-chip--on': kind === k.key }"
        :aria-pressed="kind === k.key"
        :data-test-account-invest-kind="k.key"
        @click="kind = k.key">
        {{ k.label }}<span class="inv-chip__n">{{ k.n }}</span>
      </button>
    </div>

    <div v-if="status.state === 'running'" class="inv__progress" data-test-account-invest-progress>
      <span class="inv__progress-track"><span :style="{ width: `${status.total ? (status.done / status.total) * 100 : 4}%` }"></span></span>
      <span class="inv__progress-text">Scoring {{ status.label }} · {{ status.done }} / {{ status.total }}</span>
    </div>
    <div v-else-if="!rankingReady && !items" class="inv__progress">
      <span class="inv__progress-track"><span style="width: 4%"></span></span>
      <span class="inv__progress-text">Waiting for the roster ranking…</span>
    </div>

    <ol v-if="rows.length" class="inv__list">
      <template v-for="(row, i) in visibleRows" :key="row.item.id">
        <li v-if="row.divider" class="inv__divider" aria-hidden="true">Not in a team you can field · own damage</li>
        <li class="inv-row" :data-test-account-invest-row="row.item.id" :data-kind="row.item.kind">
          <button type="button" class="inv-row__btn" :title="rowTitle(row.item)" @click="emit('open', row.item.characterId)">
            <span class="inv-row__n">{{ i + 1 }}</span>
            <CharacterAvatar :id="row.item.characterId" :size="34" dot title="" />
            <span class="inv-row__body">
              <span class="inv-row__title">
                <span class="inv-row__who">{{ characterShortName(row.item.characterId) }}</span>
                <span class="inv-tag" :class="`inv-tag--${row.item.kind}`">
                  <WeaponIcon v-if="row.item.weaponKey && row.item.kind === 'weapon'" :weapon-key="row.item.weaponKey" :size="16" title="" />
                  <span class="inv-tag__text">{{ tagText(row.item) }}</span>
                </span>
              </span>
              <span class="inv-row__sub">{{ subText(row.item) }}</span>
            </span>
            <span class="inv-row__gain">
              <span class="inv-row__value" :class="row.value >= 0 ? 'acc-gain-up' : 'acc-gain-down'" data-test-account-invest-gain>
                <svg v-if="row.value < 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="size-3" aria-hidden="true"><path d="M12 5v14m-6-6l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
                {{ pct(row.value) }}
              </span>
              <span class="inv-row__scope">{{ row.scope }}</span>
              <span class="inv-row__bar" aria-hidden="true"><span :style="{ width: barWidth(row.value) }"></span></span>
            </span>
          </button>
        </li>
      </template>
    </ol>
    <p v-else-if="items && status.state !== 'running'" class="inv__none" data-test-account-invest-none>
      Nothing left to gain from one more sequence, refinement, owned weapon or substat roll — or nothing could be scored.
    </p>
    <div v-else-if="status.state === 'running'" class="inv__skeleton" aria-hidden="true">
      <span v-for="n in 4" :key="n"></span>
    </div>

    <button v-if="rows.length > limit" type="button" class="inv__more" data-test-account-invest-more @click="expanded = !expanded">
      {{ expanded ? "Show fewer" : `Show all ${rows.length}` }}
    </button>

    <details class="inv__help">
      <summary>How these are scored</summary>
      <ul>
        <li><b>Own</b>: the character's average damage per rotation on the best rotation /my-rankings found for them, with that one thing changed.</li>
        <li><b>Team</b>: their strongest team you can field (all three armed), re-run the way the rankings run it — teammates' buffs from the upgrade count, except for a teammate whose own team-buff panel is already set for this team (the rankings use that panel as you set it, so a buff a new node unlocks counts once you tick it there). Left out, with the reason, when that team runs another saved build of the character.</li>
        <li><b>Weapons</b>: only ones somebody on your account wears, at that copy's refinement (the app has no weapon inventory).</li>
        <li><b>Echo roll</b>: one more expected roll of the substat that pays most — the full table is on the character's Substats tab in Roster rankings.</li>
        <li>A gain is not a price: a sequence is a copy of the character, a refinement a copy of the weapon, a roll some tuners.</li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "What to invest in next" on /account: the investment plan (investPlan.ts) as one ranked list,
// by the team gain (a support's own damage says little) or the character's own. A row opens the character drawer.
import { computed, ref } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WeaponIcon from "../display/WeaponIcon.vue";
import { characterShortName, weaponDisplayName } from "../display/names";
import { parsePresetName } from "../presets/presetName";
import { pct } from "../myRankings/format";
import { INVEST_KIND_LABELS, investChange, sortInvestItems, type InvestItem, type InvestKind } from "./investPlan";
import type { RunStatus } from "./useAccountData";

const props = defineProps<{ items: InvestItem[] | null; status: RunStatus; rankingReady: boolean; owned: string[]; investBy: "own" | "team" }>();
const emit = defineEmits<{ "update:investBy": [value: "own" | "team"]; open: [characterId: string] }>();

const kind = ref<InvestKind | "all">("all");
const expanded = ref(false);
const limit = 8;

const kinds = computed(() => {
  const list = props.items ?? [];
  const count = (k: InvestKind): number => list.filter((i) => i.kind === k).length;
  return [
    { key: "all" as const, label: "All", n: list.length },
    ...(["sequence", "refine", "weapon", "substat"] as InvestKind[]).map((k) => ({ key: k, label: INVEST_KIND_LABELS[k], n: count(k) })).filter((k) => k.n > 0),
  ];
});

interface Row {
  item: InvestItem;
  value: number;
  scope: string;
  /** the first row of the "no team figure" group in team mode */
  divider: boolean;
}

const rows = computed<Row[]>(() => {
  const list = (props.items ?? []).filter((i) => kind.value === "all" || i.kind === kind.value);
  const sorted = sortInvestItems(list, props.investBy);
  let seenNoTeam = false;
  return sorted.map((item) => {
    const byTeam = props.investBy === "team" && item.team;
    const divider = props.investBy === "team" && !item.team && !seenNoTeam && sorted.some((i) => i.team);
    if (props.investBy === "team" && !item.team) seenNoTeam = true;
    return { item, value: byTeam ? item.team!.gain : item.gain, scope: byTeam ? "team" : "own", divider };
  });
});
const visibleRows = computed(() => (expanded.value ? rows.value : rows.value.slice(0, limit)));
const maxValue = computed(() => Math.max(0.0001, ...rows.value.map((r) => r.value)));
const barWidth = (v: number): string => `${v > 0 ? Math.max(2, (v / maxValue.value) * 100) : 0}%`;

function tagText(item: InvestItem): string {
  if (item.kind === "sequence") return `Sequence ${item.to.replace("S", "")}`;
  if (item.kind === "refine") return `${weaponDisplayName(item.weaponKey)} ${item.label}`;
  if (item.kind === "weapon") return item.label;
  return `${item.label.replace(/ [+].*$/, "")} roll`;
}
function subText(item: InvestItem): string {
  const other =
    props.investBy === "team" && item.team ? `own ${pct(item.gain)}` : item.team ? `team ${pct(item.team.gain)}` : props.investBy === "own" ? "no team figure" : "";
  const what =
    item.kind === "weapon"
      ? `from ${item.from} · worn by ${(item.wornBy ?? []).map((k) => characterShortName(k)).join(", ")}`
      : item.kind === "substat"
        ? `${item.label.replace(/^.* (?=[+])/, "")} on an echo`
        : item.kind === "refine"
          ? `${/R\d$/.exec(item.from)?.[0] ?? item.from} → ${item.label}` // the tag already names the weapon
          : `${item.from} → ${item.to}`;
  return [what, other].filter(Boolean).join(" · ");
}
function rowTitle(item: InvestItem): string {
  const lines = [`${characterShortName(item.characterId)} — ${INVEST_KIND_LABELS[item.kind]}: ${investChange(item)}`, `Own, on "${parsePresetName(item.rotation, { owned: props.owned }).title}": ${pct(item.gain)}`];
  if (item.team) lines.push(`Team "${parsePresetName(item.team.teamName, { owned: props.owned }).title}": ${pct(item.team.gain)}`);
  else if (item.teamNote) lines.push(`No team figure: ${item.teamNote}`);
  return lines.join("\n");
}
</script>

<style scoped>
.inv {
  padding: 0.9rem 0.9rem 0.75rem;
}
.inv__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.inv__sub {
  margin-top: 0.3rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.55);
}
.inv__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.65rem;
}
.inv-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.65);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.12);
}
.inv-chip:hover {
  color: oklch(var(--bc));
}
.inv-chip--on {
  color: oklch(var(--pc));
  background: oklch(var(--p));
  box-shadow: none;
}
.inv-chip__n {
  font-size: 0.62rem;
  opacity: 0.7;
}
.inv__progress {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.7rem;
}
.inv__progress-track {
  display: block;
  height: 0.2rem;
  border-radius: 9999px;
  background: oklch(var(--in) / 0.15);
  overflow: hidden;
}
.inv__progress-track > span {
  display: block;
  height: 100%;
  background: oklch(var(--in));
  transition: width 0.2s ease;
}
.inv__progress-text {
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.55);
}
.inv__list {
  display: flex;
  flex-direction: column;
  margin: 0.5rem -0.4rem 0;
}
.inv__divider {
  margin: 0.5rem 0.4rem 0.2rem;
  padding-top: 0.5rem;
  border-top: 1px dashed oklch(var(--bc) / 0.15);
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.45);
}
.inv-row__btn {
  display: grid;
  grid-template-columns: 1.1rem auto minmax(0, 1fr) 5.2rem;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.4rem 0.4rem;
  border-radius: 0.6rem;
  text-align: left;
  color: inherit;
}
.inv-row__btn:hover,
.inv-row__btn:focus-visible {
  outline: none;
  background: oklch(var(--bc) / 0.06);
}
.inv-row__n {
  font-size: 0.68rem;
  font-weight: 700;
  text-align: right;
  color: oklch(var(--bc) / 0.4);
}
.inv-row__body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.inv-row__title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.inv-row__who {
  font-size: 0.85rem;
  font-weight: 650;
  white-space: nowrap;
}
.inv-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  padding: 0 0.4rem;
  border-radius: 0.35rem;
  font-size: 0.68rem;
  font-weight: 650;
  line-height: 1.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: oklch(var(--bc) / 0.85);
  background: oklch(var(--bc) / 0.08);
}
.inv-tag__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inv-tag--sequence {
  background: rgb(232 180 76 / 0.18);
}
.inv-tag--refine,
.inv-tag--weapon {
  background: oklch(var(--p) / 0.14);
}
.inv-tag--substat {
  background: oklch(var(--in) / 0.14);
}
.inv-row__sub {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inv-row__gain {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  column-gap: 0.25rem;
  row-gap: 0.2rem;
}
.inv-row__value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.1rem;
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.inv-row__scope {
  font-size: 0.6rem;
  color: oklch(var(--bc) / 0.45);
}
.inv-row__bar {
  grid-column: 1 / -1;
  display: block;
  height: 0.22rem;
  border-radius: 9999px;
  background: oklch(var(--p) / 0.14);
  overflow: hidden;
}
.inv-row__bar > span {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p));
}
.inv__none {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.6);
}
.inv__skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.inv__skeleton > span {
  height: 2.2rem;
  border-radius: 0.5rem;
  background: linear-gradient(90deg, oklch(var(--bc) / 0.05), oklch(var(--bc) / 0.1), oklch(var(--bc) / 0.05));
  background-size: 200% 100%;
  animation: inv-shimmer 1.2s linear infinite;
}
@keyframes inv-shimmer {
  to {
    background-position: -200% 0;
  }
}
.inv__more {
  display: block;
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.35rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--p));
}
.inv__more:hover {
  background: oklch(var(--bc) / 0.05);
}
.inv__help {
  margin-top: 0.5rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.6);
}
.inv__help summary {
  cursor: pointer;
  font-weight: 600;
  color: oklch(var(--bc) / 0.55);
}
.inv__help ul {
  margin-top: 0.4rem;
  padding-left: 1rem;
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.inv__help b {
  color: oklch(var(--bc) / 0.8);
}
@media (max-width: 767px) {
  .inv {
    padding: 0.75rem 0.7rem 0.6rem;
  }
  .inv-row__btn {
    grid-template-columns: auto minmax(0, 1fr) 4.4rem;
    gap: 0.45rem;
  }
  .inv-row__n {
    display: none;
  }
  .inv-row__who {
    font-size: 0.8rem;
  }
  .inv-row__value {
    font-size: 0.78rem;
  }
}
</style>
