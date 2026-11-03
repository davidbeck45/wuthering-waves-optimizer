<template>
  <section
    class="bg-base-200 rounded-xl p-4 flex flex-col gap-3 min-w-0"
    :data-wt-fold-upstream="foldUpstream ? '' : undefined"
    data-test-wavescan-new-only>
    <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">Add only new echoes</div>
    <p class="text-sm opacity-80 max-w-2xl">
      Compares this scan with your inventory and adds only the echoes you don't have yet. A Phantom skin counts as
      its base echo, and copies are counted: two scanned copies against one you own add one.
    </p>

    <p v-if="!mapped.echoes.length" class="text-sm" data-test-wavescan-new-only-empty>
      This file has no echoes the site can read, so there's nothing to compare.
    </p>
    <template v-else>
      <ul class="grid grid-cols-1 sm:grid-cols-3 gap-2" data-test-wavescan-new-only-summary>
        <li
          v-for="tile in tiles"
          :key="tile.id"
          class="rounded-lg bg-base-100 px-3 py-2 flex sm:flex-col items-baseline gap-x-3 min-w-0"
          :data-test-wavescan-new-only-count="tile.id">
          <span class="text-2xl font-bold tabular-nums" :class="tile.tone">{{ tile.count }}</span>
          {{ " " }}
          <span class="text-sm min-w-0">
            <span class="font-semibold">{{ tile.label }}</span>
            <span class="opacity-70"> · {{ tile.action }}</span>
          </span>
        </li>
      </ul>

      <div role="note" class="text-sm flex flex-col gap-1 max-w-2xl" data-test-wavescan-new-only-note>
        <p>
          <span class="font-semibold">Who wears what doesn't change.</span>
          New echoes go into your inventory unequipped<template v-if="wornNewCount">, including the
          {{ wornNewCount }} the scan saw on a character</template>. Nothing is removed from your inventory.
        </p>
        <p v-if="secondCopies" class="opacity-80" data-test-wavescan-new-only-upstream>
          The full import below matches echo names exactly, so it would add {{ pluralEchoes(secondCopies) }} counted
          here as owned a second time: Phantom skins stored the other way round, and close matches.
        </p>
        <p v-if="mapped.skipped.length" class="text-warning">
          {{ pluralEchoes(mapped.skipped.length) }} in the file couldn't be read and aren't counted here (they're listed
          under Echoes below).
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="!plan.toAdd.length || isAdding"
          data-test-wavescan-new-only-add
          @click="addNew">
          {{ plan.toAdd.length ? `Add ${pluralEchoes(plan.toAdd.length)} to my inventory` : "Nothing new to add" }}
        </button>
        <span v-if="addedCount !== null" class="text-sm text-success" data-test-wavescan-new-only-done>
          Added {{ pluralEchoes(addedCount) }}.
        </span>
      </div>
      <!-- the Echoes section under this card still reads "37 echoes ready to import": say it has nothing left to add -->
      <p v-if="addedCount !== null && !plan.toAdd.length && !secondCopies" class="text-sm max-w-2xl" data-test-wavescan-new-only-after>
        Every echo in this scan is in your inventory now, so the Echoes import below has nothing new to add.
      </p>

      <details
        v-for="list in lists"
        :key="list.id"
        class="rounded-lg border border-base-300 px-2 sm:px-3 py-2 min-w-0"
        :open="open[list.id]"
        :data-test-wavescan-new-only-list="list.id"
        @toggle="onToggle(list.id, $event)">
        <summary class="cursor-pointer text-sm font-semibold">
          {{ list.title }} ({{ list.count }})
        </summary>
        <div v-if="open[list.id]" class="pt-2 flex flex-col gap-2 min-w-0">
          <p class="text-xs opacity-70">{{ list.intro }}</p>
          <p v-if="!list.count" class="text-sm opacity-70">None.</p>
          <WavescanEchoGroups v-else :groups="list.groups" />
        </div>
      </details>
    </template>

    <!-- the full import (the next card, SettingsWavescan.vue) folds away once it would only duplicate: the style below -->
    <div v-if="foldable" class="flex flex-col gap-1 border-t border-base-300 pt-3" data-test-wavescan-new-only-other>
      <p class="text-xs text-base-content/80 max-w-2xl" data-test-wavescan-new-only-other-why>{{ foldReason }}</p>
      <button
        type="button"
        class="btn btn-sm btn-ghost h-auto min-h-10 py-1.5 -ml-2 self-start flex-nowrap justify-start gap-2 text-left text-sm font-semibold normal-case"
        :aria-expanded="upstreamShown ? 'true' : 'false'"
        data-test-wavescan-new-only-other-toggle
        @click="upstreamShown = !upstreamShown">
        <svg viewBox="0 0 20 20" class="size-4 shrink-0 transition-transform" :class="{ 'rotate-90': upstreamShown }" fill="currentColor" aria-hidden="true">
          <path d="M7.2 4.2a1 1 0 0 1 1.4 0l5.1 5.1a1 1 0 0 1 0 1.4l-5.1 5.1a1 1 0 1 1-1.4-1.4L11.6 10 7.2 5.6a1 1 0 0 1 0-1.4Z" />
        </svg>
        <span class="min-w-0">{{ upstreamShown ? "Hide the other import options" : "Other import options: equip the scanned loadouts, replace my inventory" }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — "add only new echoes" for a Wavescan file (README "WaveScan: add only new echoes"). Hooked into
// Ryan's SettingsWavescan.vue (one async-component line) once his panel has read and validated the file; it gets his
// mapped rows and saves the new ones through the inventory store's `saveEcho`, the same call his import makes. It never
// touches who wears what, and never deletes.
import { computed, reactive, ref } from "vue";
import { useInventoryStore } from "../../stores/inventory";
import { useToast } from "../../composables/useToast";
import { useConfirm } from "../../composables/useConfirm";
import { pluralEchoes } from "../../composables/useWavescanLoadouts";
import { randomString } from "../../utils/strings";
import type { WavescanEchoMapResult } from "../../wavescan/echoes";
import { characterDisplayName } from "../display/names";
import WavescanEchoGroups from "./WavescanEchoGroups.vue";
import { groupByBaseEcho, matchNote, planNewEchoes, secondCopiesUpstreamWouldAdd, type EchoRow, type ReviewRow } from "./newEchoes";

const props = defineProps<{ mapped: WavescanEchoMapResult }>();

const inventoryStore = useInventoryStore();
const { showToast } = useToast();
const { confirm } = useConfirm();

const inventory = computed<EchoRow[]>(() => (inventoryStore.echoes ?? []) as EchoRow[]);
const plan = computed(() => planNewEchoes(props.mapped.echoes, inventory.value));

const wearerName = (key: string): string => characterDisplayName(key) || key;
const wornInGame = (echoId: string): string | null => {
  const wearer = props.mapped.equippedBy[echoId];
  return wearer ? `Worn by ${wearerName(wearer)} in game. Added unequipped.` : null;
};
const equippedHere = (echoId: string): string | null => {
  const wearers = Object.keys((inventoryStore.equipped ?? {})[echoId] ?? {});
  return wearers.length ? `Equipped on ${wearers.map(wearerName).join(", ")} here. Stays equipped.` : null;
};

const wornNewCount = computed(() => plan.value.toAdd.filter((echo) => props.mapped.equippedBy[echo.echoId]).length);
const secondCopies = computed(() => secondCopiesUpstreamWouldAdd(plan.value.owned));

const tiles = computed(() => [
  { id: "new", count: plan.value.toAdd.length, label: "New", action: "will be added", tone: "text-primary" },
  { id: "owned", count: plan.value.owned.length, label: "Already in your inventory", action: "skipped", tone: "" },
  { id: "missing", count: plan.value.notInScan.length, label: "Only in your inventory", action: "kept, never deleted", tone: "" },
]);

type ListId = "new" | "owned" | "missing";
const open = reactive<Record<ListId, boolean>>({ new: true, owned: false, missing: false });
function onToggle(id: ListId, event: Event) {
  open[id] = (event.target as HTMLDetailsElement).open;
}

const byBase = (rows: ReviewRow[]) => groupByBaseEcho(rows, (row) => row.echo);
const lists = computed(() => {
  const { toAdd, owned, notInScan } = plan.value;
  return [
    {
      id: "new" as const,
      title: "New echoes",
      count: toAdd.length,
      intro: "Not in your inventory yet. These are added.",
      groups: byBase(toAdd.map((echo) => ({ key: echo.echoId, echo, note: null, worn: wornInGame(echo.echoId) }))),
    },
    {
      id: "owned" as const,
      title: "Already in your inventory",
      count: owned.length,
      intro: "Each matched one echo you own, so they're skipped. A note says when your copy is stored a little differently.",
      groups: byBase(owned.map((match) => ({ key: match.scanned.echoId, echo: match.scanned, note: matchNote(match), worn: null }))),
    },
    {
      id: "missing" as const,
      title: "In your inventory, not in this scan",
      count: notInScan.length,
      intro: "Fed, sold, or not scanned. Listed for information only: nothing is deleted.",
      groups: byBase(notInScan.map((echo) => ({ key: echo.echoId, echo, note: null, worn: equippedHere(echo.echoId) }))),
    },
  ];
});

const isAdding = ref(false);
const addedCount = ref<number | null>(null);

// Ryan's full import (his Echoes card right below: Add / Replace and the scanned loadouts) folds away once it would only
// duplicate: after this card's add, or when it would add second copies of echoes counted here as owned. One tap opens it
// again; it is still the way to equip the loadouts Wavescan saw or to replace the inventory. 2026-11-02 core audit L4.
const upstreamShown = ref(false);
const foldable = computed(() => addedCount.value !== null || secondCopies.value > 0);
const foldUpstream = computed(() => foldable.value && !upstreamShown.value);
const foldReason = computed(() =>
  secondCopies.value > 0
    ? `The full import is folded away: it matches echo names exactly, so it would add ${pluralEchoes(secondCopies.value)} you already own as second copies.`
    : "The full import is folded away: your new echoes are in, so it would add nothing more.",
);

async function addNew() {
  if (!plan.value.toAdd.length || isAdding.value) return;
  // the add has no undo, so it asks once more (the button sits right above the lists a phone scrolls through)
  const { toAdd, owned, notInScan } = plan.value;
  const items = [`Add ${pluralEchoes(toAdd.length)}, unequipped`];
  if (owned.length) items.push(`Skip ${pluralEchoes(owned.length)} already in your inventory`);
  if (notInScan.length) items.push(`Keep the ${pluralEchoes(notInScan.length)} only in your inventory`);
  const confirmed = await confirm("Who wears what doesn't change, and nothing is removed.", {
    title: `Add ${pluralEchoes(toAdd.length)} to your inventory?`,
    items,
    confirmLabel: `Add ${pluralEchoes(toAdd.length)}`,
  });
  if (!confirmed) return;
  const echoes = plan.value.toAdd;
  if (!echoes.length || isAdding.value) return;
  isAdding.value = true;
  try {
    const ownedBefore = plan.value.owned.length;
    // Ryan's mapper picked ids free when the file was read; re-check, because saveEcho overwrites an echo with the same id
    const taken = new Set(inventory.value.map((echo) => echo.echoId));
    for (const echo of echoes) {
      let echoId = echo.echoId;
      while (taken.has(echoId)) echoId = randomString();
      taken.add(echoId);
      await inventoryStore.saveEcho({ ...echo, echoId });
    }
    addedCount.value = echoes.length;
    showToast(
      `Added ${pluralEchoes(echoes.length)} to your inventory${ownedBefore ? `; ${ownedBefore} were already there` : ""}.`,
      "success",
    );
  } catch (e) {
    showToast(`Couldn't add the echoes: ${e}`, "error");
  } finally {
    isAdding.value = false;
  }
}
</script>

<style>
/* Folds Ryan's Echoes card, the element right after this card in SettingsWavescan.vue (see foldUpstream) */
[data-test-wavescan-new-only][data-wt-fold-upstream] + [data-test-wavescan-echoes] {
  display: none;
}
</style>
