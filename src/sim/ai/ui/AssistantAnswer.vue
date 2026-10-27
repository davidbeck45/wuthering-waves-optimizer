<template>
  <article class="ai-answer min-w-0" data-test-ai-answer :data-test-ai-answer-streaming="streaming ? '' : undefined">
    <div class="mb-2 flex items-center gap-2 text-xs font-semibold text-base-content/60">
      <span class="inline-flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor"><path :d="SPARKLE" /></svg>
      </span>
      Claude
    </div>

    <div v-if="tools.length" class="ai-answer__tools mb-3 overflow-hidden rounded-xl border border-base-300 bg-base-200/50" data-test-ai-tools>
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-base-content/5"
        :aria-expanded="toolsOpen"
        data-test-ai-tools-toggle
        @click="toolsOpen = !toolsOpen">
        <svg viewBox="0 0 24 24" class="size-3.5 opacity-60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" /></svg>
        <span class="font-semibold">{{ toolsHeading }}</span>
        <span v-if="failed" class="text-error">· {{ failed }} failed</span>
        <span v-if="totalMs" class="font-mono tabular-nums opacity-50">· {{ formatMs(totalMs) }}</span>
        <svg viewBox="0 0 24 24" class="ml-auto size-3.5 opacity-50 transition-transform" :class="{ 'rotate-180': toolsOpen }" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <ul v-show="toolsOpen" class="border-t border-base-300/70 px-1 py-1">
        <AssistantToolRow v-for="tool in tools" :key="tool.id" :tool="tool" />
      </ul>
    </div>

    <div v-if="showThinking" class="ai-answer__thinking mb-2 flex items-center gap-2 text-sm text-base-content/60" data-test-ai-thinking>
      <span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>{{ retrying ? retryLabel : tools.length ? "Working it out…" : "Thinking…" }}</span>
      <span v-if="elapsed >= 3" class="font-mono text-xs tabular-nums opacity-60">{{ elapsed }} s</span>
    </div>

    <MarkdownView
      v-if="text"
      class="ai-answer__text"
      :source="text"
      :streaming="streaming"
      :is-route="isRoute"
      data-test-ai-answer-text
      @navigate="emit('navigate')" />

    <template v-if="!streaming && (provenance.length || links.length || text)">
      <div v-if="provenance.length" class="mt-3 flex flex-wrap items-center gap-1.5" data-test-ai-provenance>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/45">Sources</span>
        <span
          v-for="p in provenance"
          :key="p"
          class="inline-flex max-w-full items-center gap-1 rounded-full border border-base-300 bg-base-200/60 px-2 py-0.5 text-[11px] leading-4 text-base-content/70">
          <span class="size-1.5 shrink-0 rounded-full bg-success/70" aria-hidden="true"></span>
          <span class="truncate">{{ p }}</span>
        </span>
      </div>
      <div v-if="links.length" class="mt-3 flex flex-wrap gap-2" data-test-ai-links>
        <button
          v-for="link in links"
          :key="link.key"
          type="button"
          class="btn btn-sm h-auto min-h-8 max-w-full flex-nowrap justify-start gap-1.5 rounded-lg border-base-300 bg-base-100 py-1 font-medium normal-case hover:border-primary/50 hover:bg-primary/10"
          :data-test-ai-link="link.kind"
          @click="emit('follow', link)">
          <svg viewBox="0 0 24 24" class="size-3.5 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <span class="min-w-0 truncate">{{ link.label }}</span>
        </button>
      </div>
      <div v-if="text" class="mt-2 flex items-center gap-1">
        <button type="button" class="btn btn-ghost btn-xs gap-1 px-1.5 font-normal normal-case text-base-content/55" data-test-ai-copy @click="copy">
          <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></svg>
          {{ copied ? "Copied" : "Copy" }}
        </button>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import MarkdownView from "./MarkdownView";
import AssistantToolRow from "./AssistantToolRow.vue";
import { deepLinksOf, formatMs, provenanceOf, type DeepLink, type ToolCallView } from "./toolSummary";

const props = withDefaults(
  defineProps<{
    text: string;
    tools: Array<ToolCallView & { ms: number | null }>;
    streaming?: boolean;
    thinking?: boolean;
    retrying?: "invalid_json" | "max_tokens" | null;
    startedAt?: number | null;
    // eslint-disable-next-line no-unused-vars -- the parameter of a function type
    isRoute?: (path: string) => boolean;
  }>(),
  { streaming: false, thinking: false, retrying: null, startedAt: null, isRoute: undefined },
);

const emit = defineEmits<{ navigate: []; follow: [link: DeepLink] }>();

const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";

const toolsOpen = ref(true);
const failed = computed(() => props.tools.filter((t) => t.status === "error").length);
const totalMs = computed(() => props.tools.reduce((sum, t) => sum + (t.ms ?? 0), 0));
const toolsHeading = computed(() => {
  const n = props.tools.length;
  const running = props.tools.some((t) => t.status === "running" || t.status === "preparing");
  return `${running ? "Running" : "Used"} ${n} engine tool${n === 1 ? "" : "s"}`;
});
const provenance = computed(() => provenanceOf(props.tools));
const links = computed(() => deepLinksOf(props.tools));
const showThinking = computed(() => props.streaming && (props.thinking || (!props.text && !props.tools.length) || !!props.retrying));
const retryLabel = computed(() => (props.retrying === "max_tokens" ? "Asking again with more room…" : "Asking again…"));

// seconds since the answer started, while it streams
const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
watch(
  () => props.streaming,
  (on) => {
    if (timer) clearInterval(timer);
    timer = null;
    if (!on) return;
    const tick = (): void => {
      elapsed.value = props.startedAt ? Math.floor((Date.now() - props.startedAt) / 1000) : 0;
    };
    tick();
    timer = setInterval(tick, 1000);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const copied = ref(false);
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard blocked */
  }
}
</script>

<style scoped>
.ai-dots {
  display: inline-flex;
  gap: 3px;
}
.ai-dots i {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: currentColor;
  opacity: 0.35;
  animation: ai-dot 1.2s infinite ease-in-out;
}
.ai-dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.ai-dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes ai-dot {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 0.9;
    transform: translateY(-2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-dots i {
    animation: none;
  }
}
</style>
