<template>
  <section class="mat" :aria-labelledby="headId" data-test-cost-to-max>
    <div class="mat__head">
      <h3 :id="headId" class="mat__h3">Cost to max</h3>
      <div class="mat-seg" role="group" aria-label="Count from">
        <button
          type="button"
          class="mat-seg__btn"
          :class="{ 'mat-seg__btn--on': from === 'saved' }"
          :aria-pressed="from === 'saved'"
          data-test-cost-from="saved"
          @click="from = 'saved'">
          From saved levels
        </button>
        <button
          type="button"
          class="mat-seg__btn"
          :class="{ 'mat-seg__btn--on': from === 'scratch' }"
          :aria-pressed="from === 'scratch'"
          data-test-cost-from="scratch"
          @click="from = 'scratch'">
          From level 1
        </button>
      </div>
    </div>
    <p class="mat__intro">
      Shell Credits, EXP and materials to take {{ name }} to level 90 with all five Forte skills at 10<template v-if="from === 'scratch'">, both inherent skills and all 8 stat bonuses</template><template v-if="weaponName">, and {{ weaponName }} to level {{ weaponMax }}</template>.
    </p>

    <p v-if="!data" class="mat__note" data-test-cost-loading>{{ failed ? "The cost table did not load. Reopen the drawer to try again." : "Loading the cost table…" }}</p>
    <p v-else-if="!cost" class="mat__note" data-test-cost-missing>
      The cost table (version {{ data.gameVersion }}) has no entry for {{ name }} yet.
    </p>
    <template v-else>
      <p v-if="from === 'saved' && !savedAnything" class="mat__note mat__note--warn" data-test-cost-assumed>
        The calculator has not saved {{ name }}'s level, Forte levels or weapon level, so it counts them as maxed. Set them in the calculator, or count from level 1.
      </p>

      <div class="mat-total" data-test-cost-total>
        <span class="mat-total__label">{{ cost.done ? "Nothing left to pay" : "All together" }}</span>
        <span class="mat-total__credits" data-test-cost-total-credits>{{ count(cost.total.credits) }} <small>Shell Credits</small></span>
        <span v-for="x in cost.total.expItems" :key="x.id" class="mat-total__exp">{{ count(x.count) }} × {{ x.name }}</span>
      </div>
      <ul v-if="cost.total.materials.length" class="mat-mats" aria-label="Materials, all together" data-test-cost-total-materials>
        <li v-for="m in cost.total.materials" :key="m.id" class="mat-chip" :data-rarity="m.rarity">
          <span class="mat-chip__name">{{ m.name }}</span><b class="mat-chip__n">× {{ count(m.count) }}</b>
        </li>
      </ul>

      <h4 class="mat__h4">Where it goes</h4>
      <details v-for="p in cost.parts" :key="p.kind" class="mat-part" :data-test-cost-part="p.kind">
        <summary class="mat-part__sum">
          <span class="mat-part__title">
            {{ p.title }}
            <span v-if="p.assumed" class="mat-tag">not saved</span>
            <span v-if="!p.counted" class="mat-tag">not in the total</span>
          </span>
          <span class="mat-part__credits">{{ p.credits ? `${count(p.credits)} Shell Credits` : "nothing left" }}</span>
        </summary>
        <div class="mat-part__body">
          <p v-for="(line, i) in notes(p)" :key="i" class="mat__note">{{ line }}</p>
          <p v-if="p.exp && p.expItem" class="mat-part__line">
            <b>{{ count(p.exp) }}</b> {{ p.kind === "weapon" ? "weapon" : "resonator" }} EXP ≈ <b>{{ count(p.expItem.count) }}</b> × {{ p.expItem.name }}
            ({{ count(p.kind === "weapon" ? data.weaponExp.itemExp : data.resonatorExp.itemExp) }} EXP each) ·
            {{ count(p.expCredits) }} Shell Credits to feed it
          </p>
          <ul v-if="p.materials.length" class="mat-mats" :aria-label="`Materials for ${p.title}`">
            <li v-for="m in p.materials" :key="m.id" class="mat-chip" :data-rarity="m.rarity">
              <span class="mat-chip__name">{{ m.name }}</span><b class="mat-chip__n">× {{ count(m.count) }}</b>
            </li>
          </ul>
        </div>
      </details>
      <p v-if="saved.weapon && !weaponName" class="mat__note" data-test-cost-weapon-missing>
        The cost table (version {{ data.gameVersion }}) has no entry for {{ weaponDisplayName(saved.weapon) }} yet, so no weapon cost is counted.
      </p>
      <p v-else-if="!weaponName" class="mat__note">No weapon equipped, so no weapon cost is counted.</p>
      <p class="mat__source">
        From the game's own upgrade tables, version {{ data.gameVersion }} (read {{ data.fetched }}). EXP is rounded up to whole
        top-tier items; smaller items cost the same Shell Credits per EXP.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "Cost to max" in the /account character drawer: what it takes to raise the character (level, the
// five Forte skills, the inherent skills and stat bonuses) and their weapon, from what the calculator saved or from
// level 1. The numbers are costToMax.ts over the generated table; this component only loads the table and lays it out.
import { computed, ref, useId, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { weaponDisplayName } from "../display/names";
import { costToMax, count, hasSavedProgress, savedProgressOf, type CostPart, type MaterialsData } from "./costToMax";
import { loadMaterials } from "./materialsData";

const props = defineProps<{ characterKey: string; name: string }>();

const characterStore = useCharacterStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, any>> } };

const headId = `mat-head-${useId()}`;
const data = ref<MaterialsData | null>(null);
const failed = ref(false);
loadMaterials()
  .then((d) => (data.value = d))
  .catch(() => (failed.value = true));

const saved = computed(() => savedProgressOf(characters.value?.[props.characterKey]));
const savedAnything = computed(() => hasSavedProgress(saved.value));
/** opens on the saved levels when anything below the top is saved, else from level 1 (with nothing saved the saved
 *  view would read "nothing left" for everyone) */
const from = ref<"saved" | "scratch">(savedAnything.value ? "saved" : "scratch");
watch(
  () => props.characterKey,
  () => (from.value = savedAnything.value ? "saved" : "scratch"),
);

const cost = computed(() => (data.value ? costToMax(data.value, props.characterKey, saved.value, { from: from.value }) : null));
const weapon = computed(() => (saved.value.weapon && data.value?.weapons[saved.value.weapon] ? saved.value.weapon : null));
const weaponName = computed(() => (weapon.value ? weaponDisplayName(weapon.value) : ""));
const weaponMax = computed(() => (weapon.value && data.value ? data.value.weapons[weapon.value].max : 90));

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
const ascensionNote = (p: CostPart): string =>
  `${plural(p.ascensions, "ascension")} to go: ${count(p.credits - p.expCredits)} Shell Credits and the materials below.`;
function notes(p: CostPart): string[] {
  const out: string[] = [];
  if (p.kind === "level") {
    if (p.assumed) out.push("Level not saved: the calculator uses 90.");
    if (p.ascensions) out.push(ascensionNote(p));
  } else if (p.kind === "forte") {
    if (p.assumed) out.push("A skill with no saved level counts as 10, the calculator's default.");
    out.push("Normal Attack, Resonance Skill, Forte Circuit, Resonance Liberation and Intro Skill, each to level 10.");
  } else if (p.kind === "extras") {
    out.push(
      p.counted
        ? "Both inherent skills and all 8 stat bonuses, unlocked as the character ascends; counted in the total."
        : "Both inherent skills and all 8 stat bonuses. The calculator does not save these: if none are unlocked yet, this is what they cost. Not in the total above.",
    );
  } else if (p.kind === "weapon") {
    if (p.assumed) out.push(`Weapon level not saved: the calculator uses ${weaponMax.value}.`);
    if (p.ascensions) out.push(ascensionNote(p));
  }
  return out;
}
</script>

<style scoped>
.mat {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.mat__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.mat__h3 {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.8);
}
.mat__h4 {
  margin-top: 0.2rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.8);
}
.mat__intro,
.mat__note,
.mat__source {
  font-size: 0.72rem;
  line-height: 1.4;
  color: oklch(var(--bc) / 0.8);
}
.mat__note--warn {
  padding: 0.4rem 0.55rem;
  border-radius: 0.5rem;
  color: oklch(var(--bc));
  background: color-mix(in oklab, oklch(var(--wa)) 12%, transparent);
}
.mat__source {
  font-size: 0.65rem;
  color: oklch(var(--bc) / 0.78);
}
.mat-seg {
  display: inline-flex;
  max-width: 100%;
  padding: 0.15rem;
  border-radius: 0.55rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.mat-seg__btn {
  padding: 0.2rem 0.6rem;
  border-radius: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.8);
}
.mat-seg__btn:hover {
  color: oklch(var(--bc));
}
.mat-seg__btn--on {
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}
.mat-seg__btn:focus-visible,
.mat-part__sum:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.mat-total {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.6rem;
  padding: 0.55rem 0.65rem;
  border-radius: 0.7rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.mat-total__label {
  flex-basis: 100%;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: oklch(var(--bc) / 0.8);
}
.mat-total__credits {
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.mat-total__credits small,
.mat-total__exp {
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.75);
}
.mat-mats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.mat-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  max-width: 100%;
  padding: 0.15rem 0.45rem 0.15rem 0.4rem;
  border-left: 3px solid var(--mat-rarity, oklch(var(--bc) / 0.3));
  border-radius: 0.35rem;
  font-size: 0.72rem;
  background: oklch(var(--b2));
}
.mat-chip[data-rarity="2"] {
  --mat-rarity: #5bb974;
}
.mat-chip[data-rarity="3"] {
  --mat-rarity: #4f8fe6;
}
.mat-chip[data-rarity="4"] {
  --mat-rarity: #a66bdc;
}
.mat-chip[data-rarity="5"] {
  --mat-rarity: #e8b44c;
}
.mat-chip__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.mat-chip__n {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.mat-part {
  border-radius: 0.6rem;
  background: oklch(var(--b2));
}
.mat-part__sum {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.1rem 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 0.6rem;
  cursor: pointer;
  font-size: 0.78rem;
  list-style: none;
}
.mat-part__sum::-webkit-details-marker {
  display: none;
}
.mat-part__title::before {
  content: "▸";
  display: inline-block;
  width: 1em;
  color: oklch(var(--bc) / 0.65);
}
.mat-part[open] > .mat-part__sum .mat-part__title::before {
  content: "▾";
}
/* basis = its own width: when the title and the figure do not fit one line the figure moves under the title, instead of
   the title breaking inside "Level 1 → 90" (360 px at 130 %) */
.mat-part__title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
}
.mat-part__credits {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.mat-tag {
  margin-left: 0.25rem;
  padding: 0 0.35rem;
  border-radius: 9999px;
  font-size: 0.62rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.88);
  background: oklch(var(--bc) / 0.1);
}
.mat-part__body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0 0.6rem 0.55rem;
}
.mat-part__line {
  font-size: 0.72rem;
  line-height: 1.4;
}
.mat-part .mat-chip {
  background: oklch(var(--b1));
}
</style>
