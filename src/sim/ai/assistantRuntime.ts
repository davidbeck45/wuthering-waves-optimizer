// Wuthering Tools+ AI — everything heavy the assistant needs, behind ONE dynamic import (useAssistant.ts
// `runtimeLoader`): the conversation store and agent loop (which pull in the tool registry and the engine),
// the live account adapter, the Web Worker tool runner and the client factory. The SDK itself is a further lazy
// chunk (client.ts), loaded on the first request. Nothing in the main bundle imports this module statically.
import type { ToolRunner } from "./agentLoop";
import { browserRiley } from "./rileyBrowser";
import { createToolWorkerRunner, type ToolWorkerRunner } from "./toolWorker";
import { readOnlyStorage, runTool as runToolInThread, toolNeeds, type ToolContext, type ToolStorage } from "./tools/index";

export { askInConversation, canContinue, clearConversation, continueConversation, loadConversation, newConversation, saveConversation, transcriptOf, truncateBefore } from "./conversation";
export { exportFromStores } from "../live/liveExport";
export { createAnthropicClient, describeError, testApiKey } from "./client";

let worker: ToolWorkerRunner | null = null;
let workerBroken = false;

/** The page caches and preferences tools may read; writes are dropped (tools never write). */
function browserStorage(): ToolStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : readOnlyStorage(localStorage);
  } catch {
    return null; // storage blocked (privacy mode): tools run without the page caches
  }
}

/** What the browser adds to every call: read-only storage, and Riley's engine for the tools that need it. */
const withHost = (ctx: ToolContext): ToolContext => ({ ...ctx, storage: ctx.storage ?? browserStorage(), riley: ctx.riley ?? browserRiley });

/** Tools run in a Web Worker (rank_roster takes ~1.5 s on a big account); if the worker can't start or crashes,
 *  the call is re-run on the main thread so an answer never fails for that reason. The tools on Riley's engine
 *  (energy_check, team_rotation, toa_check, build_team_plan) run on the main thread: their engine work happens in
 *  the app's existing solver worker (rileyClient), which only the main thread can reach. */
export function toolRunner(): ToolRunner {
  if (typeof Worker === "undefined" || workerBroken) return (name, input, ctx) => runToolInThread(name, input, withHost(ctx));
  return async (name, input, ctx) => {
    const host = withHost(ctx);
    if (toolNeeds(name).thread === "main") return runToolInThread(name, input, host);
    try {
      worker ??= createToolWorkerRunner();
      return await worker.runTool(name, input, host);
    } catch {
      workerBroken = true;
      worker?.dispose();
      worker = null;
      return runToolInThread(name, input, host);
    }
  };
}
