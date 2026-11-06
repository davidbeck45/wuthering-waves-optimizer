// Wuthering Tools+ — "Whole account": the page's words (accountView.ts), on hand-made results.
import { describe, expect, it } from "vitest";
import type { AccountMember, BuildAccountResult } from "./buildAccount";
import { accountRatio, buildCountText, confirmItems, erNeedsMet, memberNote, moveText, ratioText, ratioTone, searchLine, secondsText, whyLower } from "./accountView";

/* eslint-disable @typescript-eslint/no-explicit-any */

const member = (over: Partial<AccountMember>): AccountMember =>
  ({
    slot: 0,
    characterId: "Aemeath",
    status: "ok",
    objective: null,
    constraints: null,
    before: { value: 100, menuEr: 110, withRunBuffs: null },
    after: { value: 98, optimizerValue: 98, menuEr: 116, picks: [] },
    erFloor: 115.1,
    erMet: true,
    erUnreachable: false,
    mainEchoFallback: false,
    relaxed: "plan",
    keptCurrent: false,
    sameEchoes: false,
    setsWorn: {},
    meetsPlanSets: true,
    buffDefaults: [],
    combos: 0,
    fromBuild: { id: null, name: null, source: "active" },
    draft: {},
    team: 0,
    alsoIn: [],
    ...over,
  }) as AccountMember;

const search = (over: Partial<BuildAccountResult["search"]> = {}): BuildAccountResult["search"] => ({ baseline: 1, kept: "search", greedy: 1, value: 1, moves: [], stoppedBy: "converged", rounds: 1, conflicts: 0, ms: 10, locked: [], ...over });

describe("account view", () => {
  it("says changes as signed percentages with a tone", () => {
    expect(ratioText(1.032)).toBe("+3.2 %");
    expect(ratioText(0.985)).toBe("−1.5 %");
    expect(ratioText(1.0001)).toBe("±0 %");
    expect(ratioTone(1.01)).toBe("up");
    expect(ratioTone(0.99)).toBe("down");
    expect(accountRatio({ today: 1.8 }, 1.8 * 1.02)).toBeCloseTo(1.02, 9);
  });

  it("counts the builds the button saves, and says who keeps their echoes, so the review and 'Save 9 builds' agree", () => {
    const ok = (n: number) => Array.from({ length: n }, () => member({}));
    expect(buildCountText(ok(11), 9)).toBe("9 new builds, 2 keep today's echoes");
    expect(buildCountText(ok(4), 3)).toBe("3 new builds, 1 keeps today's echoes");
    expect(buildCountText(ok(3), 3)).toBe("3 new builds");
    expect(buildCountText(ok(1), 1)).toBe("1 new build");
    expect(buildCountText(ok(2), 0)).toBe("No new builds, 2 keep today's echoes");
    expect(buildCountText([...ok(2), member({ status: "noEchoes" })], 2)).toBe("2 new builds"); // a member the plan could not build keeps nothing new, and says so on their row
  });

  it("counts Energy Regen needs met today and with the plan", () => {
    const members = [member({}), member({ characterId: "Lynae", before: { value: 1, menuEr: 130, withRunBuffs: null }, erFloor: 121 }), member({ characterId: "Shorekeeper", erMet: false, erFloor: 240, before: { value: 1, menuEr: 230, withRunBuffs: null } }), member({ characterId: "Chisa", status: "noEchoes" })];
    expect(erNeedsMet(members)).toEqual({ before: 1, after: 2, of: 3 });
  });

  it("explains a plan below today: ER needs met, else the plans' limits", () => {
    const lower = { score: { today: 2, greedy: 1.98, final: 1.98 }, members: [member({})] };
    expect(whyLower(lower)).toMatch(/1 more build now meets the Energy Regen/);
    expect(whyLower({ ...lower, members: [member({ before: { value: 1, menuEr: 120, withRunBuffs: null } })] })).toMatch(/plans' sets/);
    expect(whyLower({ ...lower, score: { today: 2, greedy: 2, final: 2.01 } })).toBeNull();
  });

  it("says what the improvement pass did, and when the calculator kept the first pass", () => {
    expect(searchLine({ search: search(), score: { today: 1, greedy: 1, final: 1 } })).toMatch(/No two members can use the same echoes/);
    expect(searchLine({ search: search({ conflicts: 3, stoppedBy: "budget" }), score: { today: 1, greedy: 1, final: 1 } })).toMatch(/checked 3 pairs .* time ran out/);
    const moved = search({ conflicts: 2, moves: [{ kind: "pair", first: 1, then: 0, gain: 0.01, round: 0, characters: ["A", "B"] }] });
    expect(searchLine({ search: moved, score: { today: 2, greedy: 2, final: 2.04 } })).toMatch(/kept 1 change: \+2\.0 points/);
    expect(searchLine({ search: { ...moved, kept: "greedy" }, score: { today: 2, greedy: 2, final: 2 } })).toMatch(/calculator's team totals scored the first pass higher/);
  });

  it("notes per member in words", () => {
    expect(memberNote(member({}))).toMatch(/now meets the 115\.1 % Energy Regen need \(today 110\.0 %\)/);
    expect(memberNote(member({ erMet: false, erUnreachable: true, erFloor: 240 }))).toMatch(/out of reach.*the most ER found/);
    // the search read it as met: no search for the most ER ran, so the note can't claim one
    const misread = memberNote(member({ erMet: false, erUnreachable: false, erFloor: 230 }));
    expect(misread).toMatch(/short of 230\.0 % Energy Regen on the character screen/);
    expect(misread).not.toMatch(/most ER/);
    expect(memberNote(member({ keptCurrent: true, sameEchoes: true, erFloor: null, erMet: null }))).toBe("keeps today's echoes");
    // a swap changed a member who had kept today's build: their echoes are not today's, so no note may say they are
    expect(memberNote(member({ keptCurrent: true, sameEchoes: false, erFloor: null, erMet: null, relaxed: null }))).toBeNull();
    // the same echoes scoring more is the run's buffs switched on, not a better build: said by name (Build my team's rule)
    const buffed = { keptCurrent: true, sameEchoes: true, erFloor: null, erMet: null, before: { value: 100, menuEr: 110, withRunBuffs: 103 }, after: { value: 103, optimizerValue: 103, menuEr: 110, picks: [] }, buffDefaults: ["SongofFeatheredTrace5SetChongming"] };
    expect(memberNote(member(buffed))).toMatch(/same echoes as today: the change is Song of Feathered Trace 5pc \(Chongming\), switched on/i);
    // the search found today's echoes on its own: still true to say so
    expect(memberNote(member({ keptCurrent: false, sameEchoes: true, erFloor: null, erMet: null }))).toMatch(/keeps today's echoes/);
    expect(memberNote(member({ status: "noEchoes", message: "No Moonlit Clouds echoes." }))).toBe("No Moonlit Clouds echoes.");
    expect(memberNote(member({ erFloor: null, erMet: null, relaxed: "layout" }))).toMatch(/any cost layout/);
  });

  it("names a moving echo and the confirm's items", () => {
    expect(moveText({ echoId: "1", echo: "Hecate", set: "MidnightVeil", cost: 4, stat: "CritDMG", to: "Lucilla", from: ["Chisa"] })).toMatch(/^Hecate \(4-cost Crit DMG, .+\): Chisa → Lucilla$/);
    const r = { teams: [{ spec: { id: "s1", name: "My team" } }] } as unknown as BuildAccountResult;
    expect(confirmItems(r, [{ characterId: "Aemeath", pins: [{ teamId: "s1", slot: 0 }] }], true, { Aemeath: "Account plan (2)" })).toEqual(["Aemeath: new build “Account plan (2)”, pinned in “My team” slot 1, made active"]);
    expect(secondsText(48_400)).toBe("48 s");
    expect(secondsText(72_000)).toBe("1 min 12 s");
  });
});
