<template>
  <div class="rotation__quick-add mt-2" data-test-rotation-quick-add>
    <div class="text-xs font-semibold opacity-70 mb-1">Add one action</div>
    <div class="rotation__quick-add__row relative">
      <input
        ref="inputEl"
        v-model="queryValue"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="inputGroups.length > 0"
        :aria-controls="`${inputId}-listbox`"
        :aria-activedescendant="inputActiveDescendant"
        class="input input-bordered input-sm w-full"
        placeholder="Type an action name or kind (intro, skill, lib…), Enter to add"
        autocomplete="off"
        data-test-rotation-quick-add-input
        @focus="inputOpen = true"
        @click="inputOpen = true"
        @input="inputOpen = true"
        @blur="inputOpen = false"
        @keydown="onInputKeydown" />
      <ActionSuggestList
        v-if="inputGroups.length"
        :groups="inputGroups"
        :active-index="inputNav.activeIndex.value"
        :id-prefix="inputId"
        :count-suffix="inputParsed.count"
        data-test-rotation-quick-add-suggestions
        @choose="chooseSuggestion" />
    </div>

    <div class="divider my-1 text-xs opacity-50" data-test-rotation-quick-add-divider>or</div>
    <button
      type="button"
      class="btn btn-sm btn-neutral w-full"
      data-test-rotation-quick-add-paste-toggle
      @click="showPaste = !showPaste">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="size-4 fill-current" aria-hidden="true">
        <path
          d="M448 96L439.4 96C428.4 76.9 407.7 64 384 64L256 64C232.3 64 211.6 76.9 200.6 96L192 96C156.7 96 128 124.7 128 160L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 160C512 124.7 483.3 96 448 96zM264 176C250.7 176 240 165.3 240 152C240 138.7 250.7 128 264 128L376 128C389.3 128 400 138.7 400 152C400 165.3 389.3 176 376 176L264 176z" />
      </svg>
      {{ showPaste ? "Hide paste panel" : "Paste a whole rotation" }}
    </button>

    <div v-if="showPaste" class="rotation__quick-add__paste mt-3 flex flex-col gap-2" data-test-rotation-quick-add-paste>
      <label :for="`${pasteId}-textarea`" class="text-xs opacity-70">
        One action name per line — a trailing "x2"/"×2" sets that line's hit count. Suggestions appear as you type;
        ↑↓ to pick, Enter or Tab to fill the line.
      </label>
      <div class="relative">
        <textarea
          :id="`${pasteId}-textarea`"
          ref="pasteEl"
          v-model="pasteText"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="pasteGroups.length > 0"
          :aria-controls="`${pasteId}-listbox`"
          :aria-activedescendant="pasteActiveDescendant"
          class="textarea textarea-bordered textarea-sm w-full"
          rows="4"
          placeholder="Intro&#10;Skill&#10;Heavy Attack x2"
          data-test-rotation-quick-add-textarea
          @input="onPasteInput"
          @click="updatePasteLine"
          @keyup="onPasteKeyup"
          @keydown="onPasteKeydown"
          @blur="pasteOpen = false"></textarea>
        <ActionSuggestList
          v-if="pasteGroups.length"
          :groups="pasteGroups"
          :active-index="pasteNav.activeIndex.value"
          :id-prefix="pasteId"
          :count-suffix="pasteParsed.count"
          data-test-rotation-quick-add-paste-suggestions
          @choose="choosePasteSuggestion" />
      </div>
      <div v-if="pasteResults.length" class="flex flex-col gap-1">
        <!-- Phones stack the result under the line ("↳") so long attack names
             wrap instead of pushing the rotation card past the viewport. -->
        <div
          v-for="(line, i) in pasteResults"
          :key="i"
          class="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:gap-2"
          :data-test-rotation-quick-add-paste-line="i">
          <div class="flex items-center gap-2 min-w-0 sm:flex-1">
            <span
              class="badge badge-xs shrink-0"
              :class="{
                'badge-success': line.status === 'matched',
                'badge-warning': line.status === 'ambiguous',
                'badge-ghost': line.status === 'unmatched',
              }"></span>
            <span class="min-w-0 truncate" :title="line.raw">{{ line.raw }}</span>
          </div>
          <div class="flex items-center gap-1 min-w-0 pl-4 sm:pl-0 sm:max-w-[60%]">
            <span class="opacity-50 text-xs shrink-0" aria-hidden="true">
              <span class="sm:hidden">↳</span><span class="hidden sm:inline">→</span>
            </span>
            <span
              v-if="line.status === 'matched'"
              class="opacity-70 text-xs min-w-0 break-words sm:truncate"
              :title="line.candidates[0].label"
              data-test-rotation-quick-add-paste-match>
              {{ line.candidates[0].label }}
            </span>
            <select
              v-else-if="line.status === 'ambiguous'"
              v-model="resolvedByLine[i]"
              class="select select-bordered select-xs w-full min-w-0 sm:w-auto sm:max-w-xs"
              :data-test-rotation-quick-add-paste-pick="i">
              <option :value="null" disabled>Pick one…</option>
              <optgroup
                v-for="bucket in groupCandidates(line.candidates)"
                :key="bucket.group ?? ''"
                :label="formatActionGroup(bucket.group) || 'Other'">
                <option v-for="c in bucket.items" :key="c.key" :value="c.key">{{ c.label }}</option>
              </optgroup>
            </select>
            <select
              v-else
              v-model="resolvedByLine[i]"
              class="select select-bordered select-xs w-full min-w-0 sm:w-auto sm:max-w-xs"
              :data-test-rotation-quick-add-paste-unmatched-pick="i">
              <option :value="null">No match — skip</option>
              <optgroup
                v-for="bucket in allActionGroups"
                :key="bucket.group ?? ''"
                :label="formatActionGroup(bucket.group) || 'Other'">
                <option v-for="c in bucket.items" :key="c.key" :value="c.key">{{ c.label }}</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="btn btn-primary btn-sm self-start"
        :disabled="!canAddPasted"
        data-test-rotation-quick-add-submit
        @click="addPasted">
        Add {{ pastedMatchedCount }} action{{ pastedMatchedCount === 1 ? "" : "s" }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
let instanceCounter = 0;
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import ActionSuggestList from "./ActionSuggestList.vue";
import { useSuggestNavigation } from "../composables/useSuggestNavigation";
import {
  formatActionGroup,
  groupCandidates,
  matchActionLines,
  normalize,
  parseActionLine,
  rankActionMatches,
  type CandidateGroup,
  type LineMatchResult,
  type MatchableAction,
  type MatchCandidate,
} from "../utils/actionTextMatch";

const props = defineProps<{
  actions: MatchableAction[];
}>();

const emit = defineEmits<{
  "add-actions": [payload: Array<{ key: string; type: string; count: number }>];
}>();

/** Suggestions scoring below this are noise, not worth showing. */
const SUGGESTION_SCORE_FLOOR = 0.3;
const SUGGESTION_LIMITS = { perGroup: 4, total: 12 };

const instanceId = ++instanceCounter;
const inputId = `rotation-quick-add-${instanceId}`;
const pasteId = `rotation-quick-add-paste-${instanceId}`;

function flatten(groups: CandidateGroup[]): MatchCandidate[] {
  return groups.flatMap((bucket) => bucket.items);
}

function suggestionGroups(text: string): CandidateGroup[] {
  return groupCandidates(
    rankActionMatches(text, props.actions).filter((c) => c.score > SUGGESTION_SCORE_FLOOR),
    SUGGESTION_LIMITS,
  );
}

/** Every attack, bucketed in game order — for browsing and the unmatched-line picker. */
const allActionGroups = computed<CandidateGroup[]>(() => groupCandidates(rankActionMatches("", props.actions)));

// ── "Add one action" input ──────────────────────────────────────────────

const inputEl = ref<HTMLInputElement | null>(null);
const queryValue = ref("");
const inputOpen = ref(false);

const inputParsed = computed(() => parseActionLine(queryValue.value));

const inputGroups = computed<CandidateGroup[]>(() => {
  if (!inputOpen.value) return [];
  // Empty query: browse every attack, so names can be found without typing.
  if (!inputParsed.value.text) return allActionGroups.value;
  return suggestionGroups(inputParsed.value.text);
});

const inputFlat = computed(() => flatten(inputGroups.value));

// Browsing starts with nothing highlighted so a stray Enter doesn't add the first attack.
const inputNav = useSuggestNavigation(inputFlat, {
  initialIndex: () => (inputParsed.value.text ? 0 : -1),
});

const inputActiveDescendant = computed(() =>
  inputFlat.value.length && inputNav.activeIndex.value >= 0 ? `${inputId}-opt-${inputNav.activeIndex.value}` : undefined,
);

function chooseSuggestion(candidate: MatchCandidate) {
  emit("add-actions", [{ key: candidate.key, type: candidate.group ?? "basic", count: inputParsed.value.count }]);
  queryValue.value = "";
  // Stay focused but closed, so the next action can be typed straight away.
  inputOpen.value = false;
  inputEl.value?.focus();
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    queryValue.value = "";
    inputOpen.value = false;
    return;
  }
  if (event.key === "Tab") {
    inputOpen.value = false;
    return;
  }
  if (!inputOpen.value && event.key === "ArrowDown") {
    event.preventDefault();
    inputOpen.value = true;
    return;
  }
  if (!inputNav.onKeydown(event, chooseSuggestion) && event.key === "Enter") {
    event.preventDefault();
  }
}

// ── Paste panel ─────────────────────────────────────────────────────────

const showPaste = ref(false);
const pasteText = ref("");
const resolvedByLine = ref<Record<number, string | null>>({});

const pasteEl = ref<HTMLTextAreaElement | null>(null);
const pasteOpen = ref(false);
/** The line the caret is on: [start, end) offsets into the textarea value. */
const pasteLine = ref({ start: 0, end: 0, text: "" });

function updatePasteLine() {
  const el = pasteEl.value;
  if (!el) return;
  const value = el.value;
  const caret = el.selectionStart ?? value.length;
  const start = value.lastIndexOf("\n", caret - 1) + 1;
  const newlineAt = value.indexOf("\n", caret);
  const end = newlineAt === -1 ? value.length : newlineAt;
  pasteLine.value = { start, end, text: value.slice(start, end) };
}

const pasteParsed = computed(() => parseActionLine(pasteLine.value.text));

const pasteGroups = computed<CandidateGroup[]>(() => {
  if (!pasteOpen.value || !pasteParsed.value.text) return [];
  const ranked = rankActionMatches(pasteParsed.value.text, props.actions);
  // Already an exact match — let Enter insert a newline as usual.
  if (!ranked.length || ranked[0].score >= 1) return [];
  return suggestionGroups(pasteParsed.value.text);
});

const pasteFlat = computed(() => flatten(pasteGroups.value));
const pasteNav = useSuggestNavigation(pasteFlat, { acceptTab: true });

const pasteActiveDescendant = computed(() =>
  pasteFlat.value.length && pasteNav.activeIndex.value >= 0 ? `${pasteId}-opt-${pasteNav.activeIndex.value}` : undefined,
);

/** Labels shared by more than one attack (e.g. a skill and forte circuit hit with the same name). */
const duplicateLabels = computed(() => {
  const counts = new Map<string, number>();
  for (const action of props.actions) {
    const key = normalize(action.label);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([key]) => key));
});

function onPasteInput() {
  pasteOpen.value = true;
  updatePasteLine();
}

function onPasteKeyup(event: KeyboardEvent) {
  // ↑/↓ drive the suggestion highlight while the list is open, not the caret.
  if ((event.key === "ArrowUp" || event.key === "ArrowDown") && pasteFlat.value.length) return;
  updatePasteLine();
}

function onPasteKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && pasteFlat.value.length) {
    event.preventDefault();
    pasteOpen.value = false;
    return;
  }
  pasteNav.onKeydown(event, choosePasteSuggestion);
}

async function choosePasteSuggestion(candidate: MatchCandidate) {
  const el = pasteEl.value;
  const value = el?.value ?? pasteText.value;
  const { start, end } = pasteLine.value;
  const count = pasteParsed.value.count;

  // A label shared across types gets a "<Type>: " prefix so the line resolves
  // to exactly this attack instead of coming back ambiguous.
  const label = duplicateLabels.value.has(normalize(candidate.label))
    ? `${formatActionGroup(candidate.group)}: ${candidate.label}`
    : candidate.label;
  const newLine = label + (count > 1 ? ` x${count}` : "");
  const after = value.slice(end);

  pasteText.value = value.slice(0, start) + newLine + (after.startsWith("\n") ? after : "\n" + after);
  pasteOpen.value = false;

  const caret = start + newLine.length + 1;
  await nextTick();
  el?.focus();
  el?.setSelectionRange(caret, caret);
  updatePasteLine();
}

const pasteResults = computed<LineMatchResult[]>(() => matchActionLines(pasteText.value, props.actions));

// Seed every pickable line with null (not undefined) so its <select> shows
// its placeholder option ("Pick one…" / "No match — skip") instead of blank.
watch(pasteResults, (lines) => {
  const next: Record<number, string | null> = {};
  lines.forEach((line, i) => {
    if (line.status !== "matched") next[i] = null;
  });
  resolvedByLine.value = next;
});

type ResolvedEntry = { key: string; group?: string; count: number };

const pastedResolvedEntries = computed<ResolvedEntry[]>(() => {
  const entries: ResolvedEntry[] = [];
  pasteResults.value.forEach((line, i) => {
    if (line.status === "matched") {
      entries.push({ key: line.candidates[0].key, group: line.candidates[0].group, count: line.count });
      return;
    }
    const chosenKey = resolvedByLine.value[i];
    if (!chosenKey) return;
    const pool: Array<{ key: string; group?: string }> =
      line.status === "ambiguous" ? line.candidates : props.actions;
    const chosen = pool.find((c) => c.key === chosenKey);
    if (chosen) {
      entries.push({ key: chosen.key, group: chosen.group, count: line.count });
    }
  });
  return entries;
});

const pastedMatchedCount = computed(() => pastedResolvedEntries.value.length);

// Unmatched lines default to "skip" and never block; only unresolved ambiguous ones do.
const ambiguousUnresolvedCount = computed(
  () =>
    pasteResults.value.filter((line, i) => line.status === "ambiguous" && !resolvedByLine.value[i]).length,
);

const canAddPasted = computed(
  () => pastedMatchedCount.value > 0 && ambiguousUnresolvedCount.value === 0,
);

function addPasted() {
  if (!canAddPasted.value) return;
  emit(
    "add-actions",
    pastedResolvedEntries.value.map((entry) => ({ key: entry.key, type: entry.group ?? "basic", count: entry.count })),
  );
  pasteText.value = "";
  resolvedByLine.value = {};
  showPaste.value = false;
}
</script>
