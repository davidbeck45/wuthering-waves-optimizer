// Wuthering Tools+ — /weapons' view model: a weapon-value row (weaponValue.ts) as one chart bar, in either scope
// (the character's own damage, or their strongest fieldable team's), plus the sorts, filters, KPI tiles, the shared
// axis and the prefs. Pure: no Vue, no stores.
import { characterDisplayName } from "../display/names";
import type { CharacterWeaponValue, SignatureStatus, ValueOption, WeaponValueResult } from "./weaponValue";

export type Scope = "own" | "team";
export type SortKey = "signature" | "r5" | "damage" | "name";
export type FilterKey = "all" | "swap" | "held" | "done";

export const PREFS_KEY = "wtplus:weapons:prefs";

export interface WeaponPrefs {
  scope: Scope;
  sort: SortKey;
  filter: FilterKey;
  /** list characters with no weapon equipped (greyed) */
  showNotSetUp: boolean;
  tab: "signatures" | "selector";
  pool: string;
}

export const DEFAULT_PREFS: WeaponPrefs = { scope: "team", sort: "signature", filter: "all", showNotSetUp: false, tab: "signatures", pool: "standard-resonator" };

export function readPrefs(raw: string | null): WeaponPrefs {
  try {
    const p = JSON.parse(raw ?? "null") as Partial<WeaponPrefs> | null;
    if (!p || typeof p !== "object") return { ...DEFAULT_PREFS };
    return {
      scope: p.scope === "own" ? "own" : "team",
      sort: (["signature", "r5", "damage", "name"] as const).includes(p.sort as SortKey) ? (p.sort as SortKey) : DEFAULT_PREFS.sort,
      filter: (["all", "swap", "held", "done"] as const).includes(p.filter as FilterKey) ? (p.filter as FilterKey) : "all",
      showNotSetUp: p.showNotSetUp === true,
      tab: p.tab === "selector" ? "selector" : "signatures",
      pool: typeof p.pool === "string" && p.pool ? p.pool : DEFAULT_PREFS.pool,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** An option's figure in a scope: team gain (null with no team figure) or own gain. */
export const valueIn = (o: ValueOption | null | undefined, scope: Scope): number | null => (!o ? null : scope === "team" ? (o.team ? o.team.gain : null) : o.gain);

export interface Tick {
  refinement: number;
  value: number | null;
}

export interface BarModel {
  id: string;
  name: string;
  row: CharacterWeaponValue;
  /** what the bar shows */
  kind: "swap" | "held" | "maxed" | "none" | "not-in-app" | "error";
  /** the next copy: signature R1 for a swap, the next refinement for a held one */
  head: { label: string; value: number | null; low: number | null; option: ValueOption | null } | null;
  /** every further signature step, to R5 */
  ladder: Tick[];
  /** the value at R5 (the last step) */
  r5: number | null;
  /** the best alternative that is not the signature (standard 5★, 4★ R5 or the next refinement) */
  alt: { option: ValueOption; value: number | null } | null;
  /** a short status line for rows without a bar */
  status: string;
  /** why the scope has no figure (team scope without a team, an engine note) */
  note: string | null;
}

const SIG_TEXT: Record<SignatureStatus, string> = {
  swap: "",
  held: "",
  maxed: "Signature at R5",
  none: "No signature weapon",
  "not-in-app": "Signature not in the app yet",
};

/** One chart row for a weapon-value row in a scope. */
export function barModel(row: CharacterWeaponValue, scope: Scope): BarModel {
  const name = characterDisplayName(row.id) || row.name;
  const alternatives = [...row.standard, ...(row.four ? [row.four] : []), ...(row.refine ? [row.refine] : [])];
  let alt: BarModel["alt"] = null;
  for (const o of alternatives) {
    const v = valueIn(o, scope);
    if (!alt || (v ?? -Infinity) > (alt.value ?? -Infinity)) alt = { option: o, value: v };
  }
  const base: BarModel = { id: row.id, name, row, kind: "error", head: null, ladder: [], r5: null, alt, status: "", note: null };
  if (row.status !== "ok") return { ...base, kind: "error", status: "Could not be scored", note: row.note };
  const sig = row.signature;
  if (sig.status === "swap" || sig.status === "held") {
    const [first, ...rest] = sig.steps;
    if (!first) return { ...base, kind: "error", status: "Could not be scored", note: row.note };
    const value = valueIn(first, scope);
    return {
      ...base,
      kind: sig.status,
      head: { label: `R${first.refinement}`, value, low: scope === "own" ? (first.low?.gain ?? null) : null, option: first },
      ladder: rest.map((s) => ({ refinement: s.refinement, value: valueIn(s, scope) })),
      r5: valueIn(sig.steps[sig.steps.length - 1], scope),
      note: value === null ? first.teamNote ?? row.teamNote : null,
    };
  }
  return { ...base, kind: sig.status === "maxed" ? "maxed" : sig.status === "none" ? "none" : "not-in-app", status: SIG_TEXT[sig.status] };
}

/** A sort that never jitters: nulls last, then by name. */
export function sortBars(bars: BarModel[], key: SortKey): BarModel[] {
  const num = (v: number | null | undefined): number => (v == null || !Number.isFinite(v) ? -Infinity : v);
  const byName = (a: BarModel, b: BarModel): number => a.name.localeCompare(b.name);
  return [...bars].sort((a, b) => {
    if (key === "name") return byName(a, b);
    if (key === "damage") return b.row.current.avgDamage - a.row.current.avgDamage || byName(a, b);
    const va = key === "r5" ? num(a.r5) : num(a.head?.value);
    const vb = key === "r5" ? num(b.r5) : num(b.head?.value);
    if (va !== vb) return vb - va;
    return num(b.r5) - num(a.r5) || byName(a, b);
  });
}

export function filterBars(bars: BarModel[], filter: FilterKey): BarModel[] {
  if (filter === "swap") return bars.filter((b) => b.kind === "swap");
  if (filter === "held") return bars.filter((b) => b.kind === "held");
  if (filter === "done") return bars.filter((b) => b.kind === "maxed" || b.kind === "none" || b.kind === "not-in-app" || b.kind === "error");
  return bars;
}

export const filterCounts = (bars: BarModel[]): Record<FilterKey, number> => ({
  all: bars.length,
  swap: filterBars(bars, "swap").length,
  held: filterBars(bars, "held").length,
  done: filterBars(bars, "done").length,
});

/** The chart's shared axis over the visible bars (always includes 0; a little headroom). */
export function axisOf(bars: BarModel[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const b of bars) {
    for (const v of [b.head?.value, b.head?.low, b.r5, ...b.ladder.map((t) => t.value)]) {
      if (v == null || !Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (max - min < 0.01) max = min + 0.01;
  return { min: min < 0 ? min * 1.04 : 0, max: max * 1.04 };
}

/** A value's position on the axis, 0–100 %. */
export const at = (v: number, axis: { min: number; max: number }): number => ((v - axis.min) / (axis.max - axis.min)) * 100;

export interface WeaponKpis {
  /** characters whose signature is not held */
  missing: number;
  /** signatures held below R5 */
  refining: number;
  /** signatures at R5 */
  maxed: number;
  /** the largest next-copy gain in this scope */
  top: { id: string; label: string; value: number } | null;
  /** the largest next refinement of a held signature */
  topRefine: { id: string; label: string; value: number } | null;
}

export function kpisOf(bars: BarModel[]): WeaponKpis {
  let top: WeaponKpis["top"] = null;
  let topRefine: WeaponKpis["topRefine"] = null;
  for (const b of bars) {
    const v = b.head?.value;
    if (v == null) continue;
    if (b.kind === "swap" && (!top || v > top.value)) top = { id: b.id, label: b.head!.option?.label ?? "", value: v };
    if (b.kind === "held" && (!topRefine || v > topRefine.value)) topRefine = { id: b.id, label: b.head!.option?.label ?? "", value: v };
  }
  return {
    missing: bars.filter((b) => b.kind === "swap").length,
    refining: bars.filter((b) => b.kind === "held").length,
    maxed: bars.filter((b) => b.kind === "maxed").length,
    top,
    topRefine,
  };
}

/** Prydwen's character guide (link out only — their text is theirs). Rover forms and compound names go to the list. */
export function prydwenUrl(id: string): string {
  const list = "https://www.prydwen.gg/wuthering-waves/characters";
  const name = characterDisplayName(id);
  if (!name || /^rover/i.test(id) || /[:()]/.test(name)) return list;
  return `${list}/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Characters in the result that could not be scored, for the footer. */
export const unscored = (result: WeaponValueResult | null): number => (result?.rows ?? []).filter((r) => r.status !== "ok").length;

/** Gridline values for an axis: a round step giving at most five lines, 0 always among them when in range. */
export function axisTicks(axis: { min: number; max: number }): number[] {
  const span = axis.max - axis.min;
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5].find((s) => span / s <= 5) ?? 10;
  const out: number[] = [];
  for (let v = Math.ceil(axis.min / step) * step; v <= axis.max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** "+12.4%" — or "+0.04%" for a gain under a tenth of a percent, so a real but small team figure never reads "+0.0%". */
export function pctFine(g: number | null | undefined): string {
  if (g == null || !Number.isFinite(g)) return "—";
  const p = g * 100;
  const digits = Math.abs(p) < 0.1 && p !== 0 ? 2 : 1;
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(digits)}%`;
}
