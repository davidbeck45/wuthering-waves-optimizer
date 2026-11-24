<template>
  <RileyPageHost kind="value" title="Roster value" :views="['Not owned', 'Owned']" views-label="Which side of the value table to show">
    <template #lead>
      What each resonator adds to your best account, in Neutral Matrix Score, on Riley's engine.
    </template>
    <template #about>
      The page packs the best account out of the ticked resonators: the teams with the most damage per rotation together,
      each resonator in one team (two for the 2-vigor supports, one Rover form at a time). For everyone not ticked, the
      figure is what owning them would add; for everyone ticked, what the account would lose without them. Neutral Matrix
      Score is Riley's model of the Endstate Matrix on a neutral phase (no elements, a flat 20 % damage bonus); tap its
      heading for Account DPR, the packed teams' damage per rotation added up. Team damage at the Team Cost you pick, every
      Matrix Buff on, ChemX32 substats, enemy level 100 at 20 % resistance. Damage only. A figure that is a link opens the
      team that earns it.
      <span class="block mt-1">Not the same as Convene › <RouterLink to="/convene?tab=advisor" class="link">Pull advisor</RouterLink>,
      which answers for one resonator at a time on the app's own engine with your real builds and echoes, or
      <RouterLink to="/account" class="link">My account</RouterLink> › What to invest in next: this page ranks everyone at
      once on Riley's engine, at a fixed Team Cost or at your sequences and weapons (Team Cost "My account").</span>
    </template>
    <template #extra>
      <div v-if="owned" class="wt-riley-owned text-sm" data-test-riley-owned>
        <span data-test-riley-owned-line>{{ owned.line }}</span>
        <button
          v-if="owned.account && owned.source.kind !== 'account'"
          type="button"
          class="btn btn-sm btn-outline ml-1"
          data-test-riley-owned-use-account
          @click="useAccountSet()">Tick my account's resonators</button>
      </div>
    </template>
    <template #links>
      · <RouterLink to="/convene?tab=advisor" class="link link-primary" data-test-riley-to-advisor>Pull advisor</RouterLink>
    </template>
  </RileyPageHost>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import RileyPageHost from "./RileyPageHost.vue";
import { onOwnedState, useAccountSet, type OwnedState } from "./controller";

useDocumentTitle(
  "Roster value — Wuthering Waves Calculator & Optimizer",
  "Riley31415's wuwa_calc value page on your own roster: what each resonator would add to your account's Neutral Matrix Score.",
);
const owned = ref<OwnedState | null>(null);
onOwnedState((s) => { owned.value = s; });
onBeforeUnmount(() => onOwnedState(null));
</script>

<style scoped>
.wt-riley-owned {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  padding: 0.25rem 0;
}
.wt-riley-owned .btn {
  min-height: 44px;
}
</style>
