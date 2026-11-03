<template>
  <Nav cur-page="not-found" :disable-mobile-nav="true"></Nav>
  <div class="wt-404" data-test-not-found>
    <header class="wt-404__head">
      <span class="wt-404__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
        </svg>
      </span>
      <div class="min-w-0">
        <h1 class="wt-404__h1">Page not found</h1>
        <p class="wt-404__sub">
          There's no page at <code class="wt-404__path" data-test-not-found-path>{{ requested }}</code>. The link may be old, or the address has a typo.
        </p>
      </div>
    </header>

    <RouterLink v-if="suggestion" :to="suggestion.path" class="wt-404__suggest" data-test-not-found-suggest>
      <span class="wt-404__suggest-label">Did you mean</span>
      <span class="wt-404__suggest-title">{{ suggestion.title }}</span>
      <span aria-hidden="true">→</span>
    </RouterLink>

    <!-- the search row comes before the page links: lower down, a phone's floating Ask button sat on the end of it -->
    <button type="button" class="wt-404__search" data-test-not-found-search @click="assistant.setPaletteOpen(true)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <span class="min-w-0 flex-1 truncate text-left">Search pages, characters and teams…</span>
      <kbd class="wt-404__kbd">{{ modKey }} K</kbd>
    </button>

    <nav class="wt-404__main" aria-label="Main pages" :style="{ '--wt-404-main-n': mainLinks.length }">
      <RouterLink v-for="link in mainLinks" :key="link.path" :to="link.path" class="wt-404__main-link" :data-test-not-found-link="link.path">
        <span class="wt-404__main-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="link.icon" /></svg>
        </span>
        <span class="min-w-0">
          <span class="wt-404__main-title">{{ link.title }}</span>
          <span class="wt-404__main-desc">{{ link.description }}</span>
        </span>
      </RouterLink>
    </nav>

    <section class="wt-404__more" aria-labelledby="wt-404-more">
      <h2 id="wt-404-more" class="wt-404__h2">Tools+ pages</h2>
      <p class="wt-404__hint">The rest of what Wuthering Tools+ adds to the calculator. The full list opens from the bar-chart icon at the top of every page.</p>
      <ul class="wt-404__grid">
        <li v-for="page in morePages" :key="page.path">
          <RouterLink :to="page.path" class="wt-404__page" :data-test-not-found-page="page.path">
            <span class="wt-404__page-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="page.icon" /></svg>
            </span>
            <span class="min-w-0">
              <span class="wt-404__page-title">{{ page.title }}</span>
              <span class="wt-404__page-desc">{{ page.description }}</span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the catch-all route (main.ts): any address the router doesn't know lands here instead of a blank
// white page. The Nav mounts (and with it the saved theme); the page names the address, guesses the page it meant
// (notFound.ts `closestPage`) and links the main pages, the palette and every plus page.
import { computed } from "vue";
import { useRoute } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useAssistant } from "../ai/useAssistant";
import { closestPage } from "./notFound";
import { CORE_PAGES } from "./paletteItems";
import { PLUS_PAGES } from "./plusPages";
import { modKeyLabel } from "./shellDom";

useDocumentTitle("Page not found — Wuthering Waves Calculator & Optimizer");

const route = useRoute();
const assistant = useAssistant();
const modKey = modKeyLabel();

const pick = (path: string) => [...CORE_PAGES, ...PLUS_PAGES].find((p) => p.path === path)!;
const MAIN_LINKS = [pick("/"), pick("/account"), pick("/today")];

const requested = computed(() => route.fullPath);
const suggestion = computed(() => closestPage(route.path, [...CORE_PAGES, ...PLUS_PAGES]));
// each page linked once: the guess, then the main pages without it, then the Tools+ pages not linked above
// (/acount listed My account three times and Today twice)
const mainLinks = computed(() => MAIN_LINKS.filter((link) => link.path !== suggestion.value?.path));
const morePages = computed(() => {
  const above = new Set([suggestion.value?.path, ...MAIN_LINKS.map((link) => link.path)]);
  return PLUS_PAGES.filter((page) => !above.has(page.path));
});
</script>

<style scoped>
.wt-404 {
  max-width: 64rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  color: oklch(var(--bc));
}
.wt-404__head {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
}
.wt-404__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 3rem;
  height: 3rem;
  padding: 0.6rem;
  border-radius: 0.9rem;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
}
.wt-404__h1 {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;
}
.wt-404__sub {
  margin-top: 0.35rem;
  font-size: 0.95rem;
  line-height: 1.5;
  color: oklch(var(--bc) / 0.7);
}
.wt-404__path {
  padding: 0.05rem 0.35rem;
  border-radius: 0.35rem;
  font-size: 0.9em;
  overflow-wrap: anywhere;
  background: oklch(var(--bc) / 0.08);
  color: oklch(var(--bc));
}
.wt-404__suggest {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
  margin-top: 1.25rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.75rem;
  background: oklch(var(--p) / 0.12);
  color: oklch(var(--bc));
}
.wt-404__suggest:hover {
  background: oklch(var(--p) / 0.2);
}
.wt-404__suggest-label {
  font-size: 0.85rem;
  color: oklch(var(--bc) / 0.7);
}
.wt-404__suggest-title {
  font-weight: 650;
}
.wt-404__main {
  display: grid;
  grid-template-columns: repeat(var(--wt-404-main-n, 3), minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1.5rem;
}
.wt-404__main-link {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.85rem 0.9rem;
  border-radius: 0.85rem;
  background: oklch(var(--b2));
  color: inherit;
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.wt-404__main-link:hover,
.wt-404__page:hover {
  background: oklch(var(--b3));
}
.wt-404__main-icon,
.wt-404__page-icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0.45rem;
  border-radius: 0.6rem;
  color: oklch(var(--p));
  background: oklch(var(--p) / 0.12);
}
.wt-404__main-title,
.wt-404__page-title {
  display: block;
  font-weight: 650;
  line-height: 1.3;
}
.wt-404__main-desc,
.wt-404__page-desc {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: oklch(var(--bc) / 0.65);
}
.wt-404__search {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 3rem;
  margin-top: 1.25rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.85rem;
  background: oklch(var(--b2));
  color: oklch(var(--bc) / 0.7);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.12);
}
.wt-404__search:hover {
  color: oklch(var(--bc));
}
.wt-404__search svg {
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
}
.wt-404__kbd {
  flex-shrink: 0;
  padding: 0 0.4rem;
  border-radius: 0.3rem;
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
  line-height: 1.4rem;
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.2);
}
.wt-404__more {
  margin-top: 2.25rem;
}
.wt-404__h2 {
  font-size: 1.15rem;
  font-weight: 700;
}
.wt-404__hint {
  margin-top: 0.2rem;
  font-size: 0.85rem;
  color: oklch(var(--bc) / 0.65);
}
.wt-404__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-top: 0.9rem;
}
.wt-404__page {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  height: 100%;
  padding: 0.7rem 0.8rem;
  border-radius: 0.75rem;
  color: inherit;
}
@media (max-width: 767px) {
  .wt-404 {
    padding: 1.25rem 1rem 2rem;
  }
  .wt-404__h1 {
    font-size: 1.4rem;
  }
  .wt-404__main,
  .wt-404__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .wt-404__main {
    gap: 0.5rem;
  }
  .wt-404__kbd {
    display: none;
  }
}
</style>
