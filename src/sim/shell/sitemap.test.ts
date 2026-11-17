// Wuthering Tools+ — public/sitemap.xml is Ryan's file with plus's address on every page. After a sync it must list
// the pages his lists (it had fallen five behind: /scanners and four /info pages), and none on his address.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const sitemap = readFileSync(resolve(root, "public/sitemap.xml"), "utf8");
const main = readFileSync(resolve(root, "src/main.ts"), "utf8");
const PLUS = "https://wuthering-tools-plus.vercel.app";
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
const paths = locs.map((loc) => loc.slice(PLUS.length) || "/");

describe("the sitemap on plus's address", () => {
  it("lists every page on plus's address, each once, none on Ryan's", () => {
    expect(locs.length).toBeGreaterThan(20);
    expect(locs.filter((loc) => loc !== PLUS && !loc.startsWith(`${PLUS}/`))).toEqual([]);
    expect(sitemap).not.toMatch(/wutheringtools\.com/);
    expect(new Set(locs).size).toBe(locs.length);
  });

  it("lists the scanners page and every fixed page under /info that the router has", () => {
    // main.ts: { path: "cv-echo-rating", component: InfoCvRv, … } — the children of /info with a fixed address
    const info = [...main.matchAll(/\{ path: "([a-z-]+)", component: Info[A-Za-z]+,/g)].map((m) => `/info/${m[1]}`);
    expect(info).toEqual(expect.arrayContaining(["/info/guides", "/info/cv-echo-rating", "/info/tuning-odds", "/info/formulas", "/info/credits"]));
    for (const page of ["/scanners", "/info", ...info]) expect(paths, page).toContain(page);
  });

  it("every dated entry carries a real date", () => {
    const dates = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
    expect(dates.length).toBe(locs.length);
    for (const date of dates) expect(date).toMatch(/^20\d\d-[01]\d-[0-3]\d$/);
  });
});
