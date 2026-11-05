<template>
  <p class="team-list-engine mb-3 max-w-3xl text-xs leading-snug opacity-80" data-test-team-list-engine>
    Damage and DPS here are <b class="font-semibold">this app's calculator</b> over each action list.
    Energy check, Rotation cue cards and Tower of Adversity show <b class="font-semibold">Riley's wuwa_calc</b> DPS, which differs.
  </p>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one line over the Teams list's summary tiles (night critic item 17), worded like the Teams
// editor's wuwa_calc line (TeamPlusLinks.vue): the tiles and the team cards show this app's calculator over each saved
// action list (378,332 DPS for David's Aemeath team), while /energy, /rotation and /endgame show wuwa_calc's own play of
// the team (367,567), so the two figures are never read as one. Mounted with one line in TeamRotations.vue, under the
// "All Teams Summary" heading. (No comment in the template: a root comment makes the component a fragment in dev.)
defineOptions({ name: "TeamListEngineNote" });
</script>
