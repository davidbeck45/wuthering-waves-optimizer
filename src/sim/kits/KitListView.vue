<template>
  <Nav cur-page="kit" :disable-mobile-nav="true"></Nav>
  <div class="kit" data-test-kit-list>
    <header>
      <h1 class="kit-h1">Resonator briefs</h1>
      <p class="kit-intro">
        One page per resonator: how they are played, their builds, which sequences change the rotation, their best teams and what each sequence
        and weapon is worth. Built from Riley31415's wuwa_calc engine and read against your account. Yours come first.
      </p>
    </header>

    <section class="kit-filters" aria-label="Filter the briefs">
      <label class="input input-bordered input-sm flex items-center gap-2 kit-search">
        <span class="sr-only">Search by name, element or weapon type</span>
        <input v-model="query" type="search" class="min-w-0 grow" placeholder="Search a resonator" data-test-kit-search />
      </label>
      <div class="kit-pills" role="group" aria-label="Element">
        <span class="kit-label kit-pills__name">Element</span>
        <button type="button" class="kit-pill" :aria-pressed="element === null" data-test-kit-element="all" @click="element = null">All</button>
        <button v-for="e in elements" :key="e" type="button" class="kit-pill" :aria-pressed="element === e" :data-test-kit-element="e" @click="element = element === e ? null : e">{{ e }}</button>
      </div>
      <div class="kit-pills" role="group" aria-label="Role on Riley's teams">
        <span class="kit-label kit-pills__name">Role</span>
        <button type="button" class="kit-pill" :aria-pressed="role === null" data-test-kit-role="all" @click="role = null">All</button>
        <button v-for="r in ROLES" :key="r" type="button" class="kit-pill" :aria-pressed="role === r" :title="ROLE_HELP[r]" :data-test-kit-role="r" @click="role = role === r ? null : r">
          {{ ROLE_LABEL[r] }}
        </button>
      </div>
      <p class="kit-muted" role="status" aria-live="polite" data-test-kit-count>
        {{ shown.length === all.length ? `${all.length} briefs` : `${shown.length} of ${all.length} briefs` }}<template v-if="mine.length"> · {{ mine.length }} on your account</template>
      </p>
    </section>

    <p v-if="!shown.length" class="kit-card kit-text" data-test-kit-empty>
      No brief matches<template v-if="query.trim()"> “{{ query.trim() }}”</template>.
      <button type="button" class="kit-link" data-test-kit-clear @click="clear">Show every brief</button>
    </p>

    <section v-if="mine.length" aria-labelledby="kit-mine-h">
      <h2 id="kit-mine-h" class="kit-h2">On your account</h2>
      <ul class="kit-grid" data-test-kit-mine>
        <li v-for="k in mine" :key="k.name">
          <RouterLink :to="k.path" class="kit-row" :data-test-kit-row="k.slug">
            <CharacterAvatar :id="k.key" :size="44" dot />
            <span class="kit-row__body">
              <span class="kit-row__name">{{ k.label }}</span>
              <span class="kit-row__meta">
                <span class="kit-chip kit-chip--own" :title="`Sequence ${k.sequence}, ${k.weaponName} at refinement rank ${k.refinement}`">S{{ k.sequence }} · {{ k.weaponName }} R{{ k.refinement }}</span>
                <span v-for="r in k.roles" :key="r" class="kit-chip">{{ ROLE_LABEL[r] }}</span>
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section v-if="others.length" aria-labelledby="kit-others-h">
      <h2 id="kit-others-h" class="kit-h2">{{ mine.length ? "Not set up on your account" : "Every resonator with a brief" }}</h2>
      <ul class="kit-grid" data-test-kit-others>
        <li v-for="k in others" :key="k.name">
          <RouterLink :to="k.path" class="kit-row" :data-test-kit-row="k.slug">
            <CharacterAvatar :id="k.key" :size="44" dot />
            <span class="kit-row__body">
              <span class="kit-row__name">{{ k.label }}</span>
              <span class="kit-row__meta">
                <span class="kit-chip">{{ k.element }} · {{ k.weapon }}</span>
                <span v-for="r in k.roles" :key="r" class="kit-chip">{{ ROLE_LABEL[r] }}</span>
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <p class="kit-muted" data-test-kit-source>
      Generated from wuwa_calc at {{ KIT_INDEX._meta.wuwaCalcCommit }} on {{ KIT_INDEX._meta.generated }}. A resonator shows here once both Riley's engine
      and this app have them.
    </p>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /kit: every resonator the app has a brief for (src/sim/kits/), the ones set up on the account
// first with their sequence and weapon rank, filtered by element, role and a search box. Reads the small index only
// (data/kitIndex.json); the briefs themselves load when one is opened.
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useCharacterStore } from "../../stores/character";
import { accountCharacterOf } from "../account/accountState";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterShortName, isRosterCharacter, weaponDisplayName } from "../display/names";
import { accountKeyOf } from "../rankings/rileyNames";
import { ROLE_LABEL, filterKits, kitPath, kitSlug, kitsInApp, rolesOf, type KitIndexEntry, type KitRole } from "./kits";
import { KIT_INDEX, KIT_INDEX_ENTRIES } from "./load";
import "./kits.css";

useDocumentTitle(
  "Resonator briefs — Wuthering Waves Calculator & Optimizer",
  "A brief per Wuthering Waves resonator from the wuwa_calc engine: how they are played, builds, the sequences that change the rotation, best teams and what each sequence and weapon is worth, read against your account.",
);

const ROLES: KitRole[] = ["main", "support", "sustain"];
const ROLE_HELP: Record<KitRole, string> = {
  main: "Fielded as the main damage dealer in at least one of Riley's teams",
  support: "Fielded in a support slot in at least one of Riley's teams",
  sustain: "One of the healers and shielders Riley's table treats as interchangeable",
};

const { characters } = storeToRefs(useCharacterStore()) as unknown as { characters: { value: Record<string, Record<string, any>> } };

// the filters live in the address (/kit?element=Fusion&role=main&q=aem): Back from a brief lands on the list as it
// was left, and a filtered list can be bookmarked. Replaced, not pushed, so typing adds nothing to Back's stack.
const route = useRoute();
const router = useRouter();
const one = (v: unknown): string => (typeof v === "string" ? v : "");
const query = ref(one(route.query.q));
const element = ref<string | null>(one(route.query.element) || null);
const role = ref<KitRole | null>(ROLES.includes(one(route.query.role) as KitRole) ? (one(route.query.role) as KitRole) : null);
function clear(): void {
  query.value = "";
  element.value = null;
  role.value = null;
}
watch([query, element, role], () => {
  const next = { ...(element.value ? { element: element.value } : {}), ...(role.value ? { role: role.value } : {}), ...(query.value.trim() ? { q: query.value.trim() } : {}) };
  void router.replace({ query: next });
});

interface Row extends KitIndexEntry {
  /** the key the account plays them under (a male Rover) */
  key: string;
  label: string;
  slug: string;
  path: string;
  roles: KitRole[];
  owned: boolean;
  sequence: number;
  weaponName: string;
  refinement: number;
}

/** the briefs the app shows: its own character list decides (a kit of a resonator it lacks is left out) */
const all = computed<Row[]>(() =>
  kitsInApp(KIT_INDEX_ENTRIES, isRosterCharacter).map((k) => {
    const key = accountKeyOf(k.appKey, characters.value ?? {});
    const side = accountCharacterOf(key, characters.value?.[key]);
    return { ...k, key, label: characterShortName(key), slug: kitSlug(k.name), path: kitPath(k.name), roles: rolesOf(k), owned: side.owned, sequence: side.sequence, weaponName: weaponDisplayName(side.weapon), refinement: side.refinement };
  }),
);
const elements = computed(() => [...new Set(all.value.map((k) => k.element))].sort());
// an element the address names and no brief has (a typo, an old link) filters nothing out
if (element.value && !KIT_INDEX_ENTRIES.some((k) => k.element === element.value)) element.value = null;
const shown = computed(() =>
  filterKits(all.value, { element: element.value, role: role.value, query: query.value }, (k) => k.label).sort((a, b) => a.label.localeCompare(b.label)),
);
const mine = computed(() => shown.value.filter((k) => k.owned));
const others = computed(() => shown.value.filter((k) => !k.owned));
</script>
