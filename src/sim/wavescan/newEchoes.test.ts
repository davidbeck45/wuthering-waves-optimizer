import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/newEchoes.json";
import { mapWavescanEchoes, planWavescanEchoImport, type WavescanInventoryEcho } from "../../wavescan/echoes";
import {
  groupByBaseEcho,
  isSkin,
  matchNote,
  planNewEchoes,
  secondCopiesUpstreamWouldAdd,
  skinBaseMapOf,
  skinBaseOf,
  statName,
  substatsOf,
  type EchoRow,
} from "./newEchoes";

const inventory = fixture.inventory.echoes as EchoRow[];
const mapScan = () => mapWavescanEchoes(fixture.scan.echoes, inventory.map((echo) => echo.echoId));

describe("skinBaseOf", () => {
  it("reads a Phantom skin as its base echo and leaves other echoes alone", () => {
    expect(skinBaseOf("PhantomSigillum")).toBe("Sigillum");
    expect(skinBaseOf("PhantomNightmareCrownless")).toBe("NightmareCrownless");
    expect(skinBaseOf("Sigillum")).toBe("Sigillum");
    expect(skinBaseOf("NotAnEcho")).toBe("NotAnEcho");
    expect(isSkin("PhantomDreamless")).toBe(true);
    expect(isSkin("Dreamless")).toBe(false);
  });

  it("finds a skin whose base has another prefix by name (Phantom: Kronaclaw → Reminiscence: Kronaclaw)", () => {
    expect(skinBaseOf("PhantomKronaclaw")).toBe("ReminiscenceKronaclaw");
  });

  it("needs the same class, and one unambiguous name match", () => {
    const map = skinBaseMapOf({
      PhantomA: { name: "Phantom: A", class: "Elite" },
      A: { name: "A", class: "Common" },
      PhantomB: { name: "Phantom: B", class: "Elite" },
      OneB: { name: "One: B", class: "Elite" },
      TwoB: { name: "Two: B", class: "Elite" },
    });
    expect(map.has("PhantomA")).toBe(false);
    expect(map.has("PhantomB")).toBe(false);
  });

  it("maps every Phantom skin in the registry to an echo of the same class", async () => {
    const { mainEchoesData } = await import("../../echoes");
    const registry = mainEchoesData as unknown as Record<string, { name: string; class: string }>;
    const skins = Object.keys(registry).filter((key) => /^Phantom:/.test(registry[key]!.name));
    expect(skins.length).toBeGreaterThan(30);
    for (const key of skins) {
      const base = skinBaseOf(key);
      expect(base, key).not.toBe(key);
      expect(registry[base]!.class, key).toBe(registry[key]!.class);
    }
  });
});

describe("planNewEchoes on the synthetic scan", () => {
  const { echoes: scanned, skipped } = mapScan();
  const plan = planNewEchoes(scanned, inventory);

  it("reads every row of the fixture", () => {
    expect(skipped).toEqual([]);
    expect(scanned).toHaveLength(9);
  });

  it("adds 3, matches 6, and lists 2 inventory echoes the scan doesn't have", () => {
    expect(plan.toAdd.map((echo) => echo.echo)).toEqual(["Tambourinist", "FogLionarch", "PhantomGulpuff"]);
    expect(plan.owned).toHaveLength(6);
    expect(plan.notInScan.map((echo) => echo.echoId)).toEqual(["inv-fog", "inv-hoochief"]);
  });

  it("matches a Phantom skin to its base echo both ways", () => {
    const sigillum = plan.owned.find((match) => match.scanned.echo === "PhantomSigillum")!;
    expect(sigillum).toMatchObject({ kind: "exact", skinDiffers: true });
    expect(sigillum.owned.echoId).toBe("inv-sigillum");
    const dreamless = plan.owned.find((match) => match.scanned.echo === "Dreamless")!;
    expect(dreamless).toMatchObject({ kind: "exact", skinDiffers: true });
    expect(dreamless.owned.echoId).toBe("inv-dreamless-skin");
  });

  it("counts copies: three scanned copies against two owned add one", () => {
    const tamb = plan.owned.filter((match) => match.scanned.echo === "Tambourinist");
    expect(tamb.map((match) => match.owned.echoId)).toEqual(["inv-tamb-1", "inv-tamb-2"]);
    expect(tamb.every((match) => match.kind === "exact" && !match.skinDiffers)).toBe(true);
    expect(plan.toAdd.filter((echo) => echo.echo === "Tambourinist")).toHaveLength(1);
  });

  it("treats one changed substat value as a new echo and keeps the old one", () => {
    const fog = plan.toAdd.find((echo) => echo.echo === "FogLionarch")!;
    expect(fog.echoSubStatsType2).toBe("CritRate");
    expect(fog.echoSubStatsValue2).toBe(8.7);
    expect(plan.notInScan.some((echo) => echo.echoId === "inv-fog")).toBe(true);
  });

  it("matches the same substats in another order, and the same rolls stored with another rarity", () => {
    expect(plan.owned.find((match) => match.scanned.echo === "GlacioDrake")).toMatchObject({ kind: "order" });
    expect(plan.owned.find((match) => match.scanned.echo === "Sacerdos")).toMatchObject({ kind: "rarity" });
  });

  it("keeps file order in toAdd and owned", () => {
    expect(plan.owned.map((match) => match.scanned.echo)).toEqual([
      "PhantomSigillum",
      "Dreamless",
      "Tambourinist",
      "Tambourinist",
      "GlacioDrake",
      "Sacerdos",
    ]);
  });

  it("says how many owned echoes upstream's exact-name import would add a second time", () => {
    expect(secondCopiesUpstreamWouldAdd(plan.owned)).toBe(4);
    // upstream's own planner on the same data: the 3 new + those 4
    const upstream = planWavescanEchoImport(scanned, inventory as never, "append");
    expect(upstream.toAdd).toHaveLength(7);
  });
});

describe("planNewEchoes rules", () => {
  const [base] = mapScan().echoes as WavescanInventoryEcho[];
  const row = (echoId: string, extra: Partial<WavescanInventoryEcho> = {}): WavescanInventoryEcho => ({ ...base!, echoId, ...extra });

  it("prefers an exact match over a looser one for the same owned echo", () => {
    // the owned echo has the scanned order; a reordered scan copy must not take it from the exact one
    const reordered = row("reordered", {
      echoSubStatsType1: base!.echoSubStatsType2,
      echoSubStatsValue1: base!.echoSubStatsValue2,
      echoSubStatsType2: base!.echoSubStatsType1,
      echoSubStatsValue2: base!.echoSubStatsValue1,
    });
    const plan = planNewEchoes([reordered, row("exact")], [row("owned")]);
    expect(plan.owned).toHaveLength(1);
    expect(plan.owned[0]).toMatchObject({ kind: "exact" });
    expect(plan.owned[0]!.scanned.echoId).toBe("exact");
    expect(plan.toAdd.map((echo) => echo.echoId)).toEqual(["reordered"]);
  });

  it("matches loosely only fully rolled echoes: fewer than five substats must match exactly", () => {
    const unrolled = { echoSubStatsType3: null, echoSubStatsValue3: null, echoSubStatsType4: null, echoSubStatsValue4: null, echoSubStatsType5: null, echoSubStatsValue5: null };
    const scan = row("scan", unrolled);
    // the same two rolls in another order, and the same rolls on a 4★: another copy, not a typo
    const swapped = row("swapped", {
      ...unrolled,
      echoSubStatsType1: base!.echoSubStatsType2,
      echoSubStatsValue1: base!.echoSubStatsValue2,
      echoSubStatsType2: base!.echoSubStatsType1,
      echoSubStatsValue2: base!.echoSubStatsValue1,
    });
    const fourStar = row("four", { ...unrolled, rank: 4 });
    const plan = planNewEchoes([scan, row("scan-bare", { ...unrolled, echoSubStatsType1: null, echoSubStatsValue1: null, echoSubStatsType2: null, echoSubStatsValue2: null })], [
      swapped,
      fourStar,
      row("four-bare", { ...unrolled, rank: 4, echoSubStatsType1: null, echoSubStatsValue1: null, echoSubStatsType2: null, echoSubStatsValue2: null }),
    ]);
    expect(plan.owned).toEqual([]);
    expect(plan.toAdd.map((echo) => echo.echoId)).toEqual(["scan", "scan-bare"]);
    expect(plan.notInScan).toHaveLength(3);
    // the same partial echo stored the same way still matches exactly
    expect(planNewEchoes([scan], [row("owned", unrolled)]).owned[0]).toMatchObject({ kind: "exact" });
  });

  it("matches loosely typed inventory rows (cost and rarity as strings)", () => {
    const plan = planNewEchoes([row("scan")], [{ ...row("owned"), type: "4", rank: "5" } as unknown as WavescanInventoryEcho]);
    expect(plan.owned[0]).toMatchObject({ kind: "exact", skinDiffers: false });
  });

  it("never matches across sets, main stats or costs", () => {
    const plan = planNewEchoes([row("scan")], [row("a", { echoSet: "Other" }), row("b", { stat: "CritDMG" }), row("c", { type: 3 })]);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.notInScan).toHaveLength(3);
  });

  it("handles an empty scan or inventory", () => {
    expect(planNewEchoes([], [row("a")])).toEqual({ toAdd: [], owned: [], notInScan: [row("a")] });
    expect(planNewEchoes([row("s")], [])).toEqual({ toAdd: [row("s")], owned: [], notInScan: [] });
  });
});

describe("display helpers", () => {
  const { echoes: scanned } = mapScan();
  const plan = planNewEchoes(scanned, inventory);

  it("labels every substat with its name and unit", () => {
    expect(substatsOf(scanned[0]!)).toEqual([
      { label: "Crit DMG", value: "17.4%" },
      { label: "ATK", value: "9.4%" },
      { label: "ATK", value: "40" },
      { label: "Energy Regen", value: "8.4%" },
      { label: "Heavy Attack DMG", value: "7.9%" },
    ]);
    expect(substatsOf(scanned.find((echo) => echo.echo === "PhantomGulpuff")!)).toHaveLength(4);
    expect(statName("CritRate")).toBe("Crit Rate");
    expect(statName("HP")).toBe("HP");
    expect(statName("ResonanceLiberationDMGBonus")).toBe("Liberation DMG");
    expect(statName("Havoc")).toBe("Havoc DMG Bonus");
  });

  it("explains each loose match in a sentence", () => {
    const note = (echo: string) => matchNote(plan.owned.find((match) => match.scanned.echo === echo)!);
    expect(note("PhantomSigillum")).toMatch(/Scanned as the Phantom skin/);
    expect(note("Dreamless")).toMatch(/inventory has it as the Phantom skin/);
    expect(note("GlacioDrake")).toMatch(/another order/);
    expect(note("Sacerdos")).toMatch(/4★ and the scan says 5★/);
    expect(note("Tambourinist")).toBeNull();
  });

  it("groups skins under their base echo, highest cost first", () => {
    const groups = groupByBaseEcho(scanned, (echo) => echo);
    expect(groups.map((group) => [group.name, group.cost, group.items.length])).toEqual([
      ["Dreamless", 4, 1],
      ["Sigillum", 4, 1],
      ["Fog Lionarch", 3, 1],
      ["Tambourinist", 3, 3],
      ["Glacio Drake", 1, 1],
      ["Gulpuff", 1, 1],
      ["Sacerdos", 1, 1],
    ]);
    const mixed = groupByBaseEcho([scanned[1]!, inventory[1]!], (echo) => echo);
    expect(mixed).toHaveLength(1);
    expect(mixed[0]!.items.map((echo) => echo.echo)).toEqual(["Dreamless", "PhantomDreamless"]);
  });
});
