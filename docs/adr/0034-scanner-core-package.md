---
status: accepted
date: 2026-10-05
tags: [scanner, packages, architecture]
---

# 34. Extract the echo scanner's logic into `@wutheringtools/scanner-core`

## Context

The echo screen scanner ([ADR 0032](./0032-echo-screen-scanner.md)) has a large, tuned, well-tested core: ROI layouts, stability gating, OCR text parsing, name and stat matching, substat validation, review flags and dedupe signatures. [Wavescan](https://github.com/wavescan/wavescan), a desktop app that reads the same in-game screen natively, needs exactly that logic.

Copying it would fork it; the API proof of concept already drifted that way. The game tables it reads (`src/echoes/index.ts`, `src/echoes/stats.ts`) are written by the CLI generators and imported throughout the calculator, so moving them would be invasive.

## Decision

- The pure scanner modules move to `packages/scanner-core/src/` with their history (`git mv`):
  - `types`, `levenshtein`, `fingerprint`, `stability`, `queue`, `contentRect`, `layout`, `layoutCheck`, `review`, `dedupe`, `parse`
  - `echoes/parsedEchoMapping`
  - `utils/echoIdentity`

  `capture.ts`, `captureCue.ts`, `analytics.ts` and the workers stay in the app because they're browser-specific.
- **Logic only; the app supplies the data.** The package reads the tables through `scannerGameData()`. `src/scanner/gameData.ts` calls `setScannerGameData(...)` with the existing tables. Every shim that re-exports a data-dependent module imports it first, so the data is always set before use. The two values `parse.ts` used to precompute at import time now recompute whenever new data is supplied (`derivedFromGameData`).
- **Every old path is a one-line re-export shim** (e.g. `src/scanner/parse.ts`), so no app code or test changed. The existing tests run unchanged through the shims: 132 files, 1,342 tests, same as before the move.
- **In-repo resolution is a path alias, not npm workspaces.** `vite.config.ts`, `vitest.config.ts` and `tsconfig.json` map `@wutheringtools/scanner-core` to the package source. This avoids lockfile or deploy changes.
- **Publishing:** `.github/workflows/publish-scanner-core.yml` builds with `tsc` and publishes to npm when `packages/scanner-core/package.json`'s version changes on `master`. Wavescan pins a version.
  - Auth is **npm Trusted Publishing** (OIDC), so no npm token is stored anywhere. It's limited to `npm publish` (no dist-tag rights).
  - **Staged publishing** is on: CI uploads each version, and it only goes live after the maintainer approves it on npmjs.com with 2FA.
  - CI-published versions carry provenance automatically. 0.1.0 was published by hand to create the package.
- Set-icon matching (`workers/echoParser.worker.ts`) isn't part of this move. It's canvas-bound and will be split into pure scoring functions separately.

## Consequences

- Pros:
  - One implementation for both scanners.
  - Fixes land with WT's tests and reach Wavescan through a version bump.
  - Game data stays where the CLI writes it.
- Cons:
  - Module-level data (`setScannerGameData`) is shared state. It's acceptable because each app supplies it once at startup, and caches recompute if it changes.
  - Publishing a scanner fix to Wavescan needs a version bump.

## Guidance

- **Do** change scanner logic in `packages/scanner-core/src/`, not in the shims, and keep it free of Vue, Pinia and DOM.
- **Do** bump the package version when a change should reach Wavescan.
- **Don't** import `src/echoes/*` (or any app module) from the package; pass new data through `ScannerGameData` instead.

## Related

- `packages/scanner-core/`, `src/scanner/gameData.ts`, [docs/scanner.md](../scanner.md), [ADR 0032](./0032-echo-screen-scanner.md)
- Wavescan [ADR 0007](https://github.com/wavescan/wavescan/blob/main/docs/adr/0007-shared-scanner-core-package.md)
