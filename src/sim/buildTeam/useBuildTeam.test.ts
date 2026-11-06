// Wuthering Tools+ One team: a review stands for the account it was planned on, and a save is all or nothing. The real
// stores; the run is canned, since what is under test is what the page does around it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { refusedStores } from "../storage/persistGuard";
import { clearUndo, readUndo, SaveRefused } from "./apply";
import { buildMyTeam } from "./buildTeam";
import { rankedTeamImpact } from "../account/investPlan";
import { clearKeptReview, useBuildTeam } from "./useBuildTeam";

vi.mock("./buildTeam", async (original) => ({ ...(await original<typeof import("./buildTeam")>()), buildMyTeam: vi.fn() }));
vi.mock("./plans", () => ({ plansForTeam: vi.fn(async () => ({ plans: [{ share: null, mainDps: false }, { share: null, mainDps: false }, null], riley: null })) }));
vi.mock("./workerBackend", () => ({ workerBackend: () => ({ dispose() {} }) }));
vi.mock("../engine/rileyClient", () => ({ rileyClient: () => ({}) }));
vi.mock("../engine/rileyAccount", () => ({ rileyAccountOf: () => ({}) }));
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
