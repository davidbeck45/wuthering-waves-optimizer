import { describe, expect, it } from "vitest";
import type { ResonatorPickRow } from "../weaponValue/selector";
import { newResonatorVerdict } from "./newResonator";

const row = (over: Partial<ResonatorPickRow>): ResonatorPickRow => ({ key: "Lily", status: "new", setUp: false, sequence: null, dupe: null, uplift: null, newTeams: null, ran: null, note: null, ...over });
const ran = { weapon: "Cadenza", refinement: 1, sequence: 0, approximated: true };

describe("newResonatorVerdict: what one copy of a resonator the account lacks would add, in words", () => {
  it("says so when no main DPS's best team gets better, and shows the closest pair with both figures", () => {
    const v = newResonatorVerdict(
      row({
        uplift: {
          gain: 0,
          mainDps: "Aemeath",
          with: { team: ["Lily", "Lynae", "Aemeath"], teamKey: "t273", dps: 269545.4 },
          base: { team: ["Lupa", "Lynae", "Aemeath"], teamKey: "t279", dps: 322302.2 },
        },
        newTeams: { count: 36, best: { team: ["Lily", "Lynae", "Aemeath"], teamKey: "t273", dps: 269545.4 }, top: [] },
        ran,
      }),
      "Lily",
    );
    expect(v.tone).toBe("none");
    expect(v.headline).toBe("Lily would not raise the best team of any main DPS you own.");
    expect(v.lines).toEqual([
      "Closest: Aemeath · Lily + Lynae does 269,545 DPS with Lily. Your best Aemeath team today, Aemeath · Lupa + Lynae, does 322,302 DPS: 19.6% more.",
      "Lily makes 36 more teams fieldable on your account.",
      "Run as one copy: S0 with Cadenza R1, wuwa_calc's best weapon for Lily that is not a signature.",
    ]);
  });

  it("names the main DPS, the rise and both teams when one does get better", () => {
    const v = newResonatorVerdict(
      row({
        uplift: {
          gain: 0.0561,
          mainDps: "Sigrika",
          with: { team: ["Lily", "Lucilla", "Sigrika"], teamKey: "t254", dps: 274382 },
          base: { team: ["Phrolova", "Qiuyuan", "Sigrika"], teamKey: "t239", dps: 259766 },
        },
        newTeams: { count: 1, best: null, top: [] },
        ran: { ...ran, weapon: "Lullaby", approximated: false },
      }),
      "Lily",
    );
    expect(v.tone).toBe("gain");
    expect(v.headline).toBe("Lily would raise your best Sigrika team by 5.6%.");
    expect(v.lines).toEqual([
      "Sigrika · Lily + Lucilla does 274,382 DPS with Lily. Your best Sigrika team today, Sigrika · Phrolova + Qiuyuan, does 259,766 DPS.",
      "Lily makes 1 more team fieldable on your account.",
      "Run as one copy: S0 with Lullaby R1.",
    ]);
  });

  it("gives the engine's own reason where there is no figure, and never a made-up one", () => {
    expect(newResonatorVerdict(row({ status: "no-teams", note: "wuwa_calc has no team with them" }), "Lily")).toEqual({ tone: "unknown", headline: "wuwa_calc has no team with Lily, so there is nothing to run.", lines: [] });
    expect(newResonatorVerdict(row({ status: "not-in-app" }), "Nobody").headline).toBe("Nobody is not in this app yet, so wuwa_calc's teams with Nobody can't be run here.");
    expect(newResonatorVerdict(row({ status: "error", note: "worker died" }), "Lily").headline).toBe("wuwa_calc could not run Lily's teams: worker died.");
    // on the account after all (set up between the advisor's run and this one): the advisor's own rows answer
    expect(newResonatorVerdict(row({ status: "owned" }), "Lily").tone).toBe("unknown");
    // nobody to pair with
    const none = newResonatorVerdict(row({ note: "no wuwa_calc team with them that the rest of your account can field" }), "Lily");
    expect(none).toEqual({ tone: "unknown", headline: "wuwa_calc has no team with Lily that the rest of your account can field.", lines: [] });
  });
});
