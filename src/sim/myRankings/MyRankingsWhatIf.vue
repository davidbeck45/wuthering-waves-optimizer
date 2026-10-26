<template>
  <div class="whatif" :data-test-my-rankings-whatif-panel="rank.id">
    <div class="whatif__form">
      <label class="whatif__field">
        <span class="whatif__label">Sequence</span>
        <select v-model.number="state.sequence" class="select select-bordered select-sm" data-test-my-rankings-whatif-sequence>
          <option v-for="n in [0, 1, 2, 3, 4, 5, 6]" :key="n" :value="n">S{{ n }}{{ n === rank.sequence ? " (now)" : "" }}</option>
        </select>
      </label>
      <label class="whatif__field whatif__field--weapon">
        <span class="whatif__label">Weapon</span>
        <select v-model="state.weapon" class="select select-bordered select-sm w-full" data-test-my-rankings-whatif-weapon>
          <option v-for="w in state.weapons" :key="w.key" :value="w.key">{{ weaponLabel(w) }}{{ w.key === rank.weapon ? " (now)" : owned.has(w.key) ? " (owned)" : "" }}</option>
        </select>
      </label>
      <label class="whatif__field">
        <span class="whatif__label">Refinement</span>
        <select v-model.number="state.refinement" class="select select-bordered select-sm" data-test-my-rankings-whatif-refinement>
          <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">R{{ n }}{{ n === rank.refinement && state.weapon === rank.weapon ? " (now)" : "" }}</option>
        </select>
      </label>
      <button type="button" class="btn btn-primary btn-sm whatif__run" :disabled="state.running || !rank.bestRotation" data-test-my-rankings-whatif-run @click="run">
        <span v-if="state.running" class="loading loading-spinner loading-xs"></span>
        Score this build
      </button>
    </div>

    <div v-if="quick.length" class="whatif__quick">
      <span class="opacity-60">Try:</span>
      <button v-for="q in quick" :key="q.label" type="button" class="btn btn-xs btn-ghost border border-base-content/10" @click="applyQuick(q)">{{ q.label }}</button>
    </div>

    <div v-if="state.result" class="whatif__result" data-test-my-rankings-whatif-result>
      <span class="font-semibold">{{ state.result.label }}</span>
      <span class="font-mono tabular-nums font-bold text-base">{{ fmt(state.result.avgDamage) }}</span>
      <span class="font-mono tabular-nums font-semibold" :class="gainClass(state.result.gain)">{{ pct(state.result.gain) }}</span>
      <span class="opacity-60 text-xs">vs {{ fmt(state.result.base) }} now, on the same rotation</span>
    </div>
    <p v-if="state.error" class="text-xs text-error mt-1">{{ state.error }}</p>
    <p class="whatif__hint">Scores your build at another sequence, weapon or refinement on its best rotation ({{ rotationTitle }}) — echoes, buffs and enemy unchanged.</p>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the "What if" tab of a /my-rankings row: the character at another sequence / weapon /
// refinement, scored on the same best rotation (rankRoster.ts whatIf).
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { weaponOptionsFor, whatIf, type CharacterRank, type WeaponOption } from "./rankRoster";
import { whatIfStateOf } from "./panelState";
import { weaponDisplayName } from "../display/names";
import { parsePresetName } from "../presets/presetName";
import { fmt, gainClass, pct } from "./format";

const props = defineProps<{ rank: CharacterRank }>();

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, { weapons?: Record<string, unknown> }> } };

const state = computed(() => whatIfStateOf(props.rank));
const owned = computed(() => new Set(Object.keys(characters.value?.[props.rank.id]?.weapons ?? {})));
const weaponLabel = (w: WeaponOption): string => `${w.rarity ? `${w.rarity}★ ` : ""}${w.name}`;
const rotationTitle = computed(() => parsePresetName(props.rank.best?.name).title || "its best rotation");

interface Quick {
  label: string;
  sequence: number;
  refinement: number;
}
const quick = computed<Quick[]>(() => {
  const out: Quick[] = [];
  const { sequence, refinement } = props.rank;
  if (sequence < 6) out.push({ label: `S${sequence + 1}`, sequence: sequence + 1, refinement });
  if (refinement < 5) out.push({ label: "R5", sequence, refinement: 5 });
  if (sequence < 6 && refinement < 5) out.push({ label: "S6 R5", sequence: 6, refinement: 5 });
  else if (sequence < 5) out.push({ label: "S6", sequence: 6, refinement });
  return out;
});

function applyQuick(q: Quick): void {
  const s = state.value;
  s.sequence = q.sequence;
  s.refinement = q.refinement;
  s.weapon = props.rank.weapon ?? s.weapon;
  void run();
}

// the weapon list loads once per row state (it survives collapsing the row)
watch(
  state,
  async (s) => {
    if (s.weaponsLoaded) return;
    s.weaponsLoaded = true;
    let options: WeaponOption[] = [];
    try {
      options = await weaponOptionsFor(props.rank.id);
    } catch {
      /* no registry list: the equipped weapon alone */
    }
    const current = props.rank.weapon;
    if (current && !options.some((w) => w.key === current)) options.unshift({ key: current, name: weaponDisplayName(current), rarity: 0 });
    s.weapons = options;
  },
  { immediate: true },
);

async function run(): Promise<void> {
  const s = state.value;
  if (!props.rank.bestRotation || s.running) return;
  s.running = true;
  s.error = null;
  try {
    s.result = await whatIf(
      props.rank.id,
      JSON.parse(JSON.stringify(characters.value ?? {})),
      JSON.parse(JSON.stringify(inventoryStore.echoes ?? [])),
      props.rank.bestRotation,
      { sequence: s.sequence, weapon: s.weapon || undefined, refinement: s.refinement },
    );
  } catch (error) {
    s.error = error instanceof Error ? error.message : String(error);
  } finally {
    s.running = false;
  }
}
</script>

<style scoped>
.whatif__form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.6rem 0.75rem;
}
.whatif__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.whatif__field--weapon {
  min-width: 12rem;
  max-width: 18rem;
  flex: 1 1 12rem;
}
.whatif__label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.55;
}
.whatif__quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.6rem;
  font-size: 0.75rem;
}
.whatif__result {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.6rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
  font-size: 0.85rem;
}
.whatif__hint {
  margin-top: 0.6rem;
  font-size: 0.72rem;
  opacity: 0.55;
}
@media (max-width: 767px) {
  .whatif__field--weapon {
    flex-basis: 100%;
    max-width: none;
  }
  .whatif__run {
    flex: 1 1 auto;
  }
}
</style>
