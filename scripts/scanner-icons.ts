/**
 * Makes the pictures Wavescan needs and commits them as src/scanner/scanner-icons.json,
 * which the build publishes as /scanner-assets.json (ADR 0041). Run after adding or
 * changing an echo or sonata set:
 *
 *   npm run scanner:icons          only new or changed pictures (by source URL)
 *   npm run scanner:icons -- --all  re-download every picture
 *
 * tests/scanner/scannerAssets.test.ts fails until this has been run, so a missing picture
 * can't reach Wavescan unnoticed.
 *
 * - Set icons: flattened onto BACKGROUND (they're transparent outside their ring), shrunk to
 *   SET_SIZE × SET_SIZE, stored as base64 RGB. Wavescan compares the icon on the echo panel
 *   with these to recognise the set, so a set icon that can't be fetched is an error.
 * - Echo pictures: shrunk to ECHO_SIZE × ECHO_SIZE (transparency kept), WebP data URLs. They
 *   are decoration, so one that can't be fetched is recorded under `skipped` and Wavescan
 *   shows a placeholder.
 *
 * These settings must match what Wavescan's set matcher was tuned with
 * (wavescan src/session/setIcon.ts). Changing them changes how sets are recognised.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { buildScannerData } from "../src/scanner/scannerData";
import type { IconSource, ScannerIconsFile } from "../src/scanner/scannerAssets";

const TARGET = new URL("../src/scanner/scanner-icons.json", import.meta.url);
const SET_SIZE = 32;
const BACKGROUND = { r: 40, g: 40, b: 40 };
const ECHO_SIZE = 80;
const ECHO_QUALITY = 70;
const MAX_BYTES = 5 * 1024 * 1024;

const all = process.argv.includes("--all");
const data = buildScannerData();

let previous: ScannerIconsFile | null = null;
try {
  previous = JSON.parse(readFileSync(TARGET, "utf8")) as ScannerIconsFile;
} catch {
  // first run
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const file = Buffer.from(await res.arrayBuffer());
  if (file.length > MAX_BYTES) throw new Error(`${file.length} bytes is too big for a picture`);
  return file;
}

const sourceOf = (url: string, file: Buffer): IconSource => ({
  url,
  sha256: createHash("sha256").update(file).digest("hex"),
});

const setIcons: ScannerIconsFile["setIcons"] = {
  size: SET_SIZE,
  background: [BACKGROUND.r, BACKGROUND.g, BACKGROUND.b],
  icons: {},
  sources: {},
};
let downloaded = 0;
for (const [key, set] of Object.entries(data.echoSets).sort(([a], [b]) => a.localeCompare(b))) {
  if (!set.icon) throw new Error(`set ${key} has no icon URL; Wavescan can't recognise it without one`);
  const old = previous?.setIcons;
  if (!all && old?.sources[key]?.url === set.icon && old.icons[key]) {
    setIcons.icons[key] = old.icons[key];
    setIcons.sources[key] = old.sources[key];
    continue;
  }
  const file = await download(set.icon).catch((error: Error) => {
    throw new Error(`set ${key}: ${set.icon}: ${error.message}`);
  });
  const rgb = await sharp(file)
    .flatten({ background: BACKGROUND })
    .resize(SET_SIZE, SET_SIZE, { fit: "fill", kernel: "mitchell" })
    .removeAlpha()
    .raw()
    .toBuffer();
  if (rgb.length !== SET_SIZE * SET_SIZE * 3) throw new Error(`set ${key}: unexpected decoded size ${rgb.length}`);
  setIcons.icons[key] = rgb.toString("base64");
  setIcons.sources[key] = sourceOf(set.icon, file);
  downloaded++;
}

const echoIcons: ScannerIconsFile["echoIcons"] = { size: ECHO_SIZE, icons: {}, sources: {}, skipped: {} };
for (const [key, echo] of Object.entries(data.echoes).sort(([a], [b]) => a.localeCompare(b))) {
  const url = echo.icon;
  if (!url?.startsWith("https://")) {
    echoIcons.skipped[key] = { url: url ?? "", reason: "no https URL" };
    continue;
  }
  const old = previous?.echoIcons;
  if (!all && old?.sources[key]?.url === url && old.icons[key]) {
    echoIcons.icons[key] = old.icons[key];
    echoIcons.sources[key] = old.sources[key];
    continue;
  }
  try {
    const file = await download(url);
    const webp = await sharp(file)
      .resize(ECHO_SIZE, ECHO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: ECHO_QUALITY })
      .toBuffer();
    echoIcons.icons[key] = `data:image/webp;base64,${webp.toString("base64")}`;
    echoIcons.sources[key] = sourceOf(url, file);
    downloaded++;
  } catch (error) {
    echoIcons.skipped[key] = { url, reason: (error as Error).message };
  }
}

const out: ScannerIconsFile = { format: "WutheringToolsScannerIcons", version: 1, setIcons, echoIcons };
writeFileSync(TARGET, JSON.stringify(out, null, 1) + "\n");
console.log(
  `scanner-icons: ${Object.keys(setIcons.icons).length} sets, ${Object.keys(echoIcons.icons).length} echoes ` +
    `(${downloaded} downloaded)`,
);
const skipped = Object.entries(echoIcons.skipped);
if (skipped.length) {
  console.warn(`no picture, Wavescan shows a placeholder:\n  ${skipped.map(([k, s]) => `${k} (${s.url}: ${s.reason})`).join("\n  ")}`);
}
