// Wuthering Tools+ AI tools — the /energy page headless: how much Energy Regen each member needs in a team, measured by
// Riley's engine at the player's account (src/sim/energy/energyCheck.ts), beside the ER their build has in this app.
import { characterFloors, energySummary, measureComposition, memberChecks, NOT_MEASURED_TEXT, teamHaves, type EnergyEngine, type MemberCheck, type TeamMeasure } from "../../energy/energyCheck";
import { showHave, showNeed, TIGHT_MARGIN } from "../../energy/energyNeed";
import { characterName, compactJson, defineTool, int, nullableString, round } from "./shared";
import { rileyOf, rileyTeamTarget, type RileyToolEngine } from "./riley";

const engineOf = (riley: RileyToolEngine): EnergyEngine => ({
  commit: riley.commit,
  teamKeysFor: (ids) => riley.teamKeysFor(ids),
  solveMine: (keys) => riley.solveMine(keys),
  tracedRun: (key, picks) => riley.tracedRun(key, picks),
});

const STATUS_TEXT: Record<string, string> = {
  short: "short",
  tight: `enough, but within ${TIGHT_MARGIN} points`,
  ok: "enough",
  noGate: "no energy gate (the Liberation costs no energy)",
  unknown: "not set up in this app (no build to compare)",
};

function memberRow(c: MemberCheck, teamKey: string): Record<string, unknown> {
  const m = c.member;
  const row: Record<string, unknown> = {
    character: characterName(c.characterId),
    erHavePct: c.have == null ? null : showHave(c.have),
    erNeedPct: c.need == null ? null : showNeed(c.need),
    status: STATUS_TEXT[c.status] ?? c.status,
    needSetBy: m.setBy === "kit" ? `the kit's own floor (the loop alone needs ${m.bar == null ? "none" : `${showNeed(m.bar)} %`})` : m.setBy === "loop" ? `wuwa_calc's loop for this team (${teamKey})` : null,
  };
  if (c.status === "short") Object.assign(row, { shortByPoints: c.short, erRollsShort: c.rolls });
  if (c.buildName) row.build = c.buildName;
  if (!m.owned) row.notOnAccount = `not on your account: wuwa_calc ran them at S${m.sequence} with ${m.weapon} R${m.refinement}`;
  if (m.overcap && m.overcap.share > 0.005) row.damageAtFullCritRatePct = round(m.overcap.share * 100, 1);
  row.teamDpsSharePct = round(m.share * 100, 1);
  return row;
}

function measured(measure: TeamMeasure): string | null {
  return measure.status === "ok" ? null : measure.message || NOT_MEASURED_TEXT[measure.reason];
}

export const energyCheckTool = defineTool<{ team?: string }>({
  name: "energy_check",
  description:
    "The /energy page: how much Energy Regen (ER) each member needs in a team, measured by Riley31415's wuwa_calc engine at the " +
    "player's own account (their sequences, weapons and echoes) — the constant ER at which every Liberation of that team's " +
    "wuwa_calc loop is paid on time, or the kit's own floor when that is higher — beside the ER the build has on the character " +
    "screen in this app (equipment and permanent bonuses; fight buffs are already inside the need). Status: short (with points " +
    "and median ER rolls missing), enough but tight, enough, or no energy gate. A team that is not one of wuwa_calc's current " +
    "compositions, or has an unreleased member, is 'not measured' (no formula stands in). Also each member's share of the " +
    "team's DPS and the share of their damage already at 100 % Crit Rate. team = null checks every saved team and gives each " +
    "character's ER floor (their highest need). A few seconds per team the first time.",
  input_schema: {
    type: "object",
    properties: {
      team: nullableString("A saved team (loose name, id or 1-based index), three characters separated by commas, or a wuwa_calc team key (t269). null = every saved team."),
    },
    required: ["team"],
    additionalProperties: false,
  },
  provenance: "wuwa_calc engine at your account · ER need per team",
  riley: true,
  async run(input, ctx) {
    const riley = await rileyOf(ctx);
    const engine = engineOf(riley);
    const auto = ctx.autoBuffs ?? true;
    if (input.team) {
      const target = await rileyTeamTarget(input.team, ctx.exp, riley);
      const measure = await measureComposition(engine, target.characterIds);
      const why = measured(measure);
      if (why || measure.status !== "ok") {
        return compactJson({ team: target.name, members: target.characterIds.map(characterName), measured: false, why, path: "/energy", label: "Energy check" });
      }
      const haves = await teamHaves((target.saved as { characterIds: Array<string | null>; buildIds?: Array<string | null> } | null) ?? { characterIds: target.characterIds }, ctx.exp.characters, ctx.exp.inventory.echoes, { auto });
      const checks = memberChecks(measure.energy, haves, target.characterIds);
      return compactJson({
        team: target.name,
        saved: !!target.saved,
        measured: true,
        wuwaCalcTeam: measure.energy.teamKey,
        teamDps: int(measure.energy.total),
        members: checks.map((c) => memberRow(c, measure.energy.teamKey)),
        notes: [
          "ER need: the loop's need at your account; ER have: the ER of the build this team runs, plus an always-on inherent the app keeps as a switch (Mornye +10 %), as wuwa_calc counts it — so Mornye's have reads 10 points above this app's build card and Build history. Do not say which figure the game's own screen shows: that is not on record.",
          "teamDps is wuwa_calc's damage per second: compare it only with another DPS, never with a rotation's total damage.",
        ],
        path: "/energy",
        label: "Energy check",
      });
    }
    const saved = (ctx.exp.teams ?? []).filter((t: any) => ((t.characterIds ?? []) as Array<string | null>).filter(Boolean).length > 0);
    const teams: Array<{ id: string; name: string; characterIds: string[]; measure: TeamMeasure; checks: MemberCheck[] | null }> = [];
    for (const t of saved) {
      const ids = ((t.characterIds ?? []) as Array<string | null>).filter((id): id is string => !!id);
      const measure = await measureComposition(engine, ids);
      const checks = measure.status === "ok" ? memberChecks(measure.energy, await teamHaves(t, ctx.exp.characters, ctx.exp.inventory.echoes, { auto }), ids) : null;
      teams.push({ id: String(t.id), name: String(t.name ?? ids.map(characterName).join(" · ")), characterIds: ids, measure, checks });
    }
    const summary = energySummary(teams);
    const floors = [...characterFloors(teams.map((t) => ({ id: t.id, name: t.name, characterIds: t.characterIds, energy: t.measure.status === "ok" ? t.measure.energy : null }))).values()].sort((a, b) => b.need - a.need);
    return compactJson({
      savedTeams: teams.length,
      measured: summary.measured,
      shortCharacters: summary.shortCharacters.map(characterName),
      teams: teams.map((t) => ({
        team: t.name,
        ...(t.checks
          ? {
              members: t.checks.map((c) => ({
                character: characterName(c.characterId),
                erHavePct: c.have == null ? null : showHave(c.have),
                erNeedPct: c.need == null ? null : showNeed(c.need),
                status: STATUS_TEXT[c.status] ?? c.status,
                ...(c.status === "short" ? { erRollsShort: c.rolls } : {}),
              })),
            }
          : { notMeasured: measured(t.measure) }),
      })),
      erFloors: floors.map((f) => ({ character: characterName(f.characterId), erNeedPct: showNeed(f.need), setIn: f.team.name, setBy: f.setBy === "kit" ? "the kit's own floor" : "that team's loop" })),
      notes: ["erFloors: each character's highest need across the saved teams — substat weights count ER up to it."],
      path: "/energy",
      label: "Energy check",
    });
  },
});
