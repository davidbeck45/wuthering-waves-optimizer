<template>
  <Nav cur-page="backups" :disable-mobile-nav="true"></Nav>
  <div class="bk" data-test-backups :data-state="state">
    <header>
      <h1 class="bk-h1">Backups</h1>
      <p class="bk-intro">
        Copies of your whole account, kept in this browser: one a day when something changed, and one just before an import
        or a restore replaces it.
      </p>
    </header>

    <BackupStatus variant="page" />

    <section v-if="state === 'unavailable'" class="bk-card" role="status" data-test-backups-unavailable>
      <h2 class="bk-h2">Backups are unavailable here</h2>
      <p class="bk-muted mt-1">
        This browser isn't keeping backups (a private window, or storage turned off), so nothing is saved on its own. Your
        account is not affected, and Download a copy above still gives you a file of it as it is now.
      </p>
    </section>

    <section v-else class="bk-card" aria-labelledby="bk-list-title" data-test-backups-list>
      <div class="bk-list__head">
        <h2 id="bk-list-title" class="bk-h2">
          In this browser
          <span v-if="list.length" class="bk-muted font-normal" data-test-backups-total>· {{ list.length }} backup{{ list.length === 1 ? "" : "s" }} · {{ sizeText(totalBytes) }}</span>
        </h2>
        <button type="button" class="btn btn-sm btn-outline" :disabled="busy || state === 'loading' || empty" data-test-backups-now @click="backUpNow()">Back up now</button>
      </div>

      <p v-if="state === 'loading'" class="bk-muted" role="status">Reading this browser's backups…</p>
      <p v-else-if="!list.length" class="bk-muted" data-test-backups-empty>
        <template v-if="empty">Nothing to back up yet: no character set up, no echoes, no teams and no pulls.</template>
        <template v-else>No backups yet. The first is made on its own a few seconds after you open the site, or press Back up now.</template>
      </p>

      <ul v-else class="bk-rows" data-test-backups-rows>
        <li v-for="b in list" :key="b.id" class="bk-row" :data-test-backup-row="b.id" :data-reason="b.reason">
          <div class="bk-row__top">
            <span class="bk-row__when" data-test-backup-when>{{ whenText(b.at, now) }}</span>
            <span class="bk-muted" data-test-backup-age>{{ ageText(b.at, now) }}</span>
            <span class="bk-chip" :class="chipClass(b.reason)" :title="REASON_TITLE[b.reason]" data-test-backup-reason>{{ REASON_TEXT[b.reason] }}</span>
          </div>
          <p class="bk-row__inside" data-test-backup-inside>{{ countsText(b.counts) }}</p>
          <p class="bk-muted" data-test-backup-size>{{ sizesText(b) }}</p>
          <div class="bk-actions">
            <button type="button" class="btn btn-sm btn-primary" :disabled="busy" :aria-label="`Restore ${backupName(b.at, now)}`" data-test-backup-restore @click="restore(b)">Restore</button>
            <button type="button" class="btn btn-sm btn-outline" :disabled="busy" :aria-label="`Download ${backupName(b.at, now)}`" data-test-backup-download @click="download(b)">Download</button>
            <button v-if="canShare" type="button" class="btn btn-sm btn-outline" :disabled="busy" :aria-label="`Share ${backupName(b.at, now)}`" data-test-backup-share @click="share(b)">
              Share
            </button>
            <button type="button" class="btn btn-sm btn-outline btn-error" :disabled="busy" :aria-label="`Delete ${backupName(b.at, now)}`" data-test-backup-delete @click="remove(b)">Delete</button>
          </div>
        </li>
      </ul>
      <p v-if="state === 'ready'" class="bk-muted mt-3" data-test-backups-kept>{{ HOW_KEPT_TEXT }}</p>
    </section>

    <section class="bk-card bk-file" aria-labelledby="bk-file-title" data-test-backups-file>
      <h2 id="bk-file-title" class="bk-h2">Restore from a file</h2>
      <p class="bk-muted">
        A copy you downloaded or shared from here (.json or .txt), or an export from Settings. You are asked before anything
        is replaced.
      </p>
      <input
        ref="fileInput"
        type="file"
        accept=".json,.txt,application/json,text/plain"
        class="file-input file-input-bordered file-input-sm"
        aria-label="Backup file to restore"
        :disabled="busy"
        data-test-backups-file-input
        @change="onFile" />
    </section>

    <details class="bk-card bk-details" data-test-backups-what>
      <summary>What a backup holds</summary>
      <p class="bk-muted">{{ WHAT_IS_INSIDE_TEXT }}</p>
      <p class="bk-muted">{{ WHAT_IS_LEFT_OUT_TEXT }}</p>
      <p class="bk-muted">
        A downloaded copy also imports on plain wutheringtools.com (Settings › Backup &amp; Restore): it reads your characters,
        echoes and teams and skips the rest. A shared copy is a .txt, because phone share sheets do not take .json; the text
        inside is the same.
      </p>
      <p class="bk-muted">
        <RouterLink to="/settings?section=danger-zone" class="bk-link">Delete your data</RouterLink> in Settings removes these
        backups with the account. A copy you downloaded or shared is yours to keep.
      </p>
    </details>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /backups: the automatic backups this browser keeps (autoBackup.ts), each with Restore, Download,
// Share and Delete, the line about the last copy outside the browser, and Restore from a file.
import { computed, ref } from "vue";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import type { BackupReason } from "./backupStore";
import { ageText, backupName, HOW_KEPT_TEXT, REASON_TEXT, REASON_TITLE, sizesText, sizeText, WHAT_IS_INSIDE_TEXT, WHAT_IS_LEFT_OUT_TEXT, whenText } from "./backupText";
import { countsText } from "./counts";
import { useBackups } from "./useBackups";
import BackupStatus from "./BackupStatus.vue";
import "./backup.css";

useDocumentTitle(
  "Backups — Wuthering Waves Calculator & Optimizer",
  "Automatic backups of your Wuthering Waves account, kept in your browser: restore one, download it, or share a copy to your own storage.",
);

const { list, state, canShare, busy, empty, now, backUpNow, download, share, remove, restore, restoreFile } = useBackups();
const totalBytes = computed(() => list.value.reduce((n, b) => n + b.bytes, 0));
const chipClass = (reason: BackupReason): string => (reason === "daily" ? "" : reason === "manual" ? "bk-chip--manual" : "bk-chip--before");

const fileInput = ref<HTMLInputElement | null>(null);
async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await restoreFile(file);
  // the same file can be picked again after a Cancel
  if (fileInput.value) fileInput.value.value = "";
}
</script>
