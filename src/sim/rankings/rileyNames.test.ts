// His Rarity enum is erased at build (a const enum), so the page keeps its numbers; this reads them off his source.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RARITY } from "./rileyNames";

describe("RARITY", () => {
  it("numbers his Rarity enum's members in the order his source declares them", () => {
    const src = readFileSync(resolve(__dirname, "../../../vendor/wuwa_calc/src/engine/stats.ts"), "utf8");
    const body = /export const enum Rarity \{([\s\S]*?)\}/.exec(src)?.[1] ?? "";
    const names = body.split("\n").map((l) => l.replace(/\/\/.*|\/\*.*?\*\//g, "").trim()).filter(Boolean).map((l) => l.replace(/,$/, ""));
    expect(names).toEqual(Object.keys(RARITY));
    names.forEach((name, i) => expect(RARITY[name as keyof typeof RARITY]).toBe(i));
  });
});
