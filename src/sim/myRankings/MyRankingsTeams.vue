<template>
  <section class="mr-teams-section">
    <div class="mr-section-head">
      <h2 class="mr-h2">
        Teams
        <span v-if="rows.length" class="mr-count">{{ rows.length }}</span>
      </h2>
      <div v-if="teams.length" class="mr-seg" role="group" aria-label="Which teams">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          type="button"
          class="mr-seg__btn"
          :class="{ 'mr-seg__btn--on': filter === f.id }"
          :aria-pressed="filter === f.id"
          :data-test-my-rankings-team-filter="f.id"
          @click="filter = f.id">
          {{ f.label }} <span class="mr-seg__n">{{ counts[f.id] }}</span>
        </button>
      </div>
    </div>

    <p v-if="!teams.length && !pending" class="mr-note" data-test-my-rankings-no-teams>
      No team to rank yet: a team needs actions and all three members present in your data. Import one from the
      wuwa_calc rankings page or Teams › List Presets, then recompute.
    </p>
    <table v-else class="table table--cards mr-teams" data-test-my-rankings-teams>
      <colgroup>
        <col class="mr-tcol-rank" />
        <col />
        <col class="mr-tcol-dmg" />
        <col class="mr-tcol-link" />
      </colgroup>
      <thead>
        <tr>
          <th class="text-center">#</th>
          <th>Team</th>
          <th class="text-right" title="average damage per rotation, every member's share in their colour">Team avg DMG / rotation</th>
          <th><span class="sr-only">Rankings</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(t, i) in visible" :key="t.id" class="mr-trow" :data-test-my-rankings-team="t.name">
          <td class="tcell--rank"><span class="mr-trank">{{ i + 1 }}</span></td>
          <td class="tcell--team">
            <div class="mr-team">
              <div class="mr-trio">
                <CharacterAvatar
                  v-for="s in sharesOf(t)"
                  :id="s.id"
                  :key="s.id"
                  :size="34"
                  :ring="s.color"
                  :title="`${characterDisplayName(s.id)}: ${fmt(s.value)} (${Math.round(s.share * 100)}%)`" />
              </div>
              <div class="min-w-0 flex-1">
                <PresetNameLabel :name="t.name" :source="t.source" :owned="owned" :max-chips="2" />
                <div v-if="t.duplicates.length || t.unarmed.length" class="mr-team__notes">
                  <span v-if="t.duplicates.length" class="mr-team__dup" :title="`Same three members, same damage:\n${t.duplicates.map((d) => d.name).join('\n')}`">
                    +{{ t.duplicates.length }} identical {{ t.duplicates.length === 1 ? "preset" : "presets" }}
                  </span>
                  <span v-if="t.unarmed.length" class="text-warning">no weapon: {{ t.unarmed.map((cid) => characterDisplayName(cid)).join(", ") }}</span>
                </div>
              </div>
            </div>
          </td>
          <td class="tcell--dmg">
            <div class="mr-tdmg">
              <span class="mr-tdmg__value">{{ fmt(t.avgDamage) }}</span>
              <span class="mr-stack" aria-hidden="true">
                <span class="mr-stack__fill" :style="{ width: `${maxDamage > 0 ? Math.max(2, (t.avgDamage / maxDamage) * 100) : 0}%` }">
                  <span
                    v-for="s in sharesOf(t)"
                    :key="s.id"
                    class="mr-stack__seg"
                    :style="{ width: `${s.share * 100}%`, background: s.color }"
                    :title="`${characterDisplayName(s.id)}: ${fmt(s.value)} (${Math.round(s.share * 100)}%)`"></span>
                </span>
              </span>
            </div>
          </td>
          <td class="tcell--link">
            <RouterLink
              :to="{ path: '/rankings', hash: rankingsMineHash(t.characterIds) }"
              class="btn btn-ghost btn-sm btn-square"
              title="wuwa_calc's teams with these three, at your account's sequences and weapons"
              :aria-label="`wuwa_calc rankings for ${t.name}`"
              :data-test-my-rankings-team-mine-link="t.name">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </RouterLink>
          </td>
        </tr>
        <tr v-for="n in pending" :key="`tsk-${n}`" class="mr-trow" aria-hidden="true" data-test-my-rankings-team-skeleton>
          <td class="tcell--rank"><span class="skeleton block mx-auto" style="width: 1.3rem; height: 1.3rem; border-radius: 0.4rem"></span></td>
          <td class="tcell--team">
            <div class="mr-team">
              <div class="mr-trio"><span v-for="k in 3" :key="k" class="skeleton block rounded-full" style="width: 34px; height: 34px"></span></div>
              <div class="grid gap-1.5"><span class="skeleton block h-3 rounded" style="width: 11rem"></span><span class="skeleton block h-2 rounded" style="width: 5rem"></span></div>
            </div>
          </td>
          <td class="tcell--dmg"><div class="mr-tdmg"><span class="skeleton block h-3 rounded ml-auto" style="width: 5.5rem"></span><span class="skeleton block h-2 rounded"></span></div></td>
          <td class="tcell--link"></td>
        </tr>
      </tbody>
    </table>

    <div v-if="filtered.length > LIMIT || teamsSkipped" class="mr-teams-foot">
      <button v-if="filtered.length > LIMIT" type="button" class="btn btn-sm btn-ghost" data-test-my-rankings-teams-more @click="showAll = !showAll">
        {{ showAll ? `Show the top ${LIMIT}` : `Show all ${filtered.length} teams` }}
      </button>
      <span v-if="teamsSkipped" class="text-xs opacity-60">{{ teamsSkipped }} team{{ teamsSkipped === 1 ? "" : "s" }} skipped (no actions, or a member not set up).</span>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the /my-rankings teams table: three portraits side by side ringed in each member's colour,
// the name as title + chips, the team's damage as one bar split by member share (the team editor's colours),
// identical rows (a saved team and the stock preset it came from) folded together, top 10 first.
import { computed, ref } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import { characterDisplayName } from "../display/names";
import { rankingsMineHash } from "../account/accountState";
import { dedupeTeams, memberShares, type MemberShare, type TeamRow } from "./rows";
import type { TeamRank } from "./rankRoster";
import { fmt } from "./format";

const props = withDefaults(defineProps<{ teams: TeamRank[]; pending?: number; teamsSkipped?: number; owned?: string[] }>(), {
  pending: 0,
  teamsSkipped: 0,
  owned: () => [],
});

const LIMIT = 10;
type Filter = "all" | "yours" | "presets";
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "yours", label: "Yours" },
  { id: "presets", label: "Presets" },
];
const filter = ref<Filter>("all");
const showAll = ref(false);

const rows = computed<TeamRow[]>(() => dedupeTeams([...props.teams].sort((a, b) => b.avgDamage - a.avgDamage)));
const counts = computed<Record<Filter, number>>(() => ({
  all: rows.value.length,
  yours: rows.value.filter((t) => t.source === "yours").length,
  presets: rows.value.filter((t) => t.source !== "yours").length,
}));
const filtered = computed(() => rows.value.filter((t) => filter.value === "all" || (filter.value === "yours" ? t.source === "yours" : t.source !== "yours")));
const visible = computed(() => (showAll.value ? filtered.value : filtered.value.slice(0, LIMIT)));
const maxDamage = computed(() => Math.max(0, ...rows.value.map((t) => t.avgDamage)));

const shareCache = new WeakMap<object, MemberShare[]>();
function sharesOf(t: TeamRow): MemberShare[] {
  let s = shareCache.get(t);
  if (!s) {
    s = memberShares(t);
    shareCache.set(t, s);
  }
  return s;
}
</script>

<style scoped lang="scss">
.mr-teams {
  table-layout: fixed;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}
.mr-tcol-rank {
  width: 3rem;
}
.mr-tcol-dmg {
  width: 20rem;
}
.mr-tcol-link {
  width: 3rem;
}
@media (max-width: 1023px) {
  .mr-tcol-dmg {
    width: 14rem;
  }
}
.mr-teams thead th {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.55);
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid oklch(var(--bc) / 0.1);
}
.mr-trow > td {
  padding: 0.5rem 0.6rem;
  vertical-align: middle;
  border-bottom: 1px solid oklch(var(--bc) / 0.06);
}
.mr-trow:hover > td {
  background: oklch(var(--bc) / 0.03);
}
.tcell--rank {
  text-align: center;
}
.mr-trank {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.5);
}
.mr-team {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  font-size: 0.88rem;
}
.mr-trio {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 2px;
}
.mr-team__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.15rem;
  font-size: 0.7rem;
}
.mr-team__dup {
  opacity: 0.55;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.mr-tdmg {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.mr-tdmg__value {
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.92rem;
}
.mr-stack {
  display: block;
  height: 0.4rem;
  border-radius: 9999px;
  overflow: hidden;
  background: oklch(var(--bc) / 0.08);
}
.mr-stack__fill {
  display: flex;
  height: 100%;
  border-radius: 9999px;
  overflow: hidden;
}
.mr-stack__seg {
  display: block;
  height: 100%;
}
.mr-stack__seg + .mr-stack__seg {
  box-shadow: inset 1px 0 0 oklch(var(--b1) / 0.6);
}
.mr-teams-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
@media (max-width: 767px) {
  .mr-teams {
    table-layout: auto;
  }
  .mr-teams .mr-trow {
    padding: 0.65rem 0.35rem;
    column-gap: 0.55rem;
    row-gap: 0.45rem;
  }
  .mr-trow > td {
    padding: 0;
    border: 0;
  }
  .tcell--rank {
    order: 0;
    flex: 0 0 1.35rem;
  }
  .tcell--team {
    order: 0;
    flex: 1 1 calc(100% - 2.5rem);
    min-width: 0;
  }
  .mr-team {
    align-items: flex-start;
    gap: 0.55rem;
  }
  .mr-trio {
    gap: 0.2rem;
  }
  .mr-trio :deep(.wt-avatar) {
    width: 28px !important;
    height: 28px !important;
  }
  /* the name may take two lines here rather than lose its teammates to an ellipsis */
  .mr-team :deep(.wt-preset__text) {
    white-space: normal;
  }
  /* line 1 is the team's (portraits, name, chips); line 2 the bar, the number and the link */
  .tcell--link {
    order: 2;
    flex: 0 0 auto;
  }
  .mr-trow > td.tcell--dmg {
    order: 1;
    flex: 1 0 calc(100% - 3.2rem);
    min-width: 0;
    padding-left: 1.9rem;
  }
  .tcell--link .btn {
    width: 2rem;
    height: 2rem;
    min-height: 2rem;
  }
  .mr-tdmg {
    flex-direction: row-reverse;
    align-items: center;
    gap: 0.6rem;
  }
  .mr-tdmg__value {
    flex: 0 0 auto;
    font-size: 0.85rem;
  }
  .mr-stack {
    flex: 1 1 auto;
  }
}
</style>
