<template>
  <div class="ai-onboarding space-y-5" data-test-ai-onboarding>
    <div>
      <div class="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7a4 4 0 11-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0115 7z" /><circle cx="16" cy="8" r="1" fill="currentColor" /></svg>
      </div>
      <h3 class="text-lg font-semibold leading-tight">Bring your own Claude key</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-base-content/70">
        The assistant runs on <strong class="font-semibold text-base-content">your own Anthropic API key</strong>. You pay Anthropic directly for what you
        use — there's no subscription and no Wuthering Tools+ server in between.
      </p>
    </div>

    <ol class="space-y-3 text-sm">
      <li class="flex gap-3">
        <span class="ai-step">1</span>
        <span class="min-w-0 pt-0.5 leading-relaxed">
          Create a key at
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" class="link link-primary font-medium" data-test-ai-console-link>console.anthropic.com</a>.
        </span>
      </li>
      <li class="flex gap-3">
        <span class="ai-step">2</span>
        <span class="min-w-0 pt-0.5 leading-relaxed">
          Recommended: make a <strong class="font-semibold">dedicated key</strong> in its own workspace with a <strong class="font-semibold">monthly spend limit</strong>, so a
          leaked or forgotten key can never cost more than you chose.
        </span>
      </li>
      <li class="flex gap-3">
        <span class="ai-step">3</span>
        <span class="min-w-0 pt-0.5 leading-relaxed">Paste it here.</span>
      </li>
    </ol>

    <form class="space-y-2.5" autocomplete="off" data-test-ai-key-form @submit.prevent="save">
      <label class="block">
        <span class="sr-only">Anthropic API key</span>
        <input
          ref="inputRef"
          v-model="key"
          type="password"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="sk-ant-…"
          class="input input-bordered w-full font-mono text-[16px] md:text-sm"
          :class="{ 'input-error': error }"
          data-test-ai-key-input
          @input="error = null" />
      </label>
      <p v-if="error" class="text-xs text-error" data-test-ai-key-error>{{ error }}</p>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="label cursor-pointer gap-2 p-0">
          <input v-model="remember" type="checkbox" class="toggle toggle-primary toggle-sm" data-test-ai-key-remember />
          <span class="label-text text-sm">Remember on this device</span>
        </label>
        <button type="submit" class="btn btn-primary btn-sm px-4" :disabled="!key.trim()" data-test-ai-key-save>Save key</button>
      </div>
      <p class="text-xs leading-relaxed text-base-content/55">
        {{ remember ? "Kept in this browser's local storage until you forget it in AI settings." : "Kept for this tab only; it's gone when you close it." }}
      </p>
    </form>

    <div class="rounded-xl border border-base-300 bg-base-200/50 p-3.5 text-sm" data-test-ai-privacy>
      <div class="mb-1 flex items-center gap-2 font-semibold">
        <svg viewBox="0 0 24 24" class="size-4 text-success" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
        Privacy
      </div>
      <p class="leading-relaxed text-base-content/70">
        Your questions and a summary of your account (characters, builds, teams) go from your browser straight to Anthropic,
        <strong class="font-semibold text-base-content">only when you ask</strong>. Nothing goes to our servers. Claude reads your data through the
        app's own calculator and can't change it.
      </p>
    </div>

    <div data-test-ai-costs>
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-base-content/50">Typical cost per question</div>
      <ul class="divide-y divide-base-300 overflow-hidden rounded-xl border border-base-300 text-sm">
        <li v-for="m in models" :key="m.id" class="flex items-center justify-between gap-3 px-3 py-2">
          <span class="min-w-0">
            <span class="font-medium">{{ m.label.replace("Claude ", "") }}</span>
            <span v-if="m.id === DEFAULT_AI_MODEL" class="badge badge-primary badge-outline badge-sm ml-1.5 align-middle">default</span>
            <span class="block truncate text-xs text-base-content/55">{{ m.blurb }}</span>
          </span>
          <span class="shrink-0 font-mono text-[0.8125rem] tabular-nums">{{ formatUsdRange(typicalQuestionCost(m.id)) }}</span>
        </li>
      </ul>
      <p class="mt-1.5 text-xs text-base-content/50">Estimates at list prices; a first question costs more than follow-ups (caching). You can change the model and set a budget in settings.</p>
    </div>

    <button type="button" class="btn btn-ghost btn-sm w-full font-normal normal-case text-base-content/70" data-test-ai-onboarding-settings @click="emit('settings')">
      More options in AI settings
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { looksLikeApiKey, useAiSettings } from "../aiSettings";
import { AI_MODELS, DEFAULT_AI_MODEL } from "../models";
import { formatUsdRange, typicalQuestionCost } from "../pricing";

const emit = defineEmits<{ saved: []; settings: [] }>();

const ai = useAiSettings();
const models = AI_MODELS;
const key = ref("");
const remember = ref(ai.settings.value.rememberKey);
const error = ref<string | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

function save(): void {
  const value = key.value.trim();
  if (!looksLikeApiKey(value)) {
    error.value = "That doesn't look like an Anthropic API key (they start with sk-ant-).";
    return;
  }
  const result = ai.setApiKey(value, remember.value);
  if (!result.ok) {
    error.value = "Couldn't store the key: this browser blocks storage for the site.";
    return;
  }
  key.value = "";
  emit("saved");
}

onMounted(() => {
  // a phone keyboard popping up over the onboarding text is worse than a tap
  if (window.matchMedia?.("(min-width: 768px)").matches) inputRef.value?.focus({ preventScroll: true });
});
</script>

<style scoped>
.ai-step {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: oklch(var(--p) / 0.15);
  color: oklch(var(--p));
  font-size: 0.75rem;
  font-weight: 700;
}
</style>
