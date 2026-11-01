<template>
  <div class="echo-lab-echo flex min-w-0 items-center gap-2.5">
    <div
      class="echo-lab-echo__pic relative shrink-0 overflow-hidden rounded-full bg-base-300"
      :class="size === 'lg' ? 'size-12' : 'size-10'"
      :style="ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined">
      <img v-if="image" :src="image" :alt="name" class="size-full object-cover" loading="lazy" />
      <span
        v-if="cost"
        class="echo-lab-echo__cost el-echo-cost absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-base-content text-[0.6rem] font-bold leading-none text-base-100"
        :title="`Cost ${cost}`">{{ cost }}</span>
    </div>
    <div class="min-w-0">
      <div class="truncate font-semibold leading-tight" :title="name">{{ name }}</div>
      <!-- wraps instead of truncating: on a narrow card the main stat drops to its own line and the set keeps its name -->
      <div v-if="subtitle" class="el-echo-sub mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-xs opacity-70">
        <span class="flex min-w-0 max-w-full items-center gap-1">
          <img v-if="setImg" :src="setImg" :alt="setName" class="size-3.5 shrink-0" loading="lazy" />
          <span class="line-clamp-2 break-words" :title="setName">{{ setName }}</span>
        </span>
        <span v-if="main" class="shrink-0 whitespace-nowrap"><span class="opacity-50">· </span>{{ mainLabel(main) }}</span>
      </div>
      <div v-if="lines !== null && lines < 5" class="mt-1 flex items-center gap-0.5" :title="`${lines} of 5 substat lines`">
        <span
          v-for="n in 5"
          :key="n"
          class="h-1 w-3 rounded-full"
          :class="n <= lines ? 'bg-primary' : 'bg-base-300'"></span>
        <span class="ml-1 text-[0.65rem] opacity-60">{{ lines }}/5</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ Echo Lab — an echo's picture (rarity ring, cost badge), name, and set · main stat.
import { computed } from "vue";
import { echoImage, echoName, mainLabel, rankColor, setIcon, setLabel } from "./echoLabView";

const props = withDefaults(
  defineProps<{
    echo: string | null;
    set?: string | null;
    cost?: number | null;
    main?: string | null;
    rank?: number | null;
    lines?: number | null;
    subtitle?: boolean;
    size?: "md" | "lg";
  }>(),
  { set: null, cost: null, main: null, rank: null, lines: null, subtitle: true, size: "md" },
);

const name = computed(() => echoName(props.echo));
const image = computed(() => echoImage(props.echo));
const ring = computed(() => rankColor(props.rank));
const setImg = computed(() => setIcon(props.set));
const setName = computed(() => setLabel(props.set));
</script>
