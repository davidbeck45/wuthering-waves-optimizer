/**
 * Makes the key pair that signs scanner-data.json (ADR 0041). Run once (or to rotate):
 *
 *   npm run scanner:keygen -- <path-for-the-private-key>
 *
 * The private key is written only to that file, never printed. Paste its contents into
 * Vercel → Settings → Environment Variables as SCANNER_DATA_SIGNING_KEY (Production only),
 * keep a copy in your password manager, then delete the file. The public key and key id
 * are printed: they go into Wavescan's src/data/trustedKeys.ts.
 */
import { existsSync, writeFileSync } from "node:fs";
import { generateSigningKey, SIGNING_KEY_ENV } from "./scannerDataKey";

const target = process.argv[2];
if (!target) throw new Error("usage: npm run scanner:keygen -- <path-for-the-private-key>");
if (existsSync(target)) throw new Error(`${target} already exists; not overwriting a key`);

const { privateKey, publicKey, keyId } = generateSigningKey();
writeFileSync(target, privateKey + "\n", { mode: 0o600 });
console.log(`Private key written to ${target} (value for ${SIGNING_KEY_ENV}).`);
console.log(`Key id:     ${keyId}`);
console.log(`Public key: ${publicKey}`);
