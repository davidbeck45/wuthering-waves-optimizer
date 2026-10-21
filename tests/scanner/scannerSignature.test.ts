// @vitest-environment node
import { createHash, generateKeyPairSync, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildScannerDataFile } from "../../src/scanner/scannerData";
import { signingPayload, signScannerData } from "../../src/scanner/scannerSignature";
import { generateSigningKey, signerFromPrivateKey } from "../../scripts/scannerDataKey";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const ASSETS_HASH = "a".repeat(64);

/** Verifies exactly the way Wavescan does (src/data/signature.ts there): WebCrypto, SPKI key. */
async function verifyLikeWavescan(publicKey: string, payload: string, signature: string): Promise<boolean> {
  const key = await webcrypto.subtle.importKey(
    "spki",
    Buffer.from(publicKey, "base64"),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return webcrypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(signature, "base64"),
    new TextEncoder().encode(payload),
  );
}

describe("signed scanner-data.json", () => {
  const key = generateSigningKey();
  const signer = signerFromPrivateKey(key.privateKey);
  const publishedAt = "2026-10-15T12:00:00.000Z";
  const signed = signScannerData(buildScannerDataFile(sha256), { publishedAt, assetsHash: ASSETS_HASH, signer });

  it("adds the publish time, the assets file and its hash, and the key id", () => {
    expect(signed.publishedAt).toBe(publishedAt);
    expect(signed.assets).toEqual({ file: "scanner-assets.json", hash: ASSETS_HASH });
    expect(signed.keyId).toBe(key.keyId);
    expect(signed.keyId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("signs a payload that names the format, version, time and both hashes", () => {
    expect(signingPayload(signed)).toBe(
      ["WutheringToolsScannerData", "1", publishedAt, signed.hash, ASSETS_HASH].join("\n"),
    );
  });

  it("verifies with WebCrypto, as Wavescan checks it", async () => {
    expect(await verifyLikeWavescan(key.publicKey, signingPayload(signed), signed.signature!)).toBe(true);
  });

  it("fails verification if the data hash, assets hash or time is changed", async () => {
    for (const tampered of [
      { ...signed, hash: "b".repeat(64) },
      { ...signed, assets: { ...signed.assets, hash: "c".repeat(64) } },
      { ...signed, publishedAt: "2026-10-16T12:00:00.000Z" },
    ]) {
      expect(await verifyLikeWavescan(key.publicKey, signingPayload(tampered), signed.signature!)).toBe(false);
    }
  });

  it("fails verification with a different key", async () => {
    const other = generateSigningKey();
    expect(await verifyLikeWavescan(other.publicKey, signingPayload(signed), signed.signature!)).toBe(false);
  });

  it("publishes unsigned without a signer (local and preview builds)", () => {
    const unsigned = signScannerData(buildScannerDataFile(sha256), { publishedAt, assetsHash: ASSETS_HASH, signer: null });
    expect(unsigned.signature).toBeNull();
    expect(unsigned.keyId).toBeNull();
  });

  it("refuses a key that isn't ECDSA P-256", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    const der = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    expect(() => signerFromPrivateKey(der)).toThrow(/P-256/);
  });
});
