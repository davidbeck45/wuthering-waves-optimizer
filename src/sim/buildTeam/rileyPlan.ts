// Wuthering Tools+ — "Build it for me" (batch 2, Roadmap Phase 4): what each member should wear, as this app's keys.
//
// Riley31415's wuwa_calc solves every team at the player's own account (the fork's `mine` Team Cost, the Riley run
// seam in src/sim/engine/): per member a Sonata set (or a 3 + 2 split), a main-slot echo, a main-stat layout and the
// Energy Regen their loop needs. This module turns one `RunMember` (rileyRun.ts) into a `MemberPlan` the app's
// optimizer can use — set keys from `echoSetLabelMap`, the echo key from `mainEchoesData`, the layout as costs and
// main stats per cost — and reads the same plan off Ryan's curated echo presets when the team is not one of Riley's.
// Pure: no Vue, no stores, no engine.
import { mainEchoesData } from "../../echoes/index";
import { echoSetLabelMap } from "../../echoes/stats";
import type { EnergyNeedLite, RunMember } from "../engine/rileyRun";

/** The cost layouts Riley's builds come in (his `mainstatOptions()`): one 4-cost, two 3-costs, two 1-costs; two
 *  4-costs and three 1-costs; one 4-cost and four 1-costs (only on loadouts that offer HP 1-costs). */
export type RileyLayout = "43311" | "44111" | "41111";
export const RILEY_LAYOUTS: readonly RileyLayout[] = ["43311", "44111", "41111"];

/** Costs per slot for each layout, highest first (the order his names list them in). */
export const LAYOUT_COSTS: Record<RileyLayout, readonly number[]> = {
  "43311": [4, 3, 3, 1, 1],
  "44111": [4, 4, 1, 1, 1],
  "41111": [4, 1, 1, 1, 1],
};

export interface SetPlan {
  /** the app's set key (`echoSetLabelMap`), e.g. "MoonlitClouds" */
  key: string;
  /** pieces his pick wears: 5, 3, 2 or 1 */
  pieces: number;
}

export interface MainEchoPlan {
  /** the echo as Riley names it, e.g. "Nightmare: Crownless" */
  name: string;
  /** every app echo key that plays as it: the echo itself and its Phantom skin */
  keys: string[];
}

export interface MainStatPlan {
  layout: RileyLayout;
  /** the app's main-stat keys per slot, slot order = `LAYOUT_COSTS[layout]` */
  slots: string[];
  /** the same, grouped: the stats a cost may roll (deduplicated, in slot order) */
  byCost: Record<number, string[]>;
  /** his name, e.g. "43311 CD ATK Fusion atk atk" */
  label: string;
}

export type PlanSource = "riley" | "preset" | "current" | "none";

export interface MemberPlan {
  characterId: string;
  /** where the plan comes from: Riley's `mine` pick, Ryan's curated echo preset, or nothing to go on */
  source: PlanSource;
  mainDps: boolean;
  /** the member's share of the team's DPS in Riley's run (0–1); null without a run */
  share: number | null;
  /** Riley's DPS for this member (damage per second) */
  dps: number | null;
  sets: SetPlan[];
  /** his echo label, e.g. "Crown of Valor 3pc + Void Thunder 2pc" (or the preset's name) */
  setsLabel: string;
  mainEcho: MainEchoPlan | null;
  mainStats: MainStatPlan | null;
  /** Energy Regen the member needs (%), max(loop bar, kit floor); null when nothing asks for any */
  erNeed: number | null;
  /** which of the two sets the need */
  erSetBy: "loop" | "kit" | null;
  /** the preset's name or Riley's spread, for the plan line */
  note: string | null;
  /** names his pick uses that this app has no key for (shown, never guessed) */
  unmapped: string[];
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "");

/** Riley's set names that do not normalise onto the app's label (none as of wuwa_calc 653fee7 — every one of his
 *  48 set pieces maps; `buildTeam.test.ts` walks his whole loadout list so a new name fails loudly). */
export const SET_NAME_OVERRIDES: Readonly<Record<string, string>> = {};

/** Riley's main-slot echo names that differ from the app's echo names — four as of wuwa_calc 653fee7 (he drops the
 *  article, an epithet or a "Reminiscence -" prefix); `buildTeam.test.ts` walks his whole loadout list. */
export const ECHO_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "False Sovereign": "The False Sovereign",
  "Nightmare: Adam Smasher": "Reminiscence - Nightmare: Adam Smasher",
  "Reminiscence: Suhsin": "Reminiscence: Suhsin the Inevitable",
  "Reminiscence: Threnodian - Voidborne": "Reminiscence: Threnodian - Voidborne Construct",
};

let setIndex: Map<string, string> | null = null;
/** An app set key for one of Riley's set names ("Moonlit Clouds 5pc" → "MoonlitClouds"), or null. */
export function setKeyOf(name: string): string | null {
  const base = name.replace(/\s*\d+\s*pc$/i, "").trim();
  const override = SET_NAME_OVERRIDES[base];
  if (override) return override;
  if (!setIndex) {
    setIndex = new Map();
    for (const [key, label] of Object.entries(echoSetLabelMap)) {
      setIndex.set(norm(label), key);
      setIndex.set(norm(key), key);
    }
  }
  return setIndex.get(norm(base)) ?? null;
}

/** The piece count in one of his set names ("Crown of Valor 3pc" → 3); 5 when he names none. */
export function piecesOf(name: string): number {
  const m = /(\d+)\s*pc$/i.exec(name.trim());
  return m ? Number(m[1]) : 5;
}

let echoIndex: Map<string, string[]> | null = null;
/** Every app echo key that plays as Riley's main-slot echo `name`: the echo whose name matches, plus its "Phantom:"
 *  skin (same echo, same buffs). Empty when the app has no such echo. */
export function echoKeysOf(name: string): string[] {
  const wanted = norm(ECHO_NAME_OVERRIDES[name] ?? name);
  if (!echoIndex) {
    echoIndex = new Map();
    for (const [key, echo] of Object.entries(mainEchoesData as Record<string, { name: string }>)) {
      const base = norm(String(echo.name).replace(/^Phantom:\s*/i, ""));
      const list = echoIndex.get(base) ?? [];
      // the echo itself first, its Phantom skin after
      if (/^Phantom:/i.test(echo.name)) list.push(key);
      else list.unshift(key);
      echoIndex.set(base, list);
    }
  }
  return [...(echoIndex.get(wanted) ?? [])];
}

/** Riley's main-stat labels (mainstats.ts `label()`: initials for multi-word stats, the element alone for a 3-cost
 *  element, lowercase for a 1-cost) as the app's main-stat keys (`statsTable`). */
const STAT_OF_LABEL: Record<string, string> = {
  CR: "CritRate",
  CD: "CritDMG",
  ATK: "ATK",
  HP: "HP",
  DEF: "DEF",
  ER: "EnergyRegen",
  Glacio: "Glacio",
  Fusion: "Fusion",
  Electro: "Electro",
  Aero: "Aero",
  Spectro: "Spectro",
  Havoc: "Havoc",
};

/** "43311 CD ATK Fusion atk atk" → the layout and the app's main stat per slot; null when it does not read. */
export function parseMainStats(label: string): MainStatPlan | null {
  const parts = label.trim().split(/\s+/);
  const layout = parts[0] as RileyLayout;
  if (!RILEY_LAYOUTS.includes(layout)) return null;
  const words = parts.slice(1);
  const costs = LAYOUT_COSTS[layout];
  if (words.length !== costs.length) return null;
  const slots: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const cost = costs[i]!;
    // a 1-cost is written lowercase; everything else as printed
    const stat = cost === 1 ? STAT_OF_LABEL[word.toUpperCase()] : STAT_OF_LABEL[word];
    if (!stat) return null;
    if (cost === 1 && !["ATK", "HP", "DEF"].includes(stat)) return null;
    slots.push(stat);
  }
  return { layout, slots, byCost: byCostOf(costs, slots), label };
}

function byCostOf(costs: readonly number[], slots: readonly string[]): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  costs.forEach((cost, i) => {
    const list = (out[cost] ??= []);
    if (!list.includes(slots[i]!)) list.push(slots[i]!);
  });
  return out;
}

/** One member's need from his run's `detailFor(run).needs`: max(bar ?? 0, minEr), null where neither asks for any.
 *  The same rule as the energy check (er-check's `needOf`) — compare it with constant ER only. */
export function erNeedOf(n: Pick<EnergyNeedLite, "bar" | "minEr"> | null | undefined, kitMinEr = 0): { need: number | null; setBy: "loop" | "kit" | null } {
  const bar = n?.bar ?? null;
  const minEr = Math.max(Number(n?.minEr ?? 0), Number(kitMinEr) || 0);
  const need = Math.max(bar ?? 0, minEr);
  if (!(need > 0)) return { need: null, setBy: null };
  return { need: Math.round(need * 100) / 100, setBy: minEr > (bar ?? 0) ? "kit" : "loop" };
}

/** A member of Riley's best `mine` row as a plan. `need` is that member's entry of the traced run's `needs`
 *  (RunLite) — without it only the kit's own floor (`minEr`) is known. */
export function planFromRiley(m: RunMember, need?: Pick<EnergyNeedLite, "bar" | "minEr"> | null): MemberPlan {
  const unmapped: string[] = [];
  const sets: SetPlan[] = [];
  for (const name of m.sets) {
    const key = setKeyOf(name);
    if (key) sets.push({ key, pieces: piecesOf(name) });
    else unmapped.push(name);
  }
  const keys = m.mainEcho ? echoKeysOf(m.mainEcho) : [];
  if (m.mainEcho && !keys.length) unmapped.push(m.mainEcho);
  const mainStats = parseMainStats(m.mainStats);
  if (!mainStats && m.mainStats) unmapped.push(m.mainStats);
  const er = need ? erNeedOf(need) : erNeedOf({ bar: null, minEr: m.minEr });
  return {
    characterId: m.appKey,
    source: "riley",
    mainDps: m.mainDps,
    share: Number.isFinite(m.share) ? m.share : null,
    dps: Number.isFinite(m.dps) ? m.dps : null,
    sets,
    setsLabel: m.echo,
    mainEcho: m.mainEcho ? { name: m.mainEcho, keys } : null,
    mainStats,
    erNeed: er.need,
    erSetBy: er.setBy,
    note: m.spread || null,
    unmapped,
  };
}

/** An echo slot of a curated preset (`src/characters/<Key>/presets.ts` `echoes[].data.echoes[slot]`). */
export interface PresetEcho {
  type?: number | string | null;
  echo?: string | null;
  echoSet?: string | null;
  stat?: string | null;
}

/** Ryan's first curated echo preset for a character as a plan — the fallback when the team is not one of Riley's
 *  compositions: its sets (pieces counted), its slot-0 echo, its cost layout and main stats. No ER need (presets
 *  state it in prose, if at all); the player can type one. */
export function planFromPreset(characterId: string, preset: { name?: string; data?: { echoes?: Record<string, PresetEcho> | PresetEcho[]; mainEcho?: { echo?: string } | null } } | null | undefined, mainDps = false): MemberPlan {
  const empty: MemberPlan = {
    characterId,
    source: "none",
    mainDps,
    share: null,
    dps: null,
    sets: [],
    setsLabel: "",
    mainEcho: null,
    mainStats: null,
    erNeed: null,
    erSetBy: null,
    note: null,
    unmapped: [],
  };
  const raw = preset?.data?.echoes;
  const slots: PresetEcho[] = Array.isArray(raw) ? raw : raw ? Object.keys(raw).sort().map((k) => (raw as Record<string, PresetEcho>)[k]!) : [];
  if (slots.length !== 5) return empty;
  const counts = new Map<string, number>();
  for (const s of slots) if (s?.echoSet) counts.set(s.echoSet, (counts.get(s.echoSet) ?? 0) + 1);
  const sets = [...counts].filter(([key]) => key in echoSetLabelMap).map(([key, pieces]) => ({ key, pieces })).sort((a, b) => b.pieces - a.pieces);
  const main = preset?.data?.mainEcho?.echo ?? slots[0]?.echo ?? null;
  const mainName = main ? (mainEchoesData as Record<string, { name: string }>)[main]?.name ?? null : null;
  // slot 0 is the main echo; the rest sorted by cost, highest first, as Riley lists them
  const ordered = [slots[0]!, ...slots.slice(1).sort((a, b) => Number(b.type) - Number(a.type))];
  const costs = ordered.map((s) => Number(s.type));
  const code = [...costs].sort((a, b) => b - a).join("") as RileyLayout;
  let mainStats: MainStatPlan | null = null;
  if (RILEY_LAYOUTS.includes(code) && ordered.every((s) => !!s.stat)) {
    const sorted = ordered.map((s) => ({ cost: Number(s.type), stat: String(s.stat) })).sort((a, b) => b.cost - a.cost);
    const label = `${code} ${sorted.map((s) => (s.cost === 1 ? s.stat.toLowerCase() : s.stat)).join(" ")}`;
    mainStats = { layout: code, slots: sorted.map((s) => s.stat), byCost: byCostOf(LAYOUT_COSTS[code], sorted.map((s) => s.stat)), label };
  }
  return {
    ...empty,
    source: "preset",
    sets,
    setsLabel: sets.map((s) => `${echoSetLabelMap[s.key]} ${s.pieces}pc`).join(" + "),
    mainEcho: main && mainName ? { name: mainName, keys: echoKeysOf(mainName).length ? echoKeysOf(mainName) : [main] } : null,
    mainStats,
    note: preset?.name ?? null,
  };
}

/** The member's own build as a plan (no wuwa_calc pick, no curated preset): its sets, main echo and layout, so the
 *  search stays inside what they already run. `echoes` = the five slots resolved to inventory echoes. */
export function planFromCurrent(characterId: string, echoes: ReadonlyArray<PresetEcho | null | undefined>, mainDps = false): MemberPlan {
  const plan = planFromPreset(characterId, echoes.length === 5 && echoes.every((e) => e?.echo) ? { name: "Current build", data: { echoes: echoes as PresetEcho[] } } : null, mainDps);
  return plan.source === "preset" ? { ...plan, source: "current", note: "your current build" } : plan;
}

/** A plan with nothing to go on: any set, any main echo, any layout — the optimizer's own choice. */
export function emptyPlan(characterId: string, mainDps = false): MemberPlan {
  return planFromPreset(characterId, null, mainDps);
}

/** The plans' priority order: Riley's share of the team's DPS, highest first (the main DPS first when there is no
 *  share), then slot order. Returns indices into `plans`. */
export function priorityOrder(plans: ReadonlyArray<Pick<MemberPlan, "share" | "mainDps">>): number[] {
  return plans
    .map((p, i) => ({ i, share: p.share ?? (p.mainDps ? 1 : 0), main: p.mainDps ? 1 : 0 }))
    .sort((a, b) => b.share - a.share || b.main - a.main || a.i - b.i)
    .map((x) => x.i);
}
