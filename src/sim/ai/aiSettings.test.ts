import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_KEY_STORAGE,
  AI_SETTINGS_STORAGE,
  apiKeyHint,
  apiKeyLocation,
  clearApiKey,
  defaultAiSettings,
  looksLikeApiKey,
  normalizeAiSettings,
  readAiSettings,
  readApiKey,
  redactKeys,
  resetAiSettingsState,
  saveAiSettings,
  saveApiKey,
  useAiSettings,
  type KeyStores,
  type StorageLike,
} from "./aiSettings";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789-WXYZ";
let stores: KeyStores & { session: ReturnType<typeof memoryStorage>; local: ReturnType<typeof memoryStorage> };

beforeEach(() => {
  stores = { session: memoryStorage(), local: memoryStorage() };
});

describe("API key storage", () => {
  it("defaults to this tab only (sessionStorage)", () => {
    expect(saveApiKey(`  ${KEY}  `, false, stores)).toEqual({ ok: true, where: "session" });
    expect(stores.session.data.get(AI_KEY_STORAGE)).toBe(KEY);
    expect(stores.local.data.has(AI_KEY_STORAGE)).toBe(false);
    expect(readApiKey(stores)).toBe(KEY);
    expect(apiKeyLocation(stores)).toBe("session");
  });

  it("remembers on this device in localStorage, and keeps it in one place only", () => {
    saveApiKey(KEY, false, stores);
    expect(saveApiKey(KEY, true, stores)).toEqual({ ok: true, where: "local" });
    expect(stores.local.data.get(AI_KEY_STORAGE)).toBe(KEY);
    expect(stores.session.data.has(AI_KEY_STORAGE)).toBe(false);
    saveApiKey(KEY, false, stores);
    expect(stores.local.data.has(AI_KEY_STORAGE)).toBe(false);
  });

  it("clears both places; refuses an empty key; survives storage that throws", () => {
    saveApiKey(KEY, true, stores);
    clearApiKey(stores);
    expect(readApiKey(stores)).toBeNull();
    expect(saveApiKey("   ", false, stores).ok).toBe(false);
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readApiKey({ session: broken, local: null })).toBeNull();
    expect(saveApiKey(KEY, false, { session: broken, local: null })).toEqual({ ok: false, where: null });
    expect(() => clearApiKey({ session: broken, local: broken })).not.toThrow();
  });

  it("masks and redacts keys", () => {
    expect(looksLikeApiKey(KEY)).toBe(true);
    expect(looksLikeApiKey("sk-proj-123")).toBe(false);
    expect(apiKeyHint(KEY)).toBe("sk-ant-…WXYZ");
    expect(apiKeyHint(null)).toBeNull();
    expect(redactKeys(`bad key ${KEY} in header`)).toBe("bad key sk-ant-…WXYZ in header");
    expect(redactKeys("nothing here")).toBe("nothing here");
  });
});

describe("AI settings", () => {
  it("defaults: Opus 5.5, chat medium / explain low / vision low / critique high, $0.50 budget, key not remembered", () => {
    expect(defaultAiSettings()).toEqual({
      model: "claude-opus-5-5",
      effort: { chat: "medium", explain: "low", vision: "low", critique: "high" },
      budgetUsd: 0.5,
      rememberKey: false,
    });
  });

  it("normalises stored values (unknown model, effort or budget fall back)", () => {
    expect(normalizeAiSettings({ model: "gpt-9", effort: { chat: "ultra", vision: "high" }, budgetUsd: -3, rememberKey: "yes" })).toEqual({
      model: "claude-opus-5-5",
      effort: { chat: "medium", explain: "low", vision: "high", critique: "high" },
      budgetUsd: 0.5,
      rememberKey: false,
    });
    expect(normalizeAiSettings({ budgetUsd: 0.001 }).budgetUsd).toBe(0.05);
    expect(normalizeAiSettings({ budgetUsd: 1e6 }).budgetUsd).toBe(100);
    expect(normalizeAiSettings(null)).toEqual(defaultAiSettings());
  });

  it("round-trips through localStorage without the key in it", () => {
    const local = memoryStorage();
    saveAiSettings({ ...defaultAiSettings(), model: "claude-haiku-5-5", budgetUsd: 1.25 }, local);
    expect(readAiSettings(local)).toMatchObject({ model: "claude-haiku-5-5", budgetUsd: 1.25 });
    expect(local.data.get(AI_SETTINGS_STORAGE)).not.toMatch(/sk-ant/);
    local.data.set(AI_SETTINGS_STORAGE, "{not json");
    expect(readAiSettings(local)).toEqual(defaultAiSettings());
  });
});

describe("useAiSettings", () => {
  it("exposes whether a key is set and a hint, never the key itself", () => {
    resetAiSettingsState(stores, stores.local);
    const ai = useAiSettings();
    expect(ai.key.value).toEqual({ present: false, hint: null, where: null });
    expect(ai.setApiKey(KEY).ok).toBe(true);
    expect(ai.key.value).toEqual({ present: true, hint: "sk-ant-…WXYZ", where: "session" });
    expect(JSON.stringify(ai.key.value)).not.toContain(KEY);
    expect(JSON.stringify(ai.settings.value)).not.toContain(KEY);
    expect(ai.getApiKey()).toBe(KEY);
    ai.clearApiKey();
    expect(ai.key.value.present).toBe(false);
  });

  it("moves the key with the remember switch and persists settings", () => {
    resetAiSettingsState(stores, stores.local);
    const ai = useAiSettings();
    ai.setApiKey(KEY);
    ai.update({ rememberKey: true, model: "claude-sonnet-5-5", effort: { critique: "max" } });
    expect(ai.key.value.where).toBe("local");
    expect(ai.settings.value).toMatchObject({ model: "claude-sonnet-5-5", rememberKey: true });
    expect(ai.effortFor("critique")).toBe("max");
    expect(ai.effortFor("chat")).toBe("medium");
    expect(readAiSettings(stores.local).model).toBe("claude-sonnet-5-5");
    ai.update({ rememberKey: false });
    expect(ai.key.value.where).toBe("session");
    // a second instance shares the same state
    expect(useAiSettings().settings.value.model).toBe("claude-sonnet-5-5");
  });
});
