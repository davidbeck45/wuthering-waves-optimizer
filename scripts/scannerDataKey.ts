/**
 * Node-side helpers for the scanner-data signing key (ADR 0041). Used by the Vite plugin
 * (vite.config.ts) to sign `scanner-data.json`, and by scripts/scanner-data-keygen.ts.
 *
 * Keys are ECDSA P-256 and travel as single-line base64 so they fit in an environment
 * variable: the private key as PKCS#8 DER, the public key as SPKI DER (the form Wavescan
 * builds in and hands to WebCrypto's `importKey("spki", …)`).
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import type { ScannerDataSigner } from "../src/scanner/scannerSignature";

/** The environment variable holding the private key (Vercel → Production only). */
export const SIGNING_KEY_ENV = "SCANNER_DATA_SIGNING_KEY";

/** The key id Wavescan looks keys up by: first 16 hex chars of SHA-256(SPKI DER). */
export function keyIdOf(publicKeyDer: Buffer): string {
  return createHash("sha256").update(publicKeyDer).digest("hex").slice(0, 16);
}

/** Turns a base64 PKCS#8 private key into a signer. Throws if it isn't a P-256 key. */
export function signerFromPrivateKey(base64: string): ScannerDataSigner {
  const key = createPrivateKey({ key: Buffer.from(base64.trim(), "base64"), format: "der", type: "pkcs8" });
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error(`${SIGNING_KEY_ENV} must be an ECDSA P-256 key`);
  }
  const publicDer = createPublicKey(key).export({ format: "der", type: "spki" });
  return {
    keyId: keyIdOf(publicDer),
    // ieee-p1363 = raw r‖s, the encoding WebCrypto expects (Node's default is DER).
    sign: (payload) => sign("sha256", Buffer.from(payload, "utf8"), { key, dsaEncoding: "ieee-p1363" }).toString("base64"),
  };
}

/** Makes a new key pair, both halves as single-line base64. */
export function generateSigningKey(): { privateKey: string; publicKey: string; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKey: publicDer.toString("base64"),
    keyId: keyIdOf(publicDer),
  };
}
