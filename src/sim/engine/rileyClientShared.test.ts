// Wuthering Tools+ the Riley client's shared requests: the team list and the memo are one request for many callers, so
// one caller leaving must not fail the others. A worker that answers when told, since the order is what is under test.
import { describe, expect, it } from "vitest";
import { createRileyClient, type WorkerLike } from "./rileyClient";
import { RILEY_MESSAGE } from "./rileyWorker";

interface Sent {
  type: string;
  id: number;
  op?: string;
}

function setup() {
  const sent: Sent[] = [];
  const worker: WorkerLike = { onmessage: null, onerror: null, postMessage: (m) => sent.push(m as Sent), terminate() {} };
  const client = createRileyClient({ createWorker: () => worker });
  const asked = (op: string): Sent[] => sent.filter((m) => m.type === RILEY_MESSAGE && m.op === op);
  const answer = (message: Sent, result: unknown): void => worker.onmessage!({ data: { type: RILEY_MESSAGE, id: message.id, ok: true, result } });
  return { client, worker, asked, answer };
}

const TEAMS = { teams: [{ key: "k", members: [{ name: "Aemeath" }] }] };
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
/** past the team list, which every solve waits for */
async function ready() {
  const s = setup();
  const list = s.client.teams();
  s.answer(s.asked("teams")[0]!, TEAMS);
  await list;
  return s;
}

describe("the team list, one request for the app", () => {
  it("a caller who left in the same tick does not fail the one who asked next: Build my team fell to Ryan's presets", async () => {
    const { client, asked, answer } = setup();
    const a = new AbortController();
    const first = client.teamKeysFor(["Aemeath", null, null], a.signal);
    a.abort();
    const second = client.teamKeysFor(["Aemeath", null, null], new AbortController().signal);
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    answer(asked("teams")[0]!, TEAMS);
    await expect(second).resolves.toEqual([]);
    expect(asked("teams")).toHaveLength(1); // the worker's start is not paid twice
  });

  it("a caller who joined before the first one left keeps waiting", async () => {
    const { client, asked, answer } = setup();
    const a = new AbortController();
    const first = client.teams(a.signal);
    const second = client.teams();
    a.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    answer(asked("teams")[0]!, TEAMS);
    await expect(second).resolves.toEqual(TEAMS.teams);
  });

  it("a caller leaving is answered at once, and an answer is kept for the next", async () => {
    const { client, asked, answer } = setup();
    const a = new AbortController();
    const first = client.teams(a.signal);
    a.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    answer(asked("teams")[0]!, TEAMS);
    await flush();
    await expect(client.teams()).resolves.toEqual(TEAMS.teams);
    expect(asked("teams")).toHaveLength(1);
  });

  it("a failed list is not kept: the next ask starts over", async () => {
    const { client, worker, asked } = setup();
    const first = client.teams();
    worker.onerror!({ message: "gone" });
    await expect(first).rejects.toThrow("gone");
    void client.teams().catch(() => {});
    expect(asked("teams")).toHaveLength(2);
  });

  it("a signal already gone rejects without a request", async () => {
    const { client, asked } = setup();
    const a = new AbortController();
    a.abort();
    await expect(client.teams(a.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(asked("teams")).toHaveLength(0);
  });
});

describe("a memoised solve or run, asked under the first caller's signal", () => {
  const SOLVE = { teamKey: "k", best: null };

  it("solveMine: the first caller's cancel is not the second's, who asks again", async () => {
    const { client, asked, answer } = await ready();
    const a = new AbortController();
    const first = client.solveMine(["k"], { signal: a.signal });
    await flush();
    const second = client.solveMine(["k"], { signal: new AbortController().signal });
    await flush();
    expect(asked("solveMine")).toHaveLength(1); // joined
    a.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(asked("solveMine")).toHaveLength(2);
    answer(asked("solveMine")[1]!, [SOLVE]);
    await expect(second).resolves.toEqual([SOLVE]);
  });

  it("solveMine: a retry in the same tick as the cancel gets its own answer", async () => {
    const { client, asked, answer } = await ready();
    const a = new AbortController();
    const first = client.solveMine(["k"], { signal: a.signal });
    await flush();
    a.abort();
    const second = client.solveMine(["k"], {});
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    answer(asked("solveMine").at(-1)!, [SOLVE]);
    await expect(second).resolves.toEqual([SOLVE]);
  });

  it("solveMine: the caller's own cancel ends it, with no second request", async () => {
    const { client, asked } = await ready();
    const a = new AbortController();
    const first = client.solveMine(["k"], { signal: a.signal });
    await flush();
    a.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(asked("solveMine")).toHaveLength(1);
  });

  it("tracedRun: the same", async () => {
    const { client, asked, answer } = await ready();
    const a = new AbortController();
    const first = client.tracedRun("k", null, { signal: a.signal });
    await flush();
    const second = client.tracedRun("k", null, {});
    await flush();
    a.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(asked("trace")).toHaveLength(2);
    answer(asked("trace")[1]!, { teamKey: "k" });
    await expect(second).resolves.toEqual({ teamKey: "k" });
  });

  it("curves: the same", async () => {
    const { client, asked, answer } = await ready();
    const a = new AbortController();
    const first = client.curves("k", [], [null], { signal: a.signal });
    await flush();
    const second = client.curves("k", [], [null], {});
    await flush();
    a.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(asked("curves")).toHaveLength(2);
    answer(asked("curves")[1]!, [[1, 2]]);
    await expect(second).resolves.toEqual([[1, 2]]);
  });

  it("a real failure is not asked again", async () => {
    const { client, worker, asked } = await ready();
    const first = client.solveMine(["k"], {});
    await flush();
    worker.onmessage!({ data: { type: RILEY_MESSAGE, id: asked("solveMine")[0]!.id, ok: false, error: "engine says no" } });
    await expect(first).rejects.toThrow("engine says no");
    await flush();
    expect(asked("solveMine")).toHaveLength(1);
  });
});
