// Wuthering Tools+: a Settings import is checked whole before its first write, through upstream's own
// `applyImportedDatabase` on the real stores.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { applyImportedDatabase } from "../../utils/settingsBackup";
import { PROBE_KEY } from "../storage/persistGuard";
import { checkImport, ImportRefused, importOrExplain } from "./importCheck";

/* eslint-disable @typescript-eslint/no-explicit-any */

const backup = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    meta: { version: "8", source: "WutheringTools" },
    data: {
      character: JSON.stringify({ characters: { Chisa: { weapon: "Kumokiri" } }, activeCharacter: "Chisa", favoriteCharacters: [] }),
      inventory: JSON.stringify({ echoes: [{ echoId: "new1" }], equipped: {}, echoPresets: [] }),
      teamRotations: JSON.stringify({ teams: [{ id: "t2" }], favoriteTeamIds: [], favoritePresetNames: [] }),
      ...over,
    },
  });

const account = () => JSON.stringify({ c: useCharacterStore().characters, e: useInventoryStore().echoes, t: useTeamRotationsStore().teams });

describe("a Settings import", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    useCharacterStore().characters = { Aemeath: { weapon: "EverbrightPolestar" } };
    useInventoryStore().echoes = [{ echoId: "old1" }] as never;
    useTeamRotationsStore().teams = [{ id: "t1" }] as never;
  });

  it("replaces all three stores from a good backup", () => {
    applyImportedDatabase(backup());
    expect(Object.keys(useCharacterStore().characters)).toEqual(["Chisa"]);
    expect(useInventoryStore().echoes.map((e: any) => e.echoId)).toEqual(["new1"]);
    expect(useTeamRotationsStore().teams.map((t: any) => t.id)).toEqual(["t2"]);
  });

  it("still takes a version-1 backup (the character store, no meta) and an export from before teams", () => {
    applyImportedDatabase(JSON.stringify({ characters: { Lupa: {} }, activeCharacter: "Lupa" }));
    expect(Object.keys(useCharacterStore().characters)).toEqual(["Lupa"]);
    expect(useInventoryStore().echoes).toEqual([]);
    applyImportedDatabase(backup({ teamRotations: undefined }));
    expect(Object.keys(useCharacterStore().characters)).toEqual(["Chisa"]);
    expect(useTeamRotationsStore().teams).toEqual([]);
  });

  it.each([
    ["a list of echoes, what the box above asks for", JSON.stringify([{ echo: "Sigillum" }])],
    ["an empty object", "{}"],
    ["null", "null"],
    ["a number", "7"],
    ["a meta with no character store", backup({ character: null })],
    ["a character store with no characters", backup({ character: JSON.stringify({ activeCharacter: "x" }) })],
    ["characters as a list", backup({ character: JSON.stringify({ characters: [] }) })],
  ])("refuses %s before the first write", (_what, raw) => {
    const before = account();
    expect(() => applyImportedDatabase(raw)).toThrow(ImportRefused);
    expect(account()).toBe(before);
  });

  it.each([
    ["inventory cut off", { inventory: '{"echoes":[{"echoId":"ne' }, /echo inventory/],
    ["inventory of the wrong shape", { inventory: JSON.stringify({ echoes: "none" }) }, /echo inventory/],
    ["teams cut off", { teamRotations: '{"teams":[' }, /team list/],
    ["characters cut off", { character: '{"characters":{"Ch' }, /character list/],
  ])("a backup with its %s replaces nothing", (_what, over, message) => {
    const before = account();
    expect(() => applyImportedDatabase(backup(over))).toThrow(message as RegExp);
    expect(account()).toBe(before);
  });

  it("a backup that does not fit, stores and versions together, replaces nothing", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string) {
      if (key === PROBE_KEY) throw new DOMException("full", "QuotaExceededError");
    });
    const before = account();
    expect(() => applyImportedDatabase(backup())).toThrow(/does not fit/);
    expect(account()).toBe(before);
    write.mockRestore();
    expect(localStorage.getItem(PROBE_KEY)).toBeNull();
  });

  it("asks only for what it adds: a backup smaller than what is stored needs no probe", () => {
    const big = JSON.stringify({ characters: { Aemeath: { notes: "x".repeat(20_000) } } });
    const storage = { getItem: (k: string) => (k === "character" ? big : null), setItem: vi.fn(), removeItem: vi.fn() };
    const out = checkImport({ character: { characters: { Aemeath: {} } }, inventory: null, teamRotations: null, dataVersion: 8 }, (p) => p, { characters: {}, echoes: [] }, storage);
    expect(out.character.characters).toEqual({ Aemeath: {} });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("counts the versions a replaced build needs room for", () => {
    const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
    const replaced = { Aemeath: { notes: "x".repeat(50_000) } };
    checkImport({ character: { characters: {} }, inventory: null, teamRotations: null, dataVersion: 8 }, (p) => p, { characters: replaced, echoes: [] }, storage);
    expect((storage.setItem.mock.calls[0]![1] as string).length).toBeGreaterThan(100_000);
  });

  it("the page tells the player why, and does not go on to say it was overwritten", () => {
    const toasts: string[] = [];
    const say = (t: string) => void toasts.push(t);
    expect(importOrExplain(() => applyImportedDatabase("{}"), say)).toBe(false);
    expect(toasts[0]).toMatch(/^That is not a backup from this site/);
    expect(importOrExplain(() => applyImportedDatabase(backup()), say)).toBe(true);
    expect(toasts).toHaveLength(1);
  });
});
