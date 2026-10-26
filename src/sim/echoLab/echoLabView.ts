// Wuthering Tools+ Echo Lab page — the view model: display names and pictures, the inventory table's filters
// and sort, the feed list grouped the way the game's echo filter works (Sonata, Cost, Main Stat), the colour of
// a substat line by what it is worth on a build, formatters. Pure (no Vue, no stores); the numbers it shows all
// come from the engine results in bestOwner.ts / benchmarkScore.ts / rerollAdvice.ts.
import { characterPortraitUrl, getCharacterRosterDisplayName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { getEchoSetIconByType, getEchoSetLabelByType, getSubStatIconByType, rankColors } from "../../echoes/stats";
import { SUBSTAT_ABBR, SUBSTAT_KEYS, expectedRoll, isFlatSubstat, type SubstatKey } from "../substats/substatWeights";
import type { EchoVerdict, EchoVerdictKind, LabCharacterSummary, VerdictReason } from "./bestOwner";
import type { LockPlan } from "./rerollAdvice";
import { MIN_PLAN_GAIN } from "./rerollPick";

// ── names and pictures ──

export const echoName = (key: string | null | undefined): string => (key ? mainEchoesData[key]?.name ?? key : "Unknown echo");
export const echoImage = (key: string | null | undefined): string | null => (key ? mainEchoesData[key]?.image ?? null : null);
export const setLabel = (key: string | null | undefined): string => (key ? getEchoSetLabelByType(key) ?? key : "No set");
export const setIcon = (key: string | null | undefined): string | null => (key ? getEchoSetIconByType(key) ?? null : null);
export const characterName = (id: string): string => getCharacterRosterDisplayName(id);
export const portrait = (id: string): string => characterPortraitUrl(id);
export const substatIcon = (key: string): string | null => getSubStatIconByType(key) ?? null;
export const rankColor = (rank: number | null | undefined): string | null => (rank ? (rankColors as unknown as Record<string, string>)[String(rank)] ?? null : null);

/** Main stats in a table cell's width. */
export const MAIN_LABELS: Record<string, string> = {
  CritRate: "Crit Rate",
  CritDMG: "Crit DMG",
  ATK: "ATK %",
  HP: "HP %",
  DEF: "DEF %",
  EnergyRegen: "Energy Regen",
  HealingBonus: "Healing",
  Glacio: "Glacio DMG",
  Fusion: "Fusion DMG",
  Electro: "Electro DMG",
  Aero: "Aero DMG",
  Spectro: "Spectro DMG",
  Havoc: "Havoc DMG",
};
export const mainLabel = (key: string | null | undefined): string => (key ? MAIN_LABELS[key] ?? key : "—");

/** A substat line as the chips read it: `CR 8.7%`, `ATK 50`. */
export function lineText(key: string, value: number): string {
  const abbr = SUBSTAT_ABBR[key] ?? key;
  return isFlatSubstat(key as SubstatKey) ? `${abbr} ${Math.round(value)}` : `${abbr} ${trim(value)}%`;
}

const trim = (n: number): string => String(Math.round(n * 10) / 10);

// ── formatters ──

export const pct = (g: number, digits = 1): string => `${(g * 100).toFixed(digits)}%`;
export const signedPct = (g: number, digits = 1): string => `${g > 0 ? "+" : g < 0 ? "−" : "±"}${Math.abs(g * 100).toFixed(digits)}%`;
export const fmtInt = (n: number): string => Math.round(n).toLocaleString("en-US");
/** 8,095,406 → 8.10M; 19,509 → 19.5k */
export function compact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}${(a / 1e3).toFixed(1)}k`;
  return `${sign}${Math.round(a).toLocaleString("en-US")}`;
}

// ── verdicts ──

export const VERDICT_LABEL: Record<EchoVerdictKind, string> = { keep: "Keep", spare: "Spare", feed: "Feed" };
export const VERDICT_ORDER: Record<EchoVerdictKind, number> = { keep: 0, spare: 1, feed: 2 };

export function reasonText(row: Pick<EchoVerdict, "reason" | "upgradeFor" | "wornBy" | "potential">): string {
  const reasons: Record<VerdictReason, string> = {
    upgrade: row.upgradeFor.length > 1 ? `Upgrade for ${row.upgradeFor.length}` : "Upgrade",
    worn: row.wornBy.every((w) => w.stale) ? "Marked equipped" : "Worn",
    tune: "Worth tuning",
    close: "Backup, within 2 %",
    gamble: "Gamble to tune",
    "good-subs": "Good subs, no slot",
    "no-gain": "No gain anywhere",
    "no-slot": "No one can slot it",
  };
  return reasons[row.reason];
}

/** The character whose build colours an echo's lines: its best owner, else who wears it. */
export function referenceCharacter(row: Pick<EchoVerdict, "best" | "wornBy">): string | null {
  return row.best?.characterId ?? row.wornBy.find((w) => !w.stale)?.characterId ?? row.wornBy[0]?.characterId ?? null;
}

export type LineTier = "great" | "good" | "weak" | "dead";

/**
 * How much a substat line is worth on a build, against one expected roll of the build's best substat: ≥ 60 %
 * great, ≥ 25 % good, above 3 % weak, else dead. Linear (the per-point prices of the pass); a colour, not a verdict.
 */
export function lineTier(perPoint: Partial<Record<string, number>> | null | undefined, key: string, value: number): { tier: LineTier; worth: number; share: number } {
  if (!perPoint) return { tier: "good", worth: 0, share: 0 };
  const top = Math.max(0, ...SUBSTAT_KEYS.map((k) => (perPoint[k] ?? 0) * expectedRoll(k)));
  const worth = (perPoint[key] ?? 0) * value;
  const share = top > 0 ? worth / top : 0;
  const tier: LineTier = share >= 0.6 ? "great" : share >= 0.25 ? "good" : share > 0.03 ? "weak" : "dead";
  return { tier, worth, share };
}

// ── filters and sort ──

export interface VerdictFilters {
  verdict: "all" | EchoVerdictKind;
  cost: "all" | number;
  set: string;
  main: string;
  /** a character id: echoes whose best owner it is or that are an upgrade for it; "all" */
  owner: string;
  worn: "all" | "worn" | "free";
  search: string;
}

export const DEFAULT_FILTERS: VerdictFilters = { verdict: "all", cost: "all", set: "all", main: "all", owner: "all", worn: "all", search: "" };

export const isWorn = (row: Pick<EchoVerdict, "wornBy">): boolean => row.wornBy.length > 0;

export function applyFilters(rows: readonly EchoVerdict[], f: VerdictFilters): EchoVerdict[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.verdict !== "all" && r.verdict !== f.verdict) return false;
    if (f.cost !== "all" && r.cost !== f.cost) return false;
    if (f.set !== "all" && (r.set ?? "") !== f.set) return false;
    if (f.main !== "all" && (r.main ?? "") !== f.main) return false;
    if (f.owner !== "all" && r.best?.characterId !== f.owner && !r.upgradeFor.includes(f.owner)) return false;
    if (f.worn === "worn" && !isWorn(r)) return false;
    if (f.worn === "free" && isWorn(r)) return false;
    if (q && !`${echoName(r.echo)} ${setLabel(r.set)} ${mainLabel(r.main)}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export const activeFilterCount = (f: VerdictFilters): number =>
  (Object.keys(DEFAULT_FILTERS) as Array<keyof VerdictFilters>).filter((k) => (k === "search" ? f.search.trim() !== "" : f[k] !== DEFAULT_FILTERS[k])).length;

export type VerdictSortKey = "gain" | "verdict" | "name" | "set" | "cost" | "main" | "worn" | "lines";

export const SORT_LABELS: Record<VerdictSortKey, string> = {
  gain: "Best gain",
  verdict: "Verdict",
  name: "Echo",
  set: "Set",
  cost: "Cost",
  main: "Main stat",
  worn: "Worn",
  lines: "Lines",
};

const gainOf = (r: EchoVerdict): number => r.best?.gain ?? -Infinity;

/** Sorted copy. `desc` flips the natural order (gain: biggest first is the natural order). */
export function sortRows(rows: readonly EchoVerdict[], key: VerdictSortKey, desc = false): EchoVerdict[] {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  const cmp: Record<VerdictSortKey, (a: EchoVerdict, b: EchoVerdict) => number> = {
    gain: (a, b) => gainOf(b) - gainOf(a),
    verdict: (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || gainOf(b) - gainOf(a),
    name: (a, b) => echoName(a.echo).localeCompare(echoName(b.echo)),
    set: (a, b) => setLabel(a.set).localeCompare(setLabel(b.set)),
    cost: (a, b) => (b.cost ?? 0) - (a.cost ?? 0),
    main: (a, b) => mainLabel(a.main).localeCompare(mainLabel(b.main)),
    worn: (a, b) => Number(isWorn(b)) - Number(isWorn(a)),
    lines: (a, b) => a.lines - b.lines,
  };
  const out = [...rows].sort((a, b) => cmp[key](a, b) || gainOf(b) - gainOf(a) || a.echoId.localeCompare(b.echoId));
  return desc ? out.reverse() : out;
}

// ── the feed list ──

export interface FeedGroup {
  cost: number | null;
  set: string | null;
  main: string | null;
  count: number;
  echoIds: string[];
}

/** The feed verdicts grouped as the game filters echoes: Sonata (set), Cost, Main Stat — biggest groups first. */
export function feedGroups(rows: readonly EchoVerdict[]): FeedGroup[] {
  const groups = new Map<string, FeedGroup>();
  for (const r of rows) {
    if (r.verdict !== "feed") continue;
    const key = `${r.cost}|${r.set}|${r.main}`;
    const g = groups.get(key) ?? { cost: r.cost, set: r.set, main: r.main, count: 0, echoIds: [] };
    g.count += 1;
    g.echoIds.push(r.echoId);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (b.cost ?? 0) - (a.cost ?? 0) || setLabel(a.set).localeCompare(setLabel(b.set)));
}

/** The feed list as plain text (one line per group), for the clipboard. */
export function feedListText(groups: readonly FeedGroup[]): string {
  const total = groups.reduce((n, g) => n + g.count, 0);
  const lines = groups.map((g) => `${g.count} × Cost ${g.cost ?? "?"} · ${setLabel(g.set)} · ${mainLabel(g.main)} main`);
  return [`Echo Lab feed list — ${total} echo${total === 1 ? "" : "es"} (filter in game by Sonata, Cost and Main Stat):`, ...lines].join("\n");
}

// ── benchmark ──

export type ScoreBand = "low" | "fair" | "good" | "great";

/** 0–2 → a band: below 60 % low, below 90 % fair, below 120 % good, else great. */
export const scoreBand = (score: number | null | undefined): ScoreBand =>
  score == null ? "low" : score < 0.6 ? "low" : score < 0.9 ? "fair" : score < 1.2 ? "good" : "great";

// ── re-roll ──

/** A lock plan whose expected gain is below this (0.05 % of the rotation) is not worth Transducers: "keep as is". */
export { MIN_PLAN_GAIN };

/** The engine's recommended plan, unless it gains next to nothing. */
export const worthwhilePlan = (plan: LockPlan | null | undefined): LockPlan | null => (plan && plan.expectedGain >= MIN_PLAN_GAIN ? plan : null);

export function planSentence(plan: LockPlan): string {
  const lock = plan.locks ? `Lock ${plan.locks}` : "Lock nothing";
  const roll = `re-roll ${plan.rerolledFields.length}`;
  return `${lock}, ${roll}: ${pct(plan.pImprove, 0)} chance to improve, ${signedPct(plan.expectedGain, 2)} expected keeping the better lines`;
}

// ── characters ──

/** Characters ordered for pickers: most upgrades first, then by name. */
export function charactersByUpgrades(list: readonly LabCharacterSummary[]): LabCharacterSummary[] {
  return [...list].sort((a, b) => b.upgrades - a.upgrades || characterName(a.id).localeCompare(characterName(b.id)));
}

// ── progress ──

export const PHASE_LABELS: Record<string, string> = {
  characters: "Finding each character's best rotation",
  weights: "Pricing every substat on every build",
  echoes: "Scoring every echo in every slot",
  potential: "Simulating the lines still to roll",
  benchmark: "Benchmarking builds",
  reroll: "Simulating re-rolls",
};
export const phaseLabel = (phase: string | null | undefined): string => (phase ? PHASE_LABELS[phase] ?? phase : "Starting");

/** The slot as players count it: slot 0 is the main echo. */
export const slotLabel = (slot: number): string => (slot === 0 ? "Main echo" : `Slot ${slot + 1}`);
