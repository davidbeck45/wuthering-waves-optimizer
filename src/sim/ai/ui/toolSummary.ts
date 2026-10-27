// Wuthering Tools+ AI — one line per tool call for the answer's timeline ("calc_team · Aemeath · Mornye · Lynae →
// 9.31M"), the deep-link buttons an answer offers (the page that shows the numbers) and the provenance chips.
// Pure over (tool name, input, result JSON); the panel renders it.
import { findTool } from "../tools/index";

export type ToolStatus = "preparing" | "running" | "ok" | "error";

export interface ToolCallView {
  id: string;
  name: string;
  input: unknown;
  /** the tool_result content (compact JSON) once it arrived */
  result: string | null;
  status: ToolStatus;
}

export interface ToolRowSummary {
  /** a few words for people ("Team damage") */
  label: string;
  /** what the call was about: names, filters */
  chips: string[];
  /** the number or fact the call produced, or the error */
  headline: string | null;
}

export const TOOL_LABELS: Record<string, string> = {
  get_account_summary: "Account",
  calc_character: "Character damage",
  calc_team: "Team damage",
  rank_roster: "Roster ranking",
  substat_weights: "Substat weights",
  what_if: "What if",
  list_rotations: "Rotations",
  list_team_presets: "Team presets",
  sequence_breakpoints: "Sequence breakpoints",
  get_kit: "Kit",
  search_inventory: "Echo search",
  rankings_link: "Team rankings link",
};

/** 9312345 → "9.31M", 372004 → "372K", 950 → "950". */
export function compactNumber(n: unknown): string | null {
  const v = typeof n === "number" ? n : Number(n);
  if (n == null || !Number.isFinite(v)) return null;
  const a = Math.abs(v);
  const fmt = (x: number, unit: string): string => `${x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1).replace(/\.0$/, "") : x.toFixed(2).replace(/\.?0+$/, "")}${unit}`;
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return sign + fmt(a / 1e9, "B");
  if (a >= 1e6) return sign + fmt(a / 1e6, "M");
  if (a >= 1e3) return sign + fmt(a / 1e3, "K");
  return sign + String(Math.round(a));
}

/** 4.21 → "+4.21 %", -1.5 → "−1.5 %". */
export function signedPct(p: unknown): string | null {
  const v = typeof p === "number" ? p : Number(p);
  if (p == null || !Number.isFinite(v)) return null;
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)} %`;
}

type Json = Record<string, any>;

function parse(result: string | null): Json | null {
  if (!result) return null;
  try {
    const v = JSON.parse(result) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const clip = (s: string, max = 48): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);
const asInput = (input: unknown): Json => (input && typeof input === "object" && !Array.isArray(input) ? (input as Json) : {});

/** The timeline row for one call (pending calls have no result yet). */
export function summarizeTool(call: Pick<ToolCallView, "name" | "input" | "result" | "status">): ToolRowSummary {
  const input = asInput(call.input);
  const r = parse(call.result);
  const label = TOOL_LABELS[call.name] ?? call.name;
  if (call.status === "error") {
    return { label, chips: inputChips(call.name, input, null), headline: clip(str(r?.error) ?? str(call.result) ?? "Failed", 90) };
  }
  return { label, chips: inputChips(call.name, input, r), headline: r ? headlineOf(call.name, r) : null };
}

function inputChips(name: string, input: Json, r: Json | null): string[] {
  const chips: string[] = [];
  const add = (v: unknown): void => {
    const s = str(v);
    if (s && !chips.includes(s)) chips.push(clip(s));
  };
  switch (name) {
    case "calc_team":
      if (Array.isArray(r?.members) && r!.members.length) r!.members.forEach(add);
      else add(input.team);
      break;
    case "what_if":
      add(r?.character ?? input.character);
      if (input.sequence != null) add(`S${input.sequence}`);
      add(input.weapon);
      if (input.refinement != null) add(`R${input.refinement}`);
      if (input.team) add(r?.scoredOn?.team ?? input.team);
      break;
    case "substat_weights":
      add(r?.character ?? input.character);
      add(input.team ? (r?.scoredOn?.team ?? input.team) : input.rotation);
      break;
    case "get_kit":
      add(r?.character ?? input.character);
      if (input.sequence != null) add(`S${input.sequence}`);
      break;
    case "rank_roster":
      add(`top ${input.top ?? 8}`);
      break;
    case "list_team_presets":
      add(input.character);
      if (input.fieldable_only === false) add("incl. not fieldable");
      break;
    case "search_inventory":
      for (const k of ["echo", "set", "main", "substat", "equipped_by"]) add(input[k]);
      if (input.cost != null) add(`${input.cost} cost`);
      if (input.equipped && input.equipped !== "any") add(input.equipped);
      if (input.sort === "crit_value_asc") add("lowest CV first");
      break;
    case "rankings_link":
      if (Array.isArray(input.characters)) input.characters.forEach(add);
      break;
    default:
      add(r?.character ?? input.character);
  }
  return chips;
}

function headlineOf(name: string, r: Json): string | null {
  switch (name) {
    case "get_account_summary": {
      const t = r.totals ?? {};
      return [t.setUp != null ? `${t.setUp} set up` : null, t.teams != null ? `${t.teams} teams` : null, t.echoes != null ? `${t.echoes} echoes` : null].filter(Boolean).join(" · ") || null;
    }
    case "calc_character": {
      const rot = Array.isArray(r.savedRotations) ? r.savedRotations[0] : null;
      if (rot?.avg != null) return `${compactNumber(rot.avg)} avg`;
      const hit = Array.isArray(r.topAttacks) ? r.topAttacks[0] : null;
      return hit?.avg != null ? `top hit ${compactNumber(hit.avg)}` : str(r.investment);
    }
    case "calc_team": {
      const avg = compactNumber(r.total?.avg);
      const dps = compactNumber(r.total?.dps);
      return avg ? (dps ? `${avg} · ${dps} DPS` : avg) : null;
    }
    case "rank_roster": {
      const top = Array.isArray(r.characters) ? r.characters[0] : null;
      return top ? `#1 ${top.character}${top.avg != null ? ` · ${compactNumber(top.avg)}` : ""}` : null;
    }
    case "substat_weights": {
      const look = Array.isArray(r.lookFor) ? r.lookFor.slice(0, 2) : [];
      if (look.length) return `look for ${look.join(", ")}`;
      const top = Array.isArray(r.weights) ? r.weights[0] : null;
      return top ? `${top.substat} best` : null;
    }
    case "what_if": {
      const gain = r.teamAvg?.gainPct ?? r.avg?.gainPct;
      const s = signedPct(gain);
      return s ? `${s}${r.teamAvg ? " team" : ""}` : null;
    }
    case "list_rotations": {
      const list = Array.isArray(r.rotations) ? r.rotations : [];
      const n = list.length + (Number(r.omitted) || 0);
      return n ? `${n} rotation${n === 1 ? "" : "s"}${list[0]?.avg != null ? ` · best ${compactNumber(list[0].avg)}` : ""}` : "none";
    }
    case "list_team_presets":
      return r.matching != null ? `${r.matching} team${r.matching === 1 ? "" : "s"}` : null;
    case "sequence_breakpoints":
      return r.available === false ? "no data" : Array.isArray(r.loadouts) ? `${r.loadouts.length} loadout${r.loadouts.length === 1 ? "" : "s"}` : null;
    case "get_kit":
      return str(r.yourSequence) ? `yours: ${r.yourSequence}` : null;
    case "search_inventory":
      return r.matching != null ? `${r.matching} echo${r.matching === 1 ? "" : "es"}` : null;
    case "rankings_link":
      return "link ready";
    default:
      return null;
  }
}

// ── deep links ──────────────────────────────────────────────────────────────────────────────

export type DeepLink =
  | { key: string; kind: "route"; label: string; path: string }
  | { key: string; kind: "character"; label: string; name: string }
  | { key: string; kind: "team"; label: string; name: string };

const isAppPath = (v: unknown): v is string => typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !/\s/.test(v);

/** The pages that show what an answer's tools computed, deduplicated, at most `max`. */
export function deepLinksOf(calls: ReadonlyArray<Pick<ToolCallView, "name" | "input" | "result" | "status">>, max = 4): DeepLink[] {
  const out: DeepLink[] = [];
  const add = (link: DeepLink): void => {
    if (!out.some((l) => l.key === link.key)) out.push(link);
  };
  for (const call of calls) {
    if (call.status !== "ok") continue;
    const r = parse(call.result);
    if (!r) continue;
    // a tool that returns a route (rankings_link) — shown first
    if (isAppPath(r.path)) add({ key: `route:${r.path}`, kind: "route", label: str(r.label) ?? "Open", path: r.path });
    switch (call.name) {
      case "rank_roster":
        add({ key: "route:/my-rankings", kind: "route", label: "My roster rankings", path: "/my-rankings" });
        break;
      case "calc_team":
        if (str(r.team)) add({ key: `team:${r.team}`, kind: "team", label: `Open "${clip(r.team, 32)}"`, name: r.team });
        break;
      case "what_if":
        if (r.scoredOn?.team) add({ key: `team:${r.scoredOn.team}`, kind: "team", label: `Open "${clip(r.scoredOn.team, 32)}"`, name: r.scoredOn.team });
        else if (str(r.character)) add({ key: `character:${r.character}`, kind: "character", label: `${r.character} in the calculator`, name: r.character });
        break;
      case "calc_character":
      case "substat_weights":
      case "list_rotations":
        if (str(r.character)) add({ key: `character:${r.character}`, kind: "character", label: `${r.character} in the calculator`, name: r.character });
        break;
      case "search_inventory":
        add({ key: "route:/inventory", kind: "route", label: "Inventory", path: "/inventory" });
        break;
      case "list_team_presets":
        add({ key: "route:/teams", kind: "route", label: "Teams", path: "/teams" });
        break;
    }
  }
  return out.slice(0, max);
}

/** The source labels of an answer's successful tools ("App engine · your team rotation"), deduplicated. */
export function provenanceOf(calls: ReadonlyArray<Pick<ToolCallView, "name" | "status">>): string[] {
  const out: string[] = [];
  for (const c of calls) {
    if (c.status !== "ok") continue;
    const p = findTool(c.name)?.provenance;
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** "1.2 s" / "340 ms" */
export const formatMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.max(0, Math.round(ms))} ms`);

/** Transcript tools (ok: true / false / null) → timeline views; `ms` from this tab's timings when known. */
export function toolViewsOf(
  tools: ReadonlyArray<{ id: string; name: string; input: unknown; ok: boolean | null; result: string | null }>,
  ms?: ReadonlyMap<string, number>,
): Array<ToolCallView & { ms: number | null }> {
  return tools.map((t) => ({
    id: t.id,
    name: t.name,
    input: t.input,
    result: t.result,
    status: t.ok === true ? "ok" : "error",
    ms: ms?.get(t.id) ?? null,
  }));
}

/** Pretty JSON for the expanded tool row (a tool result is compact JSON; anything unparseable is shown as is). */
export function prettyJson(value: unknown, max = 6000): string {
  let text: string;
  if (typeof value === "string") {
    try {
      text = JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      text = value;
    }
  } else {
    try {
      text = JSON.stringify(value ?? null, null, 2) ?? "null";
    } catch {
      text = String(value);
    }
  }
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
