// Wuthering Tools+ share cards — what is in a dropped / picked / pasted image: a WT+ card, a Tacet Lab card, or a
// picture whose data a site stripped. Pure (bytes in).
import { fromTacetCard, parseSharePayload, SHARE_KEYWORD, TACET_KEYWORD, type SharePayload } from "./buildCodec";
import { isPng, readITxt } from "./pngMeta";

export type CardRead =
  | { ok: true; payload: SharePayload; readOnly: boolean; newerVersion?: number; warnings: string[] }
  | { ok: false; reason: "not-image" | "recompressed" | "no-data" | "invalid" | "too-large"; message: string };

/** 20 MB: far above any card (a 2× team card is ~3 MB), low enough to refuse a stray video. */
export const MAX_CARD_FILE_BYTES = 20 * 1024 * 1024;

function sniff(bytes: Uint8Array): "png" | "jpeg" | "webp" | "gif" | "avif" | null {
  if (isPng(bytes)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(0, 3) === "GIF") return "gif";
  if (ascii(4, 12).includes("ftypavif")) return "avif";
  return null;
}

export async function readCardBytes(bytes: Uint8Array): Promise<CardRead> {
  const kind = sniff(bytes);
  if (!kind) return { ok: false, reason: "not-image", message: "That file isn't an image." };
  if (kind !== "png") {
    return {
      ok: false,
      reason: "recompressed",
      message: `This picture is a ${kind.toUpperCase()}, so it carries no Wuthering Tools+ data — sites like Reddit, X and Imgur convert the PNG when it's uploaded. Ask for the original file (Discord keeps it), or a share link.`,
    };
  }
  const wt = await readITxt(bytes, SHARE_KEYWORD);
  if (wt) {
    let raw: unknown;
    try {
      raw = JSON.parse(wt.text);
    } catch {
      return { ok: false, reason: "invalid", message: "The card's data is damaged." };
    }
    const parsed = parseSharePayload(raw);
    if (!parsed.ok) return { ok: false, reason: "invalid", message: parsed.error };
    return parsed.readOnly
      ? { ok: true, payload: parsed.payload, readOnly: true, newerVersion: parsed.newerVersion, warnings: parsed.warnings }
      : { ok: true, payload: parsed.payload, readOnly: false, warnings: parsed.warnings };
  }
  const tacet = await readITxt(bytes, TACET_KEYWORD);
  if (tacet) {
    let raw: unknown;
    try {
      raw = JSON.parse(tacet.text);
    } catch {
      return { ok: false, reason: "invalid", message: "The Tacet Lab card's data is damaged." };
    }
    const mapped = fromTacetCard(raw);
    if (!mapped.payload) return { ok: false, reason: "invalid", message: mapped.error ?? "This Tacet Lab card can't be read." };
    return { ok: true, payload: mapped.payload, readOnly: false, warnings: mapped.warnings };
  }
  return {
    ok: false,
    reason: "no-data",
    message: "No Wuthering Tools+ data in this image. It may be a screenshot or a re-saved copy — Reddit, X and Imgur recompress uploads and drop it.",
  };
}

export async function readCardFile(file: Blob): Promise<CardRead> {
  if (file.size > MAX_CARD_FILE_BYTES) return { ok: false, reason: "too-large", message: "That file is too large to be a card." };
  return readCardBytes(new Uint8Array(await file.arrayBuffer()));
}
