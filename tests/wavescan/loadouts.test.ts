import { describe, it, expect } from "vitest";
import type { WavescanEchoMapResult, WavescanInventoryEcho } from "../../src/wavescan/echoes";
import {
  defaultRoverKey,
  findEquippedElsewhere,
  groupWavescanLoadouts,
  isSameLoadout,
  moveLoadoutEcho,
  nextBuildName,
  padLoadout,
} from "../../src/wavescan/loadouts";

function echo(echoId: string, cost: number): WavescanInventoryEcho {
  return {
    echoId,
    echo: "Echo",
    echoSet: "Set",
    type: cost,
    rank: 5,
    stat: "ATK",
    echoSubStatsType1: null,
    echoSubStatsValue1: null,
    echoSubStatsType2: null,
    echoSubStatsValue2: null,
    echoSubStatsType3: null,
    echoSubStatsValue3: null,
    echoSubStatsType4: null,
    echoSubStatsValue4: null,
    echoSubStatsType5: null,
    echoSubStatsValue5: null,
  };
}

function mapped(
  rows: [id: string, cost: number, wearer: string | null][],
  skipped: WavescanEchoMapResult["skipped"] = [],
): WavescanEchoMapResult {
  const equippedBy: Record<string, string> = {};
  for (const [id, , wearer] of rows) if (wearer) equippedBy[id] = wearer;
  return { echoes: rows.map(([id, cost]) => echo(id, cost)), skipped, equippedBy };
}

const known = ["Carlotta", "Phoebe", "YangyangXuanling"];

describe("groupWavescanLoadouts", () => {
  it("groups by wearer and sorts by cost, highest first, keeping file order for ties", () => {
    const plan = groupWavescanLoadouts(
      mapped([
        ["a", 1, "Carlotta"],
        ["b", 3, "Carlotta"],
        ["free", 4, null],
        ["c", 4, "Carlotta"],
        ["d", 3, "Carlotta"],
        ["e", 1, "Carlotta"],
      ]),
      known,
    );
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]).toMatchObject({
      wearer: "Carlotta",
      characterKey: "Carlotta",
      isPlayer: false,
      echoIds: ["c", "b", "d", "a", "e"],
      mainEchoGuessed: false,
      blockedReason: null,
    });
  });

  it("keeps groups in the order characters first appear", () => {
    const plan = groupWavescanLoadouts(
      mapped([
        ["a", 4, "Phoebe"],
        ["b", 4, "YangyangXuanling"],
        ["c", 1, "Phoebe"],
      ]),
      known,
    );
    expect(plan.groups.map((g) => g.wearer)).toEqual(["Phoebe", "YangyangXuanling"]);
  });

  it("flags the main echo as a guess when two echoes share the top cost", () => {
    const plan = groupWavescanLoadouts(
      mapped([
        ["a", 4, "Phoebe"],
        ["b", 4, "Phoebe"],
        ["c", 1, "Phoebe"],
      ]),
      known,
    );
    expect(plan.groups[0]!.mainEchoGuessed).toBe(true);
  });

  it("marks the main character for the user to pick", () => {
    const plan = groupWavescanLoadouts(mapped([["a", 4, "Rover"]]), known);
    expect(plan.groups[0]).toMatchObject({ isPlayer: true, characterKey: null });
  });

  it("lists unknown wearers instead of guessing", () => {
    const plan = groupWavescanLoadouts(
      mapped([
        ["a", 4, "Nobody"],
        ["b", 1, "Nobody"],
      ]),
      known,
    );
    expect(plan.groups).toEqual([]);
    expect(plan.unmatched).toEqual([{ wearer: "Nobody", count: 2 }]);
  });

  it("counts a character's skipped echoes", () => {
    const plan = groupWavescanLoadouts(
      mapped(
        [["a", 4, "Carlotta"]],
        [{ position: 2, scanId: null, echo: null, reason: "bad", equippedBy: "Carlotta" }],
      ),
      known,
    );
    expect(plan.groups[0]!.skippedCount).toBe(1);
  });

  it("blocks more than five echoes or a cost over 12", () => {
    const six = groupWavescanLoadouts(
      mapped(Array.from({ length: 6 }, (_, i) => [`e${i}`, 1, "Carlotta"] as [string, number, string])),
      known,
    );
    expect(six.groups[0]!.blockedReason).toContain("only equip 5");

    const heavy = groupWavescanLoadouts(
      mapped([
        ["a", 4, "Carlotta"],
        ["b", 4, "Carlotta"],
        ["c", 4, "Carlotta"],
        ["d", 1, "Carlotta"],
      ]),
      known,
    );
    expect(heavy.groups[0]!.blockedReason).toContain("cost 13");
  });
});

describe("loadout helpers", () => {
  it("moves an echo between slots", () => {
    expect(moveLoadoutEcho(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveLoadoutEcho(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("pads to five slots and compares slot by slot", () => {
    expect(padLoadout(["a"])).toEqual(["a", null, null, null, null]);
    expect(isSameLoadout(["a", "b"], ["a", "b", null])).toBe(true);
    expect(isSameLoadout(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("finds echoes another character has equipped", () => {
    const equipped = { x: { Phoebe: 2 }, y: { Carlotta: 0 }, z: {} };
    expect(findEquippedElsewhere(equipped, "Carlotta", ["x", "y", "z", null])).toEqual([
      { echoId: "x", characterKey: "Phoebe", slot: 2 },
    ]);
  });

  it("picks the only Rover the user has, else the active Rover, else none", () => {
    const rovers = ["RoverHavocFemale", "RoverSpectroFemale"];
    expect(defaultRoverKey(rovers, ["RoverHavocFemale", "Carlotta"], "Carlotta")).toBe("RoverHavocFemale");
    expect(defaultRoverKey(rovers, rovers, "RoverSpectroFemale")).toBe("RoverSpectroFemale");
    expect(defaultRoverKey(rovers, rovers, "Carlotta")).toBeNull();
  });

  it("adds a number when the build name is taken", () => {
    expect(nextBuildName("Wavescan Oct 12", [])).toBe("Wavescan Oct 12");
    expect(nextBuildName("Wavescan Oct 12", ["Wavescan Oct 12", "Wavescan Oct 12 (2)"])).toBe(
      "Wavescan Oct 12 (3)",
    );
  });
});
