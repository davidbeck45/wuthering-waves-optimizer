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
  <ShareSheetHost v-if="shareRequest" />
  <AnatomySheetHost v-if="anatomyRequest" />
  <WelcomeCard v-if="showWelcome" @dismiss="hideWelcome" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCharacterStore } from "../../stores/character";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useInventoryStore } from "../../stores/inventory";
import { useToast } from "../../composables/useToast";
import { installImportGuard } from "../buildHistory/importGuard";
import { installCrossTabSync, type SyncedStore } from "../storage/crossTabSync";
import { noticeRefusedWrites } from "../storage/persistGuard";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { setAssistantPageProvider, useAssistant } from "../ai/useAssistant";
import { pageTitleOf } from "./paletteItems";
import { installConfirmRouteGuard } from "./confirmRouteGuard";
import { anyModalOpen, modKeyLabel } from "./shellDom";
import { askInRail, DOCKED_CLASS, DOCK_MIN_WIDTH, shouldDock } from "./askDock";
import { TEAMS_ACTIVE_KEY } from "./navigation";
import { shareRequest } from "../share/shareRequest";
import { anatomyRequest } from "../anatomy/anatomyRequest";
import { dismissWelcome, isNewVisitor, welcomeAllowed, welcomeDismissed } from "./welcome";
import { foldInventoryFiltersOnPhone, installInventoryPagerJump } from "./inventoryPager";
import { useSettingsStore } from "../../stores/settings";
import { PLUS_PAGES } from "./plusPages";
import { focusReturn, installSkipLink, isPlusPath, markMain, setPlusScope } from "../a11y/shellA11y";

const AssistantPanel = defineAsyncComponent(() => import("../ai/ui/AssistantPanel.vue"));
const AiSettingsDialog = defineAsyncComponent(() => import("../ai/ui/AiSettingsDialog.vue"));
const CommandPalette = defineAsyncComponent(() => import("./CommandPalette.vue"));
const ShareSheetHost = defineAsyncComponent(() => import("../share/ShareSheetHost.vue"));
const AnatomySheetHost = defineAsyncComponent(() => import("../anatomy/AnatomySheetHost.vue"));
const WelcomeCard = defineAsyncComponent(() => import("./WelcomeCard.vue"));

const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";

const assistant = useAssistant();
const route = useRoute();
const characterStore = useCharacterStore();
const teamStore = useTeamRotationsStore();
const inventoryStore = useInventoryStore();
// build history: a version of every build a Settings import is about to replace (src/sim/buildHistory/importGuard.ts)
installImportGuard({ character: characterStore as never, inventory: inventoryStore as never });
// two tabs on one account stay one account, and a write the browser refused is said out loud (src/sim/storage/)
installCrossTabSync([characterStore, inventoryStore, teamStore] as unknown as SyncedStore[]);
noticeRefusedWrites((text) => useToast().showToast(text, "error", 12000));
installConfirmRouteGuard(useRouter());
const modKey = modKeyLabel();

// "New here?" on the calculator for a browser with nothing of its own yet (welcome.ts); gone for good once dismissed
const welcomeHidden = ref(welcomeDismissed() || !welcomeAllowed());
const showWelcome = computed(
  () =>
    !welcomeHidden.value &&
    route.path === "/" &&
    !assistant.state.open &&
    isNewVisitor(characterStore.characters as Record<string, { weapon?: unknown }>, inventoryStore.echoes as unknown[]),
);
function hideWelcome(): void {
  welcomeHidden.value = true;
  dismissWelcome();
}

// the panel stays mounted once opened (its scroll position and open tool rows survive a close)
const panelMounted = ref(false);
watch(
  () => assistant.state.open,
  (open) => {
    if (open) panelMounted.value = true;
  },
  { immediate: true },
);

// the Ask button steps aside while any modal dialog or bottom sheet is open, and on the v3 desktop rail, which has its
// own Ask item (askDock.ts)
const modalOpen = ref(false);
const showAskButton = computed(() => !assistant.state.open && !modalOpen.value && !askInRail.value);
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
  // /build-team?team=<id>: the saved team the plan is for
  if (route.path === "/build-team" && typeof route.query.team === "string") {
    const team = (teamStore.teams as Array<{ id: string; name?: string }>).find((t) => t.id === route.query.team);
    return team ? team.name || "(unnamed team)" : null;
  }
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

// plus pages get a11y.css's contrast floor (html[data-wt-plus]); every page's RouterView box is its main landmark.
// The matched record's path, not route.path: the router also serves /account/ and /Account, which lost the scope
// (and /rankings/ got a second main landmark around Riley's).
const PLUS_PATHS = PLUS_PAGES.map((p) => p.path);
watch(
  () => [route.matched[0]?.path ?? route.path, route.name] as const,
  ([path, name]) => {
    if (typeof document === "undefined") return;
    setPlusScope(document, isPlusPath(path, PLUS_PATHS, name === "NotFoundView"));
    void nextTick(() => markMain(document, path));
  },
  { immediate: true },
);

// the Ask panel gives focus back (a11y audit M5): to what had it when the panel opened, else the Ask button, which is
// re-rendered once the panel closes. `sync`: read the opener before the panel's own focus watcher moves it.
const askFocus = focusReturn();
const inAskPanel = (el: Element): boolean => !!el.closest("[data-test-ai-panel]");
watch(
  () => assistant.state.open,
  (open) => {
    if (typeof document === "undefined") return;
    if (open) askFocus.remember(document, inAskPanel);
    else void nextTick(() => setTimeout(() => askFocus.restore(document, inAskPanel, () => document.querySelector<HTMLElement>("[data-test-ai-open]")), 40));
  },
  { flush: "sync" },
);

// the inventory's Filters panel starts folded on a phone until the player toggles it (inventoryPager.ts)
watch(
  () => route.path,
  (path) => {
    if (typeof document === "undefined") return;
    if (path === "/inventory") foldInventoryFiltersOnPhone(useSettingsStore() as never);
  },
  { immediate: true },
);

let stopBodyObserver: (() => void) | null = null;
let removeSkipLink: (() => void) | null = null;

// the open panel docks beside the page on a wide screen instead of covering its right side (askDock.ts)
const wideQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(`(min-width: ${DOCK_MIN_WIDTH}px)`) : null;
const wide = ref(wideQuery?.matches ?? false);
const onWideChange = (): void => {
  wide.value = wideQuery?.matches ?? false;
};
watch(
  () => shouldDock(assistant.state, wide.value ? DOCK_MIN_WIDTH : 0),
  (docked) => {
    if (typeof document !== "undefined") document.documentElement.classList.toggle(DOCKED_CLASS, docked);
  },
  { immediate: true },
);

onMounted(() => {
  wideQuery?.addEventListener?.("change", onWideChange);
  installInventoryPagerJump();
  removeSkipLink = installSkipLink(document);
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
  wideQuery?.removeEventListener?.("change", onWideChange);
  document.documentElement.classList.remove(DOCKED_CLASS);
  window.removeEventListener("keydown", onKeydown, true);
  observer?.disconnect();
  stopBodyObserver?.();
  removeSkipLink?.();
  if (pendingSync) clearTimeout(pendingSync);
});
</script>

<style scoped>
/* above Ryan's v3 phone bottom bar (--nav-bottom-h; 0 without it) and a plus page's own pinned bar (--plus-bar-h,
   src/sim/shell/plusBar.ts: the Echo plan's "Show", Build my team's run / save). phone.css § 16 keeps the page's end
   clear of it and slides it away with Ryan's bar on a scroll down. */
.wt-ask-button {
  right: max(1.25rem, env(safe-area-inset-right));
  bottom: max(calc(1.25rem + var(--nav-bottom-h) + var(--plus-bar-h, 0px)), env(safe-area-inset-bottom));
}
@media (max-width: 767px) {
  .wt-ask-button {
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(calc(1rem + var(--nav-bottom-h) + var(--plus-bar-h, 0px)), env(safe-area-inset-bottom));
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
