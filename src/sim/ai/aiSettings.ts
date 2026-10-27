// Wuthering Tools+ AI — settings and the bring-your-own Anthropic API key.
//
// Rules:
//   * the key lives in sessionStorage `wtplus:ai:key` (gone when the tab closes); "remember on this device"
//     moves it to localStorage under the same name. One place at a time — saving clears the other.
//   * the key is never put in Pinia (Settings › Backup exports the Pinia stores), never in reactive state
//     (devtools), never logged; the composable exposes only whether one is set and a masked hint.
//   * model / effort / budget live in localStorage `wtplus:ai:settings` (no key in there).
// The storage functions are pure over a `StorageLike` so tests pass in-memory stores; `useAiSettings()`
// at the bottom is the small reactive wrapper for Vue.
import { readonly, ref, type Ref } from "vue";
import { DEFAULT_AI_MODEL, isAiEffort, isAiModel, type AiEffort, type AiModel } from "./models";

export const AI_KEY_STORAGE = "wtplus:ai:key";
export const AI_SETTINGS_STORAGE = "wtplus:ai:settings";

export type AiFeature = "chat" | "explain" | "vision" | "critique";
export const AI_FEATURES: readonly AiFeature[] = ["chat", "explain", "vision", "critique"];

export interface AiSettings {
  model: AiModel;
  /** effort per feature (Opus 5.5 always thinks; effort is the depth control) */
  effort: Record<AiFeature, AiEffort>;
  /** soft budget per conversation in USD: past it, the UI asks before the next request */
  budgetUsd: number;
  /** the key is kept in localStorage instead of sessionStorage */
  rememberKey: boolean;
}

export const DEFAULT_EFFORT: Readonly<Record<AiFeature, AiEffort>> = { chat: "medium", explain: "low", vision: "low", critique: "high" };
export const DEFAULT_BUDGET_USD = 0.5;
export const MIN_BUDGET_USD = 0.05;
export const MAX_BUDGET_USD = 100;

export const defaultAiSettings = (): AiSettings => ({ model: DEFAULT_AI_MODEL, effort: { ...DEFAULT_EFFORT }, budgetUsd: DEFAULT_BUDGET_USD, rememberKey: false });

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface KeyStores {
  session: StorageLike | null;
  local: StorageLike | null;
}

/** window.sessionStorage / localStorage, or null where unavailable (Node, privacy modes that throw). */
export function browserStorage(kind: "sessionStorage" | "localStorage"): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window[kind];
    return s ?? null;
  } catch {
    return null;
  }
}

export const browserKeyStores = (): KeyStores => ({ session: browserStorage("sessionStorage"), local: browserStorage("localStorage") });

function get(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function set(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false; // quota / disabled storage
  }
}
function remove(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

/** Plausibly an Anthropic API key (sk-ant-…); a format check only, the API is the judge. */
export function looksLikeApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(key.trim());
}

/** "sk-ant-…AbCd" — enough to recognise a key, never enough to use it. */
export function apiKeyHint(key: string | null): string | null {
  if (!key) return null;
  const k = key.trim();
  return k.length <= 10 ? "…" : `${k.slice(0, 7)}…${k.slice(-4)}`;
}

/** Replaces anything shaped like an API key in a message with its hint (errors may echo request data). */
export function redactKeys(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, (k) => apiKeyHint(k) ?? "…");
}

/** The stored key: this tab's first, then a remembered one. */
export function readApiKey(stores: KeyStores = browserKeyStores()): string | null {
  const key = get(stores.session, AI_KEY_STORAGE) ?? get(stores.local, AI_KEY_STORAGE);
  return key && key.trim() ? key.trim() : null;
}

export interface SaveKeyResult {
  ok: boolean;
  where: "session" | "local" | null;
}

/** Stores the key in exactly one place: localStorage when `remember`, else sessionStorage. */
export function saveApiKey(key: string, remember: boolean, stores: KeyStores = browserKeyStores()): SaveKeyResult {
  const k = key.trim();
  if (!k) return { ok: false, where: null };
  const target = remember ? stores.local : stores.session;
  const other = remember ? stores.session : stores.local;
  if (!set(target, AI_KEY_STORAGE, k)) return { ok: false, where: null };
  remove(other, AI_KEY_STORAGE);
  return { ok: true, where: remember ? "local" : "session" };
}

export function clearApiKey(stores: KeyStores = browserKeyStores()): void {
  remove(stores.session, AI_KEY_STORAGE);
  remove(stores.local, AI_KEY_STORAGE);
}

/** Where the current key sits, if anywhere. */
export function apiKeyLocation(stores: KeyStores = browserKeyStores()): "session" | "local" | null {
  if (get(stores.session, AI_KEY_STORAGE)) return "session";
  if (get(stores.local, AI_KEY_STORAGE)) return "local";
  return null;
}

function clampBudget(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(x) || x <= 0) return DEFAULT_BUDGET_USD;
  return Math.min(MAX_BUDGET_USD, Math.max(MIN_BUDGET_USD, Math.round(x * 100) / 100));
}

/** Any stored value → valid settings (unknown model / effort / budget fall back to the defaults). */
export function normalizeAiSettings(raw: unknown): AiSettings {
  const d = defaultAiSettings();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const effortIn = (r.effort && typeof r.effort === "object" ? r.effort : {}) as Record<string, unknown>;
  const effort = { ...d.effort };
  for (const f of Object.keys(effort) as AiFeature[]) if (isAiEffort(effortIn[f])) effort[f] = effortIn[f] as AiEffort;
  return {
    model: isAiModel(r.model) ? r.model : d.model,
    effort,
    budgetUsd: r.budgetUsd === undefined ? d.budgetUsd : clampBudget(r.budgetUsd),
    rememberKey: r.rememberKey === true,
  };
}

export function readAiSettings(storage: StorageLike | null = browserStorage("localStorage")): AiSettings {
  const text = get(storage, AI_SETTINGS_STORAGE);
  if (!text) return defaultAiSettings();
  try {
    return normalizeAiSettings(JSON.parse(text));
  } catch {
    return defaultAiSettings();
  }
}

export function saveAiSettings(settings: AiSettings, storage: StorageLike | null = browserStorage("localStorage")): AiSettings {
  const clean = normalizeAiSettings(settings);
  set(storage, AI_SETTINGS_STORAGE, JSON.stringify(clean));
  return clean;
}

// ── the composable ─────────────────────────────────────────────────────────────────────────────

/** A settings change: any field, effort per feature. */
export type AiSettingsPatch = Partial<Omit<AiSettings, "effort">> & { effort?: Partial<Record<AiFeature, AiEffort>> };

export interface AiKeyState {
  present: boolean;
  /** masked, e.g. "sk-ant-…AbCd" */
  hint: string | null;
  where: "session" | "local" | null;
}

interface AiSettingsState {
  settings: Ref<AiSettings>;
  key: Ref<AiKeyState>;
  stores: KeyStores;
  settingsStorage: StorageLike | null;
}

let state: AiSettingsState | null = null;

function keyStateOf(stores: KeyStores): AiKeyState {
  const key = readApiKey(stores);
  return { present: Boolean(key), hint: apiKeyHint(key), where: apiKeyLocation(stores) };
}

/** Test hook: point the composable at other storages (and reset it). */
export function resetAiSettingsState(stores?: KeyStores, settingsStorage?: StorageLike | null): void {
  state = null;
  if (stores) init(stores, settingsStorage ?? stores.local);
}

function init(stores: KeyStores = browserKeyStores(), settingsStorage: StorageLike | null = stores.local): AiSettingsState {
  state ??= { settings: ref(readAiSettings(settingsStorage)), key: ref(keyStateOf(stores)), stores, settingsStorage };
  return state;
}

/** Reactive AI settings for the drawer / settings panel. The key itself is read on demand (`getApiKey`), never held reactively. */
export function useAiSettings() {
  const s = init();
  const refreshKey = (): void => {
    s.key.value = keyStateOf(s.stores);
  };
  return {
    settings: readonly(s.settings),
    key: readonly(s.key),
    update(patch: AiSettingsPatch): AiSettings {
      const next = saveAiSettings({ ...s.settings.value, ...patch, effort: { ...s.settings.value.effort, ...(patch.effort ?? {}) } }, s.settingsStorage);
      // moving the remembered flag moves the key with it
      if (patch.rememberKey !== undefined && patch.rememberKey !== s.settings.value.rememberKey) {
        const key = readApiKey(s.stores);
        if (key) saveApiKey(key, patch.rememberKey, s.stores);
      }
      s.settings.value = next;
      refreshKey();
      return next;
    },
    setApiKey(key: string, remember = s.settings.value.rememberKey): SaveKeyResult {
      const result = saveApiKey(key, remember, s.stores);
      if (result.ok && remember !== s.settings.value.rememberKey) s.settings.value = saveAiSettings({ ...s.settings.value, rememberKey: remember }, s.settingsStorage);
      refreshKey();
      return result;
    },
    clearApiKey(): void {
      clearApiKey(s.stores);
      refreshKey();
    },
    /** The key for one request; never store the return value in component state. */
    getApiKey(): string | null {
      return readApiKey(s.stores);
    },
    effortFor(feature: AiFeature): AiEffort {
      return s.settings.value.effort[feature];
    },
    refreshKey,
  };
}
