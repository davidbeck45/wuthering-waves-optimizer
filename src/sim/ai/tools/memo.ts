// Wuthering Tools+ AI tools — memoised slow work, keyed by a fingerprint of the account so an edit between
// questions never reads a stale number. The roster ranking scores every rotation of every set-up character
// plus every team and takes seconds; several tools (rank_roster, what_if, substat_weights) reuse it.
import { RANKING_ENEMY, rankRoster, rotationCandidates, scoreRotation, type RosterRanking, type RotationCandidate } from "../../myRankings/rankRoster";
import type { ExportFile } from "../../cli/exportShape";
import { accountFingerprint } from "./shared";

const MAX_ENTRIES = 4;
const rankMemo = new Map<string, Promise<RosterRanking>>();
const bestMemo = new Map<string, Promise<BestRotation>>();

function remember<T>(memo: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit) return hit;
  const p = make();
  p.catch(() => memo.delete(key)); // a failure is not cached
  memo.set(key, p);
  while (memo.size > MAX_ENTRIES) memo.delete(memo.keys().next().value as string);
  return p;
}

const inBrowser = (): boolean => typeof window !== "undefined";

/** The /my-rankings computation (with the next-sequence and R5 estimates), once per account state. */
export function rankingFor(exp: ExportFile, autoBuffs = true): Promise<RosterRanking> {
  return remember(rankMemo, `${accountFingerprint(exp)}:${autoBuffs ? 1 : 0}`, () =>
    rankRoster(exp.characters, exp.inventory.echoes, exp.teams, { investment: true, autoTeamBuffs: autoBuffs, yieldToUi: inBrowser() }),
  );
}

export interface BestRotation {
  candidate: RotationCandidate;
  avgDamage: number;
  dps: number | null;
}

/** The character's best-scoring rotation on their build at the ranking enemy (the same pick /my-rankings makes). */
export function bestRotationFor(id: string, exp: ExportFile): Promise<BestRotation> {
  return remember(bestMemo, `${accountFingerprint(exp)}:${id}`, async () => {
    const data = exp.characters[id];
    if (!data) throw new Error(`${id} is not set up in this account`);
    const candidates = await rotationCandidates(id, data);
    if (!candidates.length) throw new Error(`${id} has no rotation to score: save one in the calculator, or import a wuwa_calc loop`);
    let best: BestRotation | null = null;
    for (const candidate of candidates) {
      try {
        const s = await scoreRotation(candidate.rotation, id, exp.characters, RANKING_ENEMY, exp.inventory.echoes);
        if (!best || s.avgDamage > best.avgDamage) best = { candidate, avgDamage: s.avgDamage, dps: s.dps };
      } catch {
        /* an action this build cannot run: not a candidate */
      }
    }
    if (!best) throw new Error(`None of ${id}'s ${candidates.length} rotations runs on this build`);
    return best;
  });
}

/** Test hook / "new chat": forget every memoised result. */
export function clearToolMemo(): void {
  rankMemo.clear();
  bestMemo.clear();
}
