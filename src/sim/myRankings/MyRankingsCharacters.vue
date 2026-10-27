<template>
  <table class="table table--cards mr-chars" data-test-my-rankings-characters>
    <colgroup>
      <col class="mr-col-rank" />
      <col class="mr-col-who" />
      <col class="mr-col-weapon" />
      <col />
      <col class="mr-col-dmg" />
      <col v-if="investment" class="mr-col-up" />
      <col class="mr-col-chev" />
    </colgroup>
    <thead>
      <tr>
        <th class="text-center">#</th>
        <th :aria-sort="ariaSort('name')">
          <button type="button" class="mr-sort" :class="{ 'mr-sort--on': sort.key === 'name' }" data-test-my-rankings-sort="name" @click="setSort('name')">
            Character <span class="mr-sort__arrow" aria-hidden="true">{{ arrow("name") }}</span>
          </button>
        </th>
        <th>Weapon</th>
        <th>Best rotation</th>
        <th class="text-right" :aria-sort="ariaSort('damage')">
          <button type="button" class="mr-sort mr-sort--right" :class="{ 'mr-sort--on': sort.key === 'damage' }" data-test-my-rankings-sort="damage" title="average damage of the best rotation, per rotation" @click="setSort('damage')">
            Avg DMG / rotation <span class="mr-sort__arrow" aria-hidden="true">{{ arrow("damage") }}</span>
          </button>
        </th>
        <th v-if="investment" class="text-right" :aria-sort="ariaSort('upgrade')">
          <button type="button" class="mr-sort mr-sort--right" :class="{ 'mr-sort--on': sort.key === 'upgrade' }" data-test-my-rankings-sort="upgrade" title="the larger of two estimates on the best rotation: the next sequence node, or the weapon at R5" @click="setSort('upgrade')">
            Best upgrade <span class="mr-sort__arrow" aria-hidden="true">{{ arrow("upgrade") }}</span>
          </button>
        </th>
        <th><span class="sr-only">Details</span></th>
      </tr>
    </thead>
    <tbody>
      <template v-for="c in sorted" :key="c.id">
        <tr class="mr-row" :class="{ 'mr-row--open': !!open[c.id] }" :data-test-my-rankings-row="c.id" @click="onRowClick($event, c)">
          <td class="cell--rank">
            <span class="mr-rank" :class="{ 'mr-rank--top': damageRank(c) <= 3 }">{{ damageRank(c) }}</span>
          </td>
          <td class="cell--who">
            <div class="mr-who">
              <CharacterAvatar :id="c.id" :size="40" dot />
              <div class="min-w-0">
                <div class="mr-who__name" :title="c.name"><span class="max-md:hidden">{{ c.name }}</span><span class="md:hidden">{{ characterShortName(c.id) || c.name }}</span></div>
                <div class="mr-who__pills">
                  <span class="mr-pill" :class="{ 'mr-pill--max': c.sequence >= 6 }" :title="`Sequence ${c.sequence}`">S{{ c.sequence }}</span>
                  <span class="mr-pill" :class="{ 'mr-pill--max': c.refinement >= 5 }" :title="`Weapon refinement ${c.refinement}`">R{{ c.refinement }}</span>
                </div>
              </div>
            </div>
          </td>
          <td class="cell--weapon" data-label="Weapon">
            <div class="mr-weapon">
              <WeaponIcon :weapon-key="c.weapon" :size="30" />
              <span class="mr-weapon__name" :title="weaponDisplayName(c.weapon)">{{ weaponDisplayName(c.weapon) || "—" }}</span>
            </div>
          </td>
          <td class="cell--best">
            <PresetNameLabel
              v-if="c.best"
              :name="c.best.name"
              :source="c.best.source"
              :owned="owned"
              hide-main
              :note="`${c.rotationsEvaluated} rotation${c.rotationsEvaluated === 1 ? '' : 's'} tried on this build`" />
            <span v-else class="text-sm opacity-60">no rotation with actions</span>
          </td>
          <td class="cell--dmg">
            <div class="mr-dmg">
              <span class="mr-dmg__value" data-test-my-rankings-damage>{{ c.best ? fmt(c.best.avgDamage) : "—" }}</span>
              <span class="mr-bar" aria-hidden="true"><span :style="{ width: barWidth(c) }"></span></span>
            </div>
          </td>
          <td v-if="investment" class="cell--upgrade" :data-test-my-rankings-upgrade="c.id">
            <div v-if="upgrades.get(c.id)?.best" class="mr-up" :title="upgradeTitle(c, upgrades.get(c.id)!)">
              <div class="mr-up__main">
                <span class="mr-up__tag">{{ upgrades.get(c.id)!.best!.label }}</span>
                <span class="mr-up__gain" :class="gainClass(upgrades.get(c.id)!.best!.gain)">{{ pct(upgrades.get(c.id)!.best!.gain) }}</span>
              </div>
              <div v-if="upgrades.get(c.id)?.other" class="mr-up__other">{{ upgrades.get(c.id)!.other!.label }} {{ pct(upgrades.get(c.id)!.other!.gain) }}</div>
            </div>
            <span v-else-if="upgrades.get(c.id)?.maxed" class="mr-maxed" title="Maxed: S6 with the weapon at R5 — nothing left to unlock" data-test-my-rankings-maxed>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5" aria-hidden="true"><path d="M12 2.5l2.4 2 3.1-.3.9 3 2.6 1.8-1.2 2.9 1.2 2.9-2.6 1.8-.9 3-3.1-.3-2.4 2-2.4-2-3.1.3-.9-3L3 14.8l1.2-2.9L3 9l2.6-1.8.9-3 3.1.3z" /><path d="M8.5 12.2l2.4 2.3 4.6-4.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
              <span class="sr-only">maxed</span>
            </span>
            <span v-else class="opacity-40">—</span>
          </td>
          <td class="cell--chev">
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-square mr-chev"
              :aria-expanded="!!open[c.id]"
              :aria-label="`${open[c.id] ? 'Hide' : 'Show'} details for ${c.name}`"
              :data-test-my-rankings-expand="c.id"
              @click.stop="toggle(c)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </td>
        </tr>
        <tr v-if="open[c.id]" class="row--panel" :data-test-my-rankings-details="c.id">
          <td :colspan="colspan" class="cell--panel">
            <div class="mr-panel">
              <div class="mr-tabs" role="tablist" :aria-label="`${c.name} details`">
                <button
                  type="button"
                  role="tab"
                  class="mr-tab"
                  :class="{ 'mr-tab--on': open[c.id] === 'whatif' }"
                  :aria-selected="open[c.id] === 'whatif'"
                  :disabled="!c.bestRotation"
                  :data-test-my-rankings-whatif="c.id"
                  title="score this character at another sequence, weapon or refinement on the same rotation"
                  @click="select(c, 'whatif')">
                  What if
                </button>
                <button
                  type="button"
                  role="tab"
                  class="mr-tab"
                  :class="{ 'mr-tab--on': open[c.id] === 'substats' }"
                  :aria-selected="open[c.id] === 'substats'"
                  :disabled="!c.bestRotation"
                  :data-test-my-rankings-substats="c.id"
                  title="what one more roll of each substat is worth on this build, on the same rotation — what to look for as you roll echoes"
                  @click="select(c, 'substats')">
                  Substats
                </button>
                <button
                  type="button"
                  role="tab"
                  class="mr-tab"
                  :class="{ 'mr-tab--on': open[c.id] === 'rotations' }"
                  :aria-selected="open[c.id] === 'rotations'"
                  :data-test-my-rankings-rotations="c.id"
                  @click="select(c, 'rotations')">
                  Rotations <span class="mr-tab__count">{{ c.rotationsEvaluated }}</span>
                </button>
                <RouterLink
                  :to="{ path: '/rankings', hash: rankingsMineHash([c.id]) }"
                  class="mr-tab mr-tab--link"
                  title="wuwa_calc's teams with this character, at your account's sequences and weapons"
                  :data-test-my-rankings-mine-link="c.id">
                  Rankings
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </RouterLink>
                <RouterLink
                  :to="{ path: '/weapons', query: { focus: c.id } }"
                  class="mr-tab mr-tab--link"
                  title="what their signature, each refinement and the other weapons are worth on this build and their team"
                  :data-test-my-rankings-weapons-link="c.id">
                  Weapons
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </RouterLink>
              </div>
              <div class="mr-panel__body" role="tabpanel">
                <MyRankingsWhatIf v-if="open[c.id] === 'whatif'" :rank="c" />
                <MyRankingsSubstats v-else-if="open[c.id] === 'substats'" :rank="c" />
                <MyRankingsRotations v-else :rank="c" :owned="owned" />
              </div>
            </div>
          </td>
        </tr>
      </template>
      <tr v-for="n in pending" :key="`skeleton-${n}`" class="mr-row mr-row--skeleton" aria-hidden="true" data-test-my-rankings-skeleton>
        <td class="cell--rank"><span class="skeleton mr-sk mr-sk--rank"></span></td>
        <td class="cell--who">
          <div class="mr-who">
            <span class="skeleton mr-sk mr-sk--avatar"></span>
            <div class="grid gap-1.5"><span class="skeleton mr-sk" style="width: 6.5rem"></span><span class="skeleton mr-sk mr-sk--thin" style="width: 3.5rem"></span></div>
          </div>
        </td>
        <td class="cell--weapon">
          <div class="mr-weapon"><span class="skeleton mr-sk mr-sk--icon"></span><span class="skeleton mr-sk" style="width: 6rem"></span></div>
        </td>
        <td class="cell--best">
          <div class="grid gap-1.5"><span class="skeleton mr-sk" :style="{ width: `${9 + ((n * 3) % 5)}rem` }"></span><span class="skeleton mr-sk mr-sk--thin" style="width: 5rem"></span></div>
        </td>
        <td class="cell--dmg">
          <div class="mr-dmg"><span class="skeleton mr-sk" style="width: 5.5rem; margin-left: auto"></span><span class="skeleton mr-sk mr-sk--thin" style="width: 100%"></span></div>
        </td>
        <td v-if="investment" class="cell--upgrade"><span class="skeleton mr-sk" style="width: 3.5rem; margin-left: auto"></span></td>
        <td class="cell--chev"></td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the /my-rankings characters table: ~56 px rows (portrait with element dot, S/R pills,
// weapon art, the best rotation as title + chips, damage with a bar, one "best upgrade"), sortable columns,
// a row opens into tabs (What if · Substats · Rotations · Rankings ▸), skeleton rows while scoring.
import { computed, nextTick, ref, watch } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WeaponIcon from "../display/WeaponIcon.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import MyRankingsWhatIf from "./MyRankingsWhatIf.vue";
import MyRankingsSubstats from "./MyRankingsSubstats.vue";
import MyRankingsRotations from "./MyRankingsRotations.vue";
import { characterShortName, weaponDisplayName } from "../display/names";
import { rankingsMineHash } from "../account/accountState";
import { damageRanks, DEFAULT_DIR, sortCharacters, upgradeOf, type SortDir, type SortKey, type UpgradeView } from "./rows";
import type { CharacterRank } from "./rankRoster";
import { fmt, gainClass, pct } from "./format";

type Tab = "whatif" | "substats" | "rotations";

const props = withDefaults(
  defineProps<{
    ranks: CharacterRank[];
    sort: { key: SortKey; dir: SortDir };
    investment: boolean;
    /** skeleton rows to draw below the scored ones */
    pending?: number;
    owned?: string[];
    /** open this row on this tab once it is scored, and scroll to it (/account's "Substats & what-if" link) */
    focus?: { id: string; tab: Tab } | null;
  }>(),
  { pending: 0, owned: () => [], focus: null },
);
const emit = defineEmits<{ "update:sort": [value: { key: SortKey; dir: SortDir }] }>();

const sorted = computed(() => sortCharacters(props.ranks, props.sort.key, props.sort.dir));
const rankById = computed(() => damageRanks(props.ranks));
const damageRank = (c: CharacterRank): number => rankById.value.get(c.id) ?? 0;
const maxDamage = computed(() => Math.max(0, ...props.ranks.map((c) => c.best?.avgDamage ?? 0)));
const barWidth = (c: CharacterRank): string => `${maxDamage.value > 0 ? Math.max(1.5, ((c.best?.avgDamage ?? 0) / maxDamage.value) * 100) : 0}%`;
const colspan = computed(() => (props.investment ? 7 : 6));
const upgrades = computed(() => new Map(props.ranks.map((c) => [c.id, upgradeOf(c)])));

function setSort(key: SortKey): void {
  const dir: SortDir = props.sort.key === key ? (props.sort.dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[key];
  emit("update:sort", { key, dir });
}
const arrow = (key: SortKey): string => (props.sort.key === key ? (props.sort.dir === "asc" ? "▲" : "▼") : "↕");
const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => (props.sort.key === key ? (props.sort.dir === "asc" ? "ascending" : "descending") : "none");

function upgradeTitle(c: CharacterRank, u: UpgradeView): string {
  const line = (x: NonNullable<UpgradeView["best"]>): string =>
    `${x.kind === "sequence" ? `Next sequence (${x.label})` : "Weapon at R5"}: ${fmt(x.avgDamage)} (${pct(x.gain)})`;
  return [`Estimates on ${c.name}'s best rotation:`, u.best ? line(u.best) : "", u.other ? line(u.other) : ""].filter(Boolean).join("\n");
}

// ---- expanded rows: id → the tab it shows
const open = ref<Record<string, Tab | undefined>>({});
function toggle(c: CharacterRank): void {
  open.value = { ...open.value, [c.id]: open.value[c.id] ? undefined : c.bestRotation ? "whatif" : "rotations" };
}
function select(c: CharacterRank, tab: Tab): void {
  open.value = { ...open.value, [c.id]: tab };
}
// a deep link opens its row once, the first time that character's rank is on the page, and scrolls to it once every
// character is in: during a progressive run rows scored later sort in above it (ids are scored A–Z, shown by damage)
let focused: string | null = null;
let scrolled: string | null = null;
watch(
  () => [props.focus?.id, props.focus?.tab, props.ranks.length, props.pending] as const,
  async () => {
    const f = props.focus;
    if (!f) return;
    const key = `${f.id}:${f.tab}`;
    const c = props.ranks.find((r) => r.id === f.id);
    if (!c) return;
    if (focused !== key) {
      focused = key;
      select(c, f.tab === "substats" && !c.bestRotation ? "rotations" : f.tab);
    }
    if (props.pending > 0 || scrolled === key) return;
    scrolled = key;
    await nextTick();
    const row = document.querySelector(`[data-test-my-rankings-row="${CSS.escape(f.id)}"]`);
    // below the app's fixed 80 px navbar (AppLayout's #navbar-container), not under it
    if (row) window.scrollTo({ top: Math.max(0, row.getBoundingClientRect().top + window.scrollY - 96), behavior: "smooth" });
  },
  { immediate: true },
);
function onRowClick(event: MouseEvent, c: CharacterRank): void {
  const target = event.target as Element | null;
  if (target?.closest("a, button, input, select, label, summary")) return;
  if (window.getSelection?.()?.toString()) return; // selecting a number to copy it
  toggle(c);
}
</script>

<style scoped lang="scss">
.mr-chars {
  table-layout: fixed;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}
.mr-col-rank {
  width: 3rem;
}
.mr-col-who {
  width: 15rem;
}
.mr-col-weapon {
  width: 13rem;
}
.mr-col-dmg {
  width: 11.5rem;
}
.mr-col-up {
  width: 8.5rem;
}
.mr-col-chev {
  width: 3rem;
}
/* narrower desktops: the rotation column keeps ~15 rem; below 1024 px the weapon is its art alone (name in the tooltip) */
@media (max-width: 1279px) {
  .mr-col-who {
    width: 12rem;
  }
  .mr-col-weapon {
    width: 10.5rem;
  }
  .mr-col-dmg {
    width: 9.5rem;
  }
  .mr-col-up {
    width: 7.5rem;
  }
}
@media (min-width: 768px) and (max-width: 1023px) {
  .mr-col-rank,
  .mr-col-chev {
    width: 2.5rem;
  }
  .mr-col-who {
    width: 11rem;
  }
  .mr-col-weapon {
    width: 3.4rem;
  }
  .mr-col-dmg {
    width: 8.5rem;
  }
  .mr-col-up {
    width: 7rem;
  }
  .mr-weapon__name {
    display: none;
  }
}
.mr-chars thead th {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.55);
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid oklch(var(--bc) / 0.1);
}
.mr-sort {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  text-transform: inherit;
  letter-spacing: inherit;
  font-weight: inherit;
  &:hover {
    color: oklch(var(--bc));
  }
}
.mr-sort--right {
  justify-content: flex-end;
}
.mr-sort--on {
  color: oklch(var(--bc) / 0.9);
}
.mr-sort__arrow {
  font-size: 0.6rem;
  opacity: 0.7;
}
.mr-row > td {
  padding: 0.5rem 0.6rem;
  vertical-align: middle;
  border-bottom: 1px solid oklch(var(--bc) / 0.06);
}
.mr-row:not(.mr-row--skeleton) {
  cursor: pointer;
  &:hover > td {
    background: oklch(var(--bc) / 0.035);
  }
}
.mr-row--open > td {
  background: oklch(var(--bc) / 0.05);
  border-bottom-color: transparent;
}
.mr-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.45rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.55);
}
.mr-rank--top {
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
}
.cell--rank {
  text-align: center;
}
.mr-who {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
}
.mr-who__name {
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}
.mr-who__pills {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.2rem;
}
.mr-pill {
  display: inline-flex;
  align-items: center;
  height: 1.05rem;
  padding: 0 0.3rem;
  border-radius: 0.3rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.7);
  background: oklch(var(--bc) / 0.08);
}
.mr-pill--max {
  color: #b7861c;
  background: rgb(232 180 76 / 0.16);
}
:root[data-theme-style="dark"] .mr-pill--max {
  color: #f0c46a;
}
.mr-weapon {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.mr-weapon__name {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell--best {
  font-size: 0.85rem;
}
.mr-dmg {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
}
.mr-dmg__value {
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.92rem;
}
.mr-bar {
  display: block;
  height: 0.3rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.08);
  overflow: hidden;
}
.mr-bar > span {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background: oklch(var(--p));
  transition: width 0.3s ease;
}
.cell--upgrade {
  text-align: right;
}
.mr-up__main {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.mr-up__tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0 0.3rem;
  height: 1.05rem;
  display: inline-flex;
  align-items: center;
  border-radius: 0.3rem;
  color: oklch(var(--bc) / 0.75);
  background: oklch(var(--bc) / 0.08);
}
.mr-up__gain {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.85rem;
}
.mr-up__other {
  margin-top: 0.15rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.68rem;
  opacity: 0.5;
}
.mr-maxed {
  display: inline-flex;
  color: #d9a63a;
}
.mr-chev svg {
  transition: transform 0.15s ease;
}
.mr-row--open .mr-chev svg {
  transform: rotate(180deg);
}
.row--panel > .cell--panel {
  padding: 0 0.6rem 0.75rem;
  background: oklch(var(--bc) / 0.05);
  border-bottom: 1px solid oklch(var(--bc) / 0.08);
}
.mr-panel {
  border-radius: 0.75rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
  padding: 0.6rem 0.9rem 0.9rem;
}
.mr-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid oklch(var(--bc) / 0.08);
}
.mr-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.7rem;
  margin-bottom: -1px;
  font-size: 0.82rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.6);
  border-bottom: 2px solid transparent;
  &:hover:not(:disabled) {
    color: oklch(var(--bc));
  }
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}
.mr-tab--on {
  color: oklch(var(--bc));
  border-bottom-color: oklch(var(--p));
}
.mr-tab--link {
  margin-left: auto;
  color: oklch(var(--p));
}
.mr-tab__count {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0 0.35rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.1);
}
.mr-sk {
  display: block;
  height: 0.8rem;
  border-radius: 0.3rem;
}
.mr-sk--thin {
  height: 0.5rem;
}
.mr-sk--rank {
  width: 1.4rem;
  height: 1.4rem;
  margin: auto;
}
.mr-sk--avatar {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  flex-shrink: 0;
}
.mr-sk--icon {
  width: 30px;
  height: 30px;
  border-radius: 0.45rem;
  flex-shrink: 0;
}

/* phones: each row a card (../phone-tables.css does the reflow) —
   rank · who · damage · chevron / weapon · upgrade / rotation */
@media (max-width: 767px) {
  .mr-chars {
    table-layout: auto;
  }
  .mr-chars .mr-row {
    padding: 0.65rem 0.35rem;
    column-gap: 0.55rem;
    row-gap: 0.45rem;
  }
  .mr-row > td {
    padding: 0;
    border: 0;
  }
  .mr-chars .mr-row--open {
    background: oklch(var(--bc) / 0.05);
  }
  .mr-chars .mr-row > td,
  .mr-chars .mr-row:hover > td {
    background: none;
  }
  .cell--rank {
    order: 0;
    flex: 0 0 auto;
  }
  .mr-rank {
    min-width: 1.35rem;
    height: 1.35rem;
    font-size: 0.7rem;
  }
  .cell--who {
    order: 0;
    flex: 1 1 8rem;
    min-width: 0;
  }
  .cell--dmg {
    order: 0;
    flex: 0 0 auto;
    min-width: 6.5rem;
  }
  /* the chevron ends the second line: the first one is the name's and the damage's */
  .cell--chev {
    order: 1;
    flex: 0 0 auto;
  }
  .mr-chev {
    width: 2rem;
    height: 2rem;
    min-height: 2rem;
  }
  /* the second line: a basis too wide to share the first line with the name, room left for the upgrade */
  .mr-row > td.cell--weapon {
    order: 1;
    flex: 1 0 calc(100% - 11rem);
    min-width: 0;
    padding-left: 1.9rem;
  }
  .mr-weapon__name {
    font-size: 0.8rem;
    line-height: 1.2;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .cell--weapon::before {
    display: none;
  }
  .cell--upgrade {
    order: 1;
    flex: 0 0 auto;
    margin-left: auto;
  }
  .mr-up__main {
    gap: 0.25rem;
  }
  .mr-row > td.cell--best {
    order: 2;
    flex-basis: 100%;
    min-width: 0;
    padding-left: 1.9rem;
  }
  .row--panel {
    padding: 0 0 0.5rem;
    border-bottom: 1px solid oklch(var(--bc) / 0.08);
    background: oklch(var(--bc) / 0.05);
  }
  .row--panel > .cell--panel {
    flex-basis: 100%;
    min-width: 0;
    padding: 0 0.35rem;
    background: none;
    border: 0;
  }
  .mr-panel {
    padding: 0.5rem 0.65rem 0.75rem;
  }
  .mr-tab {
    padding: 0.45rem 0.5rem;
  }
}
</style>
