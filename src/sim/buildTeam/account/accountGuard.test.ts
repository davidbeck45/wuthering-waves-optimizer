// Wuthering Tools+ — "Whole account" never saves a losing set (buildAccount.ts step 3c). The solver weighs the account
// as a whole, so the team that matters most may take another team's echoes: here the first team's main DPS has no
// echoes yet and her plan names the set the second team's main DPS wears, so the first solve hands her the best of them
// and the second team reads lower than it does today. The guard keeps that team's builds, locks their echoes and solves
// the rest again. A synthetic account (upstream's public Cartethyia fixture plus armed teammates); the real engine.
import { beforeAll, describe, expect, it } from "vitest";
import account from "../../myRankings/__fixtures__/cartethyiaAccount.json";
import teamPresets from "../../presets/data/teams.json";
import { applyBuildFields } from "../../../characters/buildFields";
import { RANKING_ENEMY } from "../../myRankings/rankRoster";
import { teamTotalOf, type TeamSpec } from "../buildTeam";
import { fmtInt } from "../buildTeamView";
import { DEFAULT_OPTIONS } from "../constraints";
import { inlineBackend } from "../headlessOptimizer";
import { echoKeysOf, emptyPlan, parseMainStats, type MemberPlan } from "../rileyPlan";
import { accountApplyRequest } from "./accountApply";
import { buildCountText, guardNotes, memberNote, whyLower } from "./accountView";
import { accountReuse, buildAccount, type AccountMember, type BuildAccountInput, type BuildAccountResult } from "./buildAccount";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Preset = { name: string; data: { characterIds: string[]; actions: any[]; duration: number | null; handoffs?: Record<string, string[]> } };
const presets = teamPresets as unknown as Preset[];
const presetOf = (ids: string[]): Preset => presets.find((p) => ids.every((k) => p.data.characterIds.includes(k)) && p.data.characterIds.length === ids.length)!;
const specOf = (p: Preset, id: string | null = null): TeamSpec => ({ id, name: p.name, characterIds: [...p.data.characterIds], actions: p.data.actions.map((a, i) => ({ ...a, id: a.id ?? `a${i}` })), duration: p.data.duration, handoffs: p.data.handoffs ?? null, enemyConfig: null, buildIds: [null, null, null] });

const base: Record<string, any> = JSON.parse(JSON.stringify(account.characters));
const echoes: any[] = JSON.parse(JSON.stringify(account.echoes));
// Cartethyia wears her fixture build; everyone else is armed and wears nothing
const characters: Record<string, any> = {
  ...base,
  Ciaccona: { weapon: "WoodlandAria" },
  Chisa: { weapon: "Kumokiri" },
  Shorekeeper: { weapon: "StellarSymphony" },
  Aemeath: { weapon: "EverbrightPolestar" },
  Mornye: { weapon: "StarfieldCalibrator" },
  Lynae: { weapon: "SpectrumBlaster" },
};
const equipped: Record<string, Record<string, number>> = Object.fromEntries(Object.values(base.Cartethyia.echoes).map((s: any, i) => [s.echoId, { Cartethyia: i }]));
const cartEchoes = Object.values(base.Cartethyia.echoes).map((s: any) => String(s.echoId));

/** the team that matters most: its main DPS's plan names the set Cartethyia wears */
const first = specOf(presetOf(["Aemeath", "Mornye", "Lynae"]), "saved-first");
/** the team the first solve lowers, and a third that shares its main DPS */
const second = specOf(presetOf(["Cartethyia", "Ciaccona", "Chisa"]), "saved-second");
const third = specOf(presetOf(["Cartethyia", "Shorekeeper", "Ciaccona"]), "saved-third");
const windward = (id: string, main: boolean): MemberPlan => ({ ...emptyPlan(id, main), source: "riley", share: 0.85, sets: [{ key: "WindwardPilgrimage", pieces: 5 }], setsLabel: "Windward Pilgrimage 5pc", mainStats: parseMainStats("44111 CR CD atk atk atk") });
const cartPlan = (erNeed?: number): MemberPlan => ({ ...windward("Cartethyia", true), mainEcho: { name: "Reminiscence: Fleurdelys", keys: echoKeysOf("Reminiscence: Fleurdelys") }, mainStats: parseMainStats("44111 CR CD hp hp hp"), ...(erNeed != null ? { erNeed } : {}) });
const plansFor = (spec: TeamSpec, erNeed?: number): MemberPlan[] => spec.characterIds.map((id) => (id === "Aemeath" ? windward("Aemeath", true) : id === "Cartethyia" ? cartPlan(erNeed) : emptyPlan(id!)));
const teamOf = (spec: TeamSpec, weight: number, erNeed?: number) => ({ spec, weight, plans: plansFor(spec, erNeed), memberOrder: [0, 1, 2] });

const input = (teams: BuildAccountInput["teams"], over: Partial<BuildAccountInput> = {}): BuildAccountInput => ({ characters, inventory: { echoes, equipped }, teams, options: DEFAULT_OPTIONS, ...over });
const two = (): BuildAccountInput["teams"] => [teamOf(first, 1), teamOf(second, 0.4)];

let unguarded: BuildAccountResult;
let guarded: BuildAccountResult;
/** the stages each run reported, with the reason a solve was a second one */
const stages = { unguarded: [] as string[], guarded: [] as string[] };
beforeAll(async () => {
  unguarded = await buildAccount(input(two(), { guard: false }), inlineBackend(), { onStage: (s) => stages.unguarded.push(s.again ? `${s.stage}:${s.again}` : s.stage) });
  guarded = await buildAccount(input(two()), inlineBackend(), { onStage: (s) => stages.guarded.push(s.again ? `${s.stage}:${s.again}` : s.stage) });
}, 240_000);

const by = (r: BuildAccountResult, id: string) => r.members.find((m) => m.characterId === id)!;
const idsOf = (r: BuildAccountResult, id: string): string[] => by(r, id).after?.picks.map((p) => String(p.echo.echoId)) ?? [];
/** every team's total the way Teams reads it once the Save's builds are worn */
async function savedTotals(r: BuildAccountResult, specs: TeamSpec[]): Promise<number[]> {
  const worn: Record<string, any> = { ...characters };
  for (const m of accountApplyRequest(r, false).members) worn[m.characterId] = applyBuildFields(worn[m.characterId], m.draft);
  const out: number[] = [];
  for (const spec of specs) out.push((await teamTotalOf(spec, worn, echoes, RANKING_ENEMY, true)).avg);
  return out;
}

describe("the account as the solve alone leaves it", () => {
  it("makes the second team worse: its main DPS's best echoes go to the team that matters more", () => {
    const [a, b] = unguarded.teams;
    expect(a!.after).toBeGreaterThan(a!.before * 1.5);
    expect(Math.round(b!.after)).toBeLessThan(Math.round(b!.before));
    expect(b!.after / b!.before).toBeLessThan(0.97);
    expect(idsOf(unguarded, "Aemeath").filter((id) => cartEchoes.includes(id)).length).toBeGreaterThan(0);
    // and the account's weighted score still calls that plan better than today: nothing in the solve objects
    expect(unguarded.score.final).toBeGreaterThan(unguarded.score.today);
    expect(unguarded.guard).toEqual([]);
  });
});

describe("the guard: a team the plan would lower keeps today's builds", () => {
  it("no team reads lower than today, and the lowered team reads today's figure exactly", () => {
    for (const t of guarded.teams) expect(Math.round(t.after), t.spec.name).toBeGreaterThanOrEqual(Math.round(t.before));
    expect(guarded.teams[1]!.after).toBe(guarded.teams[1]!.before);
    expect(guarded.teams[1]!.dpsAfter).toBe(guarded.teams[1]!.dpsBefore);
    // the first team still gains from what is left
    expect(guarded.teams[0]!.after).toBeGreaterThan(guarded.teams[0]!.before * 1.5);
    expect(guarded.score.final).toBeGreaterThan(guarded.score.today);
    expect(guarded.score.final).toBeCloseTo(1 * (guarded.teams[0]!.after / guarded.teams[0]!.before) + 0.4, 9);
  });

  it("names the team, the figure the plan read there and who keeps today's build", () => {
    expect(guarded.guard).toEqual([{ team: 1, before: guarded.teams[1]!.before, planned: unguarded.teams[1]!.after, kept: ["Cartethyia"] }]);
    const cart = by(guarded, "Cartethyia");
    expect(cart).toMatchObject({ status: "noLoadout", keptFor: 1 });
    expect(cart.draft).toBeFalsy();
    expect(cart.after).toBeFalsy();
    expect(memberNote(cart)).toMatch(/^Keeps today's build: with the plan's builds team 2 read lower than it does today\./);
    const [note] = guardNotes(guarded);
    const below = `${((1 - unguarded.teams[1]!.after / guarded.teams[1]!.before) * 100).toFixed(1)} %`;
    expect(note!.team).toBe(1);
    expect(note!.line).toBe(`Team 2 (Cartethyia · Ciaccona + Chisa) stays as it is: the plan's builds read ${below} lower there than the builds it runs today.`);
    expect(note!.card).toBe(`Stays as it is. With the plan's builds it read ${fmtInt(unguarded.teams[1]!.after)} damage per rotation, ${below} below today's ${fmtInt(guarded.teams[1]!.before)}, so Cartethyia keeps today's build and no other build takes their echoes.`);
    expect(guardNotes(unguarded)).toEqual([]);
    // a result kept from before the guard has no list: no note, no crash
    const { guard: _g, ...old } = guarded;
    expect(guardNotes(old)).toEqual([]);
  });

  it("tells the page it is planning again, and why, so the wait is explained", () => {
    expect(stages.unguarded.filter((x) => x.includes(":"))).toEqual([]);
    expect(stages.guarded.filter((x) => x.startsWith("greedy"))).toEqual(["greedy", "greedy:guard"]);
  });

  it("leaves her echoes with her: no plan build holds one, and no echo is worn twice", () => {
    expect(idsOf(guarded, "Aemeath")).toHaveLength(5);
    expect(idsOf(guarded, "Aemeath").filter((id) => cartEchoes.includes(id))).toEqual([]);
    expect(guarded.moves.filter((mv) => mv.from.includes("Cartethyia"))).toEqual([]);
    expect(accountReuse(guarded)).toEqual([]);
  });

  it("the headline, the cards and the Save agree to the last figure", async () => {
    const saving = accountApplyRequest(guarded, false).members;
    expect(saving.map((m) => m.characterId)).toEqual(["Aemeath"]);
    // the headline counts the Save's builds; a member set back is neither a new build nor one who "keeps today's
    // echoes" (that is said of a member the search found nothing better for), and the line under it names her
    expect(buildCountText(guarded.members, saving.length)).toBe("1 new build");
    expect(guardNotes(guarded).map((n) => n.card).join(" ")).toContain("so Cartethyia keeps today's build");
    // with exactly the Save's builds worn, Teams reads each card's figure
    const totals = await savedTotals(guarded, [first, second]);
    guarded.teams.forEach((t, i) => expect(Math.round(totals[i]!), t.spec.name).toBe(Math.round(t.after)));
    // the headline is those cards: Σ weight × the card's plan ÷ today
    const headline = guarded.teams.reduce((n, t) => n + t.weight * (t.after / t.before), 0);
    expect(guarded.score.final).toBeCloseTo(headline, 12);
    // nothing to explain away: the plan is not below today
    expect(whyLower(guarded)).toBeNull();
    // the unguarded plan would have saved the build that lowers team 2, and Teams would have read the lower figure
    const loose = await savedTotals(unguarded, [first, second]);
    expect(accountApplyRequest(unguarded, false).members.map((m) => m.characterId).sort()).toEqual(["Aemeath", "Cartethyia"]);
    expect(Math.round(loose[1]!)).toBeLessThan(Math.round(unguarded.teams[1]!.before));
  }, 60_000);

  it("keeps every team a set-back character plays in: a later team that shares her stays as it is too", async () => {
    const r = await buildAccount(input([teamOf(first, 1), teamOf(second, 0.6), teamOf(third, 0.4)]), inlineBackend());
    expect(r.guard.map((g) => [g.team, g.kept])).toEqual([[1, ["Cartethyia"]], [2, ["Cartethyia"]]]);
    for (const g of r.guard) expect(g.planned).toBeLessThan(g.before);
    for (const t of r.teams.slice(1)) expect(t.after).toBe(t.before);
    expect(r.teams[0]!.after).toBeGreaterThan(r.teams[0]!.before);
    expect(by(r, "Cartethyia")).toMatchObject({ status: "noLoadout", keptFor: 1, alsoIn: [2] });
    expect(guardNotes(r).map((n) => n.line.slice(0, 6))).toEqual(["Team 2", "Team 3"]);
    expect(accountApplyRequest(r, false).members.map((m) => m.characterId)).toEqual(["Aemeath"]);
    const totals = await savedTotals(r, [first, second, third]);
    r.teams.forEach((t, i) => expect(Math.round(totals[i]!), t.spec.name).toBe(Math.round(t.after)));
  }, 240_000);
});

describe("the review's words for a team that stays as it is (accountView.ts guardNotes)", () => {
  const member = (over: Partial<AccountMember>): AccountMember => ({ slot: 0, characterId: "Aemeath", status: "ok", draft: {}, after: { value: 1, optimizerValue: 1, menuEr: 100, picks: [] }, team: 0, alsoIn: [], ...over }) as AccountMember;
  const kept = (id: string, team: number): AccountMember => member({ characterId: id, status: "noLoadout", draft: null as any, after: null as any, team, keptFor: team });
  const spec = (ids: string[]) => ({ id: null, name: "", characterIds: ids, actions: [], duration: null, handoffs: null, enemyConfig: null, buildIds: [null, null, null] });
  const r = {
    // team 1 gains; team 2 is set back whole; team 3 sets its own two back and still wears Mornye's build from team 1
    members: [member({ characterId: "Aemeath" }), member({ characterId: "Mornye", alsoIn: [2] }), member({ characterId: "Lynae" }), kept("YangyangXuanling", 1), kept("Suisui", 1), kept("Chisa", 1), kept("Sigrika", 2), kept("Lucilla", 2)],
    teams: [
      { index: 0, spec: spec(["Aemeath", "Mornye", "Lynae"]), slots: [0, 1, 2].map((m, slot) => ({ slot, characterId: "", member: m, sharedFrom: null })) },
      { index: 1, spec: spec(["YangyangXuanling", "Suisui", "Chisa"]), slots: [3, 4, 5].map((m, slot) => ({ slot, characterId: "", member: m, sharedFrom: null })) },
      { index: 2, spec: spec(["Sigrika", "Mornye", "Lucilla"]), slots: [{ slot: 0, characterId: "Sigrika", member: 6, sharedFrom: null }, { slot: 1, characterId: "Mornye", member: 1, sharedFrom: 0 }, { slot: 2, characterId: "Lucilla", member: 7, sharedFrom: null }] },
    ],
    guard: [
      { team: 1, before: 5_556_247, planned: 5_412_300.4, kept: ["YangyangXuanling", "Suisui", "Chisa"] },
      { team: 2, before: 2_000_000, planned: 1_999_500, kept: ["Sigrika", "Lucilla"] },
    ],
  } as unknown as BuildAccountResult;

  it("says which teams the plan would have lowered and who keeps today's build, in whole figures", () => {
    const [whole, part] = guardNotes(r);
    expect(whole).toEqual({
      team: 1,
      line: "Team 2 (Xuanling · Suisui + Chisa) stays as it is: the plan's builds read 2.6 % lower there than the builds it runs today.",
      card: "Stays as it is. With the plan's builds it read 5,412,300 damage per rotation, 2.6 % below today's 5,556,247, so Xuanling, Suisui and Chisa keep today's builds and no other build takes their echoes.",
    });
    // "stays as it is" is not said of a team that still wears a build planned in an earlier team; and a loss too small
    // for one decimal is still said as a loss, never "0.0 %"
    expect(part).toEqual({
      team: 2,
      line: "Team 3 (Sigrika · Mornye + Lucilla): Sigrika and Lucilla keep today's builds, because with new ones the team read less than 0.1 % lower than it does today.",
      card: "Sigrika and Lucilla keep today's builds: with new ones it read 1,999,500 damage per rotation, less than 0.1 % below today's 2,000,000. No other build takes their echoes. Mornye (planned in team 1) still wears a new build here.",
    });
    expect(guardNotes({ ...r, guard: [] })).toEqual([]);
    // the headline counts the Save's builds and the members the search left on today's echoes: none of the five set back
    expect(buildCountText(r.members, 2)).toBe("2 new builds, 1 keeps today's echoes");
  });
});

describe("Energy Regen still comes first", () => {
  it("a team that reads lower because its build now meets its Energy Regen need stays in the plan, and the review says why", async () => {
    // her loop needs 108 %: today's build has 100 %, and the echoes that reach it cost damage
    const r = await buildAccount(input([teamOf(second, 1, 108), teamOf(third, 0.8, 108)]), inlineBackend());
    const cart = by(r, "Cartethyia");
    expect(cart).toMatchObject({ status: "ok", erMet: true });
    expect(cart.before!.menuEr!).toBeLessThan(108);
    expect(cart.after!.menuEr!).toBeGreaterThanOrEqual(108);
    for (const t of r.teams) expect(Math.round(t.after), t.spec.name).toBeLessThan(Math.round(t.before));
    // not a losing set by the page's own rule: nothing is set back, in her own team or in the one that shares her
    expect(r.guard).toEqual([]);
    expect(cart.keptFor).toBeUndefined();
    expect(whyLower(r)).toMatch(/1 more build now meets the Energy Regen/);
    expect(accountApplyRequest(r, false).members.map((m) => m.characterId)).toEqual(["Cartethyia"]);
  }, 240_000);
});
