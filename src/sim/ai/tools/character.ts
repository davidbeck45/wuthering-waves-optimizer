// Wuthering Tools+ AI tools — one character: the calculator page's numbers, the rotations it can be ranked on,
// and hypothetical builds (sequence / weapon / refinement), alone or inside a team.
import type { TeamEnemyConfig } from "../../../calculator/buildCharacterContext";
import { calcCharacter, calcTeam, findTeam } from "../../cli/engine";
import { RANKING_ENEMY, refinementOf, rotationCandidates, scoreRotation, sequenceOf, weaponOptionsFor, whatIf, withSequence, withWeapon } from "../../myRankings/rankRoster";
import { bestRotationFor } from "./memo";
import { characterName, compactJson, defineTool, int, investmentLabel, pct, resolveOwnCharacter, topN, weaponName } from "./shared";

export const enemyLabel = (e: TeamEnemyConfig): string => `Lv ${e.enemyLevel} / ${Math.round(Number(e.enemyResist) * 100)} % RES`;
const RANKING_ENEMY_LABEL = `${enemyLabel(RANKING_ENEMY)} (the ranking target, same as /rankings)`;
const SOURCE_LABEL: Record<string, string> = { yours: "your saved rotation", curated: "curated preset", wuwa_calc: "wuwa_calc loop" };

export const calcCharacterTool = defineTool<{ character: string; include_attacks?: boolean }>({
  name: "calc_character",
  description:
    "The calculator page for one set-up character, from the app's damage engine on their active build: level, sequence, weapon, " +
    "the stat cards (HP, ATK, DEF, Crit Rate, Crit DMG, Energy Regen, DMG bonuses — formatted as the page shows them), the " +
    "strongest single attacks (normal / average / crit damage per hit) and each rotation the player saved, with average damage " +
    "and average DPS when the rotation has a duration. Enemy = the character's own calculator enemy settings (not the ranking " +
    "target) and team buffs = their own Team Buffs panel, so numbers can differ from rank_roster and calc_team. Average damage " +
    "folds crit rate in (normal × (1 − CR) + crit × CR).",
  input_schema: {
    type: "object",
    properties: {
      character: { type: "string", description: "Character name, loose (e.g. \"xuanling\", \"Aemeath\")." },
      include_attacks: { type: "boolean", description: "List up to 20 attacks instead of the top 8. Default false." },
    },
    required: ["character"],
    additionalProperties: false,
  },
  provenance: "App engine · calculator page (your build, your enemy settings)",
  async run(input, ctx) {
    const id = resolveOwnCharacter(input.character, ctx.exp);
    const calc = await calcCharacter(id, ctx.exp, { attacks: true, rotations: true });
    const stats: Record<string, string> = {};
    for (const s of calc.stats) if (s.value !== 0 || ["stat-hp", "stat-atk", "stat-def", "stat-cr", "stat-cd", "stat-er"].includes(s.selector)) stats[s.label] = s.display;
    const attacks = calc.attacks
      .filter((a) => a.avg > 0 || a.healing > 0 || a.shield > 0)
      .sort((a, b) => b.avg - a.avg || b.healing - a.healing);
    const shownAttacks = topN(attacks, input.include_attacks ? 20 : 8);
    const rotations = [...calc.rotations].sort((a, b) => b.avg - a.avg);
    const shownRotations = topN(rotations, 6);
    return compactJson({
      character: characterName(id),
      level: calc.level,
      investment: investmentLabel(calc.sequence, calc.weapon, calc.refinement ?? 1),
      enemy: enemyLabel(calc.enemy),
      stats,
      topAttacks: shownAttacks.items.map((a) => ({
        attack: a.label,
        type: a.type,
        normal: int(a.normal),
        avg: int(a.avg),
        crit: int(a.crit),
        ...(a.healing > 0 ? { healing: int(a.healing) } : {}),
        ...(a.shield > 0 ? { shield: int(a.shield) } : {}),
      })),
      attacksOmitted: shownAttacks.omitted,
      savedRotations: shownRotations.items.map((r) => ({
        rotation: r.name,
        actions: r.actions,
        durationS: r.duration == null ? null : Number(r.duration),
        avg: int(r.avg),
        dps: int(r.dps),
        ...(r.healing > 0 ? { healing: int(r.healing) } : {}),
      })),
      rotationsOmitted: shownRotations.omitted,
      notes: [
        "Damage per hit / per rotation, average = crit rate folded in.",
        calc.rotations.length ? null : "No saved rotations: list_rotations scores curated presets and wuwa_calc loops on this build.",
      ].filter(Boolean),
    });
  },
});

export const listRotationsTool = defineTool<{ character: string }>({
  name: "list_rotations",
  description:
    "Every rotation one set-up character can be scored on — the player's saved rotations, the app's curated presets and Riley31415's " +
    "wuwa_calc loops (S6R5 solves mapped onto this app's attacks) — each scored on the character's real build at the ranking enemy " +
    "(Lv 100 / 20 % RES), best first, with average damage and DPS where the rotation has a duration. This is the character's own " +
    "damage only: team buffs come from their own Team Buffs panel; a support's value to the team is in calc_team.",
  input_schema: {
    type: "object",
    properties: { character: { type: "string", description: "Character name, loose." } },
    required: ["character"],
    additionalProperties: false,
  },
  provenance: "App engine · your build · ranking enemy Lv 100 / 20 % RES",
  async run(input, ctx) {
    const id = resolveOwnCharacter(input.character, ctx.exp);
    const data = ctx.exp.characters[id];
    const candidates = await rotationCandidates(id, data);
    const scored: Array<{ rotation: string; source: string; actions: number; durationS: number | null; avg: number | null; dps: number | null }> = [];
    const failed: Array<{ rotation: string; reason: string }> = [];
    for (const c of candidates) {
      try {
        const s = await scoreRotation(c.rotation, id, ctx.exp.characters, RANKING_ENEMY, ctx.exp.inventory.echoes);
        const d = Number(c.rotation.duration);
        scored.push({ rotation: c.name, source: SOURCE_LABEL[c.source] ?? c.source, actions: c.rotation.actions.length, durationS: Number.isFinite(d) && d > 0 ? d : null, avg: int(s.avgDamage), dps: int(s.dps) });
      } catch (error) {
        failed.push({ rotation: c.name, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    scored.sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    const shown = topN(scored, 12);
    return compactJson({
      character: characterName(id),
      investment: investmentLabel(sequenceOf(data), data.weapon ?? null, refinementOf(data)),
      enemy: RANKING_ENEMY_LABEL,
      rotations: shown.items,
      omitted: shown.omitted,
      failed: failed.slice(0, 5),
      note: candidates.length ? "Rotations without a duration have no DPS; compare them on average damage only when they cover a similar time." : "No rotations to score.",
    });
  },
});

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function resolveWeapon(id: string, input: string): Promise<string> {
  const options = await weaponOptionsFor(id);
  const needle = squash(input);
  const exact = options.filter((w) => squash(w.key) === needle || squash(w.name) === needle);
  if (exact.length) return exact[0].key;
  const partial = options.filter((w) => squash(w.key).includes(needle) || squash(w.name).includes(needle));
  if (partial.length === 1) return partial[0].key;
  if (partial.length > 1) throw new Error(`Ambiguous weapon "${input}": ${partial.map((w) => w.name).join(", ")}`);
  throw new Error(`No weapon "${input}" of ${characterName(id)}'s type. Five-stars: ${options.filter((w) => w.rarity === 5).map((w) => w.name).join(", ")}`);
}

export const whatIfTool = defineTool<{ character: string; sequence?: number; weapon?: string; refinement?: number; team?: string }>({
  name: "what_if",
  description:
    "Scores one hypothetical build of a set-up character — another sequence (S0–S6), another weapon, another refinement (R1–R5), " +
    "or a mix — against the build as it is, on the same rotation. Without `team`: the character's best-scoring rotation at the " +
    "ranking enemy (Lv 100 / 20 % RES), their own damage. With `team` (a saved team containing the character): the whole team " +
    "rotation, buffs derived from the real members, so a support's sequence or weapon shows up in teammates' numbers too. A " +
    "higher sequence turns on each new node's chain entries (a node with mode variants takes its first variant — an estimate). " +
    "Use two calls to compare options (e.g. S1 vs R5 signature).",
  input_schema: {
    type: "object",
    properties: {
      character: { type: "string", description: "Character name, loose." },
      sequence: { type: "integer", enum: [0, 1, 2, 3, 4, 5, 6], description: "Sequence to test (S0–S6). Omit to keep the current one." },
      weapon: { type: "string", description: "Weapon name to test, loose (must fit the character's weapon type). Omit to keep the equipped one." },
      refinement: { type: "integer", enum: [1, 2, 3, 4, 5], description: "Refinement to test (R1–R5) for the tested or equipped weapon. Omit to keep it (a new weapon starts at R1)." },
      team: { type: "string", description: "A saved team (name, id or 1-based index) to score the change on, instead of the character alone." },
    },
    required: ["character"],
    additionalProperties: false,
  },
  provenance: "App engine · hypothetical build vs your build",
  async run(input, ctx) {
    const id = resolveOwnCharacter(input.character, ctx.exp);
    if (input.sequence === undefined && input.weapon === undefined && input.refinement === undefined) {
      throw new Error("Give at least one of sequence, weapon or refinement to test");
    }
    const data = ctx.exp.characters[id];
    const weaponKey = input.weapon !== undefined ? await resolveWeapon(id, input.weapon) : undefined;
    const refinement = input.refinement ?? (weaponKey !== undefined && weaponKey !== data.weapon ? 1 : undefined);
    const current = investmentLabel(sequenceOf(data), data.weapon ?? null, refinementOf(data));

    if (input.team) {
      const team = findTeam(input.team, ctx.exp.teams);
      if (!(team.characterIds ?? []).includes(id)) throw new Error(`${characterName(id)} is not in team "${team.name}"`);
      let hypo = data;
      if (input.sequence !== undefined && input.sequence !== sequenceOf(data)) hypo = await withSequence(id, hypo, input.sequence);
      if (weaponKey !== undefined || refinement !== undefined) hypo = withWeapon(hypo, weaponKey ?? null, refinement);
      const autoBuffs = ctx.autoBuffs ?? true;
      const base = await calcTeam(team, ctx.exp, { autoBuffs });
      const after = await calcTeam(team, { ...ctx.exp, characters: { ...ctx.exp.characters, [id]: hypo } }, { autoBuffs });
      const members = (team.characterIds ?? []).filter(Boolean) as string[];
      return compactJson({
        character: characterName(id),
        current,
        hypothetical: investmentLabel(sequenceOf(hypo), hypo.weapon ?? null, refinementOf(hypo)),
        scoredOn: { team: team.name, members: members.map((m) => characterName(m)), enemy: enemyLabel(base.enemy), buffs: base.buffMode === "auto" ? "derived from the real members" : "each character's own panel" },
        teamAvg: { before: int(base.avg), after: int(after.avg), gainPct: pct(base.avg > 0 ? after.avg / base.avg - 1 : 0) },
        teamDps: base.dps != null && after.dps != null ? { before: int(base.dps), after: int(after.dps) } : null,
        perMember: members.map((m) => {
          const b = base.perCharacter[m]?.avg ?? 0;
          const a = after.perCharacter[m]?.avg ?? 0;
          return { character: characterName(m), before: int(b), after: int(a), gainPct: pct(b > 0 ? a / b - 1 : 0) };
        }),
      });
    }

    const best = await bestRotationFor(id, ctx.exp);
    const r = await whatIf(id, ctx.exp.characters, ctx.exp.inventory.echoes, best.candidate.rotation, { sequence: input.sequence, weapon: weaponKey, refinement });
    const hypoLabel = (() => {
      const seq = input.sequence ?? sequenceOf(data);
      const w = weaponKey ?? data.weapon ?? null;
      const ref = refinement ?? (w === data.weapon ? refinementOf(data) : 1);
      return investmentLabel(seq, w, ref);
    })();
    return compactJson({
      character: characterName(id),
      current,
      hypothetical: hypoLabel,
      scoredOn: { rotation: r.rotation, source: SOURCE_LABEL[best.candidate.source] ?? best.candidate.source, enemy: RANKING_ENEMY_LABEL },
      avg: { before: int(r.base), after: int(r.avgDamage), gainPct: pct(r.gain) },
      notes: [
        "The character's own damage on one rotation; buffs they give teammates are not in it — pass `team` for that.",
        weaponKey && weaponKey !== data.weapon ? `${weaponName(weaponKey)} is tested at R${refinement ?? 1} (pass refinement for another rank).` : null,
      ].filter(Boolean),
    });
  },
});
