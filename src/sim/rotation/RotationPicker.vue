<template>
  <div class="flex flex-col gap-6" data-test-rotation-picker>
    <div class="rounded-box bg-base-200/70 px-4 py-4 sm:px-5 sm:py-5">
      <h1 class="text-2xl font-bold">Rotation cue cards</h1>
      <p class="mt-1 max-w-3xl text-sm opacity-80">
        wuwa_calc's frame-timed rotation for a team at your account, one line per swap (BA×3 · E · R · Outro) with the moments your
        Liberation and Outro are ready. Practise it with a play-along timer, pop it out over the game, or open the fight timeline: who is on
        field, which buffs cover the burst, when a boss falls.
      </p>
      <div v-if="last" class="mt-3">
        <RouterLink :to="last.path" class="btn btn-sm btn-primary" data-test-rotation-continue>Continue: {{ last.title }}</RouterLink>
      </div>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-sm opacity-70" data-test-rotation-picker-loading>
      <span class="loading loading-spinner loading-sm"></span> Reading wuwa_calc's team list…
    </div>
    <div v-else-if="error" class="alert alert-error text-sm">
      <span>The rankings engine did not start: {{ error }}</span>
      <button type="button" class="btn btn-sm" data-test-rotation-picker-retry @click="emit('retry')">Retry</button>
    </div>

    <section v-if="!loading && !error">
      <div class="flex flex-wrap items-baseline gap-x-3 mb-2">
        <h2 class="text-lg font-bold">Your teams</h2>
        <span class="text-sm opacity-60">{{ mine.length ? `${mine.length} that wuwa_calc can run` : "" }}</span>
      </div>
      <p v-if="!mine.length" class="text-sm opacity-70" data-test-rotation-picker-no-teams>
        None of your saved teams is a composition wuwa_calc has. Import one from
        <RouterLink to="/rankings" class="link link-primary">Team rankings</RouterLink> or pick a stock team below.
      </p>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <TeamTile v-for="t in mine" :key="t.id" :entry="t" data-test-rotation-picker-team />
      </div>
    </section>

    <section v-if="!loading && !error">
      <div class="flex flex-wrap items-center gap-3 mb-2">
        <h2 class="text-lg font-bold">Stock teams</h2>
        <span class="text-sm opacity-60">the compositions of the bundled wuwa_calc presets, run at your account</span>
        <input v-model="query" type="search" class="input input-bordered input-sm w-full sm:w-56 sm:ml-auto" placeholder="Filter by character" aria-label="Filter stock teams by character" data-test-rotation-picker-search />
      </div>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <TeamTile v-for="t in shownStock" :key="t.id" :entry="t" data-test-rotation-picker-stock />
      </div>
      <p v-if="!filteredStock.length" class="text-sm opacity-70">No stock team with “{{ query }}”.</p>
      <button v-if="filteredStock.length > shownStock.length" type="button" class="btn btn-sm btn-ghost mt-2" data-test-rotation-picker-all @click="showAll = true">Show all {{ filteredStock.length }}</button>
      <p class="mt-3 text-xs opacity-60">
        Any other team: open its detail page on <RouterLink to="/rankings" class="link">Team rankings</RouterLink> and press <b>Rotation</b>.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, shallowRef, type PropType } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import type { RileyTeamInfo } from "../engine/rileyRun";
import { loadWuwaCalcTeamPresets } from "../presets";
import { isGeneratedTeamName } from "../rankings/importFromRankings";
import { rileyTeamKeysFor } from "../rankings/syncTeams";
import { rotationPath } from "./hash";
import MemberAvatar from "./MemberAvatar.vue";

interface Entry {
  id: string;
  title: string;
  subtitle: string;
  chars: string[];
  badge?: string;
}

const props = defineProps<{ teams: RileyTeamInfo[]; blocked: string[]; loading: boolean; error: string | null; hues: Map<string, string>; last: { path: string; title: string } | null }>();
const emit = defineEmits<{ retry: [] }>();

const byKey = computed(() => Object.fromEntries(props.teams.map((t) => [t.key, t.members])));
const rileyName = computed(() => {
  const map = new Map<string, string>();
  for (const t of props.teams) for (const m of t.members) map.set(m.appKey, m.name);
  return map;
});
const runnable = (chars: Array<string | null>): boolean =>
  chars.length === 3 && chars.every((c): c is string => !!c && !props.blocked.includes(c)) && rileyTeamKeysFor(chars, byKey.value).length > 0;
const nameOf = (key: string): string => getCharacterRosterDisplayName(key);
const titleOf = (chars: string[]): string => `${nameOf(chars[0]!)} · ${chars.slice(1).map(nameOf).join(" + ")}`;

const teamStore = useTeamRotationsStore();
const { teams: saved } = storeToRefs(teamStore) as unknown as { teams: { value: Array<{ id: string; name: string; characterIds: Array<string | null> }> } };
const mine = computed<Entry[]>(() =>
  (saved.value ?? [])
    .filter((t) => runnable(t.characterIds ?? []))
    .map((t) => ({ id: t.id, title: t.name, subtitle: titleOf(t.characterIds as string[]), chars: t.characterIds as string[], ...(isGeneratedTeamName(t.name) ? { badge: "synced" } : {}) })),
);

const stock = shallowRef<Entry[]>([]);
onMounted(async () => {
  try {
    const presets = await loadWuwaCalcTeamPresets();
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const p of presets) {
      const chars = (p.data?.characterIds ?? []) as Array<string | null>;
      if (chars.length !== 3 || chars.some((c) => !c)) continue;
      const id = [...chars].sort().join("+");
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, title: titleOf(chars as string[]), subtitle: "", chars: chars as string[] });
    }
    stock.value = out;
  } catch {
    stock.value = [];
  }
});
const query = ref("");
const showAll = ref(false);
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const filteredStock = computed(() => {
  const q = norm(query.value);
  return stock.value.filter((e) => runnable(e.chars) && (!q || e.chars.some((c) => norm(nameOf(c)).includes(q) || norm(c).includes(q))));
});
const shownStock = computed(() => (showAll.value || query.value ? filteredStock.value : filteredStock.value.slice(0, 18)));

const TeamTile = defineComponent({
  props: { entry: { type: Object as PropType<Entry>, required: true } },
  setup(p) {
    const hue = (c: string): string => props.hues.get(rileyName.value.get(c) ?? c) ?? "";
    return () =>
      h("div", { class: "flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 px-3 py-2.5 min-w-0" }, [
        h("div", { class: "flex items-center gap-3 min-w-0" }, [
          h(
            "div",
            { class: "flex -space-x-2 shrink-0" },
            p.entry.chars.map((c) => h(MemberAvatar, { key: c, appKey: c, name: nameOf(c), hue: hue(c), size: 30 })),
          ),
          h("div", { class: "min-w-0 flex-1" }, [
            h("div", { class: "font-semibold text-sm leading-snug line-clamp-2 break-words", title: p.entry.title }, p.entry.title),
            p.entry.subtitle ? h("div", { class: "text-xs opacity-60 truncate", title: p.entry.subtitle }, p.entry.subtitle) : null,
          ]),
        ]),
        h("div", { class: "flex items-center gap-1.5" }, [
          p.entry.badge ? h("span", { class: "badge badge-sm badge-ghost" }, p.entry.badge) : null,
          h("span", { class: "flex-1" }),
          h(RouterLink, { to: rotationPath({ kind: "chars", chars: p.entry.chars }), class: "btn btn-xs btn-primary", "data-test-rotation-open-cue": "" }, () => "Cue card"),
          h(RouterLink, { to: rotationPath({ kind: "chars", chars: p.entry.chars }, { tab: "timeline" }), class: "btn btn-xs", "data-test-rotation-open-timeline": "" }, () => "Timeline"),
        ]),
      ]);
  },
});
</script>
