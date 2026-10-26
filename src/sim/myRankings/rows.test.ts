// Wuthering Tools+: the /my-rankings row models.
import { describe, expect, it } from "vitest";
import { damageRanks, dedupeTeams, memberShares, sortCharacters, upgradeOf } from "./rows";
import type { CharacterRank, TeamRank } from "./rankRoster";
import { palette } from "../../utils/chartColors";

const char = (id: string, dmg: number | null, over: Partial<CharacterRank> = {}): CharacterRank => ({
  id,
  name: id,
  sequence: 0,
  refinement: 1,
  weapon: "W",
  rotationsEvaluated: 1,
  best: dmg == null ? null : { name: "r", source: "yours", avgDamage: dmg, normalDamage: dmg, critDamage: dmg, dps: null },
  bestRotation: null,
  rotations: [],
  nextSequence: null,
  refineFive: null,
  errors: [],
  ...over,
});
const team = (id: string, ids: string[], dmg: number, source: TeamRank["source"], perSlot = [dmg, 0, 0]): TeamRank => ({
  id,
  name: id,
  source,
  characterIds: ids,
  avgDamage: dmg,
  perSlot,
  dps: null,
  unarmed: [],
});

describe("my-rankings rows", () => {
  it("picks the larger upgrade estimate and marks a maxed character", () => {
    const u = upgradeOf({ sequence: 2, refinement: 1, nextSequence: { label: "S3", avgDamage: 110, gain: 0.1 }, refineFive: { label: "R5", avgDamage: 120, gain: 0.2 } });
    expect(u.best).toMatchObject({ kind: "refine", label: "R5", gain: 0.2 });
    expect(u.other).toMatchObject({ kind: "sequence", label: "S3" });
    expect(u.maxed).toBe(false);
    expect(upgradeOf({ sequence: 6, refinement: 5, nextSequence: null, refineFive: null })).toEqual({ best: null, other: null, maxed: true });
    expect(upgradeOf({ sequence: 6, refinement: 1, nextSequence: null, refineFive: { label: "R5", avgDamage: 1, gain: 0.05 } }).best?.kind).toBe("refine");
  });

  it("sorts by damage, upgrade and name, ties by damage", () => {
    const list = [
      char("B", 100, { refineFive: { label: "R5", avgDamage: 0, gain: 0.3 } }),
      char("A", 300, { sequence: 6, refinement: 5 }),
      char("C", 200, { nextSequence: { label: "S1", avgDamage: 0, gain: 0.1 } }),
      char("D", null),
    ];
    expect(sortCharacters(list, "damage", "desc").map((c) => c.id)).toEqual(["A", "C", "B", "D"]);
    expect(sortCharacters(list, "damage", "asc").map((c) => c.id)).toEqual(["D", "B", "C", "A"]);
    // estimates first (largest gain), then maxed, then nothing estimated
    expect(sortCharacters(list, "upgrade", "desc").map((c) => c.id)).toEqual(["B", "C", "A", "D"]);
    expect(sortCharacters(list, "name", "asc").map((c) => c.id)).toEqual(["A", "B", "C", "D"]);
    expect(list.map((c) => c.id)).toEqual(["B", "A", "C", "D"]); // a copy
    expect([...damageRanks(list)]).toEqual([["A", 1], ["C", 2], ["B", 3], ["D", 4]]);
  });

  it("folds identical team rows into one, keeping your own team in front", () => {
    const rows = dedupeTeams([
      team("preset-a", ["Aemeath", "Mornye", "Lynae"], 9466750.2, "wuwa_calc"),
      team("mine-a", ["Mornye", "Lynae", "Aemeath"], 9466749.9, "yours"),
      team("preset-b", ["Aemeath", "Mornye", "Lynae"], 7000000, "wuwa_calc"),
      team("other", ["Sigrika", "Mornye", "Lucilla"], 7000000, "wuwa_calc"),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["mine-a", "preset-b", "other"]);
    expect(rows[0].duplicates.map((d) => d.id)).toEqual(["preset-a"]);
    expect(rows[1].duplicates).toEqual([]);
  });

  it("colours member shares like the team editor's bar, in contribution order", () => {
    const shares = memberShares({ characterIds: ["Aemeath", "Mornye", "Lynae"], perSlot: [7974124, 140380, 1352246] });
    expect(shares.map((s) => s.id)).toEqual(["Aemeath", "Lynae", "Mornye"]);
    expect(shares.map((s) => s.color)).toEqual([palette[0], palette[1], palette[2]]);
    expect(shares.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 9);
    expect(memberShares({ characterIds: ["A", "B", "C"], perSlot: [0, 0, 0] }).every((s) => s.share === 0)).toBe(true);
  });
});
