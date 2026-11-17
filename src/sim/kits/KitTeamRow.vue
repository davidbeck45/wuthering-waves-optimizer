<template>
  <div class="kit-team" data-test-kit-team>
    <div class="kit-team__top">
      <span class="kit-team__name">{{ label }}</span>
      <span class="kit-team__dps" data-test-kit-team-dps>{{ dpsText(team.dps) }} <span class="kit-team__unit">team DPS, wuwa_calc</span></span>
    </div>
    <ul class="kit-members">
      <li v-for="m in members" :key="m.key" class="kit-member">
        <CharacterAvatar :id="m.key" :size="30" />
        <span class="kit-member__text">
          <span class="kit-member__name">{{ m.label }}</span>
          <span class="kit-sub">S{{ m.sequence }} · {{ m.weapon }} R{{ m.rank }}</span>
        </span>
      </li>
    </ul>
    <p v-if="team.share != null" class="kit-muted">
      {{ subjectLabel }} deals {{ dpsText(team.share) }} of that ({{ sharePercent }}% of the team's DPS)<template v-if="team.seconds"> · one loop takes {{ team.seconds }} s</template>
    </p>
    <p v-else-if="team.seconds" class="kit-muted">One loop takes {{ team.seconds }} s.</p>
    <p v-if="team.insteadOf" class="kit-muted" data-test-kit-team-instead>
      Riley's first pick for {{ flexLabel }}'s slot is {{ team.insteadOf }}, who this app has no character for yet: this is the next best.
    </p>
    <p v-if="team.alts.length" class="kit-muted" data-test-kit-team-alts>Or in {{ flexLabel }}'s slot: {{ altsText }} team DPS.</p>
    <div v-if="cost" class="kit-actions">
      <RouterLink :to="tablePath" class="btn btn-outline btn-xs" data-test-kit-team-rankings>Riley's table at {{ costName }}</RouterLink>
      <RouterLink :to="minePath" class="btn btn-outline btn-xs" data-test-kit-team-mine>This team at your account</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one of Riley's solved teams on a brief page: its name as every plus page writes one, the three
// members as fielded (sequence, weapon and rank), the team's DPS with whose figure it is, the subject's part, the
// other sustain supports for the flex slot, and two ways out: his table at this Team Cost, and the same team at the
// player's account (the My account tier on their own echoes).
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterShortName, teamLabel } from "../display/names";
import { rankingsMineHash } from "../account/accountState";
import { accountKeyOf } from "../rankings/rileyNames";
import { costLabel, dpsText, mainOf, rankingsPath, type KitMember, type KitTeam } from "./kits";

const props = defineProps<{
  team: KitTeam;
  /** Riley's name of the resonator the brief is about */
  subject: string;
  /** the Team Cost the figure is at; null hides the links */
  cost: string | null;
  /** the character store's records: a Rover is shown as the form the account holds */
  characters: Record<string, any>;
}>();

const keyOf = (m: KitMember): string => accountKeyOf(m.appKey, props.characters);
/** "Denia (Burst)" under the app's own name for them: "Rover Aero", "Xuanling" */
const labelOf = (m: KitMember): string => m.label.replace(m.name, characterShortName(keyOf(m)));
const members = computed(() => props.team.members.map((m) => ({ ...m, key: keyOf(m), label: labelOf(m) })));
const main = computed(() => mainOf(props.team, props.subject));
const label = computed(() => teamLabel(members.value.map((m) => m.key), main.value ? keyOf(main.value) : null));
const subjectMember = computed(() => props.team.members.find((m) => m.name === props.subject) ?? null);
const subjectLabel = computed(() => (subjectMember.value ? characterShortName(keyOf(subjectMember.value)) : props.subject));
const sharePercent = computed(() => (props.team.dps && props.team.share != null ? Math.round((props.team.share / props.team.dps) * 100) : 0));
const flexLabel = computed(() => {
  const m = props.team.flex == null ? null : props.team.members[props.team.flex];
  return m ? characterShortName(keyOf(m)) : "the sustain";
});
const altsText = computed(() => props.team.alts.map((a) => `${characterShortName(keyOf(a.member))} ${dpsText(a.dps)}`).join(" · "));
const costName = computed(() => (props.cost ? costLabel(props.cost) : ""));
const tablePath = computed(() => rankingsPath(props.cost ?? "", props.team.members.map((m) => m.name)));
const minePath = computed(() => `/rankings${rankingsMineHash(members.value.map((m) => m.key), { subs: "m" })}`);
</script>
