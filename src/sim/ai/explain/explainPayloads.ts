// Wuthering Tools+ AI — what each page's "Explain" button sends through useAssistant().explain(): the chip's title,
// the question, and the numbers on screen as labelled JSON. Every number says what it is and what it was measured
// against (whose engine, which enemy, per rotation or per second), so Claude never guesses a unit and never mixes this
// app's damage per rotation with Riley's DPS. Pure: type imports from the features, plus the display names.
import { characterDisplayName, weaponDisplayName } from "../../display/names";
import { parsePresetName } from "../../presets/presetName";
import { teamTitle } from "../../display/teamName";
import type { CharacterRank, RotationScore, TeamRank } from "../../myRankings/rankRoster";
import type { UpgradeView } from "../../myRankings/rows";
import type { TeamView } from "../../energy/useEnergyNeeds";
import type { CharacterWeaponValue, ValueOption } from "../../weaponValue/weaponValue";
import type { CandidateTeam, FloorResult } from "../../endgame/toaRun";
import { floorOdds } from "../../critLuck/floorOdds";
import type { ToaFloor } from "../../endgame/toaData";

export interface ExplainRequest {
  /** the attachment chip ("Aemeath on My roster rankings") */
  title: string;
  question: string;
  data: Record<string, unknown>;
}

/** How this app's own numbers are measured (/my-rankings, /account, /weapons). */
export const APP_ENGINE_NOTE =
  "Wuthering Tools+ damage engine on the player's own builds (weapon, echoes, sequences, buffs); average damage per rotation against a level-100 enemy with 20 % resistance, the /my-rankings target. Damage per second only where the rotation has a duration.";
/** How Riley31415's wuwa_calc numbers are measured (/energy, /endgame). */
export const RILEY_ENGINE_NOTE =
  "Riley31415's wuwa_calc engine, a frame-timed run of the team at the player's own account (their sequences, weapons and echoes). Its figures are damage per second (DPS); never compare them with this app's damage per rotation.";

const round = (n: number | null | undefined): number | null => (n == null || !Number.isFinite(n) ? null : Math.round(n));
/** 0.1234 → 12.3 (a percentage with one decimal) */
const percent = (g: number | null | undefined, digits = 1): number | null => (g == null || !Number.isFinite(g) ? null : Math.round(g * 100 * 10 ** digits) / 10 ** digits);
const one = (n: number | null | undefined): number | null => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const name = (id: string | null | undefined): string => (id ? characterDisplayName(id) || id : "");
const weaponName = (key: string | null | undefined): string | null => (key ? weaponDisplayName(key) || key : null);

/** A generated rotation / team name as its short title, with the full stored name beside it when they differ. */
function rotationName(full: string | null | undefined): { title: string; "stored name"?: string } {
  const parsed = parsePresetName(full ?? "");
  const title = parsed.title || String(full ?? "");
  return title && title !== full ? { title, "stored name": String(full) } : { title };
}

function sourceWord(source: string): string {
  return source === "yours" ? "a team the player saved" : source === "curated" ? "a curated preset of this app" : source === "wuwa_calc" ? "a wuwa_calc stock preset" : source;
}

// ── /my-rankings: a character row ─────────────────────────────────────────────────────────────

export function explainCharacterRank(c: CharacterRank, opts: { rank: number; of: number; upgrade?: UpgradeView | null }): ExplainRequest {
  const who = name(c.id) || c.name;
  const others = [...c.rotations]
    .filter((r) => r !== c.best)
    .sort((a, b) => b.avgDamage - a.avgDamage)
    .slice(0, 5)
    .map((r: RotationScore) => ({ ...rotationName(r.name), source: sourceWord(r.source), "average damage per rotation": round(r.avgDamage) }));
  const estimate = (d: CharacterRank["nextSequence"], what: string) =>
    d ? { what, "average damage per rotation": round(d.avgDamage), "gain over today (%)": percent(d.gain) } : null;
  return {
    title: `${who} on My roster rankings`,
    question: `Explain ${who}'s ranking on my account: what drives this damage, how it compares with my other characters, and what would raise it most?`,
    data: {
      page: "/my-rankings (My roster rankings)",
      measured: APP_ENGINE_NOTE,
      character: who,
      sequence: `S${c.sequence}`,
      weapon: c.weapon ? `${weaponName(c.weapon)} R${c.refinement}` : "none equipped",
      "damage rank on this account": `${opts.rank} of ${opts.of}`,
      "best rotation": c.best ? { ...rotationName(c.best.name), source: sourceWord(c.best.source) } : null,
      "average damage per rotation": round(c.best?.avgDamage),
      "non-crit damage per rotation": round(c.best?.normalDamage),
      "damage per rotation if every hit crits": round(c.best?.critDamage),
      "damage per second": round(c.best?.dps),
      "rotations tried on this build": c.rotationsEvaluated,
      "next best rotations": others,
      "next sequence (estimate on the best rotation)": c.sequence >= 6 ? "already S6" : estimate(c.nextSequence, `S${c.sequence + 1}`),
      "weapon at R5 (estimate on the best rotation)": c.refinement >= 5 ? "already R5" : estimate(c.refineFive, "the same weapon at R5"),
      "best upgrade shown": opts.upgrade?.maxed ? "maxed (S6 with the weapon at R5)" : opts.upgrade?.best ? `${opts.upgrade.best.label} ${percent(opts.upgrade.best.gain)} %` : null,
      problems: c.errors.length ? c.errors.slice(0, 5) : undefined,
    },
  };
}

// ── /my-rankings team rows and the /account hero ─────────────────────────────────────────────

export function explainTeamRank(
  t: TeamRank & { duplicates?: TeamRank[] },
  opts: { rank: number; of: number; page: "my-rankings" | "account" },
): ExplainRequest {
  const members = t.characterIds.map((id, i) => ({ id, value: Math.max(0, t.perSlot[i] ?? 0) }));
  const total = members.reduce((n, m) => n + m.value, 0);
  const title = rotationName(t.name);
  const where = opts.page === "account" ? "My account" : "My roster rankings";
  const lead = opts.page === "account" ? "my best team" : `the team "${title.title}"`;
  return {
    title: `${opts.page === "account" ? "Best team" : "Team"} · ${t.characterIds.map(name).join(" + ")} on ${where}`,
    question: `Explain ${lead}: why does it score this much per rotation, who carries it, and what would raise it most?`,
    data: {
      page: opts.page === "account" ? "/account (My account: the best team the player can field)" : "/my-rankings (My roster rankings: teams)",
      measured: APP_ENGINE_NOTE,
      team: title,
      source: sourceWord(t.source),
      "rank among the teams the player can field": `${opts.rank} of ${opts.of}`,
      "team average damage per rotation": round(t.avgDamage),
      "team damage per second": round(t.dps),
      members: members.map((m) => ({
        character: name(m.id),
        "average damage per rotation": round(m.value),
        "share of the team's damage (%)": total > 0 ? one((m.value / total) * 100) : null,
      })),
      "members without a weapon (their part understates)": t.unarmed.length ? t.unarmed.map(name) : undefined,
      "identical presets folded into this row": t.duplicates?.length ? t.duplicates.map((d) => rotationName(d.name).title) : undefined,
    },
  };
}

// ── /energy: a team's Energy Regen needs ─────────────────────────────────────────────────────

const STATUS_WORDS: Record<string, string> = {
  short: "short of the need",
  tight: "within 5 points of the need",
  ok: "the need is met",
  noGate: "the Liberation costs no energy in this loop",
  unknown: "no build in this app to read",
};

/** Null until the team is measured and the builds' ER is read. */
export function explainEnergyTeam(view: TeamView): ExplainRequest | null {
  if (!view.checks || !view.energy) return null;
  const e = view.energy;
  return {
    title: `Energy Regen needs · ${view.characterIds.map(name).join(" + ")}`,
    question: `Explain the Energy Regen needs of my team "${teamTitle(view.name, view.characterIds)}": who is short or tight, why that member needs that much, and the cheapest way to close the gap?`,
    data: {
      page: "/energy (Energy check)",
      measured: `${RILEY_ENGINE_NOTE} The need is the constant Energy Regen at which every Liberation of this team's wuwa_calc loop is paid on time; "kit floor" means the character's own minimum, not a loop result. The have is the character screen's Energy Regen of the build the team runs in this app, plus an always-on inherent the app keeps as a switch (Mornye +10 %), as wuwa_calc counts it, so Mornye's have reads 10 points above this app's build card and Build history. Do not say which figure the game's own screen shows: that is not on record.`,
      team: rotationName(view.name),
      "wuwa_calc team": e.teamKey,
      "team DPS in wuwa_calc": round(e.total),
      "fight length (s)": one(e.seconds),
      "loadout variants compared": e.variants,
      members: view.checks.map((c) => ({
        character: name(c.characterId),
        role: c.member.mainDps ? "main DPS" : "support",
        build: c.buildName ?? "active build",
        "Energy Regen the build has (%)": one(c.have),
        "Energy Regen the loop needs (%)": one(c.need),
        "need set by": c.member.setBy === "kit" ? "the kit's own floor" : c.member.setBy === "loop" ? "this team's loop" : null,
        status: STATUS_WORDS[c.status] ?? c.status,
        "points short": one(c.short) ?? 0,
        "median Energy Regen rolls that close it": c.rolls || 0,
        "Liberation cost (energy)": one(c.member.cost),
        "share of the team's DPS (%)": percent(c.member.share),
        "score multiplier while short": c.factor < 1 ? Math.round(c.factor * 1000) / 1000 : undefined,
      })),
    },
  };
}

// ── /endgame: a floor's verdict ──────────────────────────────────────────────────────────────

/** the card's own clock (endgame/crests.ts `clockText`, not imported: it pulls the season data in): 59.6 s → "1:00", not "0:60" */
const clock = (s: number | null): string | null => {
  if (s == null || !Number.isFinite(s)) return null;
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function explainToaFloor(input: {
  floor: ToaFloor;
  towerName: string;
  rows: Array<{ result: FloorResult; team: CandidateTeam }>;
  /** each HP segment's resistances, weakest first (the card's RES lines) */
  res: Array<{ label: string; res: Array<{ el: string; v: number }> }>;
  /** the floor's effects as the card shows them */
  effects: Array<{ label: string; fidelity: string; text: string }>;
  /** the player's logged pace on a team (their time ÷ the sim's), null where none */
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  paceOf?: (teamId: string) => number | null;
  top?: number;
}): ExplainRequest {
  const { floor, towerName } = input;
  const top = input.rows.slice(0, input.top ?? 5);
  const goals = [...floor.goals].sort((a, b) => a - b);
  // crit luck: each hit crits or not, so real runs land either side of the average kill (src/sim/critLuck/)
  const luck = (result: FloorResult): Record<string, unknown> => {
    const o = result.error ? null : floorOdds(floor.goals, result.odds);
    return o ? { "runs that clear (crit luck)": o.clearText, "runs that earn each crest (crit luck)": Object.fromEntries(o.crests.map((c) => [`${c.crest} crest${c.crest > 1 ? "s" : ""}`, c.text])) } : {};
  };
  return {
    title: `${towerName} floor ${floor.floor} · Tower of Adversity`,
    question: `Explain the clear check for ${towerName} floor ${floor.floor}: how many crests my best teams get, what decides the kill time, and what would get me more crests?`,
    data: {
      page: "/endgame (Tower of Adversity clear check)",
      measured: `${RILEY_ENGINE_NOTE} Simulated with perfect execution on one target: no dodging, phases or invulnerable windows; waves are summed as one HP pool. A kill time past the ~100 s run is extrapolated at the last loop's DPS. The game's countdown is 300 s; crest goals are seconds LEFT on it.`,
      floor: `${towerName} ${floor.floor}`,
      "enemy level": floor.level,
      "Vigor per resonator": floor.cost,
      HP: round(floor.hp),
      "HP counting every enemy": floor.hpType === "adjusted" ? round(floor.hpRaw) : undefined,
      enemies: floor.enemies.map((e) => ({ name: e.name, count: e.count, HP: round(e.hp) })),
      "resistances (%)": input.res.map((seg) => ({ enemy: seg.label, ...Object.fromEntries(seg.res.map((r) => [r.el, r.v])) })),
      effects: input.effects.map((c) => ({ effect: c.label, "in the sim": c.fidelity === "exact" ? "modelled" : c.fidelity === "approx" ? "approximated" : "not modelled", "game text": c.text })),
      "crest goals (seconds left)": { "1 crest": goals[0] ?? 0, "2 crests": goals[1] ?? 0, "3 crests": goals[2] ?? 0 },
      "teams timed (best first)": top.map((r) => {
        const pace = input.paceOf?.(r.team.id) ?? null;
        return {
          team: r.team.appKeys.map(name).join(" + "),
          "player's saved team": r.team.saved ?? undefined,
          "team DPS in wuwa_calc (standard enemy)": round(r.team.dps),
          "DPS on this floor (HP ÷ kill time)": round(r.result.dps),
          "kill time (m:ss used)": r.result.error ? null : r.result.seconds === null ? "over 5:00" : clock(r.result.seconds),
          crests: r.result.error ? null : r.result.crests,
          extrapolated: r.result.extrapolated || undefined,
          "player's own pace (× the sim)": pace ? Math.round(pace * 100) / 100 : undefined,
          ...luck(r.result),
          "engine error": r.result.error,
        };
      }),
      "teams timed in all": input.rows.length,
    },
  };
}

// ── /weapons: a character's weapon options ───────────────────────────────────────────────────

function option(o: ValueOption): Record<string, unknown> {
  return {
    weapon: o.label,
    "own average damage per rotation": round(o.avgDamage),
    "own gain vs today (%)": percent(o.gain, 2),
    "own gain with the weapon's stats only, passives off (%)": o.low ? percent(o.low.gain, 2) : undefined,
    "team average damage per rotation": o.team ? round(o.team.avgDamage) : undefined,
    "team gain vs today (%)": o.team ? percent(o.team.gain, 2) : undefined,
    "why no team figure": o.team ? undefined : (o.teamNote ?? undefined),
    "teammates' team-buff panels assumed to follow the weapon": o.panels.length ? o.panels.map((p) => name(p.member)) : undefined,
  };
}

export function explainWeaponValue(row: CharacterWeaponValue, scope: "team" | "own"): ExplainRequest {
  const who = name(row.id) || row.name;
  const held = row.current.weaponKey ? `${weaponName(row.current.weaponKey)} R${row.current.refinement}` : "no weapon";
  return {
    title: `${who}'s weapon options · Weapon value`,
    question: `Explain ${who}'s weapon options: is the signature worth it on my account, and how do the refinements and the alternatives compare${scope === "team" ? " for the team" : ""}?`,
    data: {
      page: "/weapons (Weapon value)",
      measured: `${APP_ENGINE_NOTE} A weapon the character does not hold runs its passives at full stacks; the held weapon refined runs on the player's own passive settings. Team figures re-run the strongest team they can field with the weapon in hand.`,
      "view shown": scope === "team" ? "team gain" : "own gain",
      character: who,
      "weapon now": held,
      "best rotation": rotationName(row.current.rotation),
      "own average damage per rotation now": round(row.current.avgDamage),
      "damage per second now": round(row.current.dps),
      "team the team figures use": row.team ? { team: rotationName(row.team.name).title, members: row.team.characterIds.map(name), "team average damage per rotation now": round(row.team.base) } : (row.teamNote ?? "none the player can field"),
      signature: {
        weapon: weaponName(row.signature.key),
        status: { swap: "not held", held: "held below R5", maxed: "held at R5", none: "the kit names no signature", "not-in-app": "not in this app yet" }[row.signature.status],
        steps: row.signature.steps.map(option),
      },
      "the held weapon one refinement up": row.refine ? option(row.refine) : undefined,
      "standard 5★ weapons at R1": row.standard.length ? row.standard.map(option) : undefined,
      "best 4★ at R5": row.four ? option(row.four) : undefined,
      note: row.note ?? undefined,
    },
  };
}
