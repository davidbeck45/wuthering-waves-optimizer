// Wuthering Tools+ numbers log — the "before" of the first record after an update. The Saved results drop another app
// build's ranking unread; just before that, the log is handed it (persist/savedResults.ts `onOtherBuildRecord`) and
// keeps it as a record of that build, so the run about to start has something to be read against. Synthetic account.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { RANKING_CACHE_VERSION, rankingFingerprint } from "../myRankings/rankingCache";
import { memoryResultStore } from "../persist/resultStore";
import { createSavedResults, onOtherBuildRecord, type OtherBuildRecord } from "../persist/savedResults";
import { causeText, compareEntries } from "./compare";
import { NUMBERS_LOG_KEY, decodeLog, type RankedAccount } from "./log";
import { readLog, type LogArea } from "./logStore";
import { recordEarlierRanking, recordScoredRanking, type RecordEnv } from "./recordRanking";
import { DAY, HOUR, T0, account, ranking } from "./testAccount";

const OLD = "0.0.1+abc+aaaaaaaaaaaa";
const NEW = "0.0.1+abc+bbbbbbbbbbbb";
const isRanking = (v: unknown): boolean => Array.isArray((v as { characters?: unknown })?.characters) && Array.isArray((v as { teams?: unknown })?.teams);

function area(seed: Record<string, string> = {}): LogArea & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, String(v)), removeItem: (k) => void data.delete(k) };
}
const fpOf = (acc: RankedAccount): string => rankingFingerprint({ characters: acc.characters, echoes: acc.echoes, teams: acc.teams, investment: true, autoTeamBuffs: true });
const env = (storage: LogArea | null, acc: RankedAccount, over: Partial<RecordEnv> = {}): Partial<RecordEnv> => ({
  storage,
  account: () => acc,
  now: () => T0 + DAY,
  build: NEW,
  idle: () => Promise.resolve(),
  importedAt: () => null,
  ...over,
});

describe("another build's saved result, handed over before it is dropped", () => {
  async function setup(build = OLD, schema = 6, value: unknown = { characters: [], teams: [] }) {
    const store = memoryResultStore();
    await createSavedResults({ store, build, now: () => 5_000 }).write("ranking", schema, "fp-1", value);
    const seen: OtherBuildRecord[] = [];
    const stop = onOtherBuildRecord((r) => seen.push(r));
    return { store, seen, stop, saved: createSavedResults({ store, build: NEW }) };
  }

  it("is handed to a listener once, with the build that computed it and when, and is still never shown", async () => {
    const { store, seen, stop, saved } = await setup();
    expect(await saved.read("ranking", 6, "fp-1", isRanking)).toBeNull();
    stop();
    expect(seen).toEqual([{ cache: "ranking", fingerprint: "fp-1", build: OLD, savedAt: 5_000, value: { characters: [], teams: [] } }]);
    await vi.waitFor(() => expect(store.records.size).toBe(0)); // dropped as before
  });

  it("is not handed over when it is this build's own (it is read), of another schema, or a value its cache rejects", async () => {
    const own = await setup(NEW);
    expect(await own.saved.read("ranking", 6, "fp-1", isRanking)).not.toBeNull();
    own.stop();
    expect(own.seen).toEqual([]);

    const schema = await setup(OLD, 5);
    expect(await schema.saved.read("ranking", 6, "fp-1", isRanking)).toBeNull();
    schema.stop();
    expect(schema.seen).toEqual([]);

    const shape = await setup(OLD, 6, { rows: [] });
    expect(await shape.saved.read("ranking", 6, "fp-1", isRanking)).toBeNull();
    shape.stop();
    expect(shape.seen).toEqual([]);

    const torn = await setup();
    torn.store.records.get("ranking|fp-1")!.text = "{not json";
    expect(await torn.saved.read("ranking", 6, "fp-1", isRanking)).toBeNull();
    torn.stop();
    expect(torn.seen).toEqual([]);
  });

  it("does not let a listener that throws break the read, and stops calling one that left", async () => {
    const { store, saved, stop } = await setup();
    const boom = onOtherBuildRecord(() => {
      throw new Error("listener");
    });
    expect(await saved.read("ranking", 6, "fp-1", isRanking)).toBeNull();
    boom();
    stop();
    await vi.waitFor(() => expect(store.records.size).toBe(0));
    const again = await setup();
    again.stop(); // left before the read
    expect(await again.saved.read("ranking", 6, "fp-1", isRanking)).toBeNull();
    expect(again.seen).toEqual([]);
  });
});

describe("the last build's ranking as a record", () => {
  it("is the 'before' of the first record after an update, so the update's moves are said on the first visit", async () => {
    const storage = area();
    const acc = account();
    // found in the Saved results as the page loads: scored by the old build three days ago
    expect(await recordEarlierRanking(fpOf(acc), ranking({ at: T0 - 3 * DAY }), { build: OLD, at: T0 - 3 * DAY }, env(storage, acc))).toBe("stored");
    // then the run on the new build
    expect(await recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_040_000, stock: 2_520_000, at: T0 + DAY - 5000 }), env(storage, acc))).toBe("stored");
    const log = readLog(storage);
    expect(log.entries.map((e) => [e.build, e.at])).toEqual([
      [OLD, T0 - 3 * DAY],
      [NEW, T0 + DAY - 5000],
    ]);
    const c = compareEntries(log.entries[0], log.entries[1]);
    expect(c.appUpdated).toBe(true);
    expect(c.moves.map((m) => m.id).sort()).toEqual(["Aaa", "wuwa_calc:Aaa hypercarry"]);
    for (const m of c.moves) expect(causeText(m.cause, { character: (id) => id, weapon: (k) => k ?? "" })).toBe("An app update: no build in it changed.");
    // the earlier ranking is not "the last ranking seen": that is the run's
    expect(log.seen).toEqual({ fp: fpOf(acc), build: NEW, at: T0 + DAY });
  });

  it("is not added again when the log has it already, as it will from the next update on", async () => {
    const storage = area();
    const acc = account();
    // scored and recorded on the old build; its saved copy is written a moment later
    await recordScoredRanking(fpOf(acc), ranking({ at: T0 }), env(storage, acc, { build: OLD, now: () => T0 + 10 }));
    expect(await recordEarlierRanking(fpOf(acc), ranking({ at: T0 }), { build: OLD, at: T0 + 40 }, env(storage, acc))).toBe("same");
    expect(readLog(storage).entries).toHaveLength(1);
  });

  it("fills a gap: a ranking the log could not keep when it was scored", async () => {
    const storage = area();
    const acc = account();
    await recordScoredRanking(fpOf(acc), ranking({ Aaa: 950_000, at: T0 - 9 * DAY }), env(storage, acc, { build: OLD, now: () => T0 - 9 * DAY + 10 }));
    expect(await recordEarlierRanking(fpOf(acc), ranking({ at: T0 - DAY }), { build: OLD, at: T0 - DAY }, env(storage, acc))).toBe("stored");
    expect(readLog(storage).entries.map((e) => e.characters[0].damage)).toEqual([950_000, 1_000_000]);
  });

  it("is never put behind a record the log already has, from this same build, from the future, or from a half-scored ranking", async () => {
    const acc = account();
    const later = area();
    await recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_100_000, at: T0 }), env(later, acc, { now: () => T0 + 10 }));
    expect(await recordEarlierRanking(fpOf(acc), ranking({ at: T0 - DAY }), { build: OLD, at: T0 - DAY }, env(later, acc))).toBe("skipped");
    expect(readLog(later).entries).toHaveLength(1);

    const empty = area();
    expect(await recordEarlierRanking(fpOf(acc), ranking(), { build: NEW, at: T0 }, env(empty, acc))).toBe("skipped"); // this build: the run records itself
    expect(await recordEarlierRanking(fpOf(acc), ranking(), { build: OLD, at: T0 + 9 * DAY }, env(empty, acc))).toBe("skipped"); // a clock that went back
    expect(await recordEarlierRanking(fpOf(acc), ranking({}, { incomplete: true }), { build: OLD, at: T0 }, env(empty, acc))).toBe("skipped");
    expect(await recordEarlierRanking(fpOf(acc), ranking(), { build: OLD, at: Number.NaN }, env(empty, acc))).toBe("skipped");
    expect(await recordEarlierRanking(fpOf(acc), ranking(), { build: OLD, at: T0 }, env(null, acc))).toBe("skipped");
    expect(empty.getItem(NUMBERS_LOG_KEY)).toBeNull();
  });

  it("is not taken for an account that is no longer the one it scored", async () => {
    const storage = area();
    const scored = account();
    const edited = account();
    edited.characters.Aaa.weapon = "SwordTwo";
    expect(await recordEarlierRanking(fpOf(scored), ranking(), { build: OLD, at: T0 }, env(storage, edited))).toBe("skipped");
    expect(storage.getItem(NUMBERS_LOG_KEY)).toBeNull();
  });

  it("is written before the run's own record, however quickly the run ends", async () => {
    const storage = area();
    const acc = account();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // the earlier record is still waiting (its chunk, the stores) when the run's record is asked for
    const earlier = recordEarlierRanking(fpOf(acc), ranking({ at: T0 - HOUR }), { build: OLD, at: T0 - HOUR }, env(storage, acc, { idle: () => gate }));
    const run = recordScoredRanking(fpOf(acc), ranking({ Aaa: 1_020_000, at: T0 + DAY - 1 }), env(storage, acc));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(storage.getItem(NUMBERS_LOG_KEY)).toBeNull(); // the run's record waits its turn
    release();
    expect(await earlier).toBe("stored");
    expect(await run).toBe("stored");
    expect(readLog(storage).entries.map((e) => e.build)).toEqual([OLD, NEW]);
  });
});

describe("the wiring: the ranking cache hands the log what the Saved results are about to drop", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("records the old build's ranking of this account when a page asks for the saved one", async () => {
    const acc = account();
    useCharacterStore().$patch({ characters: acc.characters } as never);
    useInventoryStore().$patch({ echoes: acc.echoes } as never);
    useTeamRotationsStore().$patch({ teams: acc.teams } as never);
    const fp = rankingFingerprint({ characters: useCharacterStore().characters, echoes: useInventoryStore().echoes, teams: useTeamRotationsStore().teams, investment: true, autoTeamBuffs: true });
    const store = memoryResultStore();
    const savedAt = Date.now() - 2 * DAY;
    await createSavedResults({ store, build: OLD, now: () => savedAt }).write("ranking", RANKING_CACHE_VERSION, fp, ranking({ at: savedAt - 50 }));
    // what readSavedRanking does on the new build, against this store
    expect(await createSavedResults({ store, build: NEW }).read("ranking", RANKING_CACHE_VERSION, fp, isRanking)).toBeNull();
    await vi.waitFor(() => expect(decodeLog(localStorage.getItem(NUMBERS_LOG_KEY)).entries).toHaveLength(1), { timeout: 5000 });
    const entry = decodeLog(localStorage.getItem(NUMBERS_LOG_KEY)).entries[0];
    expect(entry).toMatchObject({ build: OLD, at: savedAt });
    expect(entry.characters.map((c) => c.damage)).toEqual([1_000_000, 400_000, 120_000]);
  }, 20_000);

  it("takes nothing from another cache's record", async () => {
    const store = memoryResultStore();
    await createSavedResults({ store, build: OLD }).write("investPlan", 3, "fp-plan", { characters: [], teams: [] });
    expect(await createSavedResults({ store, build: NEW }).read("investPlan", 3, "fp-plan", isRanking)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(localStorage.getItem(NUMBERS_LOG_KEY)).toBeNull();
  }, 20_000);
});
