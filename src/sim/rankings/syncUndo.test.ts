// Wuthering Tools+: Undo for "Sync my teams" (syncUndo.ts).
import { describe, expect, it } from "vitest";
import { applySyncUndo, makeSyncUndo, readSyncUndo, saveSyncUndo, SYNC_UNDO_KEY, type SyncUndoRecord } from "./syncUndo";
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
});
