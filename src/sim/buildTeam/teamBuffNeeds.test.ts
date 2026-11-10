// Wuthering Tools+ — Build my team keeps the stat a teammate's team buffs rest on (hunt round 2, H1), on the real
// engine: the shipped Cartethyia · Shorekeeper + Ciaccona rotation, upstream's public Cartethyia fixture, and a small
// made-up Shorekeeper inventory. Cartethyia's Team Buffs panel names the team, so the resolver keeps it as the player's
// own, and its two Stellarealm buffs scale on a stored Shorekeeper Energy Regen.
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import teamPresets from "../presets/data/teams.json";
import { applyBuildFields } from "../../characters/buildFields";
import { buildEchoLoadoutFromIds } from "../../echoes/echoLoadout";
import { buildMyTeam, teamBuffNeedsOfTeam, teamFigureOf, teamTotalOf, type TeamSpec } from "./buildTeam";
import { teamBuffNotes } from "./buildTeamView";
import { DEFAULT_OPTIONS } from "./constraints";
import { inlineBackend } from "./headlessOptimizer";
import { emptyPlan, type MemberPlan } from "./rileyPlan";
import { buildAccount } from "./account/buildAccount";
import { memberNote } from "./account/accountView";
import { RANKING_ENEMY } from "../myRankings/rankRoster";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Preset = { name: string; data: { characterIds: string[]; actions: any[]; duration: number | null; handoffs?: Record<string, string[]> } };
const preset = (teamPresets as unknown as Preset[]).find((p) => p.data.characterIds.length === 3 && ["Cartethyia", "Shorekeeper", "Ciaccona"].every((k) => p.data.characterIds.includes(k)))!;
// the two of them alone (Ciaccona's slot and actions left out), so one panel decides what Shorekeeper's stat is for
const ciacSlot = preset.data.characterIds.indexOf("Ciaccona");
const team: TeamSpec = { id: "saved", name: "Cartethyia + Shorekeeper", characterIds: preset.data.characterIds.map((id) => (id === "Ciaccona" ? null : id)), actions: preset.data.actions.filter((a) => a.slot !== ciacSlot).map((a, i) => ({ ...a, id: a.id ?? `a${i}` })), duration: preset.data.duration, handoffs: null, enemyConfig: null, buildIds: [null, null, null] };
const skSlot = team.characterIds.indexOf("Shorekeeper");

const base: Record<string, any> = JSON.parse(JSON.stringify(account.characters));
const fixtureEchoes: any[] = JSON.parse(JSON.stringify(account.echoes));

// five species from the fixture (one 4-cost, four 1-cost), each owned twice: a copy with Energy Regen and one with
// the stats Shorekeeper's own damage wants
const species = [fixtureEchoes.find((e) => Number(e.type) === 4)!.echo, ...[...new Set(fixtureEchoes.filter((e) => Number(e.type) === 1).map((e) => e.echo))].slice(0, 4)];
const erCopy = (echo: string, i: number, set: string): any => ({ echo, type: i ? 1 : 4, rank: 5, stat: "HP", echoId: `sk-er-${i}`, echoSet: set, echoSubStatsType1: "EnergyRegen", echoSubStatsValue1: 12.4 });
const dmgCopy = (echo: string, i: number, set: string): any => ({ echo, type: i ? 1 : 4, rank: 5, stat: "HP", echoId: `sk-dmg-${i}`, echoSet: set, echoSubStatsType1: "CritRate", echoSubStatsValue1: 10.5, echoSubStatsType2: "CritDMG", echoSubStatsValue2: 21, echoSubStatsType3: "HP", echoSubStatsValue3: 11.6 });

/** The account with Shorekeeper on her five Energy Regen copies and Cartethyia's panel set for `stored` % of it; null:
 *  a panel that names no team, so plus derives her buffs from the builds. */
function accountWith(stored: number | null, dmgSet: string, over: { erSet?: string; buffs?: Record<string, any> } = {}): { characters: Record<string, any>; echoes: any[] } {
  const er = species.map((s, i) => erCopy(s, i, over.erSet ?? "RejuvenatingGlow"));
  const dmg = species.map((s, i) => dmgCopy(s, i, dmgSet));
  const panel = { selectedCharacter1: stored == null ? null : "Shorekeeper", selectedCharacter2: null, buffs: over.buffs ?? { SophisticatedStellarealmCritRate: { isEnabled: true, baseAttrValue: stored }, ReleasedStellarealmCritDMG: { isEnabled: true, baseAttrValue: stored } } };
  return {
    characters: {
      ...base,
      Cartethyia: { ...base.Cartethyia, teamBuffs: panel },
      Shorekeeper: { weapon: "StellarSymphony", echoes: buildEchoLoadoutFromIds(er.map((e) => e.echoId), { fillSlots: 5 }) },
    },
    echoes: [...fixtureEchoes, ...er, ...dmg],
  };
}
const skPlan = (set: string): MemberPlan => ({ ...emptyPlan("Shorekeeper"), source: "riley", share: 0.05, sets: [{ key: set, pieces: 5 }], setsLabel: `${set} 5pc` });
const plansFor = (set: string): MemberPlan[] => team.characterIds.map((id) => (id === "Shorekeeper" ? skPlan(set) : undefined)) as MemberPlan[];

/** The team's total once Cartethyia's panel says what Shorekeeper's saved build really has. */
async function truthTotal(characters: Record<string, any>, echoes: any[], run: Awaited<ReturnType<typeof buildMyTeam>>, er: number): Promise<number> {
  const sk = run.members[skSlot]!;
  const panel = characters.Cartethyia.teamBuffs;
  const buffs = Object.fromEntries(Object.entries(panel.buffs as Record<string, any>).map(([k, v]) => [k, { ...v, baseAttrValue: er }]));
  const told = { ...characters, Shorekeeper: applyBuildFields(characters.Shorekeeper, sk.draft!), Cartethyia: { ...characters.Cartethyia, teamBuffs: { ...panel, buffs } } };
  return (await teamTotalOf(team, told, echoes, run.enemy, true)).avg;
}

/** Shorekeeper's Energy Regen today (%), as the calculator reads it on this fixture. */
async function todayEr(dmgSet: string): Promise<number> {
  const probe = accountWith(100, dmgSet);
  return (await teamBuffNeedsOfTeam(team, probe.characters, probe.echoes, RANKING_ENEMY, true))[0]!.today!;
}

describe("a stat a teammate's team buffs rest on", () => {
  it("is read off the panel that names the team: Shorekeeper's Energy Regen, for Cartethyia, capped where the buffs top out", async () => {
    const { characters, echoes } = accountWith(400, "RejuvenatingGlow");
    const run = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: [], order: [], options: DEFAULT_OPTIONS }, inlineBackend());
    const [need] = await teamBuffNeedsOfTeam(team, characters, echoes, run.enemy, true);
    expect(need).toMatchObject({ provider: "Shorekeeper", stat: "energyRegen", label: "Energy Regen", value: 250 }); // both buffs are full at 250 %
    expect(need!.own).toBe(true);
    expect(need!.receivers).toEqual([{ characterId: "Cartethyia", own: true, keys: ["SophisticatedStellarealmCritRate", "ReleasedStellarealmCritDMG"] }]);
    // today's build is short of 250 %: a new build is asked for what the team has, a tenth down
    expect(need!.today!).toBeLessThan(250);
    expect(need!.target).toBe(Math.floor(need!.today! * 10 + 1e-6) / 10);
  }, 60_000);

  it("a set's team buff that scales on its wearer counts too: Song of Feathered Trace 5pc rests on the Energy Regen of whoever wears it", async () => {
    const setBuff = { SongofFeatheredTrace: { isEnabled: true, baseAttrValue: 400 } };
    const worn = accountWith(400, "RejuvenatingGlow", { erSet: "SongofFeatheredTrace", buffs: setBuff });
    const [need] = await teamBuffNeedsOfTeam(team, worn.characters, worn.echoes, RANKING_ENEMY, true);
    expect(need).toMatchObject({ provider: "Shorekeeper", stat: "energyRegen", value: 250, own: true }); // 0.1 % ATK per 1 %, up to 25 %
    expect(need!.receivers).toEqual([{ characterId: "Cartethyia", own: true, keys: ["SongofFeatheredTrace"] }]);
    // nobody on the team wears the five pieces: the entry rests on no one's build
    const unworn = accountWith(400, "RejuvenatingGlow", { buffs: setBuff });
    expect(await teamBuffNeedsOfTeam(team, unworn.characters, unworn.echoes, RANKING_ENEMY, true)).toEqual([]);
  }, 60_000);

  it("the main DPS is not held for a teammate's buffs: the floor is for a member the team's damage does not rest on", async () => {
    const stored = Math.floor(await todayEr("RejuvenatingGlow")) - 20;
    const { characters, echoes } = accountWith(stored, "RejuvenatingGlow");
    const asCarry = team.characterIds.map((id) => (id === "Shorekeeper" ? { ...skPlan("RejuvenatingGlow"), mainDps: true } : undefined)) as MemberPlan[];
    const run = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: asCarry, order: [skSlot], options: DEFAULT_OPTIONS }, inlineBackend());
    const sk = run.members[skSlot]!;
    expect(sk.erFloor).toBeNull();
    expect(sk.teamBuffNeeds![0]).toMatchObject({ held: false, own: true, target: stored });
    // what she gives is still what the team is counted on
    const has = Math.round(sk.teamBuffNeeds![0]!.after! * 10) / 10;
    expect(has).toBeLessThan(stored);
    expect(run.team!.after).toBeCloseTo(await truthTotal(characters, echoes, run, has), 3);
  }, 120_000);

  it("Build my team keeps it: Shorekeeper would shed her Energy Regen for her own damage, and holds what Cartethyia's panel is set for", async () => {
    const today = await todayEr("RejuvenatingGlow");
    // the panel is set 20 points under what she has: one 12.4-point copy can go, two can't
    const stored = Math.floor(today) - 20;
    const { characters, echoes } = accountWith(stored, "RejuvenatingGlow");
    const run = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: plansFor("RejuvenatingGlow"), order: [skSlot], options: DEFAULT_OPTIONS }, inlineBackend());
    const sk = run.members[skSlot]!;
    expect(sk.status).toBe("ok");
    const need = sk.teamBuffNeeds![0]!;
    expect(need).toMatchObject({ stat: "energyRegen", value: stored, target: stored, held: true, own: true, receivers: ["Cartethyia"] });
    // the build changed (her own damage rose) and still gives the panel's Energy Regen
    expect(sk.sameEchoes).toBe(false);
    expect(sk.after!.value).toBeGreaterThan(sk.before!.value);
    expect(need.after!).toBeGreaterThanOrEqual(stored);
    expect(sk.erMet).toBe(true);
    expect(teamBuffNotes(sk)).toEqual([{ tone: "info", text: `Shorekeeper keeps ${stored} % Energy Regen: Cartethyia's team buffs are set for it.` }]);
    // so the headline is what Teams reads after the Save, and no more than the panel's truth gives
    expect(run.team!.after).toBeGreaterThanOrEqual(run.team!.before);
    expect(await truthTotal(characters, echoes, run, Math.round(need.after! * 10) / 10)).toBeGreaterThanOrEqual(run.team!.after - 1e-6);
    expect(await truthTotal(characters, echoes, run, stored)).toBeCloseTo(run.team!.after, 3);
  }, 120_000);

  it("a floor the echoes can't hold: the team is counted on what the new build gives, and the review says so", async () => {
    const today = await todayEr("MoonlitClouds");
    const stored = Math.floor(today) - 20;
    // the plan's set holds no Energy Regen at all, and today's build is not of that set, so it can't stand in
    const { characters, echoes } = accountWith(stored, "MoonlitClouds");
    const run = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: plansFor("MoonlitClouds"), order: [skSlot], options: DEFAULT_OPTIONS }, inlineBackend());
    const sk = run.members[skSlot]!;
    const need = sk.teamBuffNeeds![0]!;
    expect(sk.erUnreachable).toBe(true);
    expect(need.after!).toBeLessThan(stored);
    const has = Math.round(need.after! * 10) / 10;
    // counted at the stored figure the team would read higher than it is: the total is the truth's
    const stale = (await teamTotalOf(team, { ...characters, Shorekeeper: applyBuildFields(characters.Shorekeeper, sk.draft!) }, echoes, run.enemy, true)).avg;
    const truth = await truthTotal(characters, echoes, run, has);
    expect(truth).toBeLessThan(stale * 0.999);
    expect(run.team!.after).toBeCloseTo(truth, 3);
    // and with the build left unticked the team is today's, panel as stored
    const none = await teamFigureOf(run, team, characters, echoes, [false, false, false]);
    expect(none!.after).toBeCloseTo(run.team!.before, 3);
    expect(none!.short).toEqual([]);
    const text = teamBuffNotes(sk).map((n) => n.text).join(" ");
    expect(text).toContain(`Cartethyia's team buffs assume ${stored} % Energy Regen from Shorekeeper, but this build has ${Number(has.toFixed(1))} %`);
    expect(text).toContain("The team total here counts");
  }, 120_000);

  it("a panel plus derives rests on today's build: she keeps the Energy Regen it has, and the team does not fall", async () => {
    const { characters, echoes } = accountWith(null, "RejuvenatingGlow");
    const run = await buildMyTeam({ characters, inventory: { echoes, equipped: {} }, team, plans: plansFor("RejuvenatingGlow"), order: [skSlot], options: DEFAULT_OPTIONS }, inlineBackend());
    const sk = run.members[skSlot]!;
    const need = sk.teamBuffNeeds![0]!;
    expect(need).toMatchObject({ stat: "energyRegen", own: false, held: true, receivers: ["Cartethyia"] });
    expect(need.target).toBeLessThanOrEqual(need.today!);
    expect(need.after!).toBeGreaterThanOrEqual(need.target);
    expect(run.team!.after).toBeGreaterThanOrEqual(run.team!.before * 0.9999);
    expect(teamBuffNotes(sk)[0]!.text).toBe(`Shorekeeper keeps ${Number(need.target.toFixed(1))} % Energy Regen: Cartethyia's team buffs scale on it.`);
  }, 120_000);

  it("Whole account keeps it too, and counts a floor the echoes can't hold the same way", async () => {
    const stored = Math.floor(await todayEr("RejuvenatingGlow")) - 20;
    const plan = (set: string) => ({ spec: team, weight: 1, plans: plansFor(set), memberOrder: [skSlot] });
    const held = accountWith(stored, "RejuvenatingGlow");
    const out = await buildAccount({ characters: held.characters, inventory: { echoes: held.echoes, equipped: {} }, teams: [plan("RejuvenatingGlow")], options: DEFAULT_OPTIONS }, inlineBackend());
    const sk = out.members.find((m) => m.characterId === "Shorekeeper")!;
    expect(sk.teamBuffNeeds![0]).toMatchObject({ held: true, own: true, target: stored });
    expect(sk.teamBuffNeeds![0]!.after!).toBeGreaterThanOrEqual(stored);
    expect(sk.sameEchoes).toBe(false);
    expect(memberNote(sk)).toContain(`Shorekeeper keeps ${stored} % Energy Regen: Cartethyia's team buffs are set for it`);
    expect(out.teams[0]!.after).toBeGreaterThanOrEqual(out.teams[0]!.before);

    const short = accountWith(stored, "MoonlitClouds");
    const low = await buildAccount({ characters: short.characters, inventory: { echoes: short.echoes, equipped: {} }, teams: [plan("MoonlitClouds")], options: DEFAULT_OPTIONS }, inlineBackend());
    const lowSk = low.members.find((m) => m.characterId === "Shorekeeper")!;
    const has = Math.round(lowSk.teamBuffNeeds![0]!.after! * 10) / 10;
    expect(has).toBeLessThan(stored);
    const panel = short.characters.Cartethyia.teamBuffs;
    const told = { ...short.characters, Shorekeeper: applyBuildFields(short.characters.Shorekeeper, lowSk.draft!), Cartethyia: { ...short.characters.Cartethyia, teamBuffs: { ...panel, buffs: Object.fromEntries(Object.entries(panel.buffs as Record<string, any>).map(([k, v]) => [k, { ...v, baseAttrValue: has }])) } } };
    expect(low.teams[0]!.after).toBeCloseTo((await teamTotalOf(team, told, short.echoes, RANKING_ENEMY, true)).avg, 3);
    expect(memberNote(lowSk)).toContain(`Cartethyia's team buffs assume ${stored} % Energy Regen from Shorekeeper, but this build has ${Number(has.toFixed(1))} %`);
  }, 120_000);
});
