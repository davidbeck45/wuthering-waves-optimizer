---
status: accepted
date: 2026-10-15
tags: [scanner, data, interop, security]
superseded_by: [42]
---

# 41. Sign `scanner-data.json`, and publish Wavescan's pictures as `scanner-assets.json`

## Context

Wavescan now downloads `scanner-data.json` every time it opens, instead of only bundling a snapshot at build time (Wavescan ADR 0034). Data fixes made here then reach every user on their next launch, with no Wavescan release needed. Two things were missing for that:

- **Trust.** Wavescan uses whatever it downloads to read users' echoes. ADR 0035 planned a signature "when the runtime refresh ships": if this site were ever compromised, a tampered file must not silently turn into wrong scans.
- **Pictures.** Wavescan uses small reference copies of each set icon to tell which set an echo belongs to, and it shows a small picture of each echo. Wavescan made both from the icon URLs at its own build time. A new set downloaded at runtime would have no reference, so Wavescan couldn't recognise it.

## Decision

- **`scanner-assets.json`** is published next to `scanner-data.json` on every deploy (about 1 MB). It holds 32×32 RGB set-icon references and 80×80 WebP echo pictures.
  - `npm run scanner:icons` (`scripts/scanner-icons.ts`) makes them. They're committed in `src/scanner/scanner-icons.json`, so the build never downloads images. The script only downloads pictures whose source URL changed.
  - The processing is the script Wavescan used before (same settings, same `sharp` version), so the output is byte-identical and Wavescan's set matching doesn't change.
  - `tests/scanner/scannerAssets.test.ts` fails when a set or echo has no up-to-date picture. Adding an echo or a set without running the script can't pass CI.
- **`scanner-data.json` is signed.** It gains `publishedAt`, `assets: { file, hash }`, `keyId` and `signature`. These are additive fields, so `version` stays 1.
  - The signature is ECDSA P-256 (SHA-256) over `format`, `version`, `publishedAt`, `hash` and `assets.hash`, joined with newlines (`signingPayload`). That text covers every echo, set, stat table and picture.
  - The signature is raw r‖s in base64, which WebCrypto verifies natively. Neither side needs a crypto library.
  - It travels inside the same file, so one download always has a matching signature.
- **The private key** lives only in the Vercel environment variable `SCANNER_DATA_SIGNING_KEY` (Production), with a backup in the maintainer's password manager. `npm run scanner:keygen -- <file>` makes a key pair.
  - A production build without the key fails, so an unsigned file never replaces a signed one.
  - Preview, local and CI builds publish unsigned files, which Wavescan ignores.
- **Wavescan builds in the public key(s)** and ignores any file with a missing or invalid signature, or whose hashes don't match the content. It then keeps the data it already has.

## Consequences

- Pros:
  - A data or picture fix here reaches Wavescan users on their next launch.
  - A compromised host or a man-in-the-middle can't feed Wavescan altered data without the private key.
  - Pictures are made once, here, next to the data they belong to.
- Cons:
  - Adding an echo or a set now needs `npm run scanner:icons`. CI says so.
    **Superseded 2026-10-16:** CI runs it and commits the pictures to the PR ([ADR 0042](./0042-ci-commits-scanner-pictures.md)).
  - `scanner-icons.json` (about 1.3 MB) is committed.
  - A lost or leaked key needs a Wavescan release to rotate: Wavescan accepts a list of keys, so a new key can be added before the old one is removed.
  - `sharp` is a new dev dependency (image decoding and resizing, used only by the script).

## Guidance

- **Do** run `npm run scanner:icons` after adding or changing an echo, a set, or an icon URL, and commit the result.
  **Superseded 2026-10-16:** CI does this on PRs from this repo ([ADR 0042](./0042-ci-commits-scanner-pictures.md)).
- **Don't** change `signingPayload`, the picture sizes or the processing without coordinating with Wavescan. The first breaks verification, the others change how sets are recognised.
- **Don't** put the private key anywhere but Vercel and the password manager. It never goes in the repo, in CI logs, or in preview environments.

## Related

- `src/scanner/scannerAssets.ts`, `src/scanner/scannerSignature.ts`, `scripts/scanner-icons.ts`, `scripts/scannerDataKey.ts`, `vite.config.ts`, `tests/scanner/scannerAssets.test.ts`, `tests/scanner/scannerSignature.test.ts`
- [ADR 0035](./0035-publish-scanner-data-json.md): the file this extends
