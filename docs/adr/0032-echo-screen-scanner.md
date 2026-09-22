---
status: accepted
date: 2026-09-22
tags: [echoes, workers, components, inventory]
---

# 32. Echo screen scanner (live share + video upload), OCR in a dedicated worker

## Context

Echoes get into the app today via manual entry or a Discord-bot generated
1920x1080 image (5 echoes per image, OCR + pixelmatch in
`CalculatorEchoParser.vue`/`echoParser.worker.ts`). A user with hundreds or
thousands of echoes (a real account reviewed for this feature had
2969/3000) has no faster path than clicking through the bot 5 at a time.

The user requested a scanner: share the WuWa game window (or upload a video
they already recorded doing this — they'd already made one), click through
the in-game Echo inventory, and have the app detect each newly-displayed
echo, OCR it, and queue it for review. A reference open-source project,
[Tacet-Lab](https://github.com/DJ12421/Tacet-Lab) (React, tesseract.js,
GPL-3.0), does the live-share half of this (window share → OCR → review
queue → IndexedDB) but — checked directly against its README — does **not**
support uploading a pre-recorded video; only live share, static screenshot
import, and manual entry.

Real footage was provided to ground the design instead of guessing ROIs:
11 screenshots (2880x1800) and a 49s gameplay video (2304x1440, itself a
different resolution than the screenshots, both 16:10) of a real Echo
Management click-through.

## Decision

Built `src/scanner/` (pure TS) + `src/workers/echoScanner.worker.ts` +
`src/composables/useEchoScanner.ts` + `EchoScannerCapture.vue`, wired into
`CalculatorEchoImporter.vue` as a second mode tab alongside the existing
Discord-bot image importer, both feeding the same
`mapParsedEchoes`/duplicate-review/save pipeline (extracted the mapping
functions to `src/echoes/parsedEchoMapping.ts` so both flows share one
implementation instead of drifting).

Key choices, each with a reason:

- **ROI table is measured, not guessed.** The panel's ROI fractions were
  derived by profiling luma variance across the real screenshots (row/column
  band detection), then cross-checked against three different real capture
  resolutions that all share WuWa's 16:10 UI aspect (2880x1800, 2304x1440,
  and an earlier session's 2800x1752 sample) — same fractions held at all
  three, confirming the resolution-independent design. See
  `docs/scanner.md` and `src/scanner/layout.ts`.
- **Stats block is one OCR'd region, not 7 rigid row boxes.** The
  measurement surfaced two things a fixed 7-row table would have gotten
  wrong: an echo below +25 reveals fewer than 5 substats with no reserved
  blank space (confirmed: a cost-3 +15 echo showed only 3 of 5), and a long
  stat label wraps to a second line, shifting rows after it. `parse.ts`
  reassembles rows from multi-line OCR text instead.
- **Echo name is matched as text (Levenshtein vs. `mainEchoesData`), not by
  image.** The detail panel prints the echo's name as text; fuzzy text
  matching a clean OCR'd string is simpler and more robust than image-diffing
  a rendered 3D portrait, and avoids re-implementing the reference
  screenshot/pixelmatch machinery the Discord-bot flow uses for that
  purpose. Only the small **set icon** (not printed as text anywhere in the
  panel) still goes through the existing `echoParser.worker.ts`
  `matchSetFirst` pixelmatch path.
- **OCR runs in its own worker** (`echoScanner.worker.ts`), unlike the
  Discord-bot flow where tesseract.js runs on the main thread — a scanning
  session can trigger OCR many times a minute and must not compete with the
  live capture/preview loop. The worker is deliberately "dumb": no
  `src/echoes/*` imports, it only preprocesses and returns raw text; all
  game-data matching happens on the main thread in `parse.ts`, keeping its
  messages plain and serializable per `docs/src-workers.md`'s conventions.
- **tesseract.js is self-hosted** (`public/tesseract/`: worker script, SIMD
  wasm core, `eng.traineddata.gz`) instead of the CDN the Discord-bot flow
  currently loads from, so a scanning session (which can run tens of OCR
  calls) isn't dependent on a third party.
- **Video upload and live share share one `FrameSource` abstraction**
  (`src/scanner/capture.ts`). Both resolve to the same `HTMLVideoElement`
  frame-grab code; only *how a tick is driven* differs — live uses a
  ~8fps real-time timer, video-file uses a deterministic seek-and-capture
  loop decoupled from real time (faster, never drops a frame to decode
  jitter, and needs no screen-share permission — useful since capture
  software the user already has is a lower-friction path than live sharing
  every time). Fingerprint/stability/layout/parse/dedupe are unaffected by
  which source is active.
- **Signature dedupe only, no grid-position tracking.** Truly identical
  echoes (same name/set/cost/main/substats) collapse to one via
  `getEchoIdentityKey`, reused from the existing Discord-bot flow.
- **Nothing auto-saves.** Every field carries per-candidate confidence;
  low-confidence fields are flagged in the review list
  (`EchoScannerCapture.vue`) before the result is handed to the existing,
  already-tested `CalculatorEchoImporter.vue` duplicate-review/save step.

Shipped as one PR rather than the smaller incremental PRs a change this
size would normally be split into (per `CLAUDE.md`'s usual preference) —
explicit user direction for this feature.

## Consequences

- Pros: one capture pipeline serves both entry points; the Discord-bot
  importer and the scanner now share one mapping implementation instead of
  two that can silently drift; ROIs are grounded in real measurement instead
  of guesswork, with the measurement method documented so it can be redone
  if a UI update moves the panel; video upload gives a faster, permission-free,
  deterministic alternative to live sharing.
- Cons: `SET_ICON_BOX` is a first-pass estimate (not independently
  pixel-measured the way the header/stats blocks were) and needs real-world
  confidence tuning; only 16:10 is supported today (`isSupportedAspect`
  rejects other aspects up front rather than silently misreading them) — a
  calibration UI for non-16:10/ultrawide is a known, explicitly deferred
  follow-up, not built here; `public/tesseract/` adds ~19MB of static assets
  to the repo (fetched lazily, only when a scan session starts, so it
  doesn't affect normal app load).

## Guidance

- Read `docs/scanner.md` for the mental model and how the ROI numbers were
  derived before changing `src/scanner/layout.ts` — don't hand-tune a
  fraction without re-measuring against a real screenshot the same way.
- Changing echo-mapping logic (flat-vs-percent substat resolution, main
  stat mapping, rank default): edit `src/echoes/parsedEchoMapping.ts`, not a
  copy inside a component — both the Discord-bot importer and the scanner
  depend on it.
- `echoScanner.worker.ts` must stay free of `src/echoes/*` imports (keeps
  its messages plain/serializable, per `docs/src-workers.md`) — add new
  game-data matching in `src/scanner/parse.ts` on the main thread instead.

## Related

- `docs/scanner.md`, `docs/src-workers.md`
- `src/scanner/*`, `src/workers/echoScanner.worker.ts`,
  `src/composables/useEchoScanner.ts`, `src/components/EchoScannerCapture.vue`
- `src/echoes/parsedEchoMapping.ts`
- `tests/scanner/*`, `tests/echoes/parsedEchoMapping.test.ts`
