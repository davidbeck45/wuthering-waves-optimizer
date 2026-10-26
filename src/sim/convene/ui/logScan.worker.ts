// Wuthering Tools+ — reads the newest Convene record link out of a PC log off the main thread (a Client.log can run
// to tens of MB). The link is a bearer token: it goes back to the page in memory and nowhere else.
import { extractConveneLinkFromLog } from "../gachaImport";

self.onmessage = (e: MessageEvent<{ id: number; bytes: ArrayBuffer }>) => {
  const { id, bytes } = e.data;
  let link: string | null = null;
  try {
    link = extractConveneLinkFromLog(bytes);
  } catch {
    link = null;
  }
  (self as unknown as Worker).postMessage({ id, link });
};
