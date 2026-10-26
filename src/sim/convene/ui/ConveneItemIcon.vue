<template>
  <!-- Wuthering Tools+: a resonator portrait or weapon icon on a rarity tile; initials when the app has no art -->
  <span
    class="convene-icon relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
    :class="[sizeClass, tileClass]"
    :title="title ?? name">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name"
      loading="lazy"
      decoding="async"
      class="h-full w-full object-cover"
      :class="kind === 'weapon' ? 'p-[8%] object-contain' : ''"
      @error="onError" />
    <span v-else class="font-semibold tracking-tight text-base-content/70" :class="textClass">{{ initials(name) }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { initials, itemIconUrl, weaponIconUrl } from "./format";

const props = withDefaults(
  defineProps<{
    name: string;
    itemKey: string | null;
    kind: "resonator" | "weapon";
    quality?: number;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    title?: string;
  }>(),
  { quality: 5, size: "md", title: undefined },
);

const failed = ref(false);
const triedWebp = ref(false);
const src = ref<string | null>(null);

function reset(): void {
  failed.value = false;
  triedWebp.value = false;
  src.value = props.itemKey ? itemIconUrl(props.kind, props.itemKey) : null;
}
reset();
watch(() => [props.itemKey, props.kind], reset);

function onError(): void {
  // a few weapons ship .webp art only (Bloodpact's Pledge, Whispers of Sirens)
  if (props.kind === "weapon" && props.itemKey && !triedWebp.value) {
    triedWebp.value = true;
    src.value = weaponIconUrl(props.itemKey, "webp");
    return;
  }
  failed.value = true;
}

const sizeClass = computed(
  () => ({ xs: "size-6", sm: "size-8", md: "size-10", lg: "size-14", xl: "size-20" })[props.size],
);
const textClass = computed(() => ({ xs: "text-[0.55rem]", sm: "text-[0.65rem]", md: "text-xs", lg: "text-sm", xl: "text-base" })[props.size]);
const tileClass = computed(() =>
  props.quality >= 5
    ? "bg-gradient-to-br from-amber-400/35 via-amber-500/10 to-transparent ring-1 ring-amber-400/50"
    : props.quality === 4
      ? "bg-gradient-to-br from-violet-400/35 via-violet-500/10 to-transparent ring-1 ring-violet-400/45"
      : "bg-base-300 ring-1 ring-base-content/10",
);
</script>
