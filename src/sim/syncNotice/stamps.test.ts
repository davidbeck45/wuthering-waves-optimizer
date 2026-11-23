// Wuthering Tools+ sync notice — a stock team preset carries the engine it was generated from, and a team added from
// one keeps it (the team store copies it), so the notice can tell it from an older copy.
import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import manifest from "../presets/data/manifest.json";
import { loadWuwaCalcTeamPresets, stampTeamPresets } from "../presets";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { behindTeams } from "./syncNotice";

describe("stock team presets", () => {
  it("each carries the manifest's engine commit, and a team added from one is stamped with it", async () => {
    const presets = await loadWuwaCalcTeamPresets();
    expect(presets.length).toBeGreaterThan(0);
    for (const p of presets) expect((p.data as { wuwaCalcCommit?: string }).wuwaCalcCommit).toBe(manifest.wuwaCalcCommit);
    setActivePinia(createPinia());
    const store = useTeamRotationsStore();
    const team = store.importTeam(presets[0]!.data) as { name: string; wuwaCalcCommit?: string };
    expect(team.wuwaCalcCommit).toBe(manifest.wuwaCalcCommit);
    expect(behindTeams([{ id: "x", ...team }], manifest.wuwaCalcCommit).teams).toEqual([]);
    expect(behindTeams([{ id: "x", ...team }], "0000000").teams).toHaveLength(1);
  }, 30_000);

  it("a preset list without a known commit is left as it is", () => {
    const list = [{ name: "a", description: "", author: "", data: { name: "a", characterIds: [], actions: [] } }] as never[];
    expect(stampTeamPresets(list, null)).toBe(list);
  });

  it("an imported team without a stamp stays without one (an export from before stamps, a shared link)", () => {
    setActivePinia(createPinia());
    const team = useTeamRotationsStore().importTeam({ name: "x (wuwa_calc)", characterIds: [], actions: [] }) as Record<string, unknown>;
    expect("wuwaCalcCommit" in team).toBe(false);
  });
});
