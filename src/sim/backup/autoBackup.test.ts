// Taking backups: at most one a day and only when something changed, one per day across two tabs, none of an empty
// account, the list within its rules, a full browser, a browser that keeps none, and a damaged record refused.
import { afterEach, describe, expect, it, vi } from "vitest";
import { backupsChanged, createBackups } from "./autoBackup";
import { memoryBackupStore, type BackupMeta, type BackupReason, type BackupStore } from "./backupStore";
import { pack, unpack } from "./codec";
import { BACKUP_BYTE_CAP, KEEP_DAILY, KEEP_OTHERS, KEEP_WEEKLY, retention, weekOf } from "./retention";
import { EMPTY_CAPTURE, pull, testCapture, THREE_PULLS } from "./__fixtures__/testAccount";

const DAY = 86_400_000;
/** noon on Monday 2026-11-16, local time */
const T0 = new Date(2026, 10, 16, 12, 0, 0).getTime();

function setup(store: BackupStore | null = memoryBackupStore(), start = T0) {
  const clock = { now: start };
  const layer = createBackups({ store, now: () => clock.now });
  return { store, clock, layer };
}

const meta = (id: string, at: number, reason: BackupReason = "daily", bytes = 1000): BackupMeta => ({
  id,
  at,
  reason,
  hash: id,
  bytes,
  textLength: bytes * 8,
  enc: "gzip",
  counts: { characters: 1, builds: 1, echoes: 1, teams: 1, pulls: 0 },
  dataVersion: "10",
});

afterEach(() => vi.unstubAllGlobals());

describe("the automatic backup: at most one a day, and only when something changed", () => {
  it("the first one is kept, with when, why, what is inside and its size", async () => {
    const { layer } = setup();
    const taken = await layer.take("daily", testCapture());
    expect(taken.saved).toBe(true);
    const [only] = await layer.list();
    expect(only).toMatchObject({ id: "auto-2026-11-16", at: T0, reason: "daily", enc: "gzip", dataVersion: "10", counts: { characters: 1, builds: 2, echoes: 3, teams: 1, pulls: 3 } });
    expect(only!.bytes).toBeGreaterThan(100);
    expect(only!.bytes).toBeLessThan(only!.textLength); // compressed
  });

  it("a second one the same day is not taken, even when the account changed since", async () => {
    const { layer, clock } = setup();
    await layer.take("daily", testCapture());
    clock.now += 3 * 3600_000;
    const again = await layer.take("daily", testCapture({ weapon: "EmeraldOfGenesis" }));
    expect(again).toMatchObject({ saved: false, why: "today", meta: { id: "auto-2026-11-16" } });
    expect(await layer.list()).toHaveLength(1);
  });

  it("the next day: nothing changed, no backup; something changed, one more", async () => {
    const { layer, clock } = setup();
    await layer.take("daily", testCapture());
    clock.now += DAY;
    expect(await layer.take("daily", testCapture())).toMatchObject({ saved: false, why: "unchanged", meta: { id: "auto-2026-11-16" } });
    expect(await layer.list()).toHaveLength(1);
    clock.now += DAY;
    expect((await layer.take("daily", testCapture({ pulls: [...THREE_PULLS, pull("2026-11-17 20:00:00", "Variation")] }))).saved).toBe(true);
    expect((await layer.list()).map((m) => m.id)).toEqual(["auto-2026-11-18", "auto-2026-11-16"]);
  });

  it("an empty account takes no backup, automatic or not", async () => {
    const { layer, store } = setup();
    expect(await layer.take("daily", EMPTY_CAPTURE)).toEqual({ saved: false, why: "empty" });
    expect(await layer.take("before-import", EMPTY_CAPTURE)).toEqual({ saved: false, why: "empty" });
    expect(await store!.list()).toEqual([]);
  });

  it("two tabs open: one backup for the day, not two", async () => {
    const store = memoryBackupStore();
    const a = createBackups({ store, now: () => T0 });
    const b = createBackups({ store, now: () => T0 + 40 });
    const [first, second] = await Promise.all([a.take("daily", testCapture()), b.take("daily", testCapture())]);
    expect([first.saved, second.saved].filter(Boolean)).toHaveLength(1);
    expect([first, second].find((r) => !r.saved)).toMatchObject({ saved: false, why: "today" });
    expect(await store.list()).toHaveLength(1);
  });

  it("a list on screen is told: the counter moves on a write, a delete and a clear, and not on a backup that was not taken", async () => {
    const { layer } = setup();
    const before = backupsChanged.value;
    await layer.take("daily", testCapture());
    expect(backupsChanged.value).toBe(before + 1);
    await layer.take("daily", testCapture());
    expect(backupsChanged.value).toBe(before + 1);
    await layer.remove("auto-2026-11-16");
    await layer.clear();
    expect(backupsChanged.value).toBe(before + 3);
  });
});

describe("two tabs see the same list", () => {
  /** two ends of one channel, as two tabs have */
  function channelPair() {
    const ends = [0, 1].map(() => ({ listeners: [] as Array<() => void>, other: null as unknown as { listeners: Array<() => void> } }));
    ends[0]!.other = ends[1]!;
    ends[1]!.other = ends[0]!;
    return ends.map((end) => ({
      postMessage: () => void end.other.listeners.forEach((fn) => fn()),
      addEventListener: (_: "message", fn: () => void) => void end.listeners.push(fn),
    }));
  }

  it("a tab is told when another tab makes, deletes or clears a backup", async () => {
    const store = memoryBackupStore();
    const [mine, theirs] = channelPair();
    const heard = vi.fn();
    mine!.addEventListener("message", heard);
    createBackups({ store, now: () => T0, channel: mine });
    const other = createBackups({ store, now: () => T0, channel: theirs });
    const before = backupsChanged.value;
    await other.take("daily", testCapture());
    expect(heard).toHaveBeenCalledTimes(1);
    expect(backupsChanged.value).toBeGreaterThan(before);
    await other.remove("auto-2026-11-16");
    await other.clear();
    expect(heard).toHaveBeenCalledTimes(3);
    // a backup that was not taken is no news
    await other.take("daily", testCapture({ echoes: 0, teams: 0, pulls: null, weapon: "" }));
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("a channel that is closed, or a browser without one, changes nothing for this tab", async () => {
    const closed = {
      postMessage: () => {
        throw new DOMException("closed", "InvalidStateError");
      },
      addEventListener: () => undefined,
    };
    const layer = createBackups({ store: memoryBackupStore(), now: () => T0, channel: closed });
    expect((await layer.take("daily", testCapture())).saved).toBe(true);
    expect((await createBackups({ store: memoryBackupStore(), now: () => T0, channel: null }).take("daily", testCapture())).saved).toBe(true);
  });
});

describe("a backup before something is replaced", () => {
  it("is kept beside the day's automatic one when the account changed since", async () => {
    const { layer, clock } = setup();
    await layer.take("daily", testCapture());
    clock.now += 60_000;
    const before = await layer.take("before-import", testCapture({ echoes: 5 }));
    expect(before).toMatchObject({ saved: true, meta: { reason: "before-import" } });
    expect((await layer.list()).map((m) => m.reason)).toEqual(["before-import", "daily"]);
  });

  it("is not taken twice for the same account: the newest backup already holds it, and the answer names that one", async () => {
    const { layer, clock } = setup();
    const first = await layer.take("before-restore", testCapture());
    clock.now += 500;
    const second = await layer.take("before-import", testCapture());
    expect(second).toMatchObject({ saved: false, why: "unchanged" });
    expect(!second.saved && second.meta?.id).toBe(first.saved && first.meta.id);
    expect(await layer.list()).toHaveLength(1);
  });
});

describe("which backups are kept", () => {
  it("40 days of daily ones leave the newest 7 and the newest of each of the 4 weeks before them", () => {
    const metas = Array.from({ length: 40 }, (_, i) => meta(`auto-${i}`, T0 - i * DAY));
    const { keep, drop } = retention(metas);
    expect(keep).toHaveLength(KEEP_DAILY + KEEP_WEEKLY);
    expect(keep.slice(0, 7).map((m) => m.id)).toEqual(["auto-0", "auto-1", "auto-2", "auto-3", "auto-4", "auto-5", "auto-6"]);
    // T0 is a Monday: the 7 newest reach back to Tuesday the 10th; then Monday the 9th stands for its week (it is the
    // only one of that week left), and the Sundays for the three weeks before
    expect(keep.slice(7).map((m) => m.id)).toEqual(["auto-7", "auto-8", "auto-15", "auto-22"]);
    expect(new Set(keep.slice(7).map((m) => weekOf(m.at))).size).toBe(4);
    expect(drop).toHaveLength(29);
  });

  it("every 'before …' and hand-made one is kept beside them, up to the newest 20", () => {
    const daily = Array.from({ length: 10 }, (_, i) => meta(`auto-${i}`, T0 - i * DAY));
    const others = Array.from({ length: 25 }, (_, i) => meta(`before-${i}`, T0 - i * 3600_000 - 1, i % 2 ? "before-import" : "manual"));
    const { keep, drop } = retention([...daily, ...others]);
    expect(keep.filter((m) => m.reason !== "daily")).toHaveLength(KEEP_OTHERS);
    expect(drop.filter((m) => m.reason !== "daily").map((m) => m.id)).toEqual(["before-20", "before-21", "before-22", "before-23", "before-24"]);
    expect(keep.filter((m) => m.reason === "daily")).toHaveLength(9);
  });

  it("past the byte cap the oldest go first, whatever they are, and never the one just written", () => {
    const metas = [meta("new", T0, "daily", 600), meta("mid", T0 - DAY, "before-import", 600), meta("old", T0 - 2 * DAY, "daily", 600)];
    expect(retention(metas, { cap: 1300 }).drop.map((m) => m.id)).toEqual(["old"]);
    expect(retention(metas, { cap: 700 }).keep.map((m) => m.id)).toEqual(["new"]);
    // one backup bigger than the whole cap is still kept: there is always a newest one
    expect(retention([meta("huge", T0, "daily", 99_999)], { cap: 10 }).keep).toHaveLength(1);
    // an old one that was just written (a clock set back) is not the one that goes
    expect(retention(metas, { cap: 1300, justWritten: "old" }).drop.map((m) => m.id)).toEqual(["mid"]);
    expect(BACKUP_BYTE_CAP).toBeGreaterThan(1024 * 1024);
  });

  it("the layer prunes after each write: a year of daily use never holds more than 11 automatic backups", async () => {
    const { layer, clock } = setup();
    for (let day = 0; day < 60; day++) {
      await layer.take("daily", testCapture({ pulls: [...THREE_PULLS, pull(`2026-07-01 08:00:${String(day).padStart(2, "0")}`, "Variation")] }));
      clock.now += DAY;
    }
    const list = await layer.list();
    expect(list).toHaveLength(KEEP_DAILY + KEEP_WEEKLY);
    expect(list[0]!.at).toBe(T0 + 59 * DAY);
  }, 20_000);
});

describe("a browser that is full, or keeps nothing", () => {
  /** A store with room for `budget` bytes, as a full browser has: a write that would pass it is refused whole. */
  function tightStore(budget: number) {
    const store = memoryBackupStore();
    const add = store.add.bind(store);
    const used = (without: readonly string[] = []): number => [...store.records.values()].reduce((n, r) => n + (r.meta && !without.includes(r.meta.id) ? r.meta.bytes : 0), 0);
    store.add = async (m, d, replacing = []) => {
      if (used(replacing) + m.bytes > budget) throw new DOMException("full", "QuotaExceededError");
      return add(m, d, replacing);
    };
    return { store, seed: (m: BackupMeta) => add(m, "x") };
  }

  it("full: the oldest backup goes to make room for the new one, in one step, and nothing is thrown", async () => {
    const { store, seed } = tightStore(20_500);
    for (let i = 1; i <= 4; i++) await seed(meta(`auto-old-${i}`, T0 - i * DAY, "daily", 5000));
    const { layer } = setup(store);
    const taken = await layer.take("daily", testCapture());
    expect(taken.saved).toBe(true);
    // one old backup of 5000 bytes is room enough for a new one of a few hundred
    expect((await layer.list()).map((m) => m.id)).toEqual(["auto-2026-11-16", "auto-old-1", "auto-old-2", "auto-old-3"]);
  });

  it("full, and small old ones: never more than half the list goes for one new backup", async () => {
    const { store, seed } = tightStore(250);
    for (let i = 1; i <= 6; i++) await seed(meta(`auto-old-${i}`, T0 - i * DAY, "daily", 40));
    const { layer } = setup(store);
    // the new one is a few hundred bytes: three small ones are not room enough, and three is the most it may take
    expect(await layer.take("daily", testCapture())).toEqual({ saved: false, why: "full" });
    expect(await layer.list()).toHaveLength(6);
  });

  it("still full after that: the backup is not taken, and EVERY old backup is still there, however often it is tried", async () => {
    const { store, seed } = tightStore(100);
    for (let i = 1; i <= 4; i++) await seed(meta(`auto-old-${i}`, T0 - i * DAY, "daily", 25));
    const { layer, clock } = setup(store);
    for (let attempt = 0; attempt < 6; attempt++) {
      expect(await layer.take(attempt % 2 ? "manual" : "daily", testCapture({ echoes: attempt + 1 }))).toEqual({ saved: false, why: "full" });
      clock.now += DAY;
    }
    expect((await layer.list()).map((m) => m.id)).toEqual(["auto-old-1", "auto-old-2", "auto-old-3", "auto-old-4"]);
  });

  it("full with nothing older to give up: not taken, and the app hears no error", async () => {
    const { store } = tightStore(10);
    expect(await setup(store).layer.take("daily", testCapture())).toEqual({ saved: false, why: "full" });
    expect(await store.list()).toEqual([]);
  });

  it("a write refused for any other reason costs no old backup: every one of them is still there", async () => {
    const store = memoryBackupStore();
    for (let i = 1; i <= 4; i++) await store.add(meta(`auto-old-${i}`, T0 - i * DAY), "x");
    store.add = async () => {
      throw new DOMException("the disk said no", "UnknownError");
    };
    const { layer } = setup(store);
    for (let attempt = 0; attempt < 5; attempt++) expect(await layer.take("manual", testCapture())).toEqual({ saved: false, why: "failed" });
    expect(await layer.list()).toHaveLength(4);
  });

  it("no IndexedDB (a private window): unavailable, an empty list, and every call still answers", async () => {
    const { layer } = setup(null);
    expect(await layer.available()).toBe(false);
    expect(await layer.list()).toEqual([]);
    expect(await layer.take("daily", testCapture())).toEqual({ saved: false, why: "unavailable" });
    expect(await layer.read("auto-2026-11-16")).toEqual({ ok: false, why: "unavailable" });
    expect(await layer.remove("x")).toBe(false);
    expect(await layer.clear()).toBe(false);
  });

  it("an IndexedDB that refuses to open: the same answers", async () => {
    const refusing: BackupStore = {
      list: async () => {
        throw new DOMException("denied", "SecurityError");
      },
      get: async () => {
        throw new DOMException("denied", "SecurityError");
      },
      add: async () => {
        throw new DOMException("denied", "SecurityError");
      },
      remove: async () => {
        throw new DOMException("denied", "SecurityError");
      },
      clear: async () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    const { layer } = setup(refusing);
    expect(await layer.available()).toBe(false);
    expect(await layer.list()).toEqual([]);
    expect(await layer.take("manual", testCapture())).toEqual({ saved: false, why: "unavailable" });
    expect(await layer.read("x")).toEqual({ ok: false, why: "unavailable" });
    expect(await layer.remove("x")).toBe(false);
  });
});

describe("reading a backup back", () => {
  it("gives the file text it was taken from: his export and the plus records", async () => {
    const { layer } = setup();
    const capture = testCapture();
    await layer.take("daily", capture);
    const read = await layer.read("auto-2026-11-16");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const file = JSON.parse(read.text);
    expect(file.data).toEqual(capture.data);
    expect(file.wtplus).toEqual({ v: 1, madeAt: T0, reason: "daily", keys: capture.keys });
  });

  it("a damaged record is refused: changed bytes, half a record, or content that no longer gives its hash", async () => {
    const store = memoryBackupStore();
    const { layer } = setup(store);
    await layer.take("daily", testCapture());
    const id = "auto-2026-11-16";
    const whole = store.records.get(id)!;

    const bytes = (whole.data as Uint8Array).slice();
    bytes[Math.floor(bytes.length / 2)]! ^= 0xff;
    store.records.set(id, { ...whole, data: bytes });
    expect(await layer.read(id)).toEqual({ ok: false, why: "damaged" });

    store.records.set(id, { meta: whole.meta });
    expect(await layer.read(id)).toEqual({ ok: false, why: "damaged" });
    store.records.set(id, { data: whole.data });
    expect(await layer.read(id)).toEqual({ ok: false, why: "damaged" });

    // a valid file under the wrong record: another account's content
    const other = await pack(JSON.stringify({ meta: { version: "10", source: "WutheringTools" }, data: testCapture({ echoes: 9 }).data, wtplus: { v: 1, madeAt: 1, reason: "daily", keys: {} } }));
    store.records.set(id, { meta: whole.meta, data: other.data });
    expect(await layer.read(id)).toEqual({ ok: false, why: "damaged" });

    store.records.set(id, { meta: { ...whole.meta!, enc: "text" }, data: "{not json" });
    expect(await layer.read(id)).toEqual({ ok: false, why: "damaged" });

    store.records.set(id, whole);
    expect((await layer.read(id)).ok).toBe(true);
    expect(await layer.read("auto-1999-01-01")).toEqual({ ok: false, why: "gone" });
  });
});

describe("the stored form", () => {
  it("gzip where the browser has it: smaller, and back to the same text, names with accents included", async () => {
    const text = JSON.stringify({ echo: "Jué", note: "x".repeat(5000), sign: "≥ 70 %" });
    const packed = await pack(text);
    expect(packed.enc).toBe("gzip");
    expect(packed.bytes).toBeLessThan(text.length / 4);
    expect(await unpack(packed.enc, packed.data)).toBe(text);
  });

  it("plain text where it has not, and the layer keeps and reads such a backup the same way", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const packed = await pack("{\"a\":1}");
    expect(packed).toEqual({ enc: "text", data: "{\"a\":1}", bytes: 14 });
    expect(await unpack("text", packed.data)).toBe("{\"a\":1}");
    const { layer } = setup();
    await layer.take("daily", testCapture());
    expect((await layer.list())[0]!.enc).toBe("text");
    expect((await layer.read("auto-2026-11-16")).ok).toBe(true);
  });

  it("bytes that are not a backup do not unpack", async () => {
    await expect(unpack("gzip", new Uint8Array([1, 2, 3, 4, 5]))).rejects.toBeTruthy();
    await expect(unpack("gzip", "text")).rejects.toBeTruthy();
    await expect(unpack("text", new Uint8Array([1]))).rejects.toBeTruthy();
  });
});
