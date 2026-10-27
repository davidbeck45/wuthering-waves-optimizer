// @vitest-environment node
// The rotation view's pure layer on Wave 0's RunLite fixture (t404 Shorekeeper · Lynae · Iuno on the synthetic
// account), hand-made edge cases, and one run of the real engine (the fork, loaded the way the CLI loads it).
import { describe, expect, it } from "vitest";
import fixture from "../engine/__fixtures__/runLite.json";
import type { RunLite, RunRow } from "../engine/rileyRun";
import { cuePlan, durationText, loopsIn, nextStep, prevStep, visitPresses } from "./cueModel";
import { DISCORD_LIMIT, discordMessage, discordText } from "./exportText";
import { clockOf, covered, damageCovered, extractRotation, isPress, union, uptime } from "./extract";
import { buildRotationHash, parseRotationHash, picksOfRowKey, rotationPath, targetId } from "./hash";
import { advancePlayer, backPlayer, elapsedOf, expectedOf, gapText, initPlayer, isDue, pausePlayer, resumePlayer } from "./player";
import { DEFAULT_PREFS, readPrefs, ROTATION_PREFS_KEY, writePrefs } from "./prefs";
import { BASE_HP, hpLines, hpText, onFieldAt, parseHp, rangesOf, rulerStep, valueAt } from "./timelineScale";
import { membersOfCode, teamOfCode } from "./teamCode";
import { variantLabels } from "./useRotationRun";
import { shortName, stagesOf, tokenOf, tokenText } from "./tokens";

const RUN = fixture as unknown as RunLite;
const model = extractRotation(RUN);
const plan = cuePlan(model);

/** A minimal RunLite around hand-made rows (two members, no buffs unless given). */
function synthetic(rows: Array<Partial<RunRow> & Pick<RunRow, "member" | "action" | "frame" | "frames">>, extra: Partial<RunLite> = {}): RunLite {
  const seconds = extra.seconds ?? 10;
  return {
    ...RUN,
    total: 1000,
    bySlot: {},
    seconds,
    sectionSeconds: extra.sectionSeconds ?? [seconds],
    sectionTotals: extra.sectionTotals ?? [1000 * seconds],
    members: RUN.members.slice(0, 2),
    slots: ["Shorekeeper", "Lynae"],
    buffs: [],
    hits: [[60, 0, 0, 1000 * seconds]],
    needs: {},
    ...extra,
    rows: rows.map((r) => ({ cast: null, section: 0, active: true, energy: 0, concerto: 0, avg: 0, held: { local: [], global: [], enemy: [] }, ...r })) as RunRow[],
  };
}

describe("tokens", () => {
  it("reads the press off the action's own name, then the cast kind", () => {
    expect(tokenText(tokenOf({ action: "Basic - Origin Calculus 3", label: "Basic - Origin Calculus 123", cast: "Basic" }))).toBe("BA×3");
    expect(tokenText(tokenOf({ action: "Basic - Origin Calculus 3", label: "Basic - Origin Calculus 23", cast: "Basic" }))).toBe("BA2–3");
    // a heavy-attack input whose damage he files as Basic is still HA; a basic input filed as Heavy is BA
    expect(tokenOf({ action: "Heavy - Something", cast: "Basic" }).text).toBe("HA");
    expect(tokenOf({ action: "Basic - Spark Collision Lv. 3", cast: "Heavy" }).text).toBe("BA");
    expect(tokenOf({ action: "Forte - Lunar Arc", cast: "Skill" })).toMatchObject({ text: "E", forte: true });
    expect(tokenOf({ action: "Forte Basic - Enhanced Moonbow 3", label: "Forte - Enhanced Moonbow 123", cast: "Basic" })).toMatchObject({ text: "BA", suffix: "×3", forte: true, count: 3 });
    expect(tokenOf({ action: "Mid-air - Origin Calculus Plunge", cast: "Basic" }).text).toBe("Plunge");
    expect(tokenOf({ action: "Liberation - End Loop", cast: "Liberation" }).text).toBe("R");
    expect(tokenOf({ action: "Jump", cast: "Jump" }).text).toBe("Jump");
    expect(tokenOf({ action: "Echo - Hyvatia", cast: "Echo", tag: "instant swap" })).toMatchObject({ text: "Echo", cancel: "swap", tag: "instant swap" });
    expect(tokenOf({ action: "Basic - X 3", cast: "Basic", tag: "dodge cancel" }).cancel).toBe("dodge");
    expect(tokenOf({ action: "Basic - X 3", cast: "Basic", tag: "mash cancel" }).cancel).toBeUndefined();
  });

  it("writes waits, named groups, repeats and odd chains", () => {
    expect(tokenText(tokenOf({ action: "Wait 1.52s for Liberation - End Loop's cooldown", cast: null }))).toBe("Wait 1.5s");
    expect(tokenText(tokenOf({ action: "Skill - Afterlife's Guide", label: "Skill - Scorching Yang + Afterlife's Guide", cast: "Skill" }))).toBe("E +1");
    expect(tokenText(tokenOf({ action: "Basic - Vining Waltz 4", label: "Basic - Vining Waltz 123H4", cast: "Basic" }))).toBe("BA123H4");
    expect(tokenOf({ action: "Some Hit", label: "Some Hit x4", cast: "Basic" })).toMatchObject({ suffix: "×4", count: 4 });
    expect(stagesOf("123")).toEqual({ suffix: "×3", count: 3 });
    expect(stagesOf("34")).toEqual({ suffix: "3–4", count: 2 });
    expect(stagesOf("124")).toEqual({ suffix: "1·2·4", count: 3 });
    expect(stagesOf("3")).toBeNull();
  });

  it("falls back to the display name for an action it does not know", () => {
    const t = tokenOf({ action: "Mystery - A Very Long Unheard Of Technique", cast: null });
    expect(t.kind).toBe("other");
    expect(t.text).toBe(shortName("Mystery - A Very Long Unheard Of Technique"));
    expect(t.text.endsWith("…")).toBe(true);
    expect(tokenOf({ action: "Bare", cast: null }).text).toBe("Bare");
  });
});

describe("extract on the fixture", () => {
  it("splits visits exactly where the pressing member changes", () => {
    for (const v of model.visits) for (const i of v.rows) expect(RUN.rows[i]!.member).toBe(v.member);
    for (let i = 1; i < model.visits.length; i++) {
      expect(model.visits[i]!.member).not.toBe(model.visits[i - 1]!.member);
      expect(model.visits[i]!.start).toBe(model.visits[i - 1]!.end);
    }
    expect(model.visits[0]!.start).toBe(0);
    expect(model.visits[model.visits.length - 1]!.end).toBe(model.frames);
    // every press is on exactly one chip
    const pressed = RUN.rows.flatMap((r, i) => (isPress(r) && r.member >= 0 ? [i] : []));
    expect(model.visits.flatMap((v) => v.chips.flatMap((c) => c.rows)).sort((a, b) => a - b)).toEqual(pressed);
  });

  it("adds visit time up to the sections within a frame (Σ frames would lose a folded chain's stages)", () => {
    expect(model.visits.reduce((n, v) => n + (v.end - v.start), 0)).toBe(model.frames);
    // the loops open on the first member's swap-in, played at the end of the section before: each pass still lasts a section
    for (const s of [1, 2, 3]) expect(Math.abs(plan.passSeconds[s]! - RUN.sectionSeconds[s]!) * 60).toBeLessThanOrEqual(1);
    const wrap = plan.wrap ? plan.wrap.seconds : 0;
    expect(Math.abs(plan.passSeconds.reduce((a, b) => a + b, 0) + wrap - RUN.seconds) * 60).toBeLessThanOrEqual(1);
    // Σ frames really does fall short on this run (the folded "Basic - Origin Calculus 123" carries its last stage only)
    const sumFrames = RUN.rows.filter((r) => isPress(r) && r.section === 0).reduce((n, r) => n + r.frames, 0);
    expect(sumFrames).toBeLessThan(RUN.sectionSeconds[0]! * 60 - 60);
  });

  it("marks R ready where the member's energy reaches their bar", () => {
    let checked = 0;
    for (const v of model.visits) {
      for (const cp of v.checkpoints.filter((c) => c.kind === "energy")) {
        const row = RUN.rows[cp.row]!;
        expect(row.member).toBe(cp.member);
        expect(row.energy).toBeGreaterThanOrEqual(RUN.members[cp.member]!.maxEnergy);
        // the member's line before it was below the bar (or it is their first)
        const before = RUN.rows.slice(0, cp.row).filter((r) => r.member === cp.member);
        if (before.length) expect(before[before.length - 1]!.energy).toBeLessThan(RUN.members[cp.member]!.maxEnergy);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(6);
    // Lynae's loop visit fills her bar on the Echo, before her Liberation
    const lynae = model.visits.find((v) => v.section === 1 && RUN.members[v.member]!.name === "Lynae")!;
    const cp = lynae.checkpoints.find((c) => c.kind === "energy")!;
    expect(tokenText(lynae.chips[cp.after]!)).toBe("Echo");
    expect(lynae.chips.findIndex((c) => c.text === "R")).toBeGreaterThan(cp.after);
  });

  it("files Tune Breaks and Outro-ready under the visit on field", () => {
    const iuno = model.visits.find((v) => v.section === 1 && RUN.members[v.member]!.name === "Iuno")!;
    expect(iuno.checkpoints.map((c) => c.kind)).toEqual(expect.arrayContaining(["energy", "concerto", "tune"]));
    for (const v of model.visits) for (const c of v.checkpoints) expect(c.after).toBeLessThan(v.chips.length);
  });

  it("keeps the member lanes apart and every tick on its lane", () => {
    const all = model.lanes.flatMap((l) => l.windows).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < all.length; i++) expect(all[i]![0]).toBeGreaterThanOrEqual(all[i - 1]![1]);
    expect(model.lanes.reduce((n, l) => n + l.share, 0)).toBeCloseTo(1, 6);
    const ticks = model.lanes.reduce((n, l) => n + l.ticks.length, 0);
    expect(ticks).toBe(RUN.rows.filter((r) => r.member >= 0).length);
  });

  it("keeps every uptime in [0, 1] and the stack counts out of the names", () => {
    expect(model.buffs.length).toBeGreaterThan(10);
    for (const b of model.buffs) {
      const u = uptime(b, 0, model.frames);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(b.name).not.toMatch(/ x\d+$/);
      const d = damageCovered(model, b);
      if (d != null) expect(d).toBeGreaterThanOrEqual(0), expect(d).toBeLessThanOrEqual(1);
    }
    const keys = model.buffs.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    // the stacking weapon buff is one track with its highest count
    expect(model.buffs.find((b) => b.name.startsWith("Spectrum Blaster") && b.group === "team")!.maxStacks).toBe(3);
  });

  it("groups 'xN' names into one track and reads an untimed buff held everywhere as permanent", () => {
    const rows = [0, 1, 2, 3].map((k) => ({ member: 0, action: "Basic - A 1", cast: "Basic", frame: k * 60, frames: 60, held: { local: [], global: [[k < 2 ? 0 : 1, 120] as [number, number], [2, 0] as [number, number]], enemy: [] } }));
    const run = synthetic(rows, { buffs: [["Foo x1", "Shorekeeper"], ["Foo x3", "Shorekeeper"], ["Bar", "Lynae"]] });
    const m = extractRotation(run);
    const foo = m.buffs.filter((b) => b.name === "Foo");
    expect(foo).toHaveLength(1);
    expect(foo[0]!.maxStacks).toBe(3);
    expect(foo[0]!.sourceMember).toBe(0);
    expect(foo[0]!.permanent).toBe(false);
    const bar = m.buffs.find((b) => b.name === "Bar")!;
    expect(bar.permanent).toBe(true);
    expect(bar.sourceMember).toBe(1);
    expect(uptime(bar, 0, m.frames)).toBe(1);
  });

  it("draws a monotonic damage curve that ends on the fight's damage, and extrapolates kills at the last loop's DPS", () => {
    const d = model.cumulative.damage;
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeGreaterThanOrEqual(d[i - 1]!);
    expect(d[d.length - 1]).toBe(model.fightTotal);
    expect(model.fightTotal / (RUN.total * RUN.seconds)).toBeCloseTo(1, 4);
    const inside = model.killAt(3_000_000)!;
    expect(inside.extrapolated).toBe(false);
    expect(inside.seconds).toBeGreaterThan(0);
    expect(inside.seconds).toBeLessThan(RUN.seconds);
    const twice = model.killAt(2 * model.fightTotal)!;
    expect(twice.extrapolated).toBe(true);
    const loopDps = RUN.sectionTotals[3]! / RUN.sectionSeconds[3]!;
    expect(twice.seconds).toBeCloseTo(model.frames / model.fps + model.fightTotal / loopDps, 6);
    expect(model.killAt(0)).toBeNull();
  });

  it("starts a folded first line where the press before it ended, and a swap without an Intro is a swap", () => {
    const run = synthetic([
      { member: 0, action: "Skill - A", cast: "Skill", frame: 0, frames: 30 },
      { member: 0, action: "Outro - A", cast: "Outro", frame: 30, frames: 0, triggered: true },
      { member: 1, action: "Intro - B", cast: "Intro", frame: 30, frames: 40 },
      { member: 1, action: "Echo - B", cast: "Echo", frame: 70, frames: 6, tag: "instant swap" },
      // a quick swap straight into a folded chain: its frame is its last stage's
      { member: 0, action: "Basic - A 3", label: "Basic - A 123", cast: "Basic", frame: 140, frames: 20 },
      { member: 0, action: "Wait 0.50s for Liberation - A's cooldown", cast: null, frame: 160, frames: 30 },
    ], { seconds: 190 / 60, sectionSeconds: [190 / 60] });
    const m = extractRotation(run);
    expect(m.visits.map((v) => [v.member, v.start, v.end, v.entry, v.exit])).toEqual([
      [0, 0, 30, "start", "outro"],
      [1, 30, 76, "intro", "swap"],
      [0, 76, 190, "swap", "end"],
    ]);
    expect(m.visits[2]!.chips.map(tokenText)).toEqual(["BA×3", "Wait 0.5s"]);
  });

  it("merges back-to-back identical presses into one chip", () => {
    const run = synthetic([
      { member: 0, action: "Skill - A", cast: "Skill", frame: 0, frames: 30 },
      { member: 0, action: "Skill - A", cast: "Skill", frame: 30, frames: 30 },
      { member: 0, action: "Skill - A", cast: "Skill", frame: 60, frames: 30, tag: "dodge cancel" },
    ], { seconds: 1.5, sectionSeconds: [1.5] });
    const chips = extractRotation(run).visits[0]!.chips;
    expect(chips.map((c) => `${tokenText(c)}${c.cancel ? `~${c.cancel}` : ""}`)).toEqual(["E×2", "E~dodge"]);
    expect(chips[0]!.rows).toEqual([0, 1]);
  });

  it("windows: union and coverage", () => {
    expect(union([[5, 10], [0, 3], [2, 6], [12, 12]])).toEqual([[0, 10]]);
    expect(covered([[0, 10], [20, 30]], 5, 25)).toBe(10);
    expect(uptime({ windows: [[0, 10]] }, 0, 0)).toBe(0);
    expect(clockOf(6511)).toBe("1:48.51");
  });
});

describe("the cue plan", () => {
  it("folds three identical loops into one block opened by the first member's swap-in", () => {
    expect(plan.blocks.map((b) => [b.title, b.repeat, b.visits.length])).toEqual([["Opener", 1, 3], ["Loop", 3, 3]]);
    const loop = plan.blocks[1]!;
    expect(RUN.members[loop.visits[0]!.member]!.name).toBe("Shorekeeper");
    expect(loop.visits[0]!.chips[0]!.text).toBe("Intro");
    expect(loop.seconds).toBeCloseTo(26.55, 2);
    expect(plan.loopTarget).toBe(loop.seconds);
    expect(plan.wrap && RUN.members[plan.wrap.member]!.name).toBe("Shorekeeper");
    expect(loop.varies).toBe(false);
  });

  it("plays the fight as he ran it, then wraps to the first loop", () => {
    expect(plan.steps).toHaveLength(3 + 3 * 3);
    expect(plan.loopStart).toBe(3);
    expect(plan.steps[0]!.label).toBe("Opener");
    expect(plan.steps[3]!.label).toBe("Loop 1 of 3");
    expect(nextStep(plan, 2)).toBe(3);
    expect(nextStep(plan, plan.steps.length - 1)).toBe(plan.loopStart);
    expect(prevStep(plan, 0)).toBe(0);
    expect(prevStep(plan, 4)).toBe(3);
  });

  it("keeps loops that press different buttons apart", () => {
    // a second loop where the second member skips their Echo
    const base = [
      { member: 0, action: "Skill - A", cast: "Skill", frame: 0, frames: 60 },
      { member: 0, action: "Outro - A", cast: "Outro", frame: 60, frames: 0, triggered: true as const },
      { member: 1, action: "Intro - B", cast: "Intro", frame: 60, frames: 60 },
      { member: 1, action: "Echo - B", cast: "Echo", frame: 120, frames: 60 },
      { member: 1, action: "Outro - B", cast: "Outro", frame: 180, frames: 0, triggered: true as const },
    ];
    const second = [
      { member: 0, action: "Intro - A", cast: "Intro", frame: 180, frames: 60, section: 1 },
      { member: 0, action: "Skill - A", cast: "Skill", frame: 240, frames: 60, section: 1 },
      { member: 0, action: "Outro - A", cast: "Outro", frame: 300, frames: 0, triggered: true as const, section: 1 },
      { member: 1, action: "Intro - B", cast: "Intro", frame: 300, frames: 60, section: 1 },
      { member: 1, action: "Outro - B", cast: "Outro", frame: 360, frames: 0, triggered: true as const, section: 1 },
      { member: 0, action: "Intro - A", cast: "Intro", frame: 360, frames: 60, section: 2 },
      { member: 0, action: "Skill - A", cast: "Skill", frame: 420, frames: 60, section: 2 },
      { member: 0, action: "Outro - A", cast: "Outro", frame: 480, frames: 0, triggered: true as const, section: 2 },
      { member: 1, action: "Intro - B", cast: "Intro", frame: 480, frames: 60, section: 2 },
      { member: 1, action: "Echo - B", cast: "Echo", frame: 540, frames: 60, section: 2 },
      { member: 1, action: "Outro - B", cast: "Outro", frame: 600, frames: 0, triggered: true as const, section: 2 },
    ];
    const run = synthetic([...base, ...second], { seconds: 10, sectionSeconds: [3, 3, 4], sectionTotals: [3000, 3000, 4000] });
    const p = cuePlan(extractRotation(run));
    expect(p.blocks.map((b) => b.title)).toEqual(["Opener", "Loop 1", "Loop 2"]);
    const m = extractRotation(run);
    expect(visitPresses(m, m.visits[1]!)).toContain("Echo");
  });

  it("formats durations and loop budgets", () => {
    expect(durationText(26.55)).toBe("26.6 s");
    expect(durationText(108.5167)).toBe("1:48.5");
    expect(durationText(61)).toBe("1:01.0");
    // rounded to the tenth before the minute is split off
    expect(durationText(59.96)).toBe("1:00.0");
    expect(durationText(119.97)).toBe("2:00.0");
    expect(durationText(59.94)).toBe("59.9 s");
    expect(loopsIn(120, 27.5, 26.55)).toBe(3);
  });
});

describe("the Discord export", () => {
  it("writes one line per swap with the loop target", () => {
    // the engine commit is pinned: the fixture is recaptured on every submodule bump, the text must not churn with it
    const pinned = extractRotation({ ...RUN, engine: { ...RUN.engine, commit: "abc1234" } });
    const text = discordText(pinned, cuePlan(pinned), { url: "https://example.test/rotation#team=t404", spreadLabel: "my echoes" });
    expect(text).toMatchSnapshot();
    expect(text.split("\n").filter((l) => l.startsWith("> "))).toHaveLength(6);
    expect(text).toContain("__Loop ×3__ (26.6 s)");
    expect(text).toContain("> **Lynae** Intro › E › Echo › R › BA › BA×3 › BA › Outro · 7.1 s");
    expect(text.length).toBeLessThan(DISCORD_LIMIT);
  });

  it("drops the cancel marks when the message would not fit", () => {
    const long = { ...plan, blocks: Array.from({ length: 6 }, () => plan.blocks).flat() };
    const msg = discordMessage(model, long);
    expect(msg.cancels).toBe(false);
    expect(msg.text).not.toContain("[jump]");
  });
});

describe("the /rotation hash", () => {
  it("reads team keys, row keys, compositions and codes", () => {
    expect(parseRotationHash("#team=t404")).toEqual({ target: { kind: "team", teamKey: "t404", rowKey: null, picks: null }, subs: "mine", tab: "cue" });
    const row = parseRotationHash(`#team=${RUN.rowKey}&subs=high&tab=timeline`);
    expect(row.subs).toBe("high");
    expect(row.tab).toBe("timeline");
    expect(row.target).toMatchObject({ kind: "team", teamKey: "t404", rowKey: RUN.rowKey });
    expect(row.target?.kind === "team" && row.target.picks).toEqual(RUN.members.map((m) => m.pick));
    expect(parseRotationHash("#chars=Shorekeeper,Lynae,Iuno").target).toEqual({ kind: "chars", chars: ["Shorekeeper", "Lynae", "Iuno"] });
    expect(parseRotationHash("#chars=Shorekeeper,Lynae").target).toBeNull();
    expect(parseRotationHash("#team=AbC-_9").target).toEqual({ kind: "code", code: "AbC-_9" });
    expect(parseRotationHash("#team=bP6aLXA_DWxAO6j7N3SU3NoDaOgx-kZ2").target).toEqual({ kind: "code", code: "bP6aLXA_DWxAO6j7N3SU3NoDaOgx-kZ2" });
    expect(parseRotationHash("#tier=standard").subs).toBe("standard");
    expect(parseRotationHash("").target).toBeNull();
  });

  it("round-trips and names targets", () => {
    for (const h of ["#team=t404", `#team=${RUN.rowKey}&subs=standard`, "#chars=Shorekeeper,Lynae,Iuno&tab=timeline"]) {
      expect(buildRotationHash(parseRotationHash(h))).toBe(h);
    }
    expect(rotationPath({ kind: "team", teamKey: "t1", rowKey: null, picks: null }, { tab: "timeline" })).toBe("/rotation#team=t1&tab=timeline");
    expect(targetId({ kind: "chars", chars: ["c", "a", "b"] })).toBe("a+b+c");
    expect(picksOfRowKey("t404-1.0.0.s2.r4-zzz")).toBeNull();
    expect(picksOfRowKey("x-1.0.0.s2.r4")).toBeNull();
  });
});

describe("team codes", () => {
  const teams = [
    { key: "t1", members: [{ loadout: 15051 }, { loadout: 15091 }, { loadout: 14102 }] },
    { key: "t2", members: [{ loadout: 15051 }, { loadout: 15091 }, { loadout: 14101 }] },
  ];
  it("refuses what is not a team part", () => {
    expect(membersOfCode("short")).toBeNull();
    expect(membersOfCode("abc def ghij kl")).toBeNull();
    expect(membersOfCode("____________")).toBeNull(); // past his team span
    expect(teamOfCode("AAAAAAAAAAAA", teams)).toBeNull();
  });
  it("reads three members and finds their team by loadout ids", () => {
    const m = membersOfCode("bP6aLXA_DWxAO6j7N3SU3NoDaOgx-kZ2")!;
    expect(m).toHaveLength(3);
    for (const x of m) {
      expect(x.loadout % 10).toBeGreaterThanOrEqual(1);
      expect(x.loadout % 10).toBeLessThanOrEqual(4);
      expect(Math.floor(x.loadout / 10)).toBeGreaterThan(1100);
    }
    expect(teamOfCode("x", teams)).toBeNull();
  });
});

describe("the play-mode clock", () => {
  it("starts on the first tap, walks the swaps and closes a lap per section, wrapping to the first loop", () => {
    let s = initPlayer();
    s = advancePlayer(s, plan, 1000);
    expect(s).toMatchObject({ started: true, step: 0, lapSection: 0 });
    expect(elapsedOf(s, 3500)).toEqual({ step: 2.5, lap: 2.5 });
    s = advancePlayer(s, plan, 6000);
    s = advancePlayer(s, plan, 13000);
    expect(s.laps).toHaveLength(0);
    // the opener's last swap → loop 1: one lap, its gap against the engine's pass
    s = advancePlayer(s, plan, 29000);
    expect(s.step).toBe(plan.loopStart);
    expect(s.laps).toEqual([{ section: 0, seconds: 28, target: plan.passSeconds[0] }]);
    expect(gapText(28, plan.passSeconds[0]!)).toMatch(/^\+0\.5 s$/);
    // to the last swap of loop 3, then round to loop 1 again
    let t = 29000;
    while (s.step < plan.steps.length - 1) s = advancePlayer(s, plan, (t += 9000));
    s = advancePlayer(s, plan, (t += 9000));
    expect(s.step).toBe(plan.loopStart);
    expect(s.laps.map((l) => l.section)).toEqual([0, 1, 2, 3]);
    expect(s.lapSection).toBe(1);
  });

  it("pauses without counting the pause, steps back, and is due at the engine's time (or slower)", () => {
    let s = advancePlayer(initPlayer(), plan, 0);
    s = pausePlayer(s, 2000);
    expect(elapsedOf(s, 9000).step).toBe(2);
    s = resumePlayer(s, 9000);
    expect(elapsedOf(s, 10000).step).toBe(3);
    const due = expectedOf(plan, 0) * 1000;
    expect(isDue(s, plan, 7000 + due, 0)).toBe(true);
    expect(isDue(s, plan, 7000 + due - 100, 0)).toBe(false);
    expect(expectedOf(plan, 0, 0.7)).toBeCloseTo(expectedOf(plan, 0) / 0.7, 6);
    s = advancePlayer(s, plan, 20000);
    s = backPlayer(s, plan, 21000);
    expect(s.step).toBe(0);
    expect(elapsedOf(s, 21500).step).toBe(0.5);
  });
});

describe("timeline arithmetic", () => {
  it("offers the fight, the opener and each loop pass", () => {
    const r = rangesOf(model, plan);
    expect(r.map((x) => x.key)).toEqual(["fight", "opener", "loop1", "loop2", "loop3"]);
    expect(r[0]).toMatchObject({ from: 0, to: model.frames });
    expect(r[2]!.to - r[2]!.from).toBe(Math.round(plan.passSeconds[1]! * 60));
  });

  it("reads steps, on-field presses, HP text and ruler steps", () => {
    expect(valueAt([[0, 1], [10, 2], [20, 3]], 15)).toBe(2);
    expect(valueAt([[5, 1]], 4)).toBeNull();
    const lynae = model.visits.find((v) => v.section === 1 && RUN.members[v.member]!.name === "Lynae")!;
    const on = onFieldAt(model, lynae.chips[2]!.frame + 1)!;
    expect(on.visit).toBe(lynae);
    expect(on.chip).toBe(2);
    expect(hpText(1_500_000)).toBe("1.5M");
    expect(hpText(4_000_000)).toBe("4M");
    expect(parseHp("6M")).toBe(6_000_000);
    expect(parseHp("4,500,000")).toBe(4_500_000);
    expect(parseHp("750k")).toBe(750_000);
    expect(parseHp("lots")).toBeNull();
    expect(hpLines(0)).toEqual(BASE_HP);
    expect(hpLines(2_000_000)).toEqual([1_500_000, 2_000_000, 3_000_000, 4_000_000]);
    expect(rulerStep(108, 1000)).toBe(10);
    expect(rulerStep(26, 1000)).toBe(2);
  });

  it("labels loadout variants by the member whose gear differs", () => {
    const base = { teamKey: "t1", names: [], appKeys: [], status: "ok" as const, fieldable: true };
    const best = (echo: string, total: number) => ({ rowKey: "", picks: [], total, bySlot: {}, seconds: 1, members: [{ ...RUN.members[0]! }, { ...RUN.members[1]!, echo }] });
    const v = variantLabels([{ ...base, best: best("Set A", 10) }, { ...base, teamKey: "t2", best: best("Set B", 12) }, { ...base, teamKey: "t3", status: "skipped", reason: "noBuild", best: null }]);
    expect(v.map((x) => x.label)).toEqual(["Lynae: Set A", "Lynae: Set B", "t3"]);
    expect(v[2]!.reason).toBe("noBuild");
  });
});

describe("preferences", () => {
  it("read defaults from garbage and keep what they wrote", () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readPrefs(s)).toEqual(DEFAULT_PREFS);
    store.set(ROTATION_PREFS_KEY, "{not json");
    expect(readPrefs(s)).toEqual(DEFAULT_PREFS);
    store.set(ROTATION_PREFS_KEY, JSON.stringify({ beep: "yes", size: "huge", pace: 3, hp: -1 }));
    expect(readPrefs(s)).toEqual(DEFAULT_PREFS);
    writePrefs({ ...DEFAULT_PREFS, beep: true, size: "xl", pace: 0.85, hp: 5e6, last: "#team=t404", lastTitle: "SK" }, s);
    expect(readPrefs(s)).toEqual({ beep: true, size: "xl", pace: 0.85, hp: 5e6, last: "#team=t404", lastTitle: "SK" });
  });
});

describe("on the real engine", () => {
  it("reads a fresh trace the same way, one row per counted line", async () => {
    const { rileyHeadless } = await import("../engine/rileyNode");
    const { SYNTHETIC_ACCOUNT, SYNTHETIC_TEAM } = await import("../engine/__fixtures__/syntheticAccount");
    const { traceLive } = await import("../engine/rileyRun");
    const riley = await rileyHeadless(SYNTHETIC_ACCOUNT);
    const best = riley.bestFor(SYNTHETIC_TEAM)!;
    const run = riley.tracedRun(best.teamKey, best.best!.picks);
    const m = extractRotation(run);
    const p = cuePlan(m);
    // parity: every line his report counts (field summaries are display-only) is a row, and a lane tick or a slot row
    const live = traceLive(riley.engine, best.teamKey, best.best!.picks, { account: riley.account, blocked: riley.blocked }).run;
    const lines = (live.rotationLines as Array<Array<{ aggregate?: boolean }>>).flat().filter((l) => !l.aggregate).length;
    expect(run.rows.length).toBe(lines);
    expect(m.lanes.reduce((n, l) => n + l.ticks.length, 0) + run.rows.filter((r) => r.member < 0).length).toBe(lines);
    expect(m.visits.reduce((n, v) => n + (v.end - v.start), 0)).toBe(m.frames);
    expect(m.fightTotal / (run.total * run.seconds)).toBeCloseTo(1, 4);
    expect(p.blocks[0]!.title).toBe("Opener");
    expect(p.steps.length).toBeGreaterThan(3);
    // the hue the team list now carries
    expect(riley.teams.find((t) => t.key === best.teamKey)!.members.every((mm) => /^#[0-9a-f]{6}$/i.test(mm.hue ?? ""))).toBe(true);
  }, 60_000);

  it("reads every team's /rankings team code to the team his tagTeam() names", async () => {
    const { rileyHeadless } = await import("../engine/rileyNode");
    const riley = await rileyHeadless(null);
    const M = riley.engine.model;
    let read = 0;
    for (const t of riley.teams) {
      const rowKey = `${t.key}-${t.members.map(() => "0.0.0.s0.r1").join("-")}`;
      const code = M.teamTag(rowKey) as string;
      if (code === rowKey) continue; // a key his code cannot hold is written out plain
      expect(teamOfCode(code, riley.teams)).toBe(M.tagTeam(code));
      expect(teamOfCode(code, riley.teams)).toBe(t.key);
      // the team part alone (gear left to the solver) names the same team
      expect(teamOfCode(code.slice(0, 12), riley.teams)).toBe(t.key);
      read++;
    }
    expect(read).toBeGreaterThan(200);
  }, 60_000);
});
