<template>
  <button
    v-if="request !== null"
    v-bind="$attrs"
    type="button"
    class="wt-explain btn gap-1"
    :class="[size === 'xs' ? 'btn-xs' : 'btn-sm', variant === 'outline' ? 'btn-outline wt-explain--outline' : 'btn-ghost', iconOnly ? 'btn-square' : '', { 'wt-explain--phone-label': phoneLabel }]"
    :title="tooltip"
    :aria-label="tooltip"
    :data-test-explain="testId"
    @click.stop="go">
    <svg viewBox="0 0 24 24" class="wt-explain__icon size-4 shrink-0" fill="currentColor" aria-hidden="true"><path :d="SPARKLE" /></svg>
    <span v-if="!iconOnly" :class="{ 'md:sr-only': phoneLabel }">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
// Wuthering Tools+ AI: "Explain" — opens the Claude panel with the numbers on screen attached (useAssistant().explain).
// Without a key the panel shows its setup and keeps the question and the data in the composer. The request is built on
// click, so a long table of these costs nothing. (No template comment: it would make the root a fragment in dev builds
// only, and a parent's scoped styles would reach the button in production but not in dev.)
import { computed } from "vue";
import { useAssistant } from "../useAssistant";
import type { ExplainRequest } from "./explainPayloads";

// a parent's class / data-* go on the button (the root is conditional)
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** the request, or a function that builds it on click (null: nothing to explain yet — the button hides) */
    request: ExplainRequest | (() => ExplainRequest | null) | null;
    label?: string;
    size?: "xs" | "sm";
    variant?: "ghost" | "outline";
    /** icon only (the tooltip and aria-label carry the words) */
    iconOnly?: boolean;
    /** the label shows below `md` only (desktop rows are icon-only with a tooltip) */
    phoneLabel?: boolean;
    /** what is explained, for the tooltip ("Aemeath's ranking") */
    what?: string;
    testId?: string;
  }>(),
  { label: "Explain", size: "sm", variant: "ghost", iconOnly: false, phoneLabel: false, what: "these numbers", testId: "" },
);

const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";
const assistant = useAssistant();
const tooltip = computed(() => `Ask Claude to explain ${props.what} (opens the assistant with the numbers attached)`);

function go(): void {
  const r = typeof props.request === "function" ? props.request() : props.request;
  if (!r) return;
  assistant.explain({ title: r.title, data: r.data, question: r.question });
}
</script>

<style scoped>
.wt-explain {
  font-weight: 600;
  color: oklch(var(--p));
}
.wt-explain:not(.btn-square) {
  padding-left: 0.5rem;
  padding-right: 0.6rem;
}
/* desktop: an icon button the size of its neighbours; the label is for phones */
@media (min-width: 768px) {
  .wt-explain.wt-explain--phone-label {
    width: 2rem;
    padding-left: 0;
    padding-right: 0;
  }
}
.wt-explain--outline {
  border-color: oklch(var(--p) / 0.45);
}
.wt-explain--outline:hover {
  background: oklch(var(--p) / 0.1);
  border-color: oklch(var(--p));
  color: oklch(var(--p));
}
</style>
