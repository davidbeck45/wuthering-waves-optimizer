<template>
  <!-- phones: the sheet sits over a dimmed page; a tap outside puts it away -->
  <div v-if="state.open && isPhone" class="ai-backdrop fixed inset-0 z-[59] bg-black/45" aria-hidden="true" data-test-ai-backdrop @click="assistant.close()"></div>

  <!-- desktop, collapsed: a slim tab on the right edge so the page's own controls are free -->
  <button
    v-if="state.open && state.collapsed && !isPhone"
    type="button"
    class="ai-tab fixed right-0 z-[60] flex w-10 flex-col items-center gap-2 rounded-l-xl border border-r-0 border-base-300 bg-base-100 py-3 text-base-content shadow-xl transition-colors hover:bg-base-200"
    :style="{ top: `calc(${topPx}px + 1rem)` }"
    :title="`Expand the assistant (${modKey}+J)`"
    aria-label="Expand the assistant"
    data-test-ai-expand
    @click="expand">
    <span class="relative inline-flex size-6 items-center justify-center rounded-lg bg-primary/15 text-primary">
      <span v-if="state.busy" class="loading loading-spinner loading-xs"></span>
      <svg v-else viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true"><path :d="SPARKLE" /></svg>
    </span>
    <span class="ai-tab__label text-xs font-semibold tracking-wide">Claude</span>
  </button>

  <section
      v-show="state.open && !(state.collapsed && !isPhone)"
      class="ai-panel fixed z-[60] flex flex-col bg-base-100 text-base-content shadow-2xl"
      :class="isPhone ? 'ai-panel--sheet inset-x-0 bottom-0 rounded-t-2xl border-t border-base-300' : 'ai-panel--side right-0 bottom-0 border-l border-base-300'"
      :style="isPhone ? undefined : { top: `${topPx}px` }"
      role="complementary"
      aria-label="Claude assistant"
      data-test-ai-panel
      @keydown="onPanelKeydown">
      <div v-if="isPhone" class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-base-content/20" aria-hidden="true"></div>

      <!-- header -->
      <header class="flex shrink-0 items-center gap-1.5 border-b border-base-300 py-2 pl-4 pr-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="size-4" fill="currentColor"><path :d="SPARKLE" /></svg>
          </span>
          <h2 class="shrink-0 text-[0.95rem] font-semibold max-sm:sr-only">Claude</h2>
          <button
            type="button"
            class="badge badge-ghost h-6 min-w-0 shrink gap-1 truncate border-base-300 px-2 text-xs font-medium hover:border-primary/50"
            :title="modelTitle"
            data-test-ai-model-chip
            @click="assistant.openSettings()">
            <span class="truncate">{{ modelLabel }}</span>
          </button>
          <span
            v-if="keyPresent"
            class="ml-auto shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums"
            :class="overBudget ? 'bg-warning/15 text-warning' : 'text-base-content/60'"
            :title="costTitle"
            data-test-ai-cost>
            {{ formatUsd(cost?.costUsd ?? 0) }}
          </span>
        </div>
        <div class="flex shrink-0 items-center">
          <button type="button" class="btn btn-ghost btn-sm btn-square" title="AI settings" aria-label="AI settings" data-test-ai-settings @click="assistant.openSettings()">
            <svg viewBox="0 0 24 24" class="size-[18px]" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path :d="GEAR" /></svg>
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square disabled:bg-transparent disabled:opacity-30"
            title="New chat"
            aria-label="New chat"
            :disabled="!hasMessages && !state.notice"
            data-test-ai-new-chat
            @click="newChat">
            <svg viewBox="0 0 24 24" class="size-[18px]" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
          </button>
          <button
            v-if="!isPhone"
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            title="Collapse to the side"
            aria-label="Collapse to the side"
            data-test-ai-collapse
            @click="collapse">
            <svg viewBox="0 0 24 24" class="size-[18px]" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 6l6 6-6 6M5 6l6 6-6 6" /></svg>
          </button>
          <button type="button" class="btn btn-ghost btn-sm btn-square" :title="`Close (Esc)`" aria-label="Close the assistant" data-test-ai-close @click="assistant.close()">
            <svg viewBox="0 0 24 24" class="size-[18px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </header>

      <!-- body -->
      <div ref="scrollRef" class="ai-panel__body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4" data-test-ai-body @scroll.passive="onScroll">
        <AssistantOnboarding v-if="!keyPresent" @saved="onKeySaved" @settings="assistant.openSettings()" />

        <template v-else>
          <!-- empty: what to ask on this page -->
          <div v-if="!entries.length && !state.pending && !state.live" class="flex flex-col items-center pt-4 text-center" data-test-ai-empty>
            <div class="ai-hero mb-3 inline-flex size-12 items-center justify-center rounded-2xl text-primary" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="size-6" fill="currentColor"><path :d="SPARKLE" /></svg>
            </div>
            <h3 class="text-base font-semibold">Ask about your account</h3>
            <p class="mt-1 max-w-[19rem] text-sm leading-relaxed text-base-content/65">
              Answers use the app's own engine on your builds and teams. Claude can read your data, never change it.
            </p>
            <div class="mt-5 w-full space-y-2 text-left">
              <div class="px-1 text-[11px] font-semibold uppercase tracking-wider text-base-content/45">{{ suggestionHeading }}</div>
              <button
                v-for="s in suggestions"
                :key="s"
                type="button"
                class="ai-suggestion group flex w-full items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                data-test-ai-suggestion
                @click="assistant.ask(s)">
                <span class="min-w-0 flex-1">{{ s }}</span>
                <svg viewBox="0 0 24 24" class="size-4 shrink-0 text-base-content/30 transition-colors group-hover:text-primary" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>

          <div class="space-y-6">
            <template v-for="(entry, i) in entries" :key="`${entry.kind}-${entry.index}`">
              <div v-if="entry.kind === 'user'" class="group flex flex-col items-end gap-1" data-test-ai-question>
                <div class="ai-question max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm leading-relaxed">{{ entry.text }}</div>
                <div v-if="entry.attachments.length || entry.images" class="flex max-w-[88%] flex-wrap justify-end gap-1">
                  <span v-for="a in entry.attachments" :key="a.title" class="ai-attach" data-test-ai-attachment>
                    <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12l-8.5 8.5a5 5 0 01-7-7L14 5a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 8" /></svg>
                    {{ a.title }}
                  </span>
                  <span v-if="entry.images" class="ai-attach">{{ entry.images }} image{{ entry.images === 1 ? "" : "s" }}</span>
                </div>
                <button
                  v-if="!state.busy"
                  type="button"
                  class="btn btn-ghost btn-xs h-6 min-h-6 px-1.5 font-normal normal-case text-base-content/50 md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
                  data-test-ai-edit
                  @click="edit(entry.index, entry.text, i)">
                  Edit
                </button>
              </div>
              <AssistantAnswer
                v-else
                :text="entry.text"
                :tools="toolViewsOf(entry.tools, assistant.toolMs)"
                :is-route="isRoute"
                @navigate="onNavigate"
                @follow="follow" />
            </template>

            <div v-if="state.pending" class="flex flex-col items-end gap-1" data-test-ai-question data-test-ai-pending>
              <div class="ai-question max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm leading-relaxed">{{ state.pending.text }}</div>
              <div v-if="state.pending.attachments.length" class="flex max-w-[88%] flex-wrap justify-end gap-1">
                <span v-for="a in state.pending.attachments" :key="a.title" class="ai-attach" data-test-ai-attachment>{{ a.title }}</span>
              </div>
            </div>

            <AssistantAnswer
              v-if="state.live"
              :text="state.live.text"
              :tools="state.live.tools"
              streaming
              :thinking="state.live.thinking"
              :retrying="state.live.retrying"
              :started-at="state.live.startedAt"
              :is-route="isRoute"
              @navigate="onNavigate" />

            <!-- Claude wants to go past the budget or the tool-round cap: ask -->
            <div v-if="state.confirm" class="rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm" role="alert" data-test-ai-confirm :data-test-ai-confirm-kind="state.confirm.request.kind">
              <p v-if="state.confirm.request.kind === 'budget'" class="leading-relaxed">
                This chat has used <strong class="font-mono">{{ formatUsd(state.confirm.request.spentUsd) }}</strong> of its
                <strong class="font-mono">{{ formatUsd(state.confirm.request.limitUsd) }}</strong> budget. Keep going?
              </p>
              <p v-else class="leading-relaxed">Claude has run {{ state.confirm.request.rounds }} rounds of engine tools for this answer and wants more.</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="btn btn-warning btn-sm" data-test-ai-confirm-yes @click="assistant.answerConfirm(true)">
                  {{ state.confirm.request.kind === "budget" ? `Continue (+${formatUsd(budgetStep)})` : "Let it continue" }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-test-ai-confirm-no @click="assistant.answerConfirm(false)">
                  {{ state.confirm.request.kind === "budget" ? "Stop here" : "Answer now" }}
                </button>
              </div>
            </div>

            <!-- how the last answer ended, when it wasn't simply done -->
            <div v-if="state.notice && !state.busy" data-test-ai-notice :data-test-ai-notice-kind="state.notice.kind">
              <div v-if="state.notice.kind === 'error'" class="rounded-xl border border-error/40 bg-error/10 p-3.5 text-sm" role="alert">
                <p class="font-medium">{{ state.notice.error.message }}</p>
                <div class="mt-2.5 flex flex-wrap items-center gap-2">
                  <button v-if="state.notice.error.retryable || state.notice.canContinue" type="button" class="btn btn-sm" data-test-ai-retry @click="assistant.retry()">Retry</button>
                  <button
                    v-if="['auth', 'permission', 'not_found', 'no_key'].includes(state.notice.error.kind)"
                    type="button"
                    class="btn btn-sm"
                    @click="assistant.openSettings()">
                    Open AI settings
                  </button>
                  <button v-if="!state.notice.error.retryable && !state.notice.canContinue && lastQuestionAvailable" type="button" class="btn btn-ghost btn-sm" data-test-ai-retry @click="assistant.retry()">Try again</button>
                </div>
                <details v-if="state.notice.error.detail || state.notice.error.requestId" class="mt-2 text-xs opacity-70">
                  <summary class="cursor-pointer select-none">Details</summary>
                  <p class="mt-1 break-words font-mono">{{ state.notice.error.detail }}</p>
                  <p v-if="state.notice.error.requestId" class="mt-1 font-mono">request {{ state.notice.error.requestId }}</p>
                </details>
              </div>
              <div v-else-if="state.notice.kind === 'refusal'" class="rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm leading-relaxed" role="status">
                {{ state.notice.message }}
              </div>
              <div v-else class="flex flex-wrap items-center gap-2 text-sm text-base-content/60" role="status">
                <span>{{ noticeText }}</span>
                <button v-if="'canContinue' in state.notice && state.notice.canContinue" type="button" class="btn btn-ghost btn-xs normal-case text-primary" data-test-ai-continue @click="assistant.continueAnswer()">Continue</button>
                <button v-if="state.notice.kind === 'context_full'" type="button" class="btn btn-ghost btn-xs normal-case text-primary" @click="newChat">New chat</button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- composer -->
      <form v-if="keyPresent" class="ai-composer shrink-0 border-t border-base-300 bg-base-100 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5" data-test-ai-composer @submit.prevent="submit">
        <div v-if="state.draftAttachment" class="mb-2 flex items-center gap-1.5">
          <span class="ai-attach" data-test-ai-draft-attachment>
            <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12l-8.5 8.5a5 5 0 01-7-7L14 5a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 8" /></svg>
            {{ state.draftAttachment.title }}
          </span>
          <button type="button" class="btn btn-ghost btn-xs btn-circle" aria-label="Remove the attached data" @click="assistant.clearDraftAttachment()">✕</button>
        </div>
        <div class="flex items-end gap-2 rounded-xl border border-base-300 bg-base-200/40 py-1.5 pl-3 pr-1.5 transition-colors focus-within:border-primary/60 focus-within:bg-base-100">
          <textarea
            ref="inputRef"
            v-model="state.draft"
            rows="1"
            class="ai-input min-h-[2rem] flex-1 resize-none bg-transparent py-1 text-[16px] leading-6 outline-none placeholder:text-base-content/40 md:text-sm"
            :placeholder="placeholder"
            aria-label="Ask Claude"
            enterkeyhint="send"
            data-test-ai-input
            @keydown="onInputKeydown"
            @input="autosize"></textarea>
          <button v-if="state.busy" type="button" class="btn btn-neutral btn-sm btn-square shrink-0" title="Stop" aria-label="Stop the answer" data-test-ai-stop @click="assistant.stop()">
            <svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
          </button>
          <button v-else type="submit" class="btn btn-primary btn-sm btn-square shrink-0" :disabled="!state.draft.trim()" title="Send (Enter)" aria-label="Send" data-test-ai-send>
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
          </button>
        </div>
        <div class="mt-1.5 hidden items-center justify-between gap-2 px-1 text-[11px] text-base-content/45 md:flex">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span class="truncate">{{ modelLabel }} · {{ effortLabel }} effort</span>
        </div>
      </form>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCharacterStore } from "../../../stores/character";
import { useTeamRotationsStore } from "../../../stores/teamRotations";
import { useConfirm } from "../../../composables/useConfirm";
import { useToast } from "../../../composables/useToast";
import { useAssistant } from "../useAssistant";
import { useAiSettings } from "../aiSettings";
import { transcriptOf } from "../conversationStore";
import { modelInfo } from "../models";
import { cacheHitRate, formatUsd } from "../pricing";
import { characterKeyByName, isAppRoute, openCharacter, openTeam } from "../../shell/navigation";
import type { CharacterStoreLike } from "../../shell/navigation";
import { modKeyLabel } from "../../shell/shellDom";
import { suggestionsFor } from "./suggestions";
import { toolViewsOf, type DeepLink } from "./toolSummary";
import AssistantAnswer from "./AssistantAnswer.vue";
import AssistantOnboarding from "./AssistantOnboarding.vue";

const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";
const GEAR =
  "M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z";

const assistant = useAssistant();
const state = assistant.state;
const ai = useAiSettings();
const route = useRoute();
const router = useRouter();
const characterStore = useCharacterStore();
const teamStore = useTeamRotationsStore();
const { confirm } = useConfirm();
const { showToast } = useToast();
const modKey = modKeyLabel();

// ── layout ──
const phoneQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 767px)") : null;
const isPhone = ref(phoneQuery?.matches ?? false);
const topPx = ref(80);
function measure(): void {
  isPhone.value = phoneQuery?.matches ?? false;
  const nav = document.getElementById("navbar-container");
  const bottom = nav?.getBoundingClientRect().bottom ?? 0;
  topPx.value = Math.max(0, Math.round(bottom || 80));
}
const onPhoneChange = (): void => measure();

const scrollRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);

// ── data ──
const keyPresent = computed(() => ai.key.value.present);
const conversation = assistant.conversation;
const entries = computed(() => (conversation.value ? transcriptOf(conversation.value.messages) : []));
const hasMessages = computed(() => entries.value.length > 0);
const modelId = computed(() => conversation.value?.model ?? ai.settings.value.model);
const modelLabel = computed(() => modelInfo(modelId.value).label.replace("Claude ", ""));
const modelTitle = computed(() =>
  conversation.value && conversation.value.model !== ai.settings.value.model
    ? `This chat runs on ${modelInfo(conversation.value.model).label}; ${modelInfo(ai.settings.value.model).label} applies from the next new chat.`
    : `${modelInfo(modelId.value).label} — change in AI settings`,
);
const effortLabel = computed(() => (state.draftFeature === "explain" ? ai.settings.value.effort.explain : ai.settings.value.effort.chat));
const cost = assistant.totalCost;
const budget = computed(() => conversation.value?.budgetUsd ?? ai.settings.value.budgetUsd);
const budgetStep = computed(() => conversation.value?.budgetStepUsd ?? ai.settings.value.budgetUsd);
const overBudget = computed(() => (cost.value?.costUsd ?? 0) >= budget.value);
const costTitle = computed(() => {
  const u = cost.value;
  if (!u || !u.requests) return `Cost of this conversation (soft budget ${formatUsd(budget.value)})`;
  const tokens = u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  return `This conversation: ${u.requests} request${u.requests === 1 ? "" : "s"} · ${(tokens / 1000).toFixed(1)}K tokens · ${Math.round(cacheHitRate(u) * 100)} % of the prompt from cache · soft budget ${formatUsd(budget.value)}`;
});
const lastQuestionAvailable = computed(() => entries.value.some((e) => e.kind === "user") || !!state.draft);

const page = computed(() => {
  void route.fullPath;
  return assistant.currentPage();
});
const suggestions = computed(() => suggestionsFor(route.path, { activeCharacter: page.value.activeCharacterName, openTeam: page.value.openTeam }));
const suggestionHeading = computed(() => (page.value.title ? `Try asking · ${page.value.title}` : "Try asking"));
const placeholder = computed(() => (hasMessages.value ? "Ask a follow-up…" : "Ask about your builds, teams or echoes…"));

const noticeText = computed(() => {
  switch (state.notice?.kind) {
    case "stopped":
      return "Stopped.";
    case "budget":
      return "Stopped at this chat's budget.";
    case "max_tokens":
      return "The answer hit its length limit and was cut off.";
    case "context_full":
      return "This chat is full.";
    case "tool_limit":
      return "Answered without more tool rounds.";
    default:
      return "";
  }
});

const isRoute = (path: string): boolean => isAppRoute(router, path);

// ── actions ──
function collapse(): void {
  state.collapsed = true;
}
function expand(): void {
  state.collapsed = false;
  state.focusTick += 1;
}

async function newChat(): Promise<void> {
  if (hasMessages.value && state.busy) {
    const ok = await confirm("Stop the answer in progress and start a new chat?", { title: "New chat", confirmLabel: "New chat" });
    if (!ok) return;
  }
  assistant.newChat();
}

async function edit(messageIndex: number, text: string, entryIndex: number): Promise<void> {
  const later = entries.value.slice(entryIndex + 1).filter((e) => e.kind === "user").length;
  if (later > 0) {
    const ok = await confirm(`Editing this question takes it, its answer and the ${later === 1 ? "question" : `${later} questions`} after it out of the chat.`, {
      title: "Edit question",
      confirmLabel: "Edit",
      variant: "warning",
    });
    if (!ok) return;
  }
  await assistant.editQuestion(messageIndex, text);
}

function submit(): void {
  assistant.submitDraft();
  void nextTick(() => {
    autosize();
    scrollToBottom(true);
  });
}

function onKeySaved(): void {
  showToast("Key saved. Ask away.", "success");
  state.focusTick += 1;
}

function onNavigate(): void {
  if (isPhone.value) assistant.close();
}

async function follow(link: DeepLink): Promise<void> {
  if (link.kind === "route") {
    await router.push(link.path);
  } else if (link.kind === "character") {
    const key = characterKeyByName(link.name);
    if (!key) return showToast(`Couldn't find ${link.name} in the roster.`, "warning");
    await openCharacter(router, characterStore as unknown as CharacterStoreLike, key);
  } else {
    const team = (teamStore.teams as Array<{ id: string; name?: string }>).find((t) => (t.name || "(unnamed team)") === link.name);
    if (!team) return showToast(`The team "${link.name}" isn't saved any more.`, "warning");
    const moved = await openTeam(router, team.id);
    if (!moved) showToast(`Go back to the team list to open "${link.name}".`, "info");
  }
  onNavigate();
}

// ── keyboard ──
function onPanelKeydown(event: KeyboardEvent): void {
  // the page underneath has its own document-level key handlers (Riley's /rankings: Enter jumps to his search box);
  // nothing typed or pressed in the panel is theirs. Ctrl/Cmd+K / J are read on window, in the capture phase, first.
  if (event.key !== "Escape") event.stopPropagation();
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}

function autosize(): void {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
}

// ── scrolling: follow the answer while the player is at the bottom ──
let pinned = true;
function onScroll(): void {
  const el = scrollRef.value;
  if (!el) return;
  pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}
function scrollToBottom(force = false): void {
  const el = scrollRef.value;
  // onboarding and the empty state read from the top
  if (!el || !keyPresent.value || (!entries.value.length && !state.pending && !state.live) || (!force && !pinned)) return;
  el.scrollTop = el.scrollHeight;
  pinned = true;
}
watch(
  () => [state.live?.text.length, state.live?.tools.length, state.live?.tools.map((t) => t.status).join(), entries.value.length, state.notice, state.confirm, state.pending],
  () => void nextTick(() => scrollToBottom()),
);

// ── focus ──
watch(
  () => state.focusTick,
  () =>
    void nextTick(() => {
      autosize();
      if (!state.open || state.collapsed) return;
      // on a phone the keyboard would cover the sheet: focus only when the player starts typing
      if (isPhone.value && !state.draft) return;
      inputRef.value?.focus({ preventScroll: true });
    }),
);
watch(
  () => state.open,
  (open) => {
    if (!open) return;
    measure();
    void nextTick(() => scrollToBottom(true));
  },
);

onMounted(() => {
  measure();
  window.addEventListener("resize", measure, { passive: true });
  phoneQuery?.addEventListener?.("change", onPhoneChange);
  void nextTick(() => {
    scrollToBottom(true);
    if (state.open && !isPhone.value) inputRef.value?.focus({ preventScroll: true });
  });
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", measure);
  phoneQuery?.removeEventListener?.("change", onPhoneChange);
});
</script>

<style scoped>
.ai-panel--side {
  width: min(420px, 100vw);
}
.ai-panel--sheet {
  height: min(85dvh, 760px);
  max-height: 85dvh;
}
.ai-hero {
  background:
    radial-gradient(120% 120% at 0% 0%, oklch(var(--p) / 0.28), transparent 60%),
    radial-gradient(120% 120% at 100% 100%, oklch(var(--s) / 0.22), transparent 60%),
    oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.18);
}
.ai-tab__label {
  writing-mode: vertical-rl;
}
.ai-attach {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.25rem;
  border-radius: 9999px;
  border: 1px solid oklch(var(--bc) / 0.15);
  background: oklch(var(--b2) / 0.8);
  padding: 0.0625rem 0.5rem;
  font-size: 11px;
  line-height: 1.25rem;
  color: oklch(var(--bc) / 0.75);
}
.ai-input {
  max-height: 168px;
}

/* Transform-only CSS animations, not <Transition>: in headless Electron (Cypress) frames never advance — Vue's
   transitions wait on requestAnimationFrame and an opacity animation would sit at 0 — so nothing may start hidden; a
   small offset that never completes leaves the panel usable. `display: none → flex` (v-show) replays them. */
.ai-panel--side {
  animation: ai-slide-in 0.2s ease-out;
}
.ai-panel--sheet {
  animation: ai-sheet-in 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ai-backdrop {
  animation: ai-fade-in 0.2s ease-out; /* opacity is fine here: a backdrop stuck transparent still closes on a tap */
}
@keyframes ai-slide-in {
  from {
    transform: translateX(16px);
  }
}
@keyframes ai-sheet-in {
  from {
    transform: translateY(24px);
  }
}
@keyframes ai-fade-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-panel--side,
  .ai-panel--sheet,
  .ai-backdrop {
    animation: none;
  }
}
</style>

<style>
/* The panel (z-60) starts under the nav (#navbar-container, fixed, z-50), so the nav's own dropdowns — the utility
   menu, the theme chooser, both focus-driven, and the phone hamburger <details> — would open behind it. While one is
   open the nav steps above the panel; the bar itself never overlaps the panel, only the dropdown does. */
#navbar-container:has(.dropdown:focus-within, details[open]) {
  z-index: 61;
}

/* Claude's answers (MarkdownView): Tailwind's preflight strips every margin, so the rhythm is set here. */
.ai-md {
  font-size: 0.875rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.ai-md > * + * {
  margin-top: 0.65em;
}
.ai-md__h {
  margin-top: 1em;
  line-height: 1.35;
}
.ai-md__list > li + li {
  margin-top: 0.25em;
}
.ai-md__list .ai-md__list {
  margin-top: 0.25em;
}
.ai-md__table th {
  font-size: 11px;
  text-transform: none;
  color: oklch(var(--bc) / 0.65);
  white-space: nowrap;
}
.ai-md__table td,
.ai-md__table th {
  padding: 0.35rem 0.6rem;
}
.ai-md__table td {
  font-size: 0.8125rem;
}
.ai-md--streaming > :last-child::after {
  content: "";
  display: inline-block;
  width: 0.45em;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  border-radius: 1px;
  background: oklch(var(--p));
  animation: ai-caret 1s steps(2, start) infinite;
}
@keyframes ai-caret {
  to {
    visibility: hidden;
  }
}
</style>
