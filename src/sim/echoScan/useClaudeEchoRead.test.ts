// Wuthering Tools+ — "Read with Claude" in the batch importer (useClaudeEchoRead): how results land in the review
// table. The client and the canvas work are stubbed; the reading and the checks are the real claudeVision.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import * as sdk from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import responses from "./__fixtures__/claudeVisionResponses.json";
import { resetAiSettingsState, useAiSettings } from "../ai/aiSettings";
import { resetAssistantState, useAssistant } from "../ai/useAssistant";
import { newScanItem, type ScanItem } from "./batchItems";
import type { ScanRecord } from "./phoneEchoScan";

// eslint-disable-next-line no-unused-vars -- the parameter of a function type
type Step = keyof typeof responses | Error | ((signal?: AbortSignal) => Promise<BetaMessage>);
const script: Step[] = [];
const created: Array<{ apiKey?: string | null }> = [];

vi.mock("./visionImage", () => ({
  probeImage: async () => ({ width: 3120, height: 1440, thumb: null }),
  prepareVisionImage: async () => ({
    data: "QUJD",
    mediaType: "image/jpeg",
    width: 2576,
    height: 1189,
    sourceWidth: 3120,
    sourceHeight: 1440,
    thumb: "data:image/jpeg;base64,VEhVTUI=",
    crop: async () => ({ data: "R0xZUEg=", mediaType: "image/png", width: 384, height: 384, sourceWidth: 192, sourceHeight: 192 }),
    dispose: () => {},
  }),
}));

vi.mock("../ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/client")>();
  return {
    ...actual,
    createAnthropicClient: async (options: { apiKey?: string | null }) => {
      created.push(options);
      const client = {
        beta: {
          messages: {
            create: async (_params: unknown, options?: { signal?: AbortSignal }): Promise<BetaMessage> => {
              const step = script.shift();
              if (!step) throw new Error("unexpected request");
              if (step instanceof Error) throw step;
              if (typeof step === "function") return step(options?.signal);
              return JSON.parse(JSON.stringify(responses[step])) as BetaMessage;
            },
          },
        },
      };
      return { client, sdk };
    },
  };
});

const { useClaudeEchoRead } = await import("./useClaudeEchoRead");

const KEY = "sk-ant-api03-test-0000000000000000000000";
const file = (name: string): File => new File(["x"], name, { type: "image/jpeg" });

function setup(items: ScanItem[]) {
  const list = ref(items);
  const read = useClaudeEchoRead({ items: list, busy: ref(false), fileFor: async (item) => item.file as File });
  return { list, read };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetAiSettingsState();
  resetAssistantState();
  script.length = 0;
  created.length = 0;
});

describe("useClaudeEchoRead", () => {
  it("without a key, opens AI settings instead of reading", async () => {
    const { read } = setup([newScanItem({ file: file("a.jpg"), name: "a.jpg" })]);
    expect(read.hasKey.value).toBe(false);
    await read.run();
    expect(useAssistant().state.settingsOpen).toBe(true);
    expect(created).toHaveLength(0);
  });

  it("estimates the chosen rows at the chosen model and picks flagged rows first", async () => {
    useAiSettings().setApiKey(KEY);
    const ok = newScanItem({ file: file("ok.jpg"), name: "ok.jpg", status: "done", record: { echo: "X", flags: [] } as unknown as ScanRecord, size: { width: 3120, height: 1440 } });
    const pc = newScanItem({ file: file("pc.png"), name: "pc.png", status: "unsupported", size: { width: 1920, height: 1080 } });
    const { read } = setup([ok, pc]);
    expect(read.scope.value).toBe("flagged");
    expect(read.targets.value.map((i) => i.name)).toEqual(["pc.png"]);
    const one = read.estimate.value.usd;
    read.setScope("all");
    expect(read.targets.value).toHaveLength(2);
    expect(read.estimate.value.usd).toBeGreaterThan(one);
    useAiSettings().update({ model: "claude-haiku-5-5" });
    expect(read.estimate.value.usd).toBeLessThan(one / 10);
    expect(read.modelLabel.value).toBe("Haiku 5.5");
  });

  it("asks before a run whose estimate is above the soft budget, and reads nothing on a no", async () => {
    useAiSettings().setApiKey(KEY);
    useAiSettings().update({ budgetUsd: 0.05 }); // below one Opus phone shot
    const asked: Array<[number, number]> = [];
    let answer = false;
    const list = ref([newScanItem({ file: file("sabercat.jpg"), name: "sabercat.jpg" })]);
    const read = useClaudeEchoRead({
      items: list,
      busy: ref(false),
      fileFor: async (item) => item.file as File,
      confirmOverBudget: async (usd, budget) => {
        asked.push([usd, budget]);
        return answer;
      },
    });
    expect(read.overBudget.value).toBe(true);
    await read.run();
    expect(asked).toHaveLength(1);
    expect(asked[0][1]).toBe(0.05);
    expect(asked[0][0]).toBeCloseTo(read.estimate.value.usd, 6);
    expect(created).toHaveLength(0);
    expect(list.value[0].claudeState).toBe("none");

    answer = true;
    script.push("sabercat");
    await read.run();
    expect(asked).toHaveLength(2);
    expect(list.value[0]).toMatchObject({ source: "claude", claudeState: "done" });

    // without a way to ask, an over-budget run never starts
    const silent = setup([newScanItem({ file: file("b.jpg"), name: "b.jpg" })]);
    await silent.read.run();
    expect(created).toHaveLength(1);
  });

  it("fills the rows: a clean read is checked, an impossible one unchecked, a two-echo page becomes two rows", async () => {
    useAiSettings().setApiKey(KEY);
    const sabercat = newScanItem({ file: file("sabercat.jpg"), name: "sabercat.jpg" });
    const blurry = newScanItem({ file: file("blurry.jpg"), name: "blurry.jpg" });
    const pc = newScanItem({ file: file("pc.png"), name: "pc.png", status: "unsupported", error: "1920×1080 is not a supported layout" });
    const { list, read } = setup([sabercat, blurry, pc]);
    read.setScope("all");
    // concurrency 2: sabercat and blurry go first, then the PC page (+ its glyph pass)
    script.push("sabercat", "impossible", "pcTwoEchoes", "pcSetPick");
    await read.run();
    expect(created[0]).toEqual({ apiKey: KEY });
    expect(list.value.map((i) => [i.name, i.status, i.source, i.include])).toEqual([
      ["sabercat.jpg", "done", "claude", true],
      ["blurry.jpg", "done", "claude", false],
      ["pc.png", "done", "claude", true],
      ["pc.png · 2/2", "done", "claude", true],
    ]);
    const [s, b, p, child] = list.value;
    expect(s.record).toMatchObject({ echo: "SabercatProwler", set: "SoundofTrueName", flags: [] });
    expect(s.claude).toMatchObject({ confidence: 0.96, echoesOnShot: 1 });
    expect(s.thumb).toBe("data:image/jpeg;base64,VEhVTUI=");
    expect(b.record?.flags.length).toBeGreaterThan(3);
    expect(p.error).toBeNull();
    expect(p.record?.echo).toBe("PhantomCrownless");
    expect(child).toMatchObject({ parentId: p.id, claudeState: "done", thumb: p.thumb });
    expect(child.record).toMatchObject({ echo: "HavocWarrior", set: "HavocEclipse" });
    expect(read.summary.value).toMatchObject({ screenshots: 3, echoes: 4, failed: 0, stopped: false });
    expect(read.summary.value?.costUsd).toBeGreaterThan(0);
    // nothing left to read
    expect(read.all.value).toHaveLength(0);
  });

  it("keeps the OCR record, flags a disagreement and unchecks the row", async () => {
    useAiSettings().setApiKey(KEY);
    const ocrRecord = {
      file: "s.jpg",
      echo: "SabercatProwler",
      echoName: "Sabercat Prowler",
      echoScore: 1,
      set: "SoundofTrueName",
      cost: 3,
      level: 25,
      rank: 5,
      main: ["ATK", "30.0%"],
      subs: [
        ["CritRate", "9.9%"],
        ["HP", "10.9%"],
        ["BasicAttackDMGBonus", "8.6%"],
        ["EnergyRegen", "7.6%"],
      ],
      flags: ["only 4 substats read"],
      ocr: { name: "", chip: "", panel: [] },
      rows: [],
    } as ScanRecord;
    const item = newScanItem({ file: file("s.jpg"), name: "s.jpg", status: "done", record: ocrRecord, include: true });
    const { list, read } = setup([item]);
    script.push("sabercat");
    await read.run();
    const row = list.value[0];
    expect(row.source).toBe("claude");
    expect(row.ocrRecord).toEqual(ocrRecord);
    expect(row.include).toBe(false);
    expect(row.record?.flags).toEqual(["substats differ — OCR: Crit. Rate 9.9%; Claude: Crit. Rate 9.3%, Resonance Liberation DMG Bonus 10.9%"]);
  });

  it("cancels the request in flight when the importer closes (its scope is disposed)", async () => {
    useAiSettings().setApiKey(KEY);
    const item = newScanItem({ file: file("slow.jpg"), name: "slow.jpg" });
    let seen: AbortSignal | undefined;
    script.push(
      (signal) =>
        new Promise<BetaMessage>((_resolve, reject) => {
          seen = signal;
          signal?.addEventListener("abort", () => reject(new sdk.APIUserAbortError()));
        }),
    );
    const scope = effectScope();
    const { list, read } = scope.run(() => setup([item]))!;
    const running = read.run();
    await vi.waitFor(() => expect(list.value[0].claudeState).toBe("reading"));
    scope.stop();
    await running;
    expect(seen?.aborted).toBe(true);
    expect(list.value[0]).toMatchObject({ claudeState: "none", status: "queued", record: null });
    expect(read.summary.value).toMatchObject({ stopped: true, failed: 0 });
  });

  it("leaves a row's OCR result alone when the read fails, and lets it be retried", async () => {
    useAiSettings().setApiKey(KEY);
    const item = newScanItem({ file: file("x.jpg"), name: "x.jpg", status: "unsupported", error: "unsupported size" });
    const { list, read } = setup([item]);
    script.push(new sdk.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "bad key" } }, "bad key", new Headers()));
    await read.run();
    expect(list.value[0]).toMatchObject({ status: "unsupported", source: "ocr", claudeState: "error", claudeError: "Anthropic rejected the API key. Check it in AI settings." });
    expect(read.summary.value).toMatchObject({ failed: 1, echoes: 0 });
    expect(read.flagged.value).toHaveLength(1);
  });
});
