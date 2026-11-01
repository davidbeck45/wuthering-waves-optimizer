import { describe, expect, it } from "vitest";
import { closestPage, editDistance } from "./notFound";
import { CORE_PAGES } from "./paletteItems";
import { PLUS_PAGES } from "./plusPages";

const pages = [...CORE_PAGES, ...PLUS_PAGES];

describe("editDistance", () => {
  it("counts inserts, deletes, changes and adjacent swaps as one edit each", () => {
    expect(editDistance("account", "account")).toBe(0);
    expect(editDistance("acount", "account")).toBe(1);
    expect(editDistance("todya", "today")).toBe(1);
    expect(editDistance("energi", "energy")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("closestPage", () => {
  it("finds the page a typo meant", () => {
    expect(closestPage("/acount", pages)?.path).toBe("/account");
    expect(closestPage("/todya", pages)?.path).toBe("/today");
    expect(closestPage("/echolab", pages)?.path).toBe("/echo-lab");
    expect(closestPage("/my_rankings", pages)?.path).toBe("/my-rankings");
    expect(closestPage("/Settings/", pages)?.path).toBe("/settings");
  });

  it("matches a page's title as well as its path", () => {
    expect(closestPage("/calculator", pages)?.path).toBe("/");
    expect(closestPage("/my-account", pages)?.path).toBe("/account");
    expect(closestPage("/tower-of-adversity", pages)?.path).toBe("/endgame");
  });

  it("reads the first segment of a deeper path and ignores the query and hash", () => {
    expect(closestPage("/account/old-tab", pages)?.path).toBe("/account");
    expect(closestPage("/inventry?x=1#y", pages)?.path).toBe("/inventory");
  });

  it("offers nothing when no page is close", () => {
    expect(closestPage("/xyzzy-plugh", pages)).toBeNull();
    expect(closestPage("/", pages)).toBeNull();
    expect(closestPage("", pages)).toBeNull();
  });
});
