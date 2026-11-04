// Wuthering Tools+ — "Whole account": gear several teams from one echo inventory, no echo worn twice.
//
//   teams in priority order ──► per member (Build my team's prepareMember: plan → constraints → optimizer job), each
//   character once, scored on their part of their highest-priority team's rotation ──► solve.ts (greedy in priority
//   order, then the local search over conflicts) ──► drafts + the calculator's numbers per member and per team
//
// Store-free like buildTeam.ts: the page passes plain copies of the stores, the CLI an export; nothing is written here
// (accountApply.ts does, after the player confirms). Every number shown is the app's own calculator on the produced
// builds: each member's damage on their rotation, each team's total with every new build pinned (a character shared by
// two teams wears the one build in both). The optimizer and the local search only rank.
import { resolveCharactersForBuild } from "../../../calculator/buildOverride";
import type { TeamEnemyConfig } from "../../../calculator/buildCharacterContext";
import { RANKING_ENEMY } from "../../myRankings/rankRoster";
import { resolveTeamCharacters } from "../../teamContext/resolveTeam";
import type { AllocationApi, Candidate } from "../allocate";
import { draftBuildFields, filterPoolIds, finishMember, memberSearchApi, prepareMember, teamTotalOf, teamTotalWithDrafts, wornByMap, type ActiveMember, type BuildTeamHooks, type MemberOutcome, type SearchContext, type TeamSpec } from "../buildTeam";
import type { BuildOptions } from "../constraints";
import type { OptimizerBackend } from "../headlessOptimizer";
import type { MemberPlan } from "../rileyPlan";
import { solveAccount, type AccountMove, type AccountSolveResult } from "./solve";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AccountTeamInput {
  spec: TeamSpec;
  /** how much this team matters: the account value is Σ weight × (team damage ÷ today's) */
  weight: number;
  /** one per slot (plans.ts `plansForTeam`) */
  plans: MemberPlan[];
  /** slot priority inside the team (rileyPlan.ts `priorityOrder`) */
  memberOrder: number[];
  /** the page's row id (accountTeams.ts) */
  choiceId?: string;
}

export interface BuildAccountInput {
  characters: Record<string, any>;
  inventory: { echoes: any[]; equipped?: Record<string, Record<string, number>> };
  /** priority order, first served first */
  teams: AccountTeamInput[];
  /** Build my team's switches; `takeFromOthers` and `tryAllOrders` do not apply (echoes worn outside the chosen teams
   *  always stay out — the plan's promise is no echo twice on the account) */
  options: BuildOptions;
  autoTeamBuffs?: boolean;
  /** the local search's time budget (ms); default 60 s */
  budgetMs?: number;
}

/** "searched": the member's first-pass search is over (the run list stops saying "Searching" for them) */
export type AccountPhase = "prepare" | "search" | "searched" | "improve" | "verify";

export interface BuildAccountHooks {
  signal?: AbortSignal;
  /** "stop improving": the local search ends between moves, the best so far is kept */
  shouldStop?: () => boolean;
  /** per member (by character): what is running and the loadouts scored so far */
  onProgress?: (p: { characterId: string; phase: AccountPhase; processed: number; generated: number }) => void;
  /** the run's stage and, in the local search, the moves accepted so far */
  onStage?: (s: { stage: "prepare" | "greedy" | "improve" | "verify"; accepted?: number; round?: number }) => void;
}

export interface AccountMember extends MemberOutcome {
  /** the team (index into `teams`) whose rotation this build is scored on: the character's highest-priority team */
  team: number;
  /** the lower-priority chosen teams this character also plays in, wearing the same build */
  alsoIn: number[];
}

export interface AccountTeamOutcome {
  index: number;
  spec: TeamSpec;
  weight: number;
  choiceId?: string;
  /** per slot: which member (index into `members`) fills it, and whether that build was scored in an earlier team */
  slots: Array<{ slot: number; characterId: string; member: number; sharedFrom: number | null }>;
  /** the calculator's team total, average damage per rotation: today, with every new build pinned, and with the
   *  greedy's builds (null when the local search changed nothing in this team) */
  before: number;
  after: number;
  greedyAfter: number | null;
  dpsBefore: number | null;
  dpsAfter: number | null;
}

/** An echo that changes hands: worn today by `from` (their active build or their build in a chosen team), in `to`'s plan. */
export interface EchoMove {
  echoId: string;
  echo: string;
  set: string | null;
  cost: number;
  stat: string | null;
  to: string;
  from: string[];
}

export interface BuildAccountResult {
  members: AccountMember[];
  teams: AccountTeamOutcome[];
  moves: EchoMove[];
  /** the calculator's Σ weight × team damage ÷ today's: today (= Σ weight), the greedy alone, the plan */
  score: { today: number; greedy: number; final: number };
  /** the solver's own account (optimizer values): greedy, after the local search, and today's (Σ weight × the
   *  calculator's damage today), the moves it kept with characters for members, and why it stopped */
  search: {
    baseline: number;
    /** "greedy": the local search changed builds but the calculator's team totals scored the greedy higher, so the
     *  greedy's allocation is the plan */
    kept: "search" | "greedy";
    greedy: number;
    value: number;
    moves: Array<AccountMove & { characters: string[] }>;
    stoppedBy: AccountSolveResult["stoppedBy"];
    rounds: number;
    conflicts: number;
    ms: number;
    /** members left without a build while another plan build held an echo they wear today: they keep today's echoes,
     *  so those were locked and the account solved again without them (characters, in the order found) */
    locked: string[];
  };
  enemy: TeamEnemyConfig;
  ms: number;
}

/** A local-search move must raise the account's weighted damage by more than this share of today's. */
export const MIN_GAIN = 0.0005;

const abortError = (): Error => Object.assign(new Error("The build was cancelled"), { name: "AbortError" });

const echoIdsOf = (record: any): Set<string> => new Set(Object.values(record?.echoes ?? {}).map((s: any) => s?.echoId).filter(Boolean).map(String));

export async function buildAccount(input: BuildAccountInput, backend: OptimizerBackend, hooks: BuildAccountHooks = {}): Promise<BuildAccountResult> {
  const t0 = Date.now();
  const { characters, options } = input;
  const echoes = input.inventory.echoes ?? [];
  const echoById = new Map(echoes.map((e) => [String(e.echoId), e]));
  const auto = input.autoTeamBuffs ?? true;
  const enemy = RANKING_ENEMY;
  const check = (): void => {
    if (hooks.signal?.aborted) throw abortError();
  };
  const opts: BuildOptions = { ...options, takeFromOthers: false, tryAllOrders: false };
  const teamHooks: BuildTeamHooks = {
    signal: hooks.signal,
    onProgress: (p) => hooks.onProgress?.({ characterId: p.characterId, phase: p.phase === "swap" ? "improve" : p.phase, processed: p.processed, generated: p.generated }),
  };

  // every character of every chosen team; echoes anyone else wears stay out of the search
  const planSet = new Set(input.teams.flatMap((t) => t.spec.characterIds.filter((x): x is string => !!x)));
  const worn = wornByMap(input.inventory.equipped ?? {});
  const wornOutside = new Set<string>();
  for (const [id, who] of worn) if (who.some((c) => !planSet.has(c))) wornOutside.add(id);

  // 1. per team, per member in the team's priority: each character once, in their highest-priority team
  hooks.onStage?.({ stage: "prepare" });
  const members: AccountMember[] = [];
  const active: ActiveMember[] = [];
  const activeMember: number[] = []; // active index → members index
  const ownerOf = new Map<string, number>(); // character → members index
  const weights: number[] = [];
  const slotEchoes = new Map<string, Set<string>>();
  const wornInTeams = new Map<string, Set<string>>(); // character → the echoes their builds in every chosen team wear
  const teams: AccountTeamOutcome[] = [];
  for (let ti = 0; ti < input.teams.length; ti++) {
    check();
    const t = input.teams[ti]!;
    const team = t.spec;
    const resolution = await resolveTeamCharacters({ characterIds: team.characterIds, buildIds: team.buildIds, enemyConfig: team.enemyConfig, actions: team.actions ?? [], handoffs: team.handoffs ?? null }, characters, echoes, { auto, enemyConfig: enemy });
    const today = await teamTotalOf(team, characters, echoes, enemy, auto);
    const outcome: AccountTeamOutcome = { index: ti, spec: team, weight: t.weight, choiceId: t.choiceId, slots: [], before: today.avg, after: today.avg, greedyAfter: null, dpsBefore: today.dps, dpsAfter: today.dps };
    teams.push(outcome);
    const order = [...t.memberOrder, ...team.characterIds.map((_, i) => i).filter((i) => !t.memberOrder.includes(i))];
    for (const slot of order) {
      const characterId = team.characterIds[slot];
      if (!characterId) continue;
      const mine = echoIdsOf(resolution.characters[characterId]);
      wornInTeams.set(characterId, new Set([...(wornInTeams.get(characterId) ?? []), ...mine]));
      const owner = ownerOf.get(characterId);
      if (owner != null) {
        members[owner]!.alsoIn.push(ti);
        outcome.slots.push({ slot, characterId, member: owner, sharedFrom: members[owner]!.team });
        continue;
      }
      const { outcome: o, active: a } = await prepareMember({ slot, characterId, plan: t.plans[slot], team, resolution, characters, echoes, enemy, options: opts, wornOutside, hooks: teamHooks });
      const index = members.length;
      members.push({ ...o, team: ti, alsoIn: [] });
      ownerOf.set(characterId, index);
      slotEchoes.set(characterId, mine);
      outcome.slots.push({ slot, characterId, member: index, sharedFrom: null });
      if (a) {
        active.push(a);
        activeMember.push(index);
        // team weight ÷ the team's damage today: the members' values (their slots of the team rotation) then add up
        // to the weight × the team's damage relative to today
        weights.push(t.weight / Math.max(1, today.avg));
      }
    }
  }
  // a character who gets no new build keeps what they wear in every chosen team: out of everyone else's search
  const building = new Set(active.map((a) => a.job.characterId));
  const keptInTeam = new Set<string>();
  for (const [id, ids] of wornInTeams) if (!building.has(id)) for (const echoId of ids) keptInTeam.add(echoId);
  for (const echoId of keptInTeam) wornOutside.add(echoId);

  // 2. the account solver over the members who build
  const search: SearchContext = { echoes, echoById, options: opts, wornOutside, keptInTeam, backend, hooks: teamHooks };
  const { api, combos } = memberSearchApi(active, search);
  // members dropped from the solve (see step 3b): no build, and their echoes are locked like a non-builder's
  const dropped = new Set<number>();
  const solveApi: AllocationApi = { ...api, solve: (m, taken) => (dropped.has(m) ? Promise.resolve(null) : api.solve(m, taken)) };
  // today's weighted value of the members who build (Σ weight × the calculator's damage today): ≈ Σ team weights
  const baseline = active.reduce((n, a, i) => n + weights[i]! * a.before, 0);
  // the improvement pass's own time, shared by every solve: a solve spends only what its improvement pass used, so
  // solving again after a lock is never charged for a first pass (on a slow phone that alone can pass the budget)
  let budgetLeft = input.budgetMs ?? 60_000;
  const searched = (ms: Iterable<number>): void => {
    for (const m of ms) hooks.onProgress?.({ characterId: active[m]!.job.characterId, phase: "searched", processed: combos.get(m) ?? 0, generated: 0 });
  };
  const runSolve = async (budgetMs: number): Promise<AccountSolveResult> => {
    // the pools are read again each time: a dropped member's echoes are out of everyone's
    const pools = active.map((a, i) => (dropped.has(i) ? new Set<string>() : filterPoolIds(echoes, a.levels[a.levels.length - 1]!.c, wornOutside)));
    hooks.onStage?.({ stage: "greedy" });
    let lastGreedy: number | null = null;
    let lastPair: readonly number[] = [];
    const out = await solveAccount(solveApi, {
      members: active.length,
      order: active.map((_, i) => i).filter((i) => !dropped.has(i)),
      weights,
      pools,
      budgetMs,
      // a move has to be worth 0.05 % of the account's weighted damage: no echoes moved for noise
      minGain: MIN_GAIN * baseline,
      isCancelled: () => !!hooks.signal?.aborted,
      shouldStop: hooks.shouldStop,
      onStep: (s) => {
        if (s.phase === "greedy") {
          if (lastGreedy != null) searched([lastGreedy]);
          lastGreedy = s.member;
        } else if (s.phase === "improve") {
          if (lastGreedy != null) searched([lastGreedy]);
          lastGreedy = null;
          searched(lastPair.filter((m) => !s.members.includes(m)));
          lastPair = s.members;
          hooks.onStage?.({ stage: "improve", accepted: s.accepted, round: s.round });
          for (const m of s.members) hooks.onProgress?.({ characterId: active[m]!.job.characterId, phase: "improve", processed: combos.get(m) ?? 0, generated: 0 });
        }
      },
    });
    searched(active.map((_, i) => i).filter((i) => !dropped.has(i)));
    return out;
  };

  // 3. the calculator decides: each team's total with every new build pinned, for the local search's allocation and,
  //    when it changed something, for the greedy's; the account keeps whichever scores more (the optimizer scores each
  //    member on their own part of the rotation, the team total also sees what a support's echoes do for the others)
  const memberOfActive = (m: number): AccountMember => members[activeMember[m]!]!;
  const draftOf = (m: number, pick: Candidate | null): Record<string, any> | null => {
    if (!pick) return null;
    const a = active[m]!;
    const slotRecord = resolveCharactersForBuild(characters, a.job.characterId, memberOfActive(m).fromBuild.id)[a.job.characterId] ?? {};
    return draftBuildFields(slotRecord, pick.ids.map((id) => echoById.get(id)!), a.job.buffConfig);
  };
  const activeOf = new Map(activeMember.map((mi, a) => [mi, a]));
  const totalsFor = async (picks: ReadonlyArray<Candidate | null>): Promise<Array<{ avg: number; dps: number | null }>> => {
    const out: Array<{ avg: number; dps: number | null }> = [];
    for (const team of teams) {
      check();
      const drafts = team.slots.flatMap((s) => {
        const a = activeOf.get(s.member);
        const d = a != null ? draftOf(a, picks[a] ?? null) : null;
        return d ? [{ slot: s.slot, characterId: s.characterId, draft: d }] : [];
      });
      out.push(drafts.length ? await teamTotalWithDrafts(team.spec, characters, echoes, enemy, auto, drafts) : { avg: team.before, dps: team.dpsBefore });
    }
    return out;
  };
  const rel = (after: number, before: number): number => (before > 0 ? after / before : 1);
  const scoreOf = (totals: ReadonlyArray<{ avg: number }>): number => teams.reduce((n, t, i) => n + t.weight * rel(totals[i]!.avg, t.before), 0);
  const solveStart = Date.now();
  const locked: string[] = [];
  let solved: AccountSolveResult;
  let changed: boolean;
  let searchTotals: Array<{ avg: number; dps: number | null }>;
  let greedyTotals: Array<{ avg: number; dps: number | null }>;
  let keptGreedy: boolean;
  let picks: Array<Candidate | null>;
  for (;;) {
    solved = await runSolve(budgetLeft);
    budgetLeft = Math.max(0, budgetLeft - solved.improveMs);
    hooks.onStage?.({ stage: "verify" });
    changed = solved.picks.some((p, m) => (p?.ids.join() ?? "") !== (solved.greedy.picks[m]?.ids.join() ?? ""));
    searchTotals = await totalsFor(solved.picks);
    greedyTotals = changed ? await totalsFor(solved.greedy.picks) : searchTotals;
    keptGreedy = changed && scoreOf(greedyTotals) > scoreOf(searchTotals);
    picks = keptGreedy ? solved.greedy.picks : solved.picks;
    // 3b. a member the plan leaves without a build keeps today's echoes — echoes nobody locked, since they were set up
    //     to build. When another plan build holds one, "no echo worn twice" would not hold: lock that member's echoes
    //     (as for a member who never starts) and solve again without them. Each pass drops one member at least.
    const held = new Set(picks.flatMap((p) => p?.ids ?? []));
    const clash = active.map((_, i) => i).filter((i) => !dropped.has(i) && !picks[i] && [...(wornInTeams.get(active[i]!.job.characterId) ?? [])].some((id) => held.has(id)));
    if (!clash.length) break;
    for (const i of clash) {
      dropped.add(i);
      locked.push(active[i]!.job.characterId);
      for (const id of wornInTeams.get(active[i]!.job.characterId) ?? []) {
        keptInTeam.add(id);
        wornOutside.add(id);
      }
    }
  }
  const finalTotals = keptGreedy ? greedyTotals : searchTotals;
  teams.forEach((t, i) => {
    t.after = finalTotals[i]!.avg;
    t.dpsAfter = finalTotals[i]!.dps;
    const teamChanged = t.slots.some((s) => {
      const a = activeOf.get(s.member);
      return a != null && (solved.greedy.picks[a]?.ids.join() ?? "") !== (solved.picks[a]?.ids.join() ?? "");
    });
    t.greedyAfter = changed && teamChanged ? greedyTotals[i]!.avg : null;
  });

  // 4. drafts and the calculator's numbers per member
  const finish = { ...search, characters, worn, teamSet: planSet, slotEchoes, combos };
  for (let m = 0; m < active.length; m++) {
    check();
    await finishMember(m, active, picks, memberOfActive(m), finish);
    // the first pass left them nothing after the members before them took the echoes they need
    if (dropped.has(m)) memberOfActive(m).message = "No new build is left for them once the members before them take the echoes they need, so they keep the echoes they wear today and no other build in the plan takes those.";
  }

  // 5. echoes that change hands, and the account's score
  const moves: EchoMove[] = [];
  for (const m of members) {
    for (const p of m.after?.picks ?? []) {
      const id = String(p.echo.echoId);
      const from = [...new Set([...p.wornBy, ...[...planSet].filter((c) => !!slotEchoes.get(c)?.has(id))])].filter((c) => c !== m.characterId).sort();
      if (!from.length) continue;
      moves.push({ echoId: id, echo: p.echo.echo, set: p.echo.echoSet ?? null, cost: Number(p.echo.type) || 0, stat: p.echo.stat ?? null, to: m.characterId, from });
    }
  }
  const today = teams.reduce((n, t) => n + t.weight, 0);

  return {
    members,
    teams,
    moves,
    score: { today, greedy: scoreOf(greedyTotals), final: scoreOf(finalTotals) },
    search: {
      baseline,
      kept: keptGreedy ? "greedy" : "search",
      greedy: solved.greedy.value,
      value: solved.value,
      moves: solved.moves.map((mv) => ({ ...mv, characters: (mv.kind === "pair" ? [mv.first, mv.then] : [mv.taker, mv.giver]).map((i) => active[i]!.job.characterId) })),
      stoppedBy: solved.stoppedBy,
      rounds: solved.rounds,
      conflicts: solved.conflicts,
      ms: Date.now() - solveStart,
      locked,
    },
    enemy,
    ms: Date.now() - t0,
  };
}

/** No echo id in two members' new builds (the invariant the tests and the page check). */
export function accountReuse(result: Pick<BuildAccountResult, "members">): string[] {
  const seen = new Map<string, string>();
  const twice: string[] = [];
  for (const m of result.members) {
    for (const p of m.after?.picks ?? []) {
      const id = String(p.echo.echoId);
      if (seen.has(id)) twice.push(id);
      seen.set(id, m.characterId);
    }
  }
  return twice;
}
