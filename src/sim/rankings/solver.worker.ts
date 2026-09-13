// Worker entry for the /rankings page: Riley's solver.ts registers its `onmessage` handler when it
// finds itself in a worker scope (no `document`, a `self`), so importing it is most of the job.
// Wuthering Tools+ adds one message of its own: the player's "My build" substat spreads, which
// the solver in this worker has to carry too (it builds the rows).
import "@skittle/solver";
import { setMySubstat } from "@skittle/solver";
import { customSubstats } from "@skittle/shared/substats";

interface MyBuildsMessage {
  type: "mySubstats";
  builds: Array<{ name: string; key: string; rolls: Array<{ kind: string; value: number }> }>;
  clear?: string[];
}

const riley = self.onmessage;
self.onmessage = (event: MessageEvent<MyBuildsMessage | unknown>) => {
  const data = event.data as MyBuildsMessage | null;
  if (data && typeof data === "object" && data.type === "mySubstats") {
    for (const name of data.clear ?? []) setMySubstat(name, null);
    for (const b of data.builds) setMySubstat(b.name, b.rolls.length ? customSubstats("My build", b.rolls) : null, b.key);
    return;
  }
  riley?.call(self, event as MessageEvent);
};
