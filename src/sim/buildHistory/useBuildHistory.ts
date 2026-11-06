// Wuthering Tools+ build history — the page's state: one character's versions, the build as it is now, the damage of
// each on the character's best rotation (scored one at a time, cached by content), the comparison the player picked,
// and the three writes (save, restore, delete). The stores are only read here, except through history.ts / restore.ts.
import { computed, ref, shallowRef, watch, type Ref } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { characterMeta } from "../display/names";
import { deleteVersion, hasBuild, readHistory, recordVersion, versionOf, type HistoryVersion, type RecordResult } from "./history";
import { bestRotationOf, characterScreenStats, damageOf, gearDiff, statRows, type DamageReading, type GearDiff, type RotationRef, type StatRow } from "./diff";
import { applyRestore, planRestore, type RestoreOutcome, type RestorePlan, type RestoreStores } from "./restore";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const NOW_ID = "now";

export interface Comparison {
  from: HistoryVersion;
  to: HistoryVersion;
  gear: GearDiff;
  stats: StatRow[] | null;
  /** undefined while it is being scored, null when it can't be (no weapon) */
  fromDamage: DamageReading | null | undefined;
  toDamage: DamageReading | null | undefined;
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;
const yieldNow = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export function useBuildHistory(charId: Ref<string | null>) {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();

  const versions = shallowRef<HistoryVersion[]>([]);
  const compareFrom = ref<string | null>(null);
  const compareTo = ref<string>(NOW_ID);
  /** bumped after every write, so `now` and the list re-read */
  const tick = ref(0);
  const record = computed(() => (charId.value ? (characterStore.characters as Record<string, any>)?.[charId.value] : undefined));
  /** the live build as a version (id "now"), or null when the character has no build */
  const now = computed<HistoryVersion | null>(() => {
    void tick.value;
    const id = charId.value;
    if (!id || !hasBuild(record.value)) return null;
    const v = versionOf(id, record.value, inventoryStore.echoes as any[], "manual");
    return { ...v, id: NOW_ID };
  });

  const rotation = shallowRef<RotationRef | null>(null);
  const rotationBusy = ref(false);
  /** damage by version fingerprint (+ rotation key), so equal builds score once */
  const damage = ref<Record<string, DamageReading | null>>({});
  let scoreToken = 0;

  function reload(): void {
    versions.value = charId.value ? readHistory(charId.value) : [];
    // the comparison opens on the newest version against now; a pick that no longer exists falls back to it
    if (!versions.value.some((v) => v.id === compareFrom.value)) compareFrom.value = versions.value[0]?.id ?? null;
    if (compareTo.value !== NOW_ID && !versions.value.some((v) => v.id === compareTo.value)) compareTo.value = NOW_ID;
    tick.value++;
  }

  const damageKey = (v: HistoryVersion): string => `${v.fp}|${rotation.value?.key ?? ""}`;
  function damageFor(v: HistoryVersion | null): DamageReading | null | undefined {
    if (!v) return undefined;
    // no rotation scores anywhere (no weapon): there is no figure to wait for
    if (!rotation.value) return rotationBusy.value ? undefined : null;
    return damage.value[damageKey(v)];
  }

  async function scoreAll(): Promise<void> {
    const token = ++scoreToken;
    const id = charId.value;
    if (!id) return;
    rotationBusy.value = true;
    const chars = plain(characterStore.characters) as Record<string, any>;
    const echoes = plain(inventoryStore.echoes) as any[];
    try {
      if (!rotation.value) {
        const r = await bestRotationOf(id, chars, echoes, versions.value.map((v) => v.payload.members[0]));
        if (token !== scoreToken) return;
        rotation.value = r;
      }
    } finally {
      if (token === scoreToken) rotationBusy.value = false;
    }
    const rot = rotation.value;
    if (!rot) return;
    const queue = [now.value, ...versions.value].filter((v): v is HistoryVersion => !!v);
    for (const v of queue) {
      if (token !== scoreToken) return;
      const key = damageKey(v);
      if (key in damage.value) continue;
      const d = await damageOf(id, v.payload.members[0], rot, chars, echoes);
      if (token !== scoreToken) return;
      damage.value = { ...damage.value, [key]: d };
      await yieldNow();
    }
  }

  // --- the comparison
  const comparison = shallowRef<Comparison | null>(null);
  const comparing = ref(false);
  let compareToken = 0;

  const byId = (id: string | null): HistoryVersion | null => (id === NOW_ID ? now.value : (versions.value.find((v) => v.id === id) ?? null));

  async function runCompare(): Promise<void> {
    const token = ++compareToken;
    const from = byId(compareFrom.value);
    const to = byId(compareTo.value);
    const id = charId.value;
    if (!from || !to || !id) {
      comparison.value = null;
      return;
    }
    const gear = gearDiff(id, from.payload.members[0], to.payload.members[0]);
    comparison.value = { from, to, gear, stats: null, fromDamage: damageFor(from), toDamage: damageFor(to) };
    comparing.value = true;
    try {
      const [a, b] = await Promise.all([characterScreenStats(id, from.payload.members[0]), characterScreenStats(id, to.payload.members[0])]);
      if (token !== compareToken) return;
      comparison.value = { ...comparison.value, stats: statRows(a, b, characterMeta(id)?.element ?? null) };
    } catch {
      // stats are a bonus on top of the gear diff
    } finally {
      if (token === compareToken) comparing.value = false;
    }
  }

  function compare(fromId: string, toId: string = NOW_ID): void {
    compareFrom.value = fromId;
    compareTo.value = toId;
  }

  watch([compareFrom, compareTo, () => tick.value, () => now.value?.fp], () => void runCompare());
  // the build changed under the page (another tab's edit reaches the store on reload only, a write here at once)
  watch(() => now.value?.fp, (fp, old) => {
    if (fp && old && fp !== old) void scoreAll();
  });
  // damage arrives one version at a time: keep the comparison's figures current
  watch(damage, () => {
    const c = comparison.value;
    if (!c) return;
    const fromDamage = damageFor(c.from);
    const toDamage = damageFor(c.to);
    if (fromDamage !== c.fromDamage || toDamage !== c.toDamage) comparison.value = { ...c, fromDamage, toDamage };
  });

  watch(
    charId,
    () => {
      scoreToken++;
      compareToken++;
      rotation.value = null;
      comparison.value = null;
      compareFrom.value = null;
      compareTo.value = NOW_ID;
      reload();
      void scoreAll();
    },
    { immediate: true },
  );

  // --- writes
  function save(): RecordResult | null {
    const id = charId.value;
    if (!id) return null;
    const out = recordVersion(id, plain(record.value), plain(inventoryStore.echoes) as any[], "manual");
    reload();
    void scoreAll();
    return out;
  }

  function planFor(v: HistoryVersion): RestorePlan | null {
    const id = charId.value;
    if (!id) return null;
    return planRestore(id, v, { characters: plain(characterStore.characters), echoes: plain(inventoryStore.echoes), equipped: plain(inventoryStore.equipped) });
  }

  /** `id`: the character the player was asked about. The page can move on while the confirm is open, and a version
   *  written onto whoever is picked by then puts one character's gear on another. */
  function restore(v: HistoryVersion, id: string | null = charId.value): RestoreOutcome | null {
    if (!id) return null;
    const out = applyRestore({ character: characterStore, inventory: inventoryStore } as unknown as RestoreStores, id, v);
    // the best rotation may differ on the restored build
    rotation.value = null;
    reload();
    // the comparison shows what the restore changed: the build from just before it → now
    if (out.before.version && versions.value.some((x) => x.id === out.before.version!.id)) compare(out.before.version.id, NOW_ID);
    void scoreAll();
    return out;
  }

  function remove(v: HistoryVersion): boolean {
    const id = charId.value;
    if (!id) return false;
    const ok = deleteVersion(id, v.id);
    if (compareFrom.value === v.id) compareFrom.value = null;
    if (compareTo.value === v.id) compareTo.value = NOW_ID;
    reload();
    return ok;
  }

  return { versions, now, rotation, rotationBusy, damageFor, compareFrom, compareTo, comparison, comparing, compare, save, planFor, restore, remove, reload, byId };
}
