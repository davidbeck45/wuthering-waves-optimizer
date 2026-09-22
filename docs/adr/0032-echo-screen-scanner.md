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
GPL-3.0), does both halves of this: live share and a video-file upload with
a trim range + adjustable sample rate (`ScannerView.tsx`'s
`openVideo`/`scanVideo`, backed by a `LocalVideoSource` that seeks and
samples frames). An initial pass at this ADR under-researched that — a
README-only check missed the video-upload path entirely and wrongly
concluded it needed to be designed from scratch; corrected once the user
pointed at the actual source.

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
- **Substat rows are individually cropped, one OCR call each** — not one
  multi-line block, and not the originally-shipped design either (see
  **Revised** below). The measurement surfaced two things a fixed row
  table has to handle: an echo below +25 reveals fewer than 5 substats
  with no reserved blank space (confirmed: a cost-3 +15 echo showed only 3
  of 5, represented as empty slots, not a shorter array), and a long stat
  label wraps to a second line. Each `SUBSTAT_ROWS` crop is taller than one
  line to still catch a wrap, and `parse.ts`'s `parseStatRow` takes only
  the first complete match per crop so that overlap never leaks a
  neighboring row in.
  **Revised:** the first shipped version of this ADR instead OCR'd the
  whole stats area as one multi-line block and had tesseract segment it
  into rows. Real usage reported missing substats — block-level line
  segmentation can silently merge or drop a row with no way to recover it.
  Reverted to individually-cropped rows (mirroring
  `CalculatorEchoParser.vue`'s own 5-separate-crop approach, which is what
  should have been followed from the start) once that was diagnosed. See
  `docs/scanner.md`'s "Substat OCR" section.
- **Echo identity is narrowed by matched set + cost first, the same way
  `CalculatorEchoParser.vue`'s `filteredEchoKeys` narrowing works** — name
  text (Levenshtein vs. `mainEchoesData`) only breaks a tie within that
  narrowed pool, or serves as the fallback when the narrowing comes up
  empty; it never matches against image data, since the name is printed as
  text in the panel. Only the small **set icon** (not printed as text
  anywhere in the panel) goes through the existing `echoParser.worker.ts`
  `matchSetFirst` pixelmatch path.
  **Revised:** the first shipped version matched the name against *all*
  ~150 echoes (narrowed only by cost), never using the set match it had
  already computed to narrow further. That's a materially weaker version
  of the Discord-bot flow's own accuracy driver, and it directly
  contributed to a real "Jué" (a real, short, accented 4-cost echo name)
  coming back "Unknown echo" — set+cost alone narrows to that one echo
  with no name OCR needed at all. See `docs/scanner.md`'s "Echo
  identification" section.
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
- **Video upload is an explicit open → trim → scan flow**, matching
  Tacet-Lab's actual `openVideo`/`scanVideo` split rather than scanning the
  whole file blind: `capture.ts`'s `openVideoFile` loads metadata and a
  scrubbable preview frame, the user picks a start/end range and a sample
  rate (1/2/4/8 fps, default 2fps — matching Tacet-Lab's default), then
  `createVideoFileSource` runs the seek-and-capture loop only over that
  window. Lets a long recording skip past menu navigation before reaching
  the Echo screen, and trades scan thoroughness for speed deliberately
  instead of a single fixed step for every video.
- **Signature dedupe only, no grid-position tracking.** Truly identical
  echoes (same name/set/cost/main/substats) collapse to one via
  `getEchoIdentityKey`, reused from the existing Discord-bot flow.
- **Nothing auto-saves.** Every field carries per-candidate confidence;
  low-confidence fields are flagged in the review list
  (`EchoScannerCapture.vue`) before the result is handed to the existing,
  already-tested `CalculatorEchoImporter.vue` duplicate-review/save step.
- **Debug mode**: an opt-in checkbox that overlays every named ROI on the
  live preview and, per captured candidate, shows a thumbnail crop + OCR
  text for each region. Added after real usage reported every scanned
  echo coming back with the same wrong set — with no way to see what was
  actually being cropped, that was a guessing exercise. It immediately
  showed the cause: `SET_ICON_BOX` was badly mispositioned (an unmeasured
  guess, unlike the header/stats blocks) and was landing on background art
  instead of the icon, so `matchSetFirst` was confidently matching a muted
  background blur against all 30 set icons and always winning with the
  same one. Re-measured it the same way as the row positions (threshold a
  real screenshot's header region for bright pixels, take the bounding
  box) — see `SET_ICON_BOX`'s doc comment and `docs/scanner.md`'s "Debug
  view" section.

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
- Cons: only 16:10 is supported today (`isSupportedAspect`
  rejects other aspects up front rather than silently misreading them) — a
  calibration UI for non-16:10/ultrawide is a known, explicitly deferred
  follow-up, not built here; `public/tesseract/` adds ~19MB of static assets
  to the repo (fetched lazily, only when a scan session starts, so it
  doesn't affect normal app load); individually-cropped substat rows mean
  up to 8 OCR calls per candidate instead of 2, a deliberate
  accuracy-over-speed tradeoff (offset by a bigger, 3-worker OCR pool) that
  makes each candidate slower to process.

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
