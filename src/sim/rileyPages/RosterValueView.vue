<template>
  <RileyPageHost kind="value" title="Roster value">
    <template #about>
      What each resonator is worth to your roster on Riley's wuwa_calc engine: the best account your ticked resonators
      can field (each in one team, two for the 2-vigor supports), then, for everyone unticked, what owning them would add,
      and for everyone ticked, what the account would lose without them. Figures are Neutral Matrix Score (Riley's model of
      the Endstate Matrix on a neutral phase; tap the heading for Account DPR, the teams' damage per rotation) at the Team
      Cost you pick. Damage only.
    </template>
  </RileyPageHost>
</template>

<script setup lang="ts">
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import RileyPageHost from "./RileyPageHost.vue";

useDocumentTitle(
  "Roster value — Wuthering Waves Calculator & Optimizer",
  "Riley31415's wuwa_calc value page on your own roster: what each resonator would add to your account's Neutral Matrix Score.",
);
</script>
