// Wuthering Tools+ — the inventory's Echo Lab layer: the plus sort / filter state, the lookups the chips and Ryan's list
// read, and the run that fills them. Verdicts are the Echo Lab pass (useEchoLab: one worker, one cache, shared with
// /echo-lab, so both pages say the same thing); roll ratings are `rollRatings` jobs on the same worker, the echoes on
// screen first, then the rest in batches. Nothing runs on the main thread but the bookkeeping. Vue, not engine.
import { computed, effectScope, reactive, ref, shallowRef, watch, type EffectScope } from "vue";
import { useInventoryStore } from "../../stores/inventory";
import type { EchoVerdict, LabCharacterSummary } from "../echoLab/bestOwner";
import { qualityTarget } from "../echoLab/echoLabView";
import type { RollRatingItem } from "../echoLab/rollRatings";
import { useEchoLab } from "../echoLab/useEchoLab";
import { onAccountAdopted } from "../storage/crossTabSync";
import { applyInventoryView, isInventorySort, type ChipRating, type InventorySort, type InventoryView, type QualityLookup } from "./inventoryQuality";

/** localStorage: the plus sort the player picked (the filter is per visit, like Ryan's own) */
export const INVENTORY_SORT_KEY = "wtplus:inventory:sort";
/** the echoes on screen go first; the rest in batches this big (a batch ≈ 48 × 10 engine scorings) */
const BATCH = 48;
/** an edit on the inventory page re-judges after the edits settle */
const SETTLE_MS = 1500;

function readSort(): InventorySort {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(INVENTORY_SORT_KEY) : null;
    return isInventorySort(v) ? v : "default";
  } catch {
    return "default";
  }
}

// ── module state: one inventory view per app ──
const view = reactive<InventoryView>({ sort: readSort(), feedOnly: false });
/** chips on screen (rated first) */
const onScreen = new Set<string>();

/** Changes whenever the plus sort or filter does: Ryan's page-reset watch lists it, so a new order starts at page 1. */
export const inventoryViewKey = computed(() => `${view.sort}|${view.feedOnly}`);

/** the shared layer's "take the sort's percentiles now" (set once it exists) */
let sortSnapshot: (() => void) | null = null;

export function setInventorySort(sort: InventorySort): void {
  sortSnapshot?.();
  view.sort = sort;
  try {
    if (sort === "default") localStorage.removeItem(INVENTORY_SORT_KEY);
    else localStorage.setItem(INVENTORY_SORT_KEY, sort);
  } catch {
    // no storage: the choice lasts this visit
  }
}

export function setFeedOnly(on: boolean): void {
  view.feedOnly = on;
}

interface Shared {
  lab: ReturnType<typeof useEchoLab>;
  /** the verdicts the chips show: the current pass's, or while Echo Lab re-judges after an edit, the last one's */
  verdicts: { readonly value: Map<string, EchoVerdict> };
  characters: { readonly value: Map<string, LabCharacterSummary> };
  /** the pass is in, for this account, and had builds to judge against */
  judged: { readonly value: boolean };
  /** Echo Lab is re-judging (an edit, an import, a re-run): `verdicts` holds the last pass's until the new one lands */
  stale: { readonly value: boolean };
  /** nothing to judge against (no built character, a pass that found no five-echo build) or the pass failed: no chips */
  unavailable: { readonly value: boolean };
  /** where each levelled echo is rated (qualityTarget); echoes without lines or without a build are absent */
  targets: { readonly value: Map<string, { characterId: string; slot: number }> };
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  ratingFor: (echoId: string) => ChipRating | null | undefined;
  lookup: QualityLookup;
  /** levelled echoes with a build, and how many of them have a rating for the current pass (or could not get one) */
  progress: { readonly value: { rateable: number; rated: number } };
  /** a rating batch failed three times running (the worker, not the account): the bar offers Try again */
  ratingFailed: { readonly value: boolean };
  retryRatings: () => void;
  activate: () => () => void;
}

let shared: Shared | null = null;

/** an echo's lines as text: a rating held over from an older pass applies only while they are the same */
const linesKey = (row: EchoVerdict | undefined): string => (row ? row.subs.map((l) => `${l.key}:${l.value}`).join(",") : "");

/** One detached effect scope for the app's lifetime. Made from the first chip's setup, the computeds and watchers
 *  (useEchoLab's too) would otherwise belong to that chip and stop when it unmounts: the list's next page. */
function createShared(): Shared {
  const scope = effectScope(true);
  return scope.run(() => buildShared(scope)) as Shared;
}

function buildShared(scope: EffectScope): Shared {
  const lab = useEchoLab();
  const inventoryStore = useInventoryStore() as unknown as { echoes: any[]; equipped: Record<string, unknown> };

  const liveVerdicts = computed(() => new Map((lab.pass.value?.bestOwner.echoes ?? []).map((r) => [r.echoId, r])));
  const liveCharacters = computed(() => new Map((lab.pass.value?.bestOwner.characters ?? []).map((c) => [c.id, c])));
  const judged = computed(() => !!lab.pass.value && !lab.passStatus.running && liveCharacters.value.size > 0);
  const unavailable = computed(
    () =>
      !lab.builtCount.value ||
      (!!lab.pass.value && !lab.passStatus.running && liveCharacters.value.size === 0) ||
      (!lab.pass.value && !lab.passStatus.running && (!!lab.passStatus.error || lab.passStatus.cancelled)),
  );
  // stale-while-revalidate: marking echoes as trash or locking one changes the account, so Echo Lab judges it again
  // (~2 s); meanwhile the chips, the "Feed candidates" filter and the plus sort keep the last pass instead of
  // emptying the list under the player's thumb
  const held = shallowRef<{ verdicts: Map<string, EchoVerdict>; characters: Map<string, LabCharacterSummary> } | null>(null);
  watch(
    judged,
    (on) => {
      if (on) held.value = { verdicts: liveVerdicts.value, characters: liveCharacters.value };
    },
    { immediate: true },
  );
  watch(unavailable, (none) => {
    if (none) held.value = null;
  });
  const stale = computed(() => !judged.value && !unavailable.value && !!held.value);
  const verdicts = computed(() => (judged.value ? liveVerdicts.value : held.value?.verdicts ?? liveVerdicts.value));
  const characters = computed(() => (judged.value ? liveCharacters.value : held.value?.characters ?? liveCharacters.value));
  const targets = computed(() => {
    const out = new Map<string, { characterId: string; slot: number }>();
    for (const row of verdicts.value.values()) {
      if (!row.lines) continue;
      const t = qualityTarget(row, characters.value);
      if (t) out.set(row.echoId, t);
    }
    return out;
  });

  /** this pass's rating: the exact one when Echo Lab's detail has run it for this echo, else the quick one */
  function liveRating(echoId: string, t: { characterId: string; slot: number }): ChipRating | null | undefined {
    const exact = lab.qualityOf(echoId, t);
    if (exact && !("error" in exact)) return { percentile: exact.percentile, lines: exact.lines, level: exact.level, characterId: exact.characterId, slot: exact.slot, worn: exact.worn, exact: true };
    const quick = lab.ratingOf(echoId, t);
    if (quick === undefined || quick === null) return quick;
    return { percentile: quick.percentile, lines: quick.lines, level: quick.level, characterId: quick.characterId, slot: quick.slot, worn: quick.worn, exact: false };
  }
  /** ratings seen, by echo, target and lines: an older pass's answer stands in while the new one is worked out (plain
   *  Map: only ever written from what `liveRating` read, so nothing here needs to be reactive) */
  const heldRatings = new Map<string, ChipRating | null>();

  function ratingFor(echoId: string): ChipRating | null | undefined {
    const t = targets.value.get(echoId);
    if (!t) return null;
    const key = `${echoId}|${t.characterId}|${t.slot}|${linesKey(verdicts.value.get(echoId))}`;
    const live = judged.value ? liveRating(echoId, t) : undefined;
    if (live !== undefined) {
      heldRatings.set(key, live);
      return live;
    }
    return heldRatings.get(key);
  }

  // The sort reads the percentiles as they were at the last snapshot, not live: re-sorting on every batch re-rendered
  // Ryan's tiles (a Popper per tooltip) five or six times while the chips filled, one task 301 ms on a phone. The
  // snapshot is taken when a rating run ends, when a pass lands and when the player picks a sort.
  const sortPercentiles = shallowRef<Map<string, number>>(new Map());
  function snapshotSort(): void {
    const next = new Map<string, number>();
    for (const id of targets.value.keys()) {
      const r = ratingFor(id);
      if (r) next.set(id, r.percentile);
    }
    sortPercentiles.value = next;
  }
  sortSnapshot = snapshotSort;
  watch(judged, () => snapshotSort());

  const lookup: QualityLookup = {
    verdict: (echoId) => verdicts.value.get(echoId)?.verdict ?? null,
    percentile: (echoId) => sortPercentiles.value.get(echoId) ?? null,
  };

  const progress = computed(() => {
    let rated = 0;
    if (judged.value) for (const [id, t] of targets.value) if (liveRating(id, t) !== undefined) rated += 1;
    return { rateable: targets.value.size, rated };
  });

  // ── the run ──
  const ratingFailed = ref(false);
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  function retryRatings(): void {
    ratingFailed.value = false;
    failures = 0;
    void rateAll();
  }
  let active = 0;
  let loop: AbortController | null = null;
  /** the pass the running loop rates for: a second ask for the same pass leaves it running */
  let loopPass: unknown = null;
  let settle: ReturnType<typeof setTimeout> | null = null;

  async function rateAll(): Promise<void> {
    if (loop && loopPass === lab.pass.value) return;
    loop?.abort();
    loop = null;
    if (!active || !judged.value) return;
    const controller = new AbortController();
    loop = controller;
    loopPass = lab.pass.value;
    const todo: RollRatingItem[] = [];
    for (const [echoId, t] of targets.value) if (liveRating(echoId, t) === undefined) todo.push({ echoId, ...t });
    if (!todo.length) {
      loop = null;
      snapshotSort();
      return;
    }
    // whatever is on screen goes next (the first page, then the page the player turns to), the rest 48 at a time
    const remaining = new Map(todo.map((t) => [t.echoId, t]));
    // one snapshot for every batch: the worker keys its session by it, and the stores can't change under a batch
    const snap = lab.snapshot();
    while (remaining.size) {
      if (controller.signal.aborted) return;
      const shown = [...remaining.values()].filter((t) => onScreen.has(t.echoId));
      const batch = (shown.length ? shown : [...remaining.values()]).slice(0, BATCH);
      for (const t of batch) remaining.delete(t.echoId);
      const ok = await lab.runRollRatings(batch, controller.signal, snap, remaining.size === 0);
      if (!ok) {
        // an edit meanwhile re-judges on its own (the settle watcher); anything else is the worker: try twice more
        if (!controller.signal.aborted && loopPass === lab.pass.value && judged.value) {
          failures += 1;
          if (failures <= 2) retry = setTimeout(() => void rateAll(), 2000 * failures);
          else ratingFailed.value = true;
        }
        break;
      }
      failures = 0;
    }
    if (!controller.signal.aborted && !remaining.size) snapshotSort();
    if (loop === controller) loop = null;
  }

  function ensurePass(): void {
    if (!active) return;
    void lab.refresh();
  }

  // a new pass (this page's, or one /echo-lab ran): rate what is not rated yet
  watch(lab.pass, () => void rateAll());
  // a pass that ran for an account state that changed meanwhile is dropped; ask again once it stops
  watch(
    () => lab.passStatus.running,
    (running) => {
      if (!running && !lab.pass.value && !lab.passStatus.error && !lab.passStatus.cancelled) ensurePass();
    },
  );
  // an edit, import or delete on this page: judge the new inventory once the edits settle. Made on the first
  // activation (a deep watch walks every echo once), which the bar runs after the page's first paint.
  let watchingStores = false;
  function watchStores(): void {
    if (watchingStores) return;
    watchingStores = true;
    // Another tab's edit (a character's weapon, a build, a team), adopted by this one: judged again, as every other
    // scored page does. The inventory watch below never saw it, so the chips, the Feed candidates filter and the plus
    // sort kept the old verdicts until the page was left (2026-11-08 hunt F3: 71 feed where the page now says 66).
    // Registered here, from the bar's first activation (a task of its own, no component current), so it belongs to
    // this layer's scope and not to the chip that happened to make it
    scope.run(() => onAccountAdopted(() => ensurePass()));
    scope.run(() =>
      watch(
        () => [inventoryStore.echoes, inventoryStore.equipped],
        () => {
          if (!active) return;
          if (settle) clearTimeout(settle);
          settle = setTimeout(() => {
            settle = null;
            ensurePass();
          }, SETTLE_MS);
        },
        { deep: true },
      ),
    );
  }

  /** The inventory page is up: judge (or read the cache), then rate. Returns the matching "page left". */
  function activate(): () => void {
    watchStores();
    active += 1;
    void lab.refresh().then(() => rateAll());
    let done = false;
    return () => {
      if (done) return;
      done = true;
      active -= 1;
      if (active > 0) return;
      // leave the worker free for whatever the next page asks (Echo Lab's exact roll, say)
      loop?.abort();
      loop = null;
      if (settle) clearTimeout(settle);
      settle = null;
      if (retry) clearTimeout(retry);
      retry = null;
    };
  }

  return { lab, verdicts, characters, judged, stale, unavailable, targets, ratingFor, lookup, progress, ratingFailed, retryRatings, activate };
}

/** The inventory's Echo Lab layer (created on first use, then shared by the bar, every chip and the list hook). */
export function useInventoryQuality(): Shared & { view: InventoryView } {
  shared ??= createShared();
  return { ...shared, view };
}

/** A chip is on screen (its echo is rated in the first batch). */
export function chipShown(echoId: string): () => void {
  onScreen.add(echoId);
  return () => onScreen.delete(echoId);
}

/**
 * The hook in Ryan's InventoryEchoesBrowser.vue (`echoesList`): his filtered list through the plus sort and the
 * "Feed candidates" filter. "Inventory order" with the filter off returns his list untouched, without touching
 * the Echo Lab at all. `keepOrder`: his list is ranked and the order means something ("Finish these first" puts its
 * "Fresh echo" divider before the first echo that does not beat a fresh one, Duplicates sits copies side by side), so
 * the plus sort stands aside while either is on. "Feed candidates" is a filter, not an order: it still narrows.
 */
export function plusInventoryView<T extends { echoId: string }>(list: T[], keepOrder = false): T[] {
  const sort = keepOrder ? "default" : view.sort;
  if (sort === "default" && !view.feedOnly) return list;
  const q = useInventoryQuality();
  // no verdicts to go by (no build to judge against, a failed or cancelled pass): his list as it is. "Feed candidates"
  // left on would otherwise empty it, with the bar's controls hidden (no builds) or the toggle waiting on counts
  if (q.unavailable.value) return list;
  return applyInventoryView(list, { sort, feedOnly: view.feedOnly }, q.lookup);
}
