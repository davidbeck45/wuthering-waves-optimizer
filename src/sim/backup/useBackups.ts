// Wuthering Tools+ automatic backups — the state behind the Backups page and the status card: the list, whether this
// browser keeps any, when a copy last left it, and the actions (back up now, restore, download, share, delete).
import { getCurrentInstance, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useConfirm } from "../../composables/useConfirm";
import { useToast } from "../../composables/useToast";
import { applyImportedDatabase } from "../../utils/settingsBackup";
import { ImportRefused } from "../buildHistory/importCheck";
import { backups, backupsChanged } from "./autoBackup";
import type { BackupMeta } from "./backupStore";
import { backupName, deleteConfirm, notTakenText, restoreConfirm } from "./backupText";
import { captureCounts, countsText, isEmptyAccount } from "./counts";
import { settledPlusRestore } from "./importHook";
import { captureNow, currentFileText, takeNow } from "./liveCapture";
import { canShareFiles, downloadBackupText, outsideChanged, readMissed, readOutside, shareBackupText, SHARE_FAILED_TEXT, SHARED_AS_TEXT, type MissedBackup, type OutsideState } from "./outside";
import { DAMAGED_BACKUP_TEXT, GONE_BACKUP_TEXT, inspectBackupText, restoreBackupText, RestoreRefused, UNAVAILABLE_TEXT } from "./restore";

export type BackupsState = "loading" | "ready" | "unavailable";

const RELOAD_MS = 1500; // as Settings › Import: long enough to read the toast

export function useBackups() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const list = shallowRef<BackupMeta[]>([]);
  const state = ref<BackupsState>("loading");
  const outside = ref<OutsideState | null>(readOutside());
  /** an automatic backup that could not be stored, and none stored since */
  const missed = ref<MissedBackup | null>(readMissed());
  const canShare = canShareFiles();
  const busy = ref(false);
  /** the account has nothing in it yet: there is nothing to copy */
  const empty = ref(false);
  const now = ref(Date.now());

  function readEmpty(): void {
    try {
      empty.value = isEmptyAccount(captureCounts(captureNow()));
    } catch {
      empty.value = false; // storage blocked: the buttons say why they cannot help
    }
  }

  async function load(): Promise<void> {
    readEmpty();
    if (!(await backups.available())) {
      list.value = [];
      state.value = "unavailable";
      return;
    }
    list.value = await backups.list();
    state.value = "ready";
  }

  watch(backupsChanged, () => void load());
  watch(outsideChanged, () => {
    outside.value = readOutside();
    missed.value = readMissed();
  });

  // another tab may have made, restored or deleted one: look again when this tab is looked at again
  const onVisible = (): void => {
    if (document.visibilityState !== "visible") return;
    now.value = Date.now();
    outside.value = readOutside();
    missed.value = readMissed();
    void load();
  };
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    void load();
    timer = setInterval(() => (now.value = Date.now()), 60_000);
    document.addEventListener("visibilitychange", onVisible);
  });
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    });
  }

  /** a restore went through and the page is about to reload: nothing else starts in that second and a half */
  let reloading = false;

  /** one action at a time: a second tap while the first is reading or writing does nothing */
  async function once<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined;
    busy.value = true;
    try {
      return await fn();
    } finally {
      if (!reloading) busy.value = false;
    }
  }

  const backUpNow = (): Promise<void | undefined> =>
    once(async () => {
      const taken = await takeNow("manual");
      if (taken.saved) showToast(`Backup made: ${countsText(taken.meta.counts)}.`, "success", 5000);
      else showToast(notTakenText(taken.why, taken.meta ?? list.value[0]), taken.why === "unchanged" || taken.why === "today" || taken.why === "empty" ? "info" : "error", 7000);
    });

  /** The file text of a stored backup, or of the account as it is now (`meta` null). Says why when there is none. */
  async function textOf(meta: BackupMeta | null): Promise<{ text: string; at: number } | null> {
    if (!meta) {
      try {
        const current = currentFileText();
        return { text: current.text, at: current.at };
      } catch {
        showToast("This browser's storage can't be read here, so there is nothing to copy.", "error", 7000);
        return null;
      }
    }
    const read = await backups.read(meta.id);
    if (!read.ok) {
      showToast(read.why === "gone" ? GONE_BACKUP_TEXT : read.why === "damaged" ? DAMAGED_BACKUP_TEXT : UNAVAILABLE_TEXT, "error", 9000);
      if (read.why === "gone") void load();
      return null;
    }
    return { text: read.text, at: read.meta.at };
  }

  const download = (meta: BackupMeta | null = null): Promise<void | undefined> =>
    once(async () => {
      const file = await textOf(meta);
      if (!file) return;
      const name = downloadBackupText(file.text, file.at);
      showToast(`Downloaded ${name}`, "success", 5000);
    });

  const share = (meta: BackupMeta | null = null): Promise<void | undefined> =>
    once(async () => {
      const file = await textOf(meta);
      if (!file) return;
      const outcome = await shareBackupText(file.text, file.at);
      if (outcome === "shared") showToast(SHARED_AS_TEXT, "success", 8000);
      else if (outcome === "failed") showToast(SHARE_FAILED_TEXT, "error", 8000);
    });

  const remove = (meta: BackupMeta): Promise<void | undefined> =>
    once(async () => {
      const c = deleteConfirm(meta);
      if (!(await confirm(c.message, { title: c.title, confirmLabel: c.confirmLabel, variant: "error" }))) return;
      if (await backups.remove(meta.id)) showToast("Backup deleted.", "success");
      else showToast("The backup could not be deleted.", "error", 7000);
      await load();
    });

  /** Confirm, then put the backup back; the page reloads on success. */
  async function restoreText(text: string, at: number | null): Promise<boolean> {
    let inspected: ReturnType<typeof inspectBackupText>;
    try {
      inspected = inspectBackupText(text);
    } catch (e) {
      showToast(e instanceof RestoreRefused ? e.message : DAMAGED_BACKUP_TEXT, "error", 9000);
      return false;
    }
    const when = inspected.madeAt ?? at;
    const c = restoreConfirm(when, inspected.counts, { keeps: state.value === "ready", plus: inspected.plus });
    if (!(await confirm(c.message, { title: c.title, items: c.items, confirmLabel: c.confirmLabel, variant: "warning" }))) return false;
    try {
      const outcome = await restoreBackupText(text, { saveFirst: () => takeNow("before-restore"), apply: applyImportedDatabase, plusDone: settledPlusRestore });
      const pulls = outcome.plus.pullsAdded ? ` ${outcome.plus.pullsAdded.toLocaleString("en-US")} pull${outcome.plus.pullsAdded === 1 ? "" : "s"} added to your history.` : "";
      showToast(`Restored ${backupName(when)}.${pulls} Reloading…`, "success", RELOAD_MS + 500);
      reloading = true;
      window.setTimeout(() => location.reload(), RELOAD_MS);
      return true;
    } catch (e) {
      showToast(e instanceof RestoreRefused || e instanceof ImportRefused ? e.message : `The restore failed, and nothing was changed: ${e instanceof Error ? e.message : String(e)}`, "error", 9000);
      void load();
      return false;
    }
  }

  const restore = (meta: BackupMeta): Promise<boolean | undefined> =>
    once(async () => {
      const file = await textOf(meta);
      return file ? restoreText(file.text, file.at) : false;
    });

  const restoreFile = (file: File): Promise<boolean | undefined> =>
    once(async () => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        showToast("That file could not be read.", "error", 7000);
        return false;
      }
      return restoreText(text, null);
    });

  return { list, state, outside, missed, canShare, busy, empty, now, load, backUpNow, download, share, remove, restore, restoreFile };
}
