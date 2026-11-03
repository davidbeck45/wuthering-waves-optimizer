<template>
  <div v-if="question" class="ai-parked mb-5 rounded-xl border border-primary/35 bg-primary/5 p-3 text-sm" role="status" data-test-ai-parked>
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="font-semibold">Your question is ready</p>
        <p class="mt-1 line-clamp-3 break-words leading-relaxed text-base-content/85" data-test-ai-parked-question>{{ question }}</p>
        <span v-if="state.draftAttachment" class="ai-parked__attach mt-1.5" data-test-ai-parked-attachment>
          <svg viewBox="0 0 24 24" class="size-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12l-8.5 8.5a5 5 0 01-7-7L14 5a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 8" /></svg>
          <span class="min-w-0 break-words">{{ state.draftAttachment.title }}</span>
        </span>
        <p class="mt-1.5 text-xs leading-relaxed text-base-content/80">
          Add your key below and it waits in the message box{{ state.draftAttachment ? ", with these numbers attached" : "" }}. Nothing is sent until
          you tap Send.
        </p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm btn-square -mr-1 -mt-1 shrink-0" title="Forget this question" aria-label="Forget this question" data-test-ai-parked-forget @click="forget">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ AI: an Explain (or any ask) made before a key is stored parks its question and numbers in the
// composer (useAssistant's parkInDraft), but the composer only shows once a key is in. This card says so above the key
// setup, so a tap on Explain visibly did something: what is waiting, what it carries, and that nothing goes out yet.
import { computed } from "vue";
import { useAssistant } from "../useAssistant";

const assistant = useAssistant();
const state = assistant.state;

/** The parked question's text, or the attachment's title when only data is waiting. */
const question = computed(() => state.draft.trim() || state.draftAttachment?.title || "");

function forget(): void {
  state.draft = "";
  assistant.clearDraftAttachment();
}
</script>

<style scoped>
.ai-parked__attach {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0.75rem;
  border: 1px solid oklch(var(--bc) / 0.18);
  background: oklch(var(--b1));
  padding: 0.0625rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: oklch(var(--bc) / 0.85);
}
</style>
