<template>
  <RouterLink
    to="/energy"
    class="en-ui en-sum"
    :class="`en-sum--${variant}`"
    :data-test-energy-summary-tile="state"
    :title="title"
    :aria-label="`Energy check: ${headline}. ${detail}`">
    <template v-if="variant === 'tile'">
      <span class="en-sum__label">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true" class="en-sum__bolt"><path d="M9.2 1.8L3.6 9h4l-1 5.2L12.4 7h-4z" /></svg>
        Energy check
      </span>
      <span class="en-sum__value">
        <span v-if="state === 'loading'" class="loading loading-spinner loading-sm" aria-hidden="true"></span>
        <template v-else>{{ headline }}</template>
      </span>
      <span class="en-sum__sub">{{ detail }}</span>
      <span class="en-sum__go" aria-hidden="true">▸</span>
    </template>
    <template v-else>
      <span v-if="state === 'loading'" class="loading loading-spinner loading-xs" aria-hidden="true"></span>
      <EnergyStatusIcon v-else :status="icon" class="en-sum__icon" :class="`en-sum__icon--${icon}`" />
      <span class="en-sum__inline">Energy check<template v-if="state !== 'loading' && state !== 'none'">: {{ headline }}</template></span>
      <span aria-hidden="true">▸</span>
    </template>
  </RouterLink>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the energy check in one line for an account page: "2 characters short on ER · 1 overcapping crit",
// linking to /energy. `tile` is the /account KPI card (batch-1's AccountView / AccountHero), `inline` the /my-rankings
// header link. Self-contained: activates the shared check (useEnergyNeeds) while mounted.
import { computed, onBeforeUnmount, onMounted } from "vue";
import EnergyStatusIcon from "./EnergyStatusIcon.vue";
import { nameOf } from "./energyFormat";
import { useEnergyNeeds } from "./useEnergyNeeds";
import "./energy.css";

withDefaults(defineProps<{ variant?: "tile" | "inline" }>(), { variant: "tile" });

const energy = useEnergyNeeds();
onMounted(() => energy.activate());
onBeforeUnmount(() => energy.release());

const s = computed(() => energy.summary.value);
const state = computed<"loading" | "none" | "short" | "overcap" | "ok">(() => {
  const teams = energy.savedTeams.value;
  if (!teams.length) return "none";
  if (energy.busy.value && !s.value.measured) return "loading";
  if (!s.value.measured) return "none";
  if (s.value.shortCharacters.length) return "short";
  if (s.value.overcapCharacters.length) return "overcap";
  return "ok";
});
const icon = computed(() => (state.value === "short" ? "short" : state.value === "overcap" ? "tight" : state.value === "ok" ? "ok" : "muted"));
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const headline = computed(() => {
  const v = s.value;
  if (state.value === "loading") return "measuring…";
  if (state.value === "none") return energy.savedTeams.value.length ? "not measured" : "no saved team";
  const short = v.shortCharacters.length;
  const over = v.overcapCharacters.length;
  const parts = [short ? `${plural(short, "character", "characters")} short on ER` : "every Liberation paid"];
  if (over) parts.push(`${over} overcapping crit`);
  return parts.join(" · ");
});
const detail = computed(() => {
  const v = s.value;
  if (state.value === "loading") return "wuwa_calc is measuring your saved teams";
  if (state.value === "none") return energy.savedTeams.value.length ? "none of your saved teams is one of wuwa_calc's compositions" : "save or sync a team to measure its ER needs";
  const bits: string[] = [];
  if (v.shortCharacters.length) bits.push(`short: ${v.shortCharacters.map(nameOf).join(", ")}`);
  if (v.overcapCharacters.length) bits.push(`Crit Rate past 100 %: ${v.overcapCharacters.map(nameOf).join(", ")}`);
  if (!bits.length) bits.push(`${plural(v.measured, "team", "teams")} measured${v.tight ? `, ${v.tight} tight` : ""}`);
  return bits.join(" · ");
});
const title = computed(() => `Energy Regen each member of your saved teams needs in wuwa_calc's loop, against their build — ${detail.value}`);
</script>

<style scoped>
.en-sum {
  color: inherit;
  text-decoration: none;
}
.en-sum--inline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: oklch(var(--p));
  min-width: 0;
}
.en-sum--inline:hover .en-sum__inline {
  text-decoration: underline;
}
.en-sum__inline {
  min-width: 0;
}
.en-sum__icon {
  width: 0.95rem;
  height: 0.95rem;
  flex: none;
}
.en-sum__icon--short {
  color: oklch(var(--er));
}
.en-sum__icon--tight {
  color: oklch(var(--wa));
}
.en-sum__icon--ok {
  color: oklch(var(--su));
}
.en-sum--tile {
  position: relative;
  display: grid;
  gap: 0.2rem;
  align-content: start;
  padding: 0.8rem 2rem 0.8rem 1rem;
  border-radius: var(--rounded-box, 1rem);
  background: oklch(var(--b2) / 0.55);
  border: 1px solid oklch(var(--bc) / 0.08);
  min-width: 0;
  transition: border-color 0.12s;
}
.en-sum--tile:hover {
  border-color: oklch(var(--bc) / 0.25);
}
.en-sum--tile:focus-visible,
.en-sum--inline:focus-visible {
  outline: 2px solid oklch(var(--p));
  outline-offset: 2px;
}
.en-sum--tile[data-test-energy-summary-tile="short"] {
  box-shadow: inset 3px 0 0 oklch(var(--er));
}
.en-sum__label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.66rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--en-ink-3);
}
.en-sum__bolt {
  width: 0.9rem;
  height: 0.9rem;
}
.en-sum__value {
  font-size: 1.05rem;
  font-weight: 650;
  line-height: 1.3;
}
.en-sum__sub {
  font-size: 0.72rem;
  color: var(--en-ink-3);
  overflow-wrap: anywhere;
}
.en-sum__go {
  position: absolute;
  right: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--en-ink-3);
}
</style>
