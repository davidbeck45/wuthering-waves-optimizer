<template>
  <!-- Wuthering Tools+ /today: the Convene banners running now (convene's banner feed, on the player's clock) -->
  <section class="td-card" aria-labelledby="td-banners-title" data-test-today-banners>
    <div class="td-card__head td-card__head--tight">
      <h2 id="td-banners-title" class="td-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3z" /></svg>
        Banners
        <span v-if="phaseLabel" class="td-count">{{ phaseLabel }}</span>
      </h2>
      <RouterLink to="/convene?tab=banners" class="td-head-actions td-link whitespace-nowrap text-xs font-semibold" data-test-today-banners-link>All<span class="max-sm:hidden"> banners</span> ›</RouterLink>
    </div>

    <ul v-if="banners.length" class="td-bn">
      <li v-for="b in banners" :key="b.id" class="td-bn__row" :data-test-today-banner="b.fiveStars.map((f) => f.name).join(',')">
        <div class="td-bn__icons">
          <ConveneItemIcon v-for="f in b.fiveStars.slice(0, 2)" :key="f.name" :name="f.name" :item-key="f.key" :kind="b.type" size="md" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="td-bn__name">{{ b.fiveStars.map((f) => f.name).join(" · ") }}</div>
          <div class="td-meta">{{ b.type === "weapon" ? "Weapon" : "Resonator" }}<template v-if="b.title && !sameAsName(b)"> · {{ b.title }}</template></div>
        </div>
        <div class="td-row__when" :class="{ 'td-urgent': b.endMs - t.now.value < DAY }">
          {{ fmtDuration(b.endMs - t.now.value) }}
          <small>left</small>
        </div>
      </li>
    </ul>
    <p v-else-if="t.bannerFeed.feedLoading.value" class="td-empty"><span class="loading loading-spinner loading-xs"></span> Loading banners…</p>
    <p v-else class="td-empty">No Convene banner is running right now on this server clock.</p>
    <p v-if="banners.length && endsText" class="td-meta mt-2">{{ endsText }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onMounted } from "vue";
import { RouterLink } from "vue-router";
import type { ConveneBanner } from "../../convene/banners";
import { normalizeItemName } from "../../convene/items";
import ConveneItemIcon from "../../convene/ui/ConveneItemIcon.vue";
import { fmtDuration, fmtWhen, modeLabel } from "../format";
import { DAY_MS as DAY } from "../resets";
import { TODAY_KEY, type TodayModel } from "../useToday";

const t = inject(TODAY_KEY) as TodayModel;
// seed ∪ cache right away (no network — the page's refresh brings the banner cache up to date with the same menu read)
onMounted(() => void t.bannerFeed.load());

const banners = computed(() =>
  [...t.liveBanners.value].sort((a, b) => (a.type === b.type ? a.endMs - b.endMs : a.type === "resonator" ? -1 : 1)),
);
const phaseLabel = computed(() => banners.value[0]?.label ?? null);
const sameAsName = (b: ConveneBanner) => b.fiveStars.some((f) => normalizeItemName(f.name) === normalizeItemName(b.title ?? ""));
/** one line when every banner ends together (a phase) */
const endsText = computed(() => {
  const ends = new Set(banners.value.map((b) => b.endMs));
  if (ends.size !== 1) return null;
  const end = banners.value[0]!.endMs;
  return `This phase ends ${fmtWhen(end, t.now.value, t.timeMode.value, t.offsetHours.value)} ${modeLabel(t.timeMode.value)}.`;
});
</script>

<style scoped>
.td-bn {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.td-bn__row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}
.td-bn__icons {
  display: flex;
  flex-shrink: 0;
}
.td-bn__icons > * + * {
  margin-left: -0.6rem;
}
.td-bn__name {
  font-size: 0.86rem;
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
</style>
