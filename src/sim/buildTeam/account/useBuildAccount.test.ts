// Wuthering Tools+ "Whole account": a review stands for the account it was planned on, and a save is all or nothing. The
// real stores; the plan itself is canned, since what is under test is what the page does around it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../../stores/character";
import { useInventoryStore } from "../../../stores/inventory";
import { useTeamRotationsStore } from "../../../stores/teamRotations";
import { refusedStores } from "../../storage/persistGuard";
import { saveFailedText, SaveRefused } from "../apply";
import { clearAccountUndo, readAccountUndo } from "./accountApply";
import { accountTeamChoices } from "./accountTeams";
import { buildAccount } from "./buildAccount";
import { ACCOUNT_CHOICE_KEY, clearKeptPlan, useBuildAccount } from "./useBuildAccount";

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
