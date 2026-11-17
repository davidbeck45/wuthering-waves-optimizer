<template>
  <section
    v-if="variant === 'page' || !empty"
    class="bk-status"
    :class="[`bk-status--${variant}`, { 'bk-status--stale': stale, 'bk-card': variant !== 'account' }]"
    :aria-label="variant === 'page' ? 'A copy outside this browser' : 'Backups'"
    data-test-backup-status
    :data-variant="variant"
    :data-stale="stale">
    <!-- My account gets the line alone: no heading, the short reason, the buttons -->
    <h2 v-if="variant !== 'account'" class="bk-status__title">
      <template v-if="variant === 'page'">A copy outside this browser</template>
      <template v-else>Backups <span class="badge badge-primary badge-outline badge-sm font-semibold">Tools+</span></template>
    </h2>
    <p class="bk-status__line" data-test-backup-outside>
      <span class="bk-status__dot" aria-hidden="true"></span>
      <span>{{ line }}</span>
    </p>
    <p v-if="variant === 'account'" class="bk-muted" data-test-backup-why>
      {{ WHY_OUTSIDE_SHORT }}
      <RouterLink to="/backups" class="bk-link" data-test-backup-all>See backups</RouterLink>
    </p>
    <p v-else class="bk-muted" data-test-backup-why>{{ WHY_OUTSIDE_TEXT }}</p>
    <p v-if="empty" class="bk-muted" data-test-backup-nothing>There is nothing to copy yet: no character set up, no echoes, no teams and no pulls.</p>
    <div v-else class="bk-actions">
      <button v-if="canShare" type="button" class="btn btn-sm btn-primary" :disabled="busy" data-test-backup-share-now @click="share()">Share a copy</button>
      <button type="button" class="btn btn-sm" :class="canShare ? 'btn-outline' : 'btn-primary'" :disabled="busy" data-test-backup-download-now @click="download()">
        Download a copy
      </button>
    </div>
    <p v-if="variant === 'settings'" class="bk-muted" data-test-backup-auto>
      <template v-if="state === 'loading'">Checking this browser's automatic backups…</template>
      <template v-else-if="state === 'unavailable'">This browser isn't keeping automatic backups (a private window, or storage turned off).</template>
      <template v-else-if="!list.length">No automatic backup in this browser yet: the first is made a few seconds after you open the site.</template>
      <template v-else>
        {{ list.length }} automatic backup{{ list.length === 1 ? "" : "s" }} in this browser, the newest from {{ whenText(list[0]!.at, now) }}.
      </template>
      <RouterLink to="/backups" class="bk-link" data-test-backup-all>See and restore backups</RouterLink>
    </p>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — the quiet line about backups: when a copy of the account last left this browser, why that
// matters, and Share / Download for the account as it is now. On the Backups page, under Settings › Backup & Restore
// (one line in Ryan's SettingsView.vue) and on My account. Nothing here asks for attention: no dialog, no badge; the
// dot turns amber after a month without a copy outside.
import { computed, onBeforeUnmount, onMounted } from "vue";
import { whenText } from "./backupText";
import { noteCopyLeft, outsideIsStale, outsideText, WHY_OUTSIDE_SHORT, WHY_OUTSIDE_TEXT } from "./outside";
import { useBackups } from "./useBackups";
import "./backup.css";

defineOptions({ name: "BackupStatus" });
const props = withDefaults(defineProps<{ variant?: "page" | "settings" | "account" }>(), { variant: "page" });

const { list, state, outside, canShare, busy, empty, now, download, share } = useBackups();
const line = computed(() => outsideText(outside.value, now.value));
const stale = computed(() => outsideIsStale(outside.value, now.value));

// Ryan's own "Download .json" in Settings is a copy outside this browser too (his three stores, no pull history).
// Heard from here instead of from a line in his two components: the button is told by its test id.
const HIS_DOWNLOAD = "[data-test-settings-export-download]";
function onClick(event: MouseEvent): void {
  if ((event.target as Element | null)?.closest?.(HIS_DOWNLOAD)) noteCopyLeft("download", "plain");
}
onMounted(() => {
  if (props.variant === "settings") document.addEventListener("click", onClick, true);
});
onBeforeUnmount(() => document.removeEventListener("click", onClick, true));
</script>
