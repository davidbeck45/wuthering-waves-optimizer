import { describe, expect, it } from "vitest";
import { canonHash, viewMatches } from "./savedViews";

describe("viewMatches: which saved /rankings view is on screen", () => {
  it("ignores the order Riley writes the parameters in and a team page's own", () => {
    expect(canonHash("#tc=mine&own=0&r=Cartethyia")).toBe("own=0&r=Cartethyia&tc=mine");
    expect(viewMatches("#tc=mine&own=0", "#own=0&tc=mine&t=daVoFU2Egjkg")).toBe(true);
    expect(viewMatches("#tc=mine&own=0", "#own=0&tc=mine&team=t25-0.0.0.s0.r0")).toBe(true);
  });

  it("reads a view saved before his level filters as the settled one", () => {
    expect(viewMatches("#tc=s6r5&r=Cartethyia", "#r=CartethyiaS6&tc=s6r5")).toBe(true);
    expect(viewMatches("#r=Cartethyia,Ciaccona", "#r=CartethyiaS0,CiacconaS0")).toBe(true);
    expect(viewMatches("#x=Lupa&tc=s6r5", "#tc=s6r5&x=LupaS6")).toBe(true);
  });

  it("keeps different views apart", () => {
    expect(viewMatches("#tc=s6r5&r=CartethyiaS6", "#tc=s6r5&r=CartethyiaS0")).toBe(false);
    expect(viewMatches("#tc=s6r5&r=Cartethyia", "#tc=r1&r=CartethyiaS0")).toBe(false);
    expect(viewMatches("#tc=s6r5&r=Lupa", "#tc=s6r5&r=LupaS6&x=Mornye")).toBe(false);
    expect(viewMatches("#wr=Cartethyia", "#wr=CartethyiaS6")).toBe(false);
    expect(viewMatches("#r=Car", "#r=CartethyiaS6")).toBe(false);
    expect(viewMatches("", "#tc=s6r5")).toBe(false);
    expect(viewMatches("", "")).toBe(true);
  });
});
