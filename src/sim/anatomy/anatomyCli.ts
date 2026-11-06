// Wuthering Tools+ CLI — `anatomy`: the "Why this number" sheet as text, and `--check`, which opens every hit of every
// rotation of every set-up character on an export and counts what reconciles.
import { isSetUp, RANKING_ENEMY } from "../myRankings/rankRoster";
import type { ExportFile } from "../cli/exportFile";
import { hitAnatomy, type HitAnatomy, type HitChoice, type HitKind, type RotationAnatomy } from "./anatomy";
import { movesOf, openRotation, rotationChoices, type Moves } from "./anatomyRun";

export interface AnatomyReport {
  character: string;
  rotation: string;
  enemy: { level: number; resistance: number };
  model: Pick<RotationAnatomy, "average" | "nonCrit" | "crit" | "byAttack" | "byType" | "leftOut" | "reconciled">;
  hit: Omit<HitAnatomy, "note"> & { note: string | null; times: number; share: number };
  moves: Moves;
}

export async function anatomyReport(id: string, exp: ExportFile, options: { rotation?: string; hit?: string } = {}): Promise<AnatomyReport> {
  const characters = exp.characters;
  const echoes = exp.inventory.echoes;
  const choices = await rotationChoices(id, characters, echoes, RANKING_ENEMY);
  if (!choices.length) throw new Error(`No rotation scores for ${id} on this build`);
  const wanted = options.rotation?.toLowerCase();
  const choice = wanted ? choices.find((c) => c.name.toLowerCase().includes(wanted)) : choices[0];
  if (!choice) throw new Error(`No rotation of ${id} matches "${options.rotation}"`);
  const run = await openRotation({ characterId: id, characters, echoes, enemy: RANKING_ENEMY, rotation: choice.rotation });
  const needle = options.hit?.toLowerCase();
  const hit: HitChoice | undefined = needle ? run.model.hits.find((h) => `${h.key} ${h.label}`.toLowerCase().includes(needle)) : run.model.hits[0];
  if (!hit) throw new Error(needle ? `No hit matches "${options.hit}"` : "This rotation does no damage on this build");
  const { average, nonCrit, crit, byAttack, byType, leftOut, reconciled } = run.model;
  return {
    character: id,
    rotation: choice.name,
    enemy: { level: RANKING_ENEMY.enemyLevel, resistance: RANKING_ENEMY.enemyResist },
    model: { average, nonCrit, crit, byAttack, byType, leftOut, reconciled },
    hit: { ...hitAnatomy(hit.line), times: hit.times, share: hit.share },
    moves: await movesOf(run, hit),
  };
}

export interface AnatomyCheck {
  characters: number;
  rotations: number;
  hits: number;
  byKind: Partial<Record<HitKind, number>>;
  /** hits whose factors or crit step don't reconcile, and rotations whose lines don't add up */
  unreconciled: Array<{ character: string; rotation: string; key: string; kind: HitKind; base: boolean; crit: boolean }>;
  rotationsOff: Array<{ character: string; rotation: string; average: number }>;
  /** every hit of each character's best rotation, one step of each factor: how many steps ran, and any that lowered the hit */
  steps: number;
  stepsDown: Array<{ character: string; key: string; step: string; gain: number }>;
}

export async function anatomyCheck(exp: ExportFile): Promise<AnatomyCheck> {
  const characters = exp.characters;
  const echoes = exp.inventory.echoes;
  const out: AnatomyCheck = { characters: 0, rotations: 0, hits: 0, byKind: {}, unreconciled: [], rotationsOff: [], steps: 0, stepsDown: [] };
  for (const id of Object.keys(characters).filter((k) => isSetUp(characters[k])).sort()) {
    let choices;
    try {
      choices = await rotationChoices(id, characters, echoes, RANKING_ENEMY);
    } catch {
      continue; // not a character this app knows
    }
    out.characters += 1;
    for (const [index, choice] of choices.entries()) {
      const run = await openRotation({ characterId: id, characters, echoes, enemy: RANKING_ENEMY, rotation: choice.rotation });
      out.rotations += 1;
      if (index === 0) {
        for (const hit of run.model.hits) {
          const moves = await movesOf(run, hit);
          out.steps += moves.rows.length + moves.flat.length;
          for (const m of moves.rows) if (!(m.hitGain > 0)) out.stepsDown.push({ character: id, key: hit.key, step: m.step, gain: m.hitGain });
        }
      }
      if (!run.model.reconciled) out.rotationsOff.push({ character: id, rotation: choice.name, average: run.model.average });
      for (const hit of run.model.hits) {
        const a = hitAnatomy(hit.line);
        out.hits += 1;
        out.byKind[a.kind] = (out.byKind[a.kind] ?? 0) + 1;
        if (a.kind === "opaque" || !a.baseReconciled || !a.critReconciled) out.unreconciled.push({ character: id, rotation: choice.name, key: hit.key, kind: a.kind, base: a.baseReconciled, crit: a.critReconciled });
      }
    }
  }
  return out;
}
