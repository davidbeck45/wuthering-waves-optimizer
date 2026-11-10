// Settings › Delete your data, the plus side (2026-11-08 hunt, M2): what goes, what stays, and that no key the code
// writes is left without a decision.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RESULT_DB_NAME } from "../persist/resultStore";
import { TAB_COPY_KEYS } from "../persist/savedResults";
import { ACCOUNT_STORE_KEYS } from "./persistGuard";
import { DELETE_CARD_TEXT, DELETE_CONFIRM_ITEMS, DELETE_CONFIRM_TEXT, deleteAccountData, STORAGE_RULES, type StorageRule } from "./deleteAccount";

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
    const before = { local: new Map(local.data), session: new Map(session.data) };
    deleteAccountData({ local, session, teams, results });
    return { local, session, teams, results, before };
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
    deleteAccountData({ local: empty, session: null, teams: null, results: { clear: async () => true } });
    expect([...empty.data.keys()]).toEqual(["teamRotations"]);
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

describe("the words say what the rules do", () => {
  const all = [DELETE_CARD_TEXT, DELETE_CONFIRM_TEXT, ...DELETE_CONFIRM_ITEMS].join(" ");

  it("names what goes: characters, builds, echoes, teams, Build history, Undo, the checks", () => {
    for (const word of ["characters", "builds", "echoes", "teams", "Build history", "Undo", "saved results", "Energy", "Tower", "Ask chat"]) expect(all).toContain(word);
    expect(DELETE_CONFIRM_TEXT).toMatch(/cannot be undone/);
    expect(DELETE_CONFIRM_TEXT).toMatch(/backup/);
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
