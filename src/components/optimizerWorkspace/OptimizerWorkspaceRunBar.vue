<template>
  <div
    class="optimizer-run-bar bg-base-200 border border-base-300 rounded-xl p-3 shadow-lg"
    data-test-optimizer-workspace-run-bar>
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="badge badge-lg h-auto py-1 gap-1.5 sm:hidden flex-1 justify-center"
        :class="summary.class"
        :aria-expanded="isExpanded"
        data-test-optimizer-workspace-run-bar-summary
        @click="isExpanded = !isExpanded">
        {{ summary.label }}
      </button>
      <div class="hidden sm:flex flex-wrap gap-1.5 flex-1">
        <template v-for="check in checks" :key="check.id">
          <component
            :is="check.section ? 'button' : 'span'"
            :type="check.section ? 'button' : undefined"
            class="badge badge-lg h-auto py-1 gap-1.5"
            :class="chipClass(check.state)"
            :data-test-optimizer-workspace-check="check.id"
            :data-test-optimizer-workspace-check-state="check.state"
            @click="check.section && emit('jump', check.section)">
            <svg
              v-if="check.state === 'ok'"
              class="size-3.5 text-success"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true">
              <path d="M6.4 11.2 3.2 8l-1 1 4.2 4.2 8-8-1-1z" />
            </svg>
            <svg
              v-else-if="check.state === 'missing' || check.state === 'warn'"
              class="size-3.5"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true">
              <path d="M8 1 0 15h16L8 1zm-.8 5h1.6v4.2H7.2V6zm0 5.4h1.6V13H7.2v-1.6z" />
            </svg>
            <span :class="{ underline: check.section && check.state !== 'ok' }">{{ check.label }}</span>
          </component>
        </template>
      </div>
      <button
        class="btn btn-primary shrink-0"
        :disabled="!isValid"
        data-test-optimizer-workspace-optimize-btn
        @click="emit('run')">
        <span class="sm:hidden">Run</span><span class="hidden sm:inline">Run Optimizer</span>
      </button>
    </div>
    <div v-if="isExpanded" class="flex flex-wrap gap-1.5 mt-2 sm:hidden">
      <button
        v-for="check in checks"
        :key="check.id"
        type="button"
        class="badge badge-lg h-auto py-1"
        :class="chipClass(check.state)"
        @click="check.section && emit('jump', check.section)">
        {{ check.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

defineOptions({ name: "OptimizerWorkspaceRunBar" });

export type OptimizerSetupSection = "sets" | "mainEcho" | "target" | "buffs" | "minStats";

const props = defineProps<{
  echoSetCount: number;
  mainEchoCount: number;
  hasTarget: boolean;
  buffsNotSetCount: number;
  minStatsCount: number;
}>();

const emit = defineEmits<{
  run: [];
  jump: [section: OptimizerSetupSection];
}>();

const isExpanded = ref(false);

type CheckState = "ok" | "missing" | "warn" | "info";
type Check = {
  id: string;
  label: string;
  state: CheckState;
  section?: OptimizerSetupSection;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const checks = computed<Check[]>(() => {
  const list: Check[] = [
    props.echoSetCount > 0
      ? { id: "sets", label: plural(props.echoSetCount, "echo set", "echo sets"), state: "ok" }
      : { id: "sets", label: "Pick an echo set", state: "missing", section: "sets" },
    props.mainEchoCount > 0
      ? { id: "mainEcho", label: plural(props.mainEchoCount, "main echo", "main echoes"), state: "ok" }
      : { id: "mainEcho", label: "Add a main echo", state: "missing", section: "mainEcho" },
    props.hasTarget
      ? { id: "target", label: "Target chosen", state: "ok" }
      : { id: "target", label: "Choose what to optimize for", state: "missing", section: "target" },
  ];
  if (props.buffsNotSetCount > 0) {
    list.push({
      id: "buffs",
      label: `${plural(props.buffsNotSetCount, "buff", "buffs")} not set`,
      state: "warn",
      section: "buffs",
    });
  }
  list.push({
    id: "minStats",
    label: props.minStatsCount
      ? plural(props.minStatsCount, "stat floor", "stat floors")
      : "No stat floors",
    state: "info",
  });
  return list;
});

const isValid = computed(() => checks.value.every((check) => check.state !== "missing"));

const summary = computed(() => {
  const missing = checks.value.filter((check) => check.state === "missing").length;
  if (missing) return { label: `${missing} to fix`, class: "badge-error badge-outline" };
  if (props.buffsNotSetCount) {
    return {
      label: `Ready · ${plural(props.buffsNotSetCount, "buff", "buffs")} not set`,
      class: "badge-warning badge-outline",
    };
  }
  return { label: "Ready", class: "badge-success badge-outline" };
});

function chipClass(state: CheckState) {
  switch (state) {
    case "missing":
      return "badge-error badge-outline cursor-pointer";
    case "warn":
      return "badge-warning badge-outline cursor-pointer";
    default:
      return "badge-ghost";
  }
}
</script>
