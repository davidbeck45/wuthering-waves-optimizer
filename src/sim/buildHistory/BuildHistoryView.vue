<template>
  <Nav cur-page="build-history" :disable-mobile-nav="true"></Nav>
  <div class="bh" data-test-build-history>
    <header class="bh-head">
      <h1 class="bh-h1">Build history</h1>
      <p class="bh-intro bh-intro--long">
        Earlier versions of a character's build, kept in this browser: what it was, what changed, and a way back. A version is
        saved when you tap <b>Save this version</b>, and on its own just before Build my team, a restore or a Settings import
        changes a build.
      </p>
      <p class="bh-intro bh-intro--short">Earlier versions of each build, kept in this browser: what changed, and a way back. Saved when you tap Save, and on its own before Build my team, a restore or an import.</p>
    </header>

    <div v-if="!options.length" class="bh-card bh-empty" data-test-build-history-empty>
      <p class="font-semibold">No builds yet</p>
      <p class="bh-muted">Set a character up in the calculator (a weapon or an echo), or import your data in Settings, and their builds show here.</p>
      <RouterLink to="/" class="btn btn-primary btn-sm mt-3">Open the calculator</RouterLink>
    </div>

    <template v-else>
      <label class="bh-pick">
        <span class="bh-pick__label">Character</span>
        <select v-model="selected" class="select select-bordered select-sm bh-pick__select" data-test-build-history-character>
          <option v-for="o in options" :key="o.id" :value="o.id">{{ o.name }}{{ o.versions ? ` · ${o.versions} version${o.versions === 1 ? "" : "s"}` : "" }}</option>
        </select>
      </label>

      <!-- the build as it is now -->
      <section v-if="selected" class="bh-card bh-now" data-test-build-history-now>
        <div class="bh-now__who">
          <CharacterAvatar :id="selected" :size="52" dot />
          <div class="min-w-0">
            <div class="bh-now__name">{{ characterDisplayName(selected) }}</div>
            <div class="bh-muted">Wearing now: “{{ now?.buildName ?? "no build" }}”</div>
            <div v-if="now" class="bh-now__gear" data-test-build-history-now-gear>{{ gearSummary(selected, now.payload.members[0]) }}</div>
          </div>
        </div>
        <div class="bh-now__dmg">
          <span class="bh-label">Damage now</span>
          <span class="bh-big" data-test-build-history-now-damage>{{ nowDamage ? compact(nowDamage.avgDamage) : rotationBusy ? "…" : "—" }}</span>
          <span class="bh-muted">{{ nowDamage?.dps ? `average per rotation · ${compact(nowDamage.dps)} DPS` : "average per rotation" }}</span>
          <span v-if="rotation" class="bh-rot">
            on <PresetNameLabel :name="rotation.name" :source="rotationSource" :owned="ownedKeys" :max-chips="2" />
          </span>
          <span v-else-if="!rotationBusy" class="bh-muted">No rotation scores on this build (it needs a weapon).</span>
        </div>
        <div class="bh-now__actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!now" data-test-build-history-save @click="onSave">Save this version</button>
          <span class="bh-muted bh-now__status" role="status" aria-live="polite" data-test-build-history-save-status>{{ saveStatus }}</span>
        </div>
      </section>

      <!-- versions -->
      <section v-if="selected" class="bh-list" data-test-build-history-list>
        <h2 class="bh-h2">Versions <span class="bh-count">{{ versions.length }} of {{ MAX_PER_CHARACTER }} kept</span></h2>
        <p v-if="!versions.length" class="bh-card bh-muted" data-test-build-history-none>
          No versions of {{ characterShortName(selected) }}'s build yet. Tap <b>Save this version</b> to keep the build as it is now; the
          oldest of {{ MAX_PER_CHARACTER }} drops off when a new one comes.
        </p>
        <ol v-else class="bh-versions">
          <li v-for="v in versions" :key="v.id" class="bh-card bh-ver" :class="{ 'bh-ver--on': compareFrom === v.id || compareTo === v.id }" data-test-build-history-version :data-version-label="v.label">
            <div class="bh-ver__top">
              <span class="bh-ver__tags">
                <span class="bh-ver__when">{{ whenText(v.at) }}</span>
                <span class="bh-chip" :class="`bh-chip--${labelTone(v.label)}`">{{ labelText(v.label) }}</span>
              </span>
              <button type="button" class="btn btn-xs btn-ghost btn-square bh-ver__delete" :aria-label="`Delete the version from ${whenText(v.at)}`" title="Delete this version" data-test-build-history-delete @click="onDelete(v)">
                <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
              </button>
            </div>
            <div class="bh-ver__what">“{{ v.buildName }}” · {{ gearSummary(selected, v.payload.members[0]) }}</div>
            <div class="bh-ver__dmg">
              <template v-if="damageFor(v)">
                <b>{{ compact(damageFor(v)!.avgDamage) }}</b>
                <span class="bh-muted">avg damage per rotation</span>
                <span v-if="nowDamage" class="bh-delta" :class="toneOf(damageFor(v)!.avgDamage, nowDamage.avgDamage)" data-test-build-history-version-change>
                  {{ vsNowText(damageFor(v)!.avgDamage) }}
                </span>
              </template>
              <span v-else-if="damageFor(v) === null" class="bh-muted">no damage figure (no weapon in this version)</span>
              <span v-else class="bh-muted">scoring…</span>
            </div>
            <div class="bh-ver__actions">
              <button type="button" class="btn btn-sm btn-outline" data-test-build-history-compare @click="openCompare(v.id)">Compare with now</button>
              <button type="button" class="btn btn-sm btn-ghost" data-test-build-history-restore @click="onRestore(v)">Restore</button>
            </div>
          </li>
        </ol>
      </section>

      <!-- before any version: what the right-hand column will hold (a desktop's second column stood empty;
           2026-11-02 desktop audit, D14). Phones already read the same in the Versions card, so it shows from 1024 px. -->
      <section v-if="selected && !versions.length" class="bh-card bh-diff bh-diff--empty" data-test-build-history-diff-empty>
        <h2 class="bh-h2">What changed</h2>
        <p class="bh-muted">
          Once a version is kept, pick two here (or one and the build as it is now) to see what changed between them: the
          character-screen stats, each echo and the damage on one rotation for both. Restore puts a version back.
        </p>
      </section>

      <!-- the comparison -->
      <section v-if="selected && versions.length" ref="diffEl" class="bh-card bh-diff" data-test-build-history-diff>
        <h2 class="bh-h2">What changed</h2>
        <p class="bh-muted">Pick two versions. Numbers are this app's engine: character-screen stats (gear and always-on bonuses), and damage on one rotation for both, so the two compare.</p>
        <div class="bh-diff__pick">
          <label class="bh-diff__side">
            <span class="bh-label">From</span>
            <select v-model="compareFrom" class="select select-bordered select-sm" data-test-build-history-from>
              <option :value="null" disabled>Pick a version</option>
              <option v-for="v in versions" :key="v.id" :value="v.id">{{ whenText(v.at) }} · {{ labelText(v.label) }}</option>
            </select>
          </label>
          <label class="bh-diff__side">
            <span class="bh-label">To</span>
            <select v-model="compareTo" class="select select-bordered select-sm" data-test-build-history-to>
              <option :value="NOW_ID">Now</option>
              <option v-for="v in versions" :key="v.id" :value="v.id">{{ whenText(v.at) }} · {{ labelText(v.label) }}</option>
            </select>
          </label>
        </div>
        <BuildHistoryDiff
          v-if="comparison"
          :char-id="selected"
          :comparison="comparison"
          :rotation="rotation"
          :rotation-source="rotationSource"
          :owned="ownedKeys"
          :busy="comparing"
          :from-text="sideText(comparison.from)"
          :from-when="comparison.from.id === NOW_ID ? 'now' : whenText(comparison.from.at)"
          :to-text="sideText(comparison.to)"
          @restore="onRestore(comparison.from)" />
        <p v-else-if="!now && compareTo === NOW_ID" class="bh-muted mt-2" data-test-build-history-no-build-now>
          {{ characterShortName(selected) }} has no weapon or echoes now, so there is nothing to compare with: pick a version under To, or restore one.
        </p>
        <p v-else class="bh-muted mt-2">Pick the version to compare from.</p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /build-history: one character's build versions in this browser (src/sim/buildHistory/). The build
// as it is now with its damage on the best rotation and a Save button, the versions newest first (time, why it was
// saved, the damage on that same rotation and the change against now), a comparison of any two, and Restore with a
// confirm that lists every change. Reached from the /account character drawer, the calculator's build-card strip and
// the plus pages menu / palette.
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { useConfirm } from "../../composables/useConfirm";
import { useToast } from "../../composables/useToast";
import { useCharacterStore } from "../../stores/character";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import PresetNameLabel, { type PresetSource } from "../display/PresetNameLabel.vue";
import { characterDisplayName, characterShortName } from "../display/names";
import { compact } from "../myRankings/format";
import { changeText } from "./diff";
import { charactersWithHistory, historyInMemoryOnly, MAX_PER_CHARACTER, readHistory, type HistoryVersion } from "./history";
import { NOW_ID, useBuildHistory } from "./useBuildHistory";
import { characterOptions, gearSummary, labelText, labelTone, pickCharacter, restoreItems, whenText } from "./view";
import BuildHistoryDiff from "./BuildHistoryDiff.vue";
import "./buildHistory.css";
import { scrollBehavior } from "../a11y/shellA11y"; // smooth unless the system asks for less motion

useDocumentTitle(
  "Build history — Wuthering Waves Calculator & Optimizer",
  "Earlier versions of your Wuthering Waves builds, kept in your browser: what changed in stats, echoes and damage, and a one-tap restore.",
);

const route = useRoute();
const router = useRouter();
const characterStore = useCharacterStore();
const { confirm } = useConfirm();
const { showToast } = useToast();

const selected = ref<string | null>(null);
const listTick = ref(0);
const counts = computed<Record<string, number>>(() => {
  void listTick.value;
  return Object.fromEntries(charactersWithHistory().map((id) => [id, readHistory(id).length]));
});
const options = computed(() => characterOptions(characterStore.characters as Record<string, any>, counts.value));
const ownedKeys = computed(() => Object.keys(characterStore.characters ?? {}));

const h = useBuildHistory(selected);
const { versions, now, rotation, rotationBusy, damageFor, compareFrom, compareTo, comparison, comparing } = h;

const nowDamage = computed(() => damageFor(now.value) ?? null);
const rotationSource = computed<PresetSource | null>(() => {
  const s = rotation.value?.source;
  return s === "yours" || s === "curated" || s === "wuwa_calc" ? s : null;
});
const saveStatus = ref("");
const diffEl = ref<HTMLElement | null>(null);

// the character: ?char=<id>, else the calculator's, else the first with versions
watch(
  [() => route.query.char, options],
  () => {
    const asked = typeof route.query.char === "string" ? route.query.char : null;
    const pick = pickCharacter(asked ?? selected.value, characterStore.activeCharacter as string, options.value);
    if (pick !== selected.value) selected.value = pick;
  },
  { immediate: true },
);
watch(selected, (id) => {
  saveStatus.value = "";
  if (id && route.query.char !== id) void router.replace({ query: { ...route.query, char: id } });
});

function vsNowText(avg: number): string {
  const n = nowDamage.value?.avgDamage;
  const t = changeText(n, avg);
  return t === "same" ? "same as now" : t ? `${t} vs now` : "";
}
const toneOf = (avg: number, nowAvg: number): string => (avg > nowAvg * 1.0005 ? "bh-delta--up" : avg < nowAvg * 0.9995 ? "bh-delta--down" : "bh-delta--flat");
const sideText = (v: HistoryVersion): string => (v.id === NOW_ID ? "Now" : `${whenText(v.at)} (${labelText(v.label)})`);

function onSave(): void {
  const out = h.save();
  listTick.value++;
  if (!out) return;
  if (out.saved) saveStatus.value = out.inMemoryOnly ? "Saved for this visit only: the browser refused to store it." : out.dropped ? `Saved. The oldest version dropped off (${MAX_PER_CHARACTER} are kept).` : "Saved.";
  else if (out.reason === "same-as-latest") saveStatus.value = `Already saved: the newest version (${whenText(out.version!.at)}) is this same build.`;
  else saveStatus.value = "Nothing to save: this character has no weapon or echoes yet.";
}

async function openCompare(id: string): Promise<void> {
  h.compare(id, NOW_ID);
  await nextTick();
  diffEl.value?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

async function onRestore(v: HistoryVersion): Promise<void> {
  const id = selected.value;
  if (!id || v.id === NOW_ID) return;
  const plan = h.planFor(v);
  if (!plan) return;
  const name = characterShortName(id);
  if (plan.identical) {
    showToast(`That version is the same as ${name}'s build now: nothing to restore.`, "info", 5000);
    return;
  }
  const ok = await confirm(`These change on the build ${name} wears now (“${plan.targetBuildName}”):`, {
    title: `Restore ${name}'s build from ${whenText(v.at)}?`,
    items: restoreItems(plan),
    confirmLabel: "Restore",
    variant: "warning",
  });
  if (!ok) return;
  try {
    const out = h.restore(v, id);
    listTick.value++;
    if (!out) return;
    const kept = out.before.saved ? " The build from before is saved as “Before a restore”." : "";
    const added = out.addedEchoes.length ? ` ${out.addedEchoes.length} echo${out.addedEchoes.length === 1 ? " was" : "es were"} added back to the inventory.` : "";
    const memo = historyInMemoryOnly() ? " (History kept for this visit only: the browser refused to store more.)" : "";
    showToast(`Restored ${name}'s build from ${whenText(v.at)}.${kept}${added}${memo}`, "success", 7000);
  } catch (err) {
    showToast(err instanceof Error ? `The restore failed: ${err.message}` : "The restore failed; nothing was changed.", "error", 7000);
  }
}

async function onDelete(v: HistoryVersion): Promise<void> {
  const ok = await confirm("The build itself is not touched; only this saved version goes.", {
    title: `Delete the version from ${whenText(v.at)}?`,
    confirmLabel: "Delete",
    variant: "error",
  });
  if (!ok) return;
  h.remove(v);
  listTick.value++;
}
</script>
