<template>
  <div class="echo-scanner">
    <template v-if="status === 'idle' || status === 'error'">
      <h2 class="text-xl font-bold">Scan echoes from the game</h2>
      <p class="mb-2">
        Share your WuWa window (Backpack → Echoes) and click through your
        echoes one at a time, or upload a video you already recorded doing
        that. Everything is processed in your browser — nothing is uploaded
        anywhere.
      </p>
      <ul class="list-disc list-inside ml-4 mb-4 text-sm opacity-80">
        <li>Desktop Chrome or Edge only. English game client only.</li>
        <li>
          Nothing saves automatically — you'll review every echo before
          anything is added to your inventory.
        </li>
        <li>Low-confidence fields are flagged so you can fix them by hand.</li>
      </ul>
      <div v-if="errorMessage" class="alert alert-error mb-4 text-sm">
        {{ errorMessage }}
      </div>
      <div class="flex flex-wrap gap-3 items-center">
        <button class="btn btn-primary" @click="handleStartLive">
          Share screen (live)
        </button>
        <button class="btn btn-secondary" @click="triggerFileSelect">
          Upload a video
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="video/*"
          class="hidden"
          @change="handleFileChange" />
      </div>
    </template>

    <template v-else-if="status === 'starting' || status === 'running'">
      <div class="flex flex-col items-center gap-3">
        <div
          ref="previewContainer"
          class="w-full max-w-md aspect-[8/5] bg-base-300 rounded overflow-hidden"></div>
        <div v-if="unsupportedAspect" class="alert alert-warning text-sm">
          This capture's aspect ratio doesn't look like WuWa's Echo
          Management screen (16:10). Results may be unreliable — make sure
          you're sharing the full game window.
        </div>
        <div class="stats shadow">
          <div class="stat place-items-center py-2 px-4">
            <div class="stat-title text-xs">Scanned</div>
            <div class="stat-value text-lg">{{ candidates.length }}</div>
          </div>
          <div class="stat place-items-center py-2 px-4">
            <div class="stat-title text-xs">Duplicates</div>
            <div class="stat-value text-lg">{{ duplicateCount }}</div>
          </div>
          <div class="stat place-items-center py-2 px-4">
            <div class="stat-title text-xs">Needs review</div>
            <div class="stat-value text-lg">{{ reviewNeededCount }}</div>
          </div>
          <div class="stat place-items-center py-2 px-4">
            <div class="stat-title text-xs">Skipped</div>
            <div class="stat-value text-lg">{{ skippedCount }}</div>
          </div>
        </div>
        <progress
          v-if="progress.total"
          class="progress progress-primary w-full max-w-md"
          :value="progress.current"
          :max="progress.total"></progress>
        <p v-else class="text-sm opacity-70">
          Click through your echoes in-game — new ones will appear below as
          they're captured.
        </p>
        <button class="btn" @click="scanner.stop()">Stop scanning</button>
      </div>
    </template>

    <template v-else-if="status === 'stopped' || status === 'stopping'">
      <h2 class="text-xl font-bold mb-2">
        {{ candidates.length }} echo{{ candidates.length === 1 ? "" : "es" }}
        captured
      </h2>
      <p v-if="!candidates.length" class="mb-4 opacity-80">
        Nothing was captured. Try again and make sure the Echo detail panel
        (right side of the Echo Management screen) is visible while you
        click through echoes.
      </p>
      <div v-else class="space-y-2 max-h-[50vh] overflow-y-auto mb-4">
        <div
          v-for="candidate in candidates"
          :key="candidate.id"
          class="flex gap-3 items-start p-3 rounded-lg border border-base-300">
          <div
            class="rounded-full border border-solid neutral-content size-12 shrink-0 bg-cover bg-center"
            :style="{ backgroundImage: `url(${getEchoImage(candidate)})` }"></div>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">{{ getEchoName(candidate) }}</span>
              <span
                v-if="candidate.confidence.name === 'low'"
                class="badge badge-sm badge-warning">
                Check name
              </span>
              <span class="badge badge-sm badge-primary">
                {{ candidate.slot.cost ?? "?" }} Cost
              </span>
              <span v-if="candidate.level !== null" class="badge badge-sm">
                +{{ candidate.level }}
              </span>
              <img
                v-if="candidate.slot.set"
                :src="getEchoSetIconByType(candidate.slot.set)"
                class="size-5 rounded-full"
                :alt="getEchoSetLabelByType(candidate.slot.set) ?? ''" />
              <span
                v-else
                class="badge badge-sm badge-warning">
                Check set
              </span>
            </div>
            <div class="mt-1 text-sm flex items-center gap-2">
              <span>
                Main:
                {{ candidate.slot.mainStatLabel || "unknown" }}
              </span>
              <span
                v-if="candidate.confidence.mainStat === 'low'"
                class="badge badge-xs badge-warning">
                low confidence
              </span>
            </div>
            <div class="mt-2 pt-2 border-t border-base-300 text-sm flex flex-wrap gap-x-3 gap-y-1 opacity-90">
              <span
                v-for="(sub, subIndex) in candidate.slot.substats"
                :key="subIndex"
                class="inline-flex items-center gap-1">
                {{ sub.subStat }} {{ sub.subStatValue }}
                <span
                  v-if="candidate.confidence.substats[subIndex] === 'low'"
                  class="badge badge-xs badge-warning">
                  ?
                </span>
              </span>
            </div>
          </div>
          <button
            class="btn btn-xs btn-ghost"
            title="Remove this candidate"
            @click="scanner.removeCandidate(candidate.id)">
            ✕
          </button>
        </div>
      </div>
      <div
        v-if="!inventoryOnly"
        class="flex gap-2 items-center justify-center">
        <div class="form-control mb-2" @click.stop>
          <label class="label inline-flex justify-start">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              v-model="isSavingToInventory" />
            <span class="label-text ml-2 font-bold">Save to Inventory?</span>
          </label>
        </div>
      </div>
      <div class="flex gap-2 justify-end">
        <button class="btn" @click="handleRetry">Scan again</button>
        <button
          class="btn btn-primary"
          :disabled="!candidates.length"
          @click="handleContinue">
          Continue
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useEchoScanner } from "../composables/useEchoScanner";
import { getEchoData } from "../echoes/index";
import { getEchoSetIconByType, getEchoSetLabelByType } from "../echoes/stats";
import type { ScanCandidate } from "../scanner/types";

const DEFAULT_ECHO_IMAGE =
  "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/monsters.png";

const props = withDefaults(defineProps<{ inventoryOnly?: boolean }>(), {
  inventoryOnly: false,
});

const emit = defineEmits<{
  "echoes-parsed": [echoes: ScanCandidate["slot"][], saveToInventory: boolean];
}>();

const scanner = useEchoScanner();
const {
  status,
  errorMessage,
  candidates,
  duplicateCount,
  skippedCount,
  reviewNeededCount,
  progress,
  unsupportedAspect,
  previewVideoEl,
} = scanner;

const fileInput = ref<HTMLInputElement | null>(null);
const previewContainer = ref<HTMLDivElement | null>(null);
const isSavingToInventory = ref(props.inventoryOnly);

watch(previewVideoEl, (videoEl) => {
  if (!previewContainer.value) return;
  previewContainer.value.replaceChildren();
  if (videoEl) {
    videoEl.style.width = "100%";
    videoEl.style.height = "100%";
    videoEl.style.objectFit = "contain";
    previewContainer.value.appendChild(videoEl);
  }
});

function getEchoName(candidate: ScanCandidate): string {
  if (!candidate.slot.echo) return "Unknown echo — needs review";
  return getEchoData(candidate.slot.echo)?.name ?? candidate.slot.echo;
}

function getEchoImage(candidate: ScanCandidate): string {
  if (!candidate.slot.echo) return DEFAULT_ECHO_IMAGE;
  return getEchoData(candidate.slot.echo)?.image ?? DEFAULT_ECHO_IMAGE;
}

function triggerFileSelect() {
  fileInput.value?.click();
}

async function handleStartLive() {
  await scanner.startLive();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    void scanner.startVideoFile(file);
  }
  input.value = "";
}

function handleRetry() {
  status.value = "idle";
}

function handleContinue() {
  const slots = candidates.value.map((c) => c.slot);
  emit("echoes-parsed", slots, props.inventoryOnly || isSavingToInventory.value);
}
</script>
