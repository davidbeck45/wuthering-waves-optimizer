<template>
  <Nav cur-page="weapons" :disable-mobile-nav="true"></Nav>
  <div class="wv-page" data-test-weapons>
    <header class="wv-head">
      <div class="wv-head__title">
        <h1 class="wv-h1">Weapon value</h1>
        <span class="wv-source" :data-state="sourceState" data-test-weapons-source title="Read from this browser's saved data. Nothing leaves the device.">
          <span class="wv-source__dot" aria-hidden="true"></span>
          <span>{{ sourceLabel.split(" · ")[0] }}<span class="max-sm:hidden"> · this browser</span></span>
        </span>
      </div>
      <div class="wv-tabs" role="tablist" aria-label="Weapon value views">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          role="tab"
          class="wv-tabs__item"
          :class="{ 'wv-tabs__item--on': prefs.tab === t.key }"
          :aria-selected="prefs.tab === t.key"
          :data-test-weapons-tab="t.key"
          @click="setTab(t.key)">
          {{ t.label }}
        </button>
      </div>
      <button
        v-if="setUpCount"
        type="button"
        class="wv-refresh"
        :disabled="busy"
        :title="busy ? 'Scoring…' : 'Score everything again from the data as saved'"
        data-test-weapons-recompute
        @click="refresh(true)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" :class="{ 'wv-spin': busy }" aria-hidden="true">
          <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="max-sm:hidden">{{ busy ? "Scoring…" : "Recompute" }}</span>
      </button>
      <p class="wv-head__sub">
        What each signature, standard 5★ and 4★ weapon is worth on your own builds and teams — every set-up character at
        once, scored by this app's engine on their best rotation (enemy level 100 · 20 % RES).
      </p>
    </header>

    <section v-if="!setUpCount" data-test-weapons-empty>
      <MyRankingsEmpty
        title="Import your account first"
        text="No character has a weapon equipped yet. Bring your account in (Settings › Backup & Restore) or build someone, and this page scores every signature and alternative on your real builds and teams." />
    </section>

    <template v-else>
      <div v-if="status.state === 'error'" role="alert" class="alert alert-error text-sm mb-3" data-test-weapons-error>
        <span>The roster could not be scored: {{ status.error }}</span>
        <button type="button" class="btn btn-sm" @click="refresh(true)">Try again</button>
      </div>

      <!-- ===================================================================== signatures -->
      <section v-show="prefs.tab === 'signatures'" class="wv-sig" data-test-weapons-signatures>
        <div class="wv-kpis" data-test-weapons-kpis>
          <div class="wv-kpi wv-kpi--hero">
            <span class="wv-kpi__label">Biggest signature gain · {{ scopeWord }}</span>
            <span v-if="kpis.top" class="wv-kpi__body">
              <CharacterAvatar :id="kpis.top.id" :size="32" dot title="" />
              <span class="wv-kpi__text">
                <span class="wv-kpi__value wv-up">{{ pctFine(kpis.top.value) }}</span>
                <span class="wv-kpi__sub">{{ characterShortName(kpis.top.id) }} · {{ kpis.top.label }}</span>
              </span>
            </span>
            <span v-else class="wv-kpi__value wv-kpi__value--muted">{{ running ? "…" : "—" }}</span>
          </div>
          <div class="wv-kpi">
            <span class="wv-kpi__label">Best next refinement · {{ scopeWord }}</span>
            <span v-if="kpis.topRefine" class="wv-kpi__body">
              <CharacterAvatar :id="kpis.topRefine.id" :size="32" dot title="" />
              <span class="wv-kpi__text">
                <span class="wv-kpi__value wv-up">{{ pctFine(kpis.topRefine.value) }}</span>
                <span class="wv-kpi__sub">{{ characterShortName(kpis.topRefine.id) }} · {{ kpis.topRefine.label }}</span>
              </span>
            </span>
            <span v-else class="wv-kpi__value wv-kpi__value--muted">{{ running ? "…" : "—" }}</span>
          </div>
          <div class="wv-kpi">
            <span class="wv-kpi__label">Signatures</span>
            <span class="wv-kpi__value">{{ kpis.refining + kpis.maxed }}<span class="wv-kpi__of"> held</span></span>
            <span class="wv-kpi__sub">{{ kpis.maxed }} at R5 · {{ kpis.missing }} not held</span>
          </div>
          <div class="wv-kpi">
            <span class="wv-kpi__label">Characters scored</span>
            <span class="wv-kpi__value">{{ rows.length }}<span class="wv-kpi__of"> / {{ setUpCount }}</span></span>
            <span class="wv-kpi__sub">{{ notSetUp.length }} without a weapon</span>
          </div>
        </div>

        <div class="wv-toolbar">
          <div class="wv-toolbar__inline">
            <div class="wv-seg" role="group" aria-label="Measure">
              <button v-for="s in SCOPES" :key="s.key" type="button" class="wv-seg__btn" :class="{ 'wv-seg__btn--on': prefs.scope === s.key }" :aria-pressed="prefs.scope === s.key" :title="s.title" :data-test-weapons-scope="s.key" @click="prefs.scope = s.key">
                {{ s.label }}
              </button>
            </div>
            <div class="wv-filters" role="group" aria-label="Show">
              <button v-for="f in FILTERS" :key="f.key" type="button" class="wv-chipbtn" :class="{ 'wv-chipbtn--on': prefs.filter === f.key }" :aria-pressed="prefs.filter === f.key" :data-test-weapons-filter="f.key" @click="prefs.filter = f.key">
                {{ f.label }}<span class="wv-chipbtn__n">{{ counts[f.key] }}</span>
              </button>
            </div>
            <label class="wv-select">
              <span>Sort</span>
              <select v-model="prefs.sort" class="select select-bordered select-xs" data-test-weapons-sort>
                <option v-for="o in SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
            </label>
            <label v-if="notSetUp.length" class="wv-switch">
              <input v-model="prefs.showNotSetUp" type="checkbox" class="toggle toggle-xs toggle-primary" data-test-weapons-not-set-up />
              <span>Not set up ({{ notSetUp.length }})</span>
            </label>
          </div>
          <button type="button" class="btn btn-sm wv-toolbar__options" :aria-expanded="sheet" data-test-weapons-options @click="sheet = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" stroke-linecap="round" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
            {{ SCOPES.find((s) => s.key === prefs.scope)?.label }} · {{ SORTS.find((s) => s.key === prefs.sort)?.short }}
          </button>
          <div class="wv-legend" aria-label="How to read the bars">
            <span><i class="wv-lg wv-lg--bar"></i>next copy</span>
            <span><i class="wv-lg wv-lg--ladder"></i>to R5</span>
            <span v-if="prefs.scope === 'own'"><i class="wv-lg wv-lg--whisker"></i>stats only</span>
          </div>
        </div>

        <div v-if="running" class="wv-progress" data-test-weapons-progress>
          <span class="wv-progress__track"><span :style="{ width: `${progressPct}%` }"></span></span>
          <span class="wv-progress__text">{{ progressText }}</span>
        </div>

        <div class="wv-chart" :style="{ '--wv-cols': COLS }" data-test-weapons-chart>
          <div class="wv-chart__head" aria-hidden="true">
            <span>Character</span>
            <span>Signature</span>
            <span class="wv-axis">
              <span v-for="t in axisLines" :key="t" class="wv-axis__tick" :style="{ left: `${at(t, axis)}%` }">{{ t === 0 ? "0" : pctFine(t).replace(".0%", "%") }}</span>
            </span>
            <span class="text-right">Next copy</span>
            <span></span>
          </div>
          <ol class="wv-list">
            <WeaponValueBar
              v-for="b in shownBars"
              :key="b.id"
              :bar="b"
              :axis="axis"
              :scope="prefs.scope"
              :open="openId === b.id"
              :owned="ownedKeys"
              :character-data="characterMap[b.id]"
              @toggle="toggle"
              @calculator="toCalculator" />
            <li v-for="n in pending" :key="`sk-${n}`" class="wv-skeleton" aria-hidden="true" data-test-weapons-skeleton>
              <span class="skeleton wv-sk wv-sk--avatar"></span>
              <span class="skeleton wv-sk wv-sk--line"></span>
              <span class="skeleton wv-sk wv-sk--bar"></span>
            </li>
            <template v-if="prefs.showNotSetUp">
              <li v-for="id in notSetUp" :key="`ns-${id}`" class="wv-notsetup" :data-test-weapons-not-set-up-row="id">
                <CharacterAvatar :id="id" :size="32" title="" />
                <span class="wv-notsetup__name">{{ characterShortName(id) }}</span>
                <span class="wv-notsetup__text">Not set up — equip a weapon in the calculator to score them</span>
                <button type="button" class="btn btn-xs btn-ghost" @click="toCalculator(id)">Open</button>
              </li>
            </template>
          </ol>
          <p v-if="!running && !shownBars.length && rows.length" class="wv-none" data-test-weapons-none>Nobody matches this filter.</p>
        </div>

        <details class="wv-help">
          <summary>How these are worked out</summary>
          <ul>
            <li><b>Own</b>: the character's average damage per rotation on the best rotation the roster ranking found for them (the same as Roster rankings and My account), with only the weapon changed.</li>
            <li><b>Team</b>: their strongest team you can field (your saved teams and the presets, every member armed), re-run the way the rankings run it — so a support's team-buff signature lifts the carry it buffs. A teammate whose Team Buffs panel you set by hand is scored as if you ticked the new weapon's buff there (and unticked the old one's).</li>
            <li><b>A weapon they don't hold</b> is a bracket: the bar has every passive at full stacks; the whisker ends at its stats alone (every passive off). Team figures use full stacks. <b>Their own weapon</b> refined is one number, on their passive settings.</li>
            <li><b>Standard 5★</b>: the Standard Weapon Convene's ten, at R1. <b>Best 4★</b>: every 4★ of the type at R5, the best kept — check you own it.</li>
            <li>Numbers are this app's engine, never wuwa_calc's DPS. Dual-mode kits are scored in the mode their build is saved in.</li>
          </ul>
        </details>
        <p v-if="result" class="wv-foot">
          Scored {{ new Date(result.computedAt).toLocaleString() }}{{ status.restored ? " (kept for this tab)" : "" }} · {{ result.rows.length }} characters
          <span v-if="unscoredCount || result.errors.length" class="wv-foot__warn" :title="result.errors.join('\n')" data-test-weapons-errors>· {{ unscoredCount ? `${unscoredCount} could not be scored` : `${result.errors.length} team${result.errors.length === 1 ? "" : "s"} could not be scored` }}</span>
          · enemy level 100, 20 % RES ·
          tier lists elsewhere are generic; these are your builds. Guides:
          <a href="https://www.prydwen.gg/wuthering-waves/characters" target="_blank" rel="noopener noreferrer" class="link">Prydwen ↗</a>
        </p>
      </section>

      <!-- ===================================================================== selector -->
      <SelectorChooser
        v-if="prefs.tab === 'selector'"
        v-model:pool="prefs.pool"
        :value="result"
        :ranking="ranking"
        :fingerprint="fingerprint"
        :running="running"
        :owned="ownedKeys" />
    </template>

    <Teleport to="body">
      <div v-if="sheet" class="wv-sheet" data-test-weapons-sheet>
        <div class="wv-sheet__backdrop" @click="sheet = false"></div>
        <div class="wv-sheet__panel" role="dialog" aria-modal="true" aria-label="Weapon value options">
          <div class="wv-sheet__grip" aria-hidden="true"></div>
          <div class="wv-sheet__head">
            <span>Options</span>
            <button type="button" class="btn btn-ghost btn-sm btn-square" aria-label="Close" data-test-weapons-sheet-close @click="sheet = false">✕</button>
          </div>
          <div class="wv-sheet__group">
            <div class="wv-sheet__label">Measure</div>
            <div class="wv-sheet__seg">
              <button v-for="s in SCOPES" :key="s.key" type="button" class="btn btn-sm" :class="prefs.scope === s.key ? 'btn-primary' : 'btn-ghost'" :data-test-weapons-sheet-scope="s.key" @click="prefs.scope = s.key">{{ s.label }}</button>
            </div>
            <p class="wv-sheet__hint">{{ SCOPES.find((s) => s.key === prefs.scope)?.title }}</p>
          </div>
          <div class="wv-sheet__group">
            <div class="wv-sheet__label">Sort by</div>
            <div class="wv-sheet__seg">
              <button v-for="o in SORTS" :key="o.key" type="button" class="btn btn-sm" :class="prefs.sort === o.key ? 'btn-primary' : 'btn-ghost'" :data-test-weapons-sheet-sort="o.key" @click="prefs.sort = o.key">{{ o.label }}</button>
            </div>
          </div>
          <div class="wv-sheet__group">
            <div class="wv-sheet__label">Show</div>
            <div class="wv-sheet__seg">
              <button v-for="f in FILTERS" :key="f.key" type="button" class="btn btn-sm" :class="prefs.filter === f.key ? 'btn-primary' : 'btn-ghost'" :data-test-weapons-sheet-filter="f.key" @click="prefs.filter = f.key">{{ f.label }} ({{ counts[f.key] }})</button>
            </div>
          </div>
          <label v-if="notSetUp.length" class="wv-sheet__row">
            <span>Characters without a weapon<span class="wv-sheet__hint">listed greyed, not scored</span></span>
            <input v-model="prefs.showNotSetUp" type="checkbox" class="toggle toggle-primary" />
          </label>
          <button type="button" class="btn btn-block btn-sm mt-2" @click="sheet = false">Done</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
// Wuthering Tools+ — /weapons, "Weapon value": for every set-up character, what their signature's next copy (and every
// refinement after it), the standard 5★ weapons and the best 4★ are worth on their own build and on their strongest
// fieldable team (weaponValue.ts, this app's engine), as one sortable bar chart; and the selector chooser
// (SelectorChooser.vue: which standard 5★ / Moonlit Path pick helps this account most). Data: useWeaponValueData.ts;
// view model: weaponValueView.ts. `?focus=<id>` opens that character's row once scored (the /my-rankings link).
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Nav from "../../components/navigation/Nav.vue";
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import CharacterAvatar from "../display/CharacterAvatar.vue";
import { characterShortName } from "../display/names";
import MyRankingsEmpty from "../myRankings/MyRankingsEmpty.vue";
import WeaponValueBar from "./WeaponValueBar.vue";
import { useWeaponValueData } from "./useWeaponValueData";
import { PREFS_KEY, at, axisOf, axisTicks, barModel, filterBars, filterCounts, kpisOf, pctFine, readPrefs, sortBars, unscored, type FilterKey, type Scope, type SortKey, type WeaponPrefs } from "./weaponValueView";

// the selector tab carries the wuwa_calc client (a worker on first use): its own chunk, loaded when the tab opens
const SelectorChooser = defineAsyncComponent(() => import("./SelectorChooser.vue"));

useDocumentTitle(
  "Weapon value — Wuthering Waves Calculator & Optimizer",
  "Is that signature worth it? Every Wuthering Waves signature, refinement, standard 5★ and 4★ weapon scored on your own builds and teams, plus which selector pick helps your account most.",
);

const TABS = [
  { key: "signatures" as const, label: "Signatures" },
  { key: "selector" as const, label: "Selector" },
];
const SCOPES: Array<{ key: Scope; label: string; title: string }> = [
  { key: "team", label: "Team", title: "Gain on the character's strongest team you can field — a support's weapon counts through the carry it buffs" },
  { key: "own", label: "Own", title: "Gain on the character's own best rotation" },
];
const SORTS: Array<{ key: SortKey; label: string; short: string }> = [
  { key: "signature", label: "Next copy", short: "next copy" },
  { key: "r5", label: "Gain at R5", short: "R5" },
  { key: "damage", label: "Damage", short: "damage" },
  { key: "name", label: "Name", short: "name" },
];
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "swap", label: "Not held" },
  { key: "held", label: "Refining" },
  { key: "done", label: "Maxed / none" },
];
const COLS = "minmax(11rem, 15rem) minmax(9rem, 13rem) minmax(0, 1fr) 6.5rem 1rem";

const route = useRoute();
const router = useRouter();
const data = useWeaponValueData();
const { characters, setUpCount, ownedKeys, ranking, result, rows, pending, status, fingerprint, refresh } = data;

// ---- preferences (per browser)
const prefs = reactive<WeaponPrefs>(readStored());
function readStored(): WeaponPrefs {
  try {
    return readPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return readPrefs(null);
  }
}
if (route.query.tab === "selector" || route.query.tab === "signatures") prefs.tab = route.query.tab;
watch(
  prefs,
  () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: the choice lasts this visit */
    }
  },
  { deep: true },
);
function setTab(tab: WeaponPrefs["tab"]): void {
  prefs.tab = tab;
  void router.replace({ query: { ...route.query, tab: tab === "signatures" ? undefined : tab } });
}

// ---- view model
const bars = computed(() => rows.value.map((r) => barModel(r, prefs.scope)));
const counts = computed(() => filterCounts(bars.value));
const shownBars = computed(() => sortBars(filterBars(bars.value, prefs.filter), prefs.sort));
const axis = computed(() => axisOf(shownBars.value));
const axisLines = computed(() => axisTicks(axis.value));
const kpis = computed(() => kpisOf(bars.value));
const notSetUp = computed(() => result.value?.notSetUp ?? Object.keys(characters.value ?? {}).filter((id) => !ownedKeys.value.includes(id)));
const characterMap = computed<Record<string, Record<string, any>>>(() => characters.value ?? {});
const scopeWord = computed(() => (prefs.scope === "team" ? "team" : "own"));
const unscoredCount = computed(() => unscored(result.value));

const running = computed(() => status.value.state === "ranking" || status.value.state === "scoring");
const busy = running;
const progressPct = computed(() => {
  const s = status.value;
  if (!s.total) return 4;
  // ranking is the first ~third of the work on a cold visit
  return s.state === "ranking" ? (s.done / s.total) * 33 : 33 + (s.done / s.total) * 67;
});
const progressText = computed(() => {
  const s = status.value;
  return s.state === "ranking" ? `Ranking your roster · ${s.done} / ${s.total || "…"}` : `Scoring ${s.label} · ${s.done} / ${s.total}`;
});
const sourceState = computed(() => (running.value ? "scoring" : result.value ? "live" : "idle"));
const sourceLabel = computed(() => (running.value ? "Scoring · this browser" : result.value ? "Live · this browser" : "Saved · this browser"));

// ---- rows
const openId = ref<string | null>(null);
function toggle(id: string): void {
  openId.value = openId.value === id ? null : id;
}
function toCalculator(id: string): void {
  data.setActiveCharacter(id);
  void router.push("/");
}
// ?focus=<id>: open and scroll to that row once it is scored (from /my-rankings' row tabs)
const focus = typeof route.query.focus === "string" ? route.query.focus : null;
let focused = false;
watch(
  () => rows.value.some((r) => r.id === focus),
  (ready) => {
    if (!focus || focused || !ready) return;
    focused = true;
    prefs.tab = "signatures";
    prefs.filter = "all";
    openId.value = focus;
    setTimeout(() => {
      const el = document.querySelector(`[data-test-weapons-row="${CSS.escape(focus)}"]`);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96, behavior: "smooth" });
    }, 60);
  },
  { immediate: true },
);

// ---- the phone options sheet
const sheet = ref(false);
function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") sheet.value = false;
}
watch(sheet, (open) => {
  if (open) document.addEventListener("keydown", onKey);
  else document.removeEventListener("keydown", onKey);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));

onMounted(() => {
  // a remembered Selector tab shows in the URL, so a shared link opens what is on screen
  if (prefs.tab === "selector" && route.query.tab !== "selector") void router.replace({ query: { ...route.query, tab: "selector" } });
  void refresh();
});
</script>

<style scoped>
.wv-page {
  width: 100%;
  max-width: 88rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 2.5rem;
}
.wv-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
  margin-bottom: 1rem;
}
.wv-head__title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.wv-h1 {
  font-size: 1.5rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.wv-source {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.6rem 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  color: oklch(var(--bc) / 0.75);
  background: oklch(var(--bc) / 0.06);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.08);
}
.wv-source__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.35);
}
.wv-source[data-state="live"] .wv-source__dot {
  background: oklch(var(--su));
  box-shadow: 0 0 0 3px oklch(var(--su) / 0.2);
}
.wv-source[data-state="scoring"] .wv-source__dot {
  background: oklch(var(--in));
  animation: wv-pulse 1s ease-in-out infinite;
}
@keyframes wv-pulse {
  50% {
    box-shadow: 0 0 0 5px oklch(var(--in) / 0.15);
  }
}
.wv-tabs {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 0.6rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.wv-tabs__item {
  padding: 0.3rem 0.85rem;
  border-radius: 0.45rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.6);
  white-space: nowrap;
}
.wv-tabs__item:hover {
  color: oklch(var(--bc));
}
.wv-tabs__item--on,
.wv-tabs__item--on:hover {
  color: oklch(var(--pc));
  background: oklch(var(--p));
}
.wv-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  padding: 0.4rem 0.8rem;
  border-radius: 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.wv-refresh:hover:not(:disabled) {
  box-shadow: inset 0 0 0 1px oklch(var(--p) / 0.6);
}
.wv-refresh:disabled {
  opacity: 0.6;
  cursor: progress;
}
.wv-spin {
  animation: wv-spin 1s linear infinite;
}
@keyframes wv-spin {
  to {
    transform: rotate(360deg);
  }
}
.wv-head__sub {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: oklch(var(--bc) / 0.55);
}

/* ---- KPI tiles */
.wv-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.wv-kpi {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.75rem 0.9rem;
  border-radius: 0.8rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.wv-kpi--hero {
  background: linear-gradient(135deg, oklch(var(--su) / 0.12), oklch(var(--b2)) 70%);
}
.wv-kpi__label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.55);
}
.wv-kpi__body {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.wv-kpi__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.wv-kpi__value {
  font-size: 1.35rem;
  font-weight: 750;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.wv-kpi__value--muted {
  color: oklch(var(--bc) / 0.4);
}
.wv-kpi__of {
  font-size: 0.8rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.5);
}
.wv-kpi__sub {
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wv-up {
  color: oklch(var(--su));
}
:root[data-theme-style="light"] .wv-up {
  color: color-mix(in oklab, oklch(var(--su)) 70%, black);
}

/* ---- toolbar */
.wv-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
  margin-bottom: 0.6rem;
}
.wv-toolbar__inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.9rem;
}
.wv-toolbar__options {
  display: none;
}
.wv-seg {
  display: inline-flex;
  padding: 0.15rem;
  border-radius: 0.55rem;
  background: oklch(var(--b2));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.07);
}
.wv-seg__btn {
  padding: 0.25rem 0.75rem;
  border-radius: 0.4rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.6);
}
.wv-seg__btn--on {
  color: oklch(var(--bc));
  background: oklch(var(--b1));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.15), inset 0 0 0 1px oklch(var(--bc) / 0.1);
}
.wv-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.wv-chipbtn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: oklch(var(--bc) / 0.7);
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.12);
}
.wv-chipbtn:hover {
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.3);
}
.wv-chipbtn--on {
  color: oklch(var(--pc));
  background: oklch(var(--p));
  box-shadow: none;
}
.wv-chipbtn__n {
  font-size: 0.68rem;
  opacity: 0.7;
}
.wv-select,
.wv-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.7);
  white-space: nowrap;
}
.wv-switch {
  cursor: pointer;
}
.wv-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.7rem;
  color: oklch(var(--bc) / 0.55);
}
.wv-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.wv-lg {
  display: inline-block;
  width: 1.1rem;
  height: 0.55rem;
  border-radius: 0.15rem;
}
.wv-lg--bar {
  background: oklch(var(--su));
}
.wv-lg--ladder {
  background: repeating-linear-gradient(135deg, oklch(var(--su) / 0.3) 0 3px, oklch(var(--su) / 0.12) 3px 6px);
  box-shadow: inset 0 0 0 1px oklch(var(--su) / 0.35);
}
.wv-lg--whisker {
  height: 2px;
  border-radius: 0;
  background: oklch(var(--bc) / 0.6);
  box-shadow: -1px 0 0 1px oklch(var(--bc) / 0.6);
}

/* ---- progress */
.wv-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.25rem 0 0.75rem;
}
.wv-progress__track {
  flex: 0 0 12rem;
  height: 0.35rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.1);
  overflow: hidden;
}
.wv-progress__track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: oklch(var(--in));
  transition: width 0.25s;
}
.wv-progress__text {
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.6);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- the chart */
.wv-chart {
  padding: 0.35rem;
  border-radius: 0.9rem;
  background: oklch(var(--b1));
  box-shadow: inset 0 0 0 1px oklch(var(--bc) / 0.09);
}
.wv-chart__head {
  display: grid;
  grid-template-columns: var(--wv-cols);
  align-items: end;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem 0.4rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(var(--bc) / 0.5);
  border-bottom: 1px solid oklch(var(--bc) / 0.08);
}
.wv-axis {
  position: relative;
  height: 1rem;
}
.wv-axis__tick {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.wv-list {
  display: flex;
  flex-direction: column;
}
.wv-skeleton {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 14rem) minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-top: 1px solid oklch(var(--bc) / 0.07);
}
.wv-sk {
  display: block;
  border-radius: 0.4rem;
}
.wv-sk--avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
}
.wv-sk--line {
  height: 0.9rem;
}
.wv-sk--bar {
  height: 0.8rem;
  width: 60%;
}
.wv-notsetup {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid oklch(var(--bc) / 0.07);
  opacity: 0.6;
}
.wv-notsetup__name {
  font-weight: 600;
  font-size: 0.85rem;
  min-width: 8rem;
}
.wv-notsetup__text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.65);
}
.wv-none {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.85rem;
  color: oklch(var(--bc) / 0.55);
}
.wv-help {
  margin-top: 1rem;
  font-size: 0.78rem;
  color: oklch(var(--bc) / 0.7);
}
.wv-help summary {
  cursor: pointer;
  font-weight: 600;
  color: oklch(var(--bc) / 0.8);
}
.wv-help ul {
  margin: 0.5rem 0 0 1.1rem;
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.wv-foot {
  margin-top: 1rem;
  font-size: 0.72rem;
  color: oklch(var(--bc) / 0.45);
}
.wv-foot__warn {
  color: oklch(var(--wa));
  cursor: help;
}
:root[data-theme-style="light"] .wv-foot__warn {
  color: color-mix(in oklab, oklch(var(--wa)) 55%, black);
}

/* ---- phone sheet (teleported: not scoped to .wv-page) */
.wv-sheet {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.wv-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.45);
}
.wv-sheet__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 85dvh;
  overflow-y: auto;
  padding: 0.5rem 1rem calc(1rem + env(safe-area-inset-bottom));
  border-radius: 1.1rem 1.1rem 0 0;
  background: oklch(var(--b2));
  color: oklch(var(--bc));
  box-shadow: 0 -12px 40px -10px rgb(0 0 0 / 0.5);
}
.wv-sheet__grip {
  width: 2.5rem;
  height: 0.25rem;
  margin: 0.15rem auto 0.4rem;
  border-radius: 9999px;
  background: oklch(var(--bc) / 0.2);
}
.wv-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.wv-sheet__group {
  padding: 0.5rem 0 0.6rem;
}
.wv-sheet__label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: oklch(var(--bc) / 0.55);
  margin-bottom: 0.4rem;
}
.wv-sheet__seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.wv-sheet__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0;
  border-top: 1px solid oklch(var(--bc) / 0.08);
  font-size: 0.9rem;
}
.wv-sheet__row > span:first-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.wv-sheet__hint {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: oklch(var(--bc) / 0.55);
}

@media (max-width: 1100px) {
  .wv-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .wv-page {
    padding: 0.9rem 0.75rem 2rem;
  }
  .wv-head {
    gap: 0.5rem 0.6rem;
    margin-bottom: 0.75rem;
  }
  .wv-h1 {
    font-size: 1.25rem;
  }
  .wv-tabs {
    order: 3;
    flex: 1 1 100%;
  }
  .wv-tabs__item {
    flex: 1 1 0;
    text-align: center;
  }
  .wv-refresh {
    padding: 0.4rem 0.55rem;
  }
  .wv-head__sub {
    display: none;
  }
  .wv-kpis {
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .wv-kpi {
    padding: 0.6rem 0.7rem;
  }
  .wv-kpi__value {
    font-size: 1.15rem;
  }
  .wv-kpi__sub {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .wv-kpi__body {
    align-items: flex-start;
  }
  .wv-toolbar__inline {
    display: none;
  }
  .wv-toolbar__options {
    display: inline-flex;
  }
  .wv-chart {
    padding: 0.15rem;
  }
  .wv-chart__head {
    display: none;
  }
  .wv-progress__track {
    flex-basis: 6rem;
  }
  .wv-notsetup__text {
    display: none;
  }
}
@media (max-width: 380px) {
  .wv-kpis {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
