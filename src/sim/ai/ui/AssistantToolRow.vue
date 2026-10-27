<template>
  <li class="ai-tool" :data-test-ai-tool-row="tool.name" :data-test-ai-tool-status="tool.status">
    <button
      type="button"
      class="ai-tool__row flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-base-content/5"
      :aria-expanded="expanded"
      @click="expanded = !expanded">
      <span class="mt-px inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span v-if="tool.status === 'preparing' || tool.status === 'running'" class="loading loading-spinner size-3.5 text-primary"></span>
        <svg v-else-if="tool.status === 'ok'" viewBox="0 0 24 24" class="size-4 text-success" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <svg v-else viewBox="0 0 24 24" class="size-4 text-error" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </span>
      <span class="min-w-0 flex-1 text-[0.8125rem] leading-5">
        <span class="font-medium text-base-content">{{ summary.label }}</span>
        <template v-for="chip in summary.chips" :key="chip">
          <span class="opacity-40"> · </span><span class="text-base-content/75">{{ chip }}</span>
        </template>
        <template v-if="summary.headline">
          <span class="opacity-40"> → </span>
          <span :class="tool.status === 'error' ? 'text-error' : 'font-semibold tabular-nums text-base-content'" data-test-ai-tool-headline>{{ summary.headline }}</span>
        </template>
        <span v-else-if="tool.status === 'preparing'" class="opacity-50"> · preparing…</span>
        <span v-else-if="tool.status === 'running'" class="opacity-50"> · running…</span>
      </span>
      <span v-if="tool.ms != null && tool.status !== 'running'" class="shrink-0 pt-px font-mono text-[11px] tabular-nums opacity-45">{{ formatMs(tool.ms) }}</span>
      <svg viewBox="0 0 24 24" class="mt-0.5 size-3.5 shrink-0 opacity-40 transition-transform" :class="{ 'rotate-90': expanded }" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
    <div v-if="expanded" class="ai-tool__detail mb-1.5 ml-8 mr-2 space-y-2 text-xs" data-test-ai-tool-detail>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 opacity-70">
        <code class="rounded bg-base-300/70 px-1.5 py-px font-mono text-[11px]">{{ tool.name }}</code>
        <span v-if="provenance">{{ provenance }}</span>
      </div>
      <div v-if="hasInput">
        <div class="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-50">Input</div>
        <pre class="max-h-32 overflow-auto rounded-md bg-base-300/60 p-2 font-mono text-[11px] leading-snug">{{ prettyJson(tool.input, 1500) }}</pre>
      </div>
      <div v-if="tool.result">
        <div class="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-50">{{ tool.status === "error" ? "Error" : "Result" }}</div>
        <pre class="max-h-56 overflow-auto rounded-md bg-base-300/60 p-2 font-mono text-[11px] leading-snug">{{ prettyJson(tool.result) }}</pre>
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { findTool } from "../tools/index";
import { formatMs, prettyJson, summarizeTool, type ToolCallView } from "./toolSummary";

const props = defineProps<{ tool: ToolCallView & { ms: number | null } }>();

const expanded = ref(false);
const summary = computed(() => summarizeTool(props.tool));
const provenance = computed(() => findTool(props.tool.name)?.provenance ?? null);
const hasInput = computed(() => {
  const input = props.tool.input;
  return !!input && typeof input === "object" && Object.keys(input as object).length > 0;
});
</script>
