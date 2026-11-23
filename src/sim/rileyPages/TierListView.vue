<template>
  <RileyPageHost kind="tierlist" title="Tier list">
    <template #about>
      Every resonator at the best team they reach on Riley's wuwa_calc engine, as main DPS, sub DPS or support, banded T0
      (best) to T4. A figure is that team's damage per rotation at the Team Cost you pick (ChemX32 substats, enemy level
      100 at 20 % resistance); tap a "Best Team DPR" heading for damage per second instead. Damage only: no healing,
      shields or ease of play.
    </template>
  </RileyPageHost>
</template>

<script setup lang="ts">
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import RileyPageHost from "./RileyPageHost.vue";

useDocumentTitle(
  "Tier list — Wuthering Waves Calculator & Optimizer",
  "Riley31415's wuwa_calc tier list inside Wuthering Tools+: every resonator at the best team damage they reach, at any Team Cost or at your own account.",
);
</script>
