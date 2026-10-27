// Wuthering Tools+ share cards — PNG `iTXt` text chunks: write one before IEND, read one back. Pure (bytes in,
// bytes out); the zlib step uses the platform's CompressionStream, so no dependency.
//
// The chunk walk, the CRC-32 and the 16 KB cap are a port of Tacet Lab's `src/scanner/card-metadata.ts`
// (DJ12421/Tacet-Lab, GPL-3.0, commit 5386bfa — https://github.com/DJ12421/Tacet-Lab), which writes its build
// cards the same way under the keyword `TacetLabCard`. Differences: any keyword, the compressed iTXt form
// (flag 1, zlib) on top of the plain one, and a damaged chunk is skipped instead of thrown, so one bad chunk
// never hides a good one after it.
//
// iTXt layout (PNG spec 11.3.4.5): keyword, NUL, compression flag (1 byte), compression method (1 byte, 0 =
// zlib), language tag, NUL, translated keyword, NUL, then the text (UTF-8, zlib-compressed when the flag is 1).

export const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
/** The cap on one text chunk's data, as stored (compressed when compressed) — Tacet Lab's limit. */
export const MAX_CHUNK_BYTES = 16 * 1024;
/** The cap on a compressed chunk's text once inflated (a zip bomb stops here). */
export const MAX_INFLATED_BYTES = 512 * 1024;

const encoder = new TextEncoder();

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

/** CRC-32 (ISO 3309 / PNG), table-driven; Tacet Lab's bitwise loop gives the same value. */
export function crc32(bytes: Uint8Array): number {
  const t = table();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

export interface PngChunk {
  /** offset of the length field */
  start: number;
  /** offset just past the CRC */
  end: number;
  type: string;
  data: Uint8Array;
  crcOk: boolean;
}

/** Every chunk up to IEND. A chunk running past the end of the file stops the walk (the file is truncated). */
export function pngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: PngChunk[] = [];
  for (let start = 8; start + 12 <= bytes.length; ) {
    const length = view.getUint32(start);
    const end = start + 12 + length;
    if (end > bytes.length) break;
    const type = String.fromCharCode(...bytes.subarray(start + 4, start + 8));
    const crcOk = view.getUint32(end - 4) === crc32(bytes.subarray(start + 4, end - 4));
    out.push({ start, end, type, data: bytes.subarray(start + 8, end - 4), crcOk });
    if (type === "IEND") break;
    start = end;
  }
  return out;
}

export interface ITxtHeader {
  keyword: string;
  compressed: boolean;
  method: number;
  language: string;
  translated: string;
  /** offset of the text inside the chunk data */
  textStart: number;
}

const latin1 = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

/** The header fields of an iTXt chunk's data, or null when it is malformed. */
export function parseITxtHeader(data: Uint8Array): ITxtHeader | null {
  const k = data.indexOf(0);
  if (k < 1 || k > 79 || k + 3 > data.length) return null;
  const compressed = data[k + 1] === 1;
  const method = data[k + 2];
  if (data[k + 1] > 1 || (compressed && method !== 0)) return null;
  const langEnd = data.indexOf(0, k + 3);
  if (langEnd < 0) return null;
  const transEnd = data.indexOf(0, langEnd + 1);
  if (transEnd < 0) return null;
  const decoder = new TextDecoder("utf-8");
  return {
    keyword: latin1(data.subarray(0, k)),
    compressed,
    method,
    language: latin1(data.subarray(k + 3, langEnd)),
    translated: decoder.decode(data.subarray(langEnd + 1, transEnd)),
    textStart: transEnd + 1,
  };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, cap: number): Promise<Uint8Array> {
  // write and read concurrently (a full readable side would stall an awaited write); a bad stream errors the reader
  const writer = stream.writable.getWriter();
  writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      throw new Error("too large once inflated");
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** zlib (RFC 1950) — the iTXt compression method 0. */
export const zlibDeflate = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new CompressionStream("deflate"), Infinity);
export const zlibInflate = (bytes: Uint8Array, cap = MAX_INFLATED_BYTES): Promise<Uint8Array> => pipe(bytes, new DecompressionStream("deflate"), cap);
/** Raw deflate (RFC 1951) — the share link's encoding. */
export const rawDeflate = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new CompressionStream("deflate-raw"), Infinity);
export const rawInflate = (bytes: Uint8Array, cap = MAX_INFLATED_BYTES): Promise<Uint8Array> => pipe(bytes, new DecompressionStream("deflate-raw"), cap);

export interface ITxtRead {
  keyword: string;
  text: string;
  compressed: boolean;
}

/**
 * The text of the first intact iTXt chunk under `keyword`. A chunk with a bad CRC, over the size cap, with a
 * malformed header or text that will not inflate or decode is skipped. Null when none is left.
 */
export async function readITxt(bytes: Uint8Array, keyword: string): Promise<ITxtRead | null> {
  for (const chunk of pngChunks(bytes)) {
    if (chunk.type !== "iTXt" || !chunk.crcOk || chunk.data.length > MAX_CHUNK_BYTES) continue;
    const header = parseITxtHeader(chunk.data);
    if (!header || header.keyword !== keyword) continue;
    try {
      const raw = chunk.data.subarray(header.textStart);
      const textBytes = header.compressed ? await zlibInflate(raw) : raw;
      const text = new TextDecoder("utf-8", { fatal: true }).decode(textBytes);
      return { keyword, text, compressed: header.compressed };
    } catch {
      continue;
    }
  }
  return null;
}

/** Every iTXt keyword in the file (intact chunks only) — for "what is in this image" diagnostics. */
export function iTxtKeywords(bytes: Uint8Array): string[] {
  return pngChunks(bytes)
    .filter((c) => c.type === "iTXt" && c.crcOk)
    .map((c) => parseITxtHeader(c.data)?.keyword)
    .filter((k): k is string => !!k);
}

function chunkBytes(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(encoder.encode(type), 4);
  out.set(data, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}

export interface WriteITxtOptions {
  /** zlib-compress the text (iTXt compression flag 1); default true */
  compress?: boolean;
}

/** The size the chunk data would take, without writing a PNG — to pick a payload tier that fits the cap. */
export async function iTxtDataSize(keyword: string, text: string, options: WriteITxtOptions = {}): Promise<number> {
  const body = encoder.encode(text);
  const stored = options.compress === false ? body : await zlibDeflate(body);
  return keyword.length + 5 + stored.length;
}

/**
 * A copy of the PNG with `text` in an iTXt chunk under `keyword`, placed just before IEND; any earlier chunk
 * under the same keyword is dropped. Throws when the input is not a PNG, has no IEND, or the chunk data would
 * exceed MAX_CHUNK_BYTES.
 */
export async function writeITxt(png: Uint8Array, keyword: string, text: string, options: WriteITxtOptions = {}): Promise<Uint8Array> {
  if (!/^[\x20-\x7e]{1,79}$/.test(keyword) || keyword !== keyword.trim()) throw new Error("bad keyword");
  if (!isPng(png)) throw new Error("not a PNG");
  const chunks = pngChunks(png);
  const iend = chunks.find((c) => c.type === "IEND");
  if (!iend) throw new Error("the PNG has no IEND chunk");
  const compress = options.compress !== false;
  const body = encoder.encode(text);
  const stored = compress ? await zlibDeflate(body) : body;
  const head = new Uint8Array(keyword.length + 5);
  head.set(encoder.encode(keyword), 0);
  head[keyword.length + 1] = compress ? 1 : 0; // [k] = NUL separator, [k+2] = method 0, two empty strings follow
  const data = new Uint8Array(head.length + stored.length);
  data.set(head, 0);
  data.set(stored, head.length);
  if (data.length > MAX_CHUNK_BYTES) throw new Error(`the data is ${data.length} bytes, over the ${MAX_CHUNK_BYTES}-byte cap`);
  const chunk = chunkBytes("iTXt", data);

  const keep: Uint8Array[] = [png.subarray(0, 8)];
  for (const c of chunks) {
    if (c.type === "IEND") break;
    if (c.type === "iTXt" && parseITxtHeader(c.data)?.keyword === keyword) continue;
    keep.push(png.subarray(c.start, c.end));
  }
  keep.push(chunk, png.subarray(iend.start, iend.end));
  const total = keep.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of keep) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
