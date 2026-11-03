<template>
  <p role="note" class="text-sm leading-snug text-base-content/85 px-1" data-test-backup-kept-note>
    <span class="font-semibold">Kept:</span> each character build the overwrite changes is saved first in
    <RouterLink to="/build-history" class="link font-semibold" data-test-backup-kept-note-link>Build history</RouterLink>
    ("Before a Settings import"), with its five echoes, to restore from there.
    <span class="font-semibold">Not kept:</span> your other echoes and your teams. Download a .json backup above first.
  </p>
</template>

<script setup lang="ts">
// Wuthering Tools+ — under Ryan's "This replaces all of your existing data — this can't be undone." in Settings › Backup
// & Restore (v3), one hook line in SettingsBackupRestore.vue. The import guard (importGuard.ts, installed by PlusShell)
// saves every character the import changes as a "Before a Settings import" version; echoes they don't wear and teams are
// not kept. 2026-11-02 core audit L3.
defineOptions({ name: "BackupKeptNote" });
</script>

<style scoped>
/* the app's global link colour (rgb 100 108 255) is 3.7 : 1 on the light card and 4.1 : 1 on the dark one: the link is
   the note's own text colour, told apart by its underline and weight */
.link {
  color: inherit;
}
</style>
