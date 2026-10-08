import { describe, expect, it } from "vitest";
// Import the package module directly (not the app shim) so no data is set yet.
import {
  derivedFromGameData,
  scannerGameData,
  setScannerGameData,
  type ScannerGameData,
} from "@wutheringtools/scanner-core/gameData";

function data(names: string[]): ScannerGameData {
  return {
    echoes: Object.fromEntries(
      names.map((name) => [name.replace(/\W/g, ""), { key: name.replace(/\W/g, ""), name, class: "Elite" }]),
    ),
    echoCostByClass: { Elite: 3 },
    statsTable: {},
    subStatsTable: {},
    verboseStatLabelMap: {},
    flatBonusesByRankByType: {},
  };
}

describe("scanner-core game data", () => {
  it("throws a clear error if the host app never supplied data", () => {
    expect(() => scannerGameData()).toThrow(/setScannerGameData/);
  });

  it("recomputes derived values only when new data is supplied", () => {
    let computeCount = 0;
    const echoCount = derivedFromGameData((d) => {
      computeCount += 1;
      return Object.keys(d.echoes).length;
    });

    setScannerGameData(data(["Sabercat Prowler"]));
    expect(echoCount()).toBe(1);
    expect(echoCount()).toBe(1);
    expect(computeCount).toBe(1);

    setScannerGameData(data(["Sabercat Prowler", "Hecate"]));
    expect(echoCount()).toBe(2);
    expect(computeCount).toBe(2);
  });
});
