// Wuthering Tools+ — crit luck for the app's own calculator (Ryan's engine): a rotation's attacks as the hits that crit
// or not. Pure.
//
// Each attack of `calcDamages(…).rotations[i].attacks` carries `damage` = { totalDamage (non-crit, every hit of it ×
// its count), critDamage (all of it critting), avgDamage (the blend), instanceDamageEntries (one per hit of the
// talent string, non-crit) }. Its crit chance is the one those three figures imply, so its hits average to its
// `avgDamage` exactly; the hits share the attack's non-crit damage in proportion to their instance figures, and an
// action pressed `count` times rolls each press apart. Skipped the way `aggregateRotationDamage` skips them (an attack
// switched off), so the hits add up to the rotation's `avgDamage`.
import { hitFromFigures, type CritHit } from "./spread";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** More presses than this of one attack are rolled as this many (each the bigger share) — a guard, not a real case. */
const MAX_PRESSES = 200;

export function hitsOfAttack(attack: any): CritHit[] {
  if (!attack || attack.originalIsEnabled === false) return [];
  const d = attack.damage;
  if (!d) return [];
  // a legacy Negative Status figure: damage.damage only, never crits
  if (attack.type === "ElementalEffect" && d.damage !== undefined && d.totalDamage === undefined) {
    const v = Number(d.damage) || 0;
    return v ? [{ n: v, c: v, p: 0 }] : [];
  }
  const avg = Number(d.avgDamage);
  if (!Number.isFinite(avg) || avg === 0) return [];
  const n = Number(d.totalDamage);
  const c = Number(d.critDamage);
  const whole = Number.isFinite(n) && Number.isFinite(c) ? hitFromFigures(n, c, avg) : { n: avg, c: avg, p: 0 };
  const presses = Math.min(MAX_PRESSES, Math.max(1, Math.round(Number(attack.count) || 1)));
  const parts: number[] = ((d.instanceDamageEntries ?? []) as Array<{ damage?: number }>).map((e) => Number(e?.damage) || 0).filter((x) => x > 0);
  const shares = parts.length ? parts : [1];
  const sum = shares.reduce((a, b) => a + b, 0);
  const hits: CritHit[] = [];
  for (let k = 0; k < presses; k++) {
    for (const s of shares) {
      const f = s / sum / presses;
      hits.push({ n: whole.n * f, c: whole.c * f, p: whole.p });
    }
  }
  return hits;
}

/** Every hit of a rotation's attacks, in order. */
export const hitsOfAttacks = (attacks: readonly any[] | null | undefined): CritHit[] => (attacks ?? []).flatMap(hitsOfAttack);
