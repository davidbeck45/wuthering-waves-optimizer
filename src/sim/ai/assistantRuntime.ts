// Wuthering Tools+ AI — everything heavy the assistant needs, behind ONE dynamic import (useAssistant.ts
// `runtimeLoader`): the conversation store and agent loop (which pull in the tool registry and the engine),
// the live account adapter, the Web Worker tool runner and the client factory. The SDK itself is a further lazy
// chunk (client.ts), loaded on the first request. Nothing in the main bundle imports this module statically.
import type { ToolRunner } from "./agentLoop";
import { createToolWorkerRunner, type ToolWorkerRunner } from "./toolWorker";
import { runTool as runToolInThread } from "./tools/index";

export { askInConversation, canContinue, clearConversation, continueConversation, loadConversation, newConversation, saveConversation, transcriptOf, truncateBefore } from "./conversation";
export { exportFromStores } from "../live/liveExport";
export { createAnthropicClient, describeError, testApiKey } from "./client";

let worker: ToolWorkerRunner | null = null;
let workerBroken = false;

/** Tools run in a Web Worker (rank_roster takes ~1.5 s on a big account); if the worker can't start or crashes,
 *  the call is re-run on the main thread so an answer never fails for that reason. */
export function toolRunner(): ToolRunner {
  if (typeof Worker === "undefined" || workerBroken) return runToolInThread;
  return async (name, input, ctx) => {
    try {
      worker ??= createToolWorkerRunner();
      return await worker.runTool(name, input, ctx);
    } catch {
      workerBroken = true;
      worker?.dispose();
      worker = null;
      return runToolInThread(name, input, ctx);
    }
  };
}
