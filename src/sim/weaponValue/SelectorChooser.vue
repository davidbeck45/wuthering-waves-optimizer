<template>
  <section class="sc" data-test-weapons-selector>
    <div class="sc-pools" role="radiogroup" aria-label="Selector">
      <button
        v-for="p in poolCards"
        :key="p.id"
        type="button"
        role="radio"
        class="sc-pool"
        :class="{ 'sc-pool--on': pool === p.id }"
        :aria-checked="pool === p.id"
        :data-test-weapons-pool="p.id"
        @click="emit('update:pool', p.id)">
        <span class="sc-pool__title">
          {{ p.title }}
          <span v-if="p.unverified" class="sc-badge sc-badge--warn" title="Reported by players, not in Kuro's text news">check in game</span>
        </span>
        <span class="sc-pool__sub">{{ p.subtitle }}</span>
        <span class="sc-pool__faces" aria-hidden="true">
          <template v-for="k in p.preview" :key="k">
            <WeaponIcon v-if="p.kind === 'weapon'" :weapon-key="k" :size="22" title="" />
            <CharacterAvatar v-else :id="k" :size="22" title="" />
          </template>
          <span v-if="p.more" class="sc-pool__more">+{{ p.more }}</span>
        </span>
      </button>
    </div>

    <div class="sc-panel">
      <div class="sc-panel__head">
        <div class="sc-panel__title">
          <h2 class="sc-h2">{{ current.title }}</h2>
          <p class="sc-src" data-test-weapons-pool-source>
            <template v-if="current.id === CUSTOM_POOL_ID">Pick the resonators your in-game selector offers (released ones only).</template>
            <template v-else>
              Selector list for {{ current.version }}, last checked {{ POOLS.checked }} ·
              <a :href="current.sourceUrl" target="_blank" rel="noopener noreferrer" class="link" :title="current.source">source</a>
              <span v-if="!current.verified" class="sc-warn"> · reported by players — check the pick in game</span>
            </template>
          </p>
        </div>
        <label class="sc-sort">
          <span>Rank by</span>
          <select v-model="sortBy" class="select select-bordered select-xs" data-test-weapons-selector-sort>
            <option value="uplift">Team uplift</option>
            <option v-if="current.kind === 'resonator'" value="new">New teams</option>
            <option v-else value="own">Best own gain</option>
            <option value="dupe">Dupe value</option>
          </select>
        </label>
      </div>

      <!-- the options this selector offers: untick the ones your copy of it does not -->
      <div class="sc-items" role="group" aria-label="Options">
        <button
          v-for="k in poolItems"
          :key="k"
          type="button"
          class="sc-item"
          :class="{ 'sc-item--off': excluded.has(k) }"
          :aria-pressed="!excluded.has(k)"
          :title="excluded.has(k) ? 'Left out — click to include' : 'Included — click to leave out (not in your selector)'"
          :data-test-weapons-pool-item="k"
          @click="toggleItem(k)">
          <WeaponIcon v-if="current.kind === 'weapon'" :weapon-key="k" :size="20" title="" />
          <CharacterAvatar v-else :id="k" :size="20" title="" />
          <span>{{ itemName(k) }}</span>
          <span v-if="current.id === CUSTOM_POOL_ID" class="sc-item__x" aria-label="Remove" @click.stop="removeCustom(k)">✕</span>
        </button>
        <div v-if="current.id === CUSTOM_POOL_ID" class="sc-add">
          <input
            v-model="customQuery"
            type="search"
            placeholder="Add a resonator…"
            aria-label="Add a resonator to this pick"
            autocomplete="off"
            class="input input-bordered input-xs"
            data-test-weapons-custom-input
            @keydown.enter.prevent="addCustom(suggestions[0]?.key)" />
          <div v-if="suggestions.length" class="sc-suggest" role="listbox" aria-label="Matching resonators">
            <button v-for="c in suggestions" :key="c.key" type="button" role="option" class="sc-suggest__item" :data-test-weapons-custom-suggestion="c.key" @click="addCustom(c.key)">
              <CharacterAvatar :id="c.key" :size="18" title="" />
              {{ c.name }}
            </button>
          </div>
          <span v-else-if="customQuery.trim()" class="sc-suggest__none">No released resonator by that name</span>
        </div>
      </div>

      <!-- resonator pools run wuwa_calc on demand -->
      <div v-if="current.kind === 'resonator'" class="sc-run">
        <template v-if="runState === 'running'">
          <span class="sc-progress"><span :style="{ width: `${progress.total ? (progress.done / progress.total) * 100 : 3}%` }"></span></span>
          <span class="sc-run__text" data-test-weapons-selector-progress>Solving {{ progressLabel }} · {{ progress.done }} / {{ progress.total || "…" }} teams</span>
          <button type="button" class="btn btn-xs" data-test-weapons-selector-cancel @click="cancel">Cancel</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-sm btn-primary" :disabled="!included.length || !ranking" data-test-weapons-selector-run @click="run(false)">
            {{ resonatorRows ? "Rank again" : `Rank ${included.length} option${included.length === 1 ? "" : "s"}` }}
          </button>
          <span class="sc-run__text">
            {{ !ranking ? "Waiting for your roster ranking…" : resonatorRows ? `Ranked ${ago(resonatorComputedAt ?? "")}${restored ? " (kept for this tab)" : ""}` : "wuwa_calc solves every team each option can join at your account — about a second per option, more for a first run." }}
          </span>
        </template>
        <span v-if="runError" class="sc-run__error" role="alert">{{ runError }}</span>
      </div>
      <div v-else-if="!value" class="sc-run">
        <span class="sc-progress"><span style="width: 30%"></span></span>
        <span class="sc-run__text">Waiting for the weapon scores on the Signatures tab{{ running ? "…" : "" }}</span>
      </div>

      <!-- ===================================================== ranked options -->
      <ol v-if="current.kind === 'weapon' && weaponRows.length" class="sc-list" data-test-weapons-selector-list>
        <li v-for="(w, i) in weaponRows" :key="w.key" class="sc-row" :data-test-weapons-pick="w.key" :class="{ 'sc-row--open': openKey === w.key }">
          <button type="button" class="sc-row__btn" :aria-expanded="openKey === w.key" @click="openKey = openKey === w.key ? null : w.key">
            <span class="sc-rank">{{ i + 1 }}</span>
            <span class="sc-who">
              <WeaponIcon :weapon-key="w.key" :size="38" title="" />
              <span class="sc-who__text">
                <span class="sc-who__name">{{ weaponDisplayName(w.key) }}</span>
                <span class="sc-who__sub">{{ typeLabel(w.type) }}{{ w.wornBy.length ? ` · worn by ${w.wornBy.map(characterShortName).join(", ")}` : "" }}</span>
              </span>
            </span>
            <span class="sc-metric">
              <span class="sc-metric__label">Team uplift</span>
              <span class="sc-metric__value" :class="cls(w.best?.value)">{{ w.best ? pctFine(w.best.value) : "—" }}</span>
              <span class="sc-metric__sub">{{ w.best ? `${characterShortName(w.best.characterId)} · ${w.best.scope}${w.best.kind === "dupe" ? " · dupe" : ""}` : w.status === "no-wielder" ? "nobody set up uses the type" : "" }}</span>
            </span>
            <span class="sc-metric">
              <span class="sc-metric__label">Best own gain</span>
              <span class="sc-metric__value" :class="cls(w.bestOwn?.gain)">{{ w.bestOwn ? pctFine(w.bestOwn.gain) : "—" }}</span>
              <span class="sc-metric__sub">{{ w.bestOwn ? `${characterShortName(w.bestOwn.characterId)} · own rotation` : "" }}</span>
            </span>
            <span class="sc-metric">
              <span class="sc-metric__label">Dupe value</span>
              <span class="sc-metric__value" :class="cls(w.dupe?.value)">{{ w.dupe ? pctFine(w.dupe.value) : "—" }}</span>
              <span class="sc-metric__sub">{{ w.dupe ? `${characterShortName(w.dupe.characterId)} R${w.dupe.option!.refinement - 1}→R${w.dupe.option!.refinement}` : w.uses.some((u) => u.kind === "maxed") ? "worn at R5" : w.wornBy.length ? "no figure for its wearer" : "not worn" }}</span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sc-chev" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <div v-if="openKey === w.key" class="sc-detail">
            <p class="sc-detail__lead">Every set-up {{ typeLabel(w.type).toLowerCase() }} user, on their own best rotation and their strongest team (this app's engine):</p>
            <ul class="sc-uses">
              <li v-for="u in w.uses" :key="u.characterId">
                <CharacterAvatar :id="u.characterId" :size="24" title="" />
                <span class="sc-uses__name">{{ characterShortName(u.characterId) }}</span>
                <span class="sc-uses__what">{{ u.kind === "maxed" ? "wears it at R5" : u.kind === "dupe" ? `wears it · R${u.option!.refinement - 1} → R${u.option!.refinement}` : `from ${heldOf(u.characterId)}` }}</span>
                <span v-if="u.option" class="sc-uses__num">own <b :class="cls(u.option.gain)">{{ pctFine(u.option.gain) }}</b><template v-if="u.option.low"> (stats only {{ pctFine(u.option.low.gain) }})</template></span>
                <span v-if="u.option" class="sc-uses__num">team <b :class="cls(u.option.team?.gain)">{{ u.option.team ? pctFine(u.option.team.gain) : "—" }}</b></span>
              </li>
            </ul>
          </div>
        </li>
      </ol>

      <ol v-if="current.kind === 'resonator' && sortedResonators.length" class="sc-list" data-test-weapons-selector-list>
        <li v-for="(r, i) in sortedResonators" :key="r.key" class="sc-row" :data-test-weapons-pick="r.key" :data-status="r.status" :class="{ 'sc-row--open': openKey === r.key }">
          <button type="button" class="sc-row__btn" :aria-expanded="openKey === r.key" @click="openKey = openKey === r.key ? null : r.key">
            <span class="sc-rank">{{ i + 1 }}</span>
            <span class="sc-who">
              <CharacterAvatar :id="r.key" :size="38" dot title="" />
              <span class="sc-who__text">
                <span class="sc-who__name">{{ characterShortName(r.key) }}</span>
                <span class="sc-who__sub">
                  <span class="sc-badge" :class="`sc-badge--${r.status}`">{{ STATUS[r.status] }}{{ r.status === "owned" || r.status === "maxed" ? ` S${r.sequence ?? 6}` : "" }}</span>
                  <template v-if="r.ran && r.status === 'new'"> S{{ r.ran.sequence }} · {{ r.ran.weapon }} R{{ r.ran.refinement }}</template>
                </span>
              </span>
            </span>
            <span class="sc-metric">
              <span class="sc-metric__label">Team uplift</span>
              <span class="sc-metric__value" :class="cls(r.uplift?.gain)">{{ r.uplift ? pctFine(r.uplift.gain) : "—" }}</span>
              <span class="sc-metric__sub">{{ r.uplift ? (r.uplift.gain >= 0.0005 ? `${characterShortName(r.uplift.mainDps)}'s best team` : "beats none of your best teams") : r.status === "maxed" ? "nothing to add" : "" }}</span>
            </span>
            <span class="sc-metric" :class="{ 'sc-metric--na': r.status !== 'new' }">
              <span class="sc-metric__label">New teams</span>
              <span class="sc-metric__value">{{ r.newTeams ? r.newTeams.count : "—" }}</span>
              <span class="sc-metric__sub">{{ r.newTeams?.best ? `best ${compact(r.newTeams.best.dps)} DPS` : r.status === "new" ? "none" : r.status === "owned" || r.status === "maxed" ? "already yours" : r.status === "no-teams" ? "no wuwa_calc team" : "" }}</span>
            </span>
            <span class="sc-metric" :class="{ 'sc-metric--na': !r.dupe }">
              <span class="sc-metric__label">Dupe value</span>
              <span class="sc-metric__value" :class="cls(r.dupe?.team ?? r.dupe?.own)">{{ r.dupe ? pctFine(r.dupe.team ?? r.dupe.own) : "—" }}</span>
              <span class="sc-metric__sub">{{ r.dupe ? `${r.dupe.from}→${r.dupe.to} · ${r.dupe.team !== null ? "team" : "own"}` : r.status === "new" ? "not owned" : r.status === "maxed" ? "S6" : "" }}</span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sc-chev" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <div v-if="openKey === r.key" class="sc-detail">
            <p v-if="r.note" class="sc-detail__note">{{ r.note }}</p>
            <div v-if="r.uplift" class="sc-detail__block">
              <span class="sc-detail__label">Team uplift · wuwa_calc DPS at your account</span>
              <div class="sc-teamline">
                <span class="sc-faces"><CharacterAvatar v-for="k in r.uplift.with.team" :id="k" :key="k" :size="24" title="" /></span>
                <b>{{ compact(r.uplift.with.dps) }} DPS</b>
                <span class="sc-vs">vs today's best with {{ characterShortName(r.uplift.mainDps) }}</span>
                <span class="sc-faces"><CharacterAvatar v-for="k in r.uplift.base.team" :id="k" :key="k" :size="24" title="" /></span>
                <b>{{ compact(r.uplift.base.dps) }} DPS</b>
              </div>
            </div>
            <div v-if="r.newTeams?.top.length" class="sc-detail__block">
              <span class="sc-detail__label">Teams they make fieldable · best {{ r.newTeams.top.length }} of {{ r.newTeams.count }}</span>
              <div v-for="t in r.newTeams.top" :key="t.teamKey" class="sc-teamline">
                <span class="sc-faces"><CharacterAvatar v-for="k in t.team" :id="k" :key="k" :size="24" title="" /></span>
                <span>{{ t.team.map(characterShortName).join(" + ") }}</span>
                <b>{{ compact(t.dps) }} DPS</b>
              </div>
            </div>
            <div v-if="r.dupe" class="sc-detail__block">
              <span class="sc-detail__label">Dupe value · this app's engine</span>
              <span class="sc-detail__text">{{ r.dupe.from }} → {{ r.dupe.to }}: own {{ pctFine(r.dupe.own) }}, team {{ r.dupe.team !== null ? pctFine(r.dupe.team) : `— (${r.dupe.note ?? "no team figure"})` }}</span>
            </div>
            <div class="sc-detail__actions">
              <RouterLink :to="{ path: '/rankings', hash: rankingsHashFor(r) }" class="btn btn-xs" :data-test-weapons-pick-rankings="r.key">
                Open on Team rankings
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </RouterLink>
            </div>
          </div>
        </li>
      </ol>

      <details class="sc-help">
        <summary>How this is worked out</summary>
        <ul v-if="current.kind === 'resonator'">
          <li><b>Team uplift</b> (wuwa_calc DPS at your account, the "My account" tier): for every main DPS the option's teams serve, the best team with them against the best team that main DPS can field today. The largest rise is shown.</li>
          <li><b>New teams</b>: teams in wuwa_calc's list that only this option makes fieldable (everyone else owned — a 4★ or Rover always is), with their best DPS. An option you don't own runs at <b>S0 on wuwa_calc's best non-signature weapon</b> for them, never the signature.</li>
          <li><b>Dupe value</b> (this app's engine): one more copy of an owned, set-up option — the next sequence on their best rotation and their strongest team, as on My account.</li>
          <li>The two engines never mix in one number: DPS figures are wuwa_calc's, % figures from damage are this app's.</li>
        </ul>
        <ul v-else>
          <li>Read off the Signatures tab: for every set-up character of the weapon's type, the weapon at R1 (a new copy) — or, for one already wearing it, the next refinement (the dupe).</li>
          <li><b>Team uplift</b>: the best gain on a strongest-team figure (own damage where no team figure exists), passives at full stacks. <b>Best own gain</b>: the largest rise on someone's own rotation — a healer's damage can jump while their team barely moves.</li>
          <li>The app has no weapon inventory: "worn by" lists the copies your characters wear.</li>
        </ul>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /weapons' Selector tab: pick a selector (data/pools.json — the standard 5★ resonator and weapon
// lists from Kuro's text, the Moonlit Path pick players report — or a custom list of what your selector shows) and its
// options are ranked for this account by team uplift, new fieldable teams and dupe value (selector.ts). Weapon pools
// read the Signatures tab's run; resonator pools run wuwa_calc on demand through the shared solver worker
// (selectorRiley.ts), cached per data + engine + account for the tab.
import { computed, onBeforeUnmount, reactive, ref, toRaw, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { characterPickerRoster } from "../../characters/characters";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import WeaponIcon from "../display/WeaponIcon.vue";
import { characterDisplayName, characterShortName, weaponDisplayName } from "../display/names";
import { compact, ago } from "../myRankings/format";
import type { RosterRanking } from "../myRankings/rankRoster";
import { rankingsMineHash } from "../account/accountState";
import { useRileyAccount } from "../engine/useRileyAccount";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { CUSTOM_POOL_ID, POOLS, releasedItems, type SelectorPool } from "./pools";
import { rankResonatorPool, rankWeaponPool, type ResonatorPickRow } from "./selector";
import { browserSelectorRiley } from "./selectorRiley";
import { SELECTOR_CACHE_KEY, createValueCache } from "./valueCache";
import { pctFine } from "./weaponValueView";
import type { WeaponValueResult } from "./weaponValue";

const props = defineProps<{ pool: string; value: WeaponValueResult | null; ranking: RosterRanking | null; fingerprint: string; running: boolean; owned: string[] }>();
const emit = defineEmits<{ "update:pool": [id: string] }>();

const STATUS: Record<ResonatorPickRow["status"], string> = { owned: "Owned", maxed: "Owned", new: "New", "not-in-app": "Not in the app", "no-teams": "No wuwa_calc team", error: "Engine error" };
const CUSTOM_KEY = "wtplus:weapons:custom";

const characterStore = useCharacterStore();
const inventoryStore = useInventoryStore();
const teamStore = useTeamRotationsStore();
const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, any>> } };
const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, any>> } };
const rileyAccount = useRileyAccount();
const sortBy = ref<"uplift" | "new" | "dupe" | "own">("uplift");
const openKey = ref<string | null>(null);

// ---- pools
const custom = ref<string[]>(readCustom());
function readCustom(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]");
    return Array.isArray(list) ? releasedItems({ kind: "resonator", items: list.filter((x: unknown) => typeof x === "string") }) : [];
  } catch {
    return [];
  }
}
watch(custom, (list) => {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    /* the list lasts this visit */
  }
});
const customPool = computed<SelectorPool>(() => ({ id: CUSTOM_POOL_ID, kind: "resonator", title: "Custom pick", subtitle: "Any selector: add what yours offers", items: custom.value, version: POOLS.gameVersion, verified: true, source: "", sourceUrl: "" }));
const allPools = computed<SelectorPool[]>(() => [...POOLS.pools, customPool.value]);
const current = computed<SelectorPool>(() => allPools.value.find((p) => p.id === props.pool) ?? allPools.value[0]!);
const poolItems = computed(() => releasedItems(current.value));
const poolCards = computed(() =>
  allPools.value.map((p) => {
    const items = releasedItems(p);
    return { id: p.id, kind: p.kind, title: p.title, subtitle: p.subtitle, unverified: !p.verified, preview: items.slice(0, 5), more: Math.max(0, items.length - 5) };
  }),
);
const roster = computed(() =>
  [...characterPickerRoster.five, ...characterPickerRoster.four].map((c) => ({ key: c.key, name: characterDisplayName(c.key) })).sort((a, b) => a.name.localeCompare(b.name)),
);
const customQuery = ref("");
/** released roster resonators matching the query (name start first), not in the pick yet — an in-page list, not a
 *  native <datalist> (its popup is clumsy on Android and crashes headless Electron) */
const suggestions = computed(() => {
  const q = customQuery.value.trim().toLowerCase();
  if (!q) return [];
  const free = roster.value.filter((c) => !custom.value.includes(c.key) && c.name.toLowerCase().includes(q));
  return [...free.filter((c) => c.name.toLowerCase().startsWith(q)), ...free.filter((c) => !c.name.toLowerCase().startsWith(q))].slice(0, 6);
});
function addCustom(key: string | undefined): void {
  if (!key || custom.value.includes(key)) return;
  custom.value = [...custom.value, key];
  customQuery.value = "";
}
function removeCustom(key: string): void {
  custom.value = custom.value.filter((k) => k !== key);
}

// ---- items the player's selector leaves out (per pool, this visit)
const excludedByPool = reactive<Record<string, string[]>>({});
const excluded = computed(() => new Set(excludedByPool[current.value.id] ?? []));
const included = computed(() => poolItems.value.filter((k) => !excluded.value.has(k)));
function toggleItem(key: string): void {
  const list = new Set(excludedByPool[current.value.id] ?? []);
  if (list.has(key)) list.delete(key);
  else list.add(key);
  excludedByPool[current.value.id] = [...list];
}
const itemName = (k: string): string => (current.value.kind === "weapon" ? weaponDisplayName(k) : characterShortName(k));

// ---- weapon pools: straight off the weapon-value run
const weaponRows = computed(() => {
  if (current.value.kind !== "weapon") return [];
  const rows = rankWeaponPool(included.value, props.value, characters.value ?? {});
  if (sortBy.value === "dupe") return [...rows].sort((a, b) => (b.dupe?.value ?? -Infinity) - (a.dupe?.value ?? -Infinity) || a.key.localeCompare(b.key));
  if (sortBy.value === "own") return [...rows].sort((a, b) => (b.bestOwn?.gain ?? -Infinity) - (a.bestOwn?.gain ?? -Infinity) || a.key.localeCompare(b.key));
  return rows;
});
const typeLabel = (type: string | null): string => (type ? type.replace(/s$/, "") : "");
const heldOf = (id: string): string => {
  const d = characters.value?.[id];
  return d?.weapon ? `${weaponDisplayName(d.weapon)} R${d.weapons?.[d.weapon]?.refinement ?? 1}` : "no weapon";
};

// ---- resonator pools: wuwa_calc on demand, cached for the tab
type ResonatorResult = { rows: ResonatorPickRow[]; computedAt: string };
const memory = new Map<string, ResonatorResult>();
const cache = createValueCache<ResonatorResult>(SELECTOR_CACHE_KEY, 1, (v) => Array.isArray((v as ResonatorResult)?.rows));
const runKey = computed(() => {
  const a = rileyAccount.value;
  return [props.fingerprint, a.key, a.buildsKey, autoTeamBuffs.value ? "a" : "-", [...included.value].sort().join(",")].join("|");
});
const resonatorResult = ref<ResonatorResult | null>(null);
const restored = ref(false);
const runState = ref<"idle" | "running">("idle");
const runError = ref<string | null>(null);
const progress = ref({ done: 0, total: 0, label: "" });
let controller: AbortController | null = null;

const resonatorRows = computed(() => resonatorResult.value?.rows ?? null);
const resonatorComputedAt = computed(() => resonatorResult.value?.computedAt ?? null);
const progressLabel = computed(() => (progress.value.label && progress.value.label !== "your teams as they are" ? characterShortName(progress.value.label) : "your teams as they are"));
const sortedResonators = computed(() => {
  const rows = resonatorRows.value ?? [];
  if (sortBy.value === "new") return [...rows].sort((a, b) => (b.newTeams?.best?.dps ?? -1) - (a.newTeams?.best?.dps ?? -1) || (b.newTeams?.count ?? -1) - (a.newTeams?.count ?? -1) || a.key.localeCompare(b.key));
  if (sortBy.value === "dupe") return [...rows].sort((a, b) => (b.dupe?.team ?? b.dupe?.own ?? -Infinity) - (a.dupe?.team ?? a.dupe?.own ?? -Infinity) || a.key.localeCompare(b.key));
  return rows;
});

// a cached result for exactly this data + selection shows at once
watch(
  runKey,
  (key) => {
    if (current.value.kind !== "resonator") return;
    const hit = memory.get(key) ?? cache.read(key);
    resonatorResult.value = hit ?? null;
    restored.value = !!hit && !memory.has(key);
    if (hit) memory.set(key, hit);
  },
  { immediate: true },
);
watch(
  () => current.value.id,
  () => {
    openKey.value = null;
    if ((sortBy.value === "new" && current.value.kind === "weapon") || (sortBy.value === "own" && current.value.kind === "resonator")) sortBy.value = "uplift";
  },
);

async function run(force: boolean): Promise<void> {
  if (!props.ranking || runState.value === "running") return;
  const key = runKey.value;
  if (!force && memory.has(key) && resonatorResult.value) return;
  controller = new AbortController();
  const signal = controller.signal;
  runState.value = "running";
  runError.value = null;
  progress.value = { done: 0, total: 0, label: "" };
  try {
    const riley = await browserSelectorRiley(toRaw(rileyAccount.value), signal);
    const rows = await rankResonatorPool(
      {
        items: included.value,
        characters: JSON.parse(JSON.stringify(toRaw(characters.value ?? {}))),
        echoes: JSON.parse(JSON.stringify(toRaw(inventoryStore.echoes ?? []))),
        teams: JSON.parse(JSON.stringify(toRaw(teams.value ?? []))),
        ranking: props.ranking,
        autoTeamBuffs: autoTeamBuffs.value,
      },
      riley,
      { signal, onProgress: (p) => (progress.value = p) },
    );
    if (signal.aborted) return;
    const result = { rows, computedAt: new Date().toISOString() };
    memory.set(key, result);
    cache.write(key, result);
    if (runKey.value === key) {
      resonatorResult.value = result;
      restored.value = false;
    }
  } catch (err) {
    if (!signal.aborted) runError.value = `wuwa_calc could not rank these: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (controller?.signal === signal) controller = null;
    runState.value = "idle";
  }
}
function cancel(): void {
  controller?.abort();
  runState.value = "idle";
}
onBeforeUnmount(() => controller?.abort());

// ---- rows
const cls = (v: number | null | undefined): string => (v == null ? "sc-muted" : v > 0.0005 ? "sc-up" : v < -0.0005 ? "sc-down" : "");
/** /rankings at the account, on this option's teams (`own=0` so teams with a resonator the account lacks show too) */
function rankingsHashFor(r: ResonatorPickRow): string {
  const base = rankingsMineHash([r.key]);
  return r.status === "new" ? base.replace("#tc=mine", "#tc=mine&own=0") : base;
}
</script>

<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.sc-pools {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
}
.sc-pool {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.7rem 0.85rem;
  border-radius: 0.8rem;
  text-align: left;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.sc-pool:hover {
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.25);
}
.sc-pool--on,
.sc-pool--on:hover {
  background: linear-gradient(135deg, oklch(var(--p) / 0.14), oklch(var(--b2)) 75%);
  box-shadow: inset 0 0 0 2px oklch(var(--p));
}
.sc-pool__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  font-weight: 700;
}
.sc-pool__sub {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.6);
}
.sc-pool__faces {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-top: 0.2rem;
}
.sc-pool__more {
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.55);
  margin-left: 0.15rem;
}
.sc-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 0.4rem;
  border-radius: 9999px;
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1.3rem;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.75);
  background: oklch(var(--bc) / 0.08);
}
.sc-badge--warn {
  color: color-mix(in oklab, oklch(var(--wa)) 55%, black);
  background: oklch(var(--wa) / 0.25);
}
:root[data-theme-style="dark"] .sc-badge--warn {
  color: oklch(var(--wa));
  background: oklch(var(--wa) / 0.14);
}
.sc-badge--new {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.sc-badge--owned {
  color: oklch(var(--suc, var(--b1)));
  background: oklch(var(--su) / 0.85);
}
.sc-badge--maxed {
  color: #5c4310;
  background: #e8b44c;
}
.sc-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.9rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.09);
}
.sc-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.sc-panel__title {
  min-width: 0;
}
.sc-h2 {
  font-size: 1.05rem;
  font-weight: 700;
}
.sc-src {
  font-size: 0.74rem;
  color: oklch(var(--bc) / 0.6);
}
.sc-warn {
  color: color-mix(in oklab, oklch(var(--wa)) 55%, black);
  font-weight: 600;
}
:root[data-theme-style="dark"] .sc-warn {
  color: oklch(var(--wa));
}
.sc-sort {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.7);
}
.sc-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.sc-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem 0.2rem 0.25rem;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 600;
  background: oklch(var(--bc) / 0.06);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.sc-item--off {
  opacity: 0.45;
  text-decoration: line-through;
}
.sc-item__x {
  margin-left: 0.15rem;
  font-size: 0.68rem;
  color: oklch(var(--bc) / 0.55);
}
.sc-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}
.sc-add input {
  width: 11rem;
}
.sc-suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.sc-suggest__item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem 0.15rem 0.2rem;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 600;
  color: oklch(var(--p));
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.45);
}
.sc-suggest__item:hover {
  background: oklch(var(--p) / 0.1);
}
.sc-suggest__none {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.5);
}
.sc-run {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}
.sc-run__text {
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.6);
  min-width: 0;
}
.sc-run__error {
  flex-basis: 100%;
  font-size: 0.78rem;
  color: oklch(var(--er));
}
.sc-progress {
  flex: 0 0 10rem;
  height: 0.35rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.1);
  overflow: hidden;
}
.sc-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: oklch(var(--in));
  transition: width 0.25s;
}
.sc-list {
  display: flex;
  flex-direction: column;
  border-radius: 0.7rem;
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.sc-row {
  border-top: 1px solid oklch(var(--bc) / 0.07);
}
.sc-row:first-child {
  border-top: 0;
}
.sc-row__btn {
  display: grid;
  grid-template-columns: 1.5rem minmax(12rem, 1.4fr) repeat(3, minmax(0, 1fr)) 1rem;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-radius: 0.6rem;
}
.sc-row__btn:hover,
.sc-row--open > .sc-row__btn {
  background: oklch(var(--bc) / 0.04);
}
.sc-rank {
  font-size: 0.8rem;
  font-weight: 700;
  color: oklch(var(--bc) / 0.45);
  text-align: center;
}
.sc-who {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.sc-who__text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.sc-who__name {
  font-weight: 650;
  font-size: 0.92rem;
}
.sc-who__sub {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-metric {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}
.sc-metric--na .sc-metric__value {
  color: oklch(var(--bc) / 0.35);
}
.sc-metric__label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.5);
}
.sc-metric__value {
  font-size: 1.05rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.sc-metric__sub {
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-up {
  color: oklch(var(--su));
}
:root[data-theme-style="light"] .sc-up {
  color: color-mix(in oklab, oklch(var(--su)) 70%, black);
}
.sc-down {
  color: oklch(var(--er));
}
.sc-muted {
  color: oklch(var(--bc) / 0.4);
}
.sc-chev {
  width: 1rem;
  height: 1rem;
  color: oklch(var(--bc) / 0.4);
  transition: transform 0.15s;
}
.sc-row--open .sc-chev {
  transform: rotate(180deg);
}
.sc-detail {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin: 0 0.75rem 0.75rem 2.75rem;
  padding: 0.75rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
  font-size: 0.8rem;
}
.sc-detail__lead,
.sc-detail__note {
  color: oklch(var(--bc) / 0.65);
}
.sc-detail__block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.sc-detail__label {
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.5);
}
.sc-teamline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.6rem;
}
.sc-faces {
  display: inline-flex;
  gap: 0.15rem;
}
.sc-vs {
  color: oklch(var(--bc) / 0.55);
}
.sc-detail__actions {
  display: flex;
  gap: 0.4rem;
}
.sc-uses {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.sc-uses li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.7rem;
}
.sc-uses__name {
  font-weight: 650;
  min-width: 6rem;
}
.sc-uses__what {
  color: oklch(var(--bc) / 0.6);
  min-width: 10rem;
}
.sc-uses__num {
  font-variant-numeric: tabular-nums;
  color: oklch(var(--bc) / 0.65);
}
.sc-help {
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.7);
}
.sc-help summary {
  cursor: pointer;
  font-weight: 600;
  color: oklch(var(--bc) / 0.8);
}
.sc-help ul {
  margin: 0.5rem 0 0 1.1rem;
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

@media (max-width: 1100px) {
  .sc-pools {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .sc-panel {
    padding: 0.75rem 0.6rem;
  }
  .sc-pools {
    gap: 0.45rem;
  }
  .sc-pool {
    padding: 0.55rem 0.65rem;
  }
  .sc-pool__faces,
  .sc-pool__sub {
    display: none;
  }
  .sc-pools {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sc-pool__title {
    font-size: 0.82rem;
  }
  .sc-metric__sub {
    white-space: normal;
  }
  .sc-row__btn {
    grid-template-columns: 1.1rem minmax(0, 1fr) 1rem;
    grid-template-areas:
      "rank who chev"
      ". metrics metrics";
    gap: 0.45rem 0.5rem;
    padding: 0.6rem 0.5rem;
  }
  .sc-rank {
    grid-area: rank;
  }
  .sc-who {
    grid-area: who;
  }
  .sc-chev {
    grid-area: chev;
  }
  .sc-metric {
    grid-column: 2 / 4;
  }
  .sc-row__btn > .sc-metric {
    display: flex;
    flex-flow: row wrap;
    align-items: baseline;
    gap: 0 0.5rem;
  }
  .sc-row__btn > .sc-metric > .sc-metric__label {
    flex: 0 0 6.2rem;
  }
  .sc-row__btn > .sc-metric > .sc-metric__sub {
    flex: 1 1 9rem;
  }
  .sc-metric__value {
    font-size: 0.95rem;
  }
  .sc-detail {
    margin: 0 0.4rem 0.6rem;
  }
  .sc-uses__what {
    min-width: 0;
  }
  .sc-progress {
    flex-basis: 6rem;
  }
}
@media (max-width: 330px) {
  .sc-pools {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
