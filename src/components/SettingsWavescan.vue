<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm opacity-70 max-w-xl">
      Import the file exported by Wavescan, the desktop app that scans your
      data straight from the game. Echoes are supported for now, including
      who has them equipped. Characters and weapons will follow.
    </p>

    <div class="bg-base-200 rounded-xl p-4 flex flex-col gap-3">
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">
        Wavescan data
      </div>
      <p class="text-sm opacity-70">Upload the exported file…</p>
      <input
        type="file"
        accept=".json,application/json"
        class="file-input file-input-bordered file-input-sm max-w-sm"
        @change="handleFileChange"
        data-test-wavescan-file-input />
      <p class="text-sm opacity-70">…or paste what Wavescan copied.</p>
      <textarea
        v-model="pastedText"
        class="textarea textarea-bordered text-xs font-mono max-w-xl"
        rows="4"
        placeholder='{ "format": "WutheringToolsScan", ... }'
        data-test-wavescan-paste></textarea>
      <button
        class="btn btn-sm btn-primary self-start"
        :disabled="!pastedText.trim()"
        @click="handlePaste"
        data-test-wavescan-paste-button>
        Read pasted data
      </button>
      <p v-if="parseError" class="text-sm text-error" data-test-wavescan-error>
        {{ parseError }}
      </p>
      <p v-else-if="meta" class="text-xs opacity-60" data-test-wavescan-meta>
        <template v-if="scannedAtLabel">Scanned {{ scannedAtLabel }}</template>
        <template v-if="meta.scannerVersion">
          · Wavescan v{{ meta.scannerVersion }}
        </template>
      </p>
    </div>

    <div
      v-if="mapped"
      class="bg-base-200 rounded-xl p-4 flex flex-col gap-3"
      data-test-wavescan-echoes>
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">
        Echoes
      </div>
      <p class="text-sm">
        <span class="font-bold">{{ mapped.echoes.length }}</span>
        {{ mapped.echoes.length === 1 ? "echo" : "echoes" }} ready to import.
        <span v-if="mapped.skipped.length" class="text-warning">
          {{ mapped.skipped.length }} couldn't be read and will be skipped.
        </span>
      </p>

      <details
        v-if="mapped.skipped.length"
        class="text-sm"
        data-test-wavescan-skipped>
        <summary class="cursor-pointer opacity-70">Show skipped echoes</summary>
        <ul class="mt-2 flex flex-col gap-1 opacity-80">
          <li v-for="skip in mapped.skipped" :key="skip.position">
            #{{ skip.position }}<template v-if="skip.echo"> ({{ skip.echo }})</template>:
            {{ skip.reason }}
          </li>
        </ul>
      </details>

      <div class="flex flex-col gap-2" role="radiogroup" aria-label="Import mode">
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            v-model="mode"
            type="radio"
            value="append"
            class="radio radio-primary radio-sm mt-0.5"
            data-test-wavescan-mode-append />
          <span class="flex flex-col">
            <span class="font-bold text-sm">Add to my inventory</span>
            <span class="text-xs opacity-70">
              Keeps your current echoes. Echoes you already have are skipped.
            </span>
          </span>
        </label>
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            v-model="mode"
            type="radio"
            value="replace"
            class="radio radio-error radio-sm mt-0.5"
            data-test-wavescan-mode-replace />
          <span class="flex flex-col">
            <span class="font-bold text-sm">Replace my inventory</span>
            <span class="text-xs opacity-70">
              Removes every unlocked echo from your inventory, then adds the
              scanned ones. Locked echoes are kept.
            </span>
          </span>
        </label>
      </div>

      <div
        v-if="loadoutCards.length || unmatchedText"
        class="flex flex-col gap-3 pt-2"
        data-test-wavescan-loadouts>
        <div class="flex flex-col gap-1">
          <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">
            Equipped echoes
          </div>
          <p class="text-sm opacity-70 max-w-2xl">
            Wavescan saw these echoes equipped in game. Check the slot order:
            <strong class="text-warning">slot 1 is the main echo</strong>,
            which sets the Echo Skill and main echo buffs. They're sorted by
            cost, highest first. Drag the handle or use the arrows to reorder.
          </p>
        </div>

        <div
          v-if="loadoutCards.length"
          class="flex flex-col gap-2"
          role="radiogroup"
          aria-label="Where to save loadouts">
          <span class="text-sm font-semibold">Save loadouts to</span>
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="buildTarget"
              type="radio"
              value="active"
              class="radio radio-primary radio-sm mt-0.5"
              data-test-wavescan-build-active />
            <span class="flex flex-col">
              <span class="font-bold text-sm">Each character's active build</span>
              <span class="text-xs opacity-70">
                Replaces the echoes on the build that's selected now. Weapon,
                buffs and rotations stay as they are.
              </span>
            </span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="buildTarget"
              type="radio"
              value="new"
              class="radio radio-primary radio-sm mt-0.5"
              data-test-wavescan-build-new />
            <span class="flex flex-col">
              <span class="font-bold text-sm">A new build, “{{ newBuildBaseName }}”</span>
              <span class="text-xs opacity-70">
                Copies the active build, swaps in the scanned echoes, and makes
                it active. Your current builds stay as they are.
              </span>
            </span>
          </label>
        </div>

        <div
          v-if="replaceLossesText"
          role="note"
          class="alert alert-warning text-sm"
          data-test-wavescan-replace-losses>
          <span>
            <strong>Replace removes every unlocked echo in your inventory</strong>,
            including ones equipped on characters you aren't equipping here.
            {{ replaceLossesText }} Locked echoes are kept. To keep everything,
            use Add instead.
          </span>
        </div>

        <p v-if="unmatchedText" class="text-sm text-warning" data-test-wavescan-unmatched>
          Couldn't match a character for {{ unmatchedText }}. Those echoes are
          imported but not equipped.
        </p>

        <SettingsWavescanLoadout
          v-for="card in loadoutCards"
          :key="card.wearer"
          :title="card.title"
          :portrait="card.portrait"
          :is-new="card.isNew"
          :tiles="card.tiles"
          :included="card.included"
          :toggle-label="mode === 'append' ? 'Use the scanned loadout' : 'Equip on import'"
          :toggle-disabled="card.toggleDisabled"
          :current="card.current"
          :rover-options="card.roverOptions"
          :rover-value="card.roverValue"
          :notes="card.notes"
          @reorder="(from, to) => reorderLoadout(card.wearer, from, to)"
          @update:included="(value) => setLoadoutIncluded(card.wearer, value)"
          @update:rover="(value) => setLoadoutRover(card.wearer, value)" />
      </div>

      <p v-if="importBlockedReason" class="text-sm text-error" data-test-wavescan-blocked>
        {{ importBlockedReason }}
      </p>
      <button
        class="btn btn-sm self-start"
        :class="mode === 'replace' ? 'btn-error' : 'btn-primary'"
        :disabled="
          isImporting ||
          Boolean(importBlockedReason) ||
          (!mapped.echoes.length && mode === 'append')
        "
        @click="handleImportEchoes"
        data-test-wavescan-import-echoes>
        {{ mode === "replace" ? "Replace echoes" : "Import echoes" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Import of a Wavescan export, uploaded as a file or pasted as text. Parsing,
 * validation and the append/replace plan live in src/wavescan/ (pure);
 * this panel only reads the file, asks how to apply it, and applies it.
 * See docs/wavescan-import.md and ADR 0038.
 */
import { computed, ref } from "vue";
import SettingsWavescanLoadout from "./SettingsWavescanLoadout.vue";
import { useInventoryStore } from "../stores/inventory";
import { useConfirm } from "../composables/useConfirm";
import { useEchoInventory } from "../composables/useEchoInventory";
import { useToast } from "../composables/useToast";
import { pluralEchoes, useWavescanLoadouts } from "../composables/useWavescanLoadouts";
import { parseWavescanFile, type WavescanMeta } from "../wavescan/format";
import {
  mapWavescanEchoes,
  type WavescanEchoMapResult,
  type WavescanImportMode,
} from "../wavescan/echoes";

const inventoryStore = useInventoryStore();
const { confirm } = useConfirm();
const { removeEchoesFully } = useEchoInventory();
const { showToast } = useToast();

const parseError = ref<string | null>(null);
const meta = ref<WavescanMeta | null>(null);
const mapped = ref<WavescanEchoMapResult | null>(null);
const mode = ref<WavescanImportMode>("append");
const isImporting = ref(false);
const pastedText = ref("");

const {
  buildTarget,
  importPlan,
  loadoutCards,
  importBlockedReason,
  unmatchedText,
  replaceLossesText,
  newBuildBaseName,
  initLoadouts,
  reorderLoadout,
  setLoadoutIncluded,
  setLoadoutRover,
  snapshotLoadoutWrites,
  applyLoadoutWrites,
} = useWavescanLoadouts({ mapped, meta, mode });

const scannedAtLabel = computed(() => {
  const scannedAt = meta.value?.scannedAt;
  if (!scannedAt) return null;
  const date = new Date(scannedAt);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
});

function reset() {
  parseError.value = null;
  meta.value = null;
  mapped.value = null;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function handleFileChange(event: Event) {
  reset();
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  let raw: string;
  try {
    raw = await readFileAsText(file);
  } catch {
    parseError.value = "Couldn't read that file.";
    return;
  }
  loadRaw(raw);
}

function handlePaste() {
  reset();
  loadRaw(pastedText.value);
}

function loadRaw(raw: string) {
  const result = parseWavescanFile(raw);
  if (!result.ok) {
    parseError.value = result.error;
    return;
  }
  meta.value = result.file.meta ?? {};
  mapped.value = mapWavescanEchoes(
    result.file.echoes ?? [],
    inventoryStore.echoes.map((echo: { echoId: string }) => echo.echoId),
  );
  initLoadouts();
}

function pluralCharacters(count: number) {
  return `${count} ${count === 1 ? "character" : "characters"}`;
}

async function handleImportEchoes() {
  if (!mapped.value || isImporting.value) return;

  const plan = importPlan.value;
  if (!plan || importBlockedReason.value) return;
  const writes = snapshotLoadoutWrites();

  if (mode.value === "replace") {
    const items = [
      `Remove ${pluralEchoes(plan.toRemoveIds.length)} from your inventory`,
      `Add ${pluralEchoes(plan.toAdd.length)} from Wavescan`,
    ];
    if (plan.keptLockedCount) {
      items.push(`Keep ${pluralEchoes(plan.keptLockedCount)} you've locked`);
    }
    if (writes.length) {
      items.push(`Equip ${pluralCharacters(writes.length)} as scanned`);
    }
    const confirmed = await confirm(
      "This can't be undone. Back up your data first if you might want your current inventory back.",
      {
        title: "Replace your echo inventory?",
        items,
        confirmLabel: "Replace echoes",
        variant: "error",
      },
    );
    if (!confirmed) return;
  }

  isImporting.value = true;
  try {
    if (plan.toRemoveIds.length) {
      await removeEchoesFully(plan.toRemoveIds);
    }
    for (const echo of plan.toAdd) {
      await inventoryStore.saveEcho(echo);
    }
    applyLoadoutWrites(writes);
    const parts = [`Imported ${pluralEchoes(plan.toAdd.length)}`];
    if (plan.alreadyOwnedCount) {
      parts.push(`${plan.alreadyOwnedCount} already in your inventory`);
    }
    if (plan.toRemoveIds.length) {
      parts.push(`${plan.toRemoveIds.length} removed`);
    }
    if (writes.length) {
      parts.push(`equipped ${pluralCharacters(writes.length)}`);
    }
    showToast(`${parts.join(", ")}.`, "success");
  } catch (e) {
    showToast(`Failed to import echoes: ${e}`, "error");
  } finally {
    isImporting.value = false;
  }
}
</script>
