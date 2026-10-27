// Wuthering Tools+: one row of the phone-screenshot batch importer (PhoneEchoBatchParser.vue). Shared by the
// component, the OCR scan and "Read with Claude" (useClaudeEchoRead.ts), so both readers fill the same review table.
import type { ScanRecord } from "./phoneEchoScan";

export type ScanStatus = "queued" | "scanning" | "done" | "error" | "unsupported";

/** "Read with Claude" per row: not asked, reading now, read, or the request failed (the OCR state is kept). */
export type ClaudeState = "none" | "reading" | "done" | "error";

export interface AlbumPhoto {
  id: string;
  url: string;
}

/** What Claude said about the echo besides the stats (shown in the Notes column). */
export interface ClaudeInfo {
  /** 0–1, Claude's own estimate for this echo */
  confidence: number;
  notes: string;
  printedName: string;
  equippedBy: string | null;
  /** how many echoes with stats Claude found on this screenshot */
  echoesOnShot: number;
}

export interface ScanItem {
  id: string;
  /** the screenshot; album photos are fetched right before their scan and dropped after it */
  file: File | null;
  /** set when the item came from a Google Photos album */
  photo?: AlbumPhoto;
  name: string;
  status: ScanStatus;
  record: ScanRecord | null;
  include: boolean;
  thumb: string | null;
  error: string | null;
  /** who produced `record` */
  source: "ocr" | "claude";
  claudeState: ClaudeState;
  claude: ClaudeInfo | null;
  /** why the last Claude read failed, or that it found no echo (the row keeps its OCR result) */
  claudeError: string | null;
  /** the OCR record a Claude read replaced — kept for the cross-check flags */
  ocrRecord: ScanRecord | null;
  /** a screenshot with several echoes becomes several rows; the extra rows point at the first */
  parentId: string | null;
  /** pixel size, for the cost estimate (probed when the file is added) */
  size: { width: number; height: number } | null;
}

let seq = 0;
const newId = (): string => `${Date.now()}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A queued row with every field at its default. */
export function newScanItem(fields: Pick<ScanItem, "file" | "name"> & Partial<ScanItem>): ScanItem {
  return {
    id: newId(),
    status: "queued",
    record: null,
    include: false,
    thumb: null,
    error: null,
    source: "ocr",
    claudeState: "none",
    claude: null,
    claudeError: null,
    ocrRecord: null,
    parentId: null,
    size: null,
    ...fields,
  };
}

/** A row the OCR could not settle: failed, unsupported size, no echo, or flags to check. */
export function needsALook(item: ScanItem): boolean {
  if (item.status === "error" || item.status === "unsupported") return true;
  if (item.status !== "done") return false;
  return !item.record?.echo || Boolean(item.record?.flags.length);
}

/** Rows "Read with Claude" can take: an image to read and no Claude read yet (a failed one may be retried). */
export function claudeCandidates(items: readonly ScanItem[], scope: "flagged" | "all"): ScanItem[] {
  return items.filter((item) => {
    if (item.parentId || item.claudeState === "done" || item.claudeState === "reading") return false;
    if (!item.file && !item.photo) return false;
    return scope === "all" || needsALook(item) || item.claudeState === "error";
  });
}
