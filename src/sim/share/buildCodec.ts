// Wuthering Tools+ share cards — the share format: one build or one team as plain JSON, small enough to ride
// inside a PNG chunk or a URL fragment, complete enough to restore the build exactly. Pure (no Vue, no stores):
// the account's records in, a payload out, and back. Format documented in src/sim/README.md § Share cards.
//
// Why echoes are inlined: a build points at inventory echoes by `echoId`, which mean nothing in another browser.
// The card carries each echo's own fields; the importer matches them against its inventory (mergePreview.ts).
//
// Detail tiers (`detail`): "full" = every build field (buff toggles, rotations, optimizer settings, team panel)
// plus the headline rotation's actions and, for a team, its actions; "lean" = the same without the member
// rotations, optimizer settings, Team Buffs panel and headline rotation (a link that must stay short); "gear" =
// character, weapon, sequence, talents and echoes only — what a Tacet Lab card carries.
import { allCharactersList } from "../../characters/characters";
import { getWeaponsByType } from "../../weapons/weapons";
import { echoCostClassMap, mainEchoesData } from "../../echoes/index";
import { echoSetLabelMap, statsTable, subStats, subStatsTable } from "../../echoes/stats";
import { getSetBonusEffects } from "../../echoes/sets";
import { extractBuildFields, omitBuildMetadata } from "../../characters/buildFields";
import { resolveCharacterEchoes } from "../../calculator/buildCharacterContext";
import { sequenceOf } from "../myRankings/rankRoster";
import { TACET_CHARACTER_IDS, TACET_WEAPON_IDS } from "./tacetIds";

export const SHARE_FORMAT = "wtplus-build";
export const SHARE_VERSION = 1;
/** PNG iTXt keyword of a WT+ card. */
export const SHARE_KEYWORD = "WTPlusBuild";
/** PNG iTXt keyword of a Tacet Lab card (read only). */
export const TACET_KEYWORD = "TacetLabCard";

export type ShareKind = "build" | "team";
/** What a share sheet is opened for: one character's build (null = the active one) or a saved team. */
export type ShareSource = { kind: "build"; charId: string; buildId?: string | null } | { kind: "team"; teamId: string };
export type ShareDetail = "full" | "lean" | "gear";

export interface ShareEcho {
  /** app echo key (mainEchoesData) */
  key: string;
  /** app set key (echoSetLabelMap) */
  set: string | null;
  cost: number;
  /** the app's echo `rank`: rarity 1–5 (the app keeps only +25 echoes, so no level) */
  rarity: number;
  /** main stat key; its value follows from cost + rarity (statsTable) */
  main: string | null;
  /** substats in slot order: [app stat key, value] */
  subs: Array<[string, number]>;
}

export interface ShareWeapon {
  id: string;
  /** weapons[id].weaponLevel; null = the weapon's max level (the app's default) */
  level: number | null;
  /** refinement 1–5 */
  rank: number;
}

export interface ShareMember {
  charId: string;
  /** the build's own name on the sharer's side */
  buildName: string;
  /** characterLevel; null = 90 (the app's default) */
  level: number | null;
  sequence: number;
  /** talents as the app stores them ({ basic, skill, forte, liberation, intro }); null = all 10 */
  talents: Record<string, number | string> | null;
  weapon: ShareWeapon | null;
  mainEcho: string | null;
  /** five slots, null for an empty one */
  echoes: Array<ShareEcho | null>;
  /** every other build field, verbatim ("full" / "lean"); absent on a "gear" card */
  config?: Record<string, unknown>;
}

export interface ShareRotation {
  name: string;
  duration: number | string | null;
  actions: unknown[];
}

export interface ShareTeam {
  name: string;
  /** slot order, null for an empty slot; each id has its member in `members` */
  characterIds: Array<string | null>;
  actions?: unknown[];
  duration?: number | string | null;
  enemyConfig?: Record<string, unknown>;
  handoffs?: Record<string, string[]>;
  description?: string;
}

export interface ShareHeadline {
  /** "dps" when the rotation carries a duration, else "dpr" (average damage per rotation) */
  metric: "dps" | "dpr";
  value: number;
  avgDamage: number;
  dps: number | null;
  rotationName: string;
  /** where the rotation came from on the sharer's side */
  source?: string;
  /** "Lv 100 · 20 % RES" */
  enemy: string;
  /** a team: each slot's average damage, slot order */
  perSlot?: number[];
  /** reserved for the batch-1 benchmark score (0–200) */
  benchmarkPct?: number;
  /** reserved for the ER check */
  erNeedMet?: boolean;
}

export interface SharePayload {
  format: typeof SHARE_FORMAT;
  v: number;
  kind: ShareKind;
  /** "wtplus@<commit>" */
  app: string;
  /** ISO date the card was made */
  createdAt: string;
  detail: ShareDetail;
  members: ShareMember[];
  team?: ShareTeam;
  /** the rotation behind the headline (full only), so the importer can score the same thing */
  rotation?: ShareRotation;
  headline?: ShareHeadline | null;
  /** only when the sharer switched "show UID" on */
  owner?: { uid?: string; name?: string };
  /** where the payload came from, set by the reader: never written */
  origin?: "wtplus" | "tacet-lab";
}

/**
 * Fields that never travel: inventory pointers, UI state, the custom portrait (a data URL), bookkeeping, the
 * character's own (non-build) fields, and personal notes / progress checkmarks (private text the card doesn't
 * show). The reader drops the same keys from a received config, so a hand-made card can't smuggle in a build `id`,
 * a `builds` list, a portrait URL or another character's level.
 */
const NEVER_SHARED = new Set([
  "echoes",
  "echoPresetId",
  "weapon",
  "weapons",
  "buildStatus",
  "buildComplete",
  "customPortrait",
  "customPortraitTransform",
  "buildCardPrimaryColor",
  "builds",
  "activeBuildId",
  "characterLevel",
  "talents",
  "substatWeights",
  "notes",
  "progressOverrides",
  "id",
  "name",
  "createdAt",
  "updatedAt",
]);
/** Dropped from a "lean" card's config. */
const LEAN_DROPS = ["rotations", "optimizer", "teamBuffs"];
/** The shape of the build fields the engine reads; a received config with another shape loses that field. */
const CONFIG_SHAPES: Record<string, "array" | "object"> = {
  rotations: "array",
  buffs: "object",
  customBuffs: "object",
  echoSetBonus: "object",
  echoSetPassives: "object",
  mainEcho: "object",
  optimizer: "object",
  resonanceChains: "object",
  teamBuffs: "object",
  weaponPassives: "object",
};

/** A received config: JSON only, no never-shared key, the known fields in their known shape. */
export function cleanReceivedConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const config = sanitize(raw) as Record<string, unknown>;
  for (const key of Object.keys(config)) {
    const shape = CONFIG_SHAPES[key];
    const v = config[key];
    if (NEVER_SHARED.has(key)) delete config[key];
    else if (shape === "array" && !Array.isArray(v)) delete config[key];
    else if (shape === "object" && !isObj(v)) delete config[key];
  }
  if (Array.isArray(config.rotations)) {
    config.rotations = config.rotations.filter((r) => isObj(r) && Array.isArray(r.actions)).map((r) => ({ ...(r as Record<string, any>), actions: (r as Record<string, any>).actions.filter(isObj) }));
  }
  // a main echo this app doesn't have (a newer WT+, a hand-made card) is dropped; the importer falls back to slot 1
  const mainKey = isObj(config.mainEcho) ? config.mainEcho.echo : null;
  if (typeof mainKey === "string" && !(mainEchoesData as Record<string, unknown>)[mainKey]) delete config.mainEcho;
  return config;
}

/**
 * A received team's enemy settings (the team store spreads them over its defaults): plain values, plus flat maps of
 * numbers such as `enemyResistByElement` (TeamEnemyConfig, issue #530). Anything else is dropped.
 */
function cleanEnemyConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const plain = (v: unknown): boolean => v === null || typeof v === "boolean" || (typeof v === "string" && v.length <= 80) || (typeof v === "number" && Number.isFinite(v));
  for (const [k, v] of Object.entries(sanitize(raw) as Record<string, unknown>)) {
    if (plain(v)) out[k] = v;
    else if (isObj(v)) out[k] = Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "number" && Number.isFinite(x)));
  }
  return out;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "YYYY-MM-DD" in the player's own time zone (toISOString is UTC: an evening card in the Americas read tomorrow). */
export function localDate(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** The app's build version string, e.g. "wtplus@5fc8af7b" (Vercel exposes the commit as VITE_VERCEL_GIT_COMMIT_SHA). */
export function appStamp(): string {
  // The one member, spelled out: Vite replaces exactly `import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA` with its value. A
  // bare `import.meta.env` would inline EVERY VITE_* variable into the public chunk (on Vercel that includes the commit
  // message and author). Under plain Node (tsx) import.meta.env is undefined, hence the try.
  let sha: string;
  try {
    sha = String(import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? "");
  } catch {
    sha = "";
  }
  return `wtplus@${sha ? sha.slice(0, 8) : "dev"}`;
}

/** An inventory / inline echo record → its share form; null for an empty slot. */
export function shareEchoOf(echo: Record<string, any> | null | undefined): ShareEcho | null {
  if (!echo || typeof echo.echo !== "string" || !echo.echo) return null;
  const subs: Array<[string, number]> = [];
  for (let i = 1; i <= 5; i++) {
    const type = echo[`echoSubStatsType${i}`];
    const value = num(echo[`echoSubStatsValue${i}`]);
    if (typeof type === "string" && type && type !== "none" && value !== null) subs.push([type, value]);
  }
  const cost = num(echo.type) ?? echoCostClassMap[mainEchoesData[echo.echo]?.class ?? ""] ?? 0;
  return {
    key: echo.echo,
    set: typeof echo.echoSet === "string" && echo.echoSet && echo.echoSet !== "none" ? echo.echoSet : null,
    cost,
    rarity: num(echo.rank) ?? 5,
    main: typeof echo.stat === "string" && echo.stat ? echo.stat : null,
    subs,
  };
}

/** A share echo → the inventory record shape (without an id). */
export function inventoryEchoOf(echo: ShareEcho): Record<string, unknown> {
  const out: Record<string, unknown> = {
    echo: echo.key,
    echoSet: echo.set,
    type: echo.cost,
    rank: echo.rarity,
    stat: echo.main,
  };
  for (let i = 1; i <= 5; i++) {
    const sub = echo.subs[i - 1];
    out[`echoSubStatsType${i}`] = sub ? sub[0] : null;
    out[`echoSubStatsValue${i}`] = sub ? sub[1] : null;
  }
  return out;
}

/** The fields of one build: the live record for the active build, the stored snapshot otherwise. */
export function buildFieldsOf(characterRecord: Record<string, any>, buildId: string | null): { name: string; fields: Record<string, any> } {
  const builds: Array<Record<string, any>> = Array.isArray(characterRecord?.builds) ? characterRecord.builds : [];
  const activeId = characterRecord?.activeBuildId ?? null;
  const target = buildId ? builds.find((b) => b.id === buildId) : null;
  if (target && target.id !== activeId) return { name: String(target.name ?? "Build"), fields: omitBuildMetadata(target) };
  const active = builds.find((b) => b.id === activeId);
  return { name: String(active?.name ?? target?.name ?? "Build"), fields: extractBuildFields(characterRecord ?? {}) };
}

function configOf(fields: Record<string, any>, detail: ShareDetail): Record<string, unknown> | undefined {
  if (detail === "gear") return undefined;
  const config: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (NEVER_SHARED.has(k) || v === undefined) continue;
    if (detail === "lean" && LEAN_DROPS.includes(k)) continue;
    config[k] = v;
  }
  return sanitize(config) as Record<string, unknown>;
}

/** One character's build as a share member. `buildId` null = the active build. */
export function memberOf(
  charId: string,
  characterRecord: Record<string, any>,
  buildId: string | null,
  inventoryEchoes: any[],
  detail: ShareDetail = "full",
): ShareMember {
  const { name, fields } = buildFieldsOf(characterRecord, buildId);
  const weaponId: string | null = fields.weapon ? String(fields.weapon) : null;
  const w = weaponId ? (fields.weapons?.[weaponId] ?? {}) : {};
  const echoes = resolveCharacterEchoes(fields.echoes, inventoryEchoes ?? []).map((e) => shareEchoOf(e));
  const talents = characterRecord?.talents && typeof characterRecord.talents === "object" ? { ...characterRecord.talents } : null;
  return {
    charId,
    buildName: name,
    level: num(characterRecord?.characterLevel),
    sequence: sequenceOf(fields),
    talents,
    weapon: weaponId ? { id: weaponId, level: num(w.weaponLevel), rank: Math.min(5, Math.max(1, num(w.refinement) ?? 1)) } : null,
    mainEcho: typeof fields.mainEcho?.echo === "string" ? fields.mainEcho.echo : null,
    echoes,
    config: configOf(fields, detail),
  };
}

/** Recursively keeps JSON data only, drops prototype-ish keys, caps the depth. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 16) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype" || v === undefined) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return null;
}

export interface PayloadOptions {
  detail?: ShareDetail;
  headline?: ShareHeadline | null;
  rotation?: ShareRotation | null;
  owner?: { uid?: string; name?: string } | null;
  now?: Date;
  app?: string;
}

function stamp(kind: ShareKind, members: ShareMember[], options: PayloadOptions): SharePayload {
  const detail = options.detail ?? "full";
  const payload: SharePayload = {
    format: SHARE_FORMAT,
    v: SHARE_VERSION,
    kind,
    app: options.app ?? appStamp(),
    createdAt: localDate(options.now ?? new Date()),
    detail,
    members,
  };
  if (options.headline) payload.headline = options.headline;
  if (options.rotation && detail === "full") payload.rotation = sanitize(options.rotation) as ShareRotation;
  if (options.owner && (options.owner.uid || options.owner.name)) payload.owner = { ...options.owner };
  return payload;
}

export function buildPayload(
  charId: string,
  characterRecord: Record<string, any>,
  buildId: string | null,
  inventoryEchoes: any[],
  options: PayloadOptions = {},
): SharePayload {
  return stamp("build", [memberOf(charId, characterRecord, buildId, inventoryEchoes, options.detail ?? "full")], options);
}

/** A saved team: each slot's pinned build (else the active one), plus the team's actions on a full / lean card. */
export function teamPayload(team: Record<string, any>, characters: Record<string, any>, inventoryEchoes: any[], options: PayloadOptions = {}): SharePayload {
  const detail = options.detail ?? "full";
  const ids: Array<string | null> = [0, 1, 2].map((i) => team?.characterIds?.[i] ?? null);
  const members: ShareMember[] = [];
  ids.forEach((id, i) => {
    if (!id || !characters?.[id]) return;
    members.push(memberOf(id, characters[id], team?.buildIds?.[i] ?? null, inventoryEchoes, detail));
  });
  const payload = stamp("team", members, options);
  const t: ShareTeam = { name: String(team?.name ?? "Team"), characterIds: ids.map((id) => (id && characters?.[id] ? id : null)) };
  if (detail !== "gear") {
    if (Array.isArray(team?.actions)) t.actions = sanitize(team.actions) as unknown[];
    if (team?.duration !== undefined && team?.duration !== null) t.duration = team.duration;
    if (team?.enemyConfig) t.enemyConfig = sanitize(team.enemyConfig) as Record<string, unknown>;
    if (team?.handoffs) t.handoffs = sanitize(team.handoffs) as Record<string, string[]>;
    if (typeof team?.description === "string") t.description = team.description.slice(0, 2000);
  }
  payload.team = t;
  return payload;
}

/** The same payload at a lower detail tier (for a link or a chunk that has to fit). */
export function withDetail(payload: SharePayload, detail: ShareDetail): SharePayload {
  if (detail === payload.detail) return payload;
  const out: SharePayload = { ...payload, detail };
  if (detail !== "full") delete out.rotation;
  out.members = payload.members.map((m) => {
    if (detail === "gear") {
      const { config: _drop, ...rest } = m;
      void _drop;
      return rest;
    }
    if (!m.config) return m;
    const config = { ...m.config };
    for (const k of LEAN_DROPS) delete config[k];
    return { ...m, config };
  });
  if (payload.team && detail === "gear") out.team = { name: payload.team.name, characterIds: payload.team.characterIds };
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Reading

export type ParseResult =
  | { ok: true; payload: SharePayload; readOnly: false; warnings: string[] }
  | { ok: true; payload: SharePayload; readOnly: true; newerVersion: number; warnings: string[] }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length <= max ? v : null);

function parseEcho(raw: unknown): ShareEcho | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw)) return undefined;
  const key = str(raw.key, 80);
  const cost = num(raw.cost);
  const rarity = num(raw.rarity);
  if (!key || cost === null || rarity === null) return undefined;
  if (!Array.isArray(raw.subs) || raw.subs.length > 5) return undefined;
  const subs: Array<[string, number]> = [];
  for (const s of raw.subs) {
    if (!Array.isArray(s) || s.length !== 2) return undefined;
    const k = str(s[0], 60);
    const v = num(s[1]);
    if (!k || v === null) return undefined;
    subs.push([k, v]);
  }
  return { key, set: str(raw.set, 80), cost, rarity, main: str(raw.main, 60), subs };
}

function parseMember(raw: unknown): ShareMember | null {
  if (!isObj(raw)) return null;
  const charId = str(raw.charId, 60);
  if (!charId || !Array.isArray(raw.echoes) || raw.echoes.length > 5) return null;
  const echoes: Array<ShareEcho | null> = [];
  for (const e of raw.echoes) {
    const parsed = parseEcho(e);
    if (parsed === undefined) return null;
    echoes.push(parsed);
  }
  while (echoes.length < 5) echoes.push(null);
  let weapon: ShareWeapon | null = null;
  if (isObj(raw.weapon)) {
    const id = str(raw.weapon.id, 80);
    if (!id) return null;
    weapon = { id, level: num(raw.weapon.level), rank: Math.min(5, Math.max(1, num(raw.weapon.rank) ?? 1)) };
  }
  const talents = isObj(raw.talents)
    ? (Object.fromEntries(
        Object.entries(raw.talents).filter(([k, v]) => /^(basic|skill|forte|liberation|intro)$/.test(k) && num(v) !== null),
      ) as Record<string, number | string>)
    : null;
  const member: ShareMember = {
    charId,
    buildName: str(raw.buildName, 120) ?? "Build",
    level: num(raw.level),
    sequence: Math.min(6, Math.max(0, Math.round(num(raw.sequence) ?? 0))),
    talents,
    weapon,
    mainEcho: str(raw.mainEcho, 80),
    echoes,
  };
  if (isObj(raw.config)) member.config = cleanReceivedConfig(raw.config);
  return member;
}

/** Validates a decoded payload. A newer version is returned read-only (shown, never imported). */
export function parseSharePayload(raw: unknown): ParseResult {
  if (!isObj(raw) || raw.format !== SHARE_FORMAT) return { ok: false, error: "This isn't Wuthering Tools+ share data." };
  const v = num(raw.v);
  if (v === null || v < 1 || !Number.isInteger(v)) return { ok: false, error: "The share data has no valid version." };
  const kind = raw.kind === "team" ? "team" : raw.kind === "build" ? "build" : null;
  if (!kind) return { ok: false, error: "The share data is neither a build nor a team." };
  if (!Array.isArray(raw.members) || raw.members.length < 1 || raw.members.length > 3) return { ok: false, error: "The share data has no members." };
  if (kind === "build" && raw.members.length !== 1) return { ok: false, error: "A shared build carries exactly one character." };
  const members: ShareMember[] = [];
  for (const m of raw.members) {
    const parsed = parseMember(m);
    if (!parsed) return { ok: false, error: "A member of the share data is damaged." };
    members.push(parsed);
  }
  const detail: ShareDetail = raw.detail === "lean" || raw.detail === "gear" ? raw.detail : "full";
  const payload: SharePayload = {
    format: SHARE_FORMAT,
    v,
    kind,
    app: str(raw.app, 60) ?? "wtplus@unknown",
    createdAt: str(raw.createdAt, 40) ?? "",
    detail,
    members,
    origin: "wtplus",
  };
  if (kind === "team") {
    const t = isObj(raw.team) ? raw.team : {};
    const ids: Array<string | null> = Array.isArray(t.characterIds)
      ? t.characterIds.slice(0, 3).map((id: unknown) => str(id, 60))
      : members.map((m) => m.charId);
    while (ids.length < 3) ids.push(null);
    const team: ShareTeam = { name: str(t.name, 200) ?? "Shared team", characterIds: ids };
    if (Array.isArray(t.actions)) team.actions = (sanitize(t.actions.slice(0, 2000)) as unknown[]).filter(isObj);
    if (t.duration !== undefined && t.duration !== null && (typeof t.duration === "number" || typeof t.duration === "string")) team.duration = t.duration;
    if (isObj(t.enemyConfig)) team.enemyConfig = cleanEnemyConfig(t.enemyConfig);
    if (isObj(t.handoffs)) team.handoffs = sanitize(t.handoffs) as Record<string, string[]>;
    if (typeof t.description === "string") team.description = t.description.slice(0, 2000);
    payload.team = team;
  }
  if (isObj(raw.rotation) && Array.isArray(raw.rotation.actions)) {
    payload.rotation = {
      name: str(raw.rotation.name, 300) ?? "Shared rotation",
      duration: typeof raw.rotation.duration === "number" || typeof raw.rotation.duration === "string" ? raw.rotation.duration : null,
      actions: (sanitize(raw.rotation.actions.slice(0, 1000)) as unknown[]).filter(isObj),
    };
  }
  if (isObj(raw.headline)) {
    const h = raw.headline;
    const value = num(h.value);
    const avg = num(h.avgDamage);
    if (value !== null && avg !== null) {
      payload.headline = {
        metric: h.metric === "dps" ? "dps" : "dpr",
        value,
        avgDamage: avg,
        dps: num(h.dps),
        rotationName: str(h.rotationName, 300) ?? "",
        source: str(h.source, 40) ?? undefined,
        enemy: str(h.enemy, 80) ?? "",
        perSlot: Array.isArray(h.perSlot) ? h.perSlot.slice(0, 3).map((x: unknown) => num(x) ?? 0) : undefined,
        benchmarkPct: num(h.benchmarkPct) ?? undefined,
        erNeedMet: typeof h.erNeedMet === "boolean" ? h.erNeedMet : undefined,
      };
    }
  }
  if (isObj(raw.owner)) {
    const uid = str(raw.owner.uid, 20);
    const name = str(raw.owner.name, 40);
    if (uid || name) payload.owner = { ...(uid ? { uid } : {}), ...(name ? { name } : {}) };
  }
  if (v > SHARE_VERSION) return { ok: true, payload, readOnly: true, newerVersion: v, warnings: [] };
  return { ok: true, payload, readOnly: false, warnings: [] };
}

// ---------------------------------------------------------------------------------------------------------
// Turning a member back into app data

const SLOT_NULLS = {
  echo: null,
  type: null,
  rank: null,
  stat: null,
  echoSet: null,
  echoSubStatsType1: null,
  echoSubStatsValue1: null,
  echoSubStatsType2: null,
  echoSubStatsValue2: null,
  echoSubStatsType3: null,
  echoSubStatsValue3: null,
  echoSubStatsType4: null,
  echoSubStatsValue4: null,
  echoSubStatsType5: null,
  echoSubStatsValue5: null,
};

/** A build's `echoes` map pointing at inventory ids (null = empty slot), the shape the store keeps. */
export function echoSlotsOf(echoIds: Array<string | null>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < 5; i++) out[String(i)] = { ...SLOT_NULLS, echoId: echoIds[i] ?? null };
  return out;
}

/** A build's `echoes` map with every echo inline (no inventory) — for computing a card's stats on the spot. */
export function inlineEchoSlotsOf(member: ShareMember): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < 5; i++) {
    const e = member.echoes[i];
    out[String(i)] = e ? { ...inventoryEchoOf(e), echoId: null } : { ...SLOT_NULLS, echoId: null };
  }
  return out;
}

/**
 * A member's build fields (no id / name / timestamps): the config verbatim plus weapon, echoes and main echo.
 * A gear-only member (no config) gets what the app would otherwise derive: the set bonuses from its echoes and
 * the main echo from slot one. Sequence nodes for a gear-only member are switched on by the caller
 * (`withSequence`, async — it needs the character's chain list).
 */
export function buildFieldsFromMember(member: ShareMember, echoSlots: Record<string, Record<string, unknown>>): Record<string, any> {
  const fields: Record<string, any> = member.config ? (JSON.parse(JSON.stringify(member.config)) as Record<string, any>) : {};
  fields.echoes = echoSlots;
  fields.echoPresetId = null;
  if (member.weapon) {
    fields.weapon = member.weapon.id;
    const w: Record<string, string> = { refinement: String(member.weapon.rank) };
    if (member.weapon.level !== null) w.weaponLevel = String(member.weapon.level);
    fields.weapons = { [member.weapon.id]: w };
  } else {
    fields.weapon = null;
  }
  if (!member.config) {
    const mainKey = member.mainEcho ?? member.echoes[0]?.key ?? null;
    const mainRarity = member.echoes.find((e) => e?.key === mainKey)?.rarity ?? 5;
    if (mainKey) fields.mainEcho = { echo: mainKey, rank: mainRarity };
    fields.echoSetBonus = getSetBonusEffects(member.echoes.map((e) => e?.set ?? null));
  }
  return fields;
}

// ---------------------------------------------------------------------------------------------------------
// What this app knows (released content only)

const charByKey = new Map(allCharactersList.map((c) => [c.key, c]));

export function isKnownCharacter(charId: string): boolean {
  return charByKey.has(charId);
}

export function characterName(charId: string): string {
  return charByKey.get(charId)?.name ?? charId;
}

/** The weapon type folder ("Swords") of a character, from the roster's singular label ("Sword"). */
export function weaponTypeOf(charId: string): string | null {
  const w = charByKey.get(charId)?.weapon;
  return w ? `${w}s` : null;
}

export function isKnownWeapon(weaponId: string, charId: string): boolean {
  const type = weaponTypeOf(charId);
  if (!type) return false;
  const list = getWeaponsByType(type) as unknown as Record<string, Array<{ key: string }>>;
  return Object.values(list ?? {}).some((bucket) => bucket.some((w) => w.key === weaponId));
}

export function weaponName(weaponId: string, charId: string): string {
  const type = weaponTypeOf(charId);
  const list = (type ? getWeaponsByType(type) : {}) as unknown as Record<string, Array<{ key: string; name: string }>>;
  for (const bucket of Object.values(list ?? {})) for (const w of bucket) if (w.key === weaponId) return w.name;
  return weaponId;
}

const SUBSTAT_KEYS = new Set(subStats);
/** The highest roll of each substat (subStatsTable): a value above it, or at / below 0, no echo can carry. */
const SUBSTAT_MAX: Record<string, number> = Object.fromEntries(Object.entries(subStatsTable).map(([k, rolls]) => [k, Math.max(...rolls)]));

/**
 * Why an echo can't be imported, or null when the app knows everything on it. Inventory integrity: a hand-made
 * card must not plant an echo the game can't drop (a main stat with no value at that rarity, a 500 % Crit Rate roll).
 */
export function echoProblem(echo: ShareEcho): string | null {
  const data = (mainEchoesData as Record<string, any>)[echo.key];
  if (!data) return `${echo.key} isn't an echo this app has`;
  if (echo.set && !echoSetLabelMap[echo.set]) return `the set ${echo.set} isn't in this app`;
  if (![1, 3, 4].includes(echo.cost)) return `cost ${echo.cost} isn't a valid echo cost`;
  if (![1, 2, 3, 4, 5].includes(echo.rarity)) return `rarity ${echo.rarity} isn't a valid echo rarity`;
  const mains = (statsTable as Record<number, Record<string, Record<number, number>>>)[echo.cost];
  if (echo.main && !mains?.[echo.main]) return `${echo.main} can't be the main stat of a ${echo.cost}-cost echo`;
  if (echo.main && mains[echo.main][echo.rarity] === undefined) return `a ${echo.rarity}★ echo has no ${echo.main} main stat in this app`;
  const bad = echo.subs.find(([k]) => !SUBSTAT_KEYS.has(k));
  if (bad) return `${bad[0]} isn't a substat`;
  const odd = echo.subs.find(([k, v]) => !(v > 0 && v <= (SUBSTAT_MAX[k] ?? Infinity) + 1e-6));
  if (odd) return `${odd[0]} ${odd[1]} isn't a roll an echo can have`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Tacet Lab cards (`TacetLabCard` chunk; https://github.com/DJ12421/Tacet-Lab, GPL-3.0 — format read from its
// src/scanner/card-metadata.ts at 5386bfa). Read only; mapped onto a "gear" payload.

export interface TacetCard {
  format: "tacet-lab-card";
  version: number;
  characterCatalogId: string;
  characterLevel: number;
  sequence: number;
  skillLevels: number[];
  weaponCatalogId: string;
  weaponLevel: number;
  weaponRank: number;
  echoes: Array<{ name: string; cost: number; rarity: number; level: number; sonata: string; mainStat: { key: string; value: number }; subStats: Array<{ key: string; value: number }> }>;
}

/** Tacet Lab's StatKey → the app's stat key (main stats and substats share the names). */
export const TACET_STATS: Record<string, string> = {
  hp: "HP_FLAT",
  hpPercent: "HP",
  atk: "ATK_FLAT",
  atkPercent: "ATK",
  def: "DEF_FLAT",
  defPercent: "DEF",
  critRate: "CritRate",
  critDamage: "CritDMG",
  energyRegen: "EnergyRegen",
  basicDamage: "BasicAttackDMGBonus",
  heavyDamage: "HeavyAttackDMGBonus",
  skillDamage: "ResonanceSkillDMGBonus",
  liberationDamage: "ResonanceLiberationDMGBonus",
  spectroDamage: "Spectro",
  fusionDamage: "Fusion",
  glacioDamage: "Glacio",
  electroDamage: "Electro",
  aeroDamage: "Aero",
  havocDamage: "Havoc",
  healingBonus: "HealingBonus",
};
const TALENT_ORDER = ["basic", "skill", "forte", "liberation", "intro"];

const normName = (s: string): string => s.toLowerCase().replace(/^phantom:\s*/, "").replace(/[^a-z0-9]/g, "");
let echoByName: Map<string, string> | null = null;
let setByName: Map<string, string> | null = null;
function indexNames(): { echoes: Map<string, string>; sets: Map<string, string> } {
  if (!echoByName) {
    echoByName = new Map();
    for (const [key, e] of Object.entries(mainEchoesData as Record<string, { name?: string }>)) if (e?.name) echoByName.set(normName(e.name), key);
  }
  if (!setByName) {
    setByName = new Map();
    for (const [key, label] of Object.entries(echoSetLabelMap)) setByName.set(normName(label), key);
  }
  return { echoes: echoByName, sets: setByName };
}

export function isTacetCard(raw: unknown): raw is TacetCard {
  if (!isObj(raw) || raw.format !== "tacet-lab-card") return false;
  return typeof raw.characterCatalogId === "string" && Array.isArray(raw.echoes) && raw.echoes.length <= 5;
}

/** A Tacet Lab card → a "gear" payload, with a warning for everything that could not come across. */
export function fromTacetCard(raw: unknown): { payload: SharePayload | null; warnings: string[]; error?: string } {
  if (!isTacetCard(raw)) return { payload: null, warnings: [], error: "This isn't a Tacet Lab card." };
  if (raw.version !== 1) return { payload: null, warnings: [], error: `This Tacet Lab card is version ${raw.version}; only version 1 is understood.` };
  const warnings: string[] = [];
  const charId = TACET_CHARACTER_IDS[String(raw.characterCatalogId)];
  if (!charId) return { payload: null, warnings, error: "The character on this Tacet Lab card isn't in this app yet." };
  const { echoes: echoIndex, sets: setIndex } = indexNames();
  let weapon: ShareWeapon | null = null;
  const weaponId = TACET_WEAPON_IDS[String(raw.weaponCatalogId)];
  if (weaponId) weapon = { id: weaponId, level: num(raw.weaponLevel), rank: Math.min(5, Math.max(1, num(raw.weaponRank) ?? 1)) };
  else warnings.push("The weapon on the card isn't in this app yet; the build comes without one.");
  const echoes: Array<ShareEcho | null> = [];
  raw.echoes.forEach((e, i) => {
    const key = typeof e?.name === "string" ? echoIndex.get(normName(e.name)) : undefined;
    if (!key) {
      warnings.push(`Echo ${i + 1} (${String(e?.name ?? "?")}) isn't in this app; its slot stays empty.`);
      echoes.push(null);
      return;
    }
    const set = typeof e.sonata === "string" ? (setIndex.get(normName(e.sonata)) ?? null) : null;
    if (e.sonata && !set) warnings.push(`Echo ${i + 1}'s set ${e.sonata} isn't in this app.`);
    const main = TACET_STATS[e.mainStat?.key] ?? null;
    const subs: Array<[string, number]> = [];
    for (const s of e.subStats ?? []) {
      const k = TACET_STATS[s?.key];
      const v = num(s?.value);
      if (k && v !== null && SUBSTAT_KEYS.has(k)) subs.push([k, v]);
      else warnings.push(`Echo ${i + 1}: substat ${String(s?.key)} isn't one the app knows.`);
    }
    if (num(e.level) !== null && Number(e.level) < 25) warnings.push(`Echo ${i + 1} is +${e.level} on the card; the app keeps echoes at +25, so its main stat reads at +25.`);
    echoes.push({ key, set, cost: num(e.cost) ?? 0, rarity: num(e.rarity) ?? 5, main, subs: subs.slice(0, 5) });
  });
  while (echoes.length < 5) echoes.push(null);
  const talents: Record<string, number> = {};
  (raw.skillLevels ?? []).slice(0, 5).forEach((lv, i) => {
    const n = num(lv);
    if (n !== null) talents[TALENT_ORDER[i]] = n;
  });
  const member: ShareMember = {
    charId,
    buildName: "Tacet Lab card",
    level: num(raw.characterLevel),
    sequence: Math.min(6, Math.max(0, Math.round(num(raw.sequence) ?? 0))),
    talents: Object.keys(talents).length ? talents : null,
    weapon,
    mainEcho: echoes[0]?.key ?? null,
    echoes,
  };
  warnings.push("Tacet Lab cards carry gear only: buff toggles and rotations start at the app's defaults.");
  return {
    payload: { format: SHARE_FORMAT, v: SHARE_VERSION, kind: "build", app: "Tacet Lab", createdAt: "", detail: "gear", members: [member], origin: "tacet-lab" },
    warnings,
  };
}
