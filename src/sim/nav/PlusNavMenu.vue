<template>
  <details
    ref="root"
    class="plus-nav"
    :class="[`plus-nav--${variant}`, { 'dropdown basis-[40px] sm:basis-[48px] mr-1 sm:mr-2': variant === 'bar', 'shrink-0 w-11': variant === 'header' }]"
    data-test-nav-plus
    @toggle="onToggle">
    <summary
      v-if="variant !== 'rail'"
      class="btn btn-ghost p-0 flex justify-center w-full min-w-0 relative"
      :class="{ 'btn-active': isPlusPage }"
      title="Tools+ pages: My account, rankings, Today and more"
      data-test-nav-rankings>
      <svg xmlns="http://www.w3.org/2000/svg" class="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 20h16M6 20V10M12 20V4M18 20v-7" />
      </svg>
      <svg class="plus-nav__caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <!-- What's new: something on /whats-new this browser has not seen (src/sim/whatsNew/useWhatsNew.ts) -->
      <span v-if="unseen" class="plus-nav__dot" aria-hidden="true" data-test-nav-plus-dot></span>
      <span class="sr-only">Tools+ pages{{ unseen ? `, ${unseen} new on What's new` : "" }}</span>
    </summary>
    <!-- v3 desktop (Ryan's ADR 0045): a rail item styled like his; on phones the icon above sits in his header -->
    <summary
      v-else
      class="plus-nav__tab"
      :class="{ 'plus-nav__tab--on': isPlusPage }"
      @click="placeRailMenu"
      title="Tools+ pages: My account, rankings, Today and more"
      data-test-nav-rankings>
      <span class="plus-nav__pill">
        <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 20h16M6 20V10M12 20V4M18 20v-7" />
        </svg>
        <span v-if="unseen" class="plus-nav__dot plus-nav__dot--rail" aria-hidden="true" data-test-nav-plus-dot></span>
      </span>
      <span class="truncate max-w-full">Tools+<span v-if="unseen" class="sr-only">, {{ unseen }} new on What's new</span></span>
    </summary>
    <!-- a list of links, not role="menu": it is navigation, and a menu role promised arrow keys it never had (a11y L3) -->
    <ul class="plus-nav__menu" data-test-nav-plus-menu>
      <li class="plus-nav__eyebrow" aria-hidden="true">Wuthering Tools+</li>
      <!-- the command palette (src/sim/shell/CommandPalette.vue): on a phone this is the only way to open it -->
      <li class="plus-nav__search-row" :class="{ 'plus-nav__search-row--half': unseen }">
        <button type="button" class="plus-nav__search" data-test-nav-plus-search @click="openPalette">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span class="plus-nav__search-text">Search pages, characters, teams…</span>
          <kbd class="plus-nav__kbd">{{ modKey }} K</kbd>
        </button>
      </li>
      <!-- What's new sits last in the list: while it holds something unseen, one line up here says what the dot is for -->
      <li v-if="unseen" class="plus-nav__news-row">
        <RouterLink :to="WHATS_NEW_PATH" class="plus-nav__news" data-test-nav-plus-news @click="close">
          <span class="plus-nav__news-dot" aria-hidden="true"></span>
          <span class="plus-nav__news-text">{{ unseenText(unseen, hasMarker) }}</span>
          <span class="plus-nav__news-go" aria-hidden="true">›</span>
        </RouterLink>
      </li>
      <!-- the pages in sections (PLUS_GROUPS): a column each beside the rail, stacked on a phone. Titles only: the
           eighteen descriptions made the menu 837 px tall; each is the link's tooltip and the palette's subtitle -->
      <li v-for="group in groups" :key="group.id" class="plus-nav__group" :data-tone="group.id">
        <div role="group" :aria-labelledby="`${uid}-${group.id}`">
          <p :id="`${uid}-${group.id}`" class="plus-nav__group-head" :data-test-nav-plus-group="group.id">
            <span class="plus-nav__group-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="group.icon" /></svg>
            </span>
            {{ group.title }}
          </p>
          <ul class="plus-nav__group-list">
            <li v-for="page in group.pages" :key="page.path">
              <RouterLink
                :to="page.path"
                class="plus-nav__item"
                :class="{ 'plus-nav__item--on': page.path === activePath }"
                :aria-current="page.path === activePath ? 'page' : undefined"
                :title="page.description"
                :data-test-nav-plus-page="page.path"
                @click="close">
                <span class="plus-nav__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="page.icon" /></svg>
                </span>
                <span class="plus-nav__title">
                  {{ page.title }}
                  <span v-if="unseen && page.path === WHATS_NEW_PATH" class="plus-nav__new" data-test-nav-plus-new>{{ unseen }} new</span>
                </span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </details>
  <!-- v3 desktop rail: Ask under Tools+, so the floating button no longer covers the page (src/sim/shell/askDock.ts);
       on a short screen the rail has no room for one more item and the floating button stays -->
  <PlusRailAsk v-if="variant === 'rail' && railHasRoom" />
</template>

<script setup lang="ts">
// Wuthering Tools+ — the nav's rankings hub: the bar-chart icon opens a menu of every plus page
// (src/sim/shell/plusPages.ts — read-only here, the registry is shared). Nav.vue mounts it in place of
// the old /rankings link with one line; `curPage` tells the two rankings pages apart.
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { useRoute } from "vue-router";
import { PLUS_GROUPS, PLUS_PAGES, plusPagesIn } from "../shell/plusPages";
import { useAssistant } from "../ai/useAssistant";
import { modKeyLabel } from "../shell/shellDom";
import { railMenuTop } from "./railMenu";
import PlusRailAsk from "./PlusRailAsk.vue";
import { useMediaQuery } from "../../composables/useMediaQuery";
import { RAIL_ASK_MIN_HEIGHT } from "../shell/askDock";
import { useWhatsNew } from "../whatsNew/useWhatsNew";
import { WHATS_NEW_PATH, unseenText } from "../whatsNew/whatsNew";

// "bar": the classic icon bar; "rail" / "header": the v3 desktop rail and phone header (NavRail / NavPhoneHeader).
const props = withDefaults(defineProps<{ curPage: string; variant?: "bar" | "rail" | "header" }>(), { variant: "bar" });
const route = useRoute();
/** the menu's sections, each with its pages (src/sim/shell/plusPages.ts) */
const groups = PLUS_GROUPS.map((g) => ({ ...g, pages: plusPagesIn(g.id) }));
/** ids for the section headings: the rail and the phone header can both be mounted */
const uid = useId();
const root = ref<HTMLDetailsElement | null>(null);
const railHasRoom = useMediaQuery(`(min-height: ${RAIL_ASK_MIN_HEIGHT}px)`);
/** how many What's new entries this browser has not seen: the dot on the icon and the count on its row */
const { count: unseen, hasMarker } = useWhatsNew();

/** the plus page this is: the Nav's curPage ("my-rankings" → "/my-rankings"), else the route */
const activePath = computed(() => {
  const byPage = PLUS_PAGES.find((p) => p.path === `/${props.curPage}`);
  if (byPage) return byPage.path;
  return PLUS_PAGES.find((p) => p.path === route?.path)?.path ?? null;
});
const isPlusPage = computed(() => activePath.value !== null);

function close(): void {
  root.value?.removeAttribute("open");
}
const assistant = useAssistant();
const modKey = modKeyLabel();
function openPalette(): void {
  // the palette is a modal <dialog>, which hands focus back to whatever had it before showModal(): the summary, not
  // this row, which the closed menu hides (a11y audit L2)
  root.value?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  close();
  assistant.setPaletteOpen(true);
}
function onPointer(event: PointerEvent): void {
  if (root.value?.open && !root.value.contains(event.target as Node)) close();
}
function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && root.value?.open) {
    close();
    root.value.querySelector("summary")?.focus();
  }
}
// the rail's menu opens beside its item (railMenu.ts): placed on the summary's click, before the menu shows, with the
// height it had last time; measured again once it is open
let railMenuHeight = 640;
function placeRailMenu(): void {
  if (props.variant !== "rail" || !root.value) return;
  const item = root.value.querySelector("summary");
  const menu = root.value.querySelector<HTMLElement>(".plus-nav__menu");
  if (!item || !menu) return;
  if (menu.offsetHeight) railMenuHeight = menu.offsetHeight;
  menu.style.top = `${railMenuTop(item.getBoundingClientRect().top, railMenuHeight, window.innerHeight)}px`;
}
function onToggle(): void {
  if (!root.value?.open) return;
  placeRailMenu();
  // the current page's row, else the first: one selector list would pick whichever comes first in the document
  const row = root.value.querySelector<HTMLElement>(".plus-nav__item--on") ?? root.value.querySelector<HTMLElement>(".plus-nav__item");
  row?.focus({ preventScroll: true });
}
function onResize(): void {
  if (root.value?.open) placeRailMenu();
}
onMounted(() => {
  document.addEventListener("pointerdown", onPointer);
  document.addEventListener("keydown", onKey);
  if (props.variant === "rail") window.addEventListener("resize", onResize);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointer);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onResize);
});
</script>

<style scoped>
.plus-nav > summary {
  list-style: none;
}
.plus-nav > summary::-webkit-details-marker {
  display: none;
}
.plus-nav__caret {
  position: absolute;
  right: 3px;
  bottom: 9px;
  width: 7px;
  height: 5px;
  opacity: 0.55;
}
/* What's new: unseen entries. The ring is the bar's own colour, so the dot reads on the icon in every theme */
.plus-nav__dot {
  position: absolute;
  top: 7px;
  right: 5px;
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  background: oklch(var(--p));
  box-shadow: 0 0 0 2px oklch(var(--b1));
  pointer-events: none;
}
.plus-nav__dot--rail {
  top: 2px;
  right: 9px;
}
.plus-nav__new {
  margin-left: 0.35rem;
  padding: 0.05rem 0.45rem;
  border-radius: 9999px;
  font-size: 0.66rem;
  font-weight: 700;
  white-space: nowrap;
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.plus-nav__news {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.5rem;
  margin: 0 0 0.3rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.6rem;
  font-size: 0.82rem;
  font-weight: 650;
  text-align: left;
  color: inherit;
  background: oklch(var(--p) / 0.12);
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.3);
}
.plus-nav__news:hover,
.plus-nav__news:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.7);
}
.plus-nav__news-dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: oklch(var(--p));
}
.plus-nav__news-text {
  flex: 1;
  min-width: 0;
}
.plus-nav__news-go {
  flex-shrink: 0;
  font-weight: 700;
}
.plus-nav__menu {
  position: absolute;
  z-index: 200;
  top: calc(100% + 0.35rem);
  left: 0;
  width: 21rem;
  /* 12+ pages outgrow a laptop screen: the menu scrolls inside itself instead of running off the bottom */
  max-height: calc(100dvh - 5.5rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.35rem;
  border-radius: 0.85rem;
  background: oklch(var(--b2));
  color: oklch(var(--bc));
  box-shadow:
    0 16px 40px -12px rgb(0 0 0 / 0.55),
    inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.plus-nav__eyebrow {
  padding: 0.35rem 0.6rem 0.25rem;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: oklch(var(--bc) / 0.5);
}
.plus-nav__search {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.75rem;
  margin: 0.1rem 0 0.3rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.6rem;
  font-size: 0.85rem;
  text-align: left;
  color: oklch(var(--bc) / 0.7);
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.12);
}
.plus-nav__search:hover,
.plus-nav__search:focus-visible {
  color: oklch(var(--bc));
  outline: none;
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.6);
}
.plus-nav__search svg {
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
}
.plus-nav__search-text {
  flex: 1;
  min-width: 0;
}
.plus-nav__kbd {
  flex-shrink: 0;
  padding: 0 0.4rem;
  border-radius: 0.3rem;
  font-family: ui-monospace, monospace;
  font-size: 0.68rem;
  line-height: 1.35rem;
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.2);
}
/* touch screens have no Ctrl K */
@media (pointer: coarse) {
  .plus-nav__kbd {
    display: none;
  }
}
/* a section: its heading carries a small mark in the section's tone (a theme token; the heading's words say which
   section it is, the tone only helps the eye find it) */
.plus-nav__group {
  --tone: var(--p);
  min-width: 0;
  margin-top: 0.15rem;
}
.plus-nav__group[data-tone="rankings"] {
  --tone: var(--s);
}
.plus-nav__group[data-tone="teams"] {
  --tone: var(--a);
}
.plus-nav__group[data-tone="gear"] {
  --tone: var(--in);
}
.plus-nav__group[data-tone="more"] {
  --tone: var(--bc);
}
.plus-nav__group-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  padding: 0.3rem 0.6rem 0.2rem;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1.3;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: oklch(var(--bc) / 0.75);
}
.plus-nav__group-mark {
  display: inline-flex;
  flex-shrink: 0;
  width: 1.15rem;
  height: 1.15rem;
  padding: 0.18rem;
  border-radius: 0.3rem;
  color: oklch(var(--tone));
  background: oklch(var(--tone) / 0.16);
  box-shadow: inset 0 0 0 1px oklch(var(--tone) / 0.45);
}
.plus-nav__group-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.plus-nav__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 44px;
  padding: 3px 0.5rem;
  border-radius: 0.6rem;
  text-align: left;
  color: inherit;
}
.plus-nav__item:hover,
.plus-nav__item:focus-visible {
  background: oklch(var(--bc) / 0.07);
  outline: none;
}
.plus-nav__item:focus-visible {
  box-shadow: inset 0 0 0 2px oklch(var(--p) / 0.8);
}
.plus-nav__item--on {
  background: oklch(var(--p) / 0.14);
  box-shadow: inset 3px 0 0 oklch(var(--p));
}
.plus-nav__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0.35rem;
  border-radius: 0.45rem;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
}
.plus-nav__title {
  min-width: 0;
  font-size: 0.84rem;
  font-weight: 620;
  line-height: 1.2;
}
/* style.css paints every `.navbar svg path` solid black on light themes (for upstream's filled icons); these are
   outline icons in the accent colour, and the caret is a stroke */
:root[data-theme-style="light"] .plus-nav__menu svg path {
  stroke: currentColor !important;
  fill: none !important;
}
:root[data-theme-style="light"] .plus-nav__caret path {
  fill: none !important;
}
/* under 1024 px (phones, tablets, the classic bar): sections stacked, two pages to a line, so every heading is on a
   phone's screen at 130 % text; Tab follows the reading order */
@media (max-width: 1023px) {
  .plus-nav__group-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 0.25rem;
  }
  .plus-nav--bar .plus-nav__menu {
    width: 26rem;
  }
  /* the header already says Tools+; one line each for the search and the What's new rows */
  .plus-nav__eyebrow {
    display: none;
  }
  .plus-nav__search-text,
  .plus-nav__news-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .plus-nav__news {
    min-height: 44px;
  }
  .plus-nav__group-head {
    padding: 0.35rem 0.5rem 0.1rem;
  }
  .plus-nav__item {
    gap: 0.4rem;
    padding: 2px 0.35rem;
  }
  /* px, not rem: at 130 % text a rem-sized icon took the room the title needs */
  .plus-nav__icon {
    width: 26px;
    height: 26px;
    padding: 5px;
  }
  .plus-nav__title {
    font-size: 0.8rem;
  }
  .plus-nav__group-mark {
    width: 18px;
    height: 18px;
    padding: 3px;
  }
}
/* wide screens: one column per section, so the menu is about 280 px tall and opens beside its button (railMenu.ts);
   Tab runs down a column, then on to the next */
@media (min-width: 1024px) {
  .plus-nav__menu {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    column-gap: 0.3rem;
    align-content: start;
    width: min(56rem, calc(100vw - var(--nav-rail-w, 0px) - 1.5rem));
  }
  .plus-nav__eyebrow,
  .plus-nav__search-row,
  .plus-nav__news-row {
    grid-column: 1 / -1;
  }
  .plus-nav__search-row--half {
    grid-column: 1 / span 3;
  }
  .plus-nav__search-row--half + .plus-nav__news-row {
    grid-column: 4 / -1;
  }
  .plus-nav__group-head {
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .plus-nav__search-row--half + .plus-nav__news-row .plus-nav__news {
    min-height: 2.75rem;
    margin: 0.1rem 0 0.3rem;
  }
}
/* phones: a full-width sheet under the bar instead of a menu anchored to the icon */
@media (max-width: 639px) {
  .plus-nav--bar .plus-nav__menu {
    position: fixed;
    top: var(--nav-h);
    left: 0.5rem;
    right: 0.5rem;
    width: auto;
    max-height: calc(100dvh - var(--nav-h) - 0.5rem);
  }
}

/* v3 desktop — the rail item copies NavRail's own (its styles are scoped) */
.plus-nav__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.4rem 0;
  border-radius: 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc));
  opacity: 0.7;
  cursor: pointer;
}
.plus-nav__tab:hover,
.plus-nav__tab--on,
.plus-nav[open] > .plus-nav__tab {
  opacity: 1;
}
.plus-nav__pill {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 2rem;
  border-radius: 999px;
  transition: background-color 0.15s;
}
.plus-nav__tab:hover .plus-nav__pill {
  background: oklch(var(--bc) / 0.06);
}
.plus-nav__tab--on .plus-nav__pill {
  background: oklch(var(--p) / 0.25);
}
/* desktop rail: the menu opens beside the rail, top-aligned with the screen */
.plus-nav--rail .plus-nav__menu {
  position: fixed;
  top: 0.75rem; /* until placeRailMenu sets it beside the item */
  left: calc(var(--nav-rail-w) + 0.5rem);
  max-height: calc(100dvh - 1.5rem);
}
/* v3 phone / tablet header: a sheet under the header, right-aligned under the icon, clear of the bottom bar */
.plus-nav--header .plus-nav__menu {
  position: fixed;
  top: var(--nav-h);
  left: auto;
  right: 0.5rem;
  width: min(28rem, calc(100vw - 1rem));
  max-height: calc(100dvh - var(--nav-h) - var(--nav-bottom-h) - 0.5rem);
}
</style>

<style>
/* The nav (#navbar-container, fixed, z-50) sits under the Ask button (z-55, src/sim/shell/PlusShell.vue); while this
   menu is open the nav steps above it, so the button never covers a menu row. */
#navbar-container:has(.plus-nav[open]) {
  z-index: 61;
}
</style>
