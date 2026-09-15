<template>
  <div class="wt-account-bar flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-base-300 bg-base-100 text-sm" data-test-rankings-account-bar>
    <div class="join">
      <button type="button" class="btn btn-xs join-item" :class="isMine ? 'btn-primary' : 'btn-ghost border-base-300'" data-test-rankings-mine :title="mineTitle" @click="setMine(true)">
        My account
      </button>
      <button type="button" class="btn btn-xs join-item" :class="isMine ? 'btn-ghost border-base-300' : 'btn-primary'" data-test-rankings-riley @click="setMine(false)">
        Riley's tiers
      </button>
    </div>
    <label v-if="isMine" class="label cursor-pointer gap-1.5 py-0">
      <input type="checkbox" class="checkbox checkbox-xs" :checked="ownedOnly" data-test-rankings-owned-only @change="setOwnedOnly(($event.target as HTMLInputElement).checked)" />
      <span class="label-text text-xs">Teams I can field</span>
    </label>
    <span v-if="isMine" class="text-xs opacity-60" data-test-rankings-account-summary>
      {{ account.summary.owned }} of {{ account.summary.characters }} set up · {{ account.summary.s6 }} at S6 · 4★ and Rover forms count as owned
      <template v-if="!account.summary.owned"> · equip a weapon on a character to count it as owned</template>
    </span>
    <label class="flex items-center gap-1.5 text-xs">
      <span class="opacity-70">Substats</span>
      <select class="select select-bordered select-xs" :value="subsMode" :title="subsTitle" data-test-rankings-subs @change="setSubs(($event.target as HTMLSelectElement).value)">
        <option value="">ChemX32 (Riley's default)</option>
        <option value="h">High investment, everyone</option>
        <option value="m">My builds</option>
      </select>
    </label>
    <span v-if="subsMode === 'm'" class="text-xs opacity-60" data-test-rankings-subs-hint>{{ builtCount }} character{{ builtCount === 1 ? "" : "s" }} with echoes in the app; the rest run ChemX32</span>

    <div class="ml-auto flex items-center gap-1.5">
      <button type="button" class="btn btn-xs btn-ghost border-base-300" :disabled="syncing" :title="syncTitle" data-test-rankings-sync @click="sync">
        <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
        {{ syncing ? "Syncing…" : "Sync my teams" }}
      </button>
      <select class="select select-bordered select-xs max-w-56" :value="selectedView" data-test-rankings-views @change="applyView(($event.target as HTMLSelectElement).value)">
        <option value="">Saved views…</option>
        <option v-for="v in views" :key="v.name" :value="v.name">{{ v.name }}</option>
      </select>
      <template v-if="saving">
        <input v-model="newName" type="text" class="input input-bordered input-xs w-44" placeholder="name this view" data-test-rankings-view-name @keydown.enter.prevent="saveView" @keydown.escape.prevent="saving = false" />
        <button type="button" class="btn btn-primary btn-xs" :disabled="!newName.trim()" data-test-rankings-view-save @click="saveView">Save</button>
        <button type="button" class="btn btn-ghost btn-xs" @click="saving = false">Cancel</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-ghost btn-xs border-base-300" title="remember the current cost, filters and compares under a name" data-test-rankings-view-new @click="startSave">Save view</button>
        <button v-if="selectedView" type="button" class="btn btn-ghost btn-xs" title="forget this saved view" data-test-rankings-view-forget @click="forgetView">Forget</button>
      </template>
    </div>
  </div>
  <div v-if="report" class="px-3 py-2 border-b border-base-300 bg-base-200/60 text-sm" data-test-rankings-sync-report>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="font-semibold">Sync my teams</span>
      <span class="text-xs opacity-70">at your account's state · {{ report.updated }} updated · {{ report.unchanged }} unchanged · {{ report.skipped }} left alone<template v-if="report.failed"> · {{ report.failed }} failed</template></span>
      <span v-if="syncError" class="text-xs text-error">{{ syncError }}</span>
      <button type="button" class="btn btn-ghost btn-xs ml-auto" data-test-rankings-sync-close @click="report = null">Close</button>
    </div>
    <ul class="mt-1 grid gap-1">
      <li v-for="t in report.teams" :key="t.id" class="flex flex-wrap items-baseline gap-x-2" :data-test-rankings-sync-team="t.name" :data-test-rankings-sync-status="t.status">
        <span class="badge badge-xs" :class="badgeClass(t.status)">{{ t.status }}</span>
        <span class="font-medium">{{ t.name }}</span>
        <span v-if="t.newName" class="text-xs opacity-70">→ {{ t.newName }}</span>
        <span v-if="t.total" class="text-xs opacity-60 tabular-nums">Riley {{ Math.round(t.total).toLocaleString() }}</span>
        <span v-if="t.reason" class="text-xs opacity-70">{{ t.reason }}</span>
        <span v-if="t.deltas.length" class="text-xs opacity-80 w-full pl-2">
          <template v-for="(d, i) in t.deltas.slice(0, 12)" :key="i">
            <span class="tabular-nums">{{ d.characterId ? getCharacterRosterDisplayName(d.characterId) + " · " : "" }}{{ humanKey(d.key) }}{{ d.mainEcho ? ` (${d.mainEcho})` : "" }} {{ d.from }}→{{ d.to }}</span><span v-if="i < Math.min(t.deltas.length, 12) - 1"> · </span>
          </template>
          <span v-if="t.deltas.length > 12"> · +{{ t.deltas.length - 12 }} more</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+: the account-first controls above Riley's comparison page. Everything here is a
// URL-hash edit — his page owns the filter state and re-reads the hash (controller.ts
// onLocationChange) — so a saved view is just a named hash.
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import type { AccountState } from "../account/accountState";
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useToast } from "../../composables/useToast";
import { syncMyTeams } from "./controller";
import { humanKey, type SyncReport, type SyncStatus, type TeamLike } from "./syncTeams";

const props = defineProps<{ account: AccountState; builtCount?: number }>();
const route = useRoute();
const router = useRouter();

const VIEWS_KEY = "wtplus:rankings:views";
interface SavedView { name: string; hash: string }

const params = computed(() => new URLSearchParams((route.hash ?? "").replace(/^#/, "")));
const isMine = computed(() => params.value.get("tc") === "mine");
const ownedOnly = computed(() => params.value.get("own") !== "0");
// the spread every row wears (Riley's substats compare shows all three side by side; this runs one for everyone)
const subsMode = computed(() => params.value.get("sb") ?? "");
const subsTitle = "the substat spread every row runs: Riley's ChemX32 default, his High Invest spread for every member, or the echoes each character has equipped in the app";
const builtCount = computed(() => props.builtCount ?? 0);
function setSubs(code: string): void {
  const p = new URLSearchParams(params.value);
  if (code === "h" || code === "m") p.set("sb", code);
  else p.delete("sb");
  void go(p);
}
const mineTitle = computed(() => `every resonator at the sequence, weapon and refinement you have set up (${props.account.summary.owned} characters)`);

function readViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    const list = raw ? (JSON.parse(raw) as SavedView[]) : [];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.name === "string" && typeof v.hash === "string") : [];
  } catch {
    return [];
  }
}
const views = ref<SavedView[]>(readViews());
function writeViews(): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views.value));
  } catch {
    /* no storage */
  }
}
/** the current hash, without the detail page's own team parameter */
function currentHash(): string {
  const p = new URLSearchParams(params.value);
  p.delete("team");
  const text = p.toString();
  return text ? `#${text}` : "";
}
const selectedView = computed(() => views.value.find((v) => v.hash === currentHash())?.name ?? "");

async function go(p: URLSearchParams): Promise<void> {
  p.delete("team");
  const text = p.toString();
  await router.replace({ path: route.path, hash: text ? `#${text}` : "" });
}
function setMine(on: boolean): void {
  const p = new URLSearchParams(params.value);
  if (on) p.set("tc", "mine");
  else {
    p.delete("tc");
    p.delete("own");
  }
  void go(p);
}
function setOwnedOnly(on: boolean): void {
  const p = new URLSearchParams(params.value);
  if (on) p.delete("own");
  else p.set("own", "0");
  void go(p);
}

// ---- Sync my teams: every saved wuwa_calc team re-imported at the account's own state, in place
const teamStore = useTeamRotationsStore();
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: TeamLike[] } };
const syncing = ref(false);
const report = ref<SyncReport | null>(null);
const syncError = ref<string | null>(null);
const syncTitle = "re-import every saved wuwa_calc team (imports and presets) at your account's sequences, weapons and refinements, updating each in place; your own teams are left alone";
const badgeClass = (s: SyncStatus): string => (s === "updated" ? "badge-primary" : s === "unchanged" ? "badge-ghost" : s === "failed" ? "badge-error" : "badge-outline");
async function sync(): Promise<void> {
  if (syncing.value) return;
  syncing.value = true;
  syncError.value = null;
  const { showToast } = useToast();
  try {
    const snapshot: TeamLike[] = JSON.parse(JSON.stringify(teams.value ?? []));
    report.value = await syncMyTeams(snapshot);
    const r = report.value;
    showToast(`Sync my teams: ${r.updated} updated, ${r.unchanged} unchanged, ${r.skipped} left alone${r.failed ? `, ${r.failed} failed` : ""}.`, r.failed ? "warning" : "success", 7000);
  } catch (err) {
    syncError.value = err instanceof Error ? err.message : String(err);
    report.value ??= { at: new Date().toISOString(), cost: "mine", teams: [], updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    showToast(syncError.value, "error", 8000);
  } finally {
    syncing.value = false;
  }
}

const saving = ref(false);
const newName = ref("");
function startSave(): void {
  newName.value = "";
  saving.value = true;
}
function saveView(): void {
  const name = newName.value.trim();
  if (!name) return;
  const hash = currentHash();
  views.value = [...views.value.filter((v) => v.name !== name), { name, hash }].sort((a, b) => a.name.localeCompare(b.name));
  writeViews();
  saving.value = false;
}
function applyView(name: string): void {
  const v = views.value.find((x) => x.name === name);
  if (!v) return;
  void router.replace({ path: route.path, hash: v.hash });
}
function forgetView(): void {
  const name = selectedView.value;
  if (!name) return;
  views.value = views.value.filter((v) => v.name !== name);
  writeViews();
}
</script>
