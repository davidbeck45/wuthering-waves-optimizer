// Wuthering Tools+: the guard between the persisted stores and localStorage, and two tabs on one account, on the real
// stores with the plugin the app uses.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createPersistedState } from "pinia-plugin-persistedstate";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { accountAdoptions, installCrossTabSync, onAccountAdopted, type SyncedStore } from "./crossTabSync";
import { accountStoresRefused, noticeRefusedWrites, persistStorage, PROBE_KEY, refusedStores, roomFor, STORAGE_FULL_TEXT, withoutPersisting } from "./persistGuard";

function freshStores() {
  const pinia = createPinia();
  createApp({}).use(pinia); // a pinia runs its plugins once an app has installed it
  pinia.use(createPersistedState({ auto: true, storage: persistStorage }));
  setActivePinia(pinia);
  return { character: useCharacterStore(), inventory: useInventoryStore(), team: useTeamRotationsStore() };
}

/** Another tab's write: what it leaves in localStorage, and the event this tab gets. */
function otherTabWrites(key: string, value: unknown): void {
  const raw = value == null ? null : JSON.stringify(value);
  if (raw == null) localStorage.removeItem(key);
  else localStorage.setItem(key, raw);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: raw, storageArea: localStorage }));
}

const realSetItem = Storage.prototype.setItem;
afterEach(() => {
  Storage.prototype.setItem = realSetItem;
  vi.useRealTimers();
});
beforeEach(() => {
  localStorage.clear();
  refusedStores.value = [];
});

describe("a scored page open when another tab edits", () => {
  const host = (state: DocumentVisibilityState = "visible") => {
    const listeners = new Set<() => void>();
    return {
      visibilityState: state,
      addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
      show() {
        this.visibilityState = "visible";
        for (const fn of listeners) fn();
      },
    };
  };
  const edit = async (stores: ReturnType<typeof freshStores>): Promise<void> => {
    await nextTick();
    otherTabWrites("character", { characters: { Aemeath: { level: 2 } }, activeCharacter: "", favoriteCharacters: [] });
    otherTabWrites("inventory", { echoes: [], equipped: {}, echoPresets: [], equippedPresets: {} });
    void stores;
    await nextTick();
  };

  it("scores again once the other tab's writes settle: one refresh for a burst", async () => {
    vi.useFakeTimers();
    const stores = freshStores();
    const stop = installCrossTabSync([stores.character, stores.inventory] as unknown as SyncedStore[]);
    const refresh = vi.fn();
    onAccountAdopted(refresh, 500, host() as unknown as Document);
    const before = accountAdoptions.value;
    await edit(stores);
    expect(accountAdoptions.value).toBe(before + 2);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it("waits until this tab is looked at: an edit elsewhere is no reason to score in the background", async () => {
    vi.useFakeTimers();
    const stores = freshStores();
    const stop = installCrossTabSync([stores.character, stores.inventory] as unknown as SyncedStore[]);
    const refresh = vi.fn();
    const page = host("hidden");
    onAccountAdopted(refresh, 500, page as unknown as Document);
    await edit(stores);
    vi.advanceTimersByTime(5000);
    expect(refresh).not.toHaveBeenCalled();
    page.show();
    expect(refresh).toHaveBeenCalledTimes(1);
    page.show();
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("two tabs on one account", () => {
  it("an older tab that writes after another tab's save keeps what that tab saved", async () => {
    const { character } = freshStores();
    character.characters = { Aemeath: { level: 90 } };
    character.activeCharacter = "Aemeath";
    await nextTick();
    const stop = installCrossTabSync([character as unknown as SyncedStore]);

    otherTabWrites("character", { characters: { Aemeath: { level: 90, builds: [{ id: "plan", name: "Account plan" }] }, Chisa: { level: 80 } }, activeCharacter: "Chisa", favoriteCharacters: [] });
    // this tab picks another character: the write that wiped the other tab's save
    character.activeCharacter = "Chisa";
    await nextTick();

    const stored = JSON.parse(localStorage.getItem("character")!);
    expect(stored.characters.Aemeath.builds.map((b: { id: string }) => b.id)).toEqual(["plan"]);
    expect(Object.keys(stored.characters)).toEqual(["Aemeath", "Chisa"]);
    stop();
  });

  it("takes a deletion too, which the plugin's own $hydrate merges back in", async () => {
    const { character } = freshStores();
    character.characters = { Aemeath: { level: 90 }, Chisa: { level: 80 } };
    await nextTick();
    const stop = installCrossTabSync([character as unknown as SyncedStore]);
    otherTabWrites("character", { characters: { Aemeath: { level: 90 } }, activeCharacter: "", favoriteCharacters: [] });
    expect(Object.keys(character.characters)).toEqual(["Aemeath"]);
    stop();
  });

  it("keeps the character this tab shows, and does not write back (two tabs would answer each other forever)", async () => {
    const { character } = freshStores();
    character.characters = { Aemeath: {}, Chisa: {} };
    character.activeCharacter = "Aemeath";
    await nextTick();
    const stop = installCrossTabSync([character as unknown as SyncedStore]);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const incoming = { characters: { Aemeath: { level: 1 }, Chisa: {} }, activeCharacter: "Chisa", favoriteCharacters: [] };
    const raw = JSON.stringify(incoming);
    window.dispatchEvent(new StorageEvent("storage", { key: "character", newValue: raw, storageArea: localStorage }));
    await nextTick();
    await nextTick();
    expect(character.activeCharacter).toBe("Aemeath");
    expect(character.characters.Aemeath).toEqual({ level: 1 });
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    stop();
  });

  it("moves off a character the other tab removed", async () => {
    const { character } = freshStores();
    character.characters = { Aemeath: {}, Chisa: {} };
    character.activeCharacter = "Chisa";
    await nextTick();
    const stop = installCrossTabSync([character as unknown as SyncedStore]);
    otherTabWrites("character", { characters: { Aemeath: {} }, activeCharacter: "Aemeath", favoriteCharacters: [] });
    expect(character.activeCharacter).toBe("Aemeath");
    stop();
  });

  it("follows the inventory and the teams, and an account cleared in the other tab stays cleared", async () => {
    const { character, inventory, team } = freshStores();
    character.characters = { Aemeath: {} };
    await nextTick();
    const stop = installCrossTabSync([character, inventory, team] as unknown as SyncedStore[]);
    otherTabWrites("inventory", { echoes: [{ echoId: "a" }, { echoId: "b" }], equipped: {}, echoPresets: [], equippedPresets: {} });
    otherTabWrites("teamRotations", { teams: [{ id: "t1" }], favoriteTeamIds: [], favoritePresetNames: [] });
    expect(inventory.echoes.map((e: { echoId: string }) => e.echoId)).toEqual(["a", "b"]);
    expect(team.teams.map((t: { id: string }) => t.id)).toEqual(["t1"]);
    otherTabWrites("character", null);
    expect(character.characters).toEqual({});
    stop();
  });

  it("ignores other keys, other storage areas and text that is not a store", async () => {
    const { character } = freshStores();
    character.characters = { Aemeath: {} };
    await nextTick();
    const stop = installCrossTabSync([character as unknown as SyncedStore]);
    window.dispatchEvent(new StorageEvent("storage", { key: "settings", newValue: "{}", storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent("storage", { key: "character", newValue: "{}", storageArea: sessionStorage }));
    window.dispatchEvent(new StorageEvent("storage", { key: "character", newValue: "not json", storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent("storage", { key: "character", newValue: "[1]", storageArea: localStorage }));
    expect(character.characters).toEqual({ Aemeath: {} });
    stop();
    window.dispatchEvent(new StorageEvent("storage", { key: "character", newValue: JSON.stringify({ characters: {} }), storageArea: localStorage }));
    expect(character.characters).toEqual({ Aemeath: {} });
  });
});

describe("a write the browser refuses", () => {
  const fullFor = (keys: string[]) => {
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (keys.includes(key)) throw new DOMException("full", "QuotaExceededError");
      return realSetItem.call(this, key, value);
    };
  };

  it("is remembered once the store has written, and forgotten when a write gets through", async () => {
    const { character } = freshStores();
    fullFor(["character"]);
    character.characters = { Aemeath: {} };
    await nextTick();
    expect(accountStoresRefused()).toBe(true);
    expect(refusedStores.value).toEqual(["character"]);
    Storage.prototype.setItem = realSetItem;
    character.characters = {};
    await nextTick();
    expect(accountStoresRefused()).toBe(false);
  });

  it("only the account stores count for a save", () => {
    fullFor(["settings"]);
    expect(() => persistStorage.setItem("settings", "{}")).toThrow();
    expect(refusedStores.value).toEqual(["settings"]);
    expect(accountStoresRefused()).toBe(false);
  });

  it("writes nothing while held back", () => {
    withoutPersisting(() => persistStorage.setItem("character", "x"));
    expect(localStorage.getItem("character")).toBeNull();
    persistStorage.setItem("character", "y");
    expect(localStorage.getItem("character")).toBe("y");
  });

  it("tells the player once, and not for a save that took itself back in time", async () => {
    vi.useFakeTimers();
    const told: string[] = [];
    const stop = noticeRefusedWrites((t) => told.push(t), 800);
    refusedStores.value = ["character"];
    await nextTick();
    refusedStores.value = [];
    await nextTick();
    vi.advanceTimersByTime(2000);
    expect(told).toEqual([]);

    refusedStores.value = ["character"];
    await nextTick();
    vi.advanceTimersByTime(900);
    expect(told).toEqual([STORAGE_FULL_TEXT]);
    refusedStores.value = ["character", "inventory"];
    await nextTick();
    vi.advanceTimersByTime(900);
    expect(told).toHaveLength(1);
    stop();
  });

  it("roomFor tries a scratch key and leaves nothing behind", () => {
    const mem = new Map<string, string>();
    const roomy = { setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(roomFor(0, { setItem: () => { throw new Error("never asked"); }, removeItem: () => undefined })).toBe(true);
    expect(roomFor(1000, roomy)).toBe(true);
    expect(mem.has(PROBE_KEY)).toBe(false);
    const full = { setItem: () => { throw new DOMException("full", "QuotaExceededError"); }, removeItem: () => undefined };
    expect(roomFor(1000, full)).toBe(false);
  });
});
