<template>
  <div v-if="shown" class="wt-syncn" role="status" data-test-sync-notice>
    <p class="wt-syncn__text">
      <b class="wt-syncn__head" data-test-sync-notice-text>{{ headline }}</b>
      {{ NOTICE_SYNC_TEXT }}
    </p>
    <div class="wt-syncn__actions">
      <button type="button" class="btn btn-sm btn-primary" data-test-sync-notice-go @click="go">Sync my teams</button>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        aria-label="Hide this notice until Team rankings' next update"
        title="Hide this notice until Team rankings' next update"
        data-test-sync-notice-hide
        @click="hide">
        Hide
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "Your saved teams from Team rankings are behind" (syncNotice.ts): one notice, mounted at the top of
// /account with its other notices (AccountView.vue) and on /teams' summary (TeamListEngineNote.vue). Its button opens the existing
// Sync my teams on /rankings (?sync=1, read by RankingsAccountBar.vue); Hide keeps it away until the next engine update.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { NOTICE_SYNC_TEXT, SYNC_HASH, SYNC_NOTICE_KEY, SYNC_QUERY, behindTeams, markHandled, noticeHeadline, readHandled, showSyncNotice, type TeamOrigin } from "./syncNotice";

defineOptions({ name: "SyncNotice" });

const router = useRouter();
const { teams } = storeToRefs(useTeamRotationsStore()) as unknown as { teams: { value: TeamOrigin[] } };
const handled = ref<string | null>(readHandled());
const behind = computed(() => behindTeams(teams.value));
const shown = computed(() => showSyncNotice(behind.value, handled.value));
const headline = computed(() => noticeHeadline(behind.value));

function hide(): void {
  markHandled(behind.value.current);
  handled.value = behind.value.current;
}

function go(): void {
  void router.push({ path: "/rankings", query: { [SYNC_QUERY]: "1" }, hash: SYNC_HASH });
}

// another tab hid it, or ran a Sync
const onStorage = (e: StorageEvent): void => {
  if (e.key === SYNC_NOTICE_KEY || e.key === null) handled.value = readHandled();
};
onMounted(() => window.addEventListener("storage", onStorage));
onBeforeUnmount(() => window.removeEventListener("storage", onStorage));
</script>

<style scoped>
.wt-syncn {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.85rem;
  border-radius: 0.8rem;
  font-size: 0.85rem;
  line-height: 1.35;
  color: oklch(var(--bc));
  background: oklch(var(--wa) / 0.12);
  box-shadow: inset 0 0 0 1px oklch(var(--wa) / 0.45);
}
.wt-syncn__text {
  flex: 1 1 16rem;
  min-width: 0;
  margin: 0;
}
.wt-syncn__head {
  font-weight: 600;
}
.wt-syncn__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
</style>
