// Wuthering Tools+ share cards — DOM → PNG with the payload inside, and the ways out (download, clipboard, the
// system share sheet). Same html-to-image capture as upstream's build card (src/utils/exportCardImage.ts, which
// is fixed at 1920 × 1080 and left untouched), at the card's own size, then the `WTPlusBuild` chunk is added.
import { SHARE_KEYWORD, type SharePayload, withDetail } from "./buildCodec";
import { iTxtDataSize, MAX_CHUNK_BYTES, writeITxt } from "./pngMeta";

export const POST_CARD = { width: 1200, height: 630 } as const;
export const TEAM_CARD = { width: 1080, height: 1350 } as const;

// a failed image (CDN down, CORS) becomes a transparent pixel instead of failing the whole capture
const TRANSPARENT_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

/** Same rule as upstream's capture: anything marked `data-export-hide` stays out of the image. */
const keepNode = (node: HTMLElement): boolean => !(node instanceof Element && node.hasAttribute("data-export-hide"));

/**
 * html-to-image 1.11 waits for a requestAnimationFrame after every image it decodes (util.js createImage), and rAF
 * never fires in a background tab, a phone app switched away from mid-export, or headless Electron (Cypress) — the
 * export would hang until the tab came back. For the length of a capture, rAF also fires after 50 ms at the latest.
 */
// Overlapping captures share one patch (a depth count), so the last one out always restores the browser's own
// functions. The returned id is the native frame id, and cancelAnimationFrame also stops that frame's fallback timer,
// so other code on the page that cancels a frame mid-capture still gets what it asked for. Each request keeps its own
// timer in a closure (never keyed by id alone: ids can repeat in test doubles and across documents).
let patchDepth = 0;
let nativeRaf: typeof window.requestAnimationFrame | null = null;
let nativeCaf: typeof window.cancelAnimationFrame | null = null;
const cancels = new Map<number, Array<() => void>>();

function forget(id: number, cancel: () => void): void {
  const list = cancels.get(id);
  if (!list) return;
  const at = list.indexOf(cancel);
  if (at >= 0) list.splice(at, 1);
  if (!list.length) cancels.delete(id);
}

function patchFrames(): void {
  if (patchDepth++ > 0) return;
  nativeRaf = window.requestAnimationFrame;
  nativeCaf = window.cancelAnimationFrame;
  const raf = nativeRaf;
  const caf = nativeCaf;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    let done = false;
    let timer = 0;
    let id = 0;
    const cancel = () => {
      done = true;
      window.clearTimeout(timer);
    };
    const run = (t: number) => {
      if (done) return;
      cancel();
      forget(id, cancel);
      cb(t);
    };
    id = raf.call(window, run);
    timer = window.setTimeout(() => run(performance.now()), 50);
    cancels.set(id, [...(cancels.get(id) ?? []), cancel]);
    return id;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => {
    for (const cancel of cancels.get(id) ?? []) cancel();
    cancels.delete(id);
    caf.call(window, id);
  }) as typeof window.cancelAnimationFrame;
}

function unpatchFrames(): void {
  if (--patchDepth > 0) return;
  if (nativeRaf) window.requestAnimationFrame = nativeRaf;
  if (nativeCaf) window.cancelAnimationFrame = nativeCaf;
  nativeRaf = null;
  nativeCaf = null;
}

export async function withFrameFallback<T>(fn: () => Promise<T>): Promise<T> {
  patchFrames();
  try {
    return await fn();
  } finally {
    unpatchFrames();
  }
}

/** The card node as a PNG at its design size × pixelRatio — the preview's scale transform is dropped for the shot. */
export async function captureCard(node: HTMLElement, size: { width: number; height: number }, pixelRatio = 2): Promise<Blob> {
  // loaded on the first export, not when the sheet opens (batch-1's perf track does the same in exportCardImage.ts)
  const { toBlob } = await import("html-to-image");
  const blob = await withFrameFallback(() =>
    toBlob(node, {
      width: size.width,
      height: size.height,
      pixelRatio,
      filter: keepNode,
      imagePlaceholder: TRANSPARENT_PX,
      style: { transform: "none", margin: "0", left: "0", top: "0" },
    }),
  );
  if (!blob) throw new Error("The card could not be rendered to an image.");
  return blob;
}

/** The payload tier that fits the chunk cap (a team with long rotations can need "lean"). */
export async function chunkPayload(payload: SharePayload): Promise<{ payload: SharePayload; bytes: number }> {
  for (const detail of ["full", "lean", "gear"] as const) {
    if (detail === "full" && payload.detail !== "full") continue;
    if (detail === "lean" && payload.detail === "gear") continue;
    const p = withDetail(payload, detail);
    const bytes = await iTxtDataSize(SHARE_KEYWORD, JSON.stringify(stripOrigin(p)));
    if (bytes <= MAX_CHUNK_BYTES) return { payload: p, bytes };
  }
  throw new Error("This card's data is too large to embed.");
}

const stripOrigin = (p: SharePayload): SharePayload => {
  const { origin: _o, ...rest } = p;
  void _o;
  return rest;
};

/** A PNG blob with the payload added as a compressed iTXt chunk. */
export async function embedPayload(png: Blob, payload: SharePayload): Promise<{ blob: Blob; detail: SharePayload["detail"]; bytes: number }> {
  const fitted = await chunkPayload(payload);
  const bytes = new Uint8Array(await png.arrayBuffer());
  const out = await writeITxt(bytes, SHARE_KEYWORD, JSON.stringify(stripOrigin(fitted.payload)));
  return { blob: new Blob([out as BlobPart], { type: "image/png" }), detail: fitted.payload.detail, bytes: fitted.bytes };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canCopyImage(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function" && typeof window !== "undefined" && typeof window.ClipboardItem === "function";
}

/**
 * Copies the picture. Browsers re-encode clipboard images, so the build data does NOT survive a copy. Takes the
 * blob as a promise so the ClipboardItem is created inside the click (Safari refuses a write that starts after an
 * await; Chrome takes either).
 */
export async function copyImage(blob: Blob | Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

/** Web Share Level 2 with a file (Android's share sheet, iOS, Chrome on Windows / ChromeOS). */
export function canShareFile(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/**
 * "needs-tap": the browser wants a fresh tap (navigator.share must start within a few seconds of the click, and the
 * capture can take longer on a phone) — the caller keeps the rendered file and asks for one more tap.
 */
export async function shareFile(file: File, text: string): Promise<"shared" | "cancelled" | "needs-tap"> {
  try {
    await navigator.share({ files: [file], text, title: "Wuthering Tools+ card" });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    if (err instanceof DOMException && err.name === "NotAllowedError") return "needs-tap";
    throw err;
  }
}

/** "cartethyia-build.png" / "team-name-team.png" */
export function cardFilename(payload: SharePayload): string {
  const base = payload.kind === "team" ? (payload.team?.name ?? "team") : (payload.members[0]?.charId ?? "build");
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "card";
  return `${slug}-${payload.kind === "team" ? "team" : "build"}-wtplus.png`;
}
