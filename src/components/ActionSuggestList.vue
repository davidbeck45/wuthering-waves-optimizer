<template>
  <ul :id="`${idPrefix}-listbox`" ref="listEl" role="listbox" class="action-suggest menu bg-base-200 rounded-box shadow">
    <template v-for="(bucket, bucketIndex) in groups" :key="bucket.group ?? '__ungrouped__'">
      <li
        role="presentation"
        class="action-suggest__group menu-title w-full px-2 py-1"
        :data-test-rotation-quick-add-group="bucket.group ?? ''">
        <span class="text-[0.65rem] uppercase tracking-wide opacity-60">
          {{ formatActionGroup(bucket.group) || "Other" }}
        </span>
      </li>
      <li
        v-for="(item, itemIndex) in bucket.items"
        :id="optionId(offsets[bucketIndex] + itemIndex)"
        :key="item.key"
        role="option"
        :aria-selected="offsets[bucketIndex] + itemIndex === activeIndex"
        class="w-full">
        <a
          href="#"
          class="flex items-center gap-2 text-xs py-1.5 px-2"
          :class="{ active: offsets[bucketIndex] + itemIndex === activeIndex }"
          :data-test-rotation-quick-add-option="item.key"
          @mousedown.prevent
          @click.prevent="emit('choose', item)">
          <span class="flex-1 truncate">{{ item.label }}</span>
          <span
            v-if="countSuffix && countSuffix > 1 && offsets[bucketIndex] + itemIndex === activeIndex"
            class="opacity-70 whitespace-nowrap">
            ×{{ countSuffix }}
          </span>
        </a>
      </li>
    </template>
  </ul>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { formatActionGroup, type CandidateGroup, type MatchCandidate } from "../utils/actionTextMatch";

const props = defineProps<{
  groups: CandidateGroup[];
  /** Index into the flattened (bucket-by-bucket) item list; -1 for none. */
  activeIndex: number;
  /** Used to build unique option ids for aria-activedescendant. */
  idPrefix: string;
  /** Parsed "xN" count, shown beside the highlighted option when > 1. */
  countSuffix?: number;
}>();

const emit = defineEmits<{
  choose: [candidate: MatchCandidate];
}>();

const listEl = ref<HTMLElement | null>(null);

/** Flat index of each bucket's first item. */
const offsets = computed(() => {
  const out: number[] = [];
  let running = 0;
  for (const bucket of props.groups) {
    out.push(running);
    running += bucket.items.length;
  }
  return out;
});

function optionId(flatIndex: number): string {
  return `${props.idPrefix}-opt-${flatIndex}`;
}

watch(
  () => props.activeIndex,
  async (index) => {
    if (index < 0) return;
    await nextTick();
    const el = listEl.value?.querySelector(`[id="${optionId(index)}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: "nearest" });
  },
);
</script>

<style scoped lang="scss">
.action-suggest {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  right: 0;
  z-index: 10;
  max-height: 14rem;
  overflow-y: auto;
  flex-wrap: nowrap;
}
</style>
