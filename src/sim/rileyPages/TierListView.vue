<template>
  <RileyPageHost kind="tierlist" title="Tier list" :views="['Main DPS', 'Sub DPS', 'Support']" views-label="Which block of the tier list to show">
    <template #lead>
      <span class="wt-tlead-long">Every resonator at the best team they reach, T0 (best) to T4, on Riley's wuwa_calc engine.</span>
      <!-- a phone's Board: one short line instead of this lead plus the board's own, so the T0 band is on the first screen -->
      <span class="wt-tlead-board">Riley's wuwa_calc tiers, T0 best. Tap a portrait for its best team.</span>
    </template>
    <template #about>
      A figure is the damage per rotation (DPR) of the best team that resonator stands in, at the Team Cost you pick, with
      ChemX32 substats against an enemy at level 100 with 20 % resistance; tap a "Best Team DPR" heading for damage per
      second instead. Main DPS is a team's main damage dealer; Sub DPS and Support are everyone else, Support being the
      resonators that may stand in two teams in the Endstate Matrix (2 vigor). Tiers are cut on the figures without Matrix
      Buffs, so turning them on shows who they lift. Damage only: no healing, shields or ease of play.
    </template>
    <template #board="{ view }">
      <TierBoard :view="view" />
    </template>
  </RileyPageHost>
</template>

<script setup lang="ts">
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import RileyPageHost from "./RileyPageHost.vue";
import TierBoard from "./TierBoard.vue";

useDocumentTitle(
  "Tier list — Wuthering Waves Calculator & Optimizer",
  "Riley31415's wuwa_calc tier list inside Wuthering Tools+: every resonator at the best team damage they reach, at any Team Cost or at your own account.",
);
</script>
