import { describe, expect, it } from "vitest";
import { isGeneratedTeamName } from "../rankings/importFromRankings";
import { optimizerCopyName } from "./optimizerCopyName";

describe("optimizerCopyName", () => {
  it("names a copy of a generated team as the player's own team, in every form the mark takes", () => {
    for (const name of ["Aemeath · Chisa + Denia · S6R5 (wuwa_calc)", "Phrolova · Cantarella + Roccia (wuwa_calc t307)", "wuwa_calc Zani · Phoebe + Shorekeeper"]) {
      expect(isGeneratedTeamName(name)).toBe(true);
      const copy = optimizerCopyName(name);
      expect(isGeneratedTeamName(copy), copy).toBe(false);
      expect(copy.endsWith(" (optimizer)")).toBe(true);
    }
    expect(optimizerCopyName("Phrolova · Cantarella + Roccia (wuwa_calc t307)")).toBe("Phrolova · Cantarella + Roccia (optimizer)");
  });

  it("leaves the player's own names as his Save named them", () => {
    expect(optimizerCopyName("My Lupa team")).toBe("My Lupa team (optimizer)");
    expect(optimizerCopyName("")).toBe("Team (optimizer)");
    expect(optimizerCopyName(null)).toBe("Team (optimizer)");
  });
});
