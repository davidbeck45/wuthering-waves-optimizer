<template>
  <section class="roster" data-test-account-roster>
    <div class="acc-section-head">
      <h2 class="acc-h2">
        Roster
        <span class="acc-count" data-test-account-roster-count>{{ shown.length }}</span>
      </h2>
      <label class="roster__sort">
        <span class="acc-meta">Sort</span>
        <select class="select select-bordered select-xs roster__select" :value="sort" data-test-account-sort @change="emit('update:sort', ($event.target as HTMLSelectElement).value as RosterSortKey)">
          <option v-for="s in ROSTER_SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
      </label>
    </div>

    <div class="roster__filters" role="toolbar" aria-label="Filter the roster">
      <div class="roster__elements" :class="{ 'roster__elements--any': filter.elements.length }" role="group" aria-label="Element">
        <button
          v-for="el in ELEMENTS"
          :key="el"
          type="button"
          class="roster__el"
          :class="{ 'roster__el--on': filter.elements.includes(el) }"
          :aria-pressed="filter.elements.includes(el)"
          :title="`${el}${counts.elements[el] ? ` · ${counts.elements[el]}` : ''}`"
          :disabled="!counts.elements[el] && !filter.elements.includes(el)"
          :style="{ '--el': elementColor(el) }"
          :data-test-account-filter-element="el"
          @click="toggleElement(el)">
          <!-- upstream's element tint (style.css `.<element>--active`), legible on light and dark themes -->
          <img :src="characterElementsSetImageMap[el]" :alt="el" class="roster__el-img" :class="`${el.toLowerCase()}--active`" />
        </button>
      </div>
      <div class="acc-seg" role="group" aria-label="Build">
        <button
          v-for="b in BUILDS"
          :key="b.key"
          type="button"
          class="acc-seg__btn"
          :class="{ 'acc-seg__btn--on': filter.build === b.key }"
          :aria-pressed="filter.build === b.key"
          :data-test-account-filter-build="b.key"
          @click="set({ build: b.key })">
          {{ b.label }}<span class="acc-seg__n">{{ counts.build[b.key] }}</span>
        </button>
      </div>
      <div class="acc-seg" role="group" aria-label="Owned">
        <button
          v-for="o in OWNED"
          :key="o.key"
          type="button"
          class="acc-seg__btn"
          :class="{ 'acc-seg__btn--on': filter.owned === o.key }"
          :aria-pressed="filter.owned === o.key"
          :title="o.title"
          :data-test-account-filter-owned="o.key"
          @click="set({ owned: o.key })">
          {{ o.label }}<span class="acc-seg__n">{{ counts.owned[o.key] }}</span>
        </button>
      </div>
      <button v-if="filtered" type="button" class="roster__clear" data-test-account-filter-clear @click="emit('update:filter', { ...DEFAULT_FILTER })">Clear</button>
    </div>

    <div v-if="shown.length" class="roster__grid">
      <AccountCharacterCard v-for="c in shown" :key="c.id" :card="c" :max-damage="maxDamage" :scoring="scoring" :owned="owned" @open="emit('open', $event)" />
    </div>
    <p v-else class="roster__none" data-test-account-roster-none>No character matches these filters.</p>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the /account roster: element / build / owned filters and a sort over the character cards.
import { computed } from "vue";
import AccountCharacterCard from "./AccountCharacterCard.vue";
import { characterElementsSetImageMap } from "../../characters/characters";
import { elementColor } from "../display/names";
import { DEFAULT_FILTER, ROSTER_SORTS, filterCards, sortCards, type BuildFilter, type OwnedFilter, type RosterCard, type RosterFilter, type RosterSortKey } from "./accountView";

const props = defineProps<{ cards: RosterCard[]; filter: RosterFilter; sort: RosterSortKey; scoring: boolean; owned: string[] }>();
const emit = defineEmits<{ "update:filter": [value: RosterFilter]; "update:sort": [value: RosterSortKey]; open: [id: string] }>();

const ELEMENTS = ["Fusion", "Glacio", "Aero", "Electro", "Spectro", "Havoc"] as const;
const BUILDS: Array<{ key: BuildFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "built", label: "Built" },
  { key: "unbuilt", label: "Needs work" },
];
const OWNED: Array<{ key: OwnedFilter; label: string; title: string }> = [
  { key: "owned", label: "Set up", title: "Characters with a weapon equipped" },
  { key: "all", label: "Everyone", title: "Every character the calculator has data for" },
];

const shown = computed(() => sortCards(filterCards(props.cards, props.filter), props.sort));
const maxDamage = computed(() => Math.max(0, ...props.cards.map((c) => c.damage ?? 0)));
const filtered = computed(() => props.filter.elements.length > 0 || props.filter.build !== DEFAULT_FILTER.build || props.filter.owned !== DEFAULT_FILTER.owned);

/** how many cards each choice would show, the other filters held */
const counts = computed(() => {
  const f = props.filter;
  const elements: Record<string, number> = {};
  for (const c of filterCards(props.cards, { ...f, elements: [] })) if (c.element) elements[c.element] = (elements[c.element] ?? 0) + 1;
  const n = (patch: Partial<RosterFilter>): number => filterCards(props.cards, { ...f, ...patch }).length;
  return {
    elements,
    build: { all: n({ build: "all" }), built: n({ build: "built" }), unbuilt: n({ build: "unbuilt" }) } as Record<BuildFilter, number>,
    owned: { owned: n({ owned: "owned" }), all: n({ owned: "all" }) } as Record<OwnedFilter, number>,
  };
});

function set(patch: Partial<RosterFilter>): void {
  emit("update:filter", { ...props.filter, ...patch });
}
function toggleElement(el: string): void {
  const on = props.filter.elements.includes(el);
  set({ elements: on ? props.filter.elements.filter((e) => e !== el) : [...props.filter.elements, el] });
}
</script>

<style scoped>
.roster__sort {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.roster__select {
  min-height: 1.75rem;
  height: 1.75rem;
  font-size: 0.75rem;
}
.roster__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.6rem;
  margin-bottom: 0.75rem;
}
.roster__elements {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.15rem;
  border-radius: 0.55rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.roster__el {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.4rem;
  opacity: 0.9;
  transition:
    opacity 0.12s ease,
    background 0.12s ease;
}
/* with an element picked, the others step back */
.roster__elements--any .roster__el:not(.roster__el--on) {
  opacity: 0.4;
}
.roster__el:hover:not(:disabled) {
  opacity: 1;
}
.roster__el--on {
  opacity: 1;
  background: color-mix(in oklab, var(--el) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--el) 70%, transparent);
}
.roster__el:disabled {
  opacity: 0.2;
  cursor: default;
}
.roster__el-img {
  width: 1.25rem;
  height: 1.25rem;
  object-fit: contain;
}
.roster__clear {
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--p));
}
.roster__clear:hover {
  text-decoration: underline;
}
.roster__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.65rem;
}
.roster__none {
  padding: 1.5rem;
  border-radius: 0.8rem;
  text-align: center;
  font-size: 0.85rem;
  color: oklch(var(--bc) / 0.6);
  background: oklch(var(--b2));
}
/* phones: two cards a row, then one on the narrowest */
@media (max-width: 639px) {
  .roster__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
  }
  .roster__filters {
    gap: 0.4rem;
  }
  .roster__elements {
    flex: 1 1 100%;
    justify-content: space-between;
  }
  .roster__el {
    flex: 1 1 0;
    width: auto;
  }
}
@media (max-width: 379px) {
  .roster__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
