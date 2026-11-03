// Wuthering Tools+ — member loops imported before loops carried a rotation time get the synced team's (audit M5).
import { describe, expect, it } from "vitest";
import { applyRotationDurations, planRotationDurations, readDurationUndo, revertRotationDurations, rotationsWithDurations, saveDurationUndo, MEMBER_LOOP_PREFIX } from "./rotationDurations";
import { wuwaCalcTeamName } from "../presets/presetName";

/* eslint-disable @typescript-eslint/no-explicit-any */

const loop = (id: string, name: string, duration: number | string | null = null): any => ({ id, name, description: `${MEMBER_LOOP_PREFIX} (Riley31415/wuwa_calc): …`, duration, actions: [] });
const TAG = "S6R5 DPS · S1R1/S6R1 team";

function account(): { characters: Record<string, any>; teams: any[] } {
  return {
    characters: {
      Aemeath: { rotations: [loop("a1", `Aemeath S6R5 Everbright Polestar R5 · Mornye + Lynae · ${TAG} (wuwa_calc)`), { id: "a2", name: "My own Aemeath", description: "", duration: null }] },
      Mornye: { rotations: [loop("m1", `Mornye S1R1 Starfield Calibrator R1 · Aemeath + Lynae · ${TAG} (wuwa_calc)`), loop("m2", "Mornye S1R1 Starfield Calibrator R1 · Lucilla + Sigrika · S6R2 DPS · S1R1/S0R1 team (wuwa_calc)", "")] },
      Lynae: { rotations: [loop("l1", `Lynae S6R1 Spectrum Blaster R1 · Mornye + Aemeath · ${TAG} (wuwa_calc)`, 24.5)] },
      Lupa: { rotations: [loop("p1", "Lupa S3R1 Wildfire Mark R1 · Lynae + Aemeath · S6R5 DPS · S3R1/S6R1 team (wuwa_calc)")] },
    },
    teams: [
      // the synced team, on the new name form; the same three at another tier must not lend its seconds
      { id: "t1", name: wuwaCalcTeamName("Aemeath", ["Mornye", "Lynae"], TAG), characterIds: ["Aemeath", "Mornye", "Lynae"], duration: 25 },
      { id: "t2", name: wuwaCalcTeamName("Aemeath", ["Mornye", "Lynae"], "S6R5"), characterIds: ["Aemeath", "Mornye", "Lynae"], duration: 31 },
      // the player's own team with the same three: never a source
      { id: "t3", name: "Aemeath hypercarry", characterIds: ["Lynae", "Aemeath", "Mornye"], duration: 40 },
      // the old name form still times its loops
      { id: "t4", name: "wuwa_calc Sigrika S6R2 DPS · S1R1/S0R1 team · Mornye + Lucilla", characterIds: ["Sigrika", "Mornye", "Lucilla"], duration: 25.1 },
    ],
  };
}

describe("member loop rotation times", () => {
  it("fills only empty member loops, from the synced team with the same three at the same tier", () => {
    const { characters, teams } = account();
    const plan = planRotationDurations(characters, teams);
    expect(plan.fills.map((f) => [f.characterId, f.rotationId, f.to, f.teamId])).toEqual([
      ["Aemeath", "a1", 25, "t1"],
      ["Mornye", "m1", 25, "t1"],
      ["Mornye", "m2", 25.1, "t4"],
    ]);
    // Lynae's loop has a time, "My own Aemeath" is not a member loop; Lupa's team is not saved
    expect(plan.gaps).toEqual([{ characterId: "Lupa", rotationId: "p1", name: characters.Lupa.rotations[0].name, reason: "noTeam" }]);
  });

  it("writes the times in place and nothing else; Undo takes back only what is still the filled time", () => {
    const { characters, teams } = account();
    const before = JSON.parse(JSON.stringify(characters));
    const plan = planRotationDurations(characters, teams);
    expect(applyRotationDurations(characters, plan.fills)).toBe(3);
    expect(characters.Aemeath.rotations[0].duration).toBe(25);
    expect(characters.Aemeath.rotations[1]).toEqual(before.Aemeath.rotations[1]);
    expect(characters.Lynae).toEqual(before.Lynae);
    // a second run finds nothing left to fill
    expect(planRotationDurations(characters, teams).fills).toEqual([]);
    // the player changes one time after the sync: Undo leaves that one alone
    characters.Mornye.rotations[0] = { ...characters.Mornye.rotations[0], duration: 27 };
    const undone = revertRotationDurations(characters.Mornye.rotations, plan.fills);
    expect(undone.map((r: any) => r.duration)).toEqual([27, null]);
    expect(revertRotationDurations(characters.Aemeath.rotations, plan.fills)[0].duration).toBeNull();
  });

  it("calls two synced teams of the same three and tier with different seconds ambiguous", () => {
    const { characters, teams } = account();
    teams.push({ id: "t5", name: wuwaCalcTeamName("Aemeath", ["Mornye", "Lynae"], TAG), characterIds: ["Mornye", "Aemeath", "Lynae"], duration: 26 });
    const plan = planRotationDurations(characters, teams);
    expect(plan.gaps.filter((g) => g.reason === "ambiguous").map((g) => g.rotationId)).toEqual(["a1", "m1"]);
    expect(rotationsWithDurations(characters.Aemeath.rotations, plan.fills)).toEqual(characters.Aemeath.rotations);
  });

  it("keeps the Undo list in storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const plan = planRotationDurations(account().characters, account().teams);
    saveDurationUndo(plan.fills, storage);
    expect(readDurationUndo(storage)).toEqual(plan.fills);
    saveDurationUndo(null, storage);
    expect(readDurationUndo(storage)).toEqual([]);
  });
});
