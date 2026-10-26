<template>
  <!-- Wuthering Tools+: the Convene history import. The record link is a bearer token: it lives in this component's
       state only, goes nowhere but Kuro's record API, and is cleared after every attempt. No <form> GET, no name
       attributes, nothing in the route. -->
  <section class="card bg-base-200 shadow-sm border border-base-content/5" data-test-convene-import>
    <div class="card-body gap-4 p-4 sm:p-6">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold">{{ hasHistory ? "Update your history" : "Import your Convene history" }}</h2>
          <p class="text-sm text-base-content/70 mt-0.5">
            Kuro keeps six months of pulls. Every import is merged into what this browser already holds, so the history
            here keeps growing past that window.
          </p>
        </div>
        <button v-if="closable" type="button" class="btn btn-ghost btn-sm btn-square" aria-label="Close" data-test-convene-import-close @click="emit('close')">✕</button>
      </div>

      <div class="join w-full sm:w-auto" role="tablist" aria-label="Where you play">
        <button
          v-for="p in PLATFORMS"
          :key="p.id"
          type="button"
          role="tab"
          class="btn btn-sm join-item flex-1 sm:flex-none normal-case"
          :class="platform === p.id ? 'btn-primary' : 'bg-base-100/60'"
          :aria-selected="platform === p.id"
          :data-test-convene-platform="p.id"
          @click="platform = p.id">
          {{ p.label }}
        </button>
      </div>

      <!-- per-platform steps -->
      <ol v-if="platform === 'pc'" class="convene-steps text-sm" data-test-convene-steps="pc">
        <li>In game, open <b>Convene</b> and press <b>History</b>. That writes a fresh link into the game's log.</li>
        <li>
          Load <code>Client.log</code> from the game folder:
          <code class="break-all">…\Wuthering Waves Game\Client\Saved\Logs\Client.log</code>
          <span class="text-base-content/60">
            (the default install is <code class="break-all">C:\Wuthering Waves\Wuthering Waves Game</code>; Steam puts it under
            <code class="break-all">steamapps\common\Wuthering Waves</code>).</span>
        </li>
        <li>No link in the log? Logging may be switched off on your PC — <a :href="GUIDE_URL" target="_blank" rel="noopener noreferrer" class="link link-primary">WuWa Tracker's import guide</a> shows how to fix it.</li>
      </ol>
      <p v-else-if="platform === 'phone'" class="text-sm leading-relaxed" data-test-convene-steps="phone">
        On Android and iOS the game doesn't write the link anywhere you can open, so it has to be captured another way.
        We don't publish steps we can't check;
        <a :href="GUIDE_URL" target="_blank" rel="noopener noreferrer" class="link link-primary" data-test-convene-guide-link>WuWa Tracker's import guide</a>
        covers each phone. Once you have the link, paste it below.
      </p>
      <p v-else class="text-sm leading-relaxed" data-test-convene-steps="console">
        On PlayStation and Xbox the link (or its player id and record id) has to be captured another way —
        <a :href="GUIDE_URL" target="_blank" rel="noopener noreferrer" class="link link-primary" data-test-convene-guide-link>WuWa Tracker's import guide</a>
        explains how. Paste the whole link below, or type its ids.
      </p>

      <!-- PC: the log file -->
      <div v-if="platform === 'pc'" class="grid grid-cols-1 gap-3">
        <label
          class="convene-drop group flex cursor-pointer flex-col items-center justify-center gap-1 rounded-box border-2 border-dashed px-4 py-6 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/10' : 'border-base-content/15 bg-base-100/40 hover:border-primary/60 hover:bg-base-100/70'"
          data-test-convene-log-drop
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop">
          <svg viewBox="0 0 24 24" class="size-7 text-primary/80" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 15V4m0 0L8 8m4-4l4 4M5 14v4.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V14" />
          </svg>
          <span class="font-medium">Drop <code>Client.log</code> here, or choose it</span>
          <span class="text-xs text-base-content/60">Read on your device. Only the link inside goes to Kuro.</span>
          <input type="file" class="sr-only" accept=".log,.txt,text/plain" data-test-convene-log-input @change="onLogPicked" />
        </label>
      </div>

      <!-- every platform: paste the link -->
      <div class="grid grid-cols-1 gap-2">
        <label class="text-sm font-medium" for="wtplus-convene-link">{{ platform === "pc" ? "…or paste the link" : "Convene History link" }}</label>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            id="wtplus-convene-link"
            v-model="linkText"
            type="text"
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class="input input-bordered min-w-0 flex-1 font-mono text-xs sm:text-sm"
            placeholder="https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?…"
            :disabled="busy"
            data-test-convene-link
            @keydown.enter.prevent="importLink" />
          <button type="button" class="btn btn-primary sm:w-36" :disabled="busy || !linkText.trim()" data-test-convene-import-link @click="importLink">
            Import
          </button>
        </div>
      </div>

      <!-- consoles: the ids by hand -->
      <details v-if="platform === 'console'" class="rounded-box bg-base-100/50 px-3 py-2" data-test-convene-manual>
        <summary class="cursor-pointer text-sm font-medium">Type the ids instead</summary>
        <div class="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
          <label class="form-control">
            <span class="label-text text-xs">Player id (UID)</span>
            <input v-model="manual.playerId" type="text" inputmode="numeric" autocomplete="off" class="input input-bordered input-sm" data-test-convene-manual-player />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">Record id (<code>record_id</code>)</span>
            <input v-model="manual.recordId" type="text" autocomplete="off" spellcheck="false" class="input input-bordered input-sm font-mono" data-test-convene-manual-record />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">Server id (<code>svr_id</code>)</span>
            <input v-model="manual.serverId" type="text" autocomplete="off" spellcheck="false" class="input input-bordered input-sm font-mono" data-test-convene-manual-server />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">Resources id (<code>resources_id</code>, optional)</span>
            <input v-model="manual.cardPoolId" type="text" autocomplete="off" spellcheck="false" class="input input-bordered input-sm font-mono" />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">Region</span>
            <select v-model="manual.region" class="select select-bordered select-sm">
              <option value="global">Global</option>
              <option value="cn">China</option>
            </select>
          </label>
          <div class="flex items-end">
            <button type="button" class="btn btn-primary btn-sm w-full" :disabled="busy" data-test-convene-manual-import @click="importManual">Import</button>
          </div>
        </div>
        <p class="text-xs text-base-content/60 pt-2">Kuro checks the server id, so it has to be the one from your link.</p>
      </details>

      <!-- progress -->
      <div v-if="busy" class="rounded-box bg-base-100/60 p-3" role="status" data-test-convene-import-progress>
        <div class="flex items-center gap-3 text-sm">
          <span class="loading loading-spinner loading-sm text-primary"></span>
          <span class="flex-1 min-w-0 truncate">{{ progressText }}</span>
          <button type="button" class="btn btn-ghost btn-xs" data-test-convene-import-cancel @click="cancel">Cancel</button>
        </div>
        <progress class="progress progress-primary mt-2 w-full" :value="progress.done" :max="progress.total || 1"></progress>
      </div>

      <!-- outcome -->
      <div v-if="message" class="alert py-2.5 text-sm" :class="ALERT[message.kind]" role="alert" data-test-convene-import-message :data-kind="message.kind">
        <span>{{ message.text }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-base-content/10 pt-3 text-sm">
        <label class="link link-hover inline-flex items-center gap-1.5 text-base-content/80" data-test-convene-file-label>
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zm7 0v5h5" /></svg>
          Import a WuWa Tracker export or a backup file
          <input type="file" class="sr-only" accept=".json,application/json" data-test-convene-file-input @change="onBackupPicked" />
        </label>
        <span class="text-xs text-base-content/55 basis-full sm:basis-auto sm:ml-auto">
          The link works like a password for about an hour. It goes from your browser straight to Kuro — never to us — and
          is never saved. Only your player id is kept, to keep accounts apart.
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import {
  CONVENE_FILE_ERRORS,
  CONVENE_IMPORT_ERRORS,
  CONVENE_LINK_ERRORS,
  manualConveneQuery,
  parseConveneLink,
  type ConveneLinkError,
  type ConveneQuery,
  type ImportSummary,
} from "../gachaImport";
import { poolOf } from "../pools";
import { useConveneHistory } from "./useConvene";
import { scanLogForLink } from "./scanLog";
import { fmtInt } from "./format";

defineProps<{ hasHistory: boolean; closable?: boolean }>();
/** `message` is the outcome line: the page shows it after the panel closes */
const emit = defineEmits<{ close: []; imported: [summary: ImportSummary, message: { kind: "ok" | "warn"; text: string }] }>();

const GUIDE_URL = "https://wuwatracker.com/import";
const PLATFORMS = [
  { id: "pc", label: "PC" },
  { id: "phone", label: "Android / iOS" },
  { id: "console", label: "PlayStation / Xbox" },
] as const;
type Platform = (typeof PLATFORMS)[number]["id"];

const MANUAL_ERRORS: Record<ConveneLinkError, string> = {
  "no-link": "Type your player id, record id and server id.",
  "missing-player": "Type your player id (the UID shown in game).",
  "missing-record": "Type the record id.",
  "missing-server": "Type the server id.",
  "bad-value": "One of the ids has unexpected characters. Check what you typed.",
};

const ALERT = { ok: "alert-success", warn: "alert-warning", error: "alert-error", info: "bg-base-100 border-base-content/10" } as const;

const { importFromQuery, importFile } = useConveneHistory();
const platform = ref<Platform>(guessPlatform());
const linkText = ref("");
const manual = reactive({ playerId: "", recordId: "", serverId: "", cardPoolId: "", region: "global" as "global" | "cn" });
const busy = ref(false);
const dragging = ref(false);
const progress = ref({ done: 0, total: 13, poolType: 0, phase: "fetch" as "scan" | "fetch" });
const message = ref<{ kind: keyof typeof ALERT; text: string } | null>(null);
let controller: AbortController | null = null;

function guessPlatform(): Platform {
  if (typeof navigator === "undefined") return "pc";
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "phone" : "pc";
}

const progressText = computed(() => {
  if (progress.value.phase === "scan") return "Looking for the link in your log…";
  const pool = poolOf(progress.value.poolType);
  return progress.value.done
    ? `Read ${progress.value.done} of ${progress.value.total} pools${pool ? ` · ${pool.short}` : ""}`
    : "Asking Kuro for your records…";
});

async function run(query: ConveneQuery): Promise<void> {
  busy.value = true;
  message.value = null;
  controller = new AbortController();
  progress.value = { done: 0, total: 13, poolType: 0, phase: "fetch" };
  try {
    const result = await importFromQuery(query, {
      signal: controller.signal,
      onProgress: (done, total, poolType) => (progress.value = { done, total, poolType, phase: "fetch" }),
    });
    if (!result.ok) {
      message.value = { kind: result.reason === "aborted" ? "info" : "error", text: CONVENE_IMPORT_ERRORS[result.reason] };
      return;
    }
    const s = result.summary;
    const parts = [s.added ? `Added ${fmtInt(s.added)} new pull${s.added === 1 ? "" : "s"}` : "No new pulls since your last import", `${fmtInt(s.total)} in your history`];
    let text = `${parts.join(" · ")}.`;
    if (s.failed) text += ` ${s.failed} pool${s.failed === 1 ? "" : "s"} didn't answer — import again later to fill ${s.failed === 1 ? "it" : "them"} in.`;
    const outcome = !result.saved
      ? ({ kind: "warn", text: `${text} This browser wouldn't save it (storage full or turned off), so it will be gone after a reload. Export a backup now.` } as const)
      : ({ kind: s.failed ? "warn" : "ok", text } as const);
    message.value = outcome;
    emit("imported", s, outcome);
  } finally {
    // the token is done with — drop every copy this component holds
    linkText.value = "";
    manual.recordId = "";
    busy.value = false;
    controller = null;
  }
}

function importLink(): void {
  if (busy.value) return;
  const parsed = parseConveneLink(linkText.value);
  if (!parsed.ok) {
    message.value = { kind: "error", text: CONVENE_LINK_ERRORS[parsed.error] };
    return;
  }
  void run(parsed.query);
}

function importManual(): void {
  if (busy.value) return;
  const parsed = manualConveneQuery({ ...manual });
  if (!parsed.ok) {
    message.value = { kind: "error", text: MANUAL_ERRORS[parsed.error] };
    return;
  }
  void run(parsed.query);
}

async function importLog(file: File | undefined | null): Promise<void> {
  if (!file || busy.value) return;
  busy.value = true;
  message.value = null;
  progress.value = { done: 0, total: 13, poolType: 0, phase: "scan" };
  let link: string | null = null;
  try {
    link = await scanLogForLink(file);
  } catch {
    link = null;
  }
  busy.value = false;
  if (!link) {
    message.value = {
      kind: "error",
      text: "No Convene link in that file. Open Convene › History in game first (that writes the link), then load the newest Client.log again.",
    };
    return;
  }
  const parsed = parseConveneLink(link);
  link = null;
  if (!parsed.ok) {
    message.value = { kind: "error", text: CONVENE_LINK_ERRORS[parsed.error] };
    return;
  }
  await run(parsed.query);
}

function onLogPicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  void importLog(file);
}

function onDrop(e: DragEvent): void {
  dragging.value = false;
  void importLog(e.dataTransfer?.files?.[0]);
}

async function onBackupPicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  message.value = null;
  const text = await file.text();
  const result = importFile(text);
  if (!result.ok) {
    const reason = result.reason;
    message.value = { kind: "error", text: reason === "not-json" || reason === "unknown-format" ? CONVENE_FILE_ERRORS[reason] : CONVENE_IMPORT_ERRORS[reason] };
    return;
  }
  const s = result.summary;
  const text2 = `${s.added ? `Added ${fmtInt(s.added)} pull${s.added === 1 ? "" : "s"} from the file` : "Nothing new in that file"} · ${fmtInt(s.total)} in your history.`;
  const outcome = result.saved ? ({ kind: "ok", text: text2 } as const) : ({ kind: "warn", text: `${text2} This browser wouldn't save it, so it will be gone after a reload.` } as const);
  message.value = outcome;
  emit("imported", s, outcome);
}

function cancel(): void {
  controller?.abort();
}

onBeforeUnmount(() => {
  controller?.abort();
  linkText.value = "";
});
</script>

<style scoped>
.convene-steps {
  counter-reset: step;
  display: grid;
  gap: 0.5rem;
}
.convene-steps li {
  counter-increment: step;
  position: relative;
  padding-left: 2rem;
  line-height: 1.55;
}
.convene-steps li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0.05rem;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 9999px;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
code {
  font-size: 0.85em;
  padding: 0.05rem 0.3rem;
  border-radius: 0.3rem;
  background: oklch(var(--bc) / 0.08);
}
</style>
