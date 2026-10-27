<template>
  <section class="mt-6 border-t border-base-300 pt-4" data-test-phone-echo-batch>
    <h2 class="text-xl font-bold">Phone screenshots (batch)</h2>
    <p class="text-sm opacity-80 mb-3">
      On your phone, open the in-game Echo inventory, select an echo so its detail panel shows on the
      right, and take one screenshot per echo — then drop them all here (on the phone itself, pick them
      straight from the gallery). Landscape 3120×1440 (Galaxy S26 Ultra) or the same shape. Turn a
      Sonata filter on first so the set name shows bottom-left; otherwise the set is read from the
      small glyph next to +25. Other screenshots (PC, other phones): use Read with Claude below.
    </p>
    <div class="rounded-box border border-base-300 p-3 mb-3" data-test-phone-echo-album>
      <div class="text-sm font-semibold mb-1">From a Google Photos album</div>
      <p class="text-xs opacity-70 mb-2">
        Share the album (anyone with the link) and paste the link here. Photos already imported from this
        album are remembered in this browser, so later runs fetch and scan only the new ones.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="albumUrl"
          type="url"
          placeholder="https://photos.app.goo.gl/…"
          class="input input-bordered input-sm w-80 max-w-full"
          data-test-phone-echo-album-url
          @keyup.enter="loadAlbum" />
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!albumUrl.trim() || isLoadingAlbum || isScanning"
          data-test-phone-echo-album-load
          @click="loadAlbum">
          <span v-if="isLoadingAlbum" class="loading loading-spinner loading-xs"></span>
          Load album
        </button>
        <template v-if="album">
          <span class="text-xs" data-test-phone-echo-album-summary>
            {{ album.photos.length }} photo{{ album.photos.length === 1 ? "" : "s" }} · {{ albumImportedCount }} already imported · {{ albumNewPhotos.length }} new
          </span>
          <label class="label cursor-pointer gap-1 py-0 text-xs">
            <input v-model="includeImported" type="checkbox" class="checkbox checkbox-xs" />
            include already imported
          </label>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!albumPhotosToScan.length || isScanning"
            data-test-phone-echo-album-scan
            @click="scanAlbum">
            Fetch &amp; scan {{ albumPhotosToScan.length }}
          </button>
          <button type="button" class="btn btn-ghost btn-xs" :disabled="isScanning || !albumNewPhotos.length" data-test-phone-echo-album-mark @click="markAlbumImported">
            Mark all as imported
          </button>
          <button type="button" class="btn btn-ghost btn-xs" :disabled="isScanning || !albumImportedCount" @click="forgetAlbum">Forget</button>
        </template>
        <span v-if="albumError" class="text-xs text-error" data-test-phone-echo-album-error>{{ albumError }}</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 mb-3">
      <input
        type="file"
        accept="image/*"
        multiple
        class="file-input file-input-bordered file-input-sm max-w-full"
        data-test-phone-echo-batch-input
        @change="onFilesChosen" />
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="!queuedCount || isScanning || claude.running"
        data-test-phone-echo-batch-scan
        @click="scanAll">
        <span v-if="isScanning" class="loading loading-spinner loading-xs"></span>
        {{ isScanning ? `Scanning ${progress.done} / ${progress.total}…` : `Scan ${queuedCount} screenshot${queuedCount === 1 ? "" : "s"}` }}
      </button>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="!items.length || isScanning || claude.running" @click="clearAll">
        Clear
      </button>
      <span v-if="isScanning" class="text-xs opacity-70" data-test-phone-echo-batch-step>{{ currentStep }}</span>
    </div>

    <!-- Wuthering Tools+ AI: Claude reads what the OCR can't (claudeVision.ts); results land in the table below -->
    <div class="mb-3 rounded-box border border-primary/25 bg-primary/5 p-3" data-test-claude-read>
      <div class="flex items-center gap-3">
        <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="size-4" fill="currentColor"><path :d="SPARKLE" /></svg>
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 class="text-sm font-semibold">Read with Claude</h3>
            <button
              type="button"
              class="badge badge-outline badge-sm h-auto cursor-pointer gap-1 py-0.5 hover:border-primary hover:text-primary"
              title="Model and effort for reading screenshots — AI settings"
              data-test-claude-read-model
              @click="claude.openSettings()">
              {{ claude.modelLabel }}
              <svg viewBox="0 0 20 20" class="size-3 opacity-70" fill="currentColor" aria-hidden="true"><path d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" /></svg>
            </button>
          </div>
        </div>
      </div>
      <p class="mt-1.5 text-xs leading-relaxed opacity-75 sm:pl-11">
        For screenshots the scanner can't read — PC, other phones, no Sonata filter — or to double-check
        flagged rows. Every value is checked against the game's roll tables; anything off is flagged, never
        changed. Screenshots go straight from this browser to Anthropic, with your own key.
      </p>

      <div v-if="!claude.hasKey" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-11">
        <button type="button" class="btn btn-primary btn-sm" data-test-claude-read-key @click="claude.openSettings()">Add your Anthropic key</button>
        <span class="text-xs opacity-70">Bring your own key; it stays in this browser.</span>
      </div>
      <template v-else-if="items.length && (claude.all.length || claude.flagged.length || claude.running)">
        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-11">
          <div class="join rounded-lg border border-base-300" role="radiogroup" aria-label="Screenshots to read">
            <button
              type="button"
              role="radio"
              :aria-checked="claude.scope === 'flagged'"
              class="join-item btn btn-xs"
              :class="claude.scope === 'flagged' ? 'scope--on' : 'btn-ghost'"
              :disabled="claude.running"
              data-test-claude-read-scope="flagged"
              @click="claude.setScope('flagged')">
              Flagged &amp; failed · {{ claude.flagged.length }}
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="claude.scope === 'all'"
              class="join-item btn btn-xs"
              :class="claude.scope === 'all' ? 'scope--on' : 'btn-ghost'"
              :disabled="claude.running"
              data-test-claude-read-scope="all"
              @click="claude.setScope('all')">
              All unread · {{ claude.all.length }}
            </button>
          </div>
          <span
            v-if="claude.targets.length"
            class="text-xs tabular-nums"
            :class="claude.overBudget ? 'text-warning' : 'opacity-75'"
            :title="estimateTitle"
            data-test-claude-read-estimate>
            ≈ {{ formatUsd(claude.estimate.usd) }} for {{ claude.estimate.count }} screenshot{{ claude.estimate.count === 1 ? "" : "s" }}<template v-if="claude.overBudget"> · above your {{ formatUsd(budgetUsd) }} budget</template>
          </span>
          <span v-else class="text-xs opacity-60">Nothing to read in this group.</span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-11">
          <button
            v-if="!claude.running"
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!claude.targets.length || isScanning"
            data-test-claude-read-run
            @click="claude.run()">
            <svg viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true"><path :d="SPARKLE" /></svg>
            Read {{ claude.targets.length }} with Claude
          </button>
          <template v-else>
            <button type="button" class="btn btn-sm btn-outline" data-test-claude-read-stop @click="claude.stop()">Stop</button>
            <progress class="progress progress-primary w-24" :value="claude.progress.done" :max="claude.progress.total || 1"></progress>
            <span class="text-xs tabular-nums" data-test-claude-read-progress>
              Reading {{ Math.min(claude.progress.done + 1, claude.progress.total) }} of {{ claude.progress.total }} · {{ formatUsd(claude.spentUsd) }} so far
            </span>
          </template>
        </div>
      </template>
      <p v-else-if="!items.length" class="mt-2 text-xs opacity-70 sm:pl-11">Add screenshots above, then read them here.</p>
      <p v-if="claude.summary && !claude.running" class="mt-2 text-xs sm:pl-11" data-test-claude-read-summary>
        {{ summaryText }}
      </p>
      <p v-if="claude.runError" class="mt-2 text-xs text-error sm:pl-11" data-test-claude-read-error>{{ claude.runError }}</p>
    </div>

    <div v-if="items.length" class="overflow-x-auto max-h-[50vh]">
      <table class="table table-xs table--cards" data-test-phone-echo-batch-table>
        <thead>
          <tr>
            <th></th>
            <th>Screenshot</th>
            <th>Echo · set</th>
            <th>Cost</th>
            <th>Main stat</th>
            <th>Substats</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in items" :key="item.id">
            <tr
              :class="[rowTone(item), { 'row--noted': hasNotes(item), 'row--pending': !item.record }]"
              :data-test-phone-echo-batch-row="item.status"
              :data-test-claude-row="item.claudeState">
              <td class="cell--check">
                <input v-model="item.include" type="checkbox" class="checkbox checkbox-xs" :disabled="!item.record" :aria-label="`Add ${item.name}`" />
              </td>
              <td class="whitespace-nowrap cell--shot">
                <div class="flex items-center gap-2">
                  <div
                    v-if="item.thumb"
                    class="size-10 rounded bg-cover bg-center shrink-0"
                    :style="{ backgroundImage: `url(${item.thumb})` }"></div>
                  <div class="min-w-0">
                    <div class="max-w-[10rem] truncate text-xs" :title="item.name">{{ item.name }}</div>
                    <div class="flex items-center gap-1 text-[10px]">
                      <span v-if="item.claudeState === 'reading'" class="loading loading-spinner loading-xs text-primary"></span>
                      <span v-else-if="item.source === 'claude'" class="rounded bg-primary/15 px-1 font-semibold leading-4 text-primary" data-test-claude-row-badge>Claude</span>
                      <span class="opacity-60">{{ statusLabel(item) }}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="cell--full cell--echo" data-label="Echo · set">
                <div v-if="item.record" class="flex flex-col gap-1">
                  <select
                    v-model="item.record.echo"
                    class="select select-bordered select-xs w-44 max-w-full lg:w-52"
                    aria-label="Echo"
                    data-test-phone-echo-batch-echo
                    @change="onEchoChanged(item)">
                    <option :value="null">—</option>
                    <option v-for="echo in echoOptions" :key="echo.key" :value="echo.key">{{ echo.name }}</option>
                  </select>
                  <select v-model="item.record.set" class="select select-bordered select-xs w-44 max-w-full lg:w-52" aria-label="Set" data-test-phone-echo-batch-set>
                    <option :value="null">—</option>
                    <option v-for="set in setOptions(item)" :key="set" :value="set">{{ setLabel(set) }}</option>
                  </select>
                </div>
              </td>
              <td class="cell--cost" data-label="Cost">{{ item.record?.cost ?? "" }}</td>
              <td class="cell--full" data-label="Main stat">
                <select
                  v-if="item.record"
                  class="select select-bordered select-xs w-36 max-w-full"
                  aria-label="Main stat"
                  :value="item.record.main?.[0] ?? ''"
                  @change="onMainChanged(item, $event)">
                  <option value="">—</option>
                  <option v-for="key in mainOptions(item)" :key="key" :value="key">{{ statLabel(key) }}</option>
                </select>
              </td>
              <td class="cell--full cell--subs" data-label="Substats">
                <div v-if="item.record" class="flex flex-col gap-1">
                  <div v-for="(sub, index) in item.record.subs" :key="index" class="flex gap-1">
                    <select v-model="sub[0]" class="select select-bordered select-xs w-40 min-w-0 lg:w-52" :aria-label="`Substat ${index + 1}`">
                      <option v-for="key in SUBSTAT_KEYS" :key="key" :value="key">{{ statLabel(key) }}</option>
                    </select>
                    <input v-model="sub[1]" class="input input-bordered input-xs w-16" :aria-label="`Substat ${index + 1} value`" />
                  </div>
                </div>
              </td>
            </tr>
            <!-- the row's notes span the table below it: flags, errors, what Claude said -->
            <tr v-if="hasNotes(item)" class="notes-row" :class="rowTone(item)" data-test-phone-echo-batch-notes>
              <td class="cell--notes-pad"></td>
              <td colspan="5" class="cell--full cell--notes text-xs">
                <div v-if="item.error" class="font-medium text-error">{{ item.error }}</div>
                <ul v-else-if="item.record?.flags.length" class="notes-list" data-test-phone-echo-batch-flags>
                  <li v-for="flag in item.record.flags" :key="flag">{{ flag }}</li>
                </ul>
                <div v-if="item.claude && (item.claude.equippedBy || item.claude.notes)" class="mt-0.5 opacity-70" data-test-claude-row-info>
                  <span class="font-semibold">Claude:</span>
                  <template v-if="item.claude.equippedBy"> worn by {{ item.claude.equippedBy }}</template><template v-if="item.claude.equippedBy && item.claude.notes"> ·</template><template v-if="item.claude.notes"> “{{ item.claude.notes }}”</template>
                </div>
                <div v-if="item.claudeError && item.claudeError !== item.error" class="mt-0.5 text-error" data-test-claude-row-error>Claude: {{ item.claudeError }}</div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="items.length" class="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="!includedCount || isScanning || claude.running"
        data-test-phone-echo-batch-add
        @click="addToInventory">
        Add {{ includedCount }} echo{{ includedCount === 1 ? "" : "es" }} to inventory
      </button>
      <span class="text-xs opacity-70">
        Checked rows are added as they are shown — fix flagged ones here, or later in the inventory.
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+: batch import of echoes from phone screenshots (see phoneEchoScan.ts).
import { computed, reactive, ref } from "vue";
import "../phone-tables.css";
import { mainEchoesData } from "../../echoes/index";
import { echoSetLabelMap, statsTable } from "../../echoes/stats";
import { useAiSettings } from "../ai/aiSettings";
import { formatUsd } from "../ai/pricing";
import { newScanItem, type AlbumPhoto, type ScanItem } from "./batchItems";
import { VISION_OUTPUT_TOKENS, VISION_PROMPT_TOKENS } from "./claudeVisionCost";
import { EchoImageMatcher } from "./imageMatch";
import { EchoOcr, PSM } from "./ocr";
import {
  KEY_TO_LABEL,
  MAIN_STAT_KEYS,
  SUBSTAT_KEYS,
  echoEntry,
  readRegion,
  resolveLayout,
  scanEcho,
  toParsedEcho,
  type BoxReader,
  type ParsedEchoForImporter,
  type RecordHints,
  type Region,
  type ScanInput,
  type ScanRecord,
} from "./phoneEchoScan";
import { useClaudeEchoRead } from "./useClaudeEchoRead";
import { useConfirm } from "../../composables/useConfirm";

interface AlbumInfo {
  albumId: string | null;
  resolvedUrl: string;
  photos: AlbumPhoto[];
}

const emit = defineEmits<{
  "echoes-parsed": [echoes: ParsedEchoForImporter[], saveToInventory: boolean];
}>();

const items = ref<ScanItem[]>([]);
const isScanning = ref(false);
const progress = ref({ done: 0, total: 0 });
const currentStep = ref("");

// ---- Google Photos album: the site's own API fetches the share page and the photos (same-origin), and the
// photos already imported from an album are remembered per browser so later runs take only the new ones.
const ALBUM_MEMORY_KEY = "wuthering-tools-plus.echoScan.albums";
const albumUrl = ref("");
const album = ref<AlbumInfo | null>(null);
const albumError = ref<string | null>(null);
const isLoadingAlbum = ref(false);
const includeImported = ref(false);
const importedIds = ref<Set<string>>(new Set());

const albumKey = computed(() => album.value?.albumId ?? album.value?.resolvedUrl ?? null);
const albumImportedCount = computed(() => (album.value ? album.value.photos.filter((photo) => importedIds.value.has(photo.id)).length : 0));
const albumNewPhotos = computed(() => (album.value ? album.value.photos.filter((photo) => !importedIds.value.has(photo.id)) : []));
const albumPhotosToScan = computed(() => (includeImported.value ? (album.value?.photos ?? []) : albumNewPhotos.value));

function loadImportedIds(key: string): Set<string> {
  try {
    const all = JSON.parse(localStorage.getItem(ALBUM_MEMORY_KEY) ?? "{}") as Record<string, { photoIds?: string[] }>;
    return new Set(all[key]?.photoIds ?? []);
  } catch {
    return new Set();
  }
}

function saveImportedIds(key: string, ids: Set<string>): void {
  try {
    const all = JSON.parse(localStorage.getItem(ALBUM_MEMORY_KEY) ?? "{}") as Record<string, unknown>;
    all[key] = { photoIds: [...ids], updatedAt: new Date().toISOString() };
    localStorage.setItem(ALBUM_MEMORY_KEY, JSON.stringify(all));
  } catch {
    /* storage may be unavailable; the memory is a convenience */
  }
}

async function loadAlbum(): Promise<void> {
  const url = albumUrl.value.trim();
  if (!url || isLoadingAlbum.value) return;
  isLoadingAlbum.value = true;
  albumError.value = null;
  try {
    const response = await fetch(`/api/photos-album?url=${encodeURIComponent(url)}`);
    const data = (await response.json()) as AlbumInfo & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `The album could not be read (${response.status})`);
    album.value = data;
    importedIds.value = loadImportedIds(data.albumId ?? data.resolvedUrl);
  } catch (error) {
    album.value = null;
    albumError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isLoadingAlbum.value = false;
  }
}

async function fetchPhotoFile(photo: AlbumPhoto, name: string): Promise<File> {
  const response = await fetch(`/api/photos-image?id=${encodeURIComponent(photo.id)}`);
  if (!response.ok) throw new Error(`the photo could not be fetched (${response.status})`);
  const blob = await response.blob();
  return new File([blob], `${name}.jpg`, { type: blob.type || "image/jpeg" });
}

async function scanAlbum(): Promise<void> {
  if (!album.value || isScanning.value) return;
  const photos = albumPhotosToScan.value;
  for (const photo of photos) {
    const position = album.value.photos.indexOf(photo) + 1;
    items.value.push(newScanItem({ file: null, photo, name: `album photo ${position}` }));
  }
  await scanAll();
}

function rememberImported(photoIds: string[]): void {
  const key = albumKey.value;
  if (!key || !photoIds.length) return;
  const next = new Set(importedIds.value);
  for (const id of photoIds) next.add(id);
  importedIds.value = next;
  saveImportedIds(key, next);
}

function markAlbumImported(): void {
  if (album.value) rememberImported(album.value.photos.map((photo) => photo.id));
}

function forgetAlbum(): void {
  const key = albumKey.value;
  if (!key) return;
  importedIds.value = new Set();
  saveImportedIds(key, importedIds.value);
}

// ---- Read with Claude (useClaudeEchoRead.ts): reactive() unwraps its refs for the template
const SPARKLE = "M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zm6.5 11.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z";
async function fileFor(item: ScanItem): Promise<File> {
  if (item.file) return item.file;
  if (item.photo) return fetchPhotoFile(item.photo, item.name.replace(/\s+/g, "-"));
  throw new Error("no image to read");
}
const { confirm } = useConfirm();
const confirmOverBudget = (estimateUsd: number, budget: number): Promise<boolean> =>
  confirm(`Reading these screenshots should cost about ${formatUsd(estimateUsd)}, above your ${formatUsd(budget)} soft budget (AI settings). Read them anyway?`, {
    title: "Read with Claude",
    confirmLabel: "Read anyway",
    variant: "warning",
  });
const claude = reactive(useClaudeEchoRead({ items, busy: isScanning, fileFor, confirmOverBudget }));
const aiSettings = useAiSettings();
const budgetUsd = computed(() => aiSettings.settings.value.budgetUsd);
const estimateTitle = computed(
  () =>
    `About ${claude.estimate.imageTokens.toLocaleString()} image tokens + ${VISION_PROMPT_TOKENS.toLocaleString()} prompt tokens in and up to ` +
    `${VISION_OUTPUT_TOKENS.toLocaleString()} out per screenshot, at Claude ${claude.modelLabel}'s list price; when a set's name isn't printed, a small ` +
    "second request matches its glyph. Your soft budget is in AI settings.",
);
const summaryText = computed(() => {
  const s = claude.summary;
  if (!s) return "";
  const parts = [`Read ${s.screenshots} screenshot${s.screenshots === 1 ? "" : "s"}`, `${s.echoes} echo${s.echoes === 1 ? "" : "es"}`, `${formatUsd(s.costUsd)} spent`];
  if (s.failed) parts.push(`${s.failed} failed`);
  if (s.stopped) parts.push("stopped");
  return `${parts.join(" · ")}. Check the flagged rows, then add the checked ones.`;
});

const queuedCount = computed(() => items.value.filter((item) => item.status === "queued").length);
const includedCount = computed(() => items.value.filter((item) => item.include && item.record).length);

const echoOptions = Object.values(mainEchoesData)
  .map((echo) => ({ key: echo.key, name: echo.name }))
  .sort((a, b) => a.name.localeCompare(b.name));
const allSets = Object.keys(echoSetLabelMap);

function statLabel(key: string): string {
  return KEY_TO_LABEL[key.replace(/_FLAT$/, "")] ? `${KEY_TO_LABEL[key.replace(/_FLAT$/, "")]}${key.endsWith("_FLAT") ? " (flat)" : ""}` : key;
}
function setLabel(set: string): string {
  return echoSetLabelMap[set] ?? set;
}
function setOptions(item: ScanItem): string[] {
  const sets = item.record?.echo ? (echoEntry(item.record.echo)?.sets ?? []) : [];
  return sets.length ? sets : allSets;
}
function mainOptions(item: ScanItem): string[] {
  const cost = item.record?.cost;
  const table = cost ? (statsTable as Record<number, Record<string, unknown>>)[cost] : null;
  return table ? Object.keys(table) : MAIN_STAT_KEYS;
}
function hasNotes(item: ScanItem): boolean {
  return Boolean(item.error || item.record?.flags.length || item.claudeError || (item.claude && (item.claude.equippedBy || item.claude.notes)));
}
function rowTone(item: ScanItem): string {
  if (item.claudeState === "reading") return "bg-primary/5";
  if (item.status === "error" || item.status === "unsupported") return "bg-error/10";
  return item.record?.flags.length ? "bg-warning/10" : "";
}
function statusLabel(item: ScanItem): string {
  if (item.claudeState === "reading") return "reading with Claude…";
  if (item.source === "claude" && item.status === "done") {
    const sure = item.claude ? `${Math.round(item.claude.confidence * 100)}% sure · ` : "";
    return `${sure}${item.record?.flags.length ? "check the notes" : "ok"}`;
  }
  switch (item.status) {
    case "queued":
      return "queued";
    case "scanning":
      return "scanning…";
    case "done":
      return item.record?.flags.length ? "check the notes" : "ok";
    case "unsupported":
      return "unsupported size";
    default:
      return "failed";
  }
}

function onFilesChosen(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
  for (const file of files) {
    items.value.push(newScanItem({ file, name: file.name }));
  }
  input.value = "";
}

function clearAll(): void {
  items.value = [];
  progress.value = { done: 0, total: 0 };
}

function onEchoChanged(item: ScanItem): void {
  const record = item.record;
  if (!record) return;
  const entry = record.echo ? echoEntry(record.echo) : null;
  record.echoName = entry?.name ?? null;
  record.cost = entry?.cost ?? record.cost;
  if (entry && record.set && !entry.sets.includes(record.set)) record.set = entry.sets.length === 1 ? entry.sets[0] : null;
  if (entry && !record.set && entry.sets.length === 1) record.set = entry.sets[0];
  item.include = Boolean(record.echo);
}

function onMainChanged(item: ScanItem, event: Event): void {
  const record = item.record;
  if (!record) return;
  const key = (event.target as HTMLSelectElement).value;
  if (!key) {
    record.main = null;
    return;
  }
  const table = record.cost ? ((statsTable as Record<number, Record<string, Record<number, number>>>)[record.cost] ?? {}) : {};
  const value = table[key]?.[5];
  record.main = [key, value !== undefined ? `${value}%` : "0%"];
}

function makeThumb(source: ImageBitmap, region: Region): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = Math.round((96 * region.height) / region.width);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

async function scanOne(item: ScanItem, ocr: EchoOcr, matcher: EchoImageMatcher | null): Promise<void> {
  item.status = "scanning";
  item.error = null;
  try {
    if (!item.file) throw new Error("no image to scan");
    const bitmap = await createImageBitmap(item.file);
    const layout = resolveLayout(bitmap.width, bitmap.height);
    if (!layout) {
      item.status = "unsupported";
      item.error = `${bitmap.width}×${bitmap.height} is not a supported layout (expected 3120×1440 landscape or the same shape)`;
      bitmap.close();
      return;
    }
    const regions = layout.regions;
    const table = layout.table;
    currentStep.value = `${item.name}: reading the name…`;
    const name = await ocr.recognize(bitmap, regions.name, { scale: 1.5, psm: PSM.SINGLE_LINE });
    const costText = await ocr.recognize(bitmap, regions.cost, { scale: 3, psm: PSM.SINGLE_LINE, mode: "plain" });
    const levelText = await ocr.recognize(bitmap, regions.level, { scale: 3, psm: PSM.SINGLE_LINE, mode: "plain", whitelist: "+0123456789" });
    currentStep.value = `${item.name}: reading the stats…`;
    // the block pass gives the rows' positions and labels; every value is then re-read from its own row
    const { words } = await ocr.recognizeWords(bitmap, regions.panel, { scale: table.blockScale, psm: PSM.SINGLE_BLOCK });
    currentStep.value = `${item.name}: reading the set…`;
    const chip = await ocr.recognize(bitmap, regions.chip, { scale: 2, psm: PSM.SINGLE_LINE, mode: "invert" });
    const input: ScanInput = { words, name, chip, costText, levelText };
    const reads = new Map<string, Promise<string>>();
    const read: BoxReader = (request) => {
      const key = `${request.kind}.${request.row}.${request.band.join("-")}.${request.variant.key}`;
      let pending = reads.get(key);
      if (!pending) {
        pending = ocr.recognize(bitmap, readRegion(regions.panel, table, request), {
          scale: request.variant.scale,
          psm: PSM.SINGLE_LINE,
          mode: request.variant.mode,
          whitelist: request.variant.whitelist,
        });
        reads.set(key, pending);
      }
      return pending;
    };
    currentStep.value = `${item.name}: reading the stat rows…`;
    let record = await scanEcho(item.name, input, read, table);
    if (matcher && (!record.echo || !record.set)) {
      currentStep.value = `${item.name}: matching images…`;
      const hints: RecordHints = {};
      try {
        await matcher.setSource(await createImageBitmap(item.file));
        if (!record.echo) hints.echoFromImage = await matcher.matchEcho(regions.echoImage, record.cost);
        const echo = record.echo ?? hints.echoFromImage ?? null;
        const sets = echo ? (echoEntry(echo)?.sets ?? []) : [];
        if (!record.set && sets.length > 1) hints.setFromGlyph = await matcher.matchSet(regions.setGlyph, sets);
      } catch {
        /* image matching is best-effort */
      }
      record = await scanEcho(item.name, input, read, table, hints);
    }
    item.thumb = makeThumb(bitmap, regions.echoImage);
    bitmap.close();
    item.record = record;
    item.include = Boolean(record.echo);
    item.status = "done";
  } catch (error) {
    item.status = "error";
    item.error = error instanceof Error ? error.message : String(error);
  }
}

async function scanAll(): Promise<void> {
  const queued = items.value.filter((item) => item.status === "queued");
  if (!queued.length || isScanning.value) return;
  isScanning.value = true;
  progress.value = { done: 0, total: queued.length };
  const ocr = new EchoOcr();
  const matcher = new EchoImageMatcher();
  let matcherReady = false;
  try {
    currentStep.value = "Loading the OCR engine…";
    await ocr.init();
    currentStep.value = "Loading the echo reference images…";
    try {
      await matcher.init();
      matcherReady = true;
    } catch {
      /* image matching is best-effort: scanning continues without portrait / glyph hints */
    }
    for (const item of queued) {
      if (!item.file && item.photo) {
        currentStep.value = `${item.name}: fetching the photo…`;
        try {
          item.file = await fetchPhotoFile(item.photo, item.name.replace(/\s+/g, "-"));
        } catch (error) {
          item.status = "error";
          item.error = error instanceof Error ? error.message : String(error);
          progress.value = { ...progress.value, done: progress.value.done + 1 };
          continue;
        }
      }
      await scanOne(item, ocr, matcherReady ? matcher : null);
      if (item.photo) item.file = null; // the bytes are not needed after the scan; the thumb is a small data url
      progress.value = { ...progress.value, done: progress.value.done + 1 };
    }
  } catch (error) {
    for (const item of queued) {
      if (item.status === "queued" || item.status === "scanning") {
        item.status = "error";
        item.error = error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    await ocr.terminate();
    matcher.terminate();
    isScanning.value = false;
    currentStep.value = "";
  }
}

function addToInventory(): void {
  const included = items.value.filter((item) => item.include && item.record);
  const echoes = included.map((item) => toParsedEcho(item.record as ScanRecord));
  if (!echoes.length) return;
  rememberImported(included.flatMap((item) => (item.photo ? [item.photo.id] : [])));
  emit("echoes-parsed", echoes, true);
}
</script>

<style scoped>
/* the selected group in "Read with Claude" */
.scope--on,
.scope--on:hover {
  background: oklch(var(--p) / 0.16);
  color: oklch(var(--p));
  border-color: transparent;
}
/* a row with notes: its notes row continues it (no rule between them) */
.table--cards tr.row--noted {
  border-bottom-width: 0;
}
.table--cards tr.notes-row > td {
  padding-top: 0;
}
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.notes-list li {
  position: relative;
  padding-left: 0.85rem;
  color: oklch(var(--bc) / 0.82);
}
.notes-list li::before {
  content: "";
  position: absolute;
  left: 0.15rem;
  top: 0.45em;
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 9999px;
  background: oklch(var(--wa));
}
/* the card order below 768 px - the generic reflow lives in ../phone-tables.css */
@media (max-width: 767px) {
  .table--cards .cell--check {
    order: 0;
  }
  .table--cards .cell--shot {
    order: 0;
    flex: 1 1 0;
    min-width: 0;
    white-space: normal;
  }
  .table--cards .cell--cost {
    order: 0;
    margin-left: auto;
  }
  .table--cards .cell--full {
    order: 1;
  }
  .table--cards .cell--subs::before {
    display: block;
    margin-bottom: 0.15rem;
  }
  .table--cards tr.row--noted {
    border-bottom: 0;
    padding-bottom: 0.2rem;
  }
  .table--cards tr.notes-row {
    padding-top: 0;
  }
  .table--cards .cell--notes-pad {
    display: none;
  }
  .table--cards tr.row--pending .cell--full,
  .table--cards tr.row--pending .cell--cost {
    display: none;
  }
  .table--cards .cell--echo > div {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
