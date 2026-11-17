<template>
  <li class="nm-row" :class="{ 'nm-row--compact': compact }" data-test-numbers-move :data-kind="move.kind" :data-id="move.id">
    <div class="nm-row__who">
      <span class="nm-row__faces" aria-hidden="true">
        <CharacterAvatar v-for="id in move.members" :id="id" :key="id" :size="compact ? 26 : 30" />
      </span>
      <span class="nm-row__names">
        <span class="nm-row__name">{{ title }}</span>
        <span class="nm-row__kind">{{ move.kind === "team" ? "Team damage per rotation" : "Best rotation, damage per rotation" }}</span>
      </span>
    </div>
    <p class="nm-row__figs">
      <span class="nm-row__nums" data-test-numbers-figures>
        <span>{{ show(move.before) }}</span>
        <span aria-hidden="true"> → </span><span class="sr-only"> to </span>
        <b>{{ show(move.after) }}</b>
      </span>
      <span v-if="pct" class="nm-row__pct" :class="up ? 'nm-up' : 'nm-down'" data-test-numbers-change>
        {{ pct }} <span class="nm-row__of">of the old figure</span>
      </span>
      <span v-else class="nm-row__pct nm-row__of">from nothing: there was no old figure</span>
    </p>
    <p class="nm-row__cause" data-test-numbers-cause>{{ cause }}</p>
    <template v-if="!compact">
      <p v-if="move.teamName" class="nm-row__sub">
        {{ move.teamName }}<template v-if="move.alsoNamed.length"> · and {{ move.alsoNamed.length }} more rotation{{ move.alsoNamed.length === 1 ? "" : "s" }} of these three with the same two figures</template>
      </p>
      <p v-if="move.rotation" class="nm-row__sub" data-test-numbers-rotation>
        Best rotation is now “{{ move.rotation.after ?? "none" }}”; it was “{{ move.rotation.before ?? "none" }}”.
      </p>
      <div class="nm-row__links">
        <RouterLink :to="rankingsLink" class="btn btn-outline btn-xs" data-test-numbers-to-rankings>{{ move.kind === "team" ? "My roster rankings" : `${shortName} on My roster rankings` }}</RouterLink>
        <WhyNumberButton v-if="move.kind === 'character'" :character-id="move.id" :rotation-name="move.rotationNow" />
      </div>
    </template>
  </li>
</template>

<script setup lang="ts">
// Wuthering Tools+ "What moved in your numbers": one figure that moved. Before → after, the change as a share of the
// old figure, the cause in one sentence, and (on the full list) a way to dig: the character's row on /my-rankings and
// "Why this number".
import { computed } from "vue";
import { RouterLink } from "vue-router";
import WhyNumberButton from "../anatomy/WhyNumberButton.vue";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterShortName } from "../display/names";
import { compact as compactNumber, fmt } from "../myRankings/format";
import { causeText, changeText, type Move } from "./compare";
import { NAMES } from "./useNumbersLog";

const props = withDefaults(defineProps<{ move: Move; imported?: boolean; compact?: boolean }>(), { imported: false, compact: false });

const title = computed(() => props.move.members.map((id) => (props.move.kind === "team" ? characterShortName(id) || id : NAMES.character(id))).join(" · "));
const shortName = computed(() => characterShortName(props.move.id) || props.move.id);
const show = (n: number): string => (props.compact ? compactNumber(n) : fmt(n));
const pct = computed(() => changeText(props.move.change));
const up = computed(() => props.move.after >= props.move.before);
const cause = computed(() => causeText(props.move.cause, NAMES, props.imported, props.move.kind));
const rankingsLink = computed(() => (props.move.kind === "character" ? { path: "/my-rankings", query: { focus: props.move.id, tab: "rotations" } } : { path: "/my-rankings" }));
</script>

<style scoped>
.nm-row {
  padding: 0.7rem 0.85rem;
  border-radius: 0.8rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.nm-row--compact {
  padding: 0.55rem 0.7rem;
  background: oklch(var(--b1));
}
.nm-row__who {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.nm-row__faces {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.15rem;
}
.nm-row__names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.nm-row__name {
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.nm-row__kind {
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.6);
}
.nm-row__figs {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.1rem 0.75rem;
  margin-top: 0.4rem;
}
.nm-row__nums {
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.nm-row__pct {
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.nm-row__of {
  font-size: 0.72rem;
  font-weight: 500;
  color: oklch(var(--bc) / 0.6);
}
.nm-up {
  color: oklch(var(--su));
}
.nm-down {
  color: oklch(var(--er));
}
.nm-row__cause {
  margin-top: 0.3rem;
  font-size: 0.84rem;
  line-height: 1.45;
}
.nm-row__sub {
  margin-top: 0.25rem;
  font-size: 0.74rem;
  line-height: 1.4;
  color: oklch(var(--bc) / 0.6);
  overflow-wrap: anywhere;
}
.nm-row__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.55rem;
}
@media (max-width: 767px) {
  .nm-row__links :deep(.btn) {
    min-height: 40px;
    height: auto;
  }
}
</style>
