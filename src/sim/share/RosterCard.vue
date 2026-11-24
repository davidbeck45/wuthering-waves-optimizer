<template>
  <!-- Wuthering Tools+ share cards: "My roster" — every set-up resonator as a tile and the account's top three teams.
       Fixed px and its own data-theme (like PostCard / TeamCard), so the picture is the same from every screen and
       app theme. Width ROSTER_CARD_WIDTH; the height follows the tile count. A picture only: no data inside. -->
  <div class="share-roster" data-theme="dark" :style="{ width: `${ROSTER_CARD_WIDTH}px` }" data-test-roster-card :data-test-roster-columns="model.grid.columns">
    <header class="share-roster__head">
      <div class="share-roster__titles">
        <div class="share-roster__eyebrow">My roster · {{ model.counts.total }} {{ model.counts.total === 1 ? "resonator" : "resonators" }}</div>
        <div v-if="model.title" class="share-roster__title" data-test-roster-card-title>{{ model.title }}</div>
      </div>
      <div class="share-roster__date">{{ date }}</div>
    </header>

    <ol class="share-roster__grid" :style="{ gridTemplateColumns: `repeat(${model.grid.columns}, minmax(0, 1fr))` }">
      <li
        v-for="t in model.tiles"
        :key="t.id"
        class="share-roster__tile"
        :class="t.rarity >= 5 ? 'share-roster__tile--five' : 'share-roster__tile--four'"
        :style="{ '--accent': accentOf(t.element) }"
        data-test-roster-tile
        :data-test-roster-tile-id="t.id">
        <div class="share-roster__top">
          <div class="share-roster__pic" :style="{ width: `${model.grid.portrait}px`, height: `${model.grid.portrait}px` }">
            <img v-if="drawable(t.id)" :src="characterPortraitUrl(t.id)" alt="" @error="failed[t.id] = true" />
            <span v-else class="share-roster__initials">{{ initials(t.name) }}</span>
            <span class="share-roster__seq" data-test-roster-tile-seq>S{{ t.sequence }}</span>
          </div>
          <div class="share-roster__info">
            <div class="share-roster__name" :title="t.name">{{ t.name }}</div>
            <div class="share-roster__meta">
              <span class="share-roster__stars" :class="t.rarity >= 5 ? 'share-roster__stars--five' : 'share-roster__stars--four'">{{ t.rarity }}★</span>
              <span v-if="t.element">{{ t.element }}</span>
              <span v-if="t.level">Lv {{ t.level }}</span>
            </div>
            <div v-if="model.showScores && t.score" class="share-roster__score" data-test-roster-tile-score>
              Build Score <b>{{ t.score.grade }}</b> {{ t.score.percent }}%{{ t.score.provisional ? "*" : "" }}
            </div>
          </div>
        </div>
        <div v-if="t.weapon" class="share-roster__weapon">
          <img v-if="!failedWeapon[t.weapon.key]" :src="weaponIconUrl(t.weapon.key)" alt="" @error="failedWeapon[t.weapon.key] = true" />
          <span class="share-roster__weapon-name">{{ t.weapon.name }}</span>
          <b class="share-roster__rank" data-test-roster-tile-rank>R{{ t.weapon.rank }}</b>
        </div>
      </li>
    </ol>
    <p v-if="!model.tiles.length" class="share-roster__empty">No resonator matches: switch 4-stars back on, or set one up (a weapon equipped).</p>

    <section v-if="model.teamsState !== 'hidden'" class="share-roster__teams" data-test-roster-card-teams>
      <div class="share-roster__teams-head">Top teams · average damage per rotation</div>
      <ol v-if="model.teamsState === 'teams'" class="share-roster__team-list">
        <li v-for="(team, i) in model.teams" :key="i" class="share-roster__team" data-test-roster-team>
          <span class="share-roster__team-rank">#{{ i + 1 }}</span>
          <span class="share-roster__team-faces">
            <span v-for="id in team.characterIds" :key="id" class="share-roster__face">
              <img v-if="drawable(id)" :src="characterPortraitUrl(id)" alt="" @error="failed[id] = true" />
              <span v-else class="share-roster__initials">{{ initials(characterShortName(id)) }}</span>
            </span>
          </span>
          <span class="share-roster__team-name">{{ team.name }}</span>
          <span class="share-roster__team-figure">
            <b data-test-roster-team-damage>{{ compactDamage(team.avgDamage) }}</b>
            <span>per rotation<template v-if="team.dps"> · {{ compactDamage(team.dps) }} DPS</template></span>
          </span>
        </li>
      </ol>
      <p v-else-if="model.teamsState === 'none'" class="share-roster__teams-note">No team this roster can field yet: a team needs three resonators with a weapon equipped.</p>
      <p v-else class="share-roster__teams-note" data-test-roster-card-no-ranking>Team figures appear once My account has scored the roster: open My account, let it finish, then make the card again.</p>
    </section>

    <footer class="share-roster__foot">
      <span class="share-roster__brand">Wuthering Tools+</span>
      <span>{{ footNote }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { characterPortraitUrl, characterShortName, isRosterCharacter, weaponIconUrl } from "../display/names";
import { ELEMENT_COLOR } from "./cardView";
import { compactDamage, ROSTER_CARD_WIDTH, type RosterCardModel } from "./rosterCard";

const props = defineProps<{ model: RosterCardModel; date: string }>();

const failed = reactive<Record<string, boolean>>({});
const failedWeapon = reactive<Record<string, boolean>>({});
const drawable = (id: string): boolean => isRosterCharacter(id) && !failed[id];
const accentOf = (element: string | null): string => (element && ELEMENT_COLOR[element]) || "#8a8f98";
const initials = (name: string): string =>
  name
    .split(/[\s·-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const footNote = computed(() => {
  const parts: string[] = [];
  if (props.model.teamsState === "teams") parts.push("Team damage: this app's engine on these builds, each team's own rotation, enemy level 100 with 20 % resistance");
  if (props.model.showScores) parts.push("Build Score: substat quality of the five equipped echoes (* fewer than five)");
  parts.push("S = sequence, R = weapon refinement");
  return parts.join(" · ");
});
</script>

<style scoped>
.share-roster {
  box-sizing: border-box;
  padding: 36px 40px 28px;
  font-family: "Figtree", sans-serif;
  color: #eef0f4;
  background: linear-gradient(160deg, #1b1f2a 0%, #12151d 60%, #0e1016 100%);
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.share-roster__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}
.share-roster__eyebrow {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b7bdc9;
}
.share-roster__title {
  font-size: 34px;
  font-weight: 800;
  line-height: 1.15;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.share-roster__date {
  font-size: 18px;
  color: #b7bdc9;
  white-space: nowrap;
}
.share-roster__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.share-roster__tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border-radius: 14px;
  background: #1f2430;
  border: 2px solid #3a4150;
  border-left: 6px solid var(--accent);
}
.share-roster__tile--five {
  border-top-color: #e8b44c;
  border-right-color: #e8b44c;
  border-bottom-color: #e8b44c;
}
.share-roster__tile--four {
  border-top-color: #a46bea;
  border-right-color: #a46bea;
  border-bottom-color: #a46bea;
}
.share-roster__top {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}
.share-roster__pic {
  position: relative;
  flex: none;
  border-radius: 12px;
  overflow: hidden;
  background: #2b3140;
  display: flex;
  align-items: center;
  justify-content: center;
}
.share-roster__pic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.share-roster__initials {
  font-size: 24px;
  font-weight: 800;
  color: #d7dbe3;
}
.share-roster__seq {
  position: absolute;
  left: 0;
  bottom: 0;
  padding: 1px 7px;
  font-size: 17px;
  font-weight: 800;
  color: #111;
  background: var(--accent);
  border-top-right-radius: 8px;
}
.share-roster__info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.share-roster__name {
  font-size: 19px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-roster__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  font-size: 15px;
  color: #c3c8d2;
}
.share-roster__stars {
  font-weight: 800;
}
.share-roster__stars--five {
  color: #f0c467;
}
.share-roster__stars--four {
  color: #c49cf5;
}
.share-roster__weapon {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-top: 6px;
  border-top: 1px solid #343b49;
  font-size: 15px;
  color: #dde1e8;
}
.share-roster__weapon img {
  width: 26px;
  height: 26px;
  flex: none;
  object-fit: contain;
}
.share-roster__weapon-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-roster__rank {
  flex: none;
  color: #f0c467;
}
.share-roster__score {
  font-size: 15px;
  white-space: nowrap;
  color: #c3c8d2;
}
.share-roster__score b {
  color: #eef0f4;
}
.share-roster__empty {
  font-size: 20px;
  color: #c3c8d2;
}
.share-roster__teams {
  border-top: 1px solid #3a4150;
  padding-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.share-roster__teams-head {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #b7bdc9;
}
.share-roster__team-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.share-roster__team {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 14px;
  background: #1f2430;
}
.share-roster__team-rank {
  font-size: 22px;
  font-weight: 800;
  color: #f0c467;
  width: 40px;
}
.share-roster__team-faces {
  display: flex;
  gap: 6px;
  flex: none;
}
.share-roster__face {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  overflow: hidden;
  background: #2b3140;
  display: flex;
  align-items: center;
  justify-content: center;
}
.share-roster__face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.share-roster__face .share-roster__initials {
  font-size: 18px;
}
.share-roster__team-name {
  flex: 1;
  min-width: 0;
  font-size: 19px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.share-roster__team-figure {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 14px;
  color: #c3c8d2;
}
.share-roster__team-figure b {
  font-size: 26px;
  color: #eef0f4;
}
.share-roster__teams-note {
  font-size: 17px;
  color: #c3c8d2;
  margin: 0;
}
.share-roster__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  align-items: baseline;
  font-size: 14px;
  color: #a9afbb;
  border-top: 1px solid #3a4150;
  padding-top: 14px;
}
.share-roster__brand {
  font-size: 17px;
  font-weight: 800;
  color: #eef0f4;
}
</style>
