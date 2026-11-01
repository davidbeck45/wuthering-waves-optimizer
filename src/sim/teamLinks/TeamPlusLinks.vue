<template>
  <!-- not one of wuwa_calc's compositions: nothing to show, every link would open a refusal (kept in the DOM, hidden,
  so a test can tell "settled, none" from "still measuring") -->
  <section v-if="chars" v-show="shown" class="team-plus rounded-box border border-base-300 bg-base-100 px-3 py-2.5 flex flex-col gap-2" data-test-team-plus-links :data-state="state">
    <p v-if="state === 'loading'" class="text-sm opacity-70 flex items-center gap-2">
      <span class="loading loading-spinner loading-xs"></span> Playing this team in Riley's wuwa_calc at your account…
    </p>
    <p v-else class="text-sm leading-snug">
      <b class="tabular-nums" data-test-team-plus-dps>{{ intText(dps) }} DPS</b> in Riley's wuwa_calc at your account.
      <span class="opacity-70">The DPS at the top is this app's calculator over your action list.</span>
    </p>
    <p v-if="state === 'ok' && unsetText" class="text-xs opacity-70 leading-snug" data-test-team-plus-unset>{{ unsetText }}</p>
    <div class="flex flex-wrap gap-1.5">
      <RouterLink
        v-for="l in links"
        :key="l.id"
        :to="l.to"
        class="btn btn-sm"
        :class="l.id === 'cue' ? 'btn-primary' : 'btn-outline'"
        :title="l.title"
        :aria-label="`${l.label}: ${l.title}`"
        :data-test-team-plus-link="l.id"
      >
        {{ l.label }}
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — a saved team in the Teams editor, as the plus pages see it (night audit "fight", F11 / F12): its
// wuwa_calc DPS at the account, labelled as that engine's (the editor's own DPS is the app's calculator over the
// action list), and links to its cue card, fight timeline, energy check and ToA check. Mounted with one line in
// TeamRotationTeamEditor.vue. Shown only once wuwa_calc has run the composition: a team that is not one of his
// compositions (or not released here) shows nothing, since every link would open a refusal.
// It reads the energy check's measurement of the composition (useEnergyNeeds: kept per account and engine commit in
// localStorage, so a team /energy has seen paints at once; otherwise one run on the existing solver worker). It does
// not activate the whole check — no store watchers, no builds' ER pass.
import { computed, onMounted, watch } from "vue";
import { RouterLink } from "vue-router";
import { intText } from "../energy/energyFormat";
import { useEnergyNeeds } from "../energy/useEnergyNeeds";
import { notSetUpText, teamCharsOf, teamPlusLinks } from "./teamLinks";

const props = defineProps<{ characterIds: Array<string | null> }>();

const energy = useEnergyNeeds();
const chars = computed(() => teamCharsOf(props.characterIds));
const view = computed(() => (chars.value ? energy.viewOf(chars.value) : null));
const state = computed<"loading" | "ok" | "none">(() => {
  const s = view.value?.state;
  if (!s || s.status === "loading") return "loading";
  return s.status === "ok" ? "ok" : "none";
});
const shown = computed(() => state.value !== "none");
const dps = computed(() => view.value?.energy?.total ?? null);
/** members run without the account's build (as /rotation says it), so "at your account" is not read as theirs */
const unsetText = computed(() => notSetUpText(view.value?.energy?.members ?? []));
const links = computed(() => (chars.value ? teamPlusLinks(chars.value) : []));

let timer: ReturnType<typeof setTimeout> | null = null;
function measureSoon(): void {
  if (timer) clearTimeout(timer);
  // the account key moves on every build edit in the calculator: settle first
  timer = setTimeout(() => {
    timer = null;
    if (chars.value) void energy.measure(chars.value);
  }, 400);
}
onMounted(() => {
  if (chars.value) void energy.measure(chars.value);
});
watch(() => `${chars.value?.join("+") ?? ""}|${energy.account.value.key}|${energy.account.value.buildsKey}`, measureSoon);
</script>
