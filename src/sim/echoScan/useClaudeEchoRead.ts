// Wuthering Tools+ — "Read with Claude" inside the phone-screenshot batch importer: which rows to read, what it
// should cost, the run (concurrency 2, Stop), and how a result lands in the review table — Claude's records take the
// row (an OCR record it replaces is kept for the cross-check), a screenshot with several echoes becomes several rows,
// a failed read leaves the row's OCR result alone. The reading and the checks are claudeVision.ts.
// Light on purpose: the importer is eager (upstream's inventory modal), so the reader, its schema and the API client
// load on the first "Read with Claude" click (`loadReader`), never with the page.
import { computed, getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";
import { useAiSettings } from "../ai/aiSettings";
import type { AnthropicSdk } from "../ai/client";
import { modelInfo } from "../ai/models";
import { useAssistant } from "../ai/useAssistant";
import { claudeCandidates, newScanItem, type ScanItem } from "./batchItems";
import type { ClaudeEchoRead, VisionImage, VisionImageResult } from "./claudeVision";
import { estimateVisionCost } from "./claudeVisionCost";
import { norm } from "./phoneEchoScan";
import { prepareVisionImage, probeImage } from "./visionImage";

type Reader = typeof import("./claudeVision") & Pick<typeof import("../ai/client"), "createAnthropicClient" | "describeError">;

/** The reader + the client, one lazy load on the first run. */
async function loadReader(): Promise<Reader> {
  const [vision, client] = await Promise.all([import("./claudeVision"), import("../ai/client")]);
  return { ...vision, createAnthropicClient: client.createAnthropicClient, describeError: client.describeError };
}

export type ClaudeScope = "flagged" | "all";

export interface ClaudeRunSummary {
  screenshots: number;
  echoes: number;
  failed: number;
  stopped: boolean;
  costUsd: number;
}

export interface ClaudeEchoReadOptions {
  items: Ref<ScanItem[]>;
  /** the OCR scan is running: Claude waits */
  busy: Ref<boolean>;
  /** the row's screenshot (album photos are fetched again) */
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  fileFor(item: ScanItem): Promise<File>;
  /** asked before a run whose estimate is above the soft budget (AI settings); no answer → no run */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  confirmOverBudget?(estimateUsd: number, budgetUsd: number): Promise<boolean>;
}

const baseName = (name: string | null): string => norm((name ?? "").replace(/^\s*phantom\s*:\s*/i, ""));

export function useClaudeEchoRead(options: ClaudeEchoReadOptions) {
  const ai = useAiSettings();
  const assistant = useAssistant();

  const hasKey = computed(() => ai.key.value.present);
  const model = computed(() => ai.settings.value.model);
  const modelLabel = computed(() => modelInfo(model.value).label.replace(/^Claude\s+/, ""));

  const flagged = computed(() => claudeCandidates(options.items.value, "flagged"));
  const all = computed(() => claudeCandidates(options.items.value, "all"));
  /** null: follow the rows (flagged ones first when there are any) */
  const scopeChoice = ref<ClaudeScope | null>(null);
  const scope = computed<ClaudeScope>(() => scopeChoice.value ?? (flagged.value.length ? "flagged" : "all"));
  const targets = computed(() => (scope.value === "flagged" ? flagged.value : all.value));
  const estimate = computed(() => estimateVisionCost(targets.value.map((item) => item.size), model.value));
  const overBudget = computed(() => estimate.value.usd > ai.settings.value.budgetUsd);

  const running = ref(false);
  const progress = ref({ done: 0, total: 0 });
  const spentUsd = ref(0);
  const summary = ref<ClaudeRunSummary | null>(null);
  const runError = ref<string | null>(null);
  let controller: AbortController | null = null;

  // sizes for the estimate (and a thumbnail for the queue), probed once per screenshot as rows arrive
  const probing = new Set<string>();
  watch(
    () => options.items.value.length,
    () => {
      for (const item of options.items.value) {
        if (item.size || !item.file || probing.has(item.id)) continue;
        probing.add(item.id);
        void probeImage(item.file).then((probe) => {
          if (!probe) return;
          if (!item.size) item.size = { width: probe.width, height: probe.height };
          if (!item.thumb) item.thumb = probe.thumb;
        });
      }
    },
    { immediate: true },
  );

  function setScope(next: ClaudeScope): void {
    scopeChoice.value = next;
  }

  function openSettings(): void {
    assistant.openSettings();
  }

  function fill(reader: Reader, target: ScanItem, read: ClaudeEchoRead, ocr: ScanItem["record"], echoesOnShot: number): void {
    const disagreements = ocr ? reader.compareWithOcr(read.record, ocr) : [];
    read.record.flags.push(...disagreements);
    target.record = read.record;
    target.source = "claude";
    target.status = "done";
    target.error = null;
    target.ocrRecord = ocr;
    target.claudeState = "done";
    target.claudeError = null;
    target.claude = { confidence: read.confidence, notes: read.notes, printedName: read.printedName, equippedBy: read.equippedBy, echoesOnShot };
    target.include = Boolean(read.record.echo) && !read.blocking && disagreements.length === 0;
  }

  function apply(reader: Reader, item: ScanItem, result: VisionImageResult): void {
    if (!result.ok) {
      if (result.error.kind === "aborted") {
        item.claudeState = "none";
        return;
      }
      item.claudeState = "error";
      item.claudeError = result.error.message;
      return;
    }
    if (!result.echoes.length) {
      item.claudeState = "done";
      item.claudeError = "Claude found no echo with its stats on this screenshot.";
      if (!item.record) {
        item.status = "error";
        item.error = item.claudeError;
      }
      return;
    }
    // the OCR record pairs with Claude's echo of the same name (else the first)
    const ocr = item.source === "ocr" && item.record ? item.record : null;
    const pair = ocr ? result.echoes.findIndex((read) => baseName(read.record.echoName) === baseName(ocr.echoName)) : -1;
    const ordered = pair > 0 ? [result.echoes[pair], ...result.echoes.filter((_, i) => i !== pair)] : result.echoes;
    const [first, ...rest] = ordered;
    fill(reader, item, first, ocr, result.echoes.length);
    if (!rest.length) return;
    const children = rest.map((read) => {
      const child = newScanItem({ file: item.photo ? null : item.file, photo: item.photo, name: read.record.file, parentId: item.id, thumb: item.thumb, size: item.size });
      fill(reader, child, read, null, result.echoes.length);
      return child;
    });
    const at = options.items.value.indexOf(item);
    options.items.value.splice(at < 0 ? options.items.value.length : at + 1, 0, ...children);
  }

  async function run(): Promise<void> {
    if (running.value || options.busy.value) return;
    const apiKey = ai.getApiKey();
    if (!apiKey) {
      openSettings();
      return;
    }
    const queue = [...targets.value];
    if (!queue.length) return;
    // the soft budget: past it the player says yes first, as the assistant asks before a chat goes over
    if (overBudget.value) {
      const ok = options.confirmOverBudget ? await options.confirmOverBudget(estimate.value.usd, ai.settings.value.budgetUsd) : false;
      if (!ok || running.value || options.busy.value) return;
    }
    running.value = true;
    runError.value = null;
    summary.value = null;
    spentUsd.value = 0;
    progress.value = { done: 0, total: queue.length };
    controller = new AbortController();
    const signal = controller.signal;
    const tally = { echoes: 0, failed: 0 };
    let sdk: AnthropicSdk | null = null;
    let reader: Reader | null = null;
    try {
      reader = await loadReader();
      const loaded = reader;
      const created = await loaded.createAnthropicClient({ apiKey });
      sdk = created.sdk;
      const images: VisionImage[] = queue.map((item) => ({
        id: item.id,
        name: item.name,
        async load() {
          const prepared = await prepareVisionImage(await options.fileFor(item));
          if (!item.thumb) item.thumb = prepared.thumb;
          if (!item.size) item.size = { width: prepared.sourceWidth, height: prepared.sourceHeight };
          return prepared;
        },
      }));
      await loaded.readEchoesWithClaude(images, {
        client: created.client,
        sdk,
        model: model.value,
        effort: ai.effortFor("vision"),
        signal,
        onImageStart: (_image, index) => {
          queue[index].claudeState = "reading";
          queue[index].claudeError = null;
        },
        onImageDone: (_image, result, index) => {
          spentUsd.value += result.usage.costUsd;
          apply(loaded, queue[index], result);
          if (result.ok) tally.echoes += result.echoes.length;
          else if (result.error.kind !== "aborted") tally.failed += 1;
          if (result.ok || result.error.kind !== "aborted") progress.value = { ...progress.value, done: progress.value.done + 1 };
        },
      });
    } catch (error) {
      runError.value = reader ? reader.describeError(error, sdk).message : "Couldn't load the screenshot reader. Check your connection and try again.";
    } finally {
      for (const item of queue) if (item.claudeState === "reading") item.claudeState = "none";
      summary.value = { screenshots: progress.value.done, echoes: tally.echoes, failed: tally.failed, stopped: signal.aborted, costUsd: spentUsd.value };
      running.value = false;
      controller = null;
    }
  }

  function stop(): void {
    controller?.abort();
  }
  // closing the importer mid-run cancels the requests in flight (nothing keeps spending after the rows are gone)
  if (getCurrentScope()) onScopeDispose(stop);

  return { hasKey, model, modelLabel, flagged, all, scope, setScope, targets, estimate, overBudget, running, progress, spentUsd, summary, runError, run, stop, openSettings };
}
