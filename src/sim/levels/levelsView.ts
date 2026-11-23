// Wuthering Tools+ — "What each level is worth": the words and figures the drawer section, the CLI and the assistant's
// tool print, kept out of the component so they are testable. Pure.
import { count } from "../materials/costToMax";
import { BASIS_WORDS, basisGain, inertText, pathHeadline, type Basis, type LevelPlan, type LevelRow, type PathStep } from "./levelWorth";
import type { LevelCost } from "./levelSteps";

/** "+15.1%", "+0.03%" for a gain under a tenth of a percent (it is not nothing), "+<0.01%" for one that would print
 *  as zero and is not, "+1,900.9%" from level 1. */
export function gainText(gain: number): string {
  const v = gain * 100;
  if (v !== 0 && Math.abs(v) < 0.005) return `${v > 0 ? "+" : "-"}<0.01%`;
  const digits = v !== 0 && Math.abs(v) < 0.095 ? 2 : 1;
  return `${v >= 0 ? "+" : ""}${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

const plural = (n: number, one: string): string => `${count(n)} ${one}${n === 1 ? "" : "s"}`;

/** "349,115 Shell Credits · 39 × Premium Resonance Potion · 1 ascension" — everything of a step but its materials. */
export function costText(cost: LevelCost): string {
  const parts = [`${count(cost.credits)} Shell Credits`];
  for (const item of cost.expItems) parts.push(`${count(item.count)} × ${item.name}`);
  if (cost.ascensions) parts.push(plural(cost.ascensions, "ascension"));
  return parts.join(" · ");
}

/** "5 materials" for the fold that lists them; "" when the step needs none. */
export const materialsText = (cost: LevelCost): string => (cost.materials.length ? plural(cost.materials.length, "material") : "");

export interface GainChip {
  /** what the percent is of: "team", "own", "healing", "shield" */
  scope: string;
  text: string;
  gain: number;
}

/** A row's figures in the order they matter: the basis first, then the others that exist. */
export function gainChips(row: Pick<LevelRow, "own" | "healing" | "shield" | "team">, basis: Basis): GainChip[] {
  const all: Array<[Basis, string]> = [
    ["team", "team"],
    ["own", "own"],
    ["healing", "healing"],
    ["shield", "shield"],
  ];
  const order = [...all.filter(([b]) => b === basis), ...all.filter(([b]) => b !== basis)];
  const out: GainChip[] = [];
  for (const [b, scope] of order) {
    const has = b === "team" ? !!row.team : b === "own" ? !!row.own : b === "healing" ? !!row.healing : !!row.shield;
    if (!has) continue;
    const gain = basisGain(row, b) ?? 0;
    out.push({ scope, text: gainText(gain), gain });
  }
  return out;
}

export interface PlanTitles {
  /** the character's short name */
  name: string;
  /** the rotation and the team as the page titles them (a wuwa_calc name read as its team) */
  rotation: string | null;
  team: string | null;
}

/** What the percentages are percentages of, in one paragraph. */
export function basisLine(plan: LevelPlan, t: PlanTitles): string {
  if (plan.noGain || !plan.base) return "";
  const parts = [`Own = ${t.name}'s average damage per rotation on their best rotation${t.rotation ? ` (${t.rotation})` : ""}.`];
  if (plan.team) parts.push(`Team = the damage of ${t.team ?? plan.team.name}, the strongest team ${t.name} can field.`);
  else if (plan.teamNote) parts.push(`No team figure: ${plan.teamNote}.`);
  if (plan.base.healing > 0 || plan.base.shield > 0) {
    const what = [plan.base.healing > 0 ? "heals" : "", plan.base.shield > 0 ? "shields" : ""].filter(Boolean).join(" and ");
    parts.push(
      plan.basis === "healing" || plan.basis === "shield"
        ? `This rotation ${what} for more than it hits, so the steps are ordered by ${BASIS_WORDS[plan.basis]}; healing and shields are not in the damage figures.`
        : `This rotation also ${what}: a step's healing or shield gain is shown beside its damage.`,
    );
  }
  parts.push("Enemy level 100, 20 % RES.");
  return parts.join(" ");
}

/** How the path is built, in one line. */
export function pathHow(plan: Pick<LevelPlan, "basis" | "pathOrder">): string {
  const pick = plan.pathOrder === "value" ? `adds the most ${BASIS_WORDS[plan.basis]} for its Shell Credits` : `adds the most ${BASIS_WORDS[plan.basis]}`;
  return `Each step is the one that ${pick} at that point. After every step the build is scored again, because level-ups multiply each other.`;
}

/** "The first 3 steps give +7.6% team damage for 81,500 Shell Credits." */
export function headlineText(plan: Pick<LevelPlan, "path" | "basis">, steps = 3): string | null {
  const h = pathHeadline(plan, steps);
  if (!h) return null;
  return `${h.steps === 1 ? "The first step gives" : `The first ${h.steps} steps give`} ${gainText(h.gain)} ${BASIS_WORDS[h.basis]} for ${count(h.credits)} Shell Credits.`;
}

/** A path step's own figure on the basis, falling back to the character's own damage when the basis has none. */
export function stepChip(step: PathStep, basis: Basis): GainChip {
  return gainChips(step, basis)[0] ?? { scope: "own", text: gainText(0), gain: 0 };
}

/** "so far +7.6% team for 81,500 Shell Credits" */
export function runningText(step: PathStep, basis: Basis): string {
  const r = step.running;
  const gain = basis === "team" ? r.teamGain : basis === "healing" ? r.healingGain : basis === "shield" ? r.shieldGain : r.gain;
  const scope = basis === "team" ? "team" : basis === "own" ? "own" : basis;
  return `so far ${gain == null ? "" : `${gainText(gain)} ${scope} `}for ${count(r.cost.credits)} Shell Credits`;
}

/** Why a step of the order spans two levels of a skill: "Counted as one step: level 9 alone adds nothing here (the
 *  calculator's table gives it level 8's figures)." Null for an ordinary step. */
export function flatNote(step: Pick<PathStep, "flat" | "from">): string | null {
  const flat = step.flat ?? [];
  if (!flat.length) return null;
  const levels = flat.length > 1 ? `levels ${flat.slice(0, -1).join(", ")} and ${flat.at(-1)} alone add` : `level ${flat[0]} alone adds`;
  return `Counted as one step: ${levels} nothing here (the calculator's table gives ${flat.length > 1 ? "them" : "it"} level ${step.from}'s figures).`;
}

/** How many of the Forte 7-10 material (`plan.gate`) a step takes; 0 for a step without it. */
export function gateCount(cost: Pick<LevelCost, "materials">, gate: LevelPlan["gate"]): number {
  return gate ? (cost.materials.find((m) => m.id === gate.id)?.count ?? 0) : 0;
}

/** "1 × Curse of the Abyss", said beside a step of the order that takes it; null for a step that does not. */
export function gateText(step: Pick<PathStep, "cost">, gate: LevelPlan["gate"]): string | null {
  const n = gateCount(step.cost, gate);
  return n && gate ? `${count(n)} × ${gate.name}` : null;
}

/** The order prices a step in Shell Credits, so a Forte step from level 7 up looks cheap: it also takes the material
 *  those levels need, which no Shell Credits stand in for. Said once under the order, with how many steps take it
 *  (each says so beside its cost); null when no step does. */
export function gateLine(plan: Pick<LevelPlan, "path" | "gate">): string | null {
  const gate = plan.gate;
  if (!gate) return null;
  const steps = plan.path.filter((s) => gateCount(s.cost, gate) > 0);
  if (!steps.length) return null;
  const total = steps.reduce((n, s) => n + gateCount(s.cost, gate), 0);
  const which = steps.length === 1 ? "One step also takes" : `${count(steps.length)} of its ${count(plan.path.length)} steps also take`;
  return `The order prices each step in Shell Credits only. ${which} ${gate.name} (${count(total)} in all, said beside each), which it does not weigh: if you are short of it, take the next step without it.`;
}

/** Everything left, in one sentence: "+40.1% team · +59.2% own for 2,125,595 Shell Credits". */
export function everythingText(plan: Pick<LevelPlan, "everything" | "basis">): string | null {
  const e = plan.everything;
  if (!e) return null;
  const chips = gainChips({ own: e.own, healing: e.healing, shield: e.shield, team: e.team }, plan.basis);
  const gains = chips.map((c) => `${c.text} ${c.scope}`).join(" · ");
  return gains ? `${gains} for ${costText(e.cost)}` : costText(e.cost);
}

/** For a support: every level-up together hardly moves the team. Null when it moves it by a percent or more, or there
 *  is no team figure. */
export function smallTeamLine(plan: Pick<LevelPlan, "everything" | "basis">, name: string): string | null {
  const team = plan.everything?.team;
  if (!team || plan.basis !== "team" || !(team.gain < 0.01)) return null;
  return `Every level-up here together moves this team's damage by ${gainText(team.gain)}: ${name}'s own hits are a small part of what the team deals.`;
}

/** The tracks the path leaves out: "Intro Skill 1 → 10 and Normal Attack 6 → 10: not used in this rotation". */
export function inertLine(plan: Pick<LevelPlan, "inert">, rotation: string | null): string | null {
  if (!plan.inert.length) return null;
  const forte = plan.inert.filter((r) => r.track !== "level" && r.track !== "weapon");
  const levels = plan.inert.filter((r) => r.track === "level" || r.track === "weapon");
  const list = (rows: LevelRow[]): string => (rows.length > 1 ? `${rows.slice(0, -1).map((r) => r.label).join(", ")} and ${rows.at(-1)!.label}` : rows[0]!.label);
  return [forte.length ? `${list(forte)}: ${inertText(forte[0]!, rotation)}` : "", levels.length ? `${list(levels)}: ${inertText(levels[0]!, rotation)}` : ""].filter(Boolean).join(". ");
}

/** What the order does not know: said under it, so a locked step is no surprise. A statement about this tool only;
 *  the game's own unlock rules are in no table the app reads. */
export function orderBlindText(basis: Basis = "team"): string {
  return `The order looks only at ${measureWord(basis)} and Shell Credits. It does not know what the game unlocks when, so a step may still be locked for you: take the next one that is open.`;
}
export const ORDER_BLIND = orderBlindText();

/** What a level-up is measured in: a healer's levels buy healing, a shielder's shield strength, everyone else's damage.
 *  The section's first line and the line under the order say it (they said "damage" for Verina's healing order). */
export function measureWord(basis: Basis): string {
  return basis === "healing" ? "healing" : basis === "shield" ? "shield strength" : "damage";
}

/** The one line on what is not a step here. */
export const NOT_MODELLED =
  "Not in this list: the two inherent skills and the eight stat bonuses. The calculator holds them as switches, not levels (Cost to max prices them). Outro Skill, Tune Break and echo skills have no level to raise.";
