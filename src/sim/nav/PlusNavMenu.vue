<template>
  <details ref="root" class="plus-nav dropdown basis-[40px] sm:basis-[48px] mr-1 sm:mr-2" data-test-nav-plus @toggle="onToggle">
    <summary
      class="btn btn-ghost p-0 flex justify-center w-full min-w-0 relative"
      :class="{ 'btn-active': isPlusPage }"
      title="Rankings & your account (Wuthering Tools+)"
      aria-haspopup="menu"
      data-test-nav-rankings>
      <svg xmlns="http://www.w3.org/2000/svg" class="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 20h16M6 20V10M12 20V4M18 20v-7" />
      </svg>
      <svg class="plus-nav__caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span class="sr-only">Rankings and account pages</span>
    </summary>
    <ul class="plus-nav__menu" role="menu" data-test-nav-plus-menu>
      <li class="plus-nav__eyebrow" role="presentation">Wuthering Tools+</li>
      <li v-for="page in PLUS_PAGES" :key="page.path" role="none">
        <RouterLink
          :to="page.path"
          role="menuitem"
          class="plus-nav__item"
          :class="{ 'plus-nav__item--on': page.path === activePath }"
          :aria-current="page.path === activePath ? 'page' : undefined"
          :data-test-nav-plus-page="page.path"
          @click="close">
          <span class="plus-nav__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="page.icon" /></svg>
          </span>
          <span class="plus-nav__text">
            <span class="plus-nav__title">{{ page.title }}</span>
            <span class="plus-nav__desc">{{ page.description }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </details>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the nav's rankings hub: the bar-chart icon opens a menu of every plus page
// (src/sim/shell/plusPages.ts — read-only here, the registry is shared). Nav.vue mounts it in place of
// the old /rankings link with one line; `curPage` tells the two rankings pages apart.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { PLUS_PAGES } from "../shell/plusPages";

const props = defineProps<{ curPage: string }>();
const route = useRoute();
const root = ref<HTMLDetailsElement | null>(null);

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
function onPointer(event: PointerEvent): void {
  if (root.value?.open && !root.value.contains(event.target as Node)) close();
}
function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && root.value?.open) {
    close();
    root.value.querySelector("summary")?.focus();
  }
}
function onToggle(): void {
  if (root.value?.open) (root.value.querySelector(".plus-nav__item--on, .plus-nav__item") as HTMLElement | null)?.focus({ preventScroll: true });
}
onMounted(() => {
  document.addEventListener("pointerdown", onPointer);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointer);
  document.removeEventListener("keydown", onKey);
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
.plus-nav__item {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.6rem;
  text-align: left;
  color: inherit;
}
.plus-nav__item:hover,
.plus-nav__item:focus-visible {
  background: oklch(var(--bc) / 0.07);
  outline: none;
}
.plus-nav__item--on {
  background: oklch(var(--p) / 0.12);
}
.plus-nav__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  padding: 0.4rem;
  border-radius: 0.5rem;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
}
.plus-nav__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.plus-nav__title {
  font-size: 0.85rem;
  font-weight: 650;
  line-height: 1.3;
}
.plus-nav__desc {
  font-size: 0.72rem;
  line-height: 1.35;
  color: oklch(var(--bc) / 0.6);
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
/* wide screens: two columns, so the whole list fits without scrolling */
@media (min-width: 1024px) {
  .plus-nav__menu {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    width: 42rem;
  }
  .plus-nav__eyebrow {
    grid-column: 1 / -1;
  }
}
/* phones: a full-width sheet under the 80 px bar instead of a menu anchored to the icon */
@media (max-width: 639px) {
  .plus-nav__menu {
    position: fixed;
    top: 80px;
    left: 0.5rem;
    right: 0.5rem;
    width: auto;
    max-height: calc(100dvh - 80px - 0.5rem);
  }
}
</style>
