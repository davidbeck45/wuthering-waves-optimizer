// Wuthering Tools+ AI — worker entry: runs registry tools off the main thread (the roster ranking scores every
// rotation and team for seconds; the page must stay responsive while Claude waits for it). Plain messages
// only: { id, name, input, exp, autoBuffs, now } in, { id, result } out. The memo (tools/memo.ts) lives here,
// so a second rank_roster in the same account state is instant.
import { runTool } from "./index";
import type { ExportFile } from "../../cli/exportShape";

export interface ToolWorkerRequest {
  id: number;
  name: string;
  input: unknown;
  exp: ExportFile;
  autoBuffs?: boolean;
  /** ISO time */
  now: string;
}

// eslint-disable-next-line no-unused-vars -- the parameters of a function type
const scope = self as unknown as { onmessage: ((e: MessageEvent<ToolWorkerRequest>) => void) | null; postMessage: (message: unknown) => void };

scope.onmessage = (e) => {
  const { id, name, input, exp, autoBuffs, now } = e.data;
  void runTool(name, input, { exp, autoBuffs, now: new Date(now) }).then((result) => scope.postMessage({ id, result }));
};
