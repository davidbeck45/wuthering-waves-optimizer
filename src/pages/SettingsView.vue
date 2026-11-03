<template>
  <Nav
    cur-page="settings"
    :disable-mobile-nav="true"
    :sections="isLiveResultBarEnabled ? SETTINGS_SECTIONS : null"
    :active-section="activeSection"
    @select-section="selectSection"></Nav>
  <div class="page-settings">
    <!-- Labs flag "UI Overhaul 3.0" (liveResultBar) off: legacy tab strip, untouched. -->
    <Settings v-if="!isLiveResultBarEnabled"></Settings>
    <!-- Labs flag on: the sections are in the nav's tab row (ADR 0045). -->
    <SettingsWorkspace v-else :section="activeSection"></SettingsWorkspace>
    <SavedResultsCard v-if="!isLiveResultBarEnabled || activeSection === 'preferences'" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Settings from "../components/Settings.vue";
import SettingsWorkspace, { type SettingsSectionId } from "../components/SettingsWorkspace.vue";
import Nav from "../components/navigation/Nav.vue";
import { SETTINGS_SECTIONS } from "../components/navigation/navSections";
import { useSettingsStore } from "../stores/settings";
import { isV3UiEnabled } from "../utils/uiVersion";
import { useDocumentTitle } from "../composables/useDocumentTitle";
import SavedResultsCard from "../sim/persist/SavedResultsCard.vue"; // Wuthering Tools+: Settings › Saved results

useDocumentTitle(
  "Settings — Wuthering Waves Calculator & Optimizer",
  "Preferences, backup and restore, Wavescan import and Labs for the Wuthering Waves Calculator & Optimizer.",
);

const settingsStore = useSettingsStore();
const isLiveResultBarEnabled = computed(
  () => isV3UiEnabled(settingsStore),
);

// /settings?section=wavescan (the Scanners page's import link) opens that section; Wuthering Tools+: any section key,
// also while the page is open (the command palette links each section).
const route = useRoute();
const sectionOf = (key: unknown): SettingsSectionId =>
  SETTINGS_SECTIONS.groups.some((g) => g.items.some((i) => i.key === key)) ? (key as SettingsSectionId) : "preferences";
const activeSection = ref<SettingsSectionId>(sectionOf(route?.query.section));
watch(() => route?.query.section, (key) => key && selectSection(sectionOf(key)));

function selectSection(key: string) {
  if (key === activeSection.value) return;
  activeSection.value = key as SettingsSectionId;
  window.scrollTo({ top: 0 });
}
</script>

<style scoped lang="scss">
.page-settings {
  padding: 2rem 3rem;
  @media (max-width: 640px) {
    padding: 1rem;
  }
}
</style>
