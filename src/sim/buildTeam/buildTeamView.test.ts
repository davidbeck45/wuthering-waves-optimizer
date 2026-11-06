// Wuthering Tools+ "Build it for me" — the page's view model: deltas, the layout's cost groups, the buffs switched on
// in words, and the notes a result card explains itself with.
import { describe, expect, it } from "vitest";
import { setLabel } from "../echoLab/echoLabView";
import { buffDefaultNames, conflictText, defaultSaveSlots, deltaText, deltaTone, erBand, layoutGroups, resultNotes, roleLine, setName, shareConflicts, teammatesNote, undoConfirm, undoDoneText, worthSaving } from "./buildTeamView";
import { parseMainStats, type MemberPlan } from "./rileyPlan";
import type { MemberOutcome } from "./buildTeam";

const plan = (over: Partial<MemberPlan> = {}): MemberPlan => ({
  characterId: "Aemeath",
  source: "riley",
  mainDps: true,
  share: 0.87,
  dps: 318292,
  sets: [{ key: "TrailblazingStar", pieces: 5 }],
  setsLabel: "Trailblazing Star 5pc",
  mainEcho: { name: "Sigillum", keys: ["Sigillum", "PhantomSigillum"] },
  mainStats: parseMainStats("43311 CD ATK Fusion atk atk"),
  erNeed: 115.11,
  erSetBy: "loop",
  note: "My build",
  unmapped: [],
  ...over,
});

const outcome = (over: Partial<MemberOutcome> = {}): MemberOutcome => ({
  slot: 0,
  characterId: "Aemeath",
  status: "ok",
  objective: { label: "Team rotation", source: "team", actions: 18 },
  constraints: null,
  before: { value: 7974124, menuEr: 110.8, withRunBuffs: null },
  after: { value: 7857736, optimizerValue: 7857736, menuEr: 116, picks: [] },
  erFloor: 115.2,
  erMet: true,
  erUnreachable: false,
  mainEchoFallback: false,
  relaxed: "plan",
  keptCurrent: false,
  sameEchoes: false,
  setsWorn: { TrailblazingStar: 5 },
  meetsPlanSets: true,
  buffDefaults: [],
  combos: 11200,
  fromBuild: { id: null, name: "Default build", source: "active" },
  draft: {},
  ...over,
});

describe("build-team view model", () => {
  it("formats deltas and their tone", () => {
    expect(deltaText(100, 103.2)).toBe("+3.2 %");
    expect(deltaText(100, 98.5)).toBe("−1.5 %");
    expect(deltaText(100, 100.01)).toBe("±0 %");
    expect(deltaTone(100, 103)).toBe("up");
    expect(deltaTone(100, 99)).toBe("down");
    expect(deltaTone(0, 5)).toBe("flat");
  });

  it("groups the layout by cost with short stat names", () => {
    expect(layoutGroups(plan())).toEqual([
      { cost: 4, stats: ["Crit DMG"] },
      { cost: 3, stats: ["ATK%", "Fusion"] },
      { cost: 1, stats: ["ATK%", "ATK%"] },
    ]);
    expect(layoutGroups(plan({ mainStats: parseMainStats("43311 HP ER ER hp hp") }))[1]).toEqual({ cost: 3, stats: ["ER", "ER"] });
  });

  it("names the buffs it switched on", () => {
    expect(buffDefaultNames(["SongofFeatheredTrace5SetChongming"])).toEqual(["Song of Feathered Trace 5pc (Chongming)"]);
    // the game's name for a Sonata, as Echo Lab and Set lab print it: these pages tell you what to wear
    expect(buffDefaultNames(["HavocEclipse5SetHavoc"])).toEqual(["Sun-sinking Eclipse 5pc (Havoc)"]);
    expect(setName("HavocEclipse")).toBe("Sun-sinking Eclipse");
    expect(setName("HavocEclipse")).toBe(setLabel("HavocEclipse"));
    expect(setName("MoonlitClouds")).toBe("Moonlit Clouds");
    expect(setName("NotASet")).toBe("NotASet");
    expect(buffDefaultNames(["PactofNeonlightLeap"])).toEqual(["Pact of Neonlight Leap"]);
    expect(buffDefaultNames(["FlamingClawprintLiberation"])).toEqual(["Flaming Clawprint (Liberation)"]);
    expect(buffDefaultNames(["Sigillum:Sigillum"])).toEqual(["Sigillum's buff"]);
  });

  it("explains a damage loss that buys the ER the loop needs", () => {
    const notes = resultNotes(outcome(), plan());
    expect(notes[0]!.text).toMatch(/4\.4 points short of the 115\.2 %/);
    expect(erBand(outcome())).toBe("met");
    expect(erBand(outcome({ erMet: false }))).toBe("short");
    expect(erBand(outcome({ erFloor: null }))).toBe("none");
  });

  it("says when the plan was relaxed, the floor is out of reach, or the echoes are the same", () => {
    const relaxed = resultNotes(outcome({ relaxed: "mainStats", shortfall: [{ cost: 3, stats: ["Glacio"], need: 2, have: 1 }], before: { value: 1, menuEr: 130, withRunBuffs: null }, after: { value: 1.1, optimizerValue: 1.1, menuEr: 130, picks: [] } }), plan());
    expect(relaxed.some((n) => /3-cost Glacio DMG/.test(n.text) && /any main stat/.test(n.text))).toBe(true);
    const unreachable = resultNotes(outcome({ erMet: false, erUnreachable: true, erFloor: 240 }), plan());
    expect(unreachable[0]!.tone).toBe("error");
    // what the search does, no more: pass 2 looks at the strictest level that fills, among the echoes the run may use
    expect(unreachable[0]!.text).toMatch(/with the echoes this run can use/);
    expect(unreachable[0]!.text).toMatch(/the most ER found; damage decided/);
    expect(unreachable[0]!.text).not.toMatch(/your echoes allow/);
    // with the plan's sets off the search looked at every set: there are no "these sets" to name
    expect(unreachable[0]!.text).toMatch(/^No build reaches/);
    const inSets = resultNotes(outcome({ erMet: false, erUnreachable: true, erFloor: 240, constraints: { allowedSets: ["RejuvenatingGlow"] } as MemberOutcome["constraints"] }), plan());
    expect(inSets[0]!.text).toMatch(/^No build of these sets reaches 240\.0 %/);
    // the search read the build as meeting the floor and the character screen says no: nothing searched for the most ER
    const misread = resultNotes(outcome({ erMet: false, erUnreachable: false, erFloor: 230 }), plan());
    expect(misread[0]!.tone).toBe("error");
    expect(misread[0]!.text).toMatch(/^Short of 230\.0 % Energy Regen on the character screen/);
    expect(misread[0]!.text).not.toMatch(/most ER found|No build/);
    const same = resultNotes(outcome({ sameEchoes: true, keptCurrent: true, buffDefaults: ["PactofNeonlightLeap"] }), plan());
    expect(same.some((n) => /Same echoes/.test(n.text))).toBe(true);
  });

  it("ticks a build worth saving: better, or worse only to meet an ER floor today's build misses", () => {
    expect(worthSaving(outcome())).toBe(true); // −1.5 % that buys 115.2 % ER from 110.8 %
    expect(worthSaving(outcome({ before: { value: 100, menuEr: 120, withRunBuffs: null }, after: { value: 95, optimizerValue: 95, menuEr: 121, picks: [] } }))).toBe(false); // floor already met: just worse
    expect(worthSaving(outcome({ before: { value: 100, menuEr: 120, withRunBuffs: null }, after: { value: 101, optimizerValue: 101, menuEr: 121, picks: [] } }))).toBe(true);
    expect(worthSaving(outcome({ sameEchoes: true, before: { value: 100, menuEr: 120, withRunBuffs: null }, after: { value: 100, optimizerValue: 100, menuEr: 120, picks: [] } }))).toBe(false);
    expect(worthSaving(outcome({ sameEchoes: true, before: { value: 100, menuEr: 120, withRunBuffs: null }, after: { value: 103, optimizerValue: 103, menuEr: 120, picks: [] } }))).toBe(true);
    expect(worthSaving(outcome({ status: "noLoadout", draft: null }))).toBe(false);
    const worse = resultNotes(outcome({ before: { value: 100, menuEr: 120, withRunBuffs: null }, after: { value: 95, optimizerValue: 95, menuEr: 121, picks: [] } }), plan());
    expect(worse[0]!.text).toMatch(/Scores less than the build worn today/);
  });

  it("never leaves a teammate on a build whose echoes a ticked build takes, and names the echoes otherwise", () => {
    const echo = (id: string, sharedWith: string[] = []) => ({ echo: { echoId: id, echo: "Sigillum" }, source: (sharedWith.length ? "teammate" : "own") as "teammate" | "own", wornBy: sharedWith, sharedWith });
    const carry = outcome({ characterId: "Aemeath", after: { value: 110, optimizerValue: 110, menuEr: 120, picks: [echo("e1", ["Lynae"]), echo("e2")] }, before: { value: 100, menuEr: 120, withRunBuffs: null } });
    // Lynae's new build is a little worse (she gave e1 away): on her own she would stay unticked
    const support = outcome({ slot: 1, characterId: "Lynae", after: { value: 95, optimizerValue: 95, menuEr: 130, picks: [echo("e3")] }, before: { value: 100, menuEr: 130, withRunBuffs: null } });
    expect(worthSaving(support)).toBe(false);
    expect(defaultSaveSlots([carry, support])).toEqual([true, true]);
    // the player unticks her anyway: the save bar names what the team would wear twice
    const conflicts = shareConflicts([carry, support], new Set(["Aemeath"]));
    expect(conflicts).toEqual([{ characterId: "Aemeath", echoId: "e1", echo: "Sigillum", teammate: "Lynae" }]);
    expect(conflictText(conflicts)).toMatch(/^Lynae's build in this team keeps an echo a new build takes/);
    expect(shareConflicts([carry, support], new Set(["Aemeath", "Lynae"]))).toEqual([]);
  });

  it("only credits switched-on buffs when the number moved", () => {
    const flat = resultNotes(outcome({ sameEchoes: true, buffDefaults: ["PactofNeonlightLeap"], before: { value: 100, menuEr: 130, withRunBuffs: null }, after: { value: 100, optimizerValue: 100, menuEr: 130, picks: [] } }), plan());
    expect(flat.some((n) => /this team's best build is the one you wear/.test(n.text))).toBe(true);
    const moved = resultNotes(outcome({ sameEchoes: true, buffDefaults: ["PactofNeonlightLeap"], before: { value: 100, menuEr: 130, withRunBuffs: null }, after: { value: 103, optimizerValue: 103, menuEr: 130, picks: [] } }), plan());
    expect(moved.some((n) => /the change is the set or main-echo buffs/.test(n.text))).toBe(true);
  });

  it("reads the role from Riley's share", () => {
    expect(roleLine({ mainDps: true, share: 0.87 })).toBe("Main DPS · 87 % of team DPS");
    expect(roleLine({ mainDps: false, share: 0.0127 })).toBe("Support · 1.3 % of team DPS");
    expect(roleLine({ mainDps: false, share: null })).toBe("Support");
  });
});

describe("Undo's words", () => {
  const f = (characterId: string, fate: "restore" | "remove" | "keep" | "gone", why?: string) => ({ characterId, name: "Account plan", buildId: `b-${characterId}`, fate, why });
  const builds = (n: number): string => `${n} Account plan build${n === 1 ? "" : "s"}`;

  it("the confirm lists what it will remove, as it always did, when nothing changed", () => {
    const out = undoConfirm([f("Aemeath", "restore"), f("Chisa", "restore")], builds, "put every pin back");
    expect(out.message).toBe("Remove the 2 Account plan builds and put every pin back?");
    expect(out.items).toEqual(["Aemeath: “Account plan”", "Chisa: “Account plan”"]);
  });

  it("says before the tap which builds stay", () => {
    const out = undoConfirm([f("Aemeath", "restore"), f("Chisa", "keep", "it is the active build now"), f("Lucilla", "gone")], builds, "put every pin back");
    expect(out.message).toBe("Remove 1 of the 2 Account plan builds and put their pins back? The ones marked below changed after the save, so they stay.");
    expect(out.items).toEqual(["Chisa: “Account plan” stays (it is the active build now)", "Aemeath: “Account plan”"]);
  });

  it("says so when nothing can be removed, not that it will remove them", () => {
    const out = undoConfirm([f("Aemeath", "keep", "it is the active build now")], builds, "put every pin back");
    expect(out.message).toMatch(/^The 1 Account plan build can't be removed: it changed after the save/);
    expect(undoConfirm([f("Aemeath", "keep", "x"), f("Chisa", "keep", "x")], builds, "put every pin back").message).toMatch(/^None of the 2 Account plan builds can be removed: each one changed/);
  });

  it("after: all back, all removed, or partly with who stayed and who now shares an echo", () => {
    const removed = [{ characterId: "Aemeath", name: "x" }];
    expect(undoDoneText({ kind: "exact", removed, kept: [], clashes: [] })).toEqual({ text: "Undone: 1 build removed and everything put back as it was.", tone: "success" });
    expect(undoDoneText({ kind: "partial", removed, kept: [], clashes: [] })).toEqual({ text: "Undone: 1 build removed.", tone: "success" });
    const partly = undoDoneText({ kind: "partial", removed, kept: [{ characterId: "Chisa", why: "it is the active build now" }], clashes: [{ kept: "Chisa", wearer: "Aemeath" }] });
    expect(partly.tone).toBe("warning");
    expect(partly.text).toBe("Partly undone: 1 removed; kept Chisa (it is the active build now). Chisa and Aemeath now wear the same echo: their builds share it.");
  });
});

describe("a figure a teammate's new build moves", () => {
  const moved = (own: number, withTeam: number | null) => outcome({ after: { value: own, optimizerValue: own, menuEr: 116, picks: [], withTeam } });

  it("says what it reads with only this build changed", () => {
    expect(teammatesNote(moved(411_439, 325_504))).toBe("411K with only this build changed: the rest is the team's other new builds.");
    expect(resultNotes(moved(411_439, 325_504), plan())[0]).toEqual({ tone: "info", text: "411K with only this build changed: the rest is the team's other new builds." });
  });

  it("says nothing when the two agree or there is no team total", () => {
    expect(teammatesNote(moved(100, 100))).toBeNull();
    expect(teammatesNote(moved(100, null))).toBeNull();
    expect(teammatesNote(outcome({ after: null }))).toBeNull();
  });

  it("whether a build is worth saving stays on the member's own change: a teammate's gain is not theirs", () => {
    const same = (own: number, withTeam: number) => outcome({ sameEchoes: true, before: { value: 100, menuEr: 120, withRunBuffs: null }, after: { value: own, optimizerValue: own, menuEr: 120, picks: [], withTeam } });
    expect(worthSaving(same(100, 130))).toBe(false);
    expect(worthSaving(same(103, 90))).toBe(true);
  });
});
