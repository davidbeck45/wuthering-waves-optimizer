import { describe, expect, it } from "vitest";
import { runBasisOf, runOutlived } from "./optimizerRunBasis";

const record = () => ({
  activeBuildId: "b1",
  weapon: "EverbrightPolestar",
  weapons: { EverbrightPolestar: { weaponLevel: "90", refinement: "5" }, Other: { weaponLevel: "90", refinement: "1" } },
  weaponPassives: { Passive: { isEnabled: true } },
  echoes: { 0: { echoId: "a" } },
  mainEcho: { echo: "Sigillum", rank: 5 },
});

describe("what a run's rows were scored on", () => {
  const scoredOn = runBasisOf("Aemeath", record());

  it("the rows outlive nothing while the build and weapon stay", () => {
    expect(runOutlived(scoredOn, runBasisOf("Aemeath", record()))).toBe(false);
    expect(runOutlived(null, runBasisOf("Aemeath", record()))).toBe(false);
  });

  it("Equip loadout changes the echoes and the main echo: the rows stay", () => {
    const equipped = { ...record(), echoes: { 0: { echoId: "b" } }, mainEcho: { echo: "ReactorHusk", rank: 5 } };
    expect(runOutlived(scoredOn, runBasisOf("Aemeath", equipped))).toBe(false);
  });

  it("another build, weapon, refinement, level or passive setting outlives them", () => {
    const changed = [
      { ...record(), activeBuildId: "b2" },
      { ...record(), weapon: "Other" },
      { ...record(), weapons: { ...record().weapons, EverbrightPolestar: { weaponLevel: "90", refinement: "1" } } },
      { ...record(), weapons: { ...record().weapons, EverbrightPolestar: { weaponLevel: "80", refinement: "5" } } },
      { ...record(), weaponPassives: { Passive: { isEnabled: false } } },
    ];
    for (const next of changed) expect(runOutlived(scoredOn, runBasisOf("Aemeath", next))).toBe(true);
  });

  it("a held weapon's level on another weapon is not this one's business", () => {
    const other = { ...record(), weapons: { ...record().weapons, Other: { weaponLevel: "1", refinement: "3" } } };
    expect(runOutlived(scoredOn, runBasisOf("Aemeath", other))).toBe(false);
  });

  it("another character is left to the character change", () => {
    expect(runOutlived(scoredOn, runBasisOf("Zani", { ...record(), weapon: "Other" }))).toBe(false);
  });

  it("reads a record with nothing on it", () => {
    expect(runBasisOf("Aemeath", undefined).key).toBe(runBasisOf("Aemeath", {}).key);
  });
});
