// Wuthering Tools+ One team: a review stands for the account it was planned on, and a save is all or nothing. The real
// stores; the run is canned, since what is under test is what the page does around it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, type EffectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { refusedStores } from "../storage/persistGuard";
import { clearUndo, readUndo, SaveRefused } from "./apply";
import { buildMyTeam, teamFigureOf } from "./buildTeam";
import { rankedTeamImpact } from "../account/investPlan";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { clearKeptReview, OPTIONS_KEY, SWITCH_CHANGED_TEXT, TEAM_CHANGED_TEXT, useBuildTeam } from "./useBuildTeam";

vi.mock("./buildTeam", async (original) => ({ ...(await original<typeof import("./buildTeam")>()), buildMyTeam: vi.fn(), teamFigureOf: vi.fn(async () => null) }));
vi.mock("./plans", () => ({ plansForTeam: vi.fn(async () => ({ plans: [{ share: null, mainDps: false }, { share: null, mainDps: false }, null], riley: null })) }));
vi.mock("./workerBackend", () => ({ workerBackend: () => ({ dispose() {} }) }));
const solveMine = vi.hoisted(() => vi.fn());
vi.mock("../engine/rileyClient", () => ({ rileyClient: () => ({ solveMine }) }));
vi.mock("../engine/rileyAccount", () => ({ rileyAccountOf: vi.fn(() => ({})) }));
vi.mock("../account/investPlan", () => ({ rankedTeamImpact: vi.fn() }));

const member = (slot: number, characterId: string) => ({ slot, characterId, status: "ok", draft: { weapon: `w-${characterId}`, echoes: {} }, sameEchoes: false, fromBuild: { id: null, name: null, source: "active" }, before: { value: 100, menuEr: null, withRunBuffs: null }, after: { value: 110, optimizerValue: 110, menuEr: null, withTeam: null, picks: [] }, erMet: null, erFloor: null });
const run = () => ({ members: [member(0, "A"), member(1, "B")], order: [0, 1], ordersTried: 1, swaps: [], objectiveKind: "team", team: null, fromOthers: [], ms: 1 });

async function review() {
  const bt = useBuildTeam();
  await bt.load({ teamId: "t1", members: [] });
  await bt.run();
  expect(bt.phase.value).toBe("result");
  return bt;
}

describe("One team's review and save", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    clearUndo();
    clearKeptReview();
    refusedStores.value = [];
    vi.mocked(buildMyTeam).mockReset().mockImplementation(async () => run() as never);
    useCharacterStore().characters = { A: { weapon: "old-A" }, B: { weapon: "old-B" } };
    useInventoryStore().echoes = [];
    useTeamRotationsStore().teams = [{ id: "t1", name: "Team", characterIds: ["A", "B", null], buildIds: [null, null, null], actions: [] }];
  });

  it("Undo on a review planned after the undone save drops the review: it read 7.29M with the build back at 7.07M", async () => {
    const bt = await review();
    await bt.save(true);
    await bt.run(); // planned again, on the saved builds
    expect(bt.applied.value).toBeNull();
    bt.undo();
    expect(bt.result.value).toBeNull();
    expect(bt.toSave.value).toEqual([]);
  });

  it("Build on a team another tab changed after it was read reads it again and runs nothing (2026-11-08 hunt H1)", async () => {
    const bt = useBuildTeam();
    await bt.load({ teamId: "t1", members: [] });
    useTeamRotationsStore().teams[0].characterIds = ["A", "C", null]; // the other tab put C in B's slot
    vi.mocked(buildMyTeam).mockClear();

    await bt.run();

    expect(buildMyTeam).not.toHaveBeenCalled();
    expect(bt.team.value?.characterIds).toEqual(["A", "C", null]);
    expect(bt.phase.value).toBe("plan");
    expect(bt.error.value).toBe(TEAM_CHANGED_TEXT);
    expect(bt.planIsCurrent()).toBe(true);
    await bt.run();
    expect(buildMyTeam).toHaveBeenCalledOnce();
  });

  it("Undo of the save the review made keeps the review", async () => {
    const bt = await review();
    await bt.save(false);
    bt.undo();
    expect(bt.result.value).not.toBeNull();
    expect(bt.applied.value).toBeNull();
  });

  it("refuses to save a review of an account that changed since", async () => {
    const bt = await review();
    useCharacterStore().characters.A.weapon = "edited elsewhere";
    const failed = await bt.save(false).catch((e) => e);
    expect(failed).toBeInstanceOf(SaveRefused);
    expect(failed.reason).toBe("stale");
    expect(useCharacterStore().characters.A.builds).toBeUndefined();
    expect(bt.result.value).toBeNull();
  });

  it("a write the browser refused takes the whole save back, and the save before keeps its undo", async () => {
    const bt = await review();
    const first = await bt.save(false);
    await bt.run();
    const before = JSON.stringify(useCharacterStore().characters);
    refusedStores.value = ["teamRotations"];
    const failed = await bt.save(true).catch((e) => e);
    expect(failed).toBeInstanceOf(SaveRefused);
    expect(failed.reason).toBe("storage");
    expect(JSON.stringify(useCharacterStore().characters)).toBe(before);
    expect(bt.applied.value).toBeNull();
    expect(readUndo()?.at).toBe(first!.undo.at);
  });

  it("a store write that throws leaves nothing half-saved", async () => {
    const bt = await review();
    const store = useCharacterStore();
    const before = JSON.stringify(store.characters);
    const real = store.equipBuild;
    let calls = 0;
    store.equipBuild = ((id: string, buildId: string) => {
      calls += 1;
      if (calls === 2) throw new Error("injected");
      real(id, buildId);
    }) as never;
    await expect(bt.save(true)).rejects.toThrow("injected");
    expect(JSON.stringify(store.characters)).toBe(before);
    expect(readUndo()).toBeNull();
    expect(bt.applied.value).toBeNull();
  });

  it("Cancel then Build again: the cancelled run's end leaves the second run's page alone (step 1 showed for a second)", async () => {
    const bt = useBuildTeam();
    await bt.load({ teamId: "t1", members: [] });
    let cancelled: (reason: unknown) => void = () => {};
    let finish: (value: unknown) => void = () => {};
    vi.mocked(buildMyTeam)
      .mockImplementationOnce(() => new Promise((_, reject) => (cancelled = reject)) as never)
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)) as never);
    const first = bt.run();
    bt.cancel();
    const second = bt.run();
    expect(bt.phase.value).toBe("running");
    cancelled(Object.assign(new Error("The build was cancelled"), { name: "AbortError" })); // member setup ends late
    await first;
    expect(bt.phase.value).toBe("running");
    finish(run());
    await second;
    expect(bt.phase.value).toBe("result");
  });

  it("a run the player cancelled for good still lands on the plan", async () => {
    const bt = useBuildTeam();
    await bt.load({ teamId: "t1", members: [] });
    let cancelled: (reason: unknown) => void = () => {};
    vi.mocked(buildMyTeam).mockImplementationOnce(() => new Promise((_, reject) => (cancelled = reject)) as never);
    const pending = bt.run();
    bt.cancel();
    cancelled(Object.assign(new Error("The build was cancelled"), { name: "AbortError" }));
    await pending;
    expect(bt.phase.value).toBe("plan");
  });

  describe("the team total reads what the Save gets", () => {
    /** Phrolova's team on the export: the headline read 6.52M with every new build, the 1 build the Save writes read 7.01M */
    const headlineRun = () => ({ ...run(), team: { before: 683, after: 652, dpsBefore: null, dpsAfter: null } });
    const lower = (m: ReturnType<typeof member>) => ({ ...m, after: { ...m.after, value: 90 } });
    const figure = (ticks: readonly boolean[]) => {
      const n = ticks.filter(Boolean).length;
      return { after: n === 1 ? 701 : n === 2 ? 652 : 683, dpsAfter: null, perSlot: [n ? 601 : 583, ticks[1] ? 100 : 95] };
    };
    const settle = async (): Promise<void> => {
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const reviewed = async () => {
      vi.mocked(buildMyTeam).mockImplementation(async () => {
        const out = headlineRun();
        out.members[1] = lower(out.members[1]!) as never;
        return out as never;
      });
      vi.mocked(teamFigureOf).mockImplementation(async (_r, _t, _c, _e, ticks) => figure(ticks));
      return review();
    };
    const ask = () => vi.mocked(teamFigureOf).mock.calls;
    beforeEach(() => {
      vi.mocked(teamFigureOf).mockReset().mockResolvedValue(null);
    });

    it("opens on the builds the default Save writes: the headline read -4.6 % over a Save worth +2.6 %", async () => {
      const bt = await reviewed();
      expect(bt.saveSlots.value).toEqual([true, false]);
      expect(bt.teamFigure.value?.after).toBe(701);
      expect(bt.toSave.value.map((m) => m.characterId)).toEqual(["A"]);
    });

    /** the calculator's total per set of ticks ("10": the first member's build alone); today's with none */
    const totals = (before: number, by: Record<string, number>) => {
      vi.mocked(buildMyTeam).mockImplementation(async () => ({ ...run(), team: { before, after: by["11"]!, dpsBefore: null, dpsAfter: null } }) as never);
      vi.mocked(teamFigureOf).mockImplementation(async (_r, _t, _c, _e, ticks) => ({ after: by[ticks.map((t) => (t ? "1" : "0")).join("")] ?? before, dpsAfter: null, perSlot: [0, 0] }));
    };

    it("opens on the set of builds that reads the most, not on each member judged alone (hunt round 2, M1: both ticked read -15.2 %)", async () => {
      // each build scores more on its own part (100 → 110), so each alone was ticked; together the team reads lower
      totals(766, { "10": 789, "01": 648, "11": 650 });
      const bt = await review();
      expect(bt.saveSlots.value).toEqual([true, false]);
      expect(bt.saveWhy.value).toBe("best");
      expect(bt.teamFigure.value?.after).toBe(789);
      expect(bt.toSave.value.map((m) => m.characterId)).toEqual(["A"]);
    });

    it("ticks nothing when no set of the new builds beats the team as it is, and the review keeps its reason on the way back", async () => {
      totals(766, { "10": 760, "01": 648, "11": 650 });
      const bt = await review();
      expect(bt.saveSlots.value).toEqual([false, false]);
      expect(bt.saveWhy.value).toBe("none");
      expect(bt.toSave.value).toEqual([]);
      expect(bt.teamFigure.value?.after).toBe(766);
      const back = useBuildTeam();
      await back.load({ teamId: "t1", members: [] });
      expect(back.phase.value).toBe("result");
      expect(back.saveSlots.value).toEqual([false, false]);
      expect(back.saveWhy.value).toBe("none");
    });

    it("moves with the ticks, every way round, and the cards with it", async () => {
      const bt = await reviewed();
      expect(bt.reviewMembers.value[0]!.after!.withTeam).toBe(601);
      // not saved: her card reads the build she keeps beside the ticked one, what the Save gets (hunt 2 item 1)
      expect(bt.reviewMembers.value[1]!.after!.withTeam).toBe(95);
      expect(bt.reviewMembers.value[1]!.after!.kept).toBe(true);
      bt.saveSlots.value[1] = true;
      await settle();
      expect(bt.teamFigure.value?.after).toBe(652);
      expect(bt.reviewMembers.value[1]!.after!.withTeam).toBe(100);
      expect(bt.reviewMembers.value[1]!.after!.kept).toBeFalsy();
      bt.saveSlots.value = [false, false];
      await settle();
      expect(bt.teamFigure.value?.after).toBe(683);
    });

    it("an older answer never lands over a newer tick", async () => {
      const bt = await reviewed();
      let slow: (f: ReturnType<typeof figure>) => void = () => {};
      vi.mocked(teamFigureOf).mockImplementationOnce(() => new Promise((resolve) => (slow = resolve as typeof slow)));
      bt.saveSlots.value[1] = true;
      await settle();
      expect(bt.teamFigureBusy.value).toBe(true);
      bt.saveSlots.value[1] = false;
      await settle();
      expect(bt.teamFigure.value?.after).toBe(701);
      slow(figure([true, true]));
      await settle();
      expect(bt.teamFigure.value?.after).toBe(701);
      expect(bt.teamFigureBusy.value).toBe(false);
    });

    it("a total that cannot be worked out reads blank, not the figure of other builds", async () => {
      const bt = await reviewed();
      vi.mocked(teamFigureOf).mockRejectedValueOnce(new Error("no"));
      bt.saveSlots.value[1] = true;
      await settle();
      expect(bt.teamFigure.value).toBeNull();
      expect(bt.teamFigureBusy.value).toBe(false);
    });

    it("comes back with the review, ticks and figure together, with no second run", async () => {
      const first = await reviewed();
      first.saveSlots.value[1] = true;
      await settle();
      const calls = ask().length;
      const back = useBuildTeam();
      await back.load({ teamId: "t1", members: [] });
      await settle();
      expect(back.phase.value).toBe("result");
      expect(back.saveSlots.value).toEqual([true, true]);
      expect(back.teamFigure.value?.after).toBe(652);
      expect(ask()).toHaveLength(calls);
      back.saveSlots.value[1] = false; // and still follows them
      await settle();
      expect(back.teamFigure.value?.after).toBe(701);
    });

    it("leaves a review of an account that changed since alone: Save refuses it", async () => {
      const bt = await reviewed();
      const calls = ask().length;
      useCharacterStore().characters.A.weapon = "edited elsewhere";
      bt.saveSlots.value[1] = true;
      await settle();
      expect(ask()).toHaveLength(calls);
    });

    it("a cancel while the headline is worked out leaves no review behind", async () => {
      vi.mocked(buildMyTeam).mockImplementation(async () => headlineRun() as never);
      let slow: (f: ReturnType<typeof figure>) => void = () => {};
      vi.mocked(teamFigureOf).mockImplementationOnce(() => new Promise((resolve) => (slow = resolve as typeof slow)));
      const bt = useBuildTeam();
      await bt.load({ teamId: "t1", members: [] });
      const pending = bt.run();
      await settle();
      bt.cancel();
      slow(figure([true, true]));
      await pending;
      expect(bt.phase.value).toBe("plan");
      expect(bt.result.value).toBeNull();
    });

    describe("wuwa_calc's figure", () => {
      const withRiley = async () => {
        const plans = await import("./plans");
        vi.mocked(plans.plansForTeam).mockResolvedValueOnce({ plans: [{ share: null, mainDps: false }, { share: null, mainDps: false }, null], riley: { teamKey: "k" }, dpsMine: 500 } as never);
        return reviewed();
      };
      beforeEach(() => {
        solveMine.mockReset().mockResolvedValue([{ best: { total: 640 } }]);
      });

      it("reads the ticked builds and moves with them; nothing ticked is today's", async () => {
        const accountOf = vi.mocked((await import("../engine/rileyAccount")).rileyAccountOf);
        accountOf.mockClear();
        const bt = await withRiley();
        await settle();
        expect(bt.rileyAfter.value).toBe(640);
        const worn = accountOf.mock.calls.at(-1)![0] as Record<string, { weapon?: string }>;
        expect(worn.A!.weapon).toBe("w-A");
        expect(worn.B!.weapon).toBe("old-B"); // not ticked: not worn
        bt.saveSlots.value = [false, false];
        await settle();
        expect(bt.rileyAfter.value).toBe(500);
      });

      it("a figure that fails says so rather than loading for good", async () => {
        solveMine.mockRejectedValue(new Error("engine"));
        const bt = await withRiley();
        await settle();
        expect(bt.rileyAfter.value).toBeNull();
        expect(bt.rileyAfterBusy.value).toBe(false);
      });
    });
  });

  describe("a review you leave", () => {
    const REQUEST = { teamId: "t1", members: [] };

    it("is still there on the same team: Back then Forward lost the plan and cost a re-run", async () => {
      const first = await review();
      const shown = first.result.value;
      first.saveSlots.value = [true, false];

      const back = useBuildTeam(); // leaving the page and coming back makes the page again
      await back.load(REQUEST);
      expect(back.phase.value).toBe("result");
      expect(back.result.value).toBe(shown);
      expect(back.saveSlots.value).toEqual([true, false]);
      expect(back.plans.value).not.toBeNull();
      expect(vi.mocked(buildMyTeam)).toHaveBeenCalledTimes(1);
      expect(await back.save(false)).not.toBeNull(); // and it saves: it stands for this account
    });

    it("comes back through the picker on the same page too: Back there is only a change of address", async () => {
      const bt = await review();
      await bt.load({ members: [] });
      expect(bt.phase.value).toBe("pick");
      await bt.load(REQUEST);
      expect(bt.phase.value).toBe("result");
    });

    it("stays with its own team and its own account", async () => {
      await review();
      useTeamRotationsStore().teams = [...useTeamRotationsStore().teams, { id: "t2", name: "Other", characterIds: ["A", "B", null], buildIds: [null, null, null], actions: [] }];
      const other = useBuildTeam();
      await other.load({ teamId: "t2", members: [] });
      expect(other.phase.value).toBe("plan");

      useCharacterStore().characters = { A: { weapon: "new-A" }, B: { weapon: "old-B" } };
      const changed = useBuildTeam();
      await changed.load(REQUEST);
      expect(changed.phase.value).toBe("plan");
      expect(changed.result.value).toBeNull();
    });

    it("goes with Change plan and with a save: neither comes back", async () => {
      const first = await review();
      first.backToPlan();
      expect(first.phase.value).toBe("plan");
      const again = useBuildTeam();
      await again.load(REQUEST);
      expect(again.phase.value).toBe("plan");

      const saved = await review();
      await saved.save(false);
      const after = useBuildTeam();
      await after.load(REQUEST);
      expect(after.phase.value).toBe("plan");
    });
  });

  describe("the team figure of the /account row that opened the page", () => {
    const FIGURE = { teamId: "wuwa_calc:x", teamName: "x", characterIds: ["A", "B"], base: 100, avgDamage: 108.8, gain: 0.088 };
    const REQUEST = { teamId: "t1", members: [], only: "A", rankedTeam: "wuwa_calc:x" };
    const settle = async (): Promise<void> => {
      await vi.dynamicImportSettled();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    async function opened(request: Parameters<ReturnType<typeof useBuildTeam>["load"]>[0] = REQUEST) {
      const bt = useBuildTeam();
      await bt.load(request);
      await bt.run();
      await settle();
      return bt;
    }

    beforeEach(() => {
      vi.mocked(rankedTeamImpact).mockReset().mockResolvedValue(FIGURE);
    });

    it("is scored on the row's team with the new build worn", async () => {
      const bt = await opened();
      expect(bt.rankedFigure.value).toEqual(FIGURE);
      const [id, characters, , , hypo] = vi.mocked(rankedTeamImpact).mock.calls[0]!;
      expect(id).toBe("wuwa_calc:x");
      expect(characters.A.weapon).toBe("old-A");
      expect(hypo.A.weapon).toBe("w-A");
      expect(hypo.B.weapon).toBe("old-B");
    });

    it("is left out without a row: a plain visit to the team, or the whole team", async () => {
      expect((await opened({ teamId: "t1", members: [] })).rankedFigure.value).toBeNull();
      expect((await opened({ teamId: "t1", members: [], rankedTeam: "wuwa_calc:x" })).rankedFigure.value).toBeNull();
      expect(rankedTeamImpact).not.toHaveBeenCalled();
    });

    it("is left out when the run re-gears another build than the one the row's figure reads", async () => {
      vi.mocked(buildMyTeam).mockImplementation(async () => {
        const out = run();
        (out.members[0]!.fromBuild as unknown) = { id: "b2", name: "Other", source: "team" };
        return out as never;
      });
      expect((await opened()).rankedFigure.value).toBeNull();
      expect(rankedTeamImpact).not.toHaveBeenCalled();
    });

    it("never lands on a later run's review", async () => {
      let finish: (figure: typeof FIGURE) => void = () => {};
      vi.mocked(rankedTeamImpact).mockReturnValueOnce(new Promise((resolve) => (finish = resolve as typeof finish)));
      const bt = await opened();
      await bt.run();
      await settle();
      finish({ ...FIGURE, gain: 9 });
      await settle();
      expect(bt.rankedFigure.value?.gain).toBe(FIGURE.gain);
    });

    it("comes back with the review, and goes when the page is told to plan again", async () => {
      const first = await opened();
      const back = useBuildTeam();
      await back.load(REQUEST);
      await settle();
      expect(back.phase.value).toBe("result");
      expect(back.rankedFigure.value).toEqual(FIGURE);
      back.backToPlan();
      await back.run();
      await settle();
      expect(vi.mocked(rankedTeamImpact)).toHaveBeenCalledTimes(2);
      expect(first.only.value).toBe("A");
    });

    it("costs the review nothing when it can't be worked out", async () => {
      vi.mocked(rankedTeamImpact).mockRejectedValue(new Error("no worker"));
      const bt = await opened();
      expect(bt.phase.value).toBe("result");
      expect(bt.rankedFigure.value).toBeNull();
    });
  });
});

// Last in the file: the pages above are made outside any component, so their switch watchers are never stopped
describe("One team and the team-buff switch (2026-11-08 hunt F2)", () => {
  const REQUEST = { teamId: "t1", members: [] };
  let scope: EffectScope;
  const page = () => scope.run(() => useBuildTeam())!;
  async function reviewed() {
    const bt = page();
    await bt.load(REQUEST);
    await bt.run();
    expect(bt.phase.value).toBe("result");
    return bt;
  }
  beforeEach(async () => {
    // the pages the tests above made (never unmounted) answer this flip and are done with the switch: only this
    // block's pages answer the flips below, as only the mounted page does in the app
    autoTeamBuffs.value = false;
    await nextTick();
    autoTeamBuffs.value = true;
    await nextTick();
    scope = effectScope();
    setActivePinia(createPinia());
    localStorage.clear();
    clearUndo();
    clearKeptReview();
    refusedStores.value = [];
    vi.mocked(buildMyTeam).mockReset().mockImplementation(async () => run() as never);
    useCharacterStore().characters = { A: { weapon: "old-A" }, B: { weapon: "old-B" } };
    useInventoryStore().echoes = [];
    useTeamRotationsStore().teams = [{ id: "t1", name: "Team", characterIds: ["A", "B", null], buildIds: [null, null, null], actions: [] }];
  });
  afterEach(async () => {
    scope.stop();
    autoTeamBuffs.value = true;
    await nextTick();
  });

  it("a review kept for Back is not restored under the other switch: it read 9.46M → 9.34M, Mornye 132K, where the page gives 87.3K", async () => {
    await reviewed();
    scope.stop(); // the page is left (/account) before the switch moves
    scope = effectScope();
    autoTeamBuffs.value = false;
    await nextTick();
    const back = page();
    await back.load(REQUEST);
    expect(back.result.value).toBeNull();
    expect(back.phase.value).toBe("plan");
    expect(back.error.value).toBe(SWITCH_CHANGED_TEXT);
    expect(vi.mocked(buildMyTeam)).toHaveBeenCalledTimes(1); // nothing re-run without a Build
  });

  it("the review on the page is put down when the switch moves, and the plan says why", async () => {
    const bt = await reviewed();
    autoTeamBuffs.value = false;
    await nextTick();
    expect(bt.result.value).toBeNull();
    expect(bt.phase.value).toBe("plan");
    expect(bt.error.value).toBe(SWITCH_CHANGED_TEXT);
    const back = page(); // and Back finds no review either
    await back.load(REQUEST);
    expect(back.result.value).toBeNull();
  });

  it("a run in flight when the switch moves never lands", async () => {
    const bt = page();
    await bt.load(REQUEST);
    let finish: (value: unknown) => void = () => {};
    vi.mocked(buildMyTeam).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)) as never);
    const pending = bt.run();
    expect(bt.phase.value).toBe("running");
    autoTeamBuffs.value = false;
    await nextTick();
    finish(run());
    await pending;
    expect(bt.result.value).toBeNull();
    expect(bt.phase.value).toBe("plan");
    expect(bt.error.value).toBe(SWITCH_CHANGED_TEXT);
    await bt.run(); // Build again runs under the switch as it is now
    expect(vi.mocked(buildMyTeam).mock.calls.at(-1)?.[0].autoTeamBuffs).toBe(false);
    expect(bt.phase.value).toBe("result");
  });

  it("still comes back under the switch it was planned on, with the options it ran with", async () => {
    const first = page();
    await first.load(REQUEST);
    first.options.tryAllOrders = true;
    await first.run();
    expect(first.phase.value).toBe("result");
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({ tryAllOrders: false })); // Whole account saved others since
    const back = page();
    await back.load(REQUEST);
    expect(back.phase.value).toBe("result");
    expect(back.options.tryAllOrders).toBe(true);
  });
});
