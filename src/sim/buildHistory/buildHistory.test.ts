// Wuthering Tools+ build history: versions in the share format, dedupe and the caps, the diff in words, the engine
// numbers of a version, and a restore through the real Pinia stores — on the Cartethyia account fixture (one full
// build, 17 inventory echoes, one saved rotation; public data, already used by the share tests).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { buildCharacterCalculationContext } from "../../calculator/buildCharacterContext";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { RANKING_ENEMY, scoreRotation } from "../myRankings/rankRoster";
import { buildPayload } from "../share/buildCodec";
import { buildHeadline } from "../share/headline";
import {
  HISTORY_PREFIX,
  charactersWithHistory,
  clearHistoryMemory,
  deleteVersion,
  historyInMemoryOnly,
  memoryStorage,
  readHistory,
  recordVersion,
  snapshotCharacters,
  versionOf,
  type HistoryVersion,
} from "./history";
import { bestRotationOf, changeText, characterScreenStats, damageOf, gearDiff, memberRecord, slotDiffs, statRows } from "./diff";
import { applyRestore, planRestore, restoredRecord, type RestoreStores } from "./restore";

/* eslint-disable @typescript-eslint/no-explicit-any */

const characters = account.characters as Record<string, any>;
const echoes = account.echoes as any[];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const T0 = new Date(2026, 9, 31, 12, 0).getTime();

/** Cartethyia with a different build: R5 instead of R1, and slot 2 wearing another 1-cost echo of the inventory. */
function changedCart(): { record: Record<string, any>; swapped: string } {
  const record = clone(characters.Cartethyia);
  record.weapons = { [record.weapon]: { refinement: "5" } };
  const worn = new Set(Object.values(record.echoes).map((s: any) => s.echoId));
  const other = echoes.find((e) => e.type === 1 && !worn.has(e.echoId))!;
  record.echoes["2"] = { ...record.echoes["2"], echoId: other.echoId };
  return { record, swapped: other.echoId };
}

describe("versions are share-format payloads", () => {
  it("stores the live build exactly as a share card would carry it and reads it back unchanged", () => {
    const storage = memoryStorage();
    const out = recordVersion("Cartethyia", characters.Cartethyia, echoes, "manual", { storage, now: T0 });
    expect(out.saved).toBe(true);
    const [v] = readHistory("Cartethyia", storage);
    expect(v.label).toBe("manual");
    expect(v.at).toBe(T0);
    const card = buildPayload("Cartethyia", characters.Cartethyia, null, echoes, { detail: "full", now: new Date(T0) });
    expect(v.payload.format).toBe("wtplus-build");
    expect(v.payload.members[0]).toEqual(JSON.parse(JSON.stringify(card.members[0])));
    // five inline echoes with their exact substats: the version means something after a re-import
    expect(v.payload.members[0].echoes.filter(Boolean)).toHaveLength(5);
    expect(storage.data.has(`${HISTORY_PREFIX}Cartethyia`)).toBe(true);
  });

  it("is read through the share reader: a damaged entry is dropped, a newer format version is ignored", () => {
    const storage = memoryStorage();
    recordVersion("Cartethyia", characters.Cartethyia, echoes, "manual", { storage, now: T0 });
    const raw = JSON.parse(storage.getItem(`${HISTORY_PREFIX}Cartethyia`)!);
    raw.versions.push({ ...raw.versions[0], id: "bad", payload: { format: "nope" } });
    raw.versions.push({ ...raw.versions[0], id: "newer", payload: { ...raw.versions[0].payload, v: 99 } });
    storage.setItem(`${HISTORY_PREFIX}Cartethyia`, JSON.stringify(raw));
    expect(readHistory("Cartethyia", storage).map((v) => v.id)).toEqual([raw.versions[0].id]);
    storage.setItem(`${HISTORY_PREFIX}Broken`, "{not json");
    expect(readHistory("Broken", storage)).toEqual([]);
    expect(charactersWithHistory(storage)).toEqual(["Cartethyia"]);
  });

  it("a version scores exactly what the live build scores: same character-screen stats, same rotation damage", async () => {
    const v = versionOf("Cartethyia", characters.Cartethyia, echoes, "manual", T0);
    const member = v.payload.members[0];
    const enemy = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" } as any;
    const live = await buildCharacterCalculationContext("Cartethyia", characters, enemy, echoes, { alwaysEnabledOnly: true });
    const fromVersion = await buildCharacterCalculationContext("Cartethyia", { Cartethyia: memberRecord(member) }, enemy, [], { alwaysEnabledOnly: true });
    expect(fromVersion.finalStats).toEqual(live.finalStats);
    const best = await bestRotationOf("Cartethyia", characters, echoes);
    expect(best).not.toBeNull();
    const h = await buildHeadline("Cartethyia", characters, echoes);
    expect(best!.name).toBe(h!.headline.rotationName);
    const d = await damageOf("Cartethyia", member, best!, characters, echoes);
    expect(d!.avgDamage).toBe(h!.headline.avgDamage);
  });
});

describe("dedupe and caps", () => {
  it("does not store a build identical to the newest version (a rename is the same build)", () => {
    const storage = memoryStorage();
    expect(recordVersion("Cartethyia", characters.Cartethyia, echoes, "manual", { storage, now: T0 }).saved).toBe(true);
    const renamed = { ...clone(characters.Cartethyia), builds: [{ id: "b1", name: "Renamed" }], activeBuildId: "b1" };
    const again = recordVersion("Cartethyia", renamed, echoes, "before-build-team", { storage, now: T0 + 1000 });
    expect(again).toMatchObject({ saved: false, reason: "same-as-latest" });
    expect(again.version!.at).toBe(T0);
    const { record } = changedCart();
    expect(recordVersion("Cartethyia", record, echoes, "manual", { storage, now: T0 + 2000 }).saved).toBe(true);
    // the same as an OLDER version is a new moment: stored
    expect(recordVersion("Cartethyia", characters.Cartethyia, echoes, "before-restore", { storage, now: T0 + 3000 }).saved).toBe(true);
    expect(readHistory("Cartethyia", storage).map((v) => v.label)).toEqual(["before-restore", "manual", "manual"]);
  });

  it("keeps at most 20 versions per character, dropping the oldest", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 25; i++) {
      const r = clone(characters.Cartethyia);
      r.weaponPassives = { ...(r.weaponPassives ?? {}), probe: { stacks: i } };
      recordVersion("Cartethyia", r, echoes, "manual", { storage, now: T0 + i * 1000 });
    }
    const list = readHistory("Cartethyia", storage);
    expect(list).toHaveLength(20);
    expect(list[0].at).toBe(T0 + 24000);
    expect(list[19].at).toBe(T0 + 5000);
  });

  it("keeps every history together under the size budget, oldest of the longest history first", () => {
    const storage = memoryStorage();
    const one = JSON.stringify({ v: 1, versions: [versionOf("Cartethyia", characters.Cartethyia, echoes, "manual", T0)] }).length;
    for (let i = 0; i < 6; i++) {
      const r = clone(characters.Cartethyia);
      r.weaponPassives = { probe: { stacks: i } };
      recordVersion("Cartethyia", r, echoes, "manual", { storage, now: T0 + i, maxTotalChars: one * 8 });
    }
    recordVersion("Other", { ...clone(characters.Cartethyia) }, echoes, "manual", { storage, now: T0 + 100, maxTotalChars: one * 8 });
    for (let i = 6; i < 12; i++) {
      const r = clone(characters.Cartethyia);
      r.weaponPassives = { probe: { stacks: i } };
      recordVersion("Cartethyia", r, echoes, "manual", { storage, now: T0 + i, maxTotalChars: one * 8 });
    }
    const total = storage.keys().reduce((n, k) => n + storage.getItem(k)!.length, 0);
    expect(total).toBeLessThanOrEqual(one * 8);
    // the short history keeps its one version; the long one lost its oldest
    expect(readHistory("Other", storage)).toHaveLength(1);
    const cart = readHistory("Cartethyia", storage);
    expect(cart[0].at).toBe(T0 + 11);
    expect(cart.length).toBeLessThan(12);
  });

  it("snapshots several characters at once, skipping one with no build and never throwing", () => {
    const storage = memoryStorage();
    const out = snapshotCharacters(["Cartethyia", "Cartethyia", "Nobody", null], "before-build-team", { characters: { ...characters, Nobody: { buildStatus: "none" } }, echoes }, { storage, now: T0 });
    expect(out.map((r) => r.saved)).toEqual([true, false]);
    expect(out[1].reason).toBe("no-build");
    expect(readHistory("Cartethyia", storage)[0].label).toBe("before-build-team");
    expect(deleteVersion("Cartethyia", readHistory("Cartethyia", storage)[0].id, storage)).toBe(true);
    expect(readHistory("Cartethyia", storage)).toEqual([]);
  });
});

describe("a write the browser refused, then room again (2026-11-08 hunt H2)", () => {
  /** a browser storage that refuses every write while `full` */
  function quotaStorage() {
    const inner = memoryStorage();
    const box = { full: false };
    return {
      box,
      inner,
      getItem: inner.getItem,
      removeItem: inner.removeItem,
      keys: inner.keys,
      setItem(k: string, v: string) {
        if (box.full) throw new DOMException("full", "QuotaExceededError");
        inner.setItem(k, v);
      },
    };
  }
  /** Cartethyia with a marker, so each version is a build of its own */
  const build = (n: number) => {
    const r = clone(characters.Cartethyia);
    r.weaponPassives = { probe: { stacks: n } };
    return r;
  };
  /** each version by when it was taken: 0, 1, 2 … seconds after T0 */
  const stacks = (list: HistoryVersion[]) => list.map((v) => (v.at - T0) / 1000);
  const stored = (storage: ReturnType<typeof quotaStorage>) => stacks(readHistory("Cartethyia", storage.inner));

  // the page-memory lists are the module's, per character: none may reach another test
  beforeEach(() => clearHistoryMemory());
  afterEach(() => clearHistoryMemory());

  it("a version stored once there is room again is on the page, and nothing is written over later", () => {
    const storage = quotaStorage();
    recordVersion("Cartethyia", build(1), echoes, "manual", { storage, now: T0 });
    storage.box.full = true;
    expect(recordVersion("Cartethyia", build(2), echoes, "manual", { storage, now: T0 + 1000 }).inMemoryOnly).toBe(true);
    expect(historyInMemoryOnly()).toBe(true);
    storage.box.full = false;

    // a restore's "Before a restore" of the build worn now (at 2 s), then another restore's (at 3 s)
    const before = recordVersion("Cartethyia", build(3), echoes, "before-restore", { storage, now: T0 + 2000 });
    expect(before).toMatchObject({ saved: true, inMemoryOnly: false });
    expect(stacks(readHistory("Cartethyia", storage))).toEqual([2, 1, 0]);
    expect(historyInMemoryOnly()).toBe(false);
    recordVersion("Cartethyia", build(1), echoes, "before-restore", { storage, now: T0 + 3000 });
    // the one at 2 s was lost: storage held 3, 1, 0
    expect(stored(storage)).toEqual([3, 2, 1, 0]);
    expect(stacks(readHistory("Cartethyia", storage))).toEqual([3, 2, 1, 0]);
  });

  it("deleting a row after room came back deletes only that row, from the page too", () => {
    const storage = quotaStorage();
    recordVersion("Cartethyia", build(1), echoes, "manual", { storage, now: T0 });
    storage.box.full = true;
    recordVersion("Cartethyia", build(2), echoes, "manual", { storage, now: T0 + 1000 });
    storage.box.full = false;
    recordVersion("Cartethyia", build(3), echoes, "manual", { storage, now: T0 + 2000 });
    const oldest = readHistory("Cartethyia", storage).at(-1)!;
    expect(deleteVersion("Cartethyia", oldest.id, storage)).toBe(true);
    // storage went from 3 versions to 1, and the deleted row stayed on the page
    expect(stored(storage)).toEqual([2, 1]);
    expect(stacks(readHistory("Cartethyia", storage))).toEqual([2, 1]);
  });

  it("while the browser stays full, the page's list stands, a deleted row stays deleted, and another tab's version shows beside it", () => {
    const storage = quotaStorage();
    recordVersion("Cartethyia", build(1), echoes, "manual", { storage, now: T0 });
    recordVersion("Cartethyia", build(2), echoes, "manual", { storage, now: T0 + 1000 });
    storage.box.full = true;
    recordVersion("Cartethyia", build(3), echoes, "manual", { storage, now: T0 + 2000 });
    const list = readHistory("Cartethyia", storage);
    expect(stacks(list)).toEqual([2, 1, 0]);
    deleteVersion("Cartethyia", list[1]!.id, storage);
    expect(stacks(readHistory("Cartethyia", storage))).toEqual([2, 0]);
    // another tab with room stores a version of its own
    const other = versionOf("Cartethyia", build(9), echoes, "manual", Date.now() + 60_000);
    storage.inner.setItem(`${HISTORY_PREFIX}Cartethyia`, JSON.stringify({ v: 1, versions: [other, ...readHistory("Cartethyia", storage.inner)] }));
    expect(readHistory("Cartethyia", storage).map((v) => v.id)).toEqual([other.id, list[0]!.id, list[2]!.id]);
  });
});

describe("the diff", () => {
  const before = (): HistoryVersion => versionOf("Cartethyia", characters.Cartethyia, echoes, "manual", T0);
  const after = (): HistoryVersion => versionOf("Cartethyia", changedCart().record, echoes, "manual", T0 + 1);

  it("says what changed in words: the refinement and the echo in slot 3", () => {
    const d = gearDiff("Cartethyia", before().payload.members[0], after().payload.members[0]);
    expect(d.identical).toBe(false);
    expect(d.weapon.text).toMatch(/^Weapon: .+ R1 → .+ R5$/);
    expect(d.sequence.text).toBeNull();
    expect(d.slots.map((s) => s.status)).toEqual(["same", "same", "changed", "same", "same"]);
    expect(d.slots[2].lines.length).toBeGreaterThan(0);
    expect(d.lines[0]).toBe(d.weapon.text);
    expect(d.lines.some((l) => l.startsWith("Slot 3: "))).toBe(true);
    // the confirm's summary: one line per changed slot
    expect(d.summary.filter((l) => l.startsWith("Slot 3: "))).toHaveLength(1);
    expect(d.summary.find((l) => l.startsWith("Slot 3: "))).toMatch(/→|with other stats/);
    // the set bonus and main echo follow from the echoes: never listed as a setting of their own
    expect(d.settings).not.toContain("echoSetBonus");
    expect(gearDiff("Cartethyia", before().payload.members[0], before().payload.members[0]).identical).toBe(true);
  });

  it("calls a reordered echo moved, not changed", () => {
    const m = before().payload.members[0];
    const swapped = clone(m);
    [swapped.echoes[1], swapped.echoes[2]] = [swapped.echoes[2], swapped.echoes[1]];
    const s = slotDiffs(m, swapped);
    expect(s[1]).toMatchObject({ status: "moved", movedFrom: 2 });
    expect(s[2]).toMatchObject({ status: "moved", movedFrom: 1 });
    expect(s[1].lines[0]).toMatch(/moved here from slot 3/);
  });

  it("names every substat change, a new substat and a lost one", () => {
    const m = before().payload.members[0];
    const b = clone(m);
    const e = b.echoes[4]!;
    const [firstKey, firstValue] = e.subs[0];
    e.subs[0] = [firstKey, firstValue + 1];
    const fresh = ["HP_FLAT", "DEF_FLAT", "ATK_FLAT", "HP", "DEF"].find((k) => !e.subs.some(([s]) => s === k))!;
    e.subs.pop();
    e.subs.push([fresh, fresh.endsWith("_FLAT") ? 50 : 8.6]);
    const lines = slotDiffs(m, b)[4].lines;
    expect(lines.some((l) => l.startsWith(`New substat: ${fresh.replace("_FLAT", "")} ${fresh.endsWith("_FLAT") ? "50" : "8.6%"}`))).toBe(true);
    expect(lines.some((l) => l.startsWith("Substat gone: "))).toBe(true);
    expect(lines.some((l) => l.includes(" → "))).toBe(true);
  });

  it("puts both versions through the engine on the same rotation", async () => {
    const a = before().payload.members[0];
    const b = after().payload.members[0];
    const rows = statRows(await characterScreenStats("Cartethyia", a), await characterScreenStats("Cartethyia", b));
    expect(rows.map((r) => r.label).slice(0, 6)).toEqual(["HP", "ATK", "DEF", "Crit Rate", "Crit DMG", "Energy Regen"]);
    expect(rows.some((r) => r.changed)).toBe(true);
    for (const r of rows) if (r.changed) expect(r.deltaText).toMatch(r.key.endsWith("_FLAT") ? /^[+−][\d,]+$/ : /^[+−]\d+\.\d\u00a0pts$/);
    const rot = (await bestRotationOf("Cartethyia", characters, echoes))!;
    const da = (await damageOf("Cartethyia", a, rot, characters, echoes))!;
    const db = (await damageOf("Cartethyia", b, rot, characters, echoes))!;
    expect(db.avgDamage).not.toBe(da.avgDamage);
    // the engine's own number for the changed record, through the inventory, is the version's
    const viaStore = await scoreRotation({ id: "x", name: rot.name, duration: rot.duration, actions: rot.actions.map((x: any, i: number) => ({ ...x, id: x.id ?? `x${i}`, buffs: x.buffs ?? [] })) } as any, "Cartethyia", { Cartethyia: changedCart().record }, RANKING_ENEMY, echoes);
    expect(db.avgDamage).toBe(viaStore.avgDamage);
    expect(changeText(100, 105.4)).toBe("+5.4 %");
    expect(changeText(100, 100.01)).toBe("same");
    expect(changeText(100, 98)).toBe("−2.0 %");
  });

  it("states each change as the difference of the two numbers it sits beside", () => {
    const zero = { HP_FLAT: 10000, ATK_FLAT: 1000, CritRate: 5, CritDMG: 150, EnergyRegen: 100 };
    const rows = statRows({ ...zero, DEF_FLAT: 1262.7, CritRate: 24.04 }, { ...zero, DEF_FLAT: 1240.9, CritRate: 24.06 });
    const row = (key: string) => rows.find((r) => r.key === key)!;
    // floored as the game shows them, 1,262 → 1,240 is 22 (the raw values differ by 21.8)
    expect([row("DEF_FLAT").fromText, row("DEF_FLAT").toText, row("DEF_FLAT").deltaText]).toEqual(["1,262", "1,240", "−22"]);
    // 24.0% → 24.1% is a tenth of a point, not "+0.0 pts"
    expect([row("CritRate").fromText, row("CritRate").toText, row("CritRate").deltaText]).toEqual(["24.0%", "24.1%", "+0.1 pts"]);
    expect(row("HP_FLAT").changed).toBe(false);
  });
});

describe("restore", () => {
  let stores: RestoreStores;
  let storage: ReturnType<typeof memoryStorage>;
  let seq = 0;
  const newId = (n: number) => `new${(seq++).toString(36)}`.padEnd(n, "x").slice(0, n);

  beforeEach(() => {
    setActivePinia(createPinia());
    storage = memoryStorage();
    const character = useCharacterStore();
    const inventory = useInventoryStore();
    character.characters = clone({ Cartethyia: characters.Cartethyia, Chisa: { weapon: "Kumokiri", notes: "x" } });
    character.ensureCharacterBuilds("Cartethyia");
    character.characters.Cartethyia.notes = "my notes";
    character.characters.Cartethyia.talents = { basic: "10", skill: "9", forte: "10", liberation: "10", intro: "10" };
    inventory.echoes = clone(echoes);
    inventory.equipped = Object.fromEntries(Object.values(characters.Cartethyia.echoes).map((s: any, i) => [s.echoId, { Cartethyia: i }]));
    stores = { character, inventory } as unknown as RestoreStores;
  });

  it("plans the change in words and finds every echo in the inventory", () => {
    const old = versionOf("Cartethyia", stores.character.characters.Cartethyia, stores.inventory.echoes, "manual", T0);
    const { record } = changedCart();
    stores.character.characters.Cartethyia = { ...record, builds: stores.character.characters.Cartethyia.builds, activeBuildId: stores.character.characters.Cartethyia.activeBuildId };
    const plan = planRestore("Cartethyia", old, { characters: stores.character.characters, echoes: stores.inventory.echoes, equipped: stores.inventory.equipped });
    expect(plan.identical).toBe(false);
    expect(plan.changes[0]).toMatch(/R5 → .+ R1$/);
    expect(plan.echoes.map((e) => e.status)).toEqual(["owned", "owned", "owned", "owned", "owned"]);
    expect(plan.echoes.map((e) => e.echoId)).toEqual(Object.values(characters.Cartethyia.echoes).map((s: any) => s.echoId));
    expect(plan.notes.some((n) => n.includes("Default build"))).toBe(true);
    expect(plan.notes.some((n) => n.includes("saved to the history first"))).toBe(true);
    expect(plan.newEchoes).toBe(0);
    // no weapon and no echoes today: nothing is saved first, so the confirm does not promise it
    const bare = planRestore("Cartethyia", old, { characters: { Cartethyia: { buildStatus: "none" } }, echoes: stores.inventory.echoes, equipped: {} });
    expect(bare.identical).toBe(false);
    expect(bare.notes.some((n) => n.includes("saved to the history first"))).toBe(false);
  });

  it("writes the version back through the stores, after saving the build as it is now", async () => {
    const original = clone(stores.character.characters.Cartethyia);
    const old = versionOf("Cartethyia", original, stores.inventory.echoes, "manual", T0);
    const { record, swapped } = changedCart();
    stores.character.$patch((s: any) => {
      s.characters.Cartethyia = { ...record, notes: "my notes", talents: original.talents, builds: original.builds, activeBuildId: original.activeBuildId };
    });
    stores.inventory.equipped[swapped] = { Cartethyia: 2 };

    const out = applyRestore(stores, "Cartethyia", old, { storage, now: T0 + 5000, newId });
    expect(out.before.saved).toBe(true);
    const hist = readHistory("Cartethyia", storage);
    expect(hist[0].label).toBe("before-restore");
    expect(hist[0].payload.members[0].weapon!.rank).toBe(5);

    const c = stores.character.characters.Cartethyia;
    expect(Object.values(c.echoes).map((s: any) => s.echoId)).toEqual(Object.values(original.echoes).map((s: any) => s.echoId));
    expect(c.weapons[c.weapon].refinement).toBe("1");
    // the character's own fields and the never-versioned ones stay
    expect(c.notes).toBe("my notes");
    expect(c.talents).toEqual(original.talents);
    expect(c.activeBuildId).toBe(original.activeBuildId);
    expect(c.builds).toHaveLength(1);
    expect(c.builds[0].weapons[c.weapon].refinement).toBe("1");
    // the equipped map follows the slots: the swapped-in echo is off Cartethyia again
    expect(stores.inventory.equipped[swapped]?.Cartethyia).toBeUndefined();
    Object.values(original.echoes).forEach((s: any, i) => expect(stores.inventory.equipped[s.echoId].Cartethyia).toBe(i));
    expect(stores.character.characters.Chisa).toEqual({ weapon: "Kumokiri", notes: "x" });
    // and the engine reads what the version read
    const enemy = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" } as any;
    const want = await buildCharacterCalculationContext("Cartethyia", { Cartethyia: original }, enemy, echoes);
    const got = await buildCharacterCalculationContext("Cartethyia", stores.character.characters, enemy, stores.inventory.echoes);
    expect(got.finalStats).toEqual(want.finalStats);
  });

  it("adds an echo the inventory lost back to it, and says so first", () => {
    const old = versionOf("Cartethyia", stores.character.characters.Cartethyia, stores.inventory.echoes, "manual", T0);
    const lost = stores.character.characters.Cartethyia.echoes["4"].echoId;
    stores.inventory.echoes = stores.inventory.echoes.filter((e: any) => e.echoId !== lost);
    const plan = planRestore("Cartethyia", old, { characters: stores.character.characters, echoes: stores.inventory.echoes, equipped: stores.inventory.equipped });
    expect(plan.echoes[4].status).toBe("new");
    expect(plan.newEchoes).toBe(1);
    expect(plan.notes.some((n) => n.startsWith("Slot 5: no echo in your inventory"))).toBe(true);
    const count = stores.inventory.echoes.length;
    const out = applyRestore(stores, "Cartethyia", old, { storage, now: T0 + 1, newId });
    expect(out.addedEchoes).toHaveLength(1);
    expect(stores.inventory.echoes).toHaveLength(count + 1);
    expect(stores.character.characters.Cartethyia.echoes["4"].echoId).toBe(out.addedEchoes[0]);
  });

  it("keeps the other weapons' settings and today's portrait", () => {
    const old = versionOf("Cartethyia", stores.character.characters.Cartethyia, stores.inventory.echoes, "manual", T0);
    const cur = { ...clone(stores.character.characters.Cartethyia), customPortrait: "data:x", weapons: { Other: { refinement: "3" }, [characters.Cartethyia.weapon]: { refinement: "4", weaponLevel: "80" } } };
    const ids = Object.values(cur.echoes).map((s: any) => s.echoId);
    const next = restoredRecord(cur, old, ids);
    expect(next.weapons.Other).toEqual({ refinement: "3" });
    expect(next.weapons[characters.Cartethyia.weapon]).toEqual({ refinement: "1" });
    expect(next.customPortrait).toBe("data:x");
  });
});
