// Wuthering Tools+ AI — `ctx.riley` in the browser: the shared `rileyClient()` (Riley's engine in the EXISTING solver
// worker, src/sim/rankings/solver.worker.ts — no new worker entry) at the account the tools are reading. The pages
// that use the same client (/energy, /endgame, /rotation, /build-team) share its memo, so a question about a team the
// player just looked at is answered from it. Main thread only (the account derivation reads builds through the
// calculator); assistantRuntime.ts runs the `riley` tools here and everything else in the tool worker.
import { rileyAccountOf } from "../engine/rileyAccount";
import { rileyClient } from "../engine/rileyClient";
import type { RileyAccount } from "../engine/rileyRun";
import { accountFingerprint } from "./tools/shared";
import type { RileyProvider, RileyToolEngine } from "./tools/riley";

let last: { key: string; account: RileyAccount } | null = null;

/** Riley's engine at the account in `exp`, through the app's one solver worker. */
export const browserRiley: RileyProvider = async (exp) => {
  const key = accountFingerprint(exp);
  if (last?.key !== key) last = { key, account: rileyAccountOf(exp.characters, exp.inventory, exp.teams) };
  const account = last.account;
  const client = rileyClient();
  const engine: RileyToolEngine = {
    commit: client.commit,
    account,
    teams: () => client.teams(),
    teamKeysFor: (ids) => client.teamKeysFor(ids),
    solveMine: (keys, opts) => client.solveMine(keys, { account, subs: opts?.subs }),
    tracedRun: (teamKey, picks, opts) => client.tracedRun(teamKey, picks, { account, subs: opts?.subs }),
    curves: (teamKey, picks, profiles) => client.curves(teamKey, picks, profiles, { account }),
  };
  return engine;
};
