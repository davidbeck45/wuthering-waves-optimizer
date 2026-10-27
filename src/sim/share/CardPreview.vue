<template>
  <!-- A card at its full design size, scaled down to the box it sits in (the capture takes the unscaled card node,
       so the PNG is always full resolution whatever the screen). -->
  <div ref="box" class="share-preview" data-test-share-preview>
    <div class="share-preview__frame" :style="{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }">
      <div ref="card" class="share-preview__card" :style="{ width: `${size.width}px`, height: `${size.height}px`, transform: `scale(${scale})` }">
        <TeamCard
          v-if="template === 'team'"
          :view="view"
          :headline="headline"
          :show-numbers="showNumbers"
          :owner="owner"
          :theme="theme"
          :team-name="teamName"
          :slots="slots"
          :duration="duration" />
        <PostCard
          v-else-if="view.members[0]"
          :view="view.members[0]"
          :headline="headline"
          :show-numbers="showNumbers"
          :owner="owner"
          :theme="theme" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import PostCard from "./PostCard.vue";
import TeamCard from "./TeamCard.vue";
import type { ShareHeadline } from "./buildCodec";
import type { CardView } from "./cardView";
import { POST_CARD, TEAM_CARD } from "./capture";

const props = defineProps<{
  view: CardView;
  template: "post" | "team";
  headline: ShareHeadline | null;
  showNumbers: boolean;
  owner: { uid?: string; name?: string } | null;
  theme: "dark" | "light";
  teamName?: string;
  slots?: Array<string | null>;
  duration?: number | string | null;
  /** cap the preview's height (px), e.g. the tall team card inside a dialog */
  maxHeight?: number;
}>();

const box = ref<HTMLElement | null>(null);
const card = ref<HTMLElement | null>(null);
const width = ref(0);
const size = computed(() => (props.template === "team" ? TEAM_CARD : POST_CARD));
const scale = computed(() => {
  if (!width.value) return 0.25;
  const byWidth = width.value / size.value.width;
  const byHeight = props.maxHeight ? props.maxHeight / size.value.height : Infinity;
  return Math.min(1, byWidth, byHeight);
});
const teamName = computed(() => props.teamName ?? props.view.teamName ?? "Team");
const slots = computed(() => props.slots ?? props.view.members.map((m) => m.charId));
const duration = computed(() => props.duration ?? null);

let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!box.value) return;
  width.value = box.value.clientWidth;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) width.value = w;
    });
    observer.observe(box.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());

defineExpose({ card, size });
</script>

<style scoped>
.share-preview {
  width: 100%;
}
.share-preview__frame {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 0.75rem;
  box-shadow: 0 1px 0 oklch(var(--bc) / 0.06), 0 8px 28px -12px rgba(0, 0, 0, 0.45);
}
.share-preview__card {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
</style>
