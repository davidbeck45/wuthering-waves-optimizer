<template>
  <!-- Wuthering Tools+ shell: the "Ask" button, the Claude panel, AI settings and the command palette. Mounted once
  from App.vue inside the app (Pinia, router, toasts, useConfirm all work). The panel, the palette and the settings
  dialog are async chunks loaded the first time they open, so the main bundle only carries this file and the light
  assistant state. -->
  <button
    v-if="showAskButton"
    type="button"
    class="wt-ask-button btn btn-primary fixed z-[55] h-12 min-h-12 gap-2 rounded-full pl-4 pr-5 text-base font-semibold normal-case shadow-lg shadow-primary/25"
    :title="`Ask Claude about your account (${modKey}+J)`"
    aria-label="Ask Claude"
    data-test-ai-open
    @click="assistant.open()">
    <span class="relative inline-flex size-5 items-center justify-center">
      <span v-if="assistant.state.busy" class="loading loading-spinner loading-sm" aria-hidden="true"></span>
      <svg v-else viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"><path :d="SPARKLE" /></svg>
    </span>
    <span>Ask</span>
    <kbd class="wt-ask-button__kbd ml-1 hidden rounded border border-primary-content/30 px-1.5 font-mono text-[11px] font-medium leading-5 opacity-80 lg:inline">{{ modKey }} J</kbd>
  </button>

  <AssistantPanel v-if="panelMounted" />
  <AiSettingsDialog v-if="assistant.state.settingsOpen" @close="assistant.closeSettings()" />
  <CommandPalette v-if="assistant.state.paletteOpen" @close="assistant.setPaletteOpen(false)" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useCharacterStore } from "../../stores/character";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { setAssistantPageProvider, useAssistant } from "../ai/useAssistant";
import { pageTitleOf } from "./paletteItems";
import { anyModalOpen, modKeyLabel } from "./shellDom";
import { TEAMS_ACTIVE_KEY } from "./navigation";

const AssistantPanel = defineAsyncComponent(() => import("../ai/ui/AssistantPanel.vue"));
const AiSettingsDialog = defineAsyncComponent(() => import("../ai/ui/AiSettingsDialog.vue"));
const CommandPalette = defineAsyncComponent(() => import("./CommandPalette.vue"));

const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";

const assistant = useAssistant();
const route = useRoute();
const characterStore = useCharacterStore();
const teamStore = useTeamRotationsStore();
const modKey = modKeyLabel();

// the panel stays mounted once opened (its scroll position and open tool rows survive a close)
const panelMounted = ref(false);
watch(
  () => assistant.state.open,
  (open) => {
    if (open) panelMounted.value = true;
  },
  { immediate: true },
);

// the Ask button steps aside while any modal dialog or bottom sheet is open
const modalOpen = ref(false);
const showAskButton = computed(() => !assistant.state.open && !modalOpen.value);
let observer: MutationObserver | null = null;
// a timer, not requestAnimationFrame: rAF never fires in a background tab or headless Electron (Cypress)
let pendingSync: ReturnType<typeof setTimeout> | null = null;
function syncModal(): void {
  if (pendingSync) return;
  pendingSync = setTimeout(() => {
    pendingSync = null;
    modalOpen.value = anyModalOpen(document);
  }, 30);
}

function openTeamName(): string | null {
  if (route.path !== "/teams") return null;
  try {
    const id = sessionStorage.getItem(TEAMS_ACTIVE_KEY);
    const team = id ? (teamStore.teams as Array<{ id: string; name?: string }>).find((t) => t.id === id) : null;
    return team ? team.name || "(unnamed team)" : null;
  } catch {
    return null;
  }
}

setAssistantPageProvider(() => {
  const key = (characterStore.activeCharacter as string) || null;
  return {
    path: route.fullPath,
    title: pageTitleOf(route.path),
    activeCharacterKey: route.path === "/" ? key : null,
    activeCharacterName: key ? getCharacterRosterDisplayName(key) : null,
    openTeam: openTeamName(),
  };
});

function onKeydown(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && !event.altKey && !event.shiftKey && key === "k") {
    event.preventDefault();
    event.stopPropagation();
    assistant.setPaletteOpen(!assistant.state.paletteOpen);
    return;
  }
  if (mod && !event.altKey && !event.shiftKey && key === "j") {
    event.preventDefault();
    event.stopPropagation();
    if (assistant.state.paletteOpen) assistant.setPaletteOpen(false);
    assistant.toggle();
    return;
  }
  if (event.key === "Escape" && assistant.state.open && !anyModalOpen(document)) {
    // from inside the panel, or from nowhere in particular — an Esc meant for something on the page stays there
    const target = event.target as HTMLElement | null;
    const inPanel = !!target?.closest?.("[data-test-ai-panel]");
    if (inPanel || !target || target === document.body) {
      event.stopPropagation();
      assistant.close();
    }
  }
}

let stopBodyObserver: (() => void) | null = null;

onMounted(() => {
  window.addEventListener("keydown", onKeydown, true);
  observer = new MutationObserver(syncModal);
  // dialogs anywhere toggle `open`; bottom sheets are teleported straight into <body>
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open", "aria-modal"], childList: false });
  const bodyChildren = new MutationObserver(syncModal);
  bodyChildren.observe(document.body, { childList: true });
  stopBodyObserver = () => bodyChildren.disconnect();
  syncModal();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown, true);
  observer?.disconnect();
  stopBodyObserver?.();
  if (pendingSync) clearTimeout(pendingSync);
});
</script>

<style scoped>
.wt-ask-button {
  right: max(1.25rem, env(safe-area-inset-right));
  bottom: max(1.25rem, env(safe-area-inset-bottom));
}
@media (max-width: 767px) {
  .wt-ask-button {
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    height: 2.75rem;
    min-height: 2.75rem;
    padding-left: 0.9rem;
    padding-right: 1.05rem;
  }
}
/* A transform-only CSS animation, not <Transition>: in headless Electron (Cypress) frames never advance — Vue's
   transitions wait on requestAnimationFrame and an opacity animation would sit at 0 — so nothing here may start
   hidden. A small offset that never completes still leaves the button visible and clickable. */
.wt-ask-button {
  animation: wt-ask-in 0.18s ease-out;
}
@keyframes wt-ask-in {
  from {
    transform: translateY(6px) scale(0.96);
  }
}
@media (prefers-reduced-motion: reduce) {
  .wt-ask-button {
    animation: none;
  }
}
</style>
