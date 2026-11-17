// Restore, on the real stores with the plugin the app uses and Ryan's own import: a backup comes back whole, an old
// one through his migrations, his import ignores what plus adds, the pull history is merged, and anything that is not
// a readable backup leaves today's account exactly as it is.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createPersistedState } from "pinia-plugin-persistedstate";
import { CURRENT_DATA_VERSION } from "../../migrations";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { applyImportedDatabase, getExportData } from "../../utils/settingsBackup";
import { ImportRefused } from "../buildHistory/importCheck";
import { decodeConveneHistory } from "../convene/gachaImport";
import { persistStorage, refusedStores } from "../storage/persistGuard";
import { createBackups, type TakeResult } from "./autoBackup";
import { backupFile, captureAccount, type Capture, type RyanExport } from "./backupFile";
import { memoryBackupStore } from "./backupStore";
import { pullCount } from "./counts";
import { hookEnv, settledPlusRestore } from "./importHook";
import { mergedPulls, plusFailureText, restorePlusKeys } from "./plusRestore";
import { DAMAGED_BACKUP_TEXT, inspectBackupText, NEWER_BACKUP_TEXT, NO_ACCOUNT_BACKUP_TEXT, NOT_A_BACKUP_TEXT, NOT_SAVED_FIRST_TEXT, restoreBackupText, RestoreRefused, type RestoreEnv } from "./restore";
import { pull, pullsRaw, testCapture, testStores, THREE_PULLS } from "./__fixtures__/testAccount";

// Ryan's own version 3 export of a Jinhsi build (his calculator spec's data). Loaded by a path TypeScript does not
// follow: the file leans on Cypress's global types, which the app's type-check does not have.
const VERSION_3_PATH = "../../../cypress/e2e/calculator/data/Jinhsi/data";
const { config: VERSION_3_EXPORT } = (await import(/* @vite-ignore */ VERSION_3_PATH)) as { config: { meta: { version: string; source: string }; data: { character: string; inventory?: string } } };

const PULLS = "wtplus:convene:history";
const CLEARS = "wtplus:endgame:clears";
const PLAN = "wtplus:echoPlan:v1";
const ALBUMS = "wuthering-tools-plus.echoScan.albums";

function freshStores() {
  const pinia = createPinia();
  createApp({}).use(pinia); // a pinia runs its plugins once an app has installed it
  pinia.use(createPersistedState({ auto: true, storage: persistStorage }));
  setActivePinia(pinia);
  return { character: useCharacterStore(), inventory: useInventoryStore(), team: useTeamRotationsStore() };
}

/** Puts an account in storage as a page load would find it, and opens the stores on it. */
function seedAccount(capture: Capture) {
  for (const [key, value] of Object.entries(capture.data)) if (typeof value === "string") localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(capture.keys)) if (value !== null) localStorage.setItem(key, value);
  localStorage.setItem("dataVersion", String(CURRENT_DATA_VERSION));
  return freshStores();
}

const fileOf = (capture: Capture, at = 1_763_000_000_000): string => JSON.stringify(backupFile(capture, "daily", at));
const storedNow = (): Capture => captureAccount(getExportData as () => RyanExport);

function env(over: Partial<RestoreEnv> = {}): RestoreEnv & { saveFirst: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn> } {
  return {
    saveFirst: vi.fn(async (): Promise<TakeResult> => ({ saved: false, why: "unavailable" })),
    apply: vi.fn((raw: string) => applyImportedDatabase(raw)),
    plusDone: settledPlusRestore,
    ...over,
  } as never;
}

const realHook = { ...hookEnv };
beforeEach(() => {
  localStorage.clear();
  refusedStores.value = [];
  Object.assign(hookEnv, realHook);
});

/** Monday's account: one more echo, a different weapon, two teams, an Echo plan; and its backup. */
const monday = (): Capture => ({
  ...testCapture({ weapon: "EmeraldOfGenesis", echoes: 4, teams: 2 }),
  keys: { [PULLS]: pullsRaw(THREE_PULLS), [CLEARS]: JSON.stringify({ v: 1, clears: [{ floor: "left-4", seconds: 71 }] }), [PLAN]: JSON.stringify({ v: 1, done: { MoonlitClouds: true } }), [ALBUMS]: null },
});
/** Today's: changed since, with one more pull, another clear logged, an album imported, and no Echo plan record. */
const today = (): Capture => ({
  ...testCapture({ weapon: "AgesOfHarvest", echoes: 1, teams: 0 }),
  keys: { [PULLS]: pullsRaw([...THREE_PULLS, pull("2026-11-15 21:00:00", "Variation")]), [CLEARS]: JSON.stringify({ v: 1, clears: [] }), [PLAN]: null, [ALBUMS]: JSON.stringify(["IMG_0042"]) },
});

describe("Restore puts a backup back as the account", () => {
  it("his three stores are the backup's again, in memory and in storage, and the data version is current", async () => {
    const stores = seedAccount(today());
    expect(stores.inventory.echoes).toHaveLength(1);
    const outcome = await restoreBackupText(fileOf(monday()), env());
    await nextTick();
    expect((stores.character.characters as Record<string, { weapon?: string }>).Jinhsi!.weapon).toBe("EmeraldOfGenesis");
    expect(stores.inventory.echoes).toHaveLength(4);
    expect(stores.team.teams).toHaveLength(2);
    // what a reload reads
    expect(JSON.parse(localStorage.getItem("inventory")!).echoes).toHaveLength(4);
    expect(JSON.parse(localStorage.getItem("teamRotations")!).teams).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem("character")!).characters.Jinhsi.weapon).toBe("EmeraldOfGenesis");
    expect(localStorage.getItem("dataVersion")).toBe(String(CURRENT_DATA_VERSION));
    expect(outcome.plus.plus).toBe(true);
    expect(outcome.plus.failed).toEqual([]);
  });

  it("the plus records go back to the backup's: the clears and the Echo plan as they were, a record it had none of removed", async () => {
    seedAccount(today());
    const outcome = await restoreBackupText(fileOf(monday()), env());
    expect(localStorage.getItem(CLEARS)).toBe(monday().keys[CLEARS]);
    expect(localStorage.getItem(PLAN)).toBe(monday().keys[PLAN]);
    expect(localStorage.getItem(ALBUMS)).toBeNull();
    expect(outcome.plus.written.sort()).toEqual([CLEARS, PLAN, ALBUMS].sort());
  });

  it("the pull history is merged, never replaced: a pull made since the backup is still there", async () => {
    seedAccount(today());
    const outcome = await restoreBackupText(fileOf(monday()), env());
    expect(pullCount(localStorage.getItem(PULLS))).toBe(4);
    expect(localStorage.getItem(PULLS)).toBe(today().keys[PULLS]); // nothing to add: not rewritten, no import logged
    expect(outcome.plus.pullsAdded).toBe(0);
  });

  it("a browser that lost its pulls gets them back from the backup, beside the ones it still has", async () => {
    seedAccount({ ...today(), keys: { ...today().keys, [PULLS]: pullsRaw([pull("2026-11-15 21:00:00", "Variation")]) } });
    const outcome = await restoreBackupText(fileOf(monday()), env());
    expect(outcome.plus.pullsAdded).toBe(3);
    const history = decodeConveneHistory(localStorage.getItem(PULLS));
    expect(history.ok && history.history.players["800000001"]!.pools["1"]!.map((r) => r.name)).toEqual(["Originite: Type II", "Verina", "Guardian Sword", "Variation"]);
    expect(history.ok && history.history.players["800000001"]!.imports.at(-1)).toMatchObject({ source: "backup", added: 3 });
  });

  it("an empty browser (the phone dropped the site's data) gets the whole account from a file", async () => {
    const stores = freshStores();
    const outcome = await restoreBackupText(fileOf(monday()), env());
    await nextTick();
    expect(stores.inventory.echoes).toHaveLength(4);
    expect(pullCount(localStorage.getItem(PULLS))).toBe(3);
    expect(localStorage.getItem(PLAN)).toBe(monday().keys[PLAN]);
    expect(outcome.plus.pullsAdded).toBe(3);
  });

  it("today's account is saved first, before anything is replaced", async () => {
    seedAccount(today());
    const order: string[] = [];
    const store = memoryBackupStore();
    const layer = createBackups({ store, now: () => 1_763_300_000_000 });
    const e = env({
      saveFirst: vi.fn(async () => {
        order.push(`save:${JSON.parse(localStorage.getItem("inventory")!).echoes.length}`);
        return layer.take("before-restore", storedNow());
      }),
      apply: vi.fn((raw: string) => {
        order.push("apply");
        applyImportedDatabase(raw);
      }),
    });
    const outcome = await restoreBackupText(fileOf(monday()), e);
    expect(order).toEqual(["save:1", "apply"]);
    expect(outcome.first).toMatchObject({ saved: true, meta: { reason: "before-restore", counts: { echoes: 1, teams: 0, pulls: 4 } } });
    // and that backup restores today's account in turn
    const back = await layer.read(outcome.first.saved ? outcome.first.meta.id : "");
    expect(back.ok).toBe(true);
    if (back.ok) await restoreBackupText(back.text, env());
    expect(JSON.parse(localStorage.getItem("inventory")!).echoes).toHaveLength(1);
    expect(localStorage.getItem(ALBUMS)).toBe(today().keys[ALBUMS]);
  });
});

describe("a backup from an older version of the site", () => {
  it("restores through his migrations: a version 3 export gains the saved builds version 8 added", async () => {
    const stores = seedAccount(today());
    expect(VERSION_3_EXPORT.meta.version).toBe("3");
    expect(JSON.parse(VERSION_3_EXPORT.data.character).characters.Jinhsi.builds).toBeUndefined();
    const text = JSON.stringify({ ...VERSION_3_EXPORT, wtplus: { v: 1, madeAt: 1_700_000_000_000, reason: "daily", keys: { [PULLS]: pullsRaw(THREE_PULLS) } } });
    const inspected = inspectBackupText(text);
    expect(inspected.counts).toMatchObject({ characters: 1, builds: 2, pulls: 3 }); // counted as it will import: one build each for Jinhsi and Augusta
    await restoreBackupText(text, env());
    await nextTick();
    const jinhsi = (stores.character.characters as Record<string, { weapon?: string; builds?: Array<{ name: string }>; activeBuildId?: string }>).Jinhsi!;
    expect(jinhsi.weapon).toBe("AgesOfHarvest");
    expect(jinhsi.builds).toHaveLength(1);
    expect(jinhsi.builds![0]!.name).toBe("Default build");
    expect(jinhsi.activeBuildId).toBeTruthy();
    expect(stores.team.teams).toEqual([]); // a version 3 export has no teams: none, as his import leaves it
    expect(localStorage.getItem("dataVersion")).toBe(String(CURRENT_DATA_VERSION));
  });
});

describe("Ryan's import, given one of our files", () => {
  it("ends with the same three stores as from his own export of that account: what plus adds is not in his way", async () => {
    const capture = monday();
    const a = seedAccount(today());
    applyImportedDatabase(JSON.stringify({ meta: capture.meta, data: capture.data }));
    await nextTick();
    const his = { character: JSON.stringify(a.character.$state), inventory: JSON.stringify(a.inventory.$state), team: JSON.stringify(a.team.$state) };

    localStorage.clear();
    const b = seedAccount(today());
    applyImportedDatabase(fileOf(capture));
    await nextTick();
    expect(JSON.stringify(b.character.$state)).toBe(his.character);
    expect(JSON.stringify(b.inventory.$state)).toBe(his.inventory);
    expect(JSON.stringify(b.team.$state)).toBe(his.team);
  });

  it("through Settings › Import the plus records come back too, one tick after his stores", async () => {
    seedAccount(today());
    applyImportedDatabase(fileOf(monday()));
    expect(localStorage.getItem(PLAN)).toBeNull(); // his stores are stored first
    const plus = await settledPlusRestore();
    expect(plus).toMatchObject({ plus: true, failed: [] });
    expect(localStorage.getItem(PLAN)).toBe(monday().keys[PLAN]);
  });

  it("his own plain export touches no plus record", async () => {
    seedAccount(today());
    const capture = monday();
    applyImportedDatabase(JSON.stringify({ meta: capture.meta, data: capture.data }));
    expect(await settledPlusRestore()).toEqual({ plus: false, pullsAdded: 0, written: [], failed: [] });
    for (const key of [PULLS, CLEARS, PLAN, ALBUMS]) expect(localStorage.getItem(key), key).toBe(today().keys[key]);
  });

  it("the account it is about to replace is kept as a 'Before an import' backup, read before his first write", async () => {
    seedAccount(today());
    const store = memoryBackupStore();
    const layer = createBackups({ store, now: () => 1_763_300_000_000 });
    hookEnv.take = (reason, capture) => layer.take(reason, capture);
    applyImportedDatabase(fileOf(monday()));
    await settledPlusRestore();
    await vi.waitFor(async () => expect(await layer.list()).toHaveLength(1));
    const [kept] = await layer.list();
    expect(kept).toMatchObject({ reason: "before-import", counts: { echoes: 1, teams: 0, pulls: 4 } });
  });

  it("where backups stand aside (Cypress without the switch) the import runs as before", async () => {
    const stores = seedAccount(today());
    const take = vi.fn();
    Object.assign(hookEnv, { allowed: () => false, take });
    applyImportedDatabase(fileOf(monday()));
    await nextTick();
    expect(take).not.toHaveBeenCalled();
    expect(stores.inventory.echoes).toHaveLength(4);
  });

  it("a backup that throws never stops the import it guards", async () => {
    const stores = seedAccount(today());
    hookEnv.take = () => {
      throw new Error("IndexedDB fell over");
    };
    expect(() => applyImportedDatabase(fileOf(monday()))).not.toThrow();
    await nextTick();
    expect(stores.inventory.echoes).toHaveLength(4);
  });
});

describe("what is not a readable backup changes nothing", () => {
  const untouched = (before: Record<string, string | null>): void => {
    for (const [key, value] of Object.entries(before)) expect(localStorage.getItem(key), key).toBe(value);
  };
  const snapshot = (): Record<string, string | null> => Object.fromEntries(["character", "inventory", "teamRotations", PULLS, CLEARS, PLAN, ALBUMS].map((k) => [k, localStorage.getItem(k)]));

  it("text that is no backup, a list of echoes, a newer format: refused in words, and today's account is not even saved", async () => {
    seedAccount(today());
    await nextTick();
    const before = snapshot();
    for (const [text, message] of [
      ["{not json", NOT_A_BACKUP_TEXT],
      [JSON.stringify([{ echo: "Jué" }]), NOT_A_BACKUP_TEXT],
      [JSON.stringify({ characters: {} }), NOT_A_BACKUP_TEXT],
      [JSON.stringify({ ...backupFile(monday(), "daily", 1), wtplus: { v: 2, keys: {} } }), NEWER_BACKUP_TEXT],
    ] as const) {
      const e = env();
      await expect(restoreBackupText(text, e)).rejects.toThrow(message);
      expect(e.saveFirst).not.toHaveBeenCalled();
      expect(e.apply).not.toHaveBeenCalled();
    }
    untouched(before);
  });

  it("a backup in a data version newer than this build's (a tab older than a deploy, a rollback) is refused, ours or a plain export", async () => {
    seedAccount(today());
    await nextTick();
    const before = snapshot();
    const ahead = String(CURRENT_DATA_VERSION + 1);
    const ours = backupFile(monday(), "daily", 1);
    for (const file of [{ ...ours, meta: { ...ours.meta, version: ahead } }, { meta: { ...ours.meta, version: ahead }, data: ours.data }]) {
      expect(() => inspectBackupText(JSON.stringify(file))).toThrow(NEWER_BACKUP_TEXT);
      const e = env();
      await expect(restoreBackupText(JSON.stringify(file), e)).rejects.toThrow(NEWER_BACKUP_TEXT);
      expect(e.saveFirst).not.toHaveBeenCalled();
      expect(e.apply).not.toHaveBeenCalled();
    }
    untouched(before);
    expect(localStorage.getItem("dataVersion")).toBe(String(CURRENT_DATA_VERSION));
  });

  it("the backup taken after Delete your data (blank stores, the pulls Delete keeps) is refused as what it is, not as damaged", async () => {
    seedAccount(today());
    await nextTick();
    const before = snapshot();
    // what Ryan's export reads right after a Delete: his two stores blanked to "", the teams emptied, the pulls kept
    const afterDelete: Capture = {
      meta: { version: String(CURRENT_DATA_VERSION), source: "WutheringTools" },
      data: { character: "", inventory: "", teamRotations: JSON.stringify({ teams: [], favoriteTeamIds: [], favoritePresetNames: [] }) },
      keys: { [PULLS]: pullsRaw(THREE_PULLS), [CLEARS]: null, [PLAN]: null, [ALBUMS]: null },
    };
    const text = fileOf(afterDelete);
    expect(() => inspectBackupText(text)).toThrow(NO_ACCOUNT_BACKUP_TEXT);
    const e = env();
    await expect(restoreBackupText(text, e)).rejects.toThrow(NO_ACCOUNT_BACKUP_TEXT);
    expect(e.saveFirst).not.toHaveBeenCalled();
    expect(e.apply).not.toHaveBeenCalled();
    untouched(before);
  });

  it("a backup whose stores cannot be read is damaged: refused before the save, account and plus records untouched", async () => {
    seedAccount(today());
    await nextTick();
    const before = snapshot();
    const broken = { ...backupFile(monday(), "daily", 1), data: { ...monday().data, inventory: "{\"echoes\":[" } };
    const e = env();
    await expect(restoreBackupText(JSON.stringify(broken), e)).rejects.toThrow(DAMAGED_BACKUP_TEXT);
    expect(e.saveFirst).not.toHaveBeenCalled();
    untouched(before);
  });

  it("his import's own refusal (an inventory that is not an inventory) leaves the stores and every plus record as they were", async () => {
    const stores = seedAccount(today());
    await nextTick();
    const before = snapshot();
    const odd = { ...backupFile(monday(), "daily", 1), data: { ...monday().data, inventory: JSON.stringify({ echoes: "none" }) } };
    await expect(restoreBackupText(JSON.stringify(odd), env())).rejects.toBeInstanceOf(ImportRefused);
    await nextTick();
    untouched(before);
    expect(stores.inventory.echoes).toHaveLength(1);
  });

  it("when today's account could not be saved first, nothing is replaced; a browser that keeps no backups goes on, as the confirm says", async () => {
    seedAccount(today());
    await nextTick();
    const before = snapshot();
    for (const why of ["full", "failed"] as const) {
      const e = env({ saveFirst: vi.fn(async (): Promise<TakeResult> => ({ saved: false, why })) });
      await expect(restoreBackupText(fileOf(monday()), e)).rejects.toThrow(NOT_SAVED_FIRST_TEXT);
      expect(e.apply).not.toHaveBeenCalled();
    }
    untouched(before);
    for (const why of ["unavailable", "unchanged", "empty"] as const) {
      localStorage.clear();
      seedAccount(today());
      await restoreBackupText(fileOf(monday()), env({ saveFirst: vi.fn(async (): Promise<TakeResult> => ({ saved: false, why })) }));
      expect(JSON.parse(localStorage.getItem("inventory")!).echoes, why).toHaveLength(4);
    }
  });

  it("refusals are RestoreRefused, with the sentence the player reads", async () => {
    await expect(restoreBackupText("nope", env())).rejects.toBeInstanceOf(RestoreRefused);
    expect(() => inspectBackupText(JSON.stringify({ meta: { version: "10" }, data: { character: JSON.stringify({ characters: {} }), inventory: null } }))).toThrow(/no characters, echoes, teams or pulls/);
  });
});

describe("the plus records, one by one", () => {
  const area = (seed: Record<string, string> = {}) => {
    const data = new Map(Object.entries(seed));
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  };

  it("a backup that says nothing about a record leaves it alone: only records it lists are written", () => {
    const store = area({ [CLEARS]: "today", [PLAN]: "today" });
    const result = restorePlusKeys({ [CLEARS]: "backup" }, store);
    expect(store.data.get(CLEARS)).toBe("backup");
    expect(store.data.get(PLAN)).toBe("today");
    expect(result.written).toEqual([CLEARS]);
  });

  it("a record the browser refuses is named and left as it was, and the others still go back", () => {
    const store = area({ [CLEARS]: "today", [PLAN]: "today" });
    const setItem = store.setItem;
    store.setItem = (k, v) => {
      if (k === CLEARS) throw new DOMException("full", "QuotaExceededError");
      setItem(k, v);
    };
    const result = restorePlusKeys({ [CLEARS]: "backup", [PLAN]: "backup" }, store);
    expect(result.failed).toEqual([CLEARS]);
    expect(store.data.get(CLEARS)).toBe("today");
    expect(store.data.get(PLAN)).toBe("backup");
    expect(plusFailureText(result.failed)).toContain("the logged Tower clears");
    expect(plusFailureText(result.failed)).toMatch(/characters, echoes and teams were restored/);
  });

  it("a pull history this build cannot read, stored or in the backup, is left exactly as it is", () => {
    const newer = JSON.stringify({ v: 99, players: {} });
    const store = area({ [PULLS]: newer });
    expect(restorePlusKeys({ [PULLS]: pullsRaw(THREE_PULLS) }, store).failed).toEqual([PULLS]);
    expect(store.data.get(PULLS)).toBe(newer);
    const mine = pullsRaw(THREE_PULLS);
    const other = area({ [PULLS]: mine });
    expect(restorePlusKeys({ [PULLS]: "{broken" }, other).failed).toEqual([PULLS]);
    expect(other.data.get(PULLS)).toBe(mine);
  });

  it("merging never drops a pull, adds another player's history whole, and keeps the player the page shows", () => {
    const stored = pullsRaw([pull("2026-11-15 21:00:00", "Variation")], "800000001");
    const merged = mergedPulls(stored, pullsRaw(THREE_PULLS, "900000002"), 5);
    expect(merged?.added).toBe(3);
    const history = decodeConveneHistory(merged!.raw);
    expect(history.ok && Object.keys(history.history.players).sort()).toEqual(["800000001", "900000002"]);
    expect(history.ok && history.history.activePlayerId).toBe("800000001");
    expect(mergedPulls(stored, null, 5)).toBeNull();
    expect(mergedPulls(stored, stored, 5)).toBeNull();
    expect(mergedPulls(null, stored, 5)?.added).toBe(1);
  });
});

describe("inspecting a file for the confirm", () => {
  it("says what is inside, when it was made and why, and whether it is one of ours", () => {
    expect(inspectBackupText(JSON.stringify(backupFile(monday(), "before-import", 1234)))).toMatchObject({
      counts: { characters: 1, builds: 2, echoes: 4, teams: 2, pulls: 3 },
      madeAt: 1234,
      reason: "before-import",
      plus: true,
    });
    const his = inspectBackupText(JSON.stringify({ meta: monday().meta, data: testStores() }));
    expect(his).toMatchObject({ counts: { echoes: 3, pulls: 0 }, madeAt: null, plus: false });
  });
});
