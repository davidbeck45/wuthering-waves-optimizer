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
import { useBuildAccount } from "./useBuildAccount";

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
});
