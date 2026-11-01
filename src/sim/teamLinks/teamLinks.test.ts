import { describe, expect, it } from "vitest";
import { parseRotationHash } from "../rotation/hash";
import { notSetUpText, teamCharsOf, teamPlusLinks } from "./teamLinks";

describe("Teams page → plus team tools", () => {
  it("only offers the tools for a full three-member team", () => {
    expect(teamCharsOf(["Aemeath", "Mornye", "Lynae"])).toEqual(["Aemeath", "Mornye", "Lynae"]);
    expect(teamCharsOf(["Aemeath", null, "Lynae"])).toBeNull();
    expect(teamCharsOf([])).toBeNull();
  });

  it("opens the composition's cue card and timeline at the account, and the energy and ToA checks", () => {
    const links = teamPlusLinks(["Aemeath", "Mornye", "Lynae"]);
    expect(links.map((l) => l.id)).toEqual(["cue", "timeline", "energy", "endgame"]);
    const cue = new URL(links[0]!.to, "https://x.test");
    expect(cue.pathname).toBe("/rotation");
    const parsed = parseRotationHash(cue.hash);
    expect(parsed.target).toEqual({ kind: "chars", chars: ["Aemeath", "Mornye", "Lynae"] });
    expect(parsed.tab).toBe("cue");
    expect(parseRotationHash(new URL(links[1]!.to, "https://x.test").hash).tab).toBe("timeline");
    expect(links[2]!.to).toBe("/energy");
    expect(links[3]!.to).toBe("/endgame");
    for (const l of links) expect(l.title.length).toBeGreaterThan(10);
  });

  it("says which members wuwa_calc ran without the account's build", () => {
    const m = (appKey: string, owned: boolean, sequence = 0, refinement = 1) => ({ appKey, owned, sequence, refinement });
    expect(notSetUpText([m("Aemeath", true, 6, 5), m("Mornye", true), m("Lynae", true)])).toBe("");
    expect(notSetUpText([m("Aemeath", true, 6, 5), m("Mornye", false), m("Lynae", false)])).toBe(
      "Mornye and Lynae are not set up in the calculator, so wuwa_calc runs them at S0 R1.",
    );
    expect(notSetUpText([m("RoverAeroFemale", false, 6, 1), m("Mornye", true), m("Lynae", true)])).toBe(
      "Rover Aero is not set up in the calculator, so wuwa_calc runs Rover Aero at S6 R1.",
    );
    expect(notSetUpText([m("Aemeath", false, 0, 1), m("Mornye", false, 6, 1), m("Lynae", true)])).toBe(
      "Aemeath and Mornye are not set up in the calculator, so wuwa_calc runs Aemeath at S0 R1 and Mornye at S6 R1.",
    );
  });
});
