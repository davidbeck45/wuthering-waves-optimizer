<template>
  <!-- Ctrl/Cmd+K. A native modal <dialog> (toasts re-teleport into it, the page underneath is inert). Focus stays in
  the search field; ↑/↓ move the highlight (aria-activedescendant), Enter runs it, Esc closes. Every key handled
  here stops propagating: on /rankings Riley's document-level handlers would otherwise act on Enter and the arrows. -->
  <Teleport to="body">
    <dialog ref="dialogEl" class="modal wt-palette items-start" aria-label="Command palette" data-test-palette @close="emit('close')" @keydown.stop>
      <div class="wt-palette__box modal-box flex w-full max-w-xl flex-col gap-0 overflow-hidden p-0">
        <div class="flex items-center gap-3 border-b border-base-300 px-4">
          <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-base-content/45" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="wt-palette-list"
            :aria-activedescendant="active ? `wt-palette-${active.key}` : undefined"
            aria-autocomplete="list"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="go"
            class="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-base-content/40 md:text-base"
            placeholder="Search pages, characters, teams — or ask Claude"
            data-test-palette-input
            @keydown="onKeydown" />
          <kbd class="hidden shrink-0 rounded border border-base-300 px-1.5 font-mono text-[11px] leading-5 text-base-content/50 sm:inline">Esc</kbd>
        </div>

        <ul id="wt-palette-list" ref="listRef" role="listbox" class="wt-palette__list min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" data-test-palette-list>
          <template v-for="(group, gi) in grouped" :key="group.group">
            <li v-if="group.group !== 'ask'" role="presentation" class="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-base-content/45" :class="gi === 0 ? 'pt-1' : 'pt-3'">{{ GROUP_LABELS[group.group] }}</li>
            <li
              v-for="item in group.items"
              :id="`wt-palette-${item.key}`"
              :key="item.key"
              role="option"
              :aria-selected="item.key === active?.key"
              class="wt-palette__item flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2"
              :class="[item.key === active?.key ? 'bg-primary/12 text-base-content' : 'hover:bg-base-content/5', item.group === 'ask' ? 'wt-palette__item--ask' : '']"
              :data-test-palette-item="item.key"
              @mousemove="activeKey = item.key"
              @click="run(item)">
              <span
                class="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                :class="item.group === 'ask' ? 'bg-primary text-primary-content' : item.image ? 'bg-base-300' : 'bg-base-200 text-base-content/70'"
                aria-hidden="true">
                <img v-if="item.image" :src="item.image" alt="" class="size-8 object-cover" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" />
                <svg v-else-if="item.group === 'ask'" viewBox="0 0 24 24" class="size-4" fill="currentColor"><path :d="item.icon ?? ''" /></svg>
                <svg v-else viewBox="0 0 24 24" class="size-[18px]" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path :d="item.icon ?? ''" /></svg>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ item.title }}</span>
                <span v-if="item.subtitle" class="block truncate text-xs text-base-content/55">{{ item.subtitle }}</span>
              </span>
              <span v-if="item.badge" class="shrink-0 rounded-md border border-base-300 px-1.5 font-mono text-[11px] leading-5 text-base-content/60">{{ item.badge }}</span>
              <svg v-if="item.key === active?.key" viewBox="0 0 24 24" class="hidden size-4 shrink-0 text-base-content/40 sm:block" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 10l-5 5 5 5" /><path d="M20 4v7a4 4 0 01-4 4H4" /></svg>
            </li>
          </template>
          <li v-if="!items.length" class="px-3 py-8 text-center text-sm text-base-content/55" role="presentation">Nothing matches “{{ query }}”.</li>
        </ul>

        <div class="hidden shrink-0 items-center gap-4 border-t border-base-300 px-4 py-2 text-[11px] text-base-content/50 sm:flex">
          <span><kbd class="wt-kbd">↑</kbd><kbd class="wt-kbd">↓</kbd> move</span>
          <span><kbd class="wt-kbd">↵</kbd> open</span>
          <span><kbd class="wt-kbd">Esc</kbd> close</span>
          <span class="ml-auto"><kbd class="wt-kbd">{{ modKey }}</kbd><kbd class="wt-kbd">J</kbd> Claude</span>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useCharacterStore } from "../../stores/character";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { allCharactersList, characterPortraitUrl, getCharactersAvailable } from "../../characters/characters";
import { useTheme, getThemeStyle } from "../../composables/useTheme";
import { useClassicUi } from "../../composables/useClassicUi";
import { useSuggestNavigation } from "../../composables/useSuggestNavigation";
import { useToast } from "../../composables/useToast";
import { useAiSettings } from "../ai/aiSettings";
import { useAssistant } from "../ai/useAssistant";
import { characterRowsOf, GROUP_LABELS, paletteItems, rankPalette, type PaletteGroup, type PaletteItem } from "./paletteItems";
import { isAppRoute, openCharacter, openTeam } from "./navigation";
import type { CharacterStoreLike } from "./navigation";
import { modKeyLabel } from "./shellDom";

const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const characterStore = useCharacterStore();
const teamStore = useTeamRotationsStore();
const { theme, setTheme } = useTheme();
const { isClassicUi, setClassicUi } = useClassicUi();
const { showToast } = useToast();
const ai = useAiSettings();
const assistant = useAssistant();
const modKey = modKeyLabel();

const dialogEl = ref<HTMLDialogElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const query = ref("");

const allItems = computed<PaletteItem[]>(() => {
  const roster = getCharactersAvailable();
  const teams = (teamStore.teams as Array<{ id: string; name?: string; characterIds?: Array<string | null> }>).map((t) => ({
    id: t.id,
    name: t.name ?? "",
    members: (t.characterIds ?? []).filter((id): id is string => !!id).map((id) => roster.five.concat(roster.four).find((c) => c.key === id)?.name ?? id),
  }));
  return paletteItems({
    hasRoute: (path) => isAppRoute(router, path),
    characters: characterRowsOf([...roster.five, ...roster.four], allCharactersList, characterStore.characters as Record<string, any>, characterPortraitUrl),
    teams,
    themeStyle: getThemeStyle(theme.value ?? "dark"),
    classicUi: isClassicUi.value,
    aiKeySet: ai.key.value.present,
    aiChat: assistant.hasChat.value,
    mod: modKey,
  });
});

const items = computed(() => rankPalette(query.value, allItems.value));
const nav = useSuggestNavigation(items, { initialIndex: () => 0 });
const activeKey = computed({
  get: () => items.value[nav.activeIndex.value]?.key ?? null,
  set: (key: string | null) => {
    const i = items.value.findIndex((x) => x.key === key);
    if (i >= 0) nav.activeIndex.value = i;
  },
});
const active = computed(() => items.value[nav.activeIndex.value] ?? null);

/** Items in display order, grouped (the ask row is its own group, first or last as ranked). */
const grouped = computed(() => {
  const out: Array<{ group: PaletteGroup; items: PaletteItem[] }> = [];
  for (const item of items.value) {
    const last = out[out.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
});

watch(active, (item) => {
  if (!item) return;
  void nextTick(() => listRef.value?.querySelector(`[data-test-palette-item="${CSS.escape(item.key)}"]`)?.scrollIntoView({ block: "nearest" }));
});

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") return; // the dialog's own cancel closes it
  if (nav.onKeydown(event, run)) event.stopPropagation();
}

function close(): void {
  dialogEl.value?.close();
  // not only from the dialog's `close` event: that is queued, and the run below may navigate first
  emit("close");
}

async function run(item: PaletteItem): Promise<void> {
  const r = item.run;
  close();
  switch (r.kind) {
    case "route":
      await router.push(r.path);
      break;
    case "character":
      await openCharacter(router, characterStore as unknown as CharacterStoreLike, r.key);
      break;
    case "team":
      if (!(await openTeam(router, r.id))) showToast(`Go back to the team list to open "${item.title}".`, "info");
      break;
    case "ask":
      assistant.ask(r.question);
      break;
    case "action":
      switch (r.action) {
        case "toggle-theme":
          setTheme(getThemeStyle(theme.value ?? "dark") === "light" ? "dark" : "light");
          break;
        case "toggle-ui":
          setClassicUi(!isClassicUi.value, "utility-menu");
          break;
        case "ai-settings":
          assistant.openSettings();
          break;
        case "ai-open":
          assistant.open();
          break;
        case "ai-new-chat":
          assistant.newChat();
          assistant.open();
          break;
      }
      break;
  }
}

onMounted(() => {
  void nextTick(() => {
    if (dialogEl.value && !dialogEl.value.open) dialogEl.value.showModal();
    inputRef.value?.focus();
  });
});
onBeforeUnmount(() => {
  if (dialogEl.value?.open) dialogEl.value.close();
});
</script>

<style scoped>
.wt-palette {
  z-index: 9500;
  align-items: start;
  padding-top: min(12vh, 7rem);
}
.wt-palette__box {
  max-height: min(70vh, 34rem);
  border: 1px solid oklch(var(--bc) / 0.1);
}
.bg-primary\/12 {
  background-color: oklch(var(--p) / 0.12);
}
.wt-kbd {
  display: inline-block;
  min-width: 1.25rem;
  margin-right: 0.15rem;
  border-radius: 0.25rem;
  border: 1px solid oklch(var(--bc) / 0.18);
  padding: 0 0.3rem;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.15rem;
}
/* phone.css § 6 turns every phone modal into a padded bottom sheet (`.modal .modal-box.modal-box`); the palette stays
   a search box at the top, where the keyboard can't cover it, with its own edge-to-edge rows */
@media (max-width: 767px) {
  .wt-palette.modal.modal {
    align-items: start;
    padding: 0.75rem 0.5rem 0;
  }
  .wt-palette .wt-palette__box.modal-box.modal-box {
    width: 100%;
    max-width: none;
    max-height: calc(100dvh - 1.5rem);
    padding: 0;
    border-radius: 1rem;
  }
}
</style>
