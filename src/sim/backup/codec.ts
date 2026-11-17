// Wuthering Tools+ automatic backups — the stored form of a backup file: gzip from the browser's own
// CompressionStream where it exists (a 330 KB account is about 40 KB), the plain text where it does not. No dependency.
import type { BackupData } from "./backupStore";

// eslint-disable-next-line no-unused-vars -- the parameter of a constructor type
type StreamCtor = new (format: "gzip") => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };

function ctor(name: "CompressionStream" | "DecompressionStream"): StreamCtor | null {
  const found = (globalThis as Record<string, unknown>)[name];
  return typeof found === "function" ? (found as StreamCtor) : null;
}

/** Pushes `bytes` through a stream and collects what comes out. Reading starts before the write ends: a large input
 *  waits on the reader. */
async function through(Stream: StreamCtor, bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Stream("gzip");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const write = (async () => {
    await writer.write(bytes);
    await writer.close();
  })();
  const read = (async () => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  })();
  // both, so a failure on either side is caught here and neither is left unhandled
  const [, out] = await Promise.all([write, read]);
  return out;
}

export interface Packed {
  enc: "gzip" | "text";
  data: BackupData;
  /** stored size in bytes (a string is counted as UTF-16, as IndexedDB keeps it at worst) */
  bytes: number;
}

/** The file text as it is stored. Never throws: without compression it is kept as text. */
export async function pack(text: string): Promise<Packed> {
  const Compression = ctor("CompressionStream");
  if (Compression && typeof TextEncoder !== "undefined") {
    try {
      const data = await through(Compression, new TextEncoder().encode(text));
      return { enc: "gzip", data, bytes: data.length };
    } catch {
      /* a browser that names the API and fails on it: kept as text */
    }
  }
  return { enc: "text", data: text, bytes: text.length * 2 };
}

/** Back to the file text. Throws on bytes that are not what `pack` wrote (gzip checks its own checksum). */
export async function unpack(enc: "gzip" | "text", data: BackupData): Promise<string> {
  if (enc === "text") {
    if (typeof data !== "string") throw new Error("a text backup that is not text");
    return data;
  }
  if (typeof data === "string") throw new Error("a compressed backup that is text");
  const Decompression = ctor("DecompressionStream");
  if (!Decompression) throw new Error("this browser cannot read a compressed backup");
  return new TextDecoder("utf-8", { fatal: true }).decode(await through(Decompression, data));
}
