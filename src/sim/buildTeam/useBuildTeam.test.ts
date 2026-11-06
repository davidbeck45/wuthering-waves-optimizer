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
import { useBuildTeam } from "./useBuildTeam";

vi.mock("./buildTeam", async (original) => ({ ...(await original<typeof import("./buildTeam")>()), buildMyTeam: vi.fn() }));
vi.mock("./plans", () => ({ plansForTeam: vi.fn(async () => ({ plans: [{ share: null, mainDps: false }, { share: null, mainDps: false }, null], riley: null })) }));
vi.mock("./workerBackend", () => ({ workerBackend: () => ({ dispose() {} }) }));
vi.mock("../engine/rileyClient", () => ({ rileyClient: () => ({}) }));
vi.mock("../engine/rileyAccount", () => ({ rileyAccountOf: () => ({}) }));

const member = (slot: number, characterId: string) => ({ slot, characterId, status: "ok", draft: { weapon: `w-${characterId}`, echoes: {} }, sameEchoes: false, before: { value: 100, menuEr: null, withRunBuffs: null }, after: { value: 110, optimizerValue: 110, menuEr: null, withTeam: null, picks: [] }, erMet: null, erFloor: null });
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
});
