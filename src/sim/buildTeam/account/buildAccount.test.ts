// Wuthering Tools+ — "Whole account" on the real engine: two shipped team rotations that share Cartethyia and Ciaccona
// (public data: upstream's Cartethyia golden fixture — her build and 17 echoes — plus armed teammates), then the write
// path on real Pinia stores: build history first, new "Account plan" builds, pins in the saved team, make-active, undo.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import account from "../../myRankings/__fixtures__/cartethyiaAccount.json";
import teamPresets from "../../presets/data/teams.json";
import { applyBuildFields } from "../../../characters/buildFields";
import { useCharacterStore } from "../../../stores/character";
import { useInventoryStore } from "../../../stores/inventory";
import { useTeamRotationsStore } from "../../../stores/teamRotations";
import { RANKING_ENEMY } from "../../myRankings/rankRoster";
import { showNeed } from "../../energy/energyNeed";
import { readHistory } from "../../buildHistory/history";
import { memberAfter, teamTotalOf, type TeamSpec } from "../buildTeam";
import { DEFAULT_OPTIONS } from "../constraints";
import { inlineBackend } from "../headlessOptimizer";
import { echoKeysOf, emptyPlan, parseMainStats, type MemberPlan } from "../rileyPlan";
import type { BuildTeamStores } from "../apply";
import { accountReuse, buildAccount, type BuildAccountResult } from "./buildAccount";
import { undoFates } from "../apply";
import { cyrb53, stableStringify } from "../../myRankings/rankingCache";
import { ACCOUNT_UNDO_KEY, accountApplyRequest, accountBuildName, accountUndoIsLive, readAccountUndo, saveAccountPlan, undoAccountPlan, undoAccountPlanSaved } from "./accountApply";
import { defaultSelection, defaultWeight, type AccountTeamChoice } from "./accountTeams";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Preset = { name: string; data: { characterIds: string[]; actions: any[]; duration: number | null; handoffs?: Record<string, string[]> } };
const presets = teamPresets as unknown as Preset[];
const presetOf = (ids: string[]): Preset => presets.find((p) => ids.every((k) => p.data.characterIds.includes(k)) && p.data.characterIds.length === ids.length)!;

const base: Record<string, any> = JSON.parse(JSON.stringify(account.characters));
const echoes: any[] = JSON.parse(JSON.stringify(account.echoes));
const characters: Record<string, any> = { ...base, Ciaccona: { weapon: "WoodlandAria" }, Chisa: { weapon: "Kumokiri" }, Shorekeeper: { weapon: "StellarSymphony" } };

const specOf = (p: Preset, id: string | null = null): TeamSpec => ({ id, name: p.name, characterIds: [...p.data.characterIds], actions: p.data.actions.map((a, i) => ({ ...a, id: a.id ?? `a${i}` })), duration: p.data.duration, handoffs: p.data.handoffs ?? null, enemyConfig: null, buildIds: [null, null, null] });
const teamA = specOf(presetOf(["Cartethyia", "Ciaccona", "Chisa"]), "saved-a");
const teamB = specOf(presetOf(["Cartethyia", "Shorekeeper", "Ciaccona"]));

const cartPlan = (): MemberPlan => ({
  ...emptyPlan("Cartethyia", true),
  source: "riley",
  share: 0.87,
  sets: [{ key: "WindwardPilgrimage", pieces: 5 }],
  setsLabel: "Windward Pilgrimage 5pc",
  mainEcho: { name: "Reminiscence: Fleurdelys", keys: echoKeysOf("Reminiscence: Fleurdelys") },
  mainStats: parseMainStats("44111 CR CD hp hp hp"),
});
// Ciaccona may wear Windward too: the two compete for the same echoes
const ciacPlan = (): MemberPlan => ({ ...emptyPlan("Ciaccona"), source: "preset", share: 0.1, sets: [{ key: "GustsofWelkin", pieces: 3 }, { key: "WindwardPilgrimage", pieces: 2 }], setsLabel: "Gusts of Welkin 3pc + Windward Pilgrimage 2pc" });
const chisaPlan = (): MemberPlan => ({ ...emptyPlan("Chisa"), source: "riley", share: 0.03, sets: [{ key: "MoonlitClouds", pieces: 5 }], setsLabel: "Moonlit Clouds 5pc" });
const plansFor = (spec: TeamSpec): MemberPlan[] => spec.characterIds.map((id) => (id === "Cartethyia" ? cartPlan() : id === "Ciaccona" ? ciacPlan() : id === "Chisa" ? chisaPlan() : emptyPlan(id!)));

// an echo nobody in the chosen teams wears, worn by a character outside them: it must stay out of every build
const outsideEcho = echoes.find((e) => e.echoSet === "WindwardPilgrimage" && Number(e.type) === 1 && !Object.values(base.Cartethyia.echoes).some((s: any) => s?.echoId === e.echoId))!;
const equipped: Record<string, Record<string, number>> = {
  ...Object.fromEntries(Object.values(base.Cartethyia.echoes).map((s: any, i) => [s.echoId, { Cartethyia: i }])),
  [outsideEcho.echoId]: { Verina: 3 },
};

let result: BuildAccountResult;
beforeAll(async () => {
  result = await buildAccount(
    {
      characters,
      inventory: { echoes, equipped },
      teams: [
        { spec: teamA, weight: 1, plans: plansFor(teamA), memberOrder: [0, 1, 2] },
        { spec: teamB, weight: 0.8, plans: plansFor(teamB), memberOrder: [0, 2, 1] },
      ],
      options: DEFAULT_OPTIONS,
    },
    inlineBackend(),
  );
}, 120_000);

describe("buildAccount on the engine", () => {
  it("reads a member's Energy Regen need the way every other page prints it, and builds against that figure", async () => {
    const plans = plansFor(teamA).map((p) => (p.characterId === "Cartethyia" ? { ...p, erNeed: 100.11 } : p));
    const out = await buildAccount({ characters, inventory: { echoes, equipped }, teams: [{ spec: teamA, weight: 1, plans, memberOrder: [0, 1, 2] }], options: DEFAULT_OPTIONS }, inlineBackend());
    expect(out.members.find((m) => m.characterId === "Cartethyia")!.erFloor).toBe(showNeed(100.11)); // 100.2: /energy, Build my team, Set lab
    expect(out.members.find((m) => m.characterId === "Chisa")!.erFloor).toBeNull(); // no need: no floor
  }, 120_000);

  it("one build per character, scored in their highest-priority team, worn in both", () => {
    const by = (id: string) => result.members.find((m) => m.characterId === id)!;
    expect(result.members.map((m) => m.characterId).sort()).toEqual(["Cartethyia", "Chisa", "Ciaccona", "Shorekeeper"]);
    expect(by("Cartethyia")).toMatchObject({ team: 0, alsoIn: [1], status: "ok" });
    expect(by("Ciaccona")).toMatchObject({ team: 0, alsoIn: [1], status: "ok" });
    expect(by("Shorekeeper").team).toBe(1);
    expect(result.teams[1]!.slots.filter((s) => s.sharedFrom === 0).map((s) => s.characterId).sort()).toEqual(["Cartethyia", "Ciaccona"]);
  });

  it("no echo twice across the account, and nothing a character outside the chosen teams wears", () => {
    expect(accountReuse(result)).toEqual([]);
    const ids = result.members.flatMap((m) => m.after?.picks.map((p) => String(p.echo.echoId)) ?? []);
    expect(ids.length).toBe(10);
    expect(ids).not.toContain(outsideEcho.echoId);
  });

  it("honours each member's constraints: sets, main echo, layout", () => {
    const cart = result.members.find((m) => m.characterId === "Cartethyia")!;
    expect(cart.setsWorn).toEqual({ WindwardPilgrimage: 5 });
    expect(cart.after!.picks[0]!.echo.echo).toBe("ReminiscenceFleurdelys");
    // her own 4-1-1-1-1 Windward build competes (Build my team's rule) and scores more than any 4-4-1-1-1 here
    if (cart.keptCurrent) expect(cart.after!.picks.every((p) => p.source === "own")).toBe(true);
    else expect(cart.after!.picks.map((p) => Number(p.echo.type)).sort()).toEqual([1, 1, 1, 4, 4]);
    const ciac = result.members.find((m) => m.characterId === "Ciaccona")!;
    expect(ciac.after!.picks.every((p) => ["GustsofWelkin", "WindwardPilgrimage"].includes(p.echo.echoSet))).toBe(true);
    // the plan's sets bound the pool; the piece split is reported (meetsPlanSets), not forced — Build my team's rule
    expect(typeof ciac.meetsPlanSets).toBe("boolean");
    // a member who cannot build says why, in words
    const chisa = result.members.find((m) => m.characterId === "Chisa")!;
    expect(chisa.status).toBe("noEchoes");
    expect(chisa.message).toMatch(/Moonlit Clouds/);
    expect(result.members.find((m) => m.characterId === "Shorekeeper")!.message).toMatch(/Nothing to build from/);
  });

  it("every team number is the calculator's: the team total with the new builds worn", async () => {
    const worn: Record<string, any> = { ...characters };
    for (const m of result.members) if (m.draft) worn[m.characterId] = applyBuildFields(worn[m.characterId], m.draft);
    for (const [i, spec] of [teamA, teamB].entries()) {
      const today = await teamTotalOf(spec, characters, echoes, RANKING_ENEMY, true);
      const after = await teamTotalOf(spec, worn, echoes, RANKING_ENEMY, true);
      expect(result.teams[i]!.before).toBeCloseTo(today.avg, 3);
      expect(result.teams[i]!.after / after.avg).toBeCloseTo(1, 6);
    }
    expect(result.score.today).toBeCloseTo(1.8, 9);
    expect(result.score.final).toBeCloseTo(1 * (result.teams[0]!.after / result.teams[0]!.before) + 0.8 * (result.teams[1]!.after / result.teams[1]!.before), 9);
    // the plan is never below the greedy in the calculator's account score
    expect(result.score.final).toBeGreaterThanOrEqual(result.score.greedy - 1e-12);
  }, 60_000);

  it("a member's figure is their part of the team's total with every new build worn, not with teammates as they are today", async () => {
    const worn: Record<string, any> = { ...characters };
    for (const m of result.members) if (m.draft) worn[m.characterId] = applyBuildFields(worn[m.characterId], m.draft);
    const specs = [teamA, teamB];
    let checked = 0;
    for (const [i, t] of result.teams.entries()) {
      const saved = await teamTotalOf(specs[i]!, worn, echoes, RANKING_ENEMY, true);
      for (const s of t.slots) {
        const m = result.members[s.member]!;
        if (s.sharedFrom != null || !m.after || m.objective?.source !== "team") continue;
        expect(memberAfter(m)! / saved.perSlot[s.slot]!).toBeCloseTo(1, 6);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
    // the deciding figure stays theirs alone
    for (const m of result.members) if (m.after) expect(m.after.value).toBeGreaterThan(0);
  }, 60_000);

  it("names the echoes that change hands", () => {
    for (const mv of result.moves) {
      expect(mv.from).not.toContain(mv.to);
      expect(mv.from.length).toBeGreaterThan(0);
    }
    const ciacIds = new Set(result.members.find((m) => m.characterId === "Ciaccona")!.after!.picks.map((p) => String(p.echo.echoId)));
    const fromCart = Object.values(base.Cartethyia.echoes).map((s: any) => String(s.echoId)).filter((id) => ciacIds.has(id));
    for (const id of fromCart) expect(result.moves.find((mv) => mv.echoId === id)).toMatchObject({ to: "Ciaccona", from: ["Cartethyia"] });
  });
});

describe("a member the plan leaves without a build", () => {
  // Ciaccona picks first, and her plan's Crit Rate 4-cost and HP% 1-costs are exactly the five echoes Cartethyia wears
  // (the other Crit Rate Fleurdelys is left out of this inventory): the first pass hands all five to Ciaccona and leaves
  // Cartethyia without a build. She keeps today's echoes, so they are locked and the account is solved again: no plan
  // build may hold one of them, and Ciaccona builds from the Gusts of Welkin echoes nobody keeps. (No improvement
  // pass, budget 0: it might hand the echoes back by itself; the lock is the guarantee when it does not.)
  const cartIds = new Set(Object.values(base.Cartethyia.echoes).map((s: any) => String(s.echoId)));
  const inventory = echoes.filter((e) => cartIds.has(String(e.echoId)) || e.echoSet === "GustsofWelkin");
  const plans = plansFor(teamA).map((p) => (p.characterId === "Ciaccona" ? { ...p, mainStats: parseMainStats("41111 CR hp hp hp hp") } : p));
  let r: BuildAccountResult;
  beforeAll(async () => {
    r = await buildAccount(
      {
        characters,
        inventory: { echoes: inventory, equipped: Object.fromEntries(Object.values(base.Cartethyia.echoes).map((s: any, i) => [s.echoId, { Cartethyia: i }])) },
        teams: [{ spec: teamA, weight: 1, plans, memberOrder: [1, 0, 2] }],
        options: DEFAULT_OPTIONS,
        budgetMs: 0,
      },
      inlineBackend(),
    );
  }, 120_000);

  it("keeps her echoes out of every other build and says so", () => {
    const cart = r.members.find((m) => m.characterId === "Cartethyia")!;
    const ciac = r.members.find((m) => m.characterId === "Ciaccona")!;
    expect(cart.status).toBe("noLoadout");
    expect(cart.after).toBeNull();
    expect(r.search.locked).toEqual(["Cartethyia"]);
    expect(cart.message).toMatch(/they keep the echoes they wear today and no other build in the plan takes those/);
    // Ciaccona still gets a build, from the echoes nobody keeps
    expect(ciac.status).toBe("ok");
    const held = ciac.after!.picks.map((p) => String(p.echo.echoId));
    expect(held.filter((id) => cartIds.has(id))).toEqual([]);
    expect(r.moves).toEqual([]);
    expect(accountReuse(r)).toEqual([]);
  });

  describe("on a slow device", () => {
    afterEach(() => vi.restoreAllMocks());

    /** The account with a clock the test moves. The first improvement pass stops at once, so the clash stands and the
     *  account is solved again; Chisa on Gusts of Welkin keeps echoes contested once Cartethyia is out, or the second
     *  solve would end without ever reading the clock. */
    const solveTwice = (clock: { firstPass: number; firstImprovePass: number }): Promise<BuildAccountResult> => {
      const real = Date.now.bind(Date);
      let shift = 0;
      vi.spyOn(Date, "now").mockImplementation(() => real() + shift);
      let firstSolve = true;
      let slowSearch = clock.firstPass;
      const contested = plans.map((p) => (p.characterId === "Chisa" ? { ...p, sets: [{ key: "GustsofWelkin", pieces: 2 }], setsLabel: "Gusts of Welkin 2pc" } : p));
      return buildAccount(
        { characters, inventory: { echoes: inventory, equipped: Object.fromEntries(Object.values(base.Cartethyia.echoes).map((s: any, i) => [s.echoId, { Cartethyia: i }])) }, teams: [{ spec: teamA, weight: 1, plans: contested, memberOrder: [1, 0, 2] }], options: DEFAULT_OPTIONS, budgetMs: 60_000 },
        inlineBackend(),
        {
          // the slow part is the first pass's search itself, inside the solve: the clock moves before the budget starts
          onProgress: (p) => {
            if (p.phase !== "search" || !firstSolve) return;
            shift += slowSearch;
            slowSearch = 0;
          },
          shouldStop: () => {
            if (firstSolve) shift += clock.firstImprovePass;
            return firstSolve;
          },
          onStage: (s) => {
            if (s.stage === "verify") firstSolve = false;
          },
        },
      );
    };

    // the budget is the improvement pass's own: solving again after a lock must not charge it for the first pass,
    // or a phone whose first pass outlasts 60 s gets no improvement at all and the page says its time ran out
    it("solving again after a lock still has the improvement pass's time", async () => {
      const out = await solveTwice({ firstPass: 120_000, firstImprovePass: 0 });
      expect(out.search.locked).toEqual(["Cartethyia"]);
      expect(out.search.conflicts).toBeGreaterThan(0);
      expect(out.search.stoppedBy).not.toBe("budget");
    }, 120_000);

    it("the solves share one budget: time the first improvement pass spent is gone for the second", async () => {
      const out = await solveTwice({ firstPass: 0, firstImprovePass: 61_000 });
      expect(out.search.locked).toEqual(["Cartethyia"]);
      expect(out.search.conflicts).toBeGreaterThan(0);
      expect(out.search.stoppedBy).toBe("budget");
    }, 120_000);
  });
});

describe("default teams and weights", () => {
  const row = (id: string, source: AccountTeamChoice["source"], ids: string[], avg: number): AccountTeamChoice => ({ id, name: id, source, characterIds: ids, avgDamage: avg, dps: null, duplicates: 0, spec: { id: null, name: id, characterIds: ids } });
  it("your saved teams first (even sharing a member), then presets that share nobody, at most four, strongest first", () => {
    const choices = [row("p1", "wuwa_calc", ["A", "B", "C"], 900), row("y1", "yours", ["A", "D", "E"], 800), row("y2", "yours", ["F", "D", "G"], 700), row("p2", "curated", ["H", "I", "J"], 600), row("p3", "wuwa_calc", ["K", "L", "M"], 500), row("p4", "wuwa_calc", ["N", "O", "P"], 400)];
    expect(defaultSelection(choices)).toEqual(["y1", "y2", "p2", "p3"]);
    expect(defaultSelection(choices, 2)).toEqual(["y1", "y2"]);
    expect([0, 1, 2, 3, 4, 5].map(defaultWeight)).toEqual([1, 0.8, 0.6, 0.4, 0.2, 0.2]);
  });
});

describe("saving the account plan", () => {
  let stores: BuildTeamStores;
  const snapshot = (): string => JSON.stringify({ c: stores.character.characters, t: stores.team.teams, e: stores.inventory.equipped, p: stores.inventory.equippedPresets });

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    const character = useCharacterStore();
    const inventory = useInventoryStore();
    const team = useTeamRotationsStore();
    character.characters = JSON.parse(JSON.stringify(characters));
    character.ensureCharacterBuilds("Cartethyia");
    inventory.echoes = JSON.parse(JSON.stringify(echoes));
    inventory.equipped = JSON.parse(JSON.stringify(equipped));
    team.teams = [JSON.parse(JSON.stringify(teamA))];
    stores = { character, team, inventory } as unknown as BuildTeamStores;
  });

  it("asks to save every member with a new build, pinned in the chosen saved teams they play in", () => {
    const req = accountApplyRequest(result, false);
    expect(req.members.map((m) => m.characterId).sort()).toEqual(["Cartethyia", "Ciaccona"]);
    expect(req.members.find((m) => m.characterId === "Cartethyia")!.pins).toEqual([{ teamId: "saved-a", slot: 0 }]);
    expect(req.members.find((m) => m.characterId === "Ciaccona")!.pins).toEqual([{ teamId: "saved-a", slot: 1 }]);
  });

  it("history first, then new builds named Account plan, pinned; the active build untouched; undo puts everything back", () => {
    const pristine = snapshot();
    const live = JSON.stringify(stores.character.characters.Cartethyia.echoes);
    const out = saveAccountPlan(stores, accountApplyRequest(result, false), { echoes });
    // build history: her build as it was, kept just before the write (Ciaccona has no build: nothing to keep)
    expect(readHistory("Cartethyia").map((v) => v.label)).toEqual(["before-account-plan"]);
    const cart = stores.character.characters.Cartethyia;
    const made = cart.builds.find((b: any) => b.id === out.created.find((c) => c.characterId === "Cartethyia")!.buildId);
    expect(made.name).toBe("Account plan");
    expect(cart.activeBuildId).not.toBe(made.id);
    expect(JSON.stringify(cart.echoes)).toBe(live);
    expect(stores.team.teams[0].buildIds.slice(0, 2)).toEqual(out.created.map((c) => c.buildId));
    expect(out.pinnedTeams).toEqual(["saved-a"]);
    expect(accountUndoIsLive(stores, readAccountUndo())).toBe(true);
    const undone = undoAccountPlanSaved(stores, out.undo, { echoes });
    expect(undone.kind).toBe("exact");
    expect(undone.pinsRestored).toBe(2);
    expect(snapshot()).toBe(pristine);
    expect(readHistory("Cartethyia").map((v) => v.label)[0]).toBe("before-account-plan");
    expect(localStorage.getItem(ACCOUNT_UNDO_KEY)).toBeNull();
  });

  it("never reuses a build name", () => {
    expect(accountBuildName([])).toBe("Account plan");
    expect(accountBuildName(["Account plan", "Account plan (2)"])).toBe("Account plan (3)");
    saveAccountPlan(stores, accountApplyRequest(result, false), { echoes });
    const again = saveAccountPlan(stores, accountApplyRequest(result, false), { echoes });
    expect(again.created.map((c) => c.name)).toEqual(["Account plan (2)", "Account plan (2)"]);
  });

  it("also make active: every member wears the plan, the equipped map follows, undo brings both back exactly", () => {
    const pristine = snapshot();
    const out = saveAccountPlan(stores, accountApplyRequest(result, true), { echoes });
    for (const c of out.created) {
      const record = stores.character.characters[c.characterId];
      expect(record.activeBuildId).toBe(c.buildId);
      for (const [slot, s] of Object.entries(record.echoes ?? {})) if ((s as any)?.echoId) expect(stores.inventory.equipped[(s as any).echoId]?.[c.characterId]).toBe(Number(slot));
    }
    // no echo is worn twice by the members who now wear the plan
    const worn = out.created.flatMap((c) => Object.values(stores.character.characters[c.characterId].echoes ?? {}).map((s: any) => s?.echoId).filter(Boolean));
    expect(new Set(worn).size).toBe(worn.length);
    undoAccountPlan(stores, out.undo);
    expect(snapshot()).toBe(pristine);
  });

  it("also make active reaches a member whose pinned build already holds the plan, so nobody is left on an older build", () => {
    const m = (characterId: string, over: Record<string, unknown>) => ({ characterId, status: "ok", draft: { echoes: {} }, sameEchoes: true, alsoIn: [], fromBuild: { id: "b", name: "b", source: "pinned" }, ...over }) as any;
    const plan = (members: any[]) => ({ members, teams: [{ spec: { id: "saved-a" }, slots: members.map((_, i) => ({ slot: i, member: i })) }] }) as any;
    const ids = (r: { members: Array<{ characterId: string }> }) => r.members.map((x) => x.characterId);
    const pinnedKeeper = m("Ciaccona", {});
    const wearsIt = m("Chisa", { fromBuild: { id: null, name: null, source: "active" } });
    // saved builds only: nothing changes for either of them
    expect(ids(accountApplyRequest(plan([pinnedKeeper, wearsIt]), false))).toEqual([]);
    // make active: the one who wears another build today has to switch; the one already wearing it does not
    expect(ids(accountApplyRequest(plan([pinnedKeeper, wearsIt]), true))).toEqual(["Ciaccona"]);
    // a pinned build that is the active one is worn already: no copy (planning again after a save made 7, 2026-11-08 hunt M5)
    expect(ids(accountApplyRequest(plan([pinnedKeeper, wearsIt]), true, (id) => (id === "Ciaccona" ? "b" : "other")))).toEqual([]);
    // one who plays in two chosen teams that both pin these echoes already: nothing to save either (Mornye's copy)
    const twoTeams = (member: any, pins: Array<string | null>) =>
      ({ members: [member], teams: pins.map((pin, t) => ({ spec: { id: `saved-${t}`, buildIds: [pin, null, null] }, slots: [{ slot: 0, member: 0 }] })) }) as any;
    const shared = m("Mornye", { alsoIn: [1] });
    expect(ids(accountApplyRequest(twoTeams(shared, ["b", "b"]), false))).toEqual([]);
    expect(ids(accountApplyRequest(twoTeams(shared, ["b", "b"]), true, () => "b"))).toEqual([]);
    // one of them pins something else: she is saved, so both teams wear her build
    expect(ids(accountApplyRequest(twoTeams(shared, ["b", null]), false))).toEqual(["Mornye"]);
  });

  it("saves a member who keeps their echoes when the run's buffs move their number: the review counted that build", () => {
    const m = (characterId: string, after: number) => ({ characterId, status: "ok", draft: { echoes: {} }, sameEchoes: true, alsoIn: [], fromBuild: { id: null, name: null, source: "active" }, before: { value: 100 }, after: { value: after } }) as any;
    const plan = { members: [m("Buffed", 103), m("Unchanged", 100)], teams: [{ spec: { id: "saved-a" }, slots: [{ slot: 0, member: 0 }, { slot: 1, member: 1 }] }] } as any;
    expect(accountApplyRequest(plan, false).members.map((x) => x.characterId)).toEqual(["Buffed"]);
  });

  it("save with the defaults, plan again, also make active: the plan can still be made active", async () => {
    const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
    const planNow = () =>
      buildAccount(
        {
          characters: plain(stores.character.characters),
          inventory: { echoes, equipped: plain(stores.inventory.equipped) },
          teams: [{ spec: { ...teamA, buildIds: plain(stores.team.teams[0].buildIds) }, weight: 1, plans: plansFor(teamA), memberOrder: [0, 1, 2] }],
          options: DEFAULT_OPTIONS,
        },
        inlineBackend(),
      );
    const first = await planNow();
    const saved = saveAccountPlan(stores, accountApplyRequest(first, false), { echoes });
    expect(saved.created.map((c) => c.characterId)).toContain("Ciaccona");
    // planning again changes nothing: there is nothing to save, until the player asks to wear it
    const again = await planNow();
    expect(accountApplyRequest(again, false).members).toEqual([]);
    const out = saveAccountPlan(stores, accountApplyRequest(again, true), { echoes });
    expect(out.activated).toContain("Ciaccona");
    const ciaccona = stores.character.characters.Ciaccona;
    expect(ciaccona.builds.find((b: any) => b.id === ciaccona.activeBuildId)?.name).toMatch(/^Account plan/);
  }, 60_000);

  it("after a later edit, undo removes only what is still unused and never overwrites a record", () => {
    const out = saveAccountPlan(stores, accountApplyRequest(result, false), { echoes });
    stores.character.characters.Cartethyia.weapon = "SomethingElse";
    const undone = undoAccountPlan(stores, out.undo);
    expect(undone.kind).toBe("partial");
    expect(stores.character.characters.Cartethyia.weapon).toBe("SomethingElse");
    expect(stores.character.characters.Cartethyia.builds.some((b: any) => b.name === "Account plan")).toBe(false);
    expect(stores.team.teams[0].buildIds).toEqual([null, null, null]);
  });

  it("after one member's edit, undo gives everyone else back as they were and keeps only the changed one", () => {
    const ciaccona = JSON.stringify(stores.character.characters.Ciaccona ?? null);
    const out = saveAccountPlan(stores, accountApplyRequest(result, true), { echoes });
    const plan = (id: string): string => out.created.find((c) => c.characterId === id)!.buildId;
    stores.character.characters.Cartethyia.level = "80"; // one small edit after the save

    expect(undoFates(stores, out.undo).map((f) => [f.characterId, f.fate])).toEqual([["Cartethyia", "keep"], ["Ciaccona", "restore"]]);
    const undone = undoAccountPlan(stores, out.undo);

    expect(undone.kind).toBe("partial");
    expect(undone.removed.map((r) => r.characterId)).toEqual(["Ciaccona"]);
    expect(undone.kept).toEqual([{ characterId: "Cartethyia", name: "Account plan", why: "it is the active build now" }]);
    expect(JSON.stringify(stores.character.characters.Ciaccona ?? null)).toBe(ciaccona);
    // her pin goes back; the kept build stays pinned
    expect(stores.team.teams[0].buildIds.slice(0, 2)).toEqual([plan("Cartethyia"), null]);
    // the equipped map follows who went back, and only them
    for (const who of Object.values(stores.inventory.equipped)) expect((who as Record<string, number>).Ciaccona).toBe(undefined);
    const hers = Object.values(stores.character.characters.Cartethyia.echoes ?? {}).map((s: any) => s?.echoId).filter(Boolean);
    for (const id of hers) expect(stores.inventory.equipped[id]?.Cartethyia).toBeDefined();
  });

  it("says who shares an echo when a kept build and someone gone back both wear it", () => {
    const out = saveAccountPlan(stores, accountApplyRequest(result, true), { echoes });
    const ciaccona = out.undo.activated.find((a) => a.characterId === "Ciaccona")!;
    const shared = Object.values(stores.character.characters.Cartethyia.echoes).find((s: any) => s?.echoId) as { echoId: string };
    ciaccona.record.echoes = { 0: { echoId: shared.echoId } }; // the build she goes back to wears an echo the plan moved
    stores.character.characters.Cartethyia.level = "80";
    expect(undoAccountPlan(stores, out.undo).clashes).toEqual([{ kept: "Cartethyia", wearer: "Ciaccona" }]);
  });

  describe("loop times written after the save (Sync my teams, 2026-11-08 hunt M2)", () => {
    const withoutRotations = (chars: Record<string, any>) => JSON.stringify(Object.fromEntries(Object.entries(chars).map(([id, r]) => [id, { ...r, rotations: undefined }])));
    /** the sync's own write: a member loop gets the team's seconds, nothing else on the record moves */
    const syncLoopTimes = (ids: string[]) => {
      for (const id of ids) useCharacterStore().setCharacterRotations(id, [...(stores.character.characters[id]?.rotations ?? []), { id: `loop-${id}`, name: "Steady-state loop", duration: 25 }]);
    };

    it("are no edit: Undo gives every member back as they were, and the loop times stay", () => {
      const pristine = JSON.parse(JSON.stringify(stores.character.characters));
      const out = saveAccountPlan(stores, accountApplyRequest(result, true), { echoes });
      const ids = out.created.map((c) => c.characterId);
      syncLoopTimes(ids);
      const synced = Object.fromEntries(ids.map((id) => [id, JSON.stringify(stores.character.characters[id].rotations)]));

      expect(undoFates(stores, out.undo).map((f) => f.fate)).toEqual(ids.map(() => "restore"));
      const undone = undoAccountPlan(stores, out.undo);

      expect(undone.kind).toBe("exact");
      expect(undone.kept).toEqual([]);
      expect(withoutRotations(stores.character.characters)).toBe(withoutRotations(pristine));
      for (const id of ids) expect(JSON.stringify(stores.character.characters[id].rotations)).toBe(synced[id]);
    });

    it("a save that changed the rotations goes back verbatim, and keeps the build once they were edited since", () => {
      const pristine = snapshot();
      const req = accountApplyRequest(result, true);
      const cart = req.members.find((m) => m.characterId === "Cartethyia")!;
      cart.draft = { ...cart.draft, rotations: [{ id: "the-plan-build's", name: "Its own loop" }] };
      const out = saveAccountPlan(stores, req, { echoes });
      expect(undoFates(stores, out.undo).every((f) => f.fate === "restore")).toBe(true);
      undoAccountPlan(stores, structuredClone(out.undo));
      expect(snapshot()).toBe(pristine);

      const again = saveAccountPlan(stores, req, { echoes });
      syncLoopTimes(["Cartethyia"]);
      expect(undoFates(stores, again.undo).find((f) => f.characterId === "Cartethyia")?.fate).toBe("keep");
    });

    it("an undo stored before rotations were left out still reads the whole record", () => {
      const pristine = snapshot();
      const out = saveAccountPlan(stores, accountApplyRequest(result, true), { echoes });
      const legacy = structuredClone(out.undo);
      for (const c of out.created) {
        legacy.after[c.characterId] = cyrb53(stableStringify(stores.character.characters[c.characterId] ?? null));
        delete legacy.after[`rotations:${c.characterId}`];
      }
      expect(undoAccountPlan(stores, legacy).kind).toBe("exact");
      expect(snapshot()).toBe(pristine);
    });
  });

  it("a pin goes back only to a build that still exists", () => {
    const cart = stores.character.characters.Cartethyia;
    cart.builds.push({ id: "older", name: "Built for Chisa", echoes: {} });
    stores.team.teams[0].buildIds = ["older", null, null];
    const out = saveAccountPlan(stores, accountApplyRequest(result, false), { echoes });
    // another undo takes that build out first
    cart.builds = cart.builds.filter((b: any) => b.id !== "older");
    undoAccountPlan(stores, out.undo);
    expect(stores.team.teams[0].buildIds[0]).toBeNull();
  });

  it("a store write that throws part-way puts everything back, and the save before keeps its undo", () => {
    const first = saveAccountPlan(stores, accountApplyRequest(result, false), { echoes });
    const pristine = snapshot();
    const real = stores.character.equipBuild;
    let calls = 0;
    stores.character.equipBuild = (id: string, buildId: string) => {
      calls += 1;
      if (calls === 2) throw new Error("injected");
      real(id, buildId);
    };
    expect(() => saveAccountPlan(stores, accountApplyRequest(result, true), { echoes })).toThrow("injected");
    expect(snapshot()).toBe(pristine);
    expect(readAccountUndo()?.at).toBe(first.undo.at);
    expect(readAccountUndo()?.created.map((c) => c.buildId)).toEqual(first.created.map((c) => c.buildId));
  });
});
