// Wuthering Tools+ — the page state for builds with two exclusive buffs on: the account's conflicts, the three figures
// for each one, and the one-tap "Keep only" that writes what Ryan's own switch would write.
//
// One state for the whole app (module-level): /account's top block, its character drawer and the /my-rankings rows all
// read the same check, so it runs once per visit and again when a switch it reads changes. The figures run on plain
// copies of the stores, in slices; nothing is written unless the player taps Keep only.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type ComputedRef } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { slicer } from "../account/investPlan";
import { snapshotCharacters } from "../buildHistory/history";
import { accountAdoptions } from "../storage/crossTabSync";
import { appDefs, conflictId, conflictsIn, findBuffConflicts, keepOnlyUpdate, sideLabels, type BuffConflict } from "./buffConflicts";
import { conflictFigures, type ConflictFigures } from "./conflictFigures";
import { overcountOf, type Overcount } from "./conflictText";

export interface ConflictView {
  id: string;
  conflict: BuffConflict;
  /** null until measured */
  figures: ConflictFigures | null;
  measured: boolean;
  over: Overcount;
}

export interface KeptNote {
  characterId: string;
  /** what stayed on */
  kept: string;
  /** what was switched off */
  off: string;
  /** a Build history version of the build as it was is stored (false: it already was the newest version, or the
   *  character has no build to save) */
  versionSaved: boolean;
}

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(toRaw(value) ?? null)) as T;

const conflicts = shallowRef<BuffConflict[]>([]);
const figures = shallowRef<Record<string, ConflictFigures | null>>({});
const state = ref<"idle" | "checking" | "done">("idle");
const kept = ref<KeptNote | null>(null);
let generation = 0;
let users = 0;
let stopWatching: (() => void) | null = null;

/** The slices of the character store the check reads: when this text changes, the conflicts may have. */
export function switchesKey(characters: Record<string, any> | null | undefined): string {
  const of = (r: Record<string, any> | null | undefined): unknown[] => [r?.weapon ?? null, r?.buffs ?? null, r?.resonanceChains ?? null, r?.weaponPassives ?? null];
  return JSON.stringify(
    Object.keys(characters ?? {})
      .sort()
      .map((id) => {
        const c = characters![id];
        return [id, c?.activeBuildId ?? null, of(c), ((c?.builds ?? []) as Array<Record<string, any>>).map((b) => [b?.id ?? null, b?.name ?? null, of(b)])];
      }),
  );
}

async function check(): Promise<void> {
  const gen = ++generation;
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  // plain copies: the engine and the check never see the stores
  const characters = plain(characterStore.characters ?? {}) as Record<string, any>;
  const echoes = plain((inventoryStore.echoes ?? []) as any[]);
  const teams = plain((teamStore.teams ?? []) as any[]);
  state.value = "checking";
  let found: BuffConflict[];
  try {
    // a character with no weapon on any build is scored nowhere, so no figure of theirs can read too high: their kit
    // is not loaded for this (the pure check itself reads every character it is handed)
    const armed = Object.fromEntries(Object.entries(characters).filter(([, c]) => c?.weapon || ((c?.builds ?? []) as Array<Record<string, any>>).some((b) => b?.weapon)));
    found = await findBuffConflicts(armed);
  } catch {
    found = []; // a kit that will not load: no notice is better than a wrong one
  }
  if (gen !== generation) return;
  conflicts.value = found;
  figures.value = {};
  const slice = slicer(true);
  for (const c of found) {
    let f: ConflictFigures | null;
    try {
      f = await conflictFigures(c, characters, echoes, teams, { autoTeamBuffs: autoTeamBuffs.value, slice });
    } catch {
      f = null;
    }
    if (gen !== generation) return;
    figures.value = { ...figures.value, [conflictId(c)]: f };
  }
  state.value = "done";
}

/** Keeps one side of a pair on the build that is shown (the build in use): a Build history version first, then the
 *  update his own switch writes, through the store action his switch uses. False, with nothing written, when the pair
 *  is no longer both on in that build (the calculator or another tab got there first) or it is not the build in use. */
async function keepOnly(conflict: BuffConflict, keep: 0 | 1): Promise<boolean> {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const live = characterStore.characters?.[conflict.characterId] as Record<string, any> | undefined;
  const liveCopy = plain(live ?? null) as Record<string, any> | null;
  const defs = liveCopy ? await appDefs(conflict.characterId, liveCopy) : null;
  const buildNow = liveCopy ? (liveCopy.activeBuildId ?? liveCopy.builds?.[0]?.id ?? null) : null;
  const same = (p: BuffConflict["sides"]): boolean => p.every((s, i) => s.category === conflict.sides[i].category && s.key === conflict.sides[i].key);
  const stillOn = !!defs && !!liveCopy && conflictsIn(defs, liveCopy).some(same);
  if (!conflict.active || !defs || !stillOn || buildNow !== conflict.buildId) {
    void check();
    return false;
  }
  const saved = snapshotCharacters([conflict.characterId], "before-buff-fix", { characters: characterStore.characters, echoes: (inventoryStore.echoes ?? []) as any[] });
  characterStore.setCharacterData(conflict.characterId, keepOnlyUpdate(conflict, keep, defs));
  const labels = sideLabels(conflict);
  kept.value = { characterId: conflict.characterId, kept: labels[keep], off: labels[keep === 0 ? 1 : 0], versionSaved: saved.some((r) => r.saved) };
  return true; // the watcher below checks again: the switches changed
}

export interface BuffConflictsState {
  /** every pair found, with its figures once measured */
  views: ComputedRef<ConflictView[]>;
  /** the pairs the engine counts twice: the ones whose figures read too high */
  counted: ComputedRef<ConflictView[]>;
  /** pairs that are on together and move no figure (the engine already takes one alone) */
  quiet: ComputedRef<ConflictView[]>;
  checking: ComputedRef<boolean>;
  kept: typeof kept;
  keepOnly: typeof keepOnly;
  recheck: () => Promise<void>;
}

export function useBuffConflicts(): BuffConflictsState {
  onMounted(() => {
    users += 1;
    if (users === 1) {
      const characterStore = useCharacterStore();
      // a fresh look on each visit (echoes, teams and rotations move the figures too), then whenever a switch changes
      // or this tab takes another tab's write
      const stops = [watch(() => switchesKey(characterStore.characters as Record<string, any>), () => void check()), watch(accountAdoptions, () => void check())];
      stopWatching = () => stops.forEach((stop) => stop());
      kept.value = null;
      void check();
    }
  });
  onBeforeUnmount(() => {
    users -= 1;
    if (users > 0) return;
    stopWatching?.();
    stopWatching = null;
    generation += 1; // a check in flight is dropped
    state.value = "idle";
  });

  const views = computed<ConflictView[]>(() =>
    conflicts.value.map((conflict) => {
      const id = conflictId(conflict);
      const measured = id in figures.value;
      const f = figures.value[id] ?? null;
      return { id, conflict, figures: f, measured, over: overcountOf(f) };
    }),
  );
  return {
    views,
    counted: computed(() => views.value.filter((v) => v.measured && v.over.kind === "twice")),
    quiet: computed(() => views.value.filter((v) => v.measured && (v.over.kind === "stronger" || v.over.kind === "neither"))),
    checking: computed(() => state.value === "checking"),
    kept,
    keepOnly,
    recheck: check,
  };
}

/** For tests: the shared state back to empty. */
export function resetBuffConflicts(): void {
  generation += 1;
  conflicts.value = [];
  figures.value = {};
  state.value = "idle";
  kept.value = null;
  users = 0;
  stopWatching?.();
  stopWatching = null;
}
