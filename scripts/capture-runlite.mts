// Wuthering Tools+: captures src/sim/engine/__fixtures__/runLite.json — `tracedRun` of the SYNTHETIC team on the
// SYNTHETIC account in src/sim/engine/__fixtures__/syntheticAccount.ts (no personal data). Re-run after every
// vendor/wuwa_calc bump (rileyRun.test.ts checks the fixture field for field only while its commit matches the engine's):
//   npx tsx scripts/capture-runlite.mts            (dry run: prints size / needs / members)
//   npx tsx scripts/capture-runlite.mts --write
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rileyHeadless } from "../src/sim/engine/rileyNode.ts";
import { SYNTHETIC_ACCOUNT, SYNTHETIC_TEAM } from "../src/sim/engine/__fixtures__/syntheticAccount.ts";

const out = join(dirname(fileURLToPath(import.meta.url)), "../src/sim/engine/__fixtures__/runLite.json");
const h = await rileyHeadless(SYNTHETIC_ACCOUNT);
const best = h.bestFor(SYNTHETIC_TEAM);
if (!best?.best) throw new Error(`no solve for ${SYNTHETIC_TEAM.join(" + ")}`);
const run = h.tracedRun(best.teamKey, best.best.picks);
const json = JSON.stringify(run);
console.log(best.teamKey, "size", json.length, "rows", run.rows.length, "hits", run.hits.length, "dps", run.total, "commit", run.engine.commit);
console.log("needs", Object.entries(run.needs).map(([n, x]) => `${n} bar ${x.bar?.toFixed(1)} min ${x.minEr} const ${x.constant.toFixed(1)}`).join(" | "));
console.log("members", run.members.map((m) => `${m.name} S${m.sequence} ${m.weapon} R${m.refinement} ${m.spread} er=${m.erRolls}`).join(" | "));
if (process.argv.includes("--write")) {
  writeFileSync(out, json + "\n");
  console.log("wrote src/sim/engine/__fixtures__/runLite.json");
}
