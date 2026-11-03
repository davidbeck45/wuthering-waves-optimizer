<template>
  <ul class="flex flex-col gap-3 min-w-0">
    <li
      v-for="group in groups"
      :key="group.base"
      class="flex flex-col gap-1 min-w-0"
      data-test-wavescan-new-only-group
      :data-base="group.base">
      <div class="text-sm font-semibold flex flex-wrap items-baseline gap-x-2">
        <span>{{ group.name }}</span>
        <span class="text-xs font-normal opacity-60">
          {{ group.cost }}-cost · {{ group.items.length }} {{ group.items.length === 1 ? "echo" : "echoes" }}
        </span>
      </div>
      <!-- a desktop: two or three cards a row (one 1,220 px card per line showed about 8 echoes a screen at 1440) -->
      <ul class="grid grid-cols-1 gap-1 min-w-0 lg:grid-cols-2 xl:grid-cols-3">
        <li
          v-for="row in group.items"
          :key="row.key"
          class="rounded-lg bg-base-100 px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0"
          data-test-wavescan-new-only-echo
          :data-echo="row.echo.echo">
          <div class="flex flex-wrap items-center gap-x-2 text-sm min-w-0">
            <span class="font-medium">{{ setName(row.echo.echoSet) }}</span>
            <span v-if="isSkin(String(row.echo.echo))" class="badge badge-sm badge-outline badge-secondary" data-test-wavescan-new-only-skin>
              Phantom skin
            </span>
            <span v-if="String(row.echo.rank) !== '5'" class="text-xs opacity-70">Rarity {{ row.echo.rank }}★</span>
          </div>
          <ul class="flex flex-wrap gap-x-3 text-xs min-w-0" aria-label="Main stat and substats">
            <!-- its own line: a flat substat beside it ("Crit DMG  ATK 40") read as a second main stat -->
            <li class="min-w-0 basis-full">
              <span class="opacity-70">Main stat</span>
              {{ " " }}
              <span class="font-semibold">{{ statName(row.echo.stat) }}</span>
            </li>
            <li v-for="(sub, index) in substatsOf(row.echo)" :key="index" class="min-w-0">
              <span class="opacity-70">{{ sub.label }}</span>
              {{ " " }}
              <span class="font-semibold tabular-nums whitespace-nowrap">{{ sub.value }}</span>
            </li>
          </ul>
          <p v-if="row.note" class="text-xs text-info">{{ row.note }}</p>
          <p v-if="row.worn" class="text-xs opacity-70">{{ row.worn }}</p>
        </li>
      </ul>
    </li>
  </ul>
</template>

<script setup lang="ts">
// Wuthering Tools+ — one list of the "add only new echoes" review: echoes grouped under their base echo (a Phantom
// skin sits under the echo it plays as, with a badge), each with its set, main stat and labelled substats.
import { isSkin, setName, statName, substatsOf, type EchoGroup, type ReviewRow } from "./newEchoes";

defineProps<{ groups: EchoGroup<ReviewRow>[] }>();
</script>
