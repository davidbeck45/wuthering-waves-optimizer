/**
 * Signs `scanner-data.json`, so Wavescan only uses game data that really came from this
 * site's deploy (ADR 0041). Wavescan downloads the file on every launch and checks the
 * signature against public keys built into the app; anything unsigned or altered is ignored.
 *
 * What's signed is a short text that names everything else (see `signingPayload`):
 * - the data's hash, which covers every echo, set and stat table
 * - the hash of `scanner-assets.json`, which covers every picture
 * - the publish time
 * The signature travels inside the same file, so one download always has a matching pair.
 *
 * Algorithm: ECDSA P-256 with SHA-256, signature as raw r‖s (64 bytes, base64). That's what
 * the browser's WebCrypto verifies natively, so neither side needs a crypto library.
 *
 * Pure: the actual signing is injected (vite.config.ts uses node:crypto).
 */
import type { ScannerDataFile } from "./scannerData";

/** Where Wavescan downloads the pictures, relative to `scanner-data.json`. */
export const SCANNER_ASSETS_FILE_NAME = "scanner-assets.json";

/** `scanner-data.json` as published: the data file plus its signature block. */
export interface SignedScannerDataFile extends ScannerDataFile {
  /** When this deploy built the file (ISO 8601, UTC). */
  publishedAt: string;
  /** The pictures file, and the hash Wavescan checks it against. */
  assets: { file: string; hash: string };
  /** Which key signed it: the first 16 hex characters of the SHA-256 of its public key (SPKI DER). */
  keyId: string | null;
  /** Base64 ECDSA P-256 signature of `signingPayload(…)`, or null for unsigned dev builds. */
  signature: string | null;
}

/**
 * The exact text that is signed. Wavescan rebuilds it from the downloaded file and verifies
 * the signature over it, so this must never change without a `version` bump on both sides.
 */
export function signingPayload(file: {
  format: string;
  version: number;
  publishedAt: string;
  hash: string;
  assets: { hash: string };
}): string {
  return [file.format, file.version, file.publishedAt, file.hash, file.assets.hash].join("\n");
}

/** A signer: the key's id, and a function that signs text and returns base64. */
export interface ScannerDataSigner {
  keyId: string;
  sign: (payload: string) => string;
}

/**
 * Adds the publish time, the assets hash and (when a signer is given) the signature.
 * Without a signer the file is published unsigned, which Wavescan ignores: that's what
 * local and preview builds do, since only production holds the key.
 */
export function signScannerData(
  file: ScannerDataFile,
  options: { publishedAt: string; assetsHash: string; signer: ScannerDataSigner | null },
): SignedScannerDataFile {
  const unsigned = {
    ...file,
    publishedAt: options.publishedAt,
    assets: { file: SCANNER_ASSETS_FILE_NAME, hash: options.assetsHash },
  };
  return {
    ...unsigned,
    keyId: options.signer?.keyId ?? null,
    signature: options.signer ? options.signer.sign(signingPayload(unsigned)) : null,
  };
}
