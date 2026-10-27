// Wuthering Tools+ AI — data attached to a question (an "Explain" button's numbers, a page's context). It travels
// as a second text block of the user turn, a fenced JSON block under a marker line Claude can read and the
// drawer can recognise, so the transcript shows "📎 Team damage breakdown" instead of the raw JSON. Pure, light
// (no engine imports): useAssistant.ts imports it eagerly.

/** Characters of JSON one attachment may carry (≈4K tokens). Bigger data is compacted by the caller first. */
export const MAX_ATTACHMENT_CHARS = 16_000;

const MARKER = "[Attached data: ";
const RE = /^\[Attached data: ([^\]\n]{1,120})\]\n```json\n([\s\S]*)\n```$/;

export const cleanTitle = (title: string): string =>
  (title || "Data")
    .replace(/[\]\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Data";

/** The text block for one attachment. `json` must already be JSON text (see runtime `attachmentJson`). */
export function attachmentText(title: string, json: string): string {
  return `${MARKER}${cleanTitle(title)}]\n\`\`\`json\n${json}\n\`\`\``;
}

export interface AttachmentInfo {
  title: string;
  chars: number;
}

/** A text block that is an attachment → its title and size; anything else → null. */
export function parseAttachment(text: string): AttachmentInfo | null {
  if (!text.startsWith(MARKER)) return null;
  const m = RE.exec(text);
  return m ? { title: m[1], chars: m[2].length } : null;
}

/** Plain JSON text for data an Explain button passes (functions / cycles dropped), compacted to fit. */
export function attachmentJson(data: unknown, max = MAX_ATTACHMENT_CHARS): string {
  const seen = new WeakSet<object>();
  let text: string;
  try {
    text =
      JSON.stringify(data, (_key, value: unknown) => {
        if (typeof value === "function" || typeof value === "symbol") return undefined;
        if (typeof value === "bigint") return String(value);
        if (typeof value === "number" && !Number.isFinite(value)) return null;
        if (value && typeof value === "object") {
          if (seen.has(value)) return "[circular]";
          seen.add(value);
        }
        return value;
      }) ?? "null";
  } catch {
    text = JSON.stringify(String(data));
  }
  if (text.length <= max) return text;
  // too big: halve the longest arrays until it fits (the result says so), then clip as a last resort
  const copy = JSON.parse(text) as unknown;
  const cut = new Set<string>();
  for (let guard = 0; guard < 40 && text.length > max; guard++) {
    const hit = longestArray(copy, []);
    if (!hit) break;
    hit.array.splice(Math.max(1, Math.floor(hit.array.length / 2)));
    cut.add(hit.path || "(root)");
    text = JSON.stringify(copy && typeof copy === "object" && !Array.isArray(copy) ? { ...(copy as object), _truncated: `lists shortened: ${[...cut].join(", ")}` } : copy);
  }
  return text.length <= max ? text : JSON.stringify({ _truncated: "too large to attach in full", preview: text.slice(0, max - 200) });
}

function longestArray(value: unknown, path: string[]): { array: unknown[]; path: string } | null {
  let best: { array: unknown[]; path: string } | null = null;
  const visit = (v: unknown, p: string[]): void => {
    if (Array.isArray(v)) {
      if (v.length > 1 && (!best || v.length > best.array.length)) best = { array: v, path: p.join(".") };
      v.forEach((x, i) => visit(x, [...p, String(i)]));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) visit(x, [...p, k]);
    }
  };
  visit(value, path);
  return best;
}
