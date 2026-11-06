// Wuthering Tools+ — /account "With what you own": the free upgrades, as rows beside "What to invest in next". Pure.
//
//   echoes  better echoes already in the inventory (echoCheck.ts, "Check my echoes"): own and team gains, exact or
//           absent with the reason, like every other row; the button opens /build-team on that team, only them
//   tuner   the Echo Lab Tuner plan's top steps the Tuners you entered there cover today (tunerBudget.ts over the
//           worker's tunerPlan.ts candidates): an expected own gain, no team figure (an expectation over rolls still
//           to come is not one build the team can be scored on); no Tuners entered → one row that asks for them
//   energy  Energy Regen shortfalls in the teams you can field (the energy check, src/sim/energy/): "needs 4.4 %
//           more", the /energy page's own hint (median ER rolls that close it); team damage doesn't count ER
//
// Rows are ordered like the paid list: by team gain, the rows without a team figure under a divider (by own gain,
// then the ER shortfall); or by own gain.
//
// Light on purpose (types only from the engine modules): /account loads it with the page, the check itself on demand.
import type { TeamImpact } from "./investPlan";
import type { EchoCheck, EchoUpgrade } from "./echoCheck";
import type { TeamRequest } from "../buildTeam/buildTeam";
import { characterDisplayName, characterShortName } from "../display/names";
import { isSetUp } from "../myRankings/rankRoster";
import { compact as compactNum, pct } from "../myRankings/format";
import { parsePresetName } from "../presets/presetName";
import { echoName, slotLabel } from "../echoLab/echoLabView";
import { planTuners, type TunerBudget } from "../echoLab/tunerBudget";
import type { TunerCandidate, TunerCandidatesResult } from "../echoLab/tunerPlan";
import { deficitFactor, erRoll, showHave, showNeed } from "../energy/energyNeed";
import type { TeamView } from "../energy/useEnergyNeeds";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type OwnKind = "echoes" | "tuner" | "energy";

export const OWN_KIND_LABELS: Record<OwnKind, string> = { echoes: "Echoes", tuner: "Tuners", energy: "Energy Regen" };

/** A page to go to: a path with an optional query (a vue-router location). */
export interface OwnLink {
  label: string;
  to: { path: string; query?: Record<string, string> };
}

export interface OwnRow {
  /** `<kind>:…`, stable across runs */
  id: string;
  kind: OwnKind;
  /** the character it is about; null for a row about the account (no Tuners entered) */
  characterId: string | null;
  /** the headline: "Better echoes from your inventory", "Tune Crownless to +25", "Needs 4.4 % more Energy Regen" */
  title: string;
  /** what to do, in plain words */
  todo: string;
  /** the character's own gain (0.03 = +3 %), null without one; `ownLabel` says what it is ("own", "own damage": a re-gear
   *  that moves the Energy Regen need, so the paid list's own, which counts the need, reads differently; "expected own") */
  own: number | null;
  ownLabel: string;
  /** what the own figure is measured on, in words ("2.59M → 3.33M avg damage per rotation on their best rotation") */
  ownDetail: string | null;
  team: TeamImpact | null;
  /** why there is no team figure (null with one) */
  teamNote: string | null;
  /** a figure that is not a gain (an ER shortfall), shown where the gain goes, with its caption */
  figure: { text: string; caption: string } | null;
  /** a second line: the ER floor a re-gear meets, buffs it switches on, the chance a spare echo is kept */
  note: string | null;
  link: OwnLink;
}

export interface TunerState {
  budget: TunerBudget;
  /** the Echo Lab's Tuner plan candidates for this account state (null: not worked out yet) */
  result: TunerCandidatesResult | null;
}

/** at most this many Tuner plan steps on the list (the plan itself is on Echo Lab) */
export const TUNER_STEPS = 3;

/** a gain this small reads as "+0.0 %": not a direction */
const MIN_SHOWN = 0.0005;
const TUNER_LINK: OwnLink = { label: "Open Tuner plan", to: { path: "/echo-lab", query: { tab: "plan" } } };
const TUNER_NO_TEAM = "a Tuner's gain is an expectation over the lines still to roll, not one build the team can be scored on";
const ER_NO_TEAM = "team damage doesn't count Energy Regen";
const pct1 = (n: number): string => `${n.toFixed(1)} %`;
const int = (n: number): string => Math.round(n).toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
/** a team as the other /account lists title it: "Aemeath · Mornye + Lynae" for a synced wuwa_calc team */
export const teamTitle = (name: string): string => parsePresetName(name).title || name;

/** The /build-team route for an echoes row: the team prefilled and only this character re-geared (`?only=`). */
export function buildTeamRoute(request: TeamRequest, only: string | null): { path: string; query: Record<string, string> } {
  const query: Record<string, string> = request.teamId ? { team: request.teamId } : { members: (request.members ?? []).join(",") };
  if (only) query.only = only;
  if (only && request.rankedTeam) query.rankedTeam = request.rankedTeam;
  return { path: "/build-team", query };
}

/** The headline says the trade when there is one: a re-gear can add own damage and cost the team (a support's set
 *  buff lost), or cost a little damage to meet the Energy Regen the loop needs (the engine's damage ignores ER). */
export function echoTitle(u: Pick<EchoUpgrade, "gain" | "team" | "er">): string {
  const teamDown = !!u.team && u.team.gain <= -MIN_SHOWN;
  // echoCheck keeps a row with a lower own figure only when it meets the ER need or lifts the team
  if (u.gain <= -MIN_SHOWN) return u.er?.buys ? "Meet the Energy Regen need with echoes you own" : "More team damage from echoes you own";
  if (teamDown) return "More own damage from echoes you own, less team damage";
  return "Better echoes from your inventory";
}

/** What a re-gear does to the Energy Regen need, on the paid list's basis (investPlan's own gain: damage × (1 − shortfall)).
 *  The row keeps the damage figure, since that is what /build-team prints for the same run. Null: the need doesn't move. */
function erCounted(u: Pick<EchoUpgrade, "gain" | "er">): { points: number; own: number } | null {
  if (!u.er) return null;
  const before = deficitFactor(u.er.floor, u.er.before);
  const after = deficitFactor(u.er.floor, u.er.after);
  const points = (after - before) * 100;
  if (!(before > 0) || Math.abs(points) < 0.05) return null;
  return { points, own: ((1 + u.gain) * after) / before - 1 };
}

/** One row per character the inventory gives a better build. */
export function echoRows(items: readonly EchoUpgrade[]): OwnRow[] {
  return items.map((u) => {
    const who = characterShortName(u.characterId);
    const others = u.changed - u.unworn;
    const alone = !u.request.teamId && (u.request.members ?? []).length <= 1;
    const on = 5 - u.empty;
    const swaps = u.changed - u.empty;
    // a build with empty slots: "swap 5 of Zhezhi's 5 echoes" would read as if she wore five
    const action = u.empty > 0 ? `fill ${who}'s ${plural(u.empty, "empty slot")}${swaps > 0 ? ` and swap ${swaps === on ? `the ${on === 1 ? "one" : on}` : `${swaps} of the ${on}`} already on` : ""}` : `swap ${u.changed} of ${who}'s 5 echoes`;
    const from = others > 0 ? `: ${u.unworn > 0 ? `${u.unworn} nobody wears, ${others}` : others === 1 ? "it's" : `all ${others}`} worn by someone outside the team (they keep wearing ${others === 1 ? "it" : "them"})` : u.empty > 0 ? " with echoes nobody wears" : ` for ${u.changed === 1 ? "one" : "ones"} nobody wears`;
    const notes: string[] = [];
    // each row is worked out alone: two can want the same spare, and a saved build takes no echo off anyone, so saving
    // one leaves the other still offering it. Said on both rows; never "save one, then check again"
    const rivals = items.filter((o) => o.characterId !== u.characterId && o.echoIds.some((id) => u.echoIds.includes(id))).map((o) => characterShortName(o.characterId));
    if (rivals.length) notes.push(`${rivals.length === 1 ? `${rivals[0]}'s row wants` : `${rivals.slice(0, -1).join(", ")} and ${rivals[rivals.length - 1]}'s rows want`} some of the same echoes: an echo goes on one character at a time, so choose who gets them.`);
    if (u.er?.buys) notes.push(`Meets the ${pct1(showNeed(u.er.floor))} Energy Regen the team's loop needs (today ${u.er.before == null ? "—" : pct1(showHave(u.er.before))}).`);
    else if (u.er && !u.er.met) notes.push(`Still short of the ${pct1(showNeed(u.er.floor))} Energy Regen the team's loop needs: ${u.er.mostFound ? "the most ER found in the echoes this check can use." : "the search counted a buff that isn't always on, so a build with more ER may exist."}`);
    const counted = erCounted(u);
    if (counted) notes.push(`Own damage leaves the Energy Regen need out. Counting the ${Math.abs(counted.points).toFixed(1)} points it ${counted.points > 0 ? "closes" : "loses"}, as What to invest in next does, it reads ${pct(counted.own)}.`);
    if (u.buffsOn.length) notes.push(`Counts ${u.buffsOn.join(", ")} switched on (nobody had set ${u.buffsOn.length === 1 ? "it" : "them"}).`);
    if (u.relaxed) notes.push(u.relaxed === "layout" ? "Your echoes can't fill the plan's layout: any layout of its sets." : "Your echoes can't fill the plan's main stats: any main stat of its sets.");
    return {
      id: u.id,
      kind: "echoes" as const,
      characterId: u.characterId,
      title: echoTitle(u),
      // a character in no team you can field is re-geared on their own: no "For <team>:"
      todo: `${alone ? `${action[0]!.toUpperCase()}${action.slice(1)}` : `For ${teamTitle(u.team?.teamName ?? u.teamName)}: ${action}`}${from}${u.sets ? ` (${u.sets})` : ""}.`,
      own: u.gain,
      ownLabel: counted ? "own damage" : "own",
      // Build my team's figure: with this team's buffs on them, so it can differ from /my-rankings' solo number
      ownDetail: `${compactNum(u.before)} → ${compactNum(u.after)} avg damage per rotation on ${u.objective === "Team rotation" ? "their part of the team's rotation" : alone ? "their best rotation" : "their best rotation, with this team's buffs"}`,
      team: u.team,
      teamNote: u.teamNote,
      figure: null,
      note: notes.join(" ") || null,
      link: { label: "Open Build my team", to: buildTeamRoute(u.request, u.characterId) },
    };
  });
}

function tunerTodo(c: TunerCandidate): string {
  const cost = `${int(c.resources.tuners)} Tuners, ${compactNum(c.resources.exp)} Echo EXP`;
  if (c.kind === "worn") return `Level ${characterShortName(c.characterId)}'s ${echoName(c.echo)} (${slotLabel(c.slot)}) from +${c.level} to +25 where it sits: ${cost}.`;
  return `Level the spare ${echoName(c.echo)} from +${c.level} to +25 and put it on ${characterShortName(c.characterId)} (${slotLabel(c.slot)}) if it beats the one there: ${cost}.`;
}

/** The Tuner plan's steps the entered Tuners cover today (at most `TUNER_STEPS`), or one row saying what's missing. */
export function tunerRows(state: TunerState): OwnRow[] {
  const base = { kind: "tuner" as const, team: null, teamNote: TUNER_NO_TEAM, link: TUNER_LINK };
  if (state.budget.tuners === null) {
    return [
      {
        ...base,
        id: "tuner:enter",
        characterId: null,
        title: "Enter your Tuners in Echo Lab › Tuner plan",
        todo: "Type how many Tuners (and Echo EXP) you have there, and this list shows the echoes they add the most damage to.",
        own: null,
        ownLabel: "",
        ownDetail: null,
        figure: null,
        note: null,
      },
    ];
  }
  if (!state.result) {
    return [
      {
        ...base,
        id: "tuner:pending",
        characterId: null,
        title: `What your ${int(state.budget.tuners)} Tuners buy`,
        todo: "Check my echoes works out the Tuner plan too (or open it in Echo Lab).",
        own: null,
        ownLabel: "",
        ownDetail: null,
        figure: null,
        note: null,
      },
    ];
  }
  const plan = planTuners(state.result.candidates, state.budget, state.result.fresh);
  const now = plan.steps.filter((s) => s.when.kind === "now").slice(0, TUNER_STEPS);
  if (now.length) {
    return now.map((s) => {
      const c = s.candidate;
      return {
        ...base,
        id: `tuner:${c.echoId}`,
        characterId: c.characterId,
        title: `Tune ${echoName(c.echo)} to +25`,
        todo: tunerTodo(c),
        own: c.expectedGain,
        ownLabel: "expected own",
        ownDetail: `About +${compactNum(c.expectedDamage)} avg damage per rotation on ${characterShortName(c.characterId)}'s best rotation, on average over the rolls`,
        figure: null,
        note: c.pKeep == null ? `Step ${s.order} of the Tuner plan.` : `Step ${s.order} of the Tuner plan · ${Math.round(c.pKeep * 100)} % chance it ends up better than the echo there.`,
      };
    });
  }
  const next = plan.steps[0];
  if (next) {
    return [
      {
        ...base,
        id: `tuner:short:${next.candidate.echoId}`,
        characterId: next.candidate.characterId,
        title: "Your Tuners don't cover the next step yet",
        todo: tunerTodo(next.candidate),
        own: null,
        ownLabel: "",
        ownDetail: null,
        // what the budget lacks for it: Tuners first, else the Echo EXP (a step waits on one or both)
        figure: next.shortTuners > 0 ? { text: int(next.shortTuners), caption: "Tuners short" } : { text: compactNum(next.shortExp), caption: "Echo EXP short" },
        note: next.shortTuners > 0 && next.shortExp > 0 ? `Also ${compactNum(next.shortExp)} Echo EXP short.` : null,
      },
    ];
  }
  return [
    {
      ...base,
      id: "tuner:none",
      characterId: null,
      title: "No unfinished echo is worth a Tuner",
      todo: "Every echo you could tune adds next to nothing. The Tuner plan's “Then farm” list says where a new echo pays most.",
      own: null,
      ownLabel: "",
      ownDetail: null,
      figure: null,
      note: null,
    },
  ];
}

/** "X needs 4.4 % more Energy Regen in team Y", for every member short in a team the account can field (every member
 *  set up), saved teams first; the energy check's numbers as /energy prints them. */
export function energyRows(views: readonly TeamView[], characters: Record<string, any>, echoes: readonly EchoUpgrade[] = []): OwnRow[] {
  const out: OwnRow[] = [];
  const seen = new Set<string>();
  const echoesBy = new Map(echoes.map((u) => [u.characterId, u]));
  const roll = erRoll();
  for (const view of views) {
    if (!view.checks || !view.characterIds.length || !view.characterIds.every((id) => isSetUp(characters[id]))) continue;
    for (const c of view.checks) {
      if (c.status !== "short" || c.need == null || c.have == null) continue;
      const key = `${view.key}|${c.characterId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const who = c.buildName ? `${characterShortName(c.characterId)}'s "${c.buildName}" build` : characterShortName(c.characterId);
      const word = c.member.setBy === "kit" ? "kit floor" : "need";
      const regear = echoesBy.get(c.characterId);
      // the re-gear's new character-screen ER covers this team's need too: say so (the fix is already on the list)
      const reach = regear?.er?.after != null && regear.er.after + 1e-6 >= c.need ? `The better echoes from your inventory (the Echoes row) bring ${characterShortName(c.characterId)} to ${pct1(showHave(regear.er.after))}.` : null;
      out.push({
        id: `energy:${view.id}:${c.characterId}`,
        kind: "energy",
        characterId: c.characterId,
        title: `Needs ${pct1(c.short)} more Energy Regen in ${teamTitle(view.name)}`,
        todo: `${who} has ${pct1(showHave(c.have))}; the team's wuwa_calc loop ${word === "kit floor" ? "keeps a kit floor of" : "needs"} ${pct1(showNeed(c.need))}: about ${plural(c.rolls, "Energy Regen roll")} (${pct1(roll)} each) closes it.`,
        own: null,
        ownLabel: "",
        ownDetail: null,
        team: null,
        teamNote: ER_NO_TEAM,
        figure: { text: pct1(c.short), caption: "ER short" },
        note: reach,
        link: { label: "Open Energy check", to: view.source === "saved" ? { path: "/energy", query: { team: view.id } } : { path: "/energy" } },
      });
    }
  }
  return out;
}

/** Every row of the group: echoes, Tuner plan, Energy Regen. */
export function ownUpgradeRows(input: { echoes: readonly EchoUpgrade[] | null; tuner: TunerState; energy: readonly TeamView[]; characters: Record<string, any> }): OwnRow[] {
  return [...echoRows(input.echoes ?? []), ...tunerRows(input.tuner), ...energyRows(input.energy, input.characters, input.echoes ?? [])];
}

export interface OwnRowView {
  row: OwnRow;
  /** the figure the row is ranked and drawn by (null: no gain figure) */
  value: number | null;
  scope: "team" | "own" | null;
  /** the first row of the group without a figure in this order */
  divider: boolean;
}

const KIND_ORDER: Record<OwnKind, number> = { echoes: 0, tuner: 1, energy: 2 };
const shortOf = (r: OwnRow): number => (r.kind === "energy" && r.figure ? Number.parseFloat(r.figure.text) || 0 : 0);

/** Team mode: team gain first, then the rows without one (by own gain, then the largest ER shortfall); own mode: own
 *  gain first, then the rows without one. Ties by kind, then id, so the order never jitters. */
export function sortOwnRows(rows: readonly OwnRow[], by: "own" | "team" = "team"): OwnRowView[] {
  const figure = (r: OwnRow): number | null => (by === "team" ? (r.team ? r.team.gain : null) : r.own);
  const sorted = [...rows].sort((a, b) => {
    const fa = figure(a);
    const fb = figure(b);
    if (fa != null && fb != null && fa !== fb) return fb - fa;
    if ((fa == null) !== (fb == null)) return fa == null ? 1 : -1;
    const oa = a.own ?? -Infinity;
    const ob = b.own ?? -Infinity;
    if (oa !== ob) return ob - oa;
    return shortOf(b) - shortOf(a) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id);
  });
  const anyFigure = sorted.some((r) => figure(r) != null);
  let seen = false;
  return sorted.map((row) => {
    const f = figure(row);
    const divider = anyFigure && f == null && !seen;
    if (f == null) seen = true;
    const value = f ?? (by === "team" ? row.own : null);
    const scope = f != null ? by : value != null ? "own" : null;
    return { row, value, scope, divider };
  });
}

export interface DrawerOwn {
  /** the character's rows, in the page's order */
  views: OwnRowView[];
  /** what the echo check says about them when it has no row for them (null with a row) */
  echoLine: string | null;
}

/** The character drawer's part of the group: their rows, and the echo check's word on them when it found nothing. */
export function drawerOwnOf(
  characterId: string,
  rows: readonly OwnRow[],
  check: Pick<EchoCheck, "best" | "skipped" | "items" | "errors" | "cancelled"> | null,
  state: "idle" | "running" | "done" | "error",
  by: "own" | "team" = "team",
): DrawerOwn {
  const views = sortOwnRows(
    rows.filter((r) => r.characterId === characterId),
    by,
  ).map((v) => ({ ...v, divider: false }));
  const who = characterShortName(characterId);
  let echoLine: string | null = null;
  if (!views.some((v) => v.row.kind === "echoes")) {
    const skipped = check?.skipped.find((s) => s.characterId === characterId);
    // echoCheck pushes "<display name>: <message>"
    const prefix = `${characterDisplayName(characterId)}: `;
    const failed = check?.errors.find((e) => e.startsWith(prefix));
    if (state === "running") echoLine = `Checking your inventory for better echoes for ${who}…`;
    else if (!check) echoLine = `“Check my echoes” on the page re-gears ${who} from your inventory with Build my team's engine.`;
    else if (check.best.includes(characterId)) echoLine = `${who} already wears the best echoes your inventory gives for their plan.`;
    else if (skipped) echoLine = `Build my team could not re-gear ${who}: ${skipped.reason}`;
    else if (failed) echoLine = `The engine could not check ${who}: ${failed.slice(prefix.length)}`;
    else if (check.cancelled) echoLine = `The check was stopped before it reached ${who}.`;
    else echoLine = `${who} was not checked (no best rotation scored yet).`;
  }
  return { views, echoLine };
}
