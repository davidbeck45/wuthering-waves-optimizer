// Wuthering Tools+ Echo Lab worker entry: every engine-backed echo decision runs here, off the UI thread.
// The protocol and caching live in workerHost.ts (shared with the client's main-thread fallback).
import { createEchoLabHost, type EchoLabRequest, type EchoLabResponse } from "./workerHost";

interface WorkerScope {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  postMessage: (message: EchoLabResponse) => void;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onmessage: ((event: MessageEvent<EchoLabRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const host = createEchoLabHost((message) => scope.postMessage(message));
scope.onmessage = (event) => {
  void host.onMessage(event.data);
};
