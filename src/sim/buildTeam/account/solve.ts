// Wuthering Tools+ — "Whole account": share one echo inventory across several teams, never one echo twice.
//
//   1. greedy in priority order (teams by the player's order, members by Riley's share inside each): every member gets
//      the optimizer's exact best build from the echoes nobody before them took;
//   2. local search over conflicts — a pair of members where one holds echoes the other's pool could use:
//      a. re-optimise the pair the other way round (the later member first from everything but the others' echoes,
//         then the earlier one from what is left), and
//      b. the swap pass (allocate.ts `swapPass`: one echo changes hands, the giver backfills),
//      each kept only when the account's weighted value rises, no member loses a build and no ER floor that held is
//      lost — until a round changes nothing or the time budget runs out.
//
// A heuristic: the per-member search is the exact optimizer, the split of the inventory between members is not proven
// optimal. Pure: the optimizer comes in through `AllocationApi` (buildTeam.ts `memberSearchApi` in the app, a fake in
// the tests). Members are indices, echoes ids.
import { better, cancelledError, floorsOf, greedy, hasReuse, swapPass, teamValueOf, type AllocationApi, type Candidate, type SwapMove } from "../allocate";

export interface AccountSolveInput {
  members: number;
  /** greedy priority (indices) */
  order: number[];
  /** per member: account value = Σ weight × value (the app passes team weight ÷ the team's damage today) */
  weights: number[];
  /** per member, the echoes its loosest constraints allow (to find the pairs that compete) */
  pools: ReadonlyArray<ReadonlySet<string>>;
  /** local-search budget in ms (default 60 s); the greedy always runs to the end */
  budgetMs?: number;
  /** rounds of local search at most (default 4) */
  maxRounds?: number;
  /** a move must raise the weighted value by more than this (default 0): the app passes 0.05 % of the account's
   *  weighted damage today, so the search does not move echoes for noise */
  minGain?: number;
  now?: () => number;
  isCancelled?: () => boolean;
  /** "stop improving": ends the local search between moves and keeps the best so far */
  shouldStop?: () => boolean;
  onStep?: (step: AccountStep) => void;
}

export type AccountStep =
  | { phase: "greedy"; member: number; index: number; total: number }
  | { phase: "improve"; kind: "pair" | "swap"; members: [number, number]; round: number; accepted: number };

/** One accepted local-search move. */
export type AccountMove =
  | { kind: "pair"; /** re-optimised first, then `then` */ first: number; then: number; gain: number; round: number }
  | ({ kind: "swap"; round: number } & SwapMove);

export interface AccountSolveResult {
  greedy: { picks: Array<Candidate | null>; value: number; floorsMet: number };
  picks: Array<Candidate | null>;
  value: number;
  floorsMet: number;
  moves: AccountMove[];
  /** why the local search ended: nothing left to improve, the time budget, the player's "stop", the round limit */
  stoppedBy: "converged" | "budget" | "stopped" | "rounds";
  rounds: number;
  /** ordered pairs that competed for echoes at the start (what the local search looks at) */
  conflicts: number;
  ms: number;
}

const EPS = 1e-9;
const filled = (picks: ReadonlyArray<Candidate | null>): number => picks.filter(Boolean).length;

/** The account rule for a local-search move: no echo in two builds, nobody loses their build or an ER floor that held,
 *  and the weighted value rises. (The greedy itself ranks loadouts per member as Build my team does: floor first, then damage.) */
export function acceptMove(next: ReadonlyArray<Candidate | null>, cur: ReadonlyArray<Candidate | null>, weights: readonly number[], minGain = 0): boolean {
  // the plan's promise: never one echo in two builds, whatever a solve handed back
  if (hasReuse(next)) return false;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] && !next[i]) return false;
    if (cur[i]?.meetsFloor && !next[i]?.meetsFloor) return false;
  }
  if (filled(next) < filled(cur) || floorsOf(next) < floorsOf(cur)) return false;
  const vn = teamValueOf(next, weights);
  const vc = teamValueOf(cur, weights);
  return vn > vc * (1 + EPS) + EPS + minGain;
}

/** Ordered pairs (holder, wanter): `holder`'s pick holds an echo `wanter`'s pool allows. */
export function conflictPairs(picks: ReadonlyArray<Candidate | null>, pools: ReadonlyArray<ReadonlySet<string>>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let h = 0; h < picks.length; h++) {
    const held = picks[h]?.ids ?? [];
    if (!held.length) continue;
    for (let w = 0; w < picks.length; w++) if (w !== h && held.some((id) => pools[w]?.has(id))) out.push([h, w]);
  }
  return out;
}

export async function solveAccount(api: AllocationApi, input: AccountSolveInput): Promise<AccountSolveResult> {
  const now = input.now ?? (() => Date.now());
  const t0 = now();
  const n = input.members;
  const weights = Array.from({ length: n }, (_, i) => input.weights[i] ?? 1);
  const check = (): void => {
    if (input.isCancelled?.()) throw cancelledError();
  };
  const position = new Map(input.order.map((m, i) => [m, i]));

  // 1. greedy, priority order
  let index = 0;
  const greedyPicks = await greedy(api, input.order, n, check, (s) => {
    if (s.phase === "member") input.onStep?.({ phase: "greedy", member: s.member, index: index++, total: input.order.length });
  });
  const greedyValue = teamValueOf(greedyPicks, weights);
  let picks = greedyPicks.slice();

  // 2. local search over the pairs that compete, until nothing improves or the budget runs out. The budget is the
  //    local search's own, counted from here: on a slow device the greedy alone can outlast it
  const deadline = now() + (input.budgetMs ?? 60_000);
  const stop: { by: AccountSolveResult["stoppedBy"] } = { by: "converged" };
  const outOfTime = (): boolean => {
    if (input.shouldStop?.()) stop.by = "stopped";
    else if (now() > deadline) stop.by = "budget";
    else return false;
    return true;
  };
  const moves: AccountMove[] = [];
  const conflicts = conflictPairs(picks, input.pools).length;
  const tried = new Set<string>();
  const stateKey = (h: number, w: number): string => `${h}>${w}|${picks.map((p) => (p ? p.ids.join(",") : "-")).join(";")}`;
  const maxRounds = input.maxRounds ?? 4;
  let rounds = 0;
  search: for (let round = 0; round < maxRounds; round++) {
    rounds = round + 1;
    let improved = false;
    // a. pair re-optimisation: the member that wants the echoes goes first. Pairs whose wanter came later in the
    //    greedy first (that is where the greedy's order cost something), then the rest
    const pairs = conflictPairs(picks, input.pools).sort(([h1, w1], [h2, w2]) => {
      const later = (h: number, w: number): number => ((position.get(w) ?? 0) > (position.get(h) ?? 0) ? 0 : 1);
      return later(h1, w1) - later(h2, w2) || (position.get(h1) ?? 0) - (position.get(h2) ?? 0) || (position.get(w1) ?? 0) - (position.get(w2) ?? 0);
    });
    for (const [holder, wanter] of pairs) {
      if (outOfTime()) break search;
      check();
      const key = stateKey(holder, wanter);
      if (tried.has(key)) continue;
      tried.add(key);
      input.onStep?.({ phase: "improve", kind: "pair", members: [holder, wanter], round, accepted: moves.length });
      const others = new Set(picks.flatMap((p, i) => (i === holder || i === wanter ? [] : p?.ids ?? [])));
      const W = await api.solve(wanter, others);
      if (!W) continue;
      const H = W.ids.some((id) => picks[holder]?.ids.includes(id)) || !picks[holder] ? await api.solve(holder, new Set([...others, ...W.ids])) : picks[holder];
      const next = picks.slice();
      next[wanter] = W;
      next[holder] = H ?? null;
      if (!acceptMove(next, picks, weights, input.minGain)) continue;
      const before = teamValueOf(picks, weights);
      picks = next;
      moves.push({ kind: "pair", first: wanter, then: holder, gain: before > 0 ? teamValueOf(picks, weights) / before - 1 : 0, round });
      improved = true;
    }
    // b. the swap pass over the pairs that still compete (one round per local-search round)
    const unordered = new Map<string, [number, number]>();
    for (const [h, w] of conflictPairs(picks, input.pools)) unordered.set(`${Math.min(h, w)}-${Math.max(h, w)}`, [Math.min(h, w), Math.max(h, w)]);
    if (unordered.size && !outOfTime()) {
      const pass = await swapPass(api, picks, weights, {
        maxRounds: 1,
        pairs: [...unordered.values()],
        check,
        shouldStop: outOfTime,
        accept: (next, cur) => acceptMove(next, cur, weights, input.minGain),
        onStep: (s) => {
          if (s.phase === "swap") input.onStep?.({ phase: "improve", kind: "swap", members: s.pair, round, accepted: moves.length });
        },
      });
      if (pass.swaps.length) {
        picks = pass.picks;
        for (const s of pass.swaps) moves.push({ kind: "swap", round, ...s });
        improved = true;
      }
      if (stop.by !== "converged") break;
    }
    if (!improved) break;
    if (round === maxRounds - 1) stop.by = "rounds";
  }

  return {
    greedy: { picks: greedyPicks, value: greedyValue, floorsMet: floorsOf(greedyPicks) },
    picks,
    value: teamValueOf(picks, weights),
    floorsMet: floorsOf(picks),
    moves,
    stoppedBy: stop.by,
    rounds,
    conflicts,
    ms: now() - t0,
  };
}

/** Is `a` at least as good an allocation as `b` by Build my team's order (filled, floors, value)? For the tests. */
export const notWorse = (a: ReadonlyArray<Candidate | null>, b: ReadonlyArray<Candidate | null>, weights: readonly number[]): boolean => !better(b, a, weights);
