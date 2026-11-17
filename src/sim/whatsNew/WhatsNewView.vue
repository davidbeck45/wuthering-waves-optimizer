<template>
  <Nav cur-page="whats-new" :disable-mobile-nav="true"></Nav>
  <div class="wn" data-test-whats-new>
    <header class="wn-head">
      <h1 class="wn-h1">What's new on Tools+</h1>
      <!-- two parts of one page: what was added to the site, and what moved in the account's own figures -->
      <nav class="wn-tabs" aria-label="Parts of this page">
        <RouterLink replace :to="{ path: WHATS_NEW_PATH }" class="wn-tab" :class="{ 'wn-tab--on': tab === 'features' }" :aria-current="tab === 'features' ? 'page' : undefined" data-test-whats-new-tab="features">
          New on Tools+
        </RouterLink>
        <RouterLink
          replace
          :to="{ path: WHATS_NEW_PATH, query: { tab: 'numbers' } }"
          class="wn-tab"
          :class="{ 'wn-tab--on': tab === 'numbers' }"
          :aria-current="tab === 'numbers' ? 'page' : undefined"
          data-test-whats-new-tab="numbers">
          Your numbers
        </RouterLink>
      </nav>
    </header>

    <NumbersMoved v-if="tab === 'numbers'" />

    <template v-else>
      <p class="wn-intro">
        What was added to Wuthering Tools+, newest first: what each thing does, where it is, and a button that opens it. The
        calculator's own changes are on
        <RouterLink to="/updates" class="wn-link" data-test-whats-new-updates>Ryan's Updates page</RouterLink>.
      </p>
      <p v-if="fresh.size" class="wn-fresh" role="status" data-test-whats-new-fresh-note>
        <span class="wn-dot" aria-hidden="true"></span>
        {{ freshText }}. They are marked New below.
      </p>

      <section v-for="group in groups" :key="group.date" class="wn-group" :aria-labelledby="`wn-day-${group.date}`" data-test-whats-new-group :data-date="group.date">
        <h2 :id="`wn-day-${group.date}`" class="wn-h2">
          {{ group.label }}
          <span class="wn-count">{{ group.entries.length }} {{ group.entries.length === 1 ? "thing" : "things" }}</span>
        </h2>
        <ul class="wn-list">
          <li v-for="e in group.entries" :key="e.id" class="wn-entry" :class="{ 'wn-entry--new': fresh.has(e.id) }" :data-test-whats-new-entry="e.id">
            <div class="wn-entry__top">
              <h3 class="wn-entry__title">{{ e.title }}</h3>
              <span v-if="fresh.has(e.id)" class="wn-chip wn-chip--new" data-test-whats-new-fresh>New</span>
              <span v-if="e.tag" class="wn-chip" data-test-whats-new-tag>{{ TAG_LABELS[e.tag] }}</span>
            </div>
            <p class="wn-entry__text">{{ e.text }}</p>
            <div class="wn-entry__foot">
              <p class="wn-entry__where" data-test-whats-new-where><span class="wn-label">Where</span>{{ e.where }}</p>
              <RouterLink :to="linkOf(e)" class="btn btn-primary btn-sm wn-entry__open" :aria-label="`Open: ${e.title}`" data-test-whats-new-open>Open</RouterLink>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /whats-new, "What's new on Tools+", in two parts. "New on Tools+": the plus features by the day
// they reached the site, each with where it is on a phone and a link straight to it (entries.ts, hand-kept). Showing
// that part is what clears the unseen marker (the dot on the plus pages menu and /account's card, useWhatsNew.ts); what
// was new on this visit keeps a "New" chip until the page is left. "Your numbers" (`?tab=numbers`): what moved in the
// account's own damage figures since the last record, and why (src/sim/numbersLog/).
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useCharacterStore } from "../../stores/character";
import { TAG_LABELS, WHATS_NEW, type WhatsNewEntry } from "./entries";
import { WHATS_NEW_PATH, entryLink, groupByDate, linkCharacter, unseenText } from "./whatsNew";
import { useWhatsNew } from "./useWhatsNew";
import NumbersMoved from "../numbersLog/NumbersMoved.vue";

useDocumentTitle(
  "What's new on Tools+ — Wuthering Waves Calculator & Optimizer",
  "The features added to Wuthering Tools+, newest first, with where to find each one, and which of your own damage figures moved since last time and why.",
);

const route = useRoute();
const tab = computed<"features" | "numbers">(() => (route.query.tab === "numbers" ? "numbers" : "features"));
const characterStore = useCharacterStore();
const whatsNew = useWhatsNew();
// read before the marker is written: what this visit found new
const fresh = new Set(whatsNew.unseen.value);
const freshText = unseenText(fresh.size, whatsNew.hasMarker.value);
const groups = groupByDate(WHATS_NEW);

const character = computed(() => linkCharacter(characterStore.characters as Record<string, { weapon?: unknown }>, characterStore.activeCharacter as string | null));
const linkOf = (e: WhatsNewEntry): string => entryLink(e.link, character.value);

// the list was shown: that is "opened". Landing on Your numbers (the account card's See all) leaves the dot alone
watch(
  tab,
  (t) => {
    if (t === "features") whatsNew.markSeen();
  },
  { immediate: true },
);
</script>

<style scoped>
.wn {
  width: 100%;
  max-width: 56rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 2.5rem;
}
.wn-head {
  margin-bottom: 1.25rem;
}
.wn-h1 {
  font-size: 1.5rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.wn-tabs {
  display: inline-flex;
  max-width: 100%;
  margin-top: 0.7rem;
  padding: 0.2rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.wn-tab {
  padding: 0.35rem 0.85rem;
  border-radius: 0.45rem;
  font-size: 0.85rem;
  font-weight: 650;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.65);
}
a.wn-tab:hover {
  color: oklch(var(--bc));
}
.wn-tab--on,
a.wn-tab--on:hover {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.wn-intro {
  margin-top: 0.35rem;
  font-size: 0.85rem;
  line-height: 1.5;
  color: oklch(var(--bc) / 0.6);
}
.wn-link {
  color: oklch(var(--p));
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.wn-fresh {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.6rem;
  font-size: 0.85rem;
  font-weight: 600;
  background: oklch(var(--p) / 0.12);
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.3);
}
.wn-dot {
  flex-shrink: 0;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 9999px;
  background: oklch(var(--p));
}
.wn-group {
  margin-top: 1.25rem;
}
.wn-group + .wn-group {
  margin-top: 1.75rem;
}
.wn-h2 {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  margin-bottom: 0.6rem;
  font-size: 1.05rem;
  font-weight: 700;
}
.wn-count {
  font-size: 0.72rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.55);
}
.wn-list {
  display: grid;
  gap: 0.6rem;
}
.wn-entry {
  padding: 0.8rem 0.9rem;
  border-radius: 0.9rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.wn-entry--new {
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.55);
}
.wn-entry__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.5rem;
}
.wn-entry__title {
  margin-right: auto;
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.3;
}
.wn-chip {
  padding: 0.05rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.7);
  background: oklch(var(--bc) / 0.08);
}
.wn-chip--new {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.wn-entry__text {
  margin-top: 0.35rem;
  font-size: 0.86rem;
  line-height: 1.5;
}
.wn-entry__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.55rem;
}
.wn-entry__where {
  min-width: 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: oklch(var(--bc) / 0.7);
}
.wn-label {
  display: block;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.55);
}
.wn-entry__open {
  flex-shrink: 0;
  min-width: 4.25rem;
}
@media (max-width: 767px) {
  .wn {
    /* the page end clears the Ask button through phone.css § 16 (every page's .content) */
    padding: 0.9rem 0.75rem 2rem;
  }
  .wn-h1 {
    font-size: 1.25rem;
  }
  /* the button under the text, on the left: the Ask button floats over the right edge of a phone */
  .wn-entry__foot {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .wn-entry__open {
    min-height: 40px;
    min-width: 5.5rem;
  }
  .wn-tabs {
    display: flex;
  }
  .wn-tab {
    display: inline-flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0.35rem 0.5rem;
  }
}
</style>
