<template>
  <!-- A native modal <dialog> like ConfirmDialog / AppChooserModal: ToastLayer re-teleports toasts into it, Esc and
  the backdrop close it. -->
  <Teleport to="body">
    <dialog ref="dialogEl" class="modal ai-settings modal-bottom sm:modal-middle" data-test-ai-settings-dialog @close="onDialogClose" @keydown.stop>
      <div class="ai-settings__box modal-box flex max-h-[90dvh] w-full flex-col gap-0 p-0 sm:max-w-lg">
        <header class="flex shrink-0 items-center gap-2 border-b border-base-300 px-5 py-3.5">
          <span class="inline-flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7a4 4 0 11-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0115 7z" /></svg>
          </span>
          <h3 class="flex-1 text-lg font-semibold">AI settings</h3>
          <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label="Close" data-test-ai-settings-close @click="close">✕</button>
        </header>

        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <!-- key -->
          <section data-test-ai-settings-key>
            <h4 class="ai-label">Anthropic API key</h4>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-base-300 bg-base-200/50 px-3 py-2.5">
              <span class="flex min-w-[11rem] flex-1 items-center gap-2.5">
                <span class="size-2 shrink-0 rounded-full" :class="ai.key.value.present ? 'bg-success' : 'bg-base-content/30'" aria-hidden="true"></span>
                <span v-if="ai.key.value.present" class="min-w-0 text-sm">
                  <span class="whitespace-nowrap font-mono" data-test-ai-key-hint>{{ ai.key.value.hint }}</span>
                  <span class="block text-xs text-base-content/55">{{ ai.key.value.where === "local" ? "Remembered on this device" : "This tab only" }}</span>
                </span>
                <span v-else class="text-sm text-base-content/60">No key yet</span>
              </span>
              <span v-if="ai.key.value.present" class="ml-auto flex shrink-0 gap-2">
                <button type="button" class="btn btn-sm" :disabled="testing" data-test-ai-key-test @click="test">
                  <span v-if="testing" class="loading loading-spinner loading-xs"></span>
                  Test key
                </button>
                <button type="button" class="btn btn-sm btn-outline btn-error" data-test-ai-key-forget @click="forget">Forget key</button>
              </span>
            </div>
            <p v-if="testResult" class="mt-2 text-sm" :class="testResult.ok ? 'text-success' : 'text-error'" role="status" data-test-ai-key-test-result>
              {{ testResult.ok ? `The key works — ${testResult.model} is available.` : testResult.error.message }}
            </p>

            <form class="mt-3 flex gap-2" autocomplete="off" @submit.prevent="saveKey">
              <input
                v-model="newKey"
                type="password"
                autocomplete="off"
                spellcheck="false"
                :placeholder="ai.key.value.present ? 'Paste a different key' : 'Paste your key (sk-ant-…)'"
                class="input input-bordered input-sm min-w-0 flex-1 font-mono text-[16px] sm:text-sm"
                :class="{ 'input-error': keyError }"
                aria-label="Anthropic API key"
                data-test-ai-settings-key-input
                @input="keyError = null" />
              <button type="submit" class="btn btn-primary btn-sm" :disabled="!newKey.trim()" data-test-ai-settings-key-save>Save</button>
            </form>
            <p v-if="keyError" class="mt-1.5 text-xs text-error">{{ keyError }}</p>

            <label class="label mt-2 cursor-pointer justify-start gap-3 px-0">
              <input type="checkbox" class="toggle toggle-primary toggle-sm" :checked="remembered" data-test-ai-settings-remember @change="setRemember(($event.target as HTMLInputElement).checked)" />
              <span class="label-text">Remember the key on this device</span>
            </label>
            <p class="text-xs leading-relaxed text-base-content/55">
              Off, the key lives in this tab and is gone when you close it. Create keys at
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" class="link link-primary">console.anthropic.com</a>;
              a dedicated key in a workspace with a monthly spend limit is safest.
            </p>
          </section>

          <!-- model -->
          <section data-test-ai-settings-model>
            <h4 class="ai-label">Model</h4>
            <div class="space-y-2" role="radiogroup" aria-label="Model">
              <label
                v-for="m in AI_MODELS"
                :key="m.id"
                class="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors"
                :class="settings.model === m.id ? 'border-primary/60 bg-primary/5' : 'border-base-300 hover:border-base-content/25'">
                <input type="radio" name="ai-model" class="radio radio-primary radio-sm mt-0.5" :value="m.id" :checked="settings.model === m.id" :data-test-ai-model-option="m.id" @change="ai.update({ model: m.id })" />
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span class="font-medium">{{ m.label }}</span>
                    <span class="text-xs tabular-nums text-base-content/60">{{ priceLine(m.id) }}</span>
                  </span>
                  <span class="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-base-content/60">
                    <span>{{ m.blurb }}</span>
                    <span class="tabular-nums">≈ {{ formatUsdRange(typicalQuestionCost(m.id)) }} per question</span>
                  </span>
                </span>
              </label>
            </div>
            <p v-if="chatModel && chatModel !== settings.model" class="mt-2 text-xs text-base-content/60">
              The open chat keeps {{ modelInfo(chatModel).label }}; the new model applies from the next new chat.
            </p>
          </section>

          <!-- effort -->
          <section data-test-ai-settings-effort>
            <h4 class="ai-label">Effort</h4>
            <p class="-mt-1 mb-2.5 text-xs leading-relaxed text-base-content/55">How hard Claude thinks before answering. Higher is slower and costs more; medium suits most questions.</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <label v-for="f in FEATURES" :key="f.id" class="form-control">
                <span class="label-text mb-1 text-sm">{{ f.label }}</span>
                <select class="select select-bordered select-sm" :value="settings.effort[f.id]" :data-test-ai-effort="f.id" @change="ai.update({ effort: { [f.id]: ($event.target as HTMLSelectElement).value as AiEffort } })">
                  <option v-for="e in AI_EFFORTS" :key="e" :value="e">{{ EFFORT_LABELS[e] }}</option>
                </select>
              </label>
            </div>
          </section>

          <!-- budget -->
          <section data-test-ai-settings-budget>
            <h4 class="ai-label">Budget per conversation</h4>
            <div class="flex items-center gap-3">
              <label class="input input-bordered input-sm flex w-32 items-center gap-1">
                <span class="text-base-content/50">$</span>
                <input
                  type="number"
                  :min="MIN_BUDGET_USD"
                  :max="MAX_BUDGET_USD"
                  step="0.05"
                  class="w-full min-w-0 font-mono text-[16px] tabular-nums sm:text-sm"
                  :value="settings.budgetUsd.toFixed(2)"
                  aria-label="Budget per conversation in US dollars"
                  data-test-ai-budget
                  @change="setBudget(($event.target as HTMLInputElement).value)" />
              </label>
              <span class="text-xs leading-relaxed text-base-content/60">Claude asks before a chat goes past it. A soft limit — Anthropic's spend limit on your key is the hard one.</span>
            </div>
          </section>
        </div>

        <footer class="flex shrink-0 justify-end border-t border-base-300 px-5 py-3">
          <button type="button" class="btn btn-primary btn-sm px-5" data-test-ai-settings-done @click="close">Done</button>
        </footer>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useConfirm } from "../../../composables/useConfirm";
import { useToast } from "../../../composables/useToast";
import { looksLikeApiKey, MAX_BUDGET_USD, MIN_BUDGET_USD, useAiSettings, type AiFeature } from "../aiSettings";
import { testApiKey, type KeyTestResult } from "../client";
import { AI_EFFORTS, AI_MODELS, modelInfo, type AiEffort, type AiModel } from "../models";
import { formatUsdRange, MODEL_PRICES, typicalQuestionCost } from "../pricing";
import { useAssistant } from "../useAssistant";

const emit = defineEmits<{ close: [] }>();

const FEATURES: Array<{ id: AiFeature; label: string }> = [
  { id: "chat", label: "Chat questions" },
  { id: "explain", label: "Explain buttons" },
  { id: "vision", label: "Reading screenshots" },
];
const EFFORT_LABELS: Record<AiEffort, string> = { low: "Low — quick", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max — slowest" };

const ai = useAiSettings();
const settings = computed(() => ai.settings.value);
const assistant = useAssistant();
/** where the key really is wins over the stored flag (a key put in local storage by hand reads as remembered) */
const remembered = computed(() => (ai.key.value.where ? ai.key.value.where === "local" : settings.value.rememberKey));
const chatModel = computed(() => (assistant.conversation.value?.messages.length ? assistant.conversation.value.model : null));
const { confirm } = useConfirm();
const { showToast } = useToast();

const dialogEl = ref<HTMLDialogElement | null>(null);
const newKey = ref("");
const keyError = ref<string | null>(null);
const testing = ref(false);
const testResult = ref<KeyTestResult | null>(null);

const priceLine = (id: AiModel): string => {
  const p = MODEL_PRICES[id];
  const f = (v: number): string => (v >= 1 ? `$${v}` : `$${v.toFixed(2)}`);
  return `${f(p.input)} in · ${f(p.output)} out / M tokens`;
};

function saveKey(): void {
  const value = newKey.value.trim();
  if (!looksLikeApiKey(value)) {
    keyError.value = "That doesn't look like an Anthropic API key (they start with sk-ant-).";
    return;
  }
  const result = ai.setApiKey(value);
  if (!result.ok) {
    keyError.value = "Couldn't store the key: this browser blocks storage for the site.";
    return;
  }
  newKey.value = "";
  testResult.value = null;
  showToast("Key saved.", "success");
}

async function test(): Promise<void> {
  const key = ai.getApiKey();
  if (!key) return;
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await testApiKey(key, settings.value.model);
  } finally {
    testing.value = false;
  }
}

async function forget(): Promise<void> {
  const ok = await confirm("The key is removed from this browser. Your chat stays until you start a new one.", { title: "Forget the API key?", confirmLabel: "Forget key", variant: "error" });
  if (!ok) return;
  ai.clearApiKey();
  testResult.value = null;
  showToast("Key forgotten.", "info");
}

function setRemember(on: boolean): void {
  const key = ai.getApiKey();
  ai.update({ rememberKey: on });
  if (key && ai.key.value.where !== (on ? "local" : "session")) ai.setApiKey(key, on); // the flag already matched: move the key anyway
}

function setBudget(raw: string): void {
  const v = Number(raw);
  if (Number.isFinite(v) && v > 0) ai.update({ budgetUsd: v });
}

function close(): void {
  dialogEl.value?.close();
  emit("close"); // the dialog's own `close` event is queued; Esc / backdrop still come through it
}

function onDialogClose(): void {
  emit("close");
}

onMounted(() => {
  void nextTick(() => {
    if (dialogEl.value && !dialogEl.value.open) dialogEl.value.showModal();
  });
});
onBeforeUnmount(() => {
  if (dialogEl.value?.open) dialogEl.value.close();
});
</script>

<style scoped>
.ai-settings {
  z-index: 9000;
}
/* phone.css § 6 pads every phone modal box; this one's header, body and footer carry their own padding */
.ai-settings .ai-settings__box.modal-box.modal-box {
  padding: 0;
}
.ai-label {
  margin-bottom: 0.6rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.55);
}
</style>
