// Worker entry for the /rankings page: Riley's solve/solver.ts registers its `onmessage` handler when it
// finds itself in a worker scope (no `document`, a `self`), so importing it is most of the job.
// Wuthering Tools+ adds two messages of its own, since the solver in this worker builds the rows:
// the player's "My build" substat spreads, and the player's account state (the `mine` cost).
// And the Riley run seam's requests (src/sim/engine/rileyWorker.ts, Wave 0): `mine` solves and traced runs as
// plain RunLite data for the pages built on it — answered here so there is one solver worker entry.
import "@skittle/solve/solver";
import * as solver from "@skittle/solve/solver";
import * as teamrun from "@skittle/solve/teamrun";
import * as stats from "@skittle/engine/stats";
import * as model from "@skittle/page/model";
import * as substats from "@skittle/shared/substats";
import { setAccountState, setMySubstat } from "@skittle/solve/solver";
import { customSubstats } from "@skittle/shared/substats";
import { createRileyHandler } from "../engine/rileyWorker";
import { WUWA_CALC_COMMIT } from "../engine/engineCommit";

interface MyBuildsMessage {
  type: "mySubstats";
  builds: Array<{ name: string; key: string; rolls: Array<{ kind: string; value: number }> }>;
  clear?: string[];
}
interface AccountMessage {
  type: "accountState";
  entries: Record<string, { sequence: number; weapon: string | null; refine: number; owned: boolean }> | null;
  key: string;
}

const seam = createRileyHandler({ solver, teamrun, stats, model, substats, commit: WUWA_CALC_COMMIT }, (message) => self.postMessage(message));

const riley = self.onmessage;
self.onmessage = (event: MessageEvent<MyBuildsMessage | AccountMessage | unknown>) => {
  const data = event.data as MyBuildsMessage | AccountMessage | null;
  if (data && typeof data === "object" && data.type === "mySubstats") {
    for (const name of data.clear ?? []) setMySubstat(name, null);
    for (const b of data.builds) setMySubstat(b.name, b.rolls.length ? customSubstats("My build", b.rolls) : null, b.key);
    return;
  }
  if (data && typeof data === "object" && data.type === "accountState") {
    setAccountState(data.entries, data.key);
    return;
  }
  if (seam(event.data)) return;
  riley?.call(self, event as MessageEvent);
};
