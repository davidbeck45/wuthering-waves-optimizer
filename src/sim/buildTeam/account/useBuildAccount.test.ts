// Wuthering Tools+ "Whole account": a review stands for the account it was planned on, and a save is all or nothing. The
// real stores; the plan itself is canned, since what is under test is what the page does around it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, type EffectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../../stores/character";
import { useInventoryStore } from "../../../stores/inventory";
import { useTeamRotationsStore } from "../../../stores/teamRotations";
import { refusedStores } from "../../storage/persistGuard";
import { saveFailedText, SaveRefused, UndoRefused, type BuildTeamStores } from "../apply";
import { accountApplyRequest, clearAccountUndo, readAccountUndo, saveAccountPlan, undoAccountPlan } from "./accountApply";
import { accountTeamChoices } from "./accountTeams";
import { buildAccount } from "./buildAccount";
import { ACCOUNT_CHOICE_KEY, clearKeptPlan, ROWS_CHANGED_TEXT, useBuildAccount } from "./useBuildAccount";
import { autoTeamBuffs } from "../../teamContext/autoTeamBuffs";
import { OPTIONS_KEY, SWITCH_CHANGED_TEXT } from "../useBuildTeam";

vi.mock("./accountTeams", async (original) => ({ ...(await original<typeof import("./accountTeams")>()), accountTeamChoices: vi.fn() }));
vi.mock("./buildAccount", async (original) => ({ ...(await original<typeof import("./buildAccount")>()), buildAccount: vi.fn() }));
vi.mock("../plans", () => ({ plansForTeam: vi.fn(async () => ({ plans: [null, null, null] })) }));
vi.mock("../workerBackend", () => ({ workerBackend: () => ({ dispose() {} }) }));
vi.mock("../../engine/rileyClient", () => ({ rileyClient: () => ({}) }));
vi.mock("../../engine/rileyAccount", () => ({ rileyAccountOf: () => ({}) }));

const CHOICE = { id: "t1", name: "Team", source: "yours", characterIds: ["A", "B"], avgDamage: 100, dps: null, duplicates: 0, spec: { id: "t1", name: "Team", characterIds: ["A", "B", null] } };

const member = (characterId: string, over: Record<string, unknown> = {}) => ({
  characterId,
  status: "ok",
  draft: { weapon: `w-${characterId}`, echoes: {} },
  sameEchoes: false,
  alsoIn: [],
  fromBuild: { id: null, name: null, source: "active" },
  before: { value: 100, menuEr: null, withRunBuffs: null },
  after: { value: 110, optimizerValue: 110, menuEr: null, withTeam: null, picks: [] },
  ...over,
});
const plan = () => ({ members: [member("A"), member("B")], teams: [{ index: 0, spec: { id: "t1", name: "Team" }, weight: 1, slots: [{ slot: 0, member: 0, characterId: "A" }, { slot: 1, member: 1, characterId: "B" }] }], moves: [], score: { today: 1, greedy: 1, final: 1 }, search: {}, ms: 1 });

async function page() {
  const ba = useBuildAccount();
  await ba.load();
  return ba;
}
/** Runs the canned plan to the review. */
async function review(ba: ReturnType<typeof useBuildAccount>): Promise<void> {
  await ba.run();
  expect(ba.phase.value).toBe("result");
}

describe("Whole account's review and save", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    clearAccountUndo();
    clearKeptPlan();
    refusedStores.value = [];
    vi.mocked(accountTeamChoices).mockReset().mockResolvedValue([CHOICE] as never);
    vi.mocked(buildAccount).mockReset().mockImplementation(async () => plan() as never);
    useCharacterStore().characters = { A: { weapon: "old-A" }, B: { weapon: "old-B" } };
    useInventoryStore().echoes = [];
    useTeamRotationsStore().teams = [{ id: "t1", name: "Team", characterIds: ["A", "B", null], buildIds: [null, null, null], actions: [] }];
  });

  it("Undo on a review planned after the undone save drops the review and reads the teams again", async () => {
    const ba = await page();
    await review(ba);
    await ba.save();
    ba.backToTeams();
    await vi.waitFor(() => expect(ba.phase.value).toBe("choose"));
    await review(ba);
    expect(ba.applied.value).toBeNull();
    vi.mocked(accountTeamChoices).mockClear();

    ba.undo();

    expect(ba.result.value).toBeNull();
    expect(ba.toSave.value).toEqual([]);
    expect(accountTeamChoices).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(ba.phase.value).toBe("choose"));
  });

  it("Undo of the save the review made keeps the review: the account is back to what it was planned on", async () => {
    const ba = await page();
    await review(ba);
    await ba.save();
    ba.undo();
    expect(ba.result.value).not.toBeNull();
    expect(ba.phase.value).toBe("result");
    expect(ba.applied.value).toBeNull();
    expect(ba.toSave.value.map((m) => m.characterId)).toEqual(["A", "B"]);
  });

  it("a partial Undo of its own save drops the review: the account is not what it was planned on", async () => {
    const ba = await page();
    await review(ba);
    await ba.save();
    useCharacterStore().characters.A.level = "80";
    ba.undo();
    expect(ba.result.value).toBeNull();
  });

  it("refuses to save a review of an account that changed since, and writes nothing", async () => {
    const ba = await page();
    await review(ba);
    useCharacterStore().characters.A.weapon = "edited elsewhere";
    const stored = JSON.stringify(useCharacterStore().characters);
    const failed = await ba.save().catch((e) => e);
    expect(failed).toBeInstanceOf(SaveRefused);
    expect(failed.reason).toBe("stale");
    expect(saveFailedText(failed)).toMatch(/^Nothing was saved: your builds or teams changed/);
    expect(JSON.stringify(useCharacterStore().characters)).toBe(stored);
    expect(ba.result.value).toBeNull();
  });

  it("a write the browser refused takes the whole save back, and the save before keeps its undo", async () => {
    const ba = await page();
    await review(ba);
    const first = await ba.save();
    const before = JSON.stringify(useCharacterStore().characters);
    ba.backToTeams();
    await vi.waitFor(() => expect(ba.phase.value).toBe("choose"));
    await review(ba);
    ba.makeActive.value = true;
    refusedStores.value = ["character"];

    const failed = await ba.save().catch((e) => e);

    expect(failed).toBeInstanceOf(SaveRefused);
    expect(failed.reason).toBe("storage");
    expect(saveFailedText(failed)).toMatch(/^Nothing was saved: this browser's storage is full/);
    expect(JSON.stringify(useCharacterStore().characters)).toBe(before);
    expect(ba.applied.value).toBeNull();
    expect(readAccountUndo()?.at).toBe(first!.undo.at);
    await nextTick();
  });

  it("a store write that throws says so to the page: nothing is half-saved and Save can be tried again", async () => {
    const ba = await page();
    await review(ba);
    ba.makeActive.value = true;
    const store = useCharacterStore();
    const before = JSON.stringify(store.characters);
    const real = store.equipBuild;
    let calls = 0;
    store.equipBuild = ((id: string, buildId: string) => {
      calls += 1;
      if (calls === 2) throw new Error("injected");
      real(id, buildId);
    }) as never;
    const failed = await ba.save().catch((e) => e);
    expect(failed).toBeInstanceOf(Error);
    expect(saveFailedText(failed)).toBe("The save failed and was taken back, so your builds and teams are as they were (injected).");
    expect(JSON.stringify(store.characters)).toBe(before);
    expect(ba.applied.value).toBeNull();
    store.equipBuild = real;
    const out = await ba.save();
    expect(out?.created.map((c) => c.name)).toEqual(["Account plan", "Account plan"]);
  });

  describe("rows another tab changed (2026-11-08 hunt H1)", () => {
    it("Plan on rows read before another tab changed a team reads them again and plans nothing", async () => {
      const ba = await page();
      useTeamRotationsStore().teams[0].characterIds = ["A", "C", null]; // the other tab put C in B's slot
      vi.mocked(accountTeamChoices).mockClear();

      await ba.run();

      expect(buildAccount).not.toHaveBeenCalled();
      expect(accountTeamChoices).toHaveBeenCalledOnce();
      expect(ba.phase.value).toBe("choose");
      expect(ba.error.value).toBe(ROWS_CHANGED_TEXT);
      // on the rows read again it plans, and the review saves
      await review(ba);
      expect(ba.error.value).toBeNull();
      expect((await ba.save())?.created).toHaveLength(2);
    });

    it("the Teams step follows another tab's write, and only when the account changed", async () => {
      const ba = await page();
      vi.mocked(accountTeamChoices).mockClear();
      await ba.followAccount();
      expect(accountTeamChoices).not.toHaveBeenCalled();
      useCharacterStore().characters.B.weapon = "new-B";
      await ba.followAccount();
      expect(accountTeamChoices).toHaveBeenCalledOnce();
      expect(ba.error.value).toBe(ROWS_CHANGED_TEXT);
    });

    it("this page's own save and undo are no reason to read the rows again on the next Plan", async () => {
      const ba = await page();
      await review(ba);
      await ba.save();
      ba.backToTeams();
      await vi.waitFor(() => expect(ba.phase.value).toBe("choose"));
      await review(ba);
      expect(ba.error.value).toBeNull();
    });
  });

  describe("two tabs, one Undo (2026-11-08 hunt M1)", () => {
    const realStores = () => ({ character: useCharacterStore(), team: useTeamRotationsStore(), inventory: useInventoryStore() }) as unknown as BuildTeamStores;
    /** the other tab's save: a newer plan, made active (its own module memory is not this tab's) */
    const otherTabSaves = (at: number) => saveAccountPlan(realStores(), { ...accountApplyRequest(plan() as never, true), now: at }, { echoes: [] });

    it("an older tab's Undo takes back the last save, the other tab's, and only that", async () => {
      const a = await page();
      await review(a);
      const first = await a.save();
      const afterFirst = JSON.stringify(useCharacterStore().characters);
      otherTabSaves(first!.undo.at + 1000);

      const fates = a.undoPreview();
      expect(fates.map((f) => [f.name, f.fate])).toEqual([["Account plan (2)", "restore"], ["Account plan (2)", "restore"]]);
      const out = a.undo(a.undoRecord.value);

      expect(out?.kind).toBe("exact");
      expect(JSON.stringify(useCharacterStore().characters)).toBe(afterFirst);
      expect(readAccountUndo()).toBeNull();
    });

    it("taking back an older save leaves the newer save's Undo stored", () => {
      const older = saveAccountPlan(realStores(), { ...accountApplyRequest(plan() as never, false), now: 1000 }, { echoes: [] });
      otherTabSaves(2000);
      undoAccountPlan(realStores(), older.undo);
      expect(readAccountUndo()?.at).toBe(2000);
    });

    it("refuses when a newer save replaced the Undo while the question was open, and writes nothing", async () => {
      const a = await page();
      await review(a);
      await a.save();
      a.undoPreview();
      const described = a.undoRecord.value!;
      otherTabSaves(described.at + 1000);
      const before = JSON.stringify(useCharacterStore().characters);

      expect(() => a.undo(described)).toThrow(UndoRefused);
      expect(JSON.stringify(useCharacterStore().characters)).toBe(before);
      expect(readAccountUndo()?.at).toBe(described.at + 1000);
      // asked again, it speaks for the newer save
      expect(a.undoPreview().map((f) => f.name)).toEqual(["Account plan (2)", "Account plan (2)"]);
    });
  });

  describe("the teams you chose", () => {
    const row = (id: string) => ({ ...CHOICE, id, name: id, spec: { ...CHOICE.spec, id, name: id } });
    const ROWS = ["t1", "t2", "t3", "t4", "t5", "t6"].map(row);

    beforeEach(() => {
      vi.mocked(accountTeamChoices).mockResolvedValue(ROWS as never);
    });

    it("are still chosen after a reload, in their order, with the weights you set", async () => {
      const first = await page();
      first.toggle("t6", true);
      first.move("t6", -1);
      first.setWeight("t6", 0.25);
      const picked = [...first.selected.value];
      expect(picked).toContain("t6");

      clearKeptPlan(); // a reload: nothing in this tab's memory, only what the browser stored
      const again = await page();
      expect(again.selected.value).toEqual(picked);
      expect(again.weights.t6).toBe(0.25);
    });

    it("drop a team that is gone and keep the rest, and fall back to the default when none is left", async () => {
      const first = await page();
      const defaults = [...first.selected.value];
      first.toggle("t6", true);
      vi.mocked(accountTeamChoices).mockResolvedValue(ROWS.filter((r) => r.id !== "t6") as never);
      expect((await page()).selected.value).toEqual(defaults);

      const second = await page();
      second.toggle("t2", true);
      vi.mocked(accountTeamChoices).mockResolvedValue([row("other")] as never);
      expect((await page()).selected.value).toEqual(["other"]);
    });

    it("ignores a stored choice it can't read", async () => {
      localStorage.setItem(ACCOUNT_CHOICE_KEY, "{not json");
      expect((await page()).selected.value.length).toBeGreaterThan(0);
      localStorage.setItem(ACCOUNT_CHOICE_KEY, JSON.stringify({ selected: "t1", weights: 3 }));
      expect((await page()).selected.value.length).toBeGreaterThan(0);
    });
  });

  describe("a review you leave", () => {
    it("is still there when you come back to the page: Back then Forward lost the plan", async () => {
      const first = await page();
      await review(first);
      const shown = first.result.value;

      const back = await page(); // the panel is unmounted by Back and made again by Forward
      expect(back.phase.value).toBe("result");
      expect(back.result.value).toBe(shown);
      expect(back.toSave.value.length).toBeGreaterThan(0);
      expect(vi.mocked(buildAccount)).toHaveBeenCalledTimes(1);
      await back.save(); // and it saves: it stands for this account
      expect(back.applied.value).not.toBeNull();
    });

    it("is not kept for an account that changed since", async () => {
      await review(await page());
      useCharacterStore().characters = { A: { weapon: "new-A" }, B: { weapon: "old-B" } };
      await nextTick();
      const back = await page();
      expect(back.phase.value).toBe("choose");
      expect(back.result.value).toBeNull();
    });

    it("goes with Change teams and with a save: neither comes back", async () => {
      const first = await page();
      await review(first);
      first.backToTeams();
      expect((await page()).phase.value).toBe("choose");

      const second = await page();
      await review(second);
      await second.save();
      expect((await page()).phase.value).toBe("choose");
    });
  });
});

// Last in the file: the pages above are made outside any component, so their switch watchers are never stopped
describe("Whole account and the team-buff switch (2026-11-08 hunt F2)", () => {
  let scope: EffectScope;
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  async function open() {
    const ba = scope.run(() => useBuildAccount())!;
    await ba.load();
    return ba;
  }
  const lastRowsSwitch = () => vi.mocked(accountTeamChoices).mock.calls.at(-1)?.[3]?.autoTeamBuffs;
  beforeEach(async () => {
    // the pages the tests above made (never unmounted) answer this flip and are done with the switch: only this
    // block's pages answer the flips below, as only the mounted page does in the app
    autoTeamBuffs.value = false;
    await settle();
    autoTeamBuffs.value = true;
    await settle();
    scope = effectScope();
    setActivePinia(createPinia());
    localStorage.clear();
    clearAccountUndo();
    clearKeptPlan();
    refusedStores.value = [];
    vi.mocked(accountTeamChoices).mockReset().mockResolvedValue([CHOICE] as never);
    vi.mocked(buildAccount).mockReset().mockImplementation(async () => plan() as never);
    useCharacterStore().characters = { A: { weapon: "old-A" }, B: { weapon: "old-B" } };
    useInventoryStore().echoes = [];
    useTeamRotationsStore().teams = [{ id: "t1", name: "Team", characterIds: ["A", "B", null], buildIds: [null, null, null], actions: [] }];
  });
  afterEach(async () => {
    scope.stop();
    autoTeamBuffs.value = true;
    await settle();
  });

  it("a plan kept for Back is not restored under the other switch: it read −0.7 % where the page gives −0.1 %", async () => {
    await review(await open());
    scope.stop(); // the page is left (/account) before the switch moves
    scope = effectScope();
    autoTeamBuffs.value = false;
    await settle();
    const back = await open();
    expect(back.result.value).toBeNull();
    expect(back.phase.value).toBe("choose");
    expect(back.error.value).toBe(SWITCH_CHANGED_TEXT);
    expect(lastRowsSwitch()).toBe(false); // the rows' team damage, read under the switch as it is now
    expect(vi.mocked(buildAccount)).toHaveBeenCalledTimes(1);
  });

  it("the review on the page is put down when the switch moves, the rows read again under it, the teams kept", async () => {
    const ba = await open();
    await review(ba);
    autoTeamBuffs.value = false;
    await settle();
    expect(ba.result.value).toBeNull();
    expect(ba.phase.value).toBe("choose");
    expect(ba.error.value).toBe(SWITCH_CHANGED_TEXT);
    expect(ba.selected.value).toEqual(["t1"]);
    expect(lastRowsSwitch()).toBe(false);
    const back = await open(); // and Back finds no review either
    expect(back.result.value).toBeNull();
  });

  it("the Teams step's rows follow the switch, with no note", async () => {
    const ba = await open();
    expect(lastRowsSwitch()).toBe(true);
    autoTeamBuffs.value = false;
    await settle();
    expect(ba.phase.value).toBe("choose");
    expect(lastRowsSwitch()).toBe(false);
    expect(ba.error.value).toBeNull();
  });

  it("a run in flight when the switch moves never lands", async () => {
    const ba = await open();
    let finish: (value: unknown) => void = () => {};
    vi.mocked(buildAccount).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)) as never);
    const pending = ba.run();
    await vi.waitFor(() => expect(ba.phase.value).toBe("running"));
    autoTeamBuffs.value = false;
    await settle();
    finish(plan());
    await pending;
    await settle();
    expect(ba.result.value).toBeNull();
    expect(ba.phase.value).toBe("choose");
    expect(ba.error.value).toBe(SWITCH_CHANGED_TEXT);
    await review(ba); // Plan again runs under the switch as it is now
    expect(vi.mocked(buildAccount).mock.calls.at(-1)?.[0].autoTeamBuffs).toBe(false);
  });

  it("still comes back under the switch it was planned on, with the options it ran with", async () => {
    const first = await open();
    first.options.keepMainEcho = true;
    await review(first);
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({ keepMainEcho: false })); // One team saved others since
    const back = await open();
    expect(back.phase.value).toBe("result");
    expect(back.options.keepMainEcho).toBe(true);
  });
});
