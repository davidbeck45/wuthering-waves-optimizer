/**
 * Builds `scanner-assets.json`: the pictures the desktop scanner (Wavescan) needs, published
 * next to `scanner-data.json` on every deploy (ADR 0041).
 *
 * - `setIcons`: a 32×32 RGB reference copy of every sonata set's icon. Wavescan compares the
 *   icon on the echo panel with these to tell which set an echo belongs to, so a new set
 *   without a reference can't be recognised.
 * - `echoIcons`: an 80×80 WebP picture of every echo, shown next to its name in Wavescan.
 *
 * The pictures are made by `npm run scanner:icons` (scripts/scanner-icons.ts) and committed
 * as `scanner-icons.json`, so the build never downloads images.
 * `tests/scanner/scannerAssets.test.ts` fails when an echo or set is missing its picture.
 *
 * Pure: no I/O. The Vite plugin in vite.config.ts serialises and hashes it. Never import
 * this from app code: the JSON is about 1 MB.
 */
import icons from "./scanner-icons.json";

/** Bump when the shape of `data` changes in a way consumers must handle. */
export const SCANNER_ASSETS_VERSION = 1;

/** Where a picture came from: its source URL and the SHA-256 of the downloaded file. */
export interface IconSource {
  url: string;
  sha256: string;
}

/** The committed file written by `npm run scanner:icons`. */
export interface ScannerIconsFile {
  format: "WutheringToolsScannerIcons";
  version: 1;
  setIcons: {
    /** Width and height of each reference, in pixels. */
    size: number;
    /** RGB colour the transparent parts of each icon were flattened onto. */
    background: [number, number, number];
    /** Set key → base64 of size × size × 3 RGB bytes, row by row. */
    icons: Record<string, string>;
    sources: Record<string, IconSource>;
  };
  echoIcons: {
    size: number;
    /** Echo key → `data:image/webp;base64,…` URL. */
    icons: Record<string, string>;
    sources: Record<string, IconSource>;
    /** Echoes whose picture couldn't be fetched or decoded (Wavescan shows a placeholder). */
    skipped: Record<string, { url: string; reason: string }>;
  };
}

export interface ScannerAssetsPayload {
  setIcons: { size: number; background: [number, number, number]; icons: Record<string, string> };
  echoIcons: { size: number; icons: Record<string, string> };
}

export interface ScannerAssetsFile {
  format: "WutheringToolsScannerAssets";
  version: number;
  /** SHA-256 (hex) of `JSON.stringify(data)`. `scanner-data.json` names it, signed. */
  hash: string;
  data: ScannerAssetsPayload;
}

/** The committed pictures, typed. */
export function scannerIcons(): ScannerIconsFile {
  // JSON imports type `background` as number[]; the shape is checked by scannerAssets.test.ts.
  return icons as unknown as ScannerIconsFile;
}

/** The published payload: the pictures without their source bookkeeping, keys sorted. */
export function buildScannerAssets(file: ScannerIconsFile = scannerIcons()): ScannerAssetsPayload {
  const sorted = (record: Record<string, string>) =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  return {
    setIcons: {
      size: file.setIcons.size,
      background: file.setIcons.background,
      icons: sorted(file.setIcons.icons),
    },
    echoIcons: { size: file.echoIcons.size, icons: sorted(file.echoIcons.icons) },
  };
}

/** Wraps the payload with format/version/hash. `sha256` maps a string to a hex digest. */
export function buildScannerAssetsFile(sha256: (text: string) => string): ScannerAssetsFile {
  const data = buildScannerAssets();
  return {
    format: "WutheringToolsScannerAssets",
    version: SCANNER_ASSETS_VERSION,
    hash: sha256(JSON.stringify(data)),
    data,
  };
}
