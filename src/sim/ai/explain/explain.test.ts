// Wuthering Tools+ AI: the "Explain" buttons — what each page sends (labelled numbers, the right engine named, nothing
// raw), and the button itself: a click opens the assistant with the question and the data parked for the setup when no
// key is stored. No request is ever made (the runtime loader throws if anything tries).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ExplainButton from "./ExplainButton.vue";
import { APP_ENGINE_NOTE, RILEY_ENGINE_NOTE, explainCharacterRank, explainEnergyTeam, explainTeamRank, explainToaFloor, explainWeaponValue } from "./explainPayloads";
import { attachmentJson, MAX_ATTACHMENT_CHARS } from "../attachments";
import { resetAiSettingsState } from "../aiSettings";
import { resetAssistantState, setAssistantRuntimeLoader, useAssistant } from "../useAssistant";
import type { CharacterRank, TeamRank } from "../../myRankings/rankRoster";
import type { TeamView } from "../../energy/useEnergyNeeds";
import type { CharacterWeaponValue, ValueOption } from "../../weaponValue/weaponValue";
import type { CandidateTeam, FloorResult } from "../../endgame/toaRun";
import type { ToaFloor } from "../../endgame/toaData";

// ── synthetic rows (no personal data) ─────────────────────────────────────────────────────────

const rotation = (name: string, avg: number, source: "yours" | "curated" | "wuwa_calc" = "wuwa_calc") => ({ name, source, avgDamage: avg, normalDamage: avg * 0.3, critDamage: avg * 1.05, dps: avg / 25 });

const aemeath: CharacterRank = {
  id: "Aemeath",
  name: "Aemeath",
  sequence: 2,
  refinement: 1,
  weapon: "EverbrightPolestar",
  rotationsEvaluated: 3,
  best: rotation("Aemeath S6 Everbright Polestar R5 · Mornye + Lynae · S6R5 (wuwa_calc)", 8_123_456.4),
  bestRotation: null,
  rotations: [rotation("Aemeath S6 Everbright Polestar R5 · Mornye + Lynae · S6R5 (wuwa_calc)", 8_123_456.4), rotation("Basic Rotation", 6_000_000.2, "curated"), rotation("Quick swap", 5_000_000, "yours")],
  nextSequence: { label: "S3", avgDamage: 8_900_000, gain: 0.09561 },
  refineFive: { label: "R5", avgDamage: 8_500_000, gain: 0.04636 },
  errors: [],
};
aemeath.best = aemeath.rotations[0];

const team: TeamRank & { duplicates: TeamRank[] } = {
  id: "t1",
  name: "wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae",
  source: "yours",
  characterIds: ["Aemeath", "Mornye", "Lynae"],
  avgDamage: 9_000_000,
  perSlot: [7_200_000, 900_000, 900_000],
  dps: 360_000,
  unarmed: [],
  duplicates: [],
};

describe("explain payloads", () => {
  it("a /my-rankings character row: its numbers labelled, rounded, the app's engine named, the estimates as percentages", () => {
    const r = explainCharacterRank(aemeath, { rank: 1, of: 12, upgrade: { best: { ...aemeath.nextSequence!, kind: "sequence" }, other: null, maxed: false } });
    expect(r.title).toBe("Aemeath on My roster rankings");
    expect(r.question).toMatch(/^Explain Aemeath's ranking/);
    expect(r.data.measured).toBe(APP_ENGINE_NOTE);
    expect(r.data).toMatchObject({
      character: "Aemeath",
      sequence: "S2",
      weapon: "Everbright Polestar R1",
      "damage rank on this account": "1 of 12",
      "average damage per rotation": 8_123_456,
      "damage per second": 324_938,
      "rotations tried on this build": 3,
      "next sequence (estimate on the best rotation)": { what: "S3", "average damage per rotation": 8_900_000, "gain over today (%)": 9.6 },
      "weapon at R5 (estimate on the best rotation)": { "gain over today (%)": 4.6 },
      "best upgrade shown": "S3 9.6 %",
    });
    // the generated name reads as its short title, the stored one beside it
    expect((r.data["best rotation"] as { title: string }).title).not.toContain("(wuwa_calc)");
    expect(r.data["next best rotations"]).toHaveLength(2);
    expect(r.data.problems).toBeUndefined();
    // a maxed character says so instead of an estimate
    const maxed = explainCharacterRank({ ...aemeath, sequence: 6, refinement: 5, nextSequence: null, refineFive: null }, { rank: 2, of: 2, upgrade: { best: null, other: null, maxed: true } });
    expect(maxed.data).toMatchObject({ "next sequence (estimate on the best rotation)": "already S6", "weapon at R5 (estimate on the best rotation)": "already R5", "best upgrade shown": "maxed (S6 with the weapon at R5)" });
  });

  it("a team row and the /account hero: per-member share of the team's damage, the source in words", () => {
    const r = explainTeamRank(team, { rank: 3, of: 40, page: "my-rankings" });
    expect(r.title).toBe("Team · Aemeath + Mornye + Lynae on My roster rankings");
    expect(r.data).toMatchObject({
      source: "a team the player saved",
      "rank among the teams the player can field": "3 of 40",
      "team average damage per rotation": 9_000_000,
      "team damage per second": 360_000,
    });
    expect(r.data.members).toEqual([
      { character: "Aemeath", "average damage per rotation": 7_200_000, "share of the team's damage (%)": 80 },
      { character: "Mornye", "average damage per rotation": 900_000, "share of the team's damage (%)": 10 },
      { character: "Lynae", "average damage per rotation": 900_000, "share of the team's damage (%)": 10 },
    ]);
    const hero = explainTeamRank({ ...team, source: "wuwa_calc", dps: null }, { rank: 1, of: 40, page: "account" });
    expect(hero.title).toMatch(/^Best team · /);
    expect(hero.question).toMatch(/^Explain my best team/);
    expect(hero.data).toMatchObject({ source: "a wuwa_calc stock preset", "team damage per second": null });
  });

  it("/energy: nothing before the team is measured; then each member's have, need and gap, Riley's engine named", () => {
    const base: TeamView = { key: "Aemeath+Lynae+Mornye", id: "t1", name: "Aemeath team", source: "saved", characterIds: ["Aemeath", "Mornye", "Lynae"], state: { status: "loading" } as TeamView["state"], energy: null, checks: null };
    expect(explainEnergyTeam(base)).toBeNull();
    const member = (name: string, mainDps: boolean, setBy: "loop" | "kit") => ({ name, appKey: name, mainDps, owned: true, sequence: 0, weapon: "x", refinement: 1, weaponApproximated: false, spread: "My build", subs: "mine", dps: 100, share: mainDps ? 0.8 : 0.1, cost: 125, need: 115.2, bar: 115.2, minEr: 100, setBy, worn: 0, gen: null, overcap: null });
    const view = {
      ...base,
      state: { status: "ok" },
      energy: { v: 1, teamKey: "t42", rowKey: "t42-x", variants: 2, total: 380_123.6, seconds: 98.04, engine: { commit: "abc" }, members: [member("Aemeath", true, "loop"), member("Mornye", false, "kit")] },
      checks: [
        { status: "short", need: 115.2, have: 110.8, short: 4.4, rolls: 1, margin: -4.4, factor: 0.956, characterId: "Aemeath", member: member("Aemeath", true, "loop"), buildName: null },
        { status: "ok", need: 260, have: 287, short: 0, rolls: 0, margin: 27, factor: 1, characterId: "Mornye", member: member("Mornye", false, "kit"), buildName: "Built for Aemeath + Lynae" },
      ],
    } as unknown as TeamView;
    const r = explainEnergyTeam(view)!;
    expect(r.data.measured).toContain(RILEY_ENGINE_NOTE);
    // what the game's own screen shows for Mornye is not on record: the note says so and never equates a figure with it
    expect(r.data.measured).toContain("Do not say which figure the game's own screen shows");
    expect(r.data.measured).not.toMatch(/character screen/i);
    expect(r.data).toMatchObject({ "wuwa_calc team": "t42", "team DPS in wuwa_calc": 380_124, "fight length (s)": 98 });
    expect(r.data.members).toEqual([
      expect.objectContaining({ character: "Aemeath", role: "main DPS", "Energy Regen the build has (%)": 110.8, "Energy Regen the loop needs (%)": 115.2, status: "short of the need", "points short": 4.4, "median Energy Regen rolls that close it": 1, "need set by": "this team's loop", "score multiplier while short": 0.956 }),
      expect.objectContaining({ character: "Mornye", role: "support", build: "Built for Aemeath + Lynae", status: "the need is met", "need set by": "the kit's own floor", "score multiplier while short": undefined }),
    ]);
  });

  it("/endgame: the floor, its crest goals as seconds left, the teams' kill times as clocks", () => {
    const floor: ToaFloor = { id: "hazard-4", floor: 4, cost: 5, level: 100, goals: [0, 60, 120], enemies: [{ name: "Boss", class: "Overlord", count: 1, hp: 6_000_000 } as ToaFloor["enemies"][number]], hp: 6_000_000, hpRaw: 6_000_000, hpType: "raw", effects: [] };
    const cand = (id: string, saved: string | null): CandidateTeam => ({ id, teamKey: "t1", rowKey: "t1-x", names: [], appKeys: ["Aemeath", "Mornye", "Lynae"], mainDps: "Aemeath", dps: 380_000, saved, picks: [], members: [] });
    const result = (teamId: string, seconds: number | null, crests: number, extra: Partial<FloorResult> = {}): FloorResult => ({ floorId: "hazard-4", teamId, seconds, extrapolated: false, crests, splits: [], dps: seconds ? 6_000_000 / seconds : null, ...extra });
    const r = explainToaFloor({
      floor,
      towerName: "Hazard Zone",
      rows: [
        { team: cand("a", "My Aemeath team"), result: result("a", 16.4, 3) },
        { team: cand("b", null), result: result("b", null, 0) },
        { team: cand("c", null), result: result("c", 30, 0, { error: "engine failed" }) },
      ],
      res: [{ label: "Boss", res: [{ el: "Fusion", v: 10 }, { el: "Havoc", v: 40 }] }],
      effects: [{ label: "Fusion RES −10 %", fidelity: "exact", text: "Fusion RES is reduced." }],
      paceOf: (id) => (id === "a" ? 2.4 : null),
    });
    expect(r.title).toBe("Hazard Zone floor 4 · Tower of Adversity");
    expect(r.data).toMatchObject({ floor: "Hazard Zone 4", "enemy level": 100, HP: 6_000_000, "crest goals (seconds left)": { "1 crest": 0, "2 crests": 60, "3 crests": 120 }, "teams timed in all": 3 });
    expect(r.data["resistances (%)"]).toEqual([{ enemy: "Boss", Fusion: 10, Havoc: 40 }]);
    expect(r.data.effects).toEqual([{ effect: "Fusion RES −10 %", "in the sim": "modelled", "game text": "Fusion RES is reduced." }]);
    const teams = r.data["teams timed (best first)"] as Array<Record<string, unknown>>;
    expect(teams[0]).toMatchObject({ team: "Aemeath + Mornye + Lynae", "player's saved team": "My Aemeath team", "kill time (m:ss used)": "0:16", crests: 3, "player's own pace (× the sim)": 2.4, "DPS on this floor (HP ÷ kill time)": 365_854 });
    expect(teams[1]).toMatchObject({ "kill time (m:ss used)": "over 5:00", crests: 0 });
    expect(teams[2]).toMatchObject({ "kill time (m:ss used)": null, crests: null, "engine error": "engine failed" });
    // the card's clock: 59.6 s reads 1:00, never 0:60
    const edge = explainToaFloor({ floor, towerName: "Hazard Zone", rows: [{ team: cand("d", null), result: result("d", 59.6, 3) }], res: [], effects: [] });
    expect((edge.data["teams timed (best first)"] as Array<Record<string, unknown>>)[0]["kill time (m:ss used)"]).toBe("1:00");
  });

  it("/weapons: every option's own and team change, the panel rule and the missing team figure in words", () => {
    const opt = (id: string, label: string, gain: number, team: number | null, extra: Partial<ValueOption> = {}): ValueOption => ({
      id,
      kind: "signature" as ValueOption["kind"],
      weaponKey: "EverbrightPolestar",
      refinement: 1,
      label,
      avgDamage: 8e6 * (1 + gain),
      gain,
      low: null,
      team: team === null ? null : { teamId: "t1", teamName: "T", characterIds: ["Aemeath", "Mornye", "Lynae"], base: 9e6, avgDamage: 9e6 * (1 + team), gain: team },
      teamNote: team === null ? "the strongest team picks another build" : null,
      panels: [],
      teamAsSet: null,
      ...extra,
    });
    const row: CharacterWeaponValue = {
      id: "Aemeath",
      name: "Aemeath",
      weaponType: "Swords",
      status: "ok",
      note: null,
      current: { weaponKey: "EmeraldOfGenesis", refinement: 1, avgDamage: 8e6, rotation: "Basic Rotation", dps: 320_000 },
      signature: { key: "EverbrightPolestar", status: "swap", steps: [opt("s1", "Everbright Polestar R1", 0.18234, 0.1, { low: { avgDamage: 8.4e6, gain: 0.05 }, panels: [{ member: "Mornye", on: ["x"], off: [] }] }), opt("s5", "Everbright Polestar R5", 0.3, null)] },
      standard: [],
      four: null,
      refine: null,
      team: { id: "t1", name: "wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae", characterIds: ["Aemeath", "Mornye", "Lynae"], base: 9e6 },
      teamNote: null,
    };
    const r = explainWeaponValue(row, "team");
    expect(r.question).toContain("for the team");
    expect(r.data).toMatchObject({ "view shown": "team gain", "own average damage per rotation now": 8_000_000 });
    expect(String(r.data["weapon now"])).toMatch(/^Emerald of Genesis R1$/i);
    const sig = r.data.signature as { status: string; steps: Array<Record<string, unknown>> };
    expect(sig.status).toBe("not held");
    expect(sig.steps[0]).toMatchObject({ weapon: "Everbright Polestar R1", "own gain vs today (%)": 18.23, "own gain with the weapon's stats only, passives off (%)": 5, "team gain vs today (%)": 10, "teammates' team-buff panels assumed to follow the weapon": ["Mornye"] });
    expect(sig.steps[1]).toMatchObject({ "why no team figure": "the strongest team picks another build" });
    expect(sig.steps[1]["team gain vs today (%)"]).toBeUndefined();
  });

  it("every payload fits one attachment without being cut", () => {
    const big = { ...aemeath, rotations: Array.from({ length: 200 }, (_, i) => rotation(`Rotation ${i}`, 1e6 + i)) };
    const json = attachmentJson(explainCharacterRank(big, { rank: 1, of: 1 }).data);
    expect(json.length).toBeLessThan(MAX_ATTACHMENT_CHARS);
    expect(json).not.toContain("_truncated");
  });
});

describe("ExplainButton", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetAiSettingsState();
    resetAssistantState();
    // nothing may load the runtime (or reach the API) from a click without a key
    setAssistantRuntimeLoader(() => Promise.reject(new Error("the runtime must not load")));
  });
  afterEach(() => setAssistantRuntimeLoader(null));

  it("without a key: opens the assistant on its setup with the question and the numbers parked in the composer", async () => {
    const w = mount(ExplainButton, { props: { request: () => explainTeamRank(team, { rank: 1, of: 1, page: "account" }), what: "your best team", testId: "x", label: "Explain this team" } });
    expect(w.text()).toBe("Explain this team");
    expect(w.find("button").attributes("title")).toContain("your best team");
    await w.find("button").trigger("click");
    const { state } = useAssistant();
    expect(state.open).toBe(true);
    expect(state.busy).toBe(false);
    expect(state.draft).toMatch(/^Explain my best team/);
    expect(state.draftFeature).toBe("explain");
    expect(state.draftAttachment?.title).toBe("Best team · Aemeath + Mornye + Lynae on My account");
    expect(JSON.parse(state.draftAttachment!.json)["team average damage per rotation"]).toBe(9_000_000);
  });

  it("hides with nothing to explain, and a builder that returns null does nothing", async () => {
    expect(mount(ExplainButton, { props: { request: null } }).find("button").exists()).toBe(false);
    const w = mount(ExplainButton, { props: { request: () => null, iconOnly: true } });
    expect(w.text()).toBe("");
    await w.find("button").trigger("click");
    expect(useAssistant().state.open).toBe(false);
  });
});
