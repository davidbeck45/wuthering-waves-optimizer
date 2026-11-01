// Wuthering Tools+ AI tools — a team as Riley31415's wuwa_calc engine plays it at the player's account (the Riley run
// seam, Wave 0): the /rotation page's cue card as text (what to press, swap by swap), and the /build-team page's plan
// (which sets, main echo and main stats each member should wear) as a dry run that never writes a build.
import { bestOf, type MineSolve } from "../../engine/rileyRun";
import { cuePlan } from "../../rotation/cueModel";
import { chipText } from "../../rotation/exportText";
import { extractRotation, type Visit } from "../../rotation/extract";
import { rotationPath } from "../../rotation/hash";
import { plansForTeam, type RileySource } from "../../buildTeam/plans";
import { constraintsOf, DEFAULT_OPTIONS, filterPool, shortfallOf } from "../../buildTeam/constraints";
import { LAYOUT_COSTS, type MemberPlan } from "../../buildTeam/rileyPlan";
import { showNeed } from "../../energy/energyNeed";
import { characterName, compactJson, defineTool, echoName, int, round, setName, statLabel, type ToolContext } from "./shared";
import { rileyOf, rileyTeamTarget, type RileyToolEngine, type TeamTarget } from "./riley";

/** The composition's best `mine` row, or a sentence saying why there is none. */
async function bestRow(riley: RileyToolEngine, target: TeamTarget): Promise<{ solve: MineSolve | null; why: string | null }> {
  if (target.characterIds.length !== 3) return { solve: null, why: "a team needs three members" };
  const keys = await riley.teamKeysFor(target.characterIds);
  if (!keys.length) return { solve: null, why: "not one of wuwa_calc's current compositions, so it has no wuwa_calc rotation" };
  const solves = await riley.solveMine(keys);
  const best = bestOf(solves);
  if (best?.best) return { solve: best, why: null };
  const hidden = solves.find((s) => s.reason === "notInApp");
  if (hidden) return { solve: null, why: `has ${(hidden.notInApp ?? []).map(characterName).join(" and ") || "a character"}, not released in this app yet` };
  if (solves.length && solves.every((s) => s.reason === "noBuild")) return { solve: null, why: "wuwa_calc's loop for it needs a higher sequence than your account has" };
  return { solve: null, why: `wuwa_calc could not run it${solves.find((s) => s.message)?.message ? `: ${solves.find((s) => s.message)!.message}` : ""}` };
}

const READY: Record<string, string> = { energy: "Liberation ready", concerto: "Outro ready", tune: "Tune Break" };

export const teamRotationTool = defineTool<{ team: string }>({
  name: "team_rotation",
  description:
    "The /rotation page's cue card as text: how to play a team, swap by swap, from Riley31415's wuwa_calc engine run at the " +
    "player's own account (their sequences, weapons, echoes). One line per time on field — the buttons in order (BA = basic " +
    "attack, HA = heavy, E = Resonance Skill, R = Liberation, Intro / Outro, Echo, Plunge, ×3 = repeats, [jump] / [dodge] / " +
    "[swap] = the cancel it ends on) and the seconds on field — grouped as the opener and the loop (identical loops folded, " +
    "×N), with the moments a Liberation, an Outro or a Tune Break becomes ready. Frame-tight timing: real play is slower. Also " +
    "the team's wuwa_calc DPS and each member's share. Only wuwa_calc's compositions have a rotation here.",
  input_schema: {
    type: "object",
    properties: {
      team: { type: "string", description: "A saved team (loose name, id or 1-based index), three characters separated by commas, or a wuwa_calc team key (t269)." },
    },
    required: ["team"],
    additionalProperties: false,
  },
  provenance: "wuwa_calc engine at your account · rotation cue card",
  riley: true,
  async run(input, ctx: ToolContext) {
    const riley = await rileyOf(ctx);
    const target = await rileyTeamTarget(input.team, ctx.exp, riley);
    const { solve, why } = await bestRow(riley, target);
    if (!solve?.best) return compactJson({ team: target.name, members: target.characterIds.map(characterName), rotation: null, why, path: "/rotation", label: "Rotations" });
    const run = await riley.tracedRun(solve.teamKey, solve.best.picks);
    const model = extractRotation(run);
    const plan = cuePlan(model);
    const names = run.members.map((m) => characterName(m.appKey));
    const line = (v: Visit): string => {
      const ready = [...new Set(v.checkpoints.map((c) => READY[c.kind]).filter(Boolean))];
      return `${names[v.member]}: ${v.chips.map((c) => chipText(c)).join(" › ")} · ${v.seconds.toFixed(1)} s${ready.length ? ` (${ready.join(", ")})` : ""}`;
    };
    return compactJson({
      team: target.name,
      wuwaCalcTeam: solve.teamKey,
      teamDps: int(run.total),
      fightSeconds: round(plan.fightSeconds, 1),
      members: run.members.map((m, i) => ({
        character: names[i],
        gear: `S${m.sequence} · ${m.weapon} R${m.refinement} · ${m.echo}`,
        dpsSharePct: round(m.share * 100, 1),
        ...(m.owned ? {} : { notOnAccount: true }),
      })),
      blocks: plan.blocks.map((b) => ({
        block: b.title,
        ...(b.repeat > 1 ? { repeats: b.repeat } : {}),
        seconds: round(b.seconds, 1),
        swaps: b.visits.map(line),
      })),
      ...(plan.wrap ? { then: `${names[plan.wrap.member]} again: the loop starts over` } : {}),
      notes: ["Seconds are frame-tight (every cancel on its earliest frame). teamDps is wuwa_calc's DPS: compare only with another DPS."],
      path: rotationPath({ kind: "team", teamKey: solve.teamKey, rowKey: solve.best.rowKey, picks: solve.best.picks }),
      label: "Rotation cue card",
    });
  },
});

const SOURCE_TEXT: Record<MemberPlan["source"], string> = {
  riley: "wuwa_calc's best pick at your account",
  preset: "the app's curated echo preset",
  current: "the build they wear now",
  none: "nothing to go on",
};

const COUNT_STAT = (key: string): string => statLabel(key) ?? key;

/** One member of build_team_plan's answer. `fittingEchoes` only when the plan narrows the pool (sets, a cost layout or
 *  main stats): a plan with none of them would count the whole inventory as fitting, which reads as a match it isn't. */
export function memberPlanSummary(p: MemberPlan, echoes: Parameters<typeof filterPool>[0]) {
  const c = constraintsOf(p, DEFAULT_OPTIONS);
  const constrained = c.allowedSets != null || c.layout != null || c.mainStatsByCost != null;
  const { pool } = filterPool(echoes, c);
  const short = shortfallOf(pool, c);
  return {
    character: characterName(p.characterId),
    planFrom: SOURCE_TEXT[p.source],
    ...(p.share != null ? { dpsSharePct: round(p.share * 100, 1) } : {}),
    sets: p.sets.length ? p.sets.map((s) => `${setName(s.key)} ${s.pieces}pc`).join(" + ") : p.setsLabel || null,
    mainEcho: p.mainEcho ? (echoName(p.mainEcho.keys[0]) ?? p.mainEcho.name) : null,
    layout: p.mainStats ? p.mainStats.layout : null,
    mainStats: p.mainStats ? p.mainStats.slots.map((k, i) => `${LAYOUT_COSTS[p.mainStats!.layout][i]}-cost ${COUNT_STAT(k)}`) : null,
    erNeedPct: p.erNeed == null ? null : showNeed(p.erNeed),
    ...(p.erSetBy === "kit" ? { erSetBy: "the kit's own floor" } : {}),
    ...(constrained ? { fittingEchoes: pool.length } : {}),
    ...(short.length ? { cantFill: short.map((s) => `${s.need} × ${s.cost}-cost${s.stats.length ? ` (${s.stats.map(COUNT_STAT).join(" / ")})` : ""}: ${s.have} distinct echoes fit`) } : {}),
    ...(p.unmapped.length ? { unmapped: p.unmapped } : {}),
  };
}

export const buildTeamPlanTool = defineTool<{ team: string }>({
  name: "build_team_plan",
  description:
    "The /build-team page's plan, as a dry run that never creates or changes a build: what each member of a team should " +
    "wear — the sonata sets with piece counts, the main echo, the cost layout (43311 = 4-3-3-1-1) and the main stat per slot, " +
    "and the Energy Regen they need — from Riley31415's wuwa_calc best pick at the player's account (else the app's curated " +
    "echo preset), plus how many echoes in the player's inventory fit that plan (sets, costs, main stats) and which cost " +
    "slots the inventory can't fill. Also wuwa_calc's team DPS today and in its High Invest spread. It does not pick the " +
    "echoes: that is the page's Build step (no echo used twice in the team, a preview and a confirm before anything is saved).",
  input_schema: {
    type: "object",
    properties: {
      team: { type: "string", description: "A saved team (loose name, id or 1-based index), three characters separated by commas, or a wuwa_calc team key (t269)." },
    },
    required: ["team"],
    additionalProperties: false,
  },
  provenance: "wuwa_calc engine at your account · build plan (dry run)",
  riley: true,
  async run(input, ctx: ToolContext) {
    const riley = await rileyOf(ctx);
    const target = await rileyTeamTarget(input.team, ctx.exp, riley);
    const source: RileySource = {
      teamKeysFor: (ids) => riley.teamKeysFor(ids),
      solveMine: (keys, subs) => riley.solveMine(keys, { subs: subs ?? "mine" }),
      tracedRun: (key, picks) => riley.tracedRun(key, picks),
    };
    const plans = await plansForTeam(target.characterIds, source);
    const echoes = ctx.exp.inventory.echoes ?? [];
    const members = plans.plans.filter(Boolean).map((p) => memberPlanSummary(p, echoes));
    const saved = target.saved?.id != null ? `?team=${encodeURIComponent(String(target.saved.id))}` : `?members=${target.characterIds.map(encodeURIComponent).join(",")}`;
    return compactJson({
      team: target.name,
      ...(plans.rileyNote ? { note: plans.rileyNote } : {}),
      wuwaCalcTeam: plans.riley?.teamKey ?? null,
      teamDpsToday: int(plans.dpsMine),
      teamDpsHighInvest: int(plans.dpsHigh),
      members,
      notes: [
        "fittingEchoes counts the inventory's echoes of the plan's sets, costs and main stats for that member alone (absent when the plan names none of them); teammates share the pool, and the page's Build step gives no echo to two of them.",
        "teamDps figures are wuwa_calc's DPS at your account (today's echoes, and his High Invest substats): compare only with another DPS.",
      ],
      path: `/build-team${saved}`,
      label: "Build my team",
    });
  },
});
