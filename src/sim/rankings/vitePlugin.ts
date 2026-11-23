// Wuthering Tools+ — Riley's page modules (vendor/wuwa_calc/src/page) import their solver pool as `./pool.js`. His
// pool.ts starts its workers with `new Worker(new URL(\`./solver.js?v=${Date.now()}\`, import.meta.url))`: a template
// string Vite refuses to transform ("not supported in dynamic template string"), so any module that reaches it (his
// loading.ts, and through it detail.ts and pickmenu.ts) fails to load — and it would be a ninth worker entry. This
// resolves that one import, from his page folder only, to the app's own pool (rileyPool.ts: the same exports on the
// app's `solver.worker.ts`). Used by vite.config.ts for the dev server and the build alike.

import path from "node:path";
import type { Plugin } from "vite";

export function skittlePoolShim(pageDir: string, shim: string): Plugin {
  const dir = path.resolve(pageDir) + path.sep;
  return {
    name: "wt-plus-skittle-pool",
    enforce: "pre",
    resolveId(source, importer) {
      // the alias form (`@skittle/page/pool`), should anything in the app ask for his pool by name
      if (/^@skittle\/page\/pool(\.js|\.ts)?$/.test(source)) return shim;
      if (!importer || !/^\.\/pool(\.js|\.ts)?$/.test(source)) return null;
      return path.resolve(importer.split("?")[0]!).startsWith(dir) ? shim : null;
    },
  };
}
