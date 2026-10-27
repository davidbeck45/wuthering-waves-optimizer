<template>
  <section class="bt-picker" data-test-build-team-picker>
    <div class="bt-section-head">
      <h2 class="bt-h2">Pick a team <span v-if="rows.length" class="bt-count">{{ rows.length }}</span></h2>
      <span class="text-xs opacity-60">Or open one from <RouterLink to="/my-rankings" class="link">roster rankings</RouterLink> or a <RouterLink to="/rankings" class="link">wuwa_calc team</RouterLink>.</span>
    </div>
    <div v-if="!rows.length" class="bt-empty" data-test-build-team-no-teams>
      <p class="font-semibold">No saved team yet</p>
      <p class="text-sm opacity-75">Import one from the wuwa_calc team rankings (the detail page's “Import team”), or build one on Teams. A team with its rotation lets every member be scored on their part of it.</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <RouterLink to="/rankings" class="btn btn-primary btn-sm">Team rankings</RouterLink>
        <RouterLink to="/teams" class="btn btn-ghost btn-sm">Teams</RouterLink>
      </div>
    </div>
    <ul v-else class="bt-picker__list">
      <li v-for="t in rows" :key="t.id">
        <RouterLink :to="{ path: '/build-team', query: { team: t.id } }" class="bt-picker__row" :data-test-build-team-pick="t.name">
          <span class="bt-picker__trio">
            <CharacterAvatar v-for="id in t.ids" :id="id" :key="id" :size="34" />
          </span>
          <span class="bt-picker__text">
            <PresetNameLabel :name="t.name" source="yours" :owned="owned" :max-chips="2" />
            <span class="bt-picker__meta">
              {{ t.actions ? `${t.actions} actions` : "no rotation yet" }}
              <template v-if="t.unready.length"> · <span class="text-warning">not set up: {{ t.unready.map(characterDisplayName).join(", ") }}</span></template>
            </span>
          </span>
          <span class="bt-picker__go" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4"><path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ "Build it for me" — the saved teams, set-up ones first, when the page opens without a team.
import { computed } from "vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import PresetNameLabel from "../display/PresetNameLabel.vue";
import { characterDisplayName } from "../display/names";

/* eslint-disable @typescript-eslint/no-explicit-any */
const props = defineProps<{ teams: any[]; characters: Record<string, any> }>();

const owned = computed(() => Object.keys(props.characters ?? {}));
const rows = computed(() =>
  (props.teams ?? [])
    .map((t) => {
      const ids = (t.characterIds ?? []).filter(Boolean) as string[];
      return { id: t.id as string, name: String(t.name ?? "Team"), ids, actions: (t.actions ?? []).length, unready: ids.filter((id) => !props.characters?.[id]?.weapon) };
    })
    .filter((t) => t.ids.length)
    .sort((a, b) => a.unready.length - b.unready.length || b.actions - a.actions || a.name.localeCompare(b.name)),
);
</script>
