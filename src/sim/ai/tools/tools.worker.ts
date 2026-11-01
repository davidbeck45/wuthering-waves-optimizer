// Wuthering Tools+ AI — worker entry: runs registry tools off the main thread (the roster ranking scores every
// rotation and team for seconds; the page must stay responsive while Claude waits for it). Plain messages
// only: { id, name, input, exp, autoBuffs, now, stored } in, { id, result } out. The memo (tools/memo.ts) lives
// here, so a second rank_roster in the same account state is instant. `stored` = the localStorage keys the tool
// reads (`AiTool.reads`), snapshotted on the main thread: a worker has no localStorage.
import { readOnlyStorage, runTool } from "./index";
import type { ExportFile } from "../../cli/exportShape";

export interface ToolWorkerRequest {
  id: number;
  name: string;
  input: unknown;
  exp: ExportFile;
  autoBuffs?: boolean;
  /** ISO time */
  now: string;
  /** the values of the localStorage keys the tool reads */
  stored?: Record<string, string | null>;
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
const scope = self as unknown as { onmessage: ((e: MessageEvent<ToolWorkerRequest>) => void) | null; postMessage: (message: unknown) => void };

scope.onmessage = (e) => {
  const { id, name, input, exp, autoBuffs, now, stored } = e.data;
  void runTool(name, input, { exp, autoBuffs, now: new Date(now), storage: stored ? readOnlyStorage(stored) : null }).then((result) => scope.postMessage({ id, result }));
};
