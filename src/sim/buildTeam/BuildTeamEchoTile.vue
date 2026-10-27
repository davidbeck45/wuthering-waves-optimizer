<template>
  <div class="bt-tile" :class="`bt-tile--${source}`" data-test-build-team-echo :data-source="source" :data-echo-id="echo.echoId">
    <div class="bt-tile__head">
      <div class="bt-tile__pic" :style="ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined">
        <img v-if="image" :src="image" :alt="name" loading="lazy" decoding="async" />
        <span class="bt-tile__cost" :title="`Cost ${cost}`">{{ cost }}</span>
        <span v-if="slot === 0" class="bt-tile__main" title="Main echo (slot 1)" aria-label="Main echo">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /></svg>
        </span>
      </div>
      <div class="bt-tile__id">
        <div class="bt-tile__name" :title="name">{{ name }}</div>
        <div class="bt-tile__sub">
          <img v-if="setImg" :src="setImg" :alt="setLabel" class="bt-tile__set" loading="lazy" />
          <span class="truncate">{{ statShort(echo.stat) }}</span>
        </div>
      </div>
    </div>
    <ul class="bt-tile__lines" :aria-label="`${name} substats`">
      <li v-for="line in lines" :key="line.key" :class="{ 'bt-tile__line--er': line.key === 'EnergyRegen', 'bt-tile__line--crit': line.key === 'CritRate' || line.key === 'CritDMG' }">
        <span>{{ line.label }}</span><span class="tabular-nums">{{ line.value }}</span>
      </li>
    </ul>
    <div class="bt-tile__src" :title="sourceTitle">
      <span class="bt-tile__dot" aria-hidden="true"></span>{{ sourceLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ "Build it for me" — one echo of a result: picture (rarity ring, cost), name, main stat, set, its
// five substats, and where it comes from (already worn, unworn, a teammate's, or worn by someone outside the team).
import { computed } from "vue";
import { rankColors, getEchoSetLabelByType } from "../../echoes/stats";
import { SUBSTAT_ABBR } from "../substats/substatWeights";
import type { EchoSource } from "./buildTeam";
import { echoImage, echoName, setIcon, sourceText, statShort } from "./buildTeamView";

/* eslint-disable @typescript-eslint/no-explicit-any */
const props = defineProps<{ echo: any; slot: number; source: EchoSource; wornBy: string[]; characterId: string; sharedWith?: string[] }>();

const name = computed(() => echoName(props.echo.echo));
const image = computed(() => echoImage(props.echo.echo));
const cost = computed(() => Number(props.echo.type) || "?");
const setImg = computed(() => setIcon(props.echo.echoSet));
const setLabel = computed(() => getEchoSetLabelByType(props.echo.echoSet) ?? props.echo.echoSet ?? "");
const ring = computed(() => (rankColors as unknown as Record<string, string>)[String(props.echo.rank ?? 5)] ?? null);
const lines = computed(() => {
  const out: Array<{ key: string; label: string; value: string }> = [];
  for (let i = 1; i <= 5; i++) {
    const key = props.echo[`echoSubStatsType${i}`];
    const v = Number(props.echo[`echoSubStatsValue${i}`]);
    if (!key || !Number.isFinite(v) || !v) continue;
    const flat = String(key).endsWith("_FLAT");
    out.push({ key, label: SUBSTAT_ABBR[key] ?? key, value: flat ? String(Math.round(v)) : `${Math.round(v * 10) / 10}%` });
  }
  return out;
});
const sourceLabel = computed(() => sourceText(props.source, props.sharedWith?.length ? props.sharedWith : props.wornBy, props.characterId));
const sourceTitle = computed(() =>
  props.source === "other"
    ? "Worn in another character's active build. Saving pins it in this team's build too: upstream lets builds share an echo, and nothing is taken off anyone."
    : props.source === "teammate"
      ? "Worn today by a teammate in this team. Save their new build too (it no longer uses this echo), or the team wears it twice."
      : props.source === "own"
        ? "Already in this character's build."
        : "Nobody wears it.",
);
</script>

<style scoped>
.bt-tile {
  container: bttile / inline-size;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
  padding: 0.5rem 0.55rem 0.45rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2) / 0.6);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.bt-tile--other {
  box-shadow: inset 0 0 0 1px oklch(var(--er) / 0.55);
}
.bt-tile__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.bt-tile__pic {
  position: relative;
  flex: 0 0 auto;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  background: oklch(var(--b3));
}
.bt-tile__pic img {
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  object-fit: cover;
}
.bt-tile__cost {
  position: absolute;
  right: -0.2rem;
  bottom: -0.2rem;
  display: grid;
  place-items: center;
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1;
  color: oklch(var(--b1));
  background: oklch(var(--bc));
}
.bt-tile__id {
  min-width: 0;
  flex: 1 1 auto;
}
.bt-tile__name {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.74rem;
  font-weight: 650;
  line-height: 1.15;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.bt-tile__main {
  position: absolute;
  top: -0.25rem;
  left: -0.25rem;
  display: grid;
  place-items: center;
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.bt-tile__main svg {
  width: 0.62rem;
  height: 0.62rem;
}
.bt-tile__sub {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  margin-top: 0.1rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.7);
}
.bt-tile__set {
  width: 0.95rem;
  height: 0.95rem;
  flex: 0 0 auto;
}
.bt-tile__lines {
  display: grid;
  gap: 0.05rem;
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.72);
}
.bt-tile__lines li {
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
}
.bt-tile__line--crit {
  color: oklch(var(--bc) / 0.95);
  font-weight: 600;
}
.bt-tile__line--er {
  color: oklch(var(--in));
  font-weight: 600;
}
html[data-theme-style="light"] .bt-tile__line--er {
  color: oklch(from oklch(var(--in)) min(l, 0.5) c h);
}
.bt-tile__src {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: auto;
  overflow: hidden;
  font-size: 0.65rem;
  font-weight: 650;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: oklch(var(--bc) / 0.6);
}
.bt-tile__dot {
  flex: 0 0 auto;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.35);
}
.bt-tile--free .bt-tile__dot {
  background: oklch(var(--su));
}
.bt-tile--teammate .bt-tile__dot {
  background: oklch(var(--wa));
}
.bt-tile--other .bt-tile__src {
  color: oklch(var(--er));
}
/* a narrow tile (two a row on a 360 px phone at 130 % text): the main stat moves under the name, the picture shrinks,
   so names break between words instead of inside them */
@container bttile (max-width: 6.5rem) {
  .bt-tile__head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "pic name"
      "sub sub";
    gap: 0.3rem 0.4rem;
    align-items: center;
  }
  .bt-tile__id {
    display: contents;
  }
  .bt-tile__pic {
    grid-area: pic;
    width: 1.85rem;
    height: 1.85rem;
  }
  .bt-tile__name {
    grid-area: name;
    overflow-wrap: break-word;
  }
  .bt-tile__sub {
    grid-area: sub;
    margin-top: 0;
  }
}
html[data-theme-style="light"] .bt-tile--other .bt-tile__src {
  color: oklch(from oklch(var(--er)) min(l, 0.5) c h);
}
.bt-tile--other .bt-tile__dot {
  background: oklch(var(--er));
}
</style>
