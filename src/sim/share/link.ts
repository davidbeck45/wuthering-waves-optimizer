// Wuthering Tools+ share cards — the compact link: `/share#b=<base64url(deflate-raw(JSON))>`. The data sits in the
// URL fragment, which browsers never send to a server (and vercel.json's analytics rewrite never sees). Pure.
//
// A link has to fit a chat message, so the encoder walks down the detail tiers (full → lean → gear) until the
// whole URL is at most LINK_LIMIT characters; above that even for gear only, there is no link — share the card.
import { parseSharePayload, withDetail, type ParseResult, type ShareDetail, type SharePayload } from "./buildCodec";
import { MAX_INFLATED_BYTES, rawDeflate, rawInflate } from "./pngMeta";

/** Discord's 2,000-character message limit, less room for a sentence around the link. */
export const LINK_LIMIT = 1900;
export const LINK_PARAM = "b";
export const SHARE_PATH = "/share";

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const clean = text.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*$/.test(clean)) throw new Error("not base64url");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The fragment value for a payload: deflate-raw + base64url of its JSON. */
export async function encodeFragment(payload: SharePayload): Promise<string> {
  const { origin: _origin, ...clean } = payload;
  void _origin;
  return toBase64Url(await rawDeflate(new TextEncoder().encode(JSON.stringify(clean))));
}

export async function decodeFragment(fragment: string): Promise<unknown> {
  const bytes = await rawInflate(fromBase64Url(fragment), MAX_INFLATED_BYTES);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export interface ShareLink {
  url: string;
  length: number;
  detail: ShareDetail;
  /** characters of the full-detail link, when it had to drop to a lower tier */
  fullLength: number;
}

/**
 * The shortest-tier link that still fits LINK_LIMIT, starting from full detail; null when even gear only is
 * too long (a team with long build names, say).
 */
export async function shareLink(payload: SharePayload, origin: string, limit = LINK_LIMIT): Promise<ShareLink | null> {
  const tiers: ShareDetail[] = payload.detail === "gear" ? ["gear"] : payload.detail === "lean" ? ["lean", "gear"] : ["full", "lean", "gear"];
  let fullLength = 0;
  for (const detail of tiers) {
    const url = `${origin}${SHARE_PATH}#${LINK_PARAM}=${await encodeFragment(withDetail(payload, detail))}`;
    if (!fullLength) fullLength = url.length;
    if (url.length <= limit) return { url, length: url.length, detail, fullLength };
  }
  return null;
}

/** The `b=` value of a link, a bare fragment ("#b=…") or the value itself; null when there is none. */
export function fragmentOf(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const hash = text.includes("#") ? text.slice(text.indexOf("#") + 1) : text;
  const params = new URLSearchParams(hash);
  const value = params.get(LINK_PARAM);
  if (value) return value;
  // a bare base64url blob pasted on its own
  return /^[A-Za-z0-9_-]{16,}$/.test(text) ? text : null;
}

/** A pasted link / fragment → the validated payload. */
export async function readShareLink(input: string): Promise<ParseResult> {
  const fragment = fragmentOf(input);
  if (!fragment) return { ok: false, error: "That isn't a Wuthering Tools+ share link (it has no #b= part)." };
  let raw: unknown;
  try {
    raw = await decodeFragment(fragment);
  } catch {
    return { ok: false, error: "The link is cut off or damaged — copy the whole link again." };
  }
  return parseSharePayload(raw);
}
