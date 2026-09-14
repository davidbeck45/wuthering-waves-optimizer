<template>
  <label
    class="form-control"
    title="On: each member's team buffs come from the team's real members and their builds (sequence nodes, weapon, set, main echo), and a saved build named after the teammates is used. Off: the app's own behaviour — each character's Team Buffs panel as saved on the Calculator page.">
    <span class="label-text text-xs">Team buffs</span>
    <label class="label cursor-pointer justify-start gap-2 py-1">
      <input v-model="autoTeamBuffs" type="checkbox" class="toggle toggle-sm toggle-primary" data-test-auto-team-buffs />
      <span class="label-text text-xs">{{ autoTeamBuffs ? "from the team's members" : "as set on each character" }}</span>
    </label>
  </label>
</template>

<script setup lang="ts">
// Wuthering Tools+ — see src/sim/teamContext/resolveTeam.ts
import { autoTeamBuffs } from "./autoTeamBuffs";
</script>
