// Wuthering Tools+: Undo for "Sync my teams" (syncUndo.ts).
import { describe, expect, it } from "vitest";
import { applySyncUndo, fillsToUndo, makeSyncUndo, pendingSyncUndo, readSyncUndo, saveSyncUndo, settleSyncUndo, SyncRefused, syncWithUndo, SYNC_UNDO_KEY, type SyncUndoRecord } from "./syncUndo";
import type { SyncReport, SyncTeamReport, TeamLike } from "./syncTeams";

const team = (id: string, name: string, stacks: number, extra: Record<string, unknown> = {}): TeamLike =>
  ({ id, name, characterIds: ["A", "B", "C"], actions: [{ slot: 0, key: "Hit", stacks }], enemyConfig: { level: 100 }, duration: 26.92, ...extra }) as TeamLike;
const row = (id: string, status: SyncTeamReport["status"]): SyncTeamReport =>
  ({ id, name: id, newName: null, status, reason: null, rileyKey: null, total: null, deltas: [], enemyDeltas: [], durationDelta: null, enemy: {}, members: [] });
const report = (rows: SyncTeamReport[]): SyncReport => ({ at: "2026-10-31T20:00:00.000Z", cost: "mine", teams: rows, updated: 0, unchanged: 0, skipped: 0, failed: 0 });

describe("Sync my teams: undo", () => {
  const before = [team("a", "wuwa_calc Aemeath S6R5 DPS · Mornye + Lynae", 1), team("b", "wuwa_calc Xuanling", 2), team("c", "My team", 0)];
  const after = [team("a", "wuwa_calc Aemeath S6R5 DPS · Mornye + Lynae", 2, { duration: 26.62 }), team("b", "wuwa_calc Xuanling", 2), team("c", "My team", 0)];
  const rep = report([row("a", "updated"), row("b", "unchanged"), row("c", "skipped")]);

  it("keeps only the teams the sync rewrote, as they were", () => {
    const undo = makeSyncUndo(before, after, rep)!;
    expect(undo.before.map((t) => t.id)).toEqual(["a"]);
    expect(undo.before[0]!.actions[0]!.stacks).toBe(1);
    expect(Object.keys(undo.after)).toEqual(["a"]);
    expect(makeSyncUndo(before, before, report([row("a", "unchanged")]))).toBeNull();
  });

  it("keeps an 'unchanged' team whose record still moved (enemy, name), but not one with only fresh action ids", () => {
    const b4 = [team("a", "wuwa_calc A", 1, { actions: [{ id: "x1", slot: 0, key: "Hit", stacks: 1 }] }), team("b", "wuwa_calc B", 1, { enemyConfig: { level: 90 } }), team("c", "My team", 0)];
    const aft = [team("a", "wuwa_calc A", 1, { actions: [{ id: "y9", slot: 0, key: "Hit", stacks: 1 }] }), team("b", "wuwa_calc B", 1, { enemyConfig: { level: 100 } }), team("c", "My team", 0, { name: "Renamed in another tab" })];
    const undo = makeSyncUndo(b4, aft, report([row("a", "unchanged"), row("b", "unchanged"), row("c", "skipped")]))!;
    expect(undo.before.map((t) => t.id)).toEqual(["b"]);
    expect(undo.before[0]!.enemyConfig).toEqual({ level: 90 });
    // only fresh ids anywhere: nothing to undo
    expect(makeSyncUndo([b4[0]!], [aft[0]!], report([row("a", "unchanged")]))).toBeNull();
  });

  it("puts a rewritten team back verbatim and leaves the others", () => {
    const undo = makeSyncUndo(before, after, rep)!;
    const out = applySyncUndo(after, undo);
    expect(out.restored).toEqual(["a"]);
    expect(out.kept).toEqual([]);
    expect(out.teams[0]).toEqual(before[0]);
    expect(out.teams[1]).toBe(after[1]);
    expect(out.teams).toHaveLength(3);
  });

  it("leaves a team edited or deleted since the sync alone, and says so", () => {
    const undo = makeSyncUndo(before, after, rep)!;
    const edited = [{ ...after[0]!, name: "Renamed by hand" }, after[1]!, after[2]!];
    const out = applySyncUndo(edited, undo);
    expect(out.restored).toEqual([]);
    expect(out.kept).toEqual([{ name: "Renamed by hand", why: "edited since the sync" }]);
    expect(applySyncUndo([after[1]!], undo).kept[0]!.why).toBe("deleted since the sync");
  });

  it("stores the last sync's undo under its own key, and forgets it", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const undo = makeSyncUndo(before, after, rep) as SyncUndoRecord;
    expect(saveSyncUndo(undo, storage)).toBe(true);
    expect(mem.has(SYNC_UNDO_KEY)).toBe(true);
    expect(readSyncUndo(storage)).toEqual(undo);
    saveSyncUndo(null, storage);
    expect(readSyncUndo(storage)).toBeNull();
    mem.set(SYNC_UNDO_KEY, "{not json");
    expect(readSyncUndo(storage)).toBeNull();
  });

  it("a sync that rewrote no team but filled loop times keeps its Undo through a reload, and that Undo touches no team", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const record: SyncUndoRecord = { v: 1, at: "2026-11-04T12:00:00.000Z", before: [], after: {} }; // RankingsAccountBar's record for that sync
    expect(saveSyncUndo(record, storage)).toBe(true);
    const read = readSyncUndo(storage);
    expect(read).toEqual(record); // the toolbar's Undo after a reload reads this
    const out = applySyncUndo(before, read!);
    expect(out.restored).toEqual([]);
    expect(out.kept).toEqual([]);
    expect(out.teams).toEqual(before);
  });
});

describe("Undo sync after a pin", () => {
  const before = [team("a", "wuwa_calc A", 1, { buildIds: ["old", null, null] }), team("b", "wuwa_calc B", 2, { buildIds: [null, null, null] })];
  const synced = [team("a", "wuwa_calc A", 2, { buildIds: ["old", null, null], duration: 25 }), team("b", "wuwa_calc B", 3, { buildIds: [null, null, null], duration: 25 })];
  const rep = report([row("a", "updated"), row("b", "updated")]);

  it("a pin written since is not an edit: the team goes back and keeps today's pins", () => {
    const undo = makeSyncUndo(before, synced, rep)!;
    const pinned = [{ ...synced[0]!, buildIds: ["plan", "plan2", null] } as TeamLike, synced[1]!];
    const out = applySyncUndo(pinned, undo);
    expect(out.restored).toEqual(["a", "b"]);
    expect(out.kept).toEqual([]);
    expect(out.teams[0]!.actions[0]!.stacks).toBe(1);
    expect((out.teams[0] as TeamLike & { buildIds: unknown }).buildIds).toEqual(["plan", "plan2", null]);
    expect(out.teams[0]!.duration).toBe(26.92);
  });

  it("any other edit still keeps the team", () => {
    const undo = makeSyncUndo(before, synced, rep)!;
    const out = applySyncUndo([{ ...synced[0]!, duration: 30 }, synced[1]!], undo);
    expect(out.restored).toEqual(["b"]);
    expect(out.kept.map((k) => k.why)).toEqual(["edited since the sync"]);
  });

  it("reads a record stored before pins were left out", () => {
    const undo = { ...makeSyncUndo(before, synced, rep)!, after: { a: JSON.stringify(synced[0]), b: JSON.stringify(synced[1]) } };
    expect(applySyncUndo(synced, undo).restored).toEqual(["a", "b"]);
  });

  it("a team with no pins stays with no pins, in the shape it had", () => {
    const plain = [team("c", "wuwa_calc C", 1)];
    const after = [team("c", "wuwa_calc C", 2)];
    const out = applySyncUndo(after, makeSyncUndo(plain, after, report([row("c", "updated")]))!);
    expect(JSON.stringify(out.teams[0])).toBe(JSON.stringify(plain[0]));
  });

  it("only takes loop times out for teams actually put back", () => {
    const fills = [{ teamId: "a", rotationId: "r1" }, { teamId: "b", rotationId: "r2" }, { teamId: "not-rewritten", rotationId: "r3" }];
    const undo = makeSyncUndo(before, synced, rep)!;
    expect(fillsToUndo(fills, undo, { restored: ["b"] }).map((f) => f.rotationId)).toEqual(["r2", "r3"]);
    expect(fillsToUndo(fills, undo, { restored: ["a", "b"] })).toHaveLength(3);
    // a sync that rewrote no team: nothing stands in the way of its times
    expect(fillsToUndo(fills, { before: [] }, { restored: [] })).toHaveLength(3);
  });
});

describe("a sync cut short", () => {
  const mine = team("c", "My team", 0);
  const before = [team("a", "wuwa_calc A", 1), team("b", "wuwa_calc B", 1), mine];
  const halfway = [team("a", "wuwa_calc A", 2, { duration: 26.62 }), team("b", "wuwa_calc B", 1), mine];
  const memory = () => {
    const mem = new Map<string, string>();
    return { mem, storage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } };
  };

  it("has its undo stored before the first write", async () => {
    const { storage } = memory();
    let atFirstWrite: SyncUndoRecord | null = null;
    await syncWithUndo(
      before,
      async () => {
        atFirstWrite = readSyncUndo(storage);
        return report([row("a", "updated")]);
      },
      () => halfway,
      storage,
    );
    expect(atFirstWrite!.pending).toBe(true);
    expect(atFirstWrite!.before.map((t) => t.id)).toEqual(["a", "b"]); // your own teams are not the sync's
  });

  it("ends as an ordinary record when the sync finishes", async () => {
    const { storage } = memory();
    const out = await syncWithUndo(before, async () => report([row("a", "updated"), row("b", "unchanged")]), () => halfway, storage);
    expect(out.undo!.pending).toBeUndefined();
    expect(out.undo!.before.map((t) => t.id)).toEqual(["a"]);
    expect(readSyncUndo(storage)).toEqual(out.undo);
    expect(out.after).toBe(halfway);
  });

  it("a tab closed part-way settles on the next load: the teams it reached go back, and the times it never reached stay", () => {
    const rec = pendingSyncUndo(before);
    const settled = settleSyncUndo(rec, halfway)!;
    expect(settled.pending).toBeUndefined();
    expect(settled.cut).toBe(true);
    expect(settled.before.map((t) => t.id)).toEqual(["a"]);
    const out = applySyncUndo(halfway, settled);
    expect(out.restored).toEqual(["a"]);
    expect(out.teams[0]).toEqual(before[0]);
    expect(settleSyncUndo(rec, before)).toBeNull();
  });

  it("a sync that throws part-way leaves the undo of what it reached", async () => {
    const { storage } = memory();
    await expect(syncWithUndo(before, async () => { throw new Error("cut"); }, () => halfway, storage)).rejects.toThrow("cut");
    expect(readSyncUndo(storage)!.before.map((t) => t.id)).toEqual(["a"]);
    expect(readSyncUndo(storage)!.pending).toBeUndefined();
  });

  it("a sync that throws before any write leaves the last sync's undo as it was", async () => {
    const { storage } = memory();
    const last = { v: 1, at: "x", before: [before[0]!], after: { a: "fp" } } as SyncUndoRecord;
    saveSyncUndo(last, storage);
    await expect(syncWithUndo(before, async () => { throw new Error("still loading"); }, () => before, storage)).rejects.toThrow();
    expect(readSyncUndo(storage)).toEqual(last);
  });
});

describe("the last sync's Undo, a full browser and a failed team (2026-11-08 hunt M3, M4, L2)", () => {
  const mine = team("c", "My team", 0);
  const before = [team("a", "wuwa_calc A", 1, { actions: [{ id: "a1", slot: 0, key: "Hit", stacks: 1 }] }), team("b", "wuwa_calc B", 1, { actions: [{ id: "b1", slot: 0, key: "Hit", stacks: 1 }] }), mine];
  const synced = [team("a", "wuwa_calc A", 2, { actions: [{ id: "a2", slot: 0, key: "Hit", stacks: 2 }] }), before[1]!, mine];
  /** the same teams re-imported unchanged: every action gets a fresh id */
  const again = [team("a", "wuwa_calc A", 2, { actions: [{ id: "a3", slot: 0, key: "Hit", stacks: 2 }] }), team("b", "wuwa_calc B", 1, { actions: [{ id: "b3", slot: 0, key: "Hit", stacks: 1 }] }), mine];
  const store = (full = false) => {
    const mem = new Map<string, string>();
    const box = { full };
    return {
      mem,
      box,
      storage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (box.full) throw new DOMException("full", "QuotaExceededError");
          mem.set(k, v);
        },
        removeItem: (k: string) => void mem.delete(k),
      },
    };
  };

  it("a second sync that changes nothing keeps the first one's Undo, and it still puts the team back", async () => {
    const { storage } = store();
    const first = await syncWithUndo(before, async () => report([row("a", "updated"), row("b", "unchanged")]), () => synced, storage);
    expect(first.undo!.before.map((t) => t.id)).toEqual(["a"]);

    const second = await syncWithUndo(synced, async () => report([row("a", "unchanged"), row("b", "unchanged")]), () => again, storage);

    expect(second.carried).toBe(true);
    expect(second.undo!.before.map((t) => t.id)).toEqual(["a"]);
    expect(readSyncUndo(storage)).toEqual(second.undo);
    // the re-import gave team a fresh action ids: still the team the first sync left, so Undo puts it back
    const out = applySyncUndo(again, second.undo!);
    expect(out.restored).toEqual(["a"]);
    expect(out.teams[0]).toEqual(before[0]);
  });

  it("refuses to sync when the browser will not store its Undo first, and leaves the last Undo as it was", async () => {
    const { storage, box } = store();
    const last = { v: 1, at: "x", before: [before[0]!], after: { a: "fp" } } as SyncUndoRecord;
    saveSyncUndo(last, storage);
    box.full = true;
    let ran = false;
    const failed = await syncWithUndo(before, async () => ((ran = true), report([])), () => before, storage).catch((e) => e);
    expect(failed).toBeInstanceOf(SyncRefused);
    expect(failed.message).toMatch(/^Nothing was synced: this browser's storage is full/);
    expect(ran).toBe(false);
    expect(readSyncUndo(storage)).toEqual(last);
  });

  it("says when the finished Undo could not be stored", async () => {
    const { storage, box } = store();
    const run = syncWithUndo(before, async () => {
      box.full = true; // the sync's own writes took the last room
      return report([row("a", "updated")]);
    }, () => synced, storage);
    const out = await run;
    expect(out.undo).not.toBeNull();
    expect(out.stored).toBe(false);
  });

  it("leaves a failed team out: what differs there is another tab's edit, which Undo must not take back", () => {
    const edited = [synced[0]!, team("b", "wuwa_calc B", 1, { characterIds: ["A", "D", "C"] }), mine];
    const undo = makeSyncUndo(before, edited, report([row("a", "updated"), row("b", "failed")]))!;
    expect(undo.before.map((t) => t.id)).toEqual(["a"]);
  });

  it("is a short hash per team, and an Undo stored with the JSON itself still reads", () => {
    const undo = makeSyncUndo(before, synced, report([row("a", "updated")]))!;
    expect(undo.after.a!.length).toBeLessThan(20);
    const { buildIds: _p, ...rest } = synced[0] as TeamLike & { buildIds?: unknown };
    void _p;
    const legacy = { ...undo, after: { a: JSON.stringify(rest) } };
    expect(applySyncUndo(synced, legacy).restored).toEqual(["a"]);
  });
});
