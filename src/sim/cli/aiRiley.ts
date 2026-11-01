// Wuthering Tools+ — `ctx.riley` under Node (the CLI's `ask`, the AI tools' tests): the headless Riley run seam
// (rileyNode.ts) at an export's account, in the shape the AI tools take (src/sim/ai/tools/riley.ts). Node-only: it
// imports rileyNode (node:child_process), so nothing the browser bundles may import it.
import type { ExportFile } from "./exportShape";
import { rileyHeadless, type HeadlessRiley } from "../engine/rileyNode";
import { fightCurve } from "../engine/rileyRun";
import { withFloorProfile } from "../endgame/effects";
import { accountFingerprint } from "../ai/tools/shared";
import type { RileyProvider, RileyToolEngine } from "../ai/tools/riley";

const sessions = new Map<string, Promise<HeadlessRiley>>();

/** Riley's engine at the export's account, loaded once per account state in this process. */
export const headlessRiley: RileyProvider = async (exp: ExportFile) => {
  const key = accountFingerprint(exp);
  let session = sessions.get(key);
  if (!session) {
    session = rileyHeadless(exp);
    session.catch(() => sessions.delete(key));
    sessions.set(key, session);
    while (sessions.size > 4) sessions.delete(sessions.keys().next().value as string);
  }
  const riley = await session;
  const E = riley.engine;
  const engine: RileyToolEngine = {
    commit: E.commit,
    account: riley.account,
    teams: async () => riley.teams,
    teamKeysFor: async (ids) => riley.teamKeysFor(ids),
    solveMine: async (keys, opts) => riley.solveMine(keys, { subs: opts?.subs }),
    tracedRun: async (teamKey, picks, opts) => riley.tracedRun(teamKey, picks, { subs: opts?.subs }),
    curves: async (teamKey, picks, profiles) =>
      profiles.map((spec) => withFloorProfile(E, spec, () => fightCurve(E, teamKey, picks, { account: riley.account, blocked: riley.blocked }))),
  };
  return engine;
};
