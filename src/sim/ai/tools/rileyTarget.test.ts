// The assistant's team argument given as a wuwa_calc team key ("t249", what a /rotation address carries).
// 2026-11-16, second check of the male Rover fix: his list names a Rover by the female key, so on an account that plays
// Rover Aero (Male) the key resolved to a character the account does not have. The player's saved team of the same
// three was not found, and the energy tool read the Rover as not set up.
import { describe, expect, it } from "vitest";
import type { ExportFile } from "../../cli/exportFile";
import { rileyTeamTarget, type RileyToolEngine } from "./riley";

const riley = {
  teams: async () => [
    { key: "t249", members: [{ name: "Shorekeeper", appKey: "Shorekeeper", mainDps: false }, { name: "Aero Rover", appKey: "RoverAeroFemale", mainDps: false }, { name: "Sigrika", appKey: "Sigrika", mainDps: true }] },
  ],
} as unknown as RileyToolEngine;

const account = (rover: string, teams: unknown[] = []): ExportFile =>
  ({ characters: { [rover]: { weapon: "BloodpactsPledge" }, Shorekeeper: { weapon: "StellarSymphony" }, Sigrika: { weapon: "SolswornCiphers" } }, teams, inventory: { echoes: [], equipped: {} } }) as unknown as ExportFile;

describe("a wuwa_calc team key names the Rover the account plays", () => {
  it("a male Rover's account: his key, and his saved team of the same three", async () => {
    const saved = { id: "s1", name: "My Sigrika team", characterIds: ["Sigrika", "RoverAeroMale", "Shorekeeper"] };
    const target = await rileyTeamTarget("t249", account("RoverAeroMale", [saved]), riley);
    expect(target.characterIds).toEqual(["Shorekeeper", "RoverAeroMale", "Sigrika"]);
    expect(target.saved).toBe(saved);
    expect(target.name).toBe("My Sigrika team");
    // a /rotation row key reads the same
    expect((await rileyTeamTarget("t249-0.0.0.s1.r0", account("RoverAeroMale"), riley)).characterIds).toEqual(["Shorekeeper", "RoverAeroMale", "Sigrika"]);
  });

  it("an account that plays her keeps the key his list carries", async () => {
    expect((await rileyTeamTarget("t249", account("RoverAeroFemale"), riley)).characterIds).toEqual(["Shorekeeper", "RoverAeroFemale", "Sigrika"]);
  });
});
