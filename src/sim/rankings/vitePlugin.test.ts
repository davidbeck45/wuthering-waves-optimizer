import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { skittlePoolShim } from "./vitePlugin";

const root = path.resolve(__dirname, "../../..");
const pageDir = path.join(root, "vendor/wuwa_calc/src/page");
const shim = path.join(root, "src/sim/rankings/rileyPool.ts");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolve = (source: string, importer?: string): unknown => (skittlePoolShim(pageDir, shim).resolveId as any)(source, importer);

describe("skittlePoolShim", () => {
  it("points his page modules' ./pool.js at the app's pool", () => {
    expect(resolve("./pool.js", path.join(pageDir, "loading.ts"))).toBe(shim);
    expect(resolve("./pool.js", `${path.join(pageDir, "index.ts")}?v=1`)).toBe(shim);
    expect(resolve("@skittle/page/pool")).toBe(shim);
  });

  it("leaves every other import alone", () => {
    expect(resolve("./model.js", path.join(pageDir, "loading.ts"))).toBeNull();
    expect(resolve("./pool.js", path.join(root, "src/sim/other/thing.ts"))).toBeNull();
    expect(resolve("./pool.js")).toBeNull();
  });

  it("his pool.ts still imports what the shim stands in for, and his loading.ts still asks for it", () => {
    // the next sync: a rename on his side shows here, not as a page that will not load
    expect(readFileSync(path.join(pageDir, "loading.ts"), "utf8")).toMatch(/from "\.\/pool\.js"/);
    const his = readFileSync(path.join(pageDir, "pool.ts"), "utf8");
    for (const name of ["paint", "breathe", "workerPool", "cancelQueued", "solveAll"]) {
      expect(his).toMatch(new RegExp(`export (async )?(function|const) ${name}\\b`));
    }
  });
});
