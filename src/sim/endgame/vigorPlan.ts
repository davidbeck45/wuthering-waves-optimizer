// Wuthering Tools+ — a Vigor-legal plan for all 12 Hazard Zone stages (the ToA clear check). Pure, deterministic.
//
// Rules (Prydwen's game-modes guide — check them in game): every resonator has 10 Vigor across the whole zone (Rover's
// forms share one pool — they are one resonator); a
// stage costs each member its floor's Vigor (side towers 1 / 2 / 3 / 4, every Hazard floor 5). So a full clear takes
// 12+ resonators and nobody fits three Hazard floors.
//
// The timed stages (Hazard 1–4, each side tower's 4th) take a simulated team each: a small branch-and-bound over them
// maximises crests, then breaks ties on the summed kill time, then on the options' own order. The low side floors
// (1–3, level 70–80, no HP data) take any three resonators with Vigor left — "any spare team", assumed to 3-crest —
// filled greedily at each leaf, most expensive first, from whoever has the most Vigor left (resonators no timed stage
// uses first). A leaf that can't seat a low stage simply loses its crests, so the search steers around that too.

export interface PlanOption {
  /** stable id (the team signature) — the last tie-break */
  id: string;
  /** app character keys */
  members: string[];
  /** kill time, s; null = no clear */
  seconds: number | null;
  crests: number;
}

export interface PlanStage {
  id: string;
  cost: number;
  /** a timed stage takes one of `options`; an untimed one any spare resonators */
  timed: boolean;
  options: PlanOption[];
  /** crests an untimed stage is assumed to earn once seated */
  assumedCrests?: number;
}

export interface PlanInput {
  stages: PlanStage[];
  /** every resonator the account can seat on a low floor, weakest first (the order spare picks prefer) */
  roster: string[];
  vigor?: number;
  /** options per timed stage the search keeps (best first) */
  breadth?: number;
  /** nodes the search may visit before it settles for the best found */
  budget?: number;
  /** the Vigor pool of a resonator (`vigorPool`: Rover's forms share one) */
  pool?: (appKey: string) => string;
}

export interface PlanAssignment {
  stageId: string;
  cost: number;
  timed: boolean;
  members: string[];
  option: PlanOption | null;
  crests: number;
  /** a low stage seated with fewer than three */
  shortHanded?: boolean;
}

export interface Plan {
  assignments: PlanAssignment[];
  crests: number;
  maxCrests: number;
  /** summed kill time of the timed stages */
  seconds: number;
  /** Vigor left by pool (`vigorPool`: an app key, or "Rover" for every Rover form) */
  vigorLeft: Record<string, number>;
  /** the search stopped at its budget: the best plan found, maybe not the best there is */
  exhausted: boolean;
  nodes: number;
}

const byQuality = (a: PlanOption, b: PlanOption): number =>
  b.crests - a.crests || (a.seconds ?? Infinity) - (b.seconds ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The Vigor pool a resonator spends from: Rover's forms are one resonator — one pool, and never two in a team. */
export const vigorPool = (appKey: string): string => (/^rover/i.test(appKey) ? "Rover" : appKey);

/** Seat the untimed stages from what Vigor is left; mutates `vigor` (keyed by pool). */
function seatSpare(stages: PlanStage[], vigor: Map<string, number>, roster: string[], used: Set<string>, pool: (k: string) => string): Array<{ members: string[]; crests: number; shortHanded: boolean }> {
  const rank = new Map(roster.map((k, i) => [k, i]));
  // most expensive first: they are the hardest to seat
  const order = stages.map((s, i) => [s, i] as const).sort((a, b) => b[0].cost - a[0].cost || a[1] - b[1]);
  const out: Array<{ members: string[]; crests: number; shortHanded: boolean }> = new Array(stages.length);
  for (const [s, i] of order) {
    const free = roster
      .filter((k) => (vigor.get(pool(k)) ?? 0) >= s.cost)
      .sort((a, b) => vigor.get(pool(b))! - vigor.get(pool(a))! || Number(used.has(pool(a))) - Number(used.has(pool(b))) || rank.get(a)! - rank.get(b)!);
    const members: string[] = [];
    const pools = new Set<string>();
    for (const k of free) {
      if (members.length === 3) break;
      if (pools.has(pool(k))) continue;
      pools.add(pool(k));
      members.push(k);
    }
    for (const k of members) vigor.set(pool(k), vigor.get(pool(k))! - s.cost);
    out[i] = { members, crests: members.length ? s.assumedCrests ?? 3 : 0, shortHanded: members.length > 0 && members.length < 3 };
  }
  return out;
}

export function planVigor(input: PlanInput): Plan {
  const vigorEach = input.vigor ?? 10;
  const breadth = input.breadth ?? Infinity;
  const budget = input.budget ?? 400_000;
  const pool = input.pool ?? vigorPool;
  // the timed stages, searched most expensive first (they constrain the most); results go back in input order
  const timed = input.stages.map((s, at) => ({ s, at })).filter((x) => x.s.timed).sort((a, b) => b.s.cost - a.s.cost || a.at - b.at);
  const spare = input.stages.filter((s) => !s.timed);
  const everyone = [...new Set([...input.roster, ...timed.flatMap((x) => x.s.options.flatMap((o) => o.members))])].sort();
  const options = timed.map((x) => [...x.s.options].filter((o) => o.crests > 0).sort(byQuality).slice(0, breadth));
  const maxCrests = input.stages.reduce((n, s) => n + (s.timed ? 3 : s.assumedCrests ?? 3), 0);

  // optimistic bounds for what the remaining timed stages can still add: their best crests, and — for a branch that
  // must earn every one of those to tie — the least time any option earning them takes
  const bestCrestsFrom: number[] = new Array(timed.length + 1).fill(0);
  const bestTimeFrom: number[] = new Array(timed.length + 1).fill(0);
  for (let i = timed.length - 1; i >= 0; i--) {
    const top = Math.max(0, ...options[i]!.map((o) => o.crests));
    bestCrestsFrom[i] = bestCrestsFrom[i + 1]! + top;
    const atTop = options[i]!.filter((o) => o.crests === top).map((o) => o.seconds ?? 0);
    bestTimeFrom[i] = bestTimeFrom[i + 1]! + (top > 0 && atTop.length ? Math.min(...atTop) : 0);
  }
  const spareMax = spare.reduce((n, s) => n + (s.assumedCrests ?? 3), 0);

  const vigor = new Map<string, number>();
  for (const k of everyone) vigor.set(pool(k), vigorEach);
  const chosen: Array<PlanOption | null> = new Array(timed.length).fill(null);
  type Best = { crests: number; seconds: number; chosen: Array<PlanOption | null>; spare: ReturnType<typeof seatSpare>; vigor: Map<string, number> };
  const hold: { best: Best | null } = { best: null };
  let nodes = 0;
  let exhausted = false;

  const leaf = (crests: number, seconds: number): void => {
    const left = new Map(vigor);
    const used = new Set(chosen.flatMap((o) => o?.members.map(pool) ?? []));
    const seated = seatSpare(spare, left, input.roster, used, pool);
    const total = crests + seated.reduce((n, s) => n + s.crests, 0);
    const best = hold.best;
    if (!best || total > best.crests || (total === best.crests && seconds < best.seconds - 1e-9)) {
      hold.best = { crests: total, seconds, chosen: [...chosen], spare: seated, vigor: left };
    }
  };

  const walk = (i: number, crests: number, seconds: number): void => {
    if (exhausted) return;
    if (++nodes > budget) {
      exhausted = true;
      return;
    }
    const best = hold.best;
    if (best) {
      const bound = crests + bestCrestsFrom[i]! + spareMax;
      if (bound < best.crests || (bound === best.crests && seconds + bestTimeFrom[i]! >= best.seconds - 1e-9)) return;
    }
    if (i === timed.length) return leaf(crests, seconds);
    const cost = timed[i]!.s.cost;
    for (const o of options[i]!) {
      const pools = o.members.map(pool);
      if (new Set(pools).size !== pools.length || !pools.every((k) => (vigor.get(k) ?? 0) >= cost)) continue;
      for (const k of pools) vigor.set(k, vigor.get(k)! - cost);
      chosen[i] = o;
      walk(i + 1, crests + o.crests, seconds + (o.seconds ?? 0));
      chosen[i] = null;
      for (const k of pools) vigor.set(k, vigor.get(k)! + cost);
    }
    // or leave it empty (no team can take it without costing a better stage)
    walk(i + 1, crests, seconds);
  };
  walk(0, 0, 0);

  const b = hold.best;
  const byStage = new Map<string, PlanOption | null>(timed.map((x, i) => [x.s.id, b?.chosen[i] ?? null]));
  const assignments: PlanAssignment[] = [];
  let si = 0;
  for (const s of input.stages) {
    if (s.timed) {
      const o = byStage.get(s.id) ?? null;
      assignments.push({ stageId: s.id, cost: s.cost, timed: true, members: o?.members ?? [], option: o, crests: o?.crests ?? 0 });
    } else {
      const seat = b?.spare[si++];
      assignments.push({ stageId: s.id, cost: s.cost, timed: false, members: seat?.members ?? [], option: null, crests: seat?.crests ?? 0, ...(seat?.shortHanded ? { shortHanded: true } : {}) });
    }
  }
  const vigorLeft: Record<string, number> = {};
  for (const k of everyone) vigorLeft[pool(k)] = b?.vigor.get(pool(k)) ?? vigorEach;
  return { assignments, crests: b?.crests ?? 0, maxCrests, seconds: b?.seconds ?? 0, vigorLeft, exhausted, nodes };
}

/** What the plan gives up if one timed stage can't have its team: the best plan without that option there. */
export interface PlanAlternative {
  stageId: string;
  /** the team the plan uses there now */
  without: PlanOption;
  plan: Plan;
  crestDelta: number;
  secondsDelta: number;
}

export function planAlternatives(input: PlanInput, plan: Plan): PlanAlternative[] {
  const out: PlanAlternative[] = [];
  for (const a of plan.assignments) {
    if (!a.timed || !a.option) continue;
    const drop = a.option.id;
    const alt = planVigor({
      ...input,
      stages: input.stages.map((s) => (s.id === a.stageId ? { ...s, options: s.options.filter((o) => o.id !== drop) } : s)),
    });
    out.push({ stageId: a.stageId, without: a.option, plan: alt, crestDelta: alt.crests - plan.crests, secondsDelta: alt.seconds - plan.seconds });
  }
  return out.sort((x, y) => y.crestDelta - x.crestDelta || x.secondsDelta - y.secondsDelta || (x.stageId < y.stageId ? -1 : 1));
}

/** Teams that miss their next crest on a stage by a little — what to practise or invest in. */
export function nearMisses(
  plan: Plan,
  goalsOf: (stageId: string) => readonly number[],
  within = 20,
  clock = 300,
): Array<{ stageId: string; option: PlanOption; crest: number; faster: number }> {
  const out: Array<{ stageId: string; option: PlanOption; crest: number; faster: number }> = [];
  for (const a of plan.assignments) {
    if (!a.option || a.option.seconds === null) continue;
    const goals = [...goalsOf(a.stageId)].sort((x, y) => x - y);
    if (a.crests >= goals.length) continue;
    const need = clock - goals[a.crests]!;
    const faster = a.option.seconds - need;
    if (faster > 0 && faster <= within) out.push({ stageId: a.stageId, option: a.option, crest: a.crests + 1, faster });
  }
  return out.sort((x, y) => x.faster - y.faster);
}
