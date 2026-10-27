// Wuthering Tools+ — who wants which echo: every (Sonata, cost, main stat) a character on the roster would wear,
// with where that want came from. Pure: the character store, the inventory and already-loaded presets in; no Vue,
// no stores, no fetching (sources.ts loads the presets, useEchoPlan.ts wires the stores).
//
// Sources, strongest first (each want keeps its own, so the page can say why a chip is kept):
//   equipped — the echoes the character wears now (`characters[key].echoes`, inventory echoes by `echoId`)
//   build    — every other saved build (`characters[key].builds[].echoes`)
//   preset   — Ryan's curated echo presets (`src/characters/<Key>/presets.ts` `echoes[].data.echoes[slot]`)
//   engine   — Riley's wuwa_calc loadouts, as the generated stock rotations describe them
//              (`src/sim/presets/data/rotations/<Key>.json`: "<sets>, main stats 43311 CD Havoc Havoc atk atk")
//   default  — nothing above for this character: a default from the kit's element and role (`kitFactsOf` reads the
//              app's own attack data — the stat the attacks scale on, and whether the kit heals): a healer gets
//              Rejuvenating Glow with Healing Bonus / scaling-stat / Energy Regen main stats, anyone else their element's
//              1.0 set with crit 4-costs, element 3-costs and their scaling stat (the page names these characters so the
//              player can check them)
//
// A slot's cost is the echo's own class when the app knows the echo (Calamity / Overlord 4, Elite 3, Common 1) and
// the slot's `type` otherwise — two curated presets carry swapped `type`s (Suoming's SubDPS builds). A main stat the
// cost cannot roll in game (a 3-cost Crit Rate, a 4-cost element bonus) is never a want: it lands in `skipped`.
import { accountCharacterOf } from "../account/accountState";
import { appKeyOf, rileyNameOf } from "../rankings/castMapper";
import { notInApp } from "../rankings/importFromRankings";
import {
  COST_MAINS,
  asCost,
  costOfEcho,
  elementSet,
  isLegalMain,
  normaliseMain,
  setKeyOfName,
  sonataByKey,
  sonatas,
  type Cost,
  type MainKey,
} from "./catalog";
import { characterElement } from "./names";

export type WantSource = "equipped" | "build" | "preset" | "engine" | "default";
export const SOURCE_ORDER: readonly WantSource[] = ["equipped", "build", "preset", "engine", "default"];

export interface Want {
  character: string;
  set: string;
  cost: Cost;
  main: MainKey;
  source: WantSource;
  /** build / preset name, or the wuwa_calc loadout ("Moonlit Clouds 5pc · 43311 CR ER ER atk atk") */
  detail: string;
}

export interface SkippedSlot {
  character: string;
  source: WantSource;
  detail: string;
  slot: number;
  reason: string;
}

/** `src/characters/<Key>/presets.ts` `echoes[]` */
export interface CuratedPreset {
  name?: string;
  data?: { echoes?: Record<string, Record<string, unknown>> | Array<Record<string, unknown>> };
}

/** a generated wuwa_calc rotation preset (only the text is read) */
export interface EnginePreset {
  name?: string;
  description?: string;
}

/** What a kit default needs from the character's own data (`kitFactsOf`). */
export interface KitFacts {
  /** the stat most of the kit's attacks (heals, shields) scale on */
  scaling: "ATK" | "HP" | "DEF";
  /** the kit heals (four or more Healing entries — Brant's and Aero Rover's three self-heals don't make them healers) */
  healer: boolean;
}

export interface SourceSwitches {
  builds: boolean;
  presets: boolean;
  engine: boolean;
}

export interface WantsInput {
  /** the character store's `characters` */
  characters: Record<string, Record<string, unknown>>;
  /** the inventory store's `echoes` */
  echoes: Array<Record<string, unknown>>;
  /** curated presets by character key (missing key = not loaded / none) */
  curated?: Record<string, CuratedPreset[]>;
  /** wuwa_calc rotation presets by character key */
  engine?: Record<string, EnginePreset[]>;
  /** kit facts for the characters that may need a kit default (missing = element-only default) */
  kits?: Record<string, KitFacts>;
  /** characters the player plans to pull or build (released keys) */
  planned?: string[];
  includePlanned?: boolean;
  /** characters left out of the plan */
  excluded?: string[];
  sources?: Partial<SourceSwitches>;
}

export interface RosterEntry {
  key: string;
  owned: boolean;
  planned: boolean;
  excluded: boolean;
  /** wants per source (after the switches) */
  counts: Record<WantSource, number>;
  /** the Sonatas this character pulls into the plan, app order */
  sets: string[];
  usesDefault: boolean;
}

export interface WantsResult {
  wants: Want[];
  roster: RosterEntry[];
  skipped: SkippedSlot[];
}

const slotList = (slots: unknown): Array<Record<string, unknown> | null> => {
  if (Array.isArray(slots)) return [0, 1, 2, 3, 4].map((i) => (slots[i] as Record<string, unknown>) ?? null);
  const rec = (slots ?? {}) as Record<string, Record<string, unknown>>;
  return [0, 1, 2, 3, 4].map((i) => rec[String(i)] ?? null);
};

const isEmptySlot = (slot: Record<string, unknown> | null): boolean =>
  !slot || (!slot.echoId && !slot.echo && !slot.echoSet && !slot.stat && !slot.type);

interface SlotFacts {
  set: string;
  cost: Cost;
  main: MainKey;
}

/**
 * One echo slot → its Sonata, cost and main stat, or the reason it can't be one. Mirrors
 * `resolveCharacterEchoes` (src/calculator/buildCharacterContext.ts): the inventory echo matched by `echoId` wins,
 * the inline slot is the fallback.
 */
export function slotFacts(
  slot: Record<string, unknown> | null,
  inventoryById: Map<unknown, Record<string, unknown>>,
): SlotFacts | { reason: string } | null {
  if (isEmptySlot(slot)) return null;
  const echo = (slot!.echoId ? inventoryById.get(slot!.echoId) : undefined) ?? slot!;
  const set = typeof echo.echoSet === "string" ? echo.echoSet : "";
  if (!set) return { reason: "no Sonata" };
  if (!sonataByKey(set)) return { reason: `Sonata ${set} is not in the app` };
  const cost = costOfEcho(echo.echo) ?? asCost(echo.type);
  if (!cost) return { reason: "no cost" };
  const main = normaliseMain(echo.stat);
  if (!main) return { reason: `no main stat${echo.stat ? ` (${String(echo.stat)})` : ""}` };
  if (!isLegalMain(cost, main)) return { reason: `a ${cost}-cost cannot roll ${main}` };
  return { set, cost, main };
}

function pushSlots(
  out: WantsResult,
  character: string,
  source: WantSource,
  detail: string,
  slots: unknown,
  inventoryById: Map<unknown, Record<string, unknown>>,
): void {
  slotList(slots).forEach((slot, i) => {
    const facts = slotFacts(slot, inventoryById);
    if (!facts) return;
    if ("reason" in facts) {
      out.skipped.push({ character, source, detail, slot: i, reason: facts.reason });
      return;
    }
    out.wants.push({ character, source, detail, ...facts });
  });
}

/** The echoes a character wears now and in every saved build. */
export function accountWantsOf(
  key: string,
  data: Record<string, unknown>,
  inventoryById: Map<unknown, Record<string, unknown>>,
  out: WantsResult = { wants: [], roster: [], skipped: [] },
  withBuilds = true,
): WantsResult {
  const builds = (Array.isArray(data.builds) ? data.builds : []) as Array<Record<string, unknown>>;
  const active = builds.find((b) => b?.id && b.id === data.activeBuildId) ?? builds[0];
  pushSlots(out, key, "equipped", active?.name ? String(active.name) : "current build", data.echoes, inventoryById);
  if (withBuilds) {
    for (const b of builds) {
      if (!b || b === active) continue;
      pushSlots(out, key, "build", String(b.name ?? "saved build"), b.echoes, inventoryById);
    }
  }
  return out;
}

/** Ryan's curated presets for one character. */
export function presetWantsOf(key: string, presets: CuratedPreset[], out: WantsResult = { wants: [], roster: [], skipped: [] }): WantsResult {
  for (const p of presets ?? []) pushSlots(out, key, "preset", String(p?.name ?? "preset"), p?.data?.echoes, new Map());
  return out;
}

const ENGINE_TOKENS: Record<Cost, Record<string, MainKey>> = {
  4: { CR: "CritRate", CD: "CritDMG", ATK: "ATK", HP: "HP", DEF: "DEF" },
  3: { ATK: "ATK", HP: "HP", DEF: "DEF", ER: "EnergyRegen", Glacio: "Glacio", Fusion: "Fusion", Electro: "Electro", Aero: "Aero", Spectro: "Spectro", Havoc: "Havoc" },
  1: { atk: "ATK", hp: "HP", def: "DEF" },
};

export interface EngineLoadout {
  /** set keys with their piece counts */
  sets: Array<{ set: string; pieces: number }>;
  /** the five slots' costs and main stats, highest cost first */
  slots: Array<{ cost: Cost; main: MainKey }>;
  /** "Moonlit Clouds 5pc · 43311 CR ER ER atk atk" */
  detail: string;
}

const LOADOUT_RE = /R\d, ((?:(?!, main stats ).)+?), main stats (\d{5}) ([A-Za-z]+(?: [A-Za-z]+){4})(?=[.\s])/;

/**
 * The loadout a generated wuwa_calc rotation preset states in its description — "S6, Kumokiri R5, Thread of Severed
 * Fate 3pc + Havoc Eclipse 2pc + Reminiscence: Threnodian - Leviathan, main stats 44111 CD CD atk atk atk." (the format
 * `wuwa-tools/rotation-port/emit_app_presets.py` writes). Null when the text doesn't carry one.
 */
export function parseEngineLoadout(description: string): EngineLoadout | null {
  const m = LOADOUT_RE.exec(description ?? "");
  if (!m) return null;
  const [, setsText, layout, tokenText] = m as unknown as [string, string, string, string];
  const sets: EngineLoadout["sets"] = [];
  for (const part of setsText.split(" + ")) {
    const piece = /^(.+?) (\d)pc$/.exec(part.trim());
    if (!piece) continue; // the main echo ("Impermanence Heron") — not a set
    const set = setKeyOfName(piece[1]!);
    if (set) sets.push({ set, pieces: Number(piece[2]) });
  }
  const costs = layout.split("").map((c) => asCost(c));
  const tokens = tokenText.split(" ");
  const slots: EngineLoadout["slots"] = [];
  for (let i = 0; i < 5; i++) {
    const cost = costs[i];
    const main = cost ? ENGINE_TOKENS[cost][tokens[i]!] : undefined;
    if (!cost || !main) return null;
    slots.push({ cost, main });
  }
  if (!sets.length) return null;
  return { sets, slots, detail: `${setsText.split(" + ").filter((p) => / \dpc$/.test(p)).join(" + ")} · ${layout} ${tokenText}` };
}

/**
 * wuwa_calc's loadouts for one character. Which echo of a split build (3pc + 2pc) sits in which set is not stated,
 * so every main stat of the build is wanted in each of its sets — the plan errs towards keeping. A Sonata without that
 * cost (Shadow of Shattered Dreams has no 3- or 1-cost) simply has no such chip.
 */
export function engineWantsOf(key: string, presets: EnginePreset[], out: WantsResult = { wants: [], roster: [], skipped: [] }): WantsResult {
  for (const p of presets ?? []) {
    const loadout = parseEngineLoadout(String(p?.description ?? ""));
    if (!loadout) continue;
    for (const { set } of loadout.sets) {
      const sonata = sonataByKey(set);
      for (const s of loadout.slots) {
        if (sonata && !sonata.costs.includes(s.cost)) continue;
        out.wants.push({ character: key, set, cost: s.cost, main: s.main, source: "engine", detail: loadout.detail });
      }
    }
  }
  return out;
}

const FORTES = ["basicAttacks", "skillAttacks", "liberationAttacks", "forteCircuitAttacks", "introAttacks", "outroAttacks"] as const;
const ATTRIBUTE_STAT: Record<string, KitFacts["scaling"]> = { hp: "HP", defense: "DEF" };

const BAR_STAT: Record<string, KitFacts["scaling"]> = { totalHp: "HP", totalDef: "DEF" };

/**
 * A kit's role from the app's own character data (`getCharByName(key)`). Two signals for the scaling stat: the
 * calculator's live result bar (`basic.liveResultBarStats[0]`: `totalHp` for Shorekeeper, `totalDef` for Taoqi) when
 * it names HP or DEF, else the attack entries' own `attribute` (`"hp"` / `"defense"`, none = ATK — Yuanwu's say
 * `defense` while his bar says ATK) when HP or DEF outnumbers ATK. A kit with four or more `type: "Healing"` entries is a
 * healer. Null when the data has no attacks.
 */
export function kitFactsOf(data: unknown): KitFacts | null {
  const d = (data ?? {}) as Record<string, { attacks?: Array<Record<string, unknown>> } | undefined> & {
    basic?: { liveResultBarStats?: unknown };
  };
  const counts: Record<KitFacts["scaling"], number> = { ATK: 0, HP: 0, DEF: 0 };
  let heals = 0;
  let total = 0;
  for (const forte of FORTES) {
    for (const a of d[forte]?.attacks ?? []) {
      if (!a || typeof a !== "object") continue;
      total++;
      counts[ATTRIBUTE_STAT[String(a.attribute ?? "").toLowerCase()] ?? "ATK"]++;
      if (a.type === "Healing") heals++;
    }
  }
  if (!total) return null;
  const bar = Array.isArray(d.basic?.liveResultBarStats) ? BAR_STAT[String(d.basic!.liveResultBarStats[0])] : undefined;
  const attr = (["HP", "DEF"] as const).find((s) => counts[s] > counts.ATK && counts[s] >= counts[s === "HP" ? "DEF" : "HP"]);
  return { scaling: bar ?? attr ?? "ATK", healer: heals >= 4 };
}

/**
 * Kit default, from the element and (when the kit facts are in) the role:
 *   healer — Rejuvenating Glow; COST 4 Healing Bonus + the scaling stat; COST 3 the scaling stat + Energy Regen; COST 1
 *            the scaling stat
 *   other  — the element's 1.0 set; COST 4 Crit. Rate / Crit. DMG (+ the scaling stat when it isn't ATK); COST 3 the
 *            element + the scaling stat; COST 1 the scaling stat
 * Without kit facts the scaling stat is ATK. Empty for an unknown element.
 */
export function defaultWantsOf(key: string, out: WantsResult = { wants: [], roster: [], skipped: [] }, kit?: KitFacts | null): WantsResult {
  const element = characterElement(key);
  const scaling: MainKey = kit?.scaling ?? "ATK";
  const healer = Boolean(kit?.healer);
  const set = healer ? "RejuvenatingGlow" : elementSet(element);
  if (!set || !sonataByKey(set)) return out;
  const main3 = normaliseMain(element);
  const picks: Array<[Cost, MainKey]> = healer
    ? [
        [4, "HealingBonus"],
        [4, scaling],
        [3, scaling],
        [3, "EnergyRegen"],
        [1, scaling],
      ]
    : [
        [4, "CritRate"],
        [4, "CritDMG"],
        ...(scaling !== "ATK" ? ([[4, scaling]] as Array<[Cost, MainKey]>) : []),
        ...(main3 && COST_MAINS[3].includes(main3) ? ([[3, main3]] as Array<[Cost, MainKey]>) : []),
        [3, scaling],
        [1, scaling],
      ];
  // the page prints "Kit default — <detail>"
  const detail = healer ? `healer · heals on ${scaling}` : `${element ?? "unknown"} element${scaling !== "ATK" ? ` · scales on ${scaling}` : ""}`;
  for (const [cost, main] of picks) out.wants.push({ character: key, set, cost, main, source: "default", detail });
  return out;
}

/** The engine presets a character reads: their own file, else their wuwa_calc twin's (Rover's male forms share his one kit). */
export function enginePresetsFor(key: string, engine: Record<string, EnginePreset[]>): EnginePreset[] {
  if (engine[key]?.length) return engine[key]!;
  const twin = appKeyOf(rileyNameOf(key));
  return twin !== key ? (engine[twin] ?? []) : [];
}

const emptyCounts = (): Record<WantSource, number> => ({ equipped: 0, build: 0, preset: 0, engine: 0, default: 0 });

/** Removes repeated wants (same character, chip, source and detail) — many wuwa_calc runs state the same loadout. */
function dedupe(wants: Want[]): Want[] {
  const seen = new Set<string>();
  return wants.filter((w) => {
    const id = `${w.character}|${w.set}|${w.cost}|${w.main}|${w.source}|${w.detail}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Every want of the roster: owned characters (a weapon equipped — the Account State's rule) plus, when switched on,
 * the planned ones; characters the app doesn't list (unreleased kits, `notInApp`) and excluded ones never count.
 */
export function collectWants(input: WantsInput): WantsResult {
  const sources: SourceSwitches = { builds: true, presets: true, engine: true, ...(input.sources ?? {}) };
  const characters = input.characters ?? {};
  const inventoryById = new Map<unknown, Record<string, unknown>>(
    (input.echoes ?? []).filter((e) => e && e.echoId).map((e) => [e.echoId, e]),
  );
  const excluded = new Set(input.excluded ?? []);
  const ownedKeys = Object.keys(characters).filter((k) => accountCharacterOf(k, characters[k]).owned);
  const plannedKeys = input.includePlanned === false ? [] : (input.planned ?? []).filter((k) => !ownedKeys.includes(k));
  const hidden = new Set(notInApp([...ownedKeys, ...plannedKeys]));
  const keys = [...new Set([...ownedKeys, ...plannedKeys])].filter((k) => !hidden.has(k)).sort();

  const out: WantsResult = { wants: [], roster: [], skipped: [] };
  for (const key of keys) {
    const own: WantsResult = { wants: [], roster: [], skipped: [] };
    const owned = ownedKeys.includes(key);
    if (owned && sources.builds) accountWantsOf(key, characters[key] ?? {}, inventoryById, own);
    if (sources.presets) presetWantsOf(key, input.curated?.[key] ?? [], own);
    if (sources.engine) engineWantsOf(key, enginePresetsFor(key, input.engine ?? {}), own);
    const usesDefault = own.wants.length === 0;
    if (usesDefault) defaultWantsOf(key, own, input.kits?.[key]);
    const wants = dedupe(own.wants);
    const isExcluded = excluded.has(key);
    const counts = emptyCounts();
    for (const w of wants) counts[w.source]++;
    const setOrder = new Map(wants.map((w) => [w.set, true]));
    out.roster.push({
      key,
      owned,
      planned: !owned,
      excluded: isExcluded,
      counts,
      sets: [...setOrder.keys()].sort((a, b) => setIndex(a) - setIndex(b)),
      usesDefault,
    });
    if (isExcluded) continue;
    out.wants.push(...wants);
    out.skipped.push(...own.skipped);
  }
  return out;
}

const setIndex = (key: string): number => {
  const i = sonatas().findIndex((s) => s.key === key);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};
