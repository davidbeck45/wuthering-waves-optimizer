<template>
  <section class="rounded-box border border-base-300 bg-base-100" data-test-echo-plan-roster>
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3 text-left max-sm:px-3"
      :aria-expanded="open"
      data-test-echo-plan-roster-toggle
      @click="open = !open">
      <div class="flex -space-x-2">
        <img
          v-for="(r, i) in included.slice(0, 5)"
          :key="r.key"
          :class="i >= 3 ? 'max-sm:hidden' : ''"
          :src="characterPortraitUrl(r.key)"
          alt=""
          class="size-7 rounded-full border-2 border-base-100 bg-base-300 object-cover"
          loading="lazy" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="font-semibold leading-tight">Characters in the plan</div>
        <div class="truncate text-xs opacity-65">
          {{ owned }} owned<template v-if="planned"> · {{ planned }} planned</template>
          <template v-if="excluded"> · {{ excluded }} left out</template>
          <template v-if="defaults"> · <span class="ep-text-changed font-semibold">{{ defaults }} on kit defaults</span></template>
        </div>
      </div>
      <svg viewBox="0 0 20 20" class="size-4 shrink-0 opacity-60 transition-transform" :class="open ? 'rotate-180' : ''" fill="currentColor" aria-hidden="true">
        <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
      </svg>
    </button>

    <div v-if="open" class="border-t border-base-300 px-4 pt-3 pb-4 max-sm:px-3">
      <p class="mb-3 text-xs opacity-70">
        Owned means a weapon equipped in the calculator. Each character brings what they wear now, their saved builds, the
        curated presets and wuwa_calc's loadouts (the sources you switch on above). Untick someone to leave them out.
      </p>
      <ul v-if="roster.length" class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <li
          v-for="r in roster"
          :key="r.key"
          class="flex min-w-0 items-start gap-2.5 rounded-lg border border-base-300 px-2.5 py-2"
          :class="r.excluded ? 'opacity-55' : ''"
          :data-test-echo-plan-roster-entry="r.key">
          <input
            type="checkbox"
            class="checkbox checkbox-sm mt-1.5"
            :checked="!r.excluded"
            :aria-label="`Count ${characterName(r.key)} in the plan`"
            :data-test-echo-plan-include="r.key"
            @change="emit('toggle-excluded', r.key)" />
          <img :src="characterPortraitUrl(r.key)" alt="" class="size-9 shrink-0 rounded-full bg-base-300 object-cover" loading="lazy" />
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <span class="truncate font-semibold">{{ characterName(r.key) }}</span>
              <span v-if="r.planned" class="ep-badge ep-badge--new">Planned</span>
              <span v-if="r.usesDefault" class="ep-badge ep-badge--changed" title="No build, preset or wuwa_calc loadout: a default from their element and role (healer, the stat they scale on) — check it">Kit default</span>
            </div>
            <div class="truncate text-xs opacity-65" :title="`${r.sets.length} Sonata${r.sets.length === 1 ? '' : 's'}`">{{ sourceLine(r) }}</div>
            <div class="mt-1 flex flex-wrap gap-1">
              <img
                v-for="set in r.sets.slice(0, 8)"
                :key="set"
                :src="sonataByKey(set)?.icon ?? ''"
                :alt="sonataByKey(set)?.name ?? set"
                :title="sonataByKey(set)?.name ?? set"
                class="size-5 rounded bg-base-200"
                loading="lazy" />
              <span v-if="r.sets.length > 8" class="text-xs opacity-60">+{{ r.sets.length - 8 }}</span>
            </div>
          </div>
          <button
            v-if="r.planned"
            type="button"
            class="btn btn-ghost btn-xs btn-square shrink-0"
            :aria-label="`Remove ${characterName(r.key)} from planned`"
            :data-test-echo-plan-unplan="r.key"
            @click="emit('remove', r.key)">
            ✕
          </button>
        </li>
      </ul>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label class="text-sm font-semibold" for="echo-plan-add">Planning to pull or build someone?</label>
        <select
          id="echo-plan-add"
          ref="picker"
          class="select select-bordered select-sm w-full max-w-xs"
          :value="''"
          data-test-echo-plan-add
          @change="onAdd">
          <option value="" disabled>Add a planned character…</option>
          <optgroup v-if="unarmedOptions.length" label="In your calculator, no weapon yet">
            <option v-for="c in unarmedOptions" :key="c.key" :value="c.key">{{ c.name }}</option>
          </optgroup>
          <optgroup label="Released characters">
            <option v-for="c in otherOptions" :key="c.key" :value="c.key">{{ c.name }}</option>
          </optgroup>
        </select>
        <span v-if="!includePlanned && planned" class="text-xs ep-text-changed">Planned characters are switched off above.</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ /echo-plan — the characters the plan is built for: owned ones (a weapon equipped) and the ones the
// player plans to pull or build, each with the sources that put Sonatas on the plan, and a way to leave one out.
import { computed, nextTick, ref } from "vue";
import { sonataByKey } from "./catalog";
import { characterName, characterPortraitUrl, releasedCharacters } from "./names";
import type { RosterEntry } from "./wants";

const props = defineProps<{
  roster: RosterEntry[];
  ownedKeys: string[];
  plannedKeys: string[];
  unarmedKeys: string[];
  includePlanned: boolean;
}>();
const emit = defineEmits<{ (e: "add", key: string): void; (e: "remove", key: string): void; (e: "toggle-excluded", key: string): void }>();

const open = ref(false);
const picker = ref<HTMLSelectElement | null>(null);

const included = computed(() => props.roster.filter((r) => !r.excluded));
const owned = computed(() => props.roster.filter((r) => r.owned).length);
const planned = computed(() => props.plannedKeys.length);
const excluded = computed(() => props.roster.filter((r) => r.excluded).length);
const defaults = computed(() => props.roster.filter((r) => r.usesDefault && !r.excluded).length);

const taken = computed(() => new Set([...props.ownedKeys, ...props.plannedKeys]));
const released = releasedCharacters();
const unarmedOptions = computed(() => released.filter((c) => props.unarmedKeys.includes(c.key) && !taken.value.has(c.key)));
const otherOptions = computed(() => released.filter((c) => !taken.value.has(c.key) && !props.unarmedKeys.includes(c.key)));

function sourceLine(r: RosterEntry): string {
  const c = r.counts;
  const parts: string[] = [];
  if (c.equipped) parts.push("wears");
  if (c.build) parts.push("builds");
  if (c.preset) parts.push("presets");
  if (c.engine) parts.push("wuwa_calc");
  if (c.default) parts.push("kit default");
  return parts.join(" · ") || "nothing yet";
}

function onAdd(e: Event): void {
  const el = e.target as HTMLSelectElement;
  if (el.value) emit("add", el.value);
  el.value = "";
}

/** Opens the panel and focuses the planned-character picker (the empty state's call to action). */
async function focusPicker(): Promise<void> {
  open.value = true;
  await nextTick();
  picker.value?.focus();
  picker.value?.scrollIntoView({ block: "center", behavior: "smooth" });
}

defineExpose({ focusPicker });
</script>
