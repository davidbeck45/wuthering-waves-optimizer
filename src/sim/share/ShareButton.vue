<template>
  <!-- Wuthering Tools+ share cards: one button that opens the share sheet for a build or a team. Drop it into any row
       (batch-1's /my-rankings character and team rows, the calculator's build-card screen); the sheet only mounts on
       first use, so a long table of these costs nothing. -->
  <button
    v-bind="$attrs"
    type="button"
    class="btn gap-1.5"
    :class="[size === 'xs' ? 'btn-xs' : size === 'md' ? '' : 'btn-sm', variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : '']"
    :title="title"
    :aria-label="title"
    :data-test-share-button="testId"
    @click.stop="open">
    <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M12 3v12m0-12L8 7m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
    <span v-if="label" :class="{ 'max-sm:sr-only': compact }">{{ label }}</span>
  </button>
  <ShareSheet v-if="mounted" ref="sheet" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import ShareSheet from "./ShareSheet.vue";
import { characterName, type ShareSource } from "./buildCodec";

// two root nodes (the button and the lazily mounted sheet): a parent's class / data-* go on the button
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    source: ShareSource;
    label?: string;
    size?: "xs" | "sm" | "md";
    variant?: "primary" | "ghost" | "default";
    /** hide the label below `sm` (icon only) */
    compact?: boolean;
  }>(),
  { label: "Share", size: "sm", variant: "default", compact: false },
);

const mounted = ref(false);
const sheet = ref<InstanceType<typeof ShareSheet> | null>(null);
const title = computed(() => (props.source.kind === "team" ? "Share this team as a card or link" : `Share ${characterName(props.source.charId)}'s build as a card or link`));
const testId = computed(() => (props.source.kind === "team" ? `team:${props.source.teamId}` : props.source.charId));

async function open() {
  mounted.value = true;
  await nextTick();
  await sheet.value?.open(props.source);
}
</script>
