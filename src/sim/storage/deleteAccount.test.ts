// Settings › Delete your data, the plus side (2026-11-08 hunt, M2): what goes, what stays, and that no key the code
// writes is left without a decision.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RESULT_DB_NAME } from "../persist/resultStore";
import { TAB_COPY_KEYS } from "../persist/savedResults";
import { ACCOUNT_STORE_KEYS } from "./persistGuard";
import { BACKUP_DB_NAME } from "../backup/backupStore";
import {
  ACCOUNT_DELETED_KEY,
  BACKUP_CLASS_TEXT,
  DELETE_CARD_TEXT,
  DELETE_CONFIRM_ITEMS,
  DELETE_CONFIRM_TEXT,
  DELETE_SEEN_KEY,
  deleteAccountData,
  honourDeleteElsewhere,
  installDeleteWatch,
  STORAGE_RULES,
  type StorageRule,
} from "./deleteAccount";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** A Map behind the Web Storage API. */
function memoryArea(seed: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  } as Storage & { data: Map<string, string> };
}

const inArea = (rule: StorageRule, area: "local" | "session"): boolean => rule.area === area || rule.area === "local+session";
/** the key a rule stands for in a seeded storage (a prefix gets a character behind it) */
const seedKey = (rule: StorageRule): string => (rule.prefix ? `${rule.key}Aemeath` : rule.key);

function seeded(area: "local" | "session"): Storage & { data: Map<string, string> } {
  const seed: Record<string, string> = {};
  for (const rule of STORAGE_RULES) if (inArea(rule, area)) seed[seedKey(rule)] = JSON.stringify({ v: 1, was: rule.key });
  return memoryArea(seed);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__fixtures__" || name === "__snapshots__") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|vue|js)$/.test(name) && !/\.(test|spec)\.ts$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

/** every quoted name matching `pattern` in the files under `dir`, with one file that has it */
function quotedNames(dir: string, pattern: RegExp): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles(dir)) {
    for (const m of readFileSync(file, "utf8").matchAll(pattern)) if (!found.has(m[1]!)) found.set(m[1]!, file.slice(ROOT.length + 1));
  }
  return found;
}

/** `wtplus:` names that are no storage key: worker message types, a window event, the seeds of two random streams */
const NOT_STORAGE = new Set(["wtplus:riley", "wtplus:riley:cancel", "wtplus:riley:progress", "wtplus:open-team", "wtplus:crit-luck", "wtplus:kill-odds"]);

describe("every place the app keeps something has a decision", () => {
  const ruleOf = (name: string): StorageRule | undefined => STORAGE_RULES.find((r) => r.key === name);

  it("each wtplus: key in the code is in STORAGE_RULES: a new key must say whether Delete takes it", () => {
    const names = quotedNames(join(ROOT, "src"), /["'](wtplus:[^"'`$\s]*)["']/g);
    expect(names.size).toBeGreaterThan(30);
    const undecided = [...names].filter(([name]) => !NOT_STORAGE.has(name) && !ruleOf(name)).map(([name, file]) => `${name} (${file})`);
    expect(undecided).toEqual([]);
  }, 30_000);

  it("the rankings page's own keys (wuwa.*) are in it too", () => {
    const page = join(ROOT, "vendor/wuwa_calc/src");
    if (!existsSync(page)) return; // a checkout without the engine: nothing to read
    const names = quotedNames(page, /["'](wuwa\.[A-Za-z0-9.]+)["']/g);
    expect(names.size).toBeGreaterThan(0);
    expect([...names.keys()].filter((name) => !ruleOf(name))).toEqual([]);
  }, 30_000);

  it("the account stores, each tab copy and the saved results database are in it, and go", () => {
    for (const key of [...ACCOUNT_STORE_KEYS, ...TAB_COPY_KEYS, RESULT_DB_NAME]) expect(ruleOf(key)?.fate, key).toBe("goes");
    expect(ruleOf(RESULT_DB_NAME)?.area).toBe("indexedDB");
    for (const key of TAB_COPY_KEYS) expect(ruleOf(key), key).toMatchObject({ area: "session", by: "savedResults" });
  });

  it("each rule says whether a backup holds it: his export, the five records only plus keeps (Riley's Value roster among them), and never the API key", () => {
    const classes = Object.keys(BACKUP_CLASS_TEXT);
    for (const r of STORAGE_RULES) expect(classes, r.key).toContain(r.backup);
    // every wtplus: name in the code has that decision (a rule without one does not compile; a name without a rule fails above)
    const names = quotedNames(join(ROOT, "src"), /["'](wtplus:[^"'`$\s]*)["']/g);
    for (const [name] of names) if (!NOT_STORAGE.has(name)) expect(ruleOf(name)?.backup, name).toBeTruthy();

    const keysOf = (backup: StorageRule["backup"]): string[] => STORAGE_RULES.filter((r) => r.backup === backup).map((r) => r.key).sort();
    expect(keysOf("export")).toEqual(["character", "dataVersion", "inventory", "teamRotations"]);
    // adding a record to the backups is a decision: it is made here, by name
    expect(keysOf("account")).toEqual(["wtplus:convene:history", "wtplus:echoPlan:v1", "wtplus:endgame:clears", "wuthering-tools-plus.echoScan.albums", "wuwa.owned.v1"]);
    expect(keysOf("secret")).toEqual(["wtplus:ai:key"]);
    // what a backup carries is one whole localStorage record each: capture and restore read and write it as text
    for (const r of STORAGE_RULES.filter((x) => x.backup === "account")) expect(r, r.key).toMatchObject({ area: "local" });
    for (const r of STORAGE_RULES.filter((x) => x.backup === "account")) expect(r.prefix, r.key).toBeUndefined();
    // saved results, each tab copy and the backups themselves are never inside a backup
    for (const key of [RESULT_DB_NAME, ...TAB_COPY_KEYS]) expect(ruleOf(key)?.backup, key).toBe("cache");
    expect(ruleOf(BACKUP_DB_NAME)).toMatchObject({ area: "indexedDB", fate: "goes", by: "backups", backup: "copy" });
    // nothing that sounds like a credential is in one
    for (const r of STORAGE_RULES) if (/key$|token|secret|password/i.test(r.key)) expect(["export", "account"], r.key).not.toContain(r.backup);
  }, 30_000);

  it("no key is listed twice, and each says why", () => {
    const keys = STORAGE_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of STORAGE_RULES) expect(r.why.length, r.key).toBeGreaterThan(8);
  });
});

describe("Delete your data takes everything kept from the account", () => {
  function run() {
    const local = seeded("local");
    const session = seeded("session");
    local.setItem("teamRotations", JSON.stringify({ teams: [{ id: "t1", name: "Aemeath · Mornye + Lynae" }], favoriteTeamIds: ["t1"], favoritePresetNames: ["Aemeath · Chisa + Denia · S6R5 (wuwa_calc)"] }));
    local.setItem("wtplus:buildHistory:v1:Mornye", "{}");
    const teams = { hardSetState: vi.fn() };
    const results = { clear: vi.fn(async () => true) };
    const dropBackups = vi.fn();
    const before = { local: new Map(local.data), session: new Map(session.data) };
    deleteAccountData({ local, session, teams, results, dropBackups, onLeave: () => undefined });
    return { local, session, teams, results, dropBackups, before };
  }

  it("the teams go: the stored record is blank, as upstream leaves its two stores, and this tab's store is emptied", () => {
    const { local, teams } = run();
    expect(local.getItem("teamRotations")).toBe("");
    expect(teams.hardSetState).toHaveBeenCalledWith(undefined);
  });

  it("Build history of every character, each Undo, the energy and endgame checks, the Ask chat: gone", () => {
    const { local, session } = run();
    expect([...local.data.keys()].filter((k) => k.startsWith("wtplus:buildHistory:"))).toEqual([]);
    for (const key of ["wtplus:buildAccount:undo:v1", "wtplus:buildTeam:undo:v1", "wtplus:rankings:sync:undo:v1", "wtplus:energy:v1", "wtplus:endgame:check", "wtplus:endgame:clears", "wtplus:buildAccount:choice:v1", "wuwa.solves.v1"]) {
      expect(local.getItem(key), key).toBeNull();
    }
    expect(session.getItem("wtplus:ai:chat")).toBeNull();
    expect(session.getItem("teamRotationsActiveTeamId")).toBeNull();
  });

  it("every rule is carried out: what goes is gone from its area, what stays is untouched", () => {
    const { local, session, before } = run();
    for (const rule of STORAGE_RULES) {
      if (rule.area === "indexedDB" || rule.by || rule.keep) continue; // upstream's two stores, the teams, savedResults.clear(), a pared record: their own tests
      if (rule.key === ACCOUNT_DELETED_KEY || rule.key === DELETE_SEEN_KEY) continue; // Delete's own stamp: "a Delete reaches the other tabs" below
      for (const [area, store] of [["local", local], ["session", session]] as const) {
        if (!inArea(rule, area)) continue;
        const key = seedKey(rule);
        if (rule.fate === "goes") expect(store.getItem(key), `${key} goes`).toBeNull();
        else expect(store.getItem(key), `${key} stays`).toBe(before[area].get(key));
      }
    }
  });

  it("the settings, the assistant's key in both places, the pull history and Today stay", () => {
    const { local, session, before } = run();
    for (const key of ["settings", "dataVersion", "wtplus:ai:key", "wtplus:ai:settings", "wtplus:buildTeam:options:v1", "wtplus:convene:history", "wtplus:today:v1", "wtplus:teamBuffs:auto"]) {
      expect(local.getItem(key), key).toBe(before.local.get(key));
    }
    expect(session.getItem("wtplus:ai:key")).toBe(before.session.get("wtplus:ai:key"));
  });

  it("the saved results are cleared with it (the database, the tab copies, what a page cache holds)", () => {
    expect(run().results.clear).toHaveBeenCalledTimes(1);
  });

  it("the automatic backups go with it: whole copies of the account, and when a copy last left the browser", () => {
    const { local, dropBackups } = run();
    expect(dropBackups).toHaveBeenCalledTimes(1);
    expect(local.getItem("wtplus:backup:state")).toBeNull();
  });

  it("a browser whose backups cannot be deleted still loses everything else", () => {
    const local = seeded("local");
    const results = { clear: vi.fn(async () => true) };
    const dropBackups = vi.fn(() => {
      throw new Error("blocked");
    });
    expect(() => deleteAccountData({ local, session: null, teams: null, results, dropBackups })).not.toThrow();
    expect(local.getItem("wtplus:energy:v1")).toBeNull();
    expect(results.clear).toHaveBeenCalled();
  });

  it("upstream's two stores are left to upstream: it blanks them itself, before this runs", () => {
    const { local, before } = run();
    expect(local.getItem("character")).toBe(before.local.get("character"));
    expect(local.getItem("inventory")).toBe(before.local.get("inventory"));
  });

  it("Echo plan keeps its switches and server, and loses the ticks, the planned characters and the codes", () => {
    const local = memoryArea({
      "wtplus:echoPlan:v1": JSON.stringify({ v: 1, savedAt: 5, done: { MoonlitClouds: true }, grid: { MoonlitClouds: {} }, planned: ["Aemeath"], excluded: ["Chisa"], codes: { america: "hgB5KC7W25WAAcIsH2kv" }, server: "europe", options: { pairCrit: false } }),
    });
    deleteAccountData({ local, session: null, teams: null, results: { clear: async () => true } });
    expect(JSON.parse(local.getItem("wtplus:echoPlan:v1")!)).toEqual({ v: 1, server: "europe", options: { pairCrit: false } });
  });

  it("an Echo plan record that cannot be read is removed, and one that is not there is not made", () => {
    const local = memoryArea({ "wtplus:echoPlan:v1": "{not json" });
    deleteAccountData({ local, session: null, teams: null, results: { clear: async () => true } });
    expect(local.getItem("wtplus:echoPlan:v1")).toBeNull();
    const empty = memoryArea();
    deleteAccountData({ local: empty, session: null, teams: null, results: { clear: async () => true }, onLeave: () => undefined });
    // the blank teams record and the stamp the other tabs watch for: nothing else is made
    expect([...empty.data.keys()]).toEqual(["teamRotations", ACCOUNT_DELETED_KEY]);
  });

  it("a storage that refuses, or none at all, stops nothing: the saved results still go", () => {
    const refusing = memoryArea({ "wtplus:energy:v1": "{}" });
    refusing.removeItem = () => {
      throw new Error("blocked");
    };
    refusing.setItem = () => {
      throw new Error("blocked");
    };
    const results = { clear: vi.fn(async () => true) };
    const teams = { hardSetState: vi.fn() };
    expect(() => deleteAccountData({ local: refusing, session: null, teams, results })).not.toThrow();
    expect(teams.hardSetState).toHaveBeenCalled();
    expect(results.clear).toHaveBeenCalled();
    expect(() => deleteAccountData({ local: null, session: null, teams: null, results })).not.toThrow();
  });
});

// 2026-11-16, second check. With two tabs open, the tab that did not delete kept its Ask chat (shown again after a
// reload of that tab), its copies of the ranking and the investment plan, and an Energy check still running there
// wrote the deleted teams' measurements back into localStorage when it finished.
describe("a Delete reaches the other tabs, and a check that ends after it", () => {
  const CHAT = JSON.stringify({ version: 1, id: "c1", snapshot: "Aemeath S2, Mornye, Lynae" });
  /** another tab of the same browser: its own sessionStorage, the same localStorage */
  const otherTab = (): Storage & { data: Map<string, string> } =>
    memoryArea({ "wtplus:ai:chat": CHAT, "wtplus:myRankings:last": "{}", "wtplus:account:invest": "{}", teamRotationsActiveTeamId: "t1", "wtplus:ai:key": "sk-test", "wt-classic-ui-session-reported": "1" });
  const results = { clear: async () => true };

  function deleted() {
    const local = memoryArea({ "wtplus:ai:key": "sk-test", "wtplus:convene:history": "{}" });
    const session = memoryArea({ "wtplus:ai:chat": CHAT });
    let leave: () => void = () => undefined;
    deleteAccountData({ local, session, teams: null, results, onLeave: (again) => (leave = again), now: () => 1_794_000_000_000 });
    return { local, session, leave: () => leave() };
  }

  it("Delete leaves a stamp, and the tab that deleted has already acted on it", () => {
    const { local, session } = deleted();
    const stamp = local.getItem(ACCOUNT_DELETED_KEY);
    expect(stamp).toMatch(/^1794000000000:[a-z0-9]+$/);
    expect(session.getItem(DELETE_SEEN_KEY)).toBe(stamp);
    // so a chat started on a new account in that tab is not taken on its next load
    session.setItem("wtplus:ai:chat", CHAT);
    expect(honourDeleteElsewhere({ local, session })).toBe(false);
    expect(session.getItem("wtplus:ai:chat")).toBe(CHAT);
  });

  it("another tab drops its own Ask chat, its tab copies and its open team, once, and keeps its key", () => {
    const { local } = deleted();
    const tab = otherTab();
    expect(honourDeleteElsewhere({ local, session: tab })).toBe(true);
    for (const key of ["wtplus:ai:chat", "wtplus:myRankings:last", "wtplus:account:invest", "teamRotationsActiveTeamId"]) expect(tab.getItem(key), key).toBeNull();
    expect(tab.getItem("wtplus:ai:key")).toBe("sk-test");
    expect(tab.getItem("wt-classic-ui-session-reported")).toBe("1");
    // acted on: a chat started afterwards in that tab stays
    tab.setItem("wtplus:ai:chat", CHAT);
    expect(honourDeleteElsewhere({ local, session: tab })).toBe(false);
    expect(tab.getItem("wtplus:ai:chat")).toBe(CHAT);
  });

  it("every session key that goes is one another tab drops, the saved results' tab copies among them", () => {
    const { local } = deleted();
    const tab = seeded("session");
    honourDeleteElsewhere({ local, session: tab });
    for (const rule of STORAGE_RULES) {
      if (!inArea(rule, "session") || rule.key === DELETE_SEEN_KEY) continue;
      if (rule.fate === "goes") expect(tab.getItem(seedKey(rule)), `${rule.key} goes`).toBeNull();
      else expect(tab.getItem(seedKey(rule)), `${rule.key} stays`).not.toBeNull();
    }
    for (const key of TAB_COPY_KEYS) expect(tab.getItem(key), key).toBeNull();
  });

  it("no Delete, no stamp: a tab keeps its chat", () => {
    const tab = otherTab();
    expect(honourDeleteElsewhere({ local: memoryArea(), session: tab })).toBe(false);
    expect(tab.getItem("wtplus:ai:chat")).toBe(CHAT);
    expect(tab.getItem(DELETE_SEEN_KEY)).toBeNull();
  });

  it("a tab that is open when it happens drops its copies and reloads; a tab that slept through it drops them as it loads", () => {
    const { local } = deleted();
    const stamp = local.getItem(ACCOUNT_DELETED_KEY)!;
    // open: the storage event of the stamp
    const open = otherTab();
    const listeners: Array<(e: StorageEvent) => void> = [];
    const host = { addEventListener: (_: "storage", l: (e: StorageEvent) => void) => void listeners.push(l), removeEventListener: (_: "storage", l: (e: StorageEvent) => void) => void listeners.splice(listeners.indexOf(l), 1) };
    const reload = vi.fn();
    const local0 = memoryArea(); // before the Delete: nothing to act on at load
    const stop = installDeleteWatch(host, reload, { local: local0, session: open });
    expect(open.getItem("wtplus:ai:chat")).toBe(CHAT);
    // another key changing, or the stamp being removed, is not a Delete
    listeners[0]!({ key: "settings", newValue: "{}" } as StorageEvent);
    listeners[0]!({ key: ACCOUNT_DELETED_KEY, newValue: null } as StorageEvent);
    expect(reload).not.toHaveBeenCalled();
    local0.setItem(ACCOUNT_DELETED_KEY, stamp);
    listeners[0]!({ key: ACCOUNT_DELETED_KEY, newValue: stamp } as StorageEvent);
    expect(open.getItem("wtplus:ai:chat")).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
    // the same event again (a browser may repeat it): acted on already, no second reload
    listeners[0]!({ key: ACCOUNT_DELETED_KEY, newValue: stamp } as StorageEvent);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners).toHaveLength(0);

    // asleep (a phone's background tab, restored with its sessionStorage): no event ever comes, the load does it
    const asleep = otherTab();
    const reloadAsleep = vi.fn();
    installDeleteWatch(host, reloadAsleep, { local, session: asleep });
    expect(asleep.getItem("wtplus:ai:chat")).toBeNull();
    expect(asleep.getItem("wtplus:myRankings:last")).toBeNull();
    expect(reloadAsleep).not.toHaveBeenCalled(); // it is loading now: nothing in memory to drop
  });

  it("a check that ends between the Delete and the reload does not bring its result back", () => {
    const { local, session, leave } = deleted();
    // the Energy check and a Tower check finishing inside the 1.5 s the toast is up, and the chat's last answer landing
    local.setItem("wtplus:energy:v1", '{"v":1,"entries":{"energy|e95d4e6|8vmmx4|1xqxkuc|Lucilla+Mornye+Sigrika":{}}}');
    local.setItem("wtplus:endgame:check", "{}");
    local.setItem("wtplus:buildHistory:v1:Mornye", "{}");
    session.setItem("wtplus:ai:chat", CHAT);
    leave(); // the page goes away
    for (const key of ["wtplus:energy:v1", "wtplus:endgame:check", "wtplus:buildHistory:v1:Mornye"]) expect(local.getItem(key), key).toBeNull();
    expect(session.getItem("wtplus:ai:chat")).toBeNull();
    // what stays, stays; the stamp too
    expect(local.getItem("wtplus:ai:key")).toBe("sk-test");
    expect(local.getItem("wtplus:convene:history")).toBe("{}");
    expect(local.getItem(ACCOUNT_DELETED_KEY)).not.toBeNull();
  });
});

describe("the words say what the rules do", () => {
  const all = [DELETE_CARD_TEXT, DELETE_CONFIRM_TEXT, ...DELETE_CONFIRM_ITEMS].join(" ");

  it("names what goes: characters, builds, echoes, teams, Build history, Undo, the checks", () => {
    for (const word of ["characters", "builds", "echoes", "teams", "Build history", "Undo", "automatic backups", "saved results", "Energy", "Tower", "Ask chat"]) expect(all).toContain(word);
    expect(DELETE_CARD_TEXT).toContain("automatic backups");
    expect(DELETE_CONFIRM_TEXT).toMatch(/cannot be undone/);
    expect(DELETE_CONFIRM_TEXT).toMatch(/download a copy first/);
  });

  it("names what stays, the pull history among it, as the rules have it", () => {
    const kept = DELETE_CONFIRM_ITEMS.filter((line) => line.startsWith("Kept"));
    expect(kept).toHaveLength(DELETE_CONFIRM_ITEMS.length); // the list is only what stays: what goes is the paragraph
    expect(kept.join(" ")).toMatch(/settings/);
    expect(kept.join(" ")).toMatch(/API key/);
    expect(kept.join(" ")).toMatch(/Convene pull history/);
    expect(kept.join(" ")).toMatch(/Today/);
    for (const key of ["settings", "wtplus:ai:key", "wtplus:convene:history", "wtplus:today:v1"]) expect(STORAGE_RULES.find((r) => r.key === key)?.fate, key).toBe("stays");
  });
});
