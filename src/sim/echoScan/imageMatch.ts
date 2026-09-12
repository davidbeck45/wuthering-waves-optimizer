// Wuthering Tools+: thin promise wrapper over the app's echoParser worker
// (pixel matching of echo portraits and set glyphs) for the batch scanner.
import EchoParserWorker from "../../workers/echoParser.worker?worker";
import { mainEchoesData, getCostByClass } from "../../echoes/index";
import { getEchoSetIconByType } from "../../echoes/stats";
import type { Region } from "./phoneEchoScan";

type WorkerReply = { type: string; echoMatch?: { echoKey: string }; setMatch?: { setKey: string }; error?: string };

export class EchoImageMatcher {
  private worker: Worker | null = null;

  /** Loads every echo's reference portrait into the worker (network: the assets CDN). */
  async init(): Promise<void> {
    this.worker = new EchoParserWorker();
    const echoReferences = Object.values(mainEchoesData).map((echo) => ({ key: echo.key, imageUrl: echo.image }));
    await this.request("ready", { type: "init", data: { echoReferences } });
  }

  private request(replyType: string, message: unknown, transfer: Transferable[] = []): Promise<WorkerReply> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("image matcher not initialised"));
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent<WorkerReply>): void => {
        if (event.data?.type === replyType) {
          worker.removeEventListener("message", handler);
          resolve(event.data);
        } else if (event.data?.type === "error") {
          worker.removeEventListener("message", handler);
          reject(new Error(event.data.error ?? "image match failed"));
        }
      };
      worker.addEventListener("message", handler);
      worker.postMessage(message, transfer);
    });
  }

  /** The screenshot the next matches crop from; the bitmap is transferred to the worker. */
  async setSource(bitmap: ImageBitmap): Promise<void> {
    await this.request("ready", { type: "setSourceImage", data: { sourceImageBitmap: bitmap } }, [bitmap]);
  }

  async matchSet(region: Region, possibleSets: string[]): Promise<string | null> {
    if (!possibleSets.length) return null;
    const setImageUrls = Object.fromEntries(possibleSets.map((set) => [set, getEchoSetIconByType(set)]));
    const reply = await this.request("setMatch", { type: "matchSet", data: { setCoords: region, possibleSets, setImageUrls } }).catch(() => null);
    return reply?.setMatch?.setKey ?? null;
  }

  async matchEcho(region: Region, cost: number | null): Promise<string | null> {
    const filteredEchoKeys = Object.values(mainEchoesData)
      .filter((echo) => cost === null || getCostByClass(echo.class) === cost)
      .map((echo) => echo.key);
    const reply = await this.request("echoMatch", { type: "parseEcho", data: { echoCoords: region, filteredEchoKeys } }).catch(() => null);
    return reply?.echoMatch?.echoKey ?? null;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
