// Wuthering Tools+ — "Build it for me": share one echo inventory across a team, never one echo twice.
//
// Greedy in priority order (the main DPS first, by Riley's `bySlot` share): each member gets the optimizer's best
// loadout from what the members before them left. With few members (a team is three) every order is tried and the
// best team kept. Then a swap pass: a member takes one echo from a teammate, who takes back either the echo given up
// or the best free echo for that slot; a move is kept only when the team value rises and no ER floor is lost.
// Greedy, not optimal — the page says "priority order" and lets the player reorder.
//
// Pure: the optimizer and the scorer come in through `AllocationApi` (headlessOptimizer.ts in the app, a fake in
// the tests). Members are indices; echoes are ids.

export interface Candidate {
  /** echo ids in slot order, slot 0 the main echo */
  ids: string[];
  /** the member's objective (damage on their rotation) */
  value: number;
  /** their Energy Regen as the floor reads it (%), null when unknown */
  er: number | null;
  /** at or above their ER floor (true when they have none) */
  meetsFloor: boolean;
  /** the caller's own bookkeeping (which constraint level found it); a swap keeps the pick's */
  meta?: Record<string, unknown>;
}

export interface AllocationApi {
  /** the best loadout for `member` with the `taken` echoes unavailable; null when none is possible */
  solve(member: number, taken: ReadonlySet<string>): Promise<Candidate | null>;
  /** scores loadouts for `member`, same units as `solve`; null for one that cannot be scored */
  score(member: number, loadouts: string[][]): Promise<Array<Candidate | null>>;
  /** may echo `id` stand in slot `slot` of `member`'s current pick (cost, set, main stat, species rules) */
  legal(member: number, slot: number, id: string, pick: Candidate): boolean;
  /** unused echoes that may fill slot `slot` of `member`'s current pick, best guesses first (the backfill) */
  free?(member: number, slot: number, pick: Candidate, used: ReadonlySet<string>): string[];
}

export interface AllocationInput {
  /** member count */
  members: number;
  /** priority order (indices) */
  order: number[];
  /** team value = Σ weight × value; 1 each when the values share a unit (a team rotation's slots) */
  weights: number[];
  /** try every order (≤ 3 members: six) and keep the best */
  allOrders?: boolean;
  /** swap-pass rounds (each round applies the best move of every pair) */
  maxSwapRounds?: number;
  isCancelled?: () => boolean;
  /** progress: which phase, and which order / pair */
  onStep?: (step: AllocationStep) => void;
}

export type AllocationStep =
  | { phase: "order"; order: number[]; index: number; total: number }
  | { phase: "member"; member: number; order: number[] }
  | { phase: "swap"; round: number; pair: [number, number] };

export interface SwapMove {
  /** the member who took an echo, and from whom */
  taker: number;
  giver: number;
  takerSlot: number;
  giverSlot: number;
  /** the echo that changed hands, and what the giver wears in its place */
  echo: string;
  backfill: string;
  /** relative team-value gain of the move */
  gain: number;
}

export interface AllocationResult {
  /** the priority order of the kept allocation */
  order: number[];
  picks: Array<Candidate | null>;
  teamValue: number;
  floorsMet: number;
  swaps: SwapMove[];
  ordersTried: number;
}

/** The error a cancelled run throws (an AbortError, like a fetch's). */
export const cancelledError = (): Error => Object.assign(new Error("The build was cancelled"), { name: "AbortError" });
export const isAbortError = (e: unknown): boolean => (e as { name?: string } | null)?.name === "AbortError";

const EPS = 1e-9;

/** Every permutation of `xs`, `xs` itself first. */
export function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

export function teamValueOf(picks: ReadonlyArray<Candidate | null>, weights: readonly number[]): number {
  return picks.reduce((n, p, i) => n + (p ? p.value * (weights[i] ?? 1) : 0), 0);
}

const floorsOf = (picks: ReadonlyArray<Candidate | null>): number => picks.filter((p) => p?.meetsFloor).length;

/** Is allocation `a` better than `b`: more members on a loadout, then more ER floors met, then a higher team value. */
function better(a: ReadonlyArray<Candidate | null>, b: ReadonlyArray<Candidate | null>, weights: readonly number[]): boolean {
  const filledA = a.filter(Boolean).length;
  const filledB = b.filter(Boolean).length;
  if (filledA !== filledB) return filledA > filledB;
  const fa = floorsOf(a);
  const fb = floorsOf(b);
  if (fa !== fb) return fa > fb;
  const va = teamValueOf(a, weights);
  const vb = teamValueOf(b, weights);
  return va > vb * (1 + EPS) + EPS;
}

async function greedy(api: AllocationApi, order: number[], n: number, check: () => void, onStep?: AllocationInput["onStep"]): Promise<Array<Candidate | null>> {
  const taken = new Set<string>();
  const picks: Array<Candidate | null> = Array.from({ length: n }, () => null);
  for (const member of order) {
    check();
    onStep?.({ phase: "member", member, order });
    const c = await api.solve(member, taken);
    picks[member] = c;
    if (c) for (const id of c.ids) taken.add(id);
  }
  return picks;
}

/** A loadout's scoring key: slot 0, then the rest sorted (the optimizer scores a loadout the same in any slot order
 *  past the main echo). */
const keyOf = (member: number, ids: readonly string[]): string => `${member}:${ids[0]}|${[...ids.slice(1)].sort().join(",")}`;

export async function allocateTeam(api: AllocationApi, input: AllocationInput): Promise<AllocationResult> {
  const n = input.members;
  const weights = Array.from({ length: n }, (_, i) => input.weights[i] ?? 1);
  const check = (): void => {
    if (input.isCancelled?.()) throw cancelledError();
  };

  // 1. greedy, in every order when asked
  const orders = input.allOrders && n <= 4 ? permutations(input.order) : [input.order];
  let bestOrder = input.order;
  let picks: Array<Candidate | null> | null = null;
  for (let i = 0; i < orders.length; i++) {
    check();
    input.onStep?.({ phase: "order", order: orders[i]!, index: i, total: orders.length });
    const p = await greedy(api, orders[i]!, n, check, input.onStep);
    if (!picks || better(p, picks, weights)) {
      picks = p;
      bestOrder = orders[i]!;
    }
  }
  picks ??= Array.from({ length: n }, () => null);

  // 2. swap pass
  const scored = new Map<string, Candidate | null>();
  for (let m = 0; m < n; m++) if (picks[m]) scored.set(keyOf(m, picks[m]!.ids), picks[m]!);
  const swaps: SwapMove[] = [];
  const rounds = input.maxSwapRounds ?? 3;
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        check();
        const A = picks[a];
        const B = picks[b];
        if (!A || !B) continue;
        input.onStep?.({ phase: "swap", round, pair: [a, b] });
        const used = new Set(picks.flatMap((p) => p?.ids ?? []));
        // every move: taker takes the giver's echo; the giver backfills with what the taker gave up or a free echo
        type Move = { taker: number; giver: number; ts: number; gs: number; takerIds: string[]; giverIds: string[]; echo: string; backfill: string };
        const moves: Move[] = [];
        for (const [taker, giver] of [[a, b], [b, a]] as const) {
          const T = picks[taker]!;
          const G = picks[giver]!;
          for (let ts = 0; ts < T.ids.length; ts++) {
            for (let gs = 0; gs < G.ids.length; gs++) {
              const echo = G.ids[gs]!;
              if (!api.legal(taker, ts, echo, T)) continue;
              const takerIds = T.ids.map((id, i) => (i === ts ? echo : id));
              const given = T.ids[ts]!;
              const options = [given, ...(api.free?.(giver, gs, G, new Set([...used].filter((id) => id !== echo))) ?? []).filter((id) => id !== given && !used.has(id))];
              for (const backfill of options) {
                if (!api.legal(giver, gs, backfill, G)) continue;
                const giverIds = G.ids.map((id, i) => (i === gs ? backfill : id));
                moves.push({ taker, giver, ts, gs, takerIds, giverIds, echo, backfill });
              }
            }
          }
        }
        if (!moves.length) continue;
        // score what is new, one batch per member
        for (const member of [a, b]) {
          const want = new Map<string, string[]>();
          for (const mv of moves) {
            const ids = mv.taker === member ? mv.takerIds : mv.giver === member ? mv.giverIds : null;
            if (!ids) continue;
            const k = keyOf(member, ids);
            if (!scored.has(k) && !want.has(k)) want.set(k, ids);
          }
          if (!want.size) continue;
          const list = [...want.values()];
          const res = await api.score(member, list);
          list.forEach((ids, i) => scored.set(keyOf(member, ids), res[i] ?? null));
        }
        check();
        // the best move by the allocation order (filled, floors, value); a floor met before must hold after
        let best: { picks: Array<Candidate | null>; move: Move } | null = null;
        for (const mv of moves) {
          const T2 = scored.get(keyOf(mv.taker, mv.takerIds));
          const G2 = scored.get(keyOf(mv.giver, mv.giverIds));
          if (!T2 || !G2) continue;
          const T1 = picks[mv.taker]!;
          const G1 = picks[mv.giver]!;
          if ((T1.meetsFloor && !T2.meetsFloor) || (G1.meetsFloor && !G2.meetsFloor)) continue;
          // a member already short of their floor may not lose more ER
          if (!T1.meetsFloor && (T2.er ?? 0) < (T1.er ?? 0) - EPS) continue;
          if (!G1.meetsFloor && (G2.er ?? 0) < (G1.er ?? 0) - EPS) continue;
          const next = picks.slice();
          next[mv.taker] = { ...T2, ids: mv.takerIds, meta: T1.meta };
          next[mv.giver] = { ...G2, ids: mv.giverIds, meta: G1.meta };
          if (better(next, best ? best.picks : picks, weights)) best = { picks: next, move: mv };
        }
        if (best) {
          const before = teamValueOf(picks, weights);
          picks = best.picks;
          const after = teamValueOf(picks, weights);
          const mv = best.move;
          swaps.push({ taker: mv.taker, giver: mv.giver, takerSlot: mv.ts, giverSlot: mv.gs, echo: mv.echo, backfill: mv.backfill, gain: before > 0 ? after / before - 1 : 0 });
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return { order: bestOrder, picks, teamValue: teamValueOf(picks, weights), floorsMet: floorsOf(picks), swaps, ordersTried: orders.length };
}

/** No echo id twice across the picks (the invariant the tests and the page check). */
export function hasReuse(picks: ReadonlyArray<Candidate | null>): boolean {
  const seen = new Set<string>();
  for (const p of picks) for (const id of p?.ids ?? []) {
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}
