<template>
  <div class="rv-tl-row rv-tl-row--head mt-3">
    <div class="rv-tl-gutter flex items-end gap-2 text-[11px] uppercase tracking-wider opacity-60 pb-1">
      <span class="flex-1">Buffs</span>
      <span class="w-11 text-right" title="Share of the shown range the buff is held (sampled at presses)">Uptime</span>
      <span class="w-11 text-right" title="Share of the damage in the shown range dealt while it was held: the owner's hits for a Self buff, everyone's for Team and Enemy">Dmg</span>
    </div>
    <div class="flex items-end justify-end gap-3 pb-1 text-xs">
      <label class="flex items-center gap-1.5 cursor-pointer opacity-80">
        <input v-model="hideAlways" type="checkbox" class="checkbox checkbox-xs" data-test-rotation-hide-always />
        hide always-on
      </label>
    </div>
  </div>
  <template v-for="g in groups" :key="g.key">
    <div class="rv-tl-row">
      <div class="rv-tl-gutter pt-2 pb-0.5 text-xs font-bold" :class="g.hue ? 'rv-hue-text' : ''" :style="{ '--hue': g.hue }">{{ g.title }}</div>
      <div class="border-b border-base-300/60 self-end"></div>
    </div>
    <div v-for="row in g.rows" :key="row.track.key" class="rv-tl-row rv-tl-row--buff group" :data-test-rotation-buff="row.track.name">
      <div class="rv-tl-gutter flex items-center gap-2 min-w-0 text-xs" :title="row.title">
        <span class="size-2 rounded-full shrink-0 rv-hue-dot" :style="{ '--hue': hueOfName(row.track.source) }"></span>
        <span class="truncate flex-1">{{ shortBuff(row.track) }}<span v-if="row.track.maxStacks > 1" class="opacity-60"> ×{{ row.track.maxStacks }}</span></span>
        <span class="w-11 text-right tabular-nums" :class="row.always ? 'opacity-60 italic' : ''" data-test-rotation-buff-uptime>{{ row.always ? "always" : pct(row.up) }}</span>
        <span class="w-11 text-right tabular-nums opacity-70">{{ row.dmg == null ? "—" : pct(row.dmg) }}</span>
      </div>
      <svg :width="scale.width" height="18" class="block text-base-content" aria-hidden="true">
        <rect x="0" y="3" :width="scale.width" height="12" fill="currentColor" fill-opacity="0.04" rx="2" />
        <rect v-for="(w, i) in row.bars" :key="i" :x="w.x" y="3" :width="w.w" height="12" rx="2" class="rv-svg-fill" :style="{ '--hue': hueOfName(row.track.source) }" fill-opacity="0.8" />
      </svg>
    </div>
  </template>
  <div class="rv-tl-row">
    <div class="rv-tl-gutter"></div>
    <p class="text-[11px] opacity-60 pt-1">
      Sampled at presses: a timed buff runs for the time it had left, an untimed one until the next sample. Self = on that member only.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { damageCovered, uptime, type BuffTrack, type RotationModel } from "./extract";
import { xOf, type Scale } from "./timelineScale";

const props = defineProps<{ model: RotationModel; scale: Scale; hues: Map<string, string> }>();

const hideAlways = ref(false);
const pct = (x: number): string => `${Math.round(x * 100)} %`;
const hueOfName = (name: string): string => props.hues.get(name) ?? "";
/** "Lynae: Prismatic Overblast" from Lynae reads "Prismatic Overblast" — the dot carries whose it is (the tooltip the full name) */
const shortBuff = (t: BuffTrack): string => (t.source && t.name.startsWith(`${t.source}: `) ? t.name.slice(t.source.length + 2) : t.name);

interface Row {
  track: BuffTrack;
  up: number;
  dmg: number | null;
  always: boolean;
  bars: Array<{ x: number; w: number }>;
  title: string;
}

const rowsOf = (tracks: BuffTrack[]): Row[] => {
  const s = props.scale;
  return tracks
    .map((track) => {
      const up = uptime(track, s.from, s.to);
      const dmg = damageCovered(props.model, track, s.from, s.to);
      const always = track.permanent && up >= 0.995;
      const bars = track.windows
        .filter(([a, b]) => b > s.from && a < s.to)
        .map(([a, b]) => {
          const x = xOf(s, Math.max(a, s.from));
          return { x, w: Math.max(1, xOf(s, Math.min(b, s.to)) - x) };
        });
      const title = `${track.name}${track.maxStacks > 1 ? ` (up to ×${track.maxStacks})` : ""} — from ${track.source || "the fight"}${track.permanent ? " · untimed" : ""}`;
      return { track, up, dmg, always, bars, title };
    })
    .filter((r) => r.up > 0 && !(hideAlways.value && r.always))
    .sort((a, b) => b.up - a.up || a.track.name.localeCompare(b.track.name));
};

const groups = computed(() => {
  const members = props.model.run.members;
  const out: Array<{ key: string; title: string; hue?: string; rows: Row[] }> = [];
  const team = rowsOf(props.model.buffs.filter((b) => b.group === "team"));
  if (team.length) out.push({ key: "team", title: "Team", rows: team });
  members.forEach((m, i) => {
    const rows = rowsOf(props.model.buffs.filter((b) => b.group === "self" && b.owner === i));
    if (rows.length) out.push({ key: `self${i}`, title: `Self · ${m.name}`, hue: hueOfName(m.name), rows });
  });
  const enemy = rowsOf(props.model.buffs.filter((b) => b.group === "enemy"));
  if (enemy.length) out.push({ key: "enemy", title: "Enemy", rows: enemy });
  return out;
});
</script>
