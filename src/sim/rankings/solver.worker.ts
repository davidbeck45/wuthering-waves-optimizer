// Worker entry for the /rankings page: Riley's solver.ts registers its `onmessage` handler when it
// finds itself in a worker scope (no `document`, a `self`), so importing it is most of the job.
// Wuthering Tools+ adds two messages of its own, since the solver in this worker builds the rows:
// the player's "My build" substat spreads, and the player's account state (the `mine` cost).
import "@skittle/solver";
import { setAccountState, setMySubstat } from "@skittle/solver";
import { customSubstats } from "@skittle/shared/substats";

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
  riley?.call(self, event as MessageEvent);
};
