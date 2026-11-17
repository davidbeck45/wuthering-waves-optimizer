<template>
  <p v-if="!empty" class="flex flex-wrap items-center gap-2 text-sm" data-test-backup-copy-first>
    <button type="button" class="btn btn-sm btn-outline" data-test-backup-copy-first-download @click="downloadNow">Download a copy first</button>
    <span class="bk-copy-first__note">A file of your whole account as it is now, pull history included. Delete takes the automatic backups too.</span>
  </p>
</template>

<script setup lang="ts">
// Wuthering Tools+ — in Settings › Danger Zone, above Ryan's Delete button (one tag in SettingsDelete.vue). Delete
// your data takes the automatic backups with the account (storage/deleteAccount.ts), so the way to keep one is offered
// right where the delete is.
import { ref } from "vue";
import { useToast } from "../../composables/useToast";
import { captureCounts, isEmptyAccount } from "./counts";
import { captureNow, currentFileText } from "./liveCapture";
import { downloadBackupText } from "./outside";

defineOptions({ name: "BackupCopyFirst" });
const { showToast } = useToast();

function isEmpty(): boolean {
  try {
    return isEmptyAccount(captureCounts(captureNow()));
  } catch {
    return true; // storage blocked: there is nothing this button could read
  }
}
const empty = ref(isEmpty());

function downloadNow(): void {
  try {
    const current = currentFileText();
    showToast(`Downloaded ${downloadBackupText(current.text, current.at)}`, "success", 5000);
  } catch {
    showToast("This browser's storage can't be read here, so there is nothing to copy.", "error", 7000);
  }
}
</script>

<style scoped>
/* the card's own text is the body colour at 70 %; this note keeps to 80 % so it reads on the light themes too */
.bk-copy-first__note {
  color: oklch(var(--bc) / 0.8);
}
</style>
