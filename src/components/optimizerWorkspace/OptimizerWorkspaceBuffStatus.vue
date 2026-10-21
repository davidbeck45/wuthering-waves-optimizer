<template>
  <div
    class="flex flex-wrap items-center gap-1.5"
    :data-test-optimizer-buff-status="resolved.status"
    :data-test-optimizer-buff-source="resolved.source">
    <span class="badge badge-sm" :class="statusClass">{{ statusLabel }}</span>
    <span
      v-if="resolved.source === 'calculator' && resolved.status !== 'always'"
      class="badge badge-sm badge-ghost"
      v-tooltip="'Matches your calculator setting. Change it here to set it for the optimizer only.'"
      data-test-optimizer-buff-from-calculator>
      From calculator
    </span>
    <button
      v-if="resolved.canUseCalculatorSetting"
      type="button"
      class="btn btn-xs btn-link px-0 min-h-0 h-auto"
      data-test-optimizer-buff-use-calculator
      @click.stop="emit('use-calculator-setting')">
      Use calculator setting
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ResolvedOptimizerBuff } from "../../calculator/optimizerBuffStatus";

defineOptions({ name: "OptimizerWorkspaceBuffStatus" });

const props = defineProps<{
  resolved: ResolvedOptimizerBuff;
  hasStacks: boolean;
}>();

const emit = defineEmits<{ "use-calculator-setting": [] }>();

const statusLabel = computed(() => {
  const { status, stacks } = props.resolved;
  switch (status) {
    case "always":
      return "Always on";
    case "unset":
      return "Not set";
    case "zero-stacks":
      return "On · 0 stacks";
    case "off":
      return "Off";
    case "on":
      return props.hasStacks ? `On · ${stacks} stack${stacks === 1 ? "" : "s"}` : "On";
  }
  return "";
});

const statusClass = computed(() => {
  switch (props.resolved.status) {
    case "unset":
    case "zero-stacks":
      return "badge-warning";
    case "on":
      return "badge-success badge-outline";
    default:
      return "badge-ghost";
  }
});
</script>
