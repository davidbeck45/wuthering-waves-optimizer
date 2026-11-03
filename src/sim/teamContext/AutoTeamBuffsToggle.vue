<template>
  <label
    class="form-control max-w-[15rem]"
    title="On: each member's team buffs come from the team's real members and their builds (sequence nodes, weapon, set, main echo), and a saved build named after the teammates is used. Off: the app's own behaviour — each character's Team Buffs panel as saved on the Calculator page.">
    <span class="label-text text-xs">Team buffs</span>
    <label class="label cursor-pointer justify-start gap-2 py-1">
      <input
        v-model="autoTeamBuffs"
        type="checkbox"
        class="toggle toggle-sm toggle-primary"
        :aria-describedby="captionId"
        data-test-auto-team-buffs />
      <span class="label-text text-xs">{{ autoTeamBuffs ? "from the team's members" : "as set on each character" }}</span>
    </label>
    <!-- the title above is a hover tooltip a phone never shows: the same in one line (2026-11-02 core audit L6) -->
    <span :id="captionId" class="text-xs leading-snug text-base-content/75" data-test-auto-team-buffs-caption>
      {{ autoTeamBuffs ? "Uses your teammates' real builds. Off: each character's Team Buffs panel." : "Each character's Team Buffs panel. On: your teammates' real builds." }}
    </span>
  </label>
</template>

<script setup lang="ts">
// Wuthering Tools+ — see src/sim/teamContext/resolveTeam.ts
import { useId } from "vue";
import { autoTeamBuffs } from "./autoTeamBuffs";

const captionId = `wt-auto-team-buffs-${useId()}`;
</script>
