// Wuthering Tools+ One team: the page asks wuwa_calc at the builds the team runs. The real stores and the real account
// code on a synthetic account; the plan, the run and the solver are canned, since what is under test is the account the
// page hands them. Before 2026-11-16 it handed every character's active build: a saved team whose pins run 353,983 DPS
// on /energy read "wuwa_calc · your echoes · 367,567 DPS" here.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { rileyNameOf } from "../rankings/castMapper";
import { clearUndo } from "./apply";
import { buildMyTeam } from "./buildTeam";
import { plansForTeam } from "./plans";
import { clearKeptReview, useBuildTeam } from "./useBuildTeam";

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("./buildTeam", async (original) => ({ ...(await original<typeof import("./buildTeam")>()), buildMyTeam: vi.fn(), teamFigureOf: vi.fn(async () => null) }));
vi.mock("./plans", () => ({ plansForTeam: vi.fn() }));
vi.mock("./workerBackend", () => ({ workerBackend: () => ({ dispose() {} }) }));
const solveMine = vi.hoisted(() => vi.fn());
vi.mock("../engine/rileyClient", () => ({ rileyClient: () => ({ solveMine, tracedRun: vi.fn(), teamKeysFor: vi.fn() }) }));
vi.mock("../account/investPlan", () => ({ rankedTeamImpact: vi.fn() }));

const exp = parseExport(fixture, "aiAccount.json");
const team = exp.teams[0]!;
const [dps, support] = team.characterIds as string[];
const weaponOf = (id: string): string => exp.characters[id].weapon;
const rankOf = (id: string): number => Number(exp.characters[id].weapons?.[weaponOf(id)]?.refinement ?? 1);
const otherRank = (id: string): number => (rankOf(id) > 3 ? rankOf(id) - 2 : rankOf(id) + 2);
function fieldsAt(id: string, rank: number): Record<string, any> {
  const { builds: _b, activeBuildId: _a, ...rest } = exp.characters[id];
  const fields = JSON.parse(JSON.stringify(rest));
  return { ...fields, weapons: { ...fields.weapons, [weaponOf(id)]: { ...fields.weapons?.[weaponOf(id)], refinement: String(rank) } } };
}
const refine = (account: any, id: string): number => account.entries[rileyNameOf(id)].refine;
/** the account each ask of the solver was made at */
const askedAt = (): any[] => solveMine.mock.calls.map((call) => call[1].account);

const member = (slot: number, characterId: string, draft: Record<string, any> | null) => ({ slot, characterId, status: "ok", draft, sameEchoes: false, fromBuild: { id: null, name: null, source: "active" }, before: { value: 100, menuEr: null, withRunBuffs: null }, after: { value: draft ? 110 : 100, optimizerValue: 110, menuEr: null, withTeam: null, picks: [] }, erMet: null, erFloor: null });

describe("One team asks wuwa_calc at the builds the team runs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    clearUndo();
    clearKeptReview();
    solveMine.mockReset().mockResolvedValue([{ best: { total: 1 } }]);
    vi.mocked(plansForTeam).mockReset().mockImplementation(async () => ({ plans: [{ share: null, mainDps: true }, { share: null, mainDps: false }, { share: null, mainDps: false }], riley: { teamKey: "t1" }, rileyNote: null, teamKeys: ["t1"], dpsMine: 100, dpsHigh: null }) as never);
    // the main DPS has a second build, "Account plan", that the team pins; the active build stays as it was
    const data = JSON.parse(JSON.stringify(exp.characters));
    data[dps!] = { ...data[dps!], activeBuildId: data[dps!].activeBuildId ?? "live", builds: [...(data[dps!].builds ?? []), { ...fieldsAt(dps!, otherRank(dps!)), id: "plan", name: "Account plan" }] };
    useCharacterStore().characters = data;
    useInventoryStore().echoes = JSON.parse(JSON.stringify(exp.inventory.echoes ?? []));
    useTeamRotationsStore().teams = [{ ...JSON.parse(JSON.stringify(team)), id: "saved", buildIds: ["plan", null, null] }];
  });

  it("the plan and its DPS are asked at the pinned build, the one /energy reads for this team", async () => {
    const bt = useBuildTeam();
    await bt.load({ teamId: "saved", members: [] });
    const source = vi.mocked(plansForTeam).mock.calls[0]![1]!;
    await source.solveMine(["t1"], "mine");
    expect(refine(askedAt()[0], dps!)).toBe(otherRank(dps!)); // read the active build's rankOf(dps)
    expect(refine(askedAt()[0], support!)).toBe(rankOf(support!));
  });

  it("the DPS after a Save keeps a member that is not ticked on the build the team pins", async () => {
    const draft = fieldsAt(support!, otherRank(support!));
    vi.mocked(buildMyTeam).mockReset().mockImplementation(async () => ({ members: [member(0, dps!, null), member(1, support!, draft)], order: [0, 1], ordersTried: 1, swaps: [], objectiveKind: "team", team: null, fromOthers: [], ms: 1 }) as never);
    const bt = useBuildTeam();
    await bt.load({ teamId: "saved", members: [] });
    await bt.run();
    expect(bt.phase.value).toBe("result");
    expect(bt.saveSlots.value[1]).toBe(true);
    await vi.waitFor(() => expect(bt.rileyAfter.value).toBe(1));
    const after = askedAt().at(-1);
    expect(refine(after, support!)).toBe(otherRank(support!)); // the new build
    expect(refine(after, dps!)).toBe(otherRank(dps!)); // no new build: "Account plan", not the active build
  });

  it("three nobody saved are asked at the active builds", async () => {
    useTeamRotationsStore().teams = [];
    const bt = useBuildTeam();
    await bt.load({ members: [...team.characterIds] as string[] });
    const source = vi.mocked(plansForTeam).mock.calls[0]![1]!;
    await source.solveMine(["t1"], "mine");
    expect(refine(askedAt()[0], dps!)).toBe(rankOf(dps!));
  });
});
