// Wuthering Tools+ — the newest Convene record link in a PC log file, scanned in a worker (main-thread fallback when
// workers are unavailable). Returns null when the log holds no link: the player has to open Convene › History first.
import { extractConveneLinkFromLog } from "../gachaImport";

let seq = 0;

export async function scanLogForLink(file: Blob): Promise<string | null> {
  const bytes = await file.arrayBuffer();
  if (typeof Worker === "undefined") return extractConveneLinkFromLog(bytes);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./logScan.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return extractConveneLinkFromLog(bytes);
  }
  const id = ++seq;
  try {
    return await new Promise<string | null>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ id: number; link: string | null }>) => {
        if (e.data?.id === id) resolve(e.data.link);
      };
      worker.onerror = (e) => {
        e.preventDefault();
        reject(new Error("worker failed"));
      };
      worker.postMessage({ id, bytes }, [bytes]);
    });
  } catch {
    // the buffer was transferred away; read the file again on this thread
    return extractConveneLinkFromLog(await file.arrayBuffer());
  } finally {
    worker.terminate();
  }
}
