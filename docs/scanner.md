# `src/scanner` — Echo screen scanner

Lets a user share their WuWa game window (or upload a video they already
recorded) and click through their in-game Echo inventory; the app detects
each newly displayed echo, OCRs it, and queues it for review instead of
requiring the Discord-bot image or manual entry. All client-side — no
server, no upload. See [ADR 0032](./adr/0032-echo-screen-scanner.md) for why.

## Mental model

```
capture.ts (FrameSource: live share or uploaded video)
  → grab a small crop of the detail panel every tick
  → fingerprint.ts + stability.ts: cheap "did the panel settle on
    something new?" gate — no OCR yet
  → on settle: grab header/stats-block crops
      → echoScanner.worker.ts: OCR only (tesseract.js, self-hosted)
      → echoParser.worker.ts: matchSetFirst (existing set-icon matcher, reused)
  → parse.ts: raw OCR text + matched set → ParsedEchoSlot candidate
    (name via Levenshtein match against mainEchoesData, not image matching —
    the echo name is printed as text in the panel)
  → dedupe.ts: signature-based (getEchoIdentityKey) — identical echoes collapse
  → useEchoScanner.ts (composable) owns all of the above, exposes a
    reviewable candidate list
  → EchoScannerCapture.vue: UI, emits the same `echoes-parsed` event shape
    CalculatorEchoParser.vue already emits
  → CalculatorEchoImporter.vue: unchanged duplicate-review / save pipeline
```

`src/scanner/*` is pure TS (no Vue/DOM beyond the browser APIs the capture
layer itself needs — `HTMLVideoElement`, `File`, canvas). `echoScanner.worker.ts`
is intentionally dumb: it never imports `src/echoes/*`, so it only ever
returns raw recognized strings — all game-data lookups happen on the main
thread in `parse.ts`, keeping the worker's messages plain and serializable.

## Two capture sources, one pipeline

`src/scanner/capture.ts` exposes `createScreenShareSource()` and
`createVideoFileSource(file)`, both resolving to the same `FrameSource`
shape (an `HTMLVideoElement` plus a `start`/`stop`). Only *how a tick is
driven* differs:

- **Live** (`getDisplayMedia`): a fixed ~8fps timer over real elapsed time.
- **Video file**: a deterministic **seek-and-capture** loop — step
  `currentTime` forward, await `seeked`, capture, repeat — decoupled from
  real time. This is faster than live (a ~49s clip becomes ~100 sequential
  captures processed back-to-back, no live-decode frame drops) and needs no
  screen-share permission prompt. It exists because a user is likely to
  already record their click-through with existing capture software (OBS,
  GeForce Experience, a phone) rather than share live every time.

Everything downstream of `FrameSource` (fingerprint, stability, layout,
parse, dedupe) doesn't know or care which source is active.

## ROI layout — how the numbers in `layout.ts` were derived

All regions are **fractions of the full captured frame**, not fixed pixels —
required because the live stream, an uploaded video, and a future
calibration screenshot can each arrive at a different resolution. The
fractions currently in `layout.ts` were **measured, not guessed**, off real
screenshots and a real gameplay video the user provided:

- Row bands were found by taking a luma-variance profile down the panel
  region and grouping contiguous high-variance rows (text) — see the
  approach documented in the PR history; the result: the main-stat row
  starts at a fixed fraction of frame height (~0.384) with a consistent
  ~0.037 pitch between single-line rows, **regardless of capture
  resolution** — checked against three real resolutions that share WuWa's
  fixed 16:10 UI aspect: 2880x1800 and 2304x1440 (this PR's footage) and
  2800x1752 (an earlier session's sample).
- This measurement also settled a real design question: **an echo below
  +25 reveals fewer than 5 substats**, and the panel doesn't reserve blank
  space for the missing ones — content below the last populated row just
  moves up. A long stat label ("Resonance Skill DMG Bonus") can also wrap
  to a second line, shifting everything after it unpredictably. Because of
  this, `STATS_BLOCK` is captured as **one region and OCR'd as a multi-line
  block**, not as 7 rigid per-row boxes — `parse.ts`'s `splitStatRows`
  reassembles rows from the recognized text (including rejoining a wrapped
  label onto its value line) instead of trusting fixed row slots.
- `SET_ICON_BOX` is a first-pass estimate, not independently pixel-measured
  the way the blocks above were — refine it via real testing before relying
  on set-icon match confidence.
- Only 16:10 has been measured. A very different aspect ratio is rejected
  up front (`isSupportedAspect`) rather than silently producing garbage; a
  calibration UI for non-16:10/ultrawide is a known follow-up, not built here.

If a future WuWa UI update moves the panel, re-run the same measurement
against a fresh screenshot before touching the fractions by feel.

## Accuracy

Per `docs/accuracy-verification.md` and the project's priority order,
nothing here auto-saves silently:

- Every candidate carries per-field confidence (name, cost, main stat, set,
  each substat) computed in `parse.ts`; low-confidence fields are flagged in
  `EchoScannerCapture.vue`'s review list.
- Echo name is matched via Levenshtein similarity against `mainEchoesData`
  (threshold 0.68), narrowed by cost when the cost was also read — a name
  below threshold is left unresolved (`echo: null`) rather than guessed.
- Substat values are snapped to the nearest legal roll in `subStatsTable`
  (`src/echoes/stats.ts`) — the same table the Discord-bot importer trusts.
- A freshly-acquired echo with no main stat chosen yet (`needsMainStatSelection`)
  is skipped, not misparsed.
- Truly identical echoes (same name/set/cost/main/substats) collapse to one
  via `dedupe.ts`'s signature (`getEchoIdentityKey`) — no grid-position
  tracking.
- The scanner's result is handed to `CalculatorEchoImporter.vue`'s existing,
  already-tested duplicate-review → save pipeline unchanged — reviewing and
  confirming before anything is saved is not new UI, it's the same UI the
  Discord-bot import flow already uses.

## Self-hosted tesseract.js

`public/tesseract/` holds `worker.min.js`, the SIMD+LSTM wasm core, and
`eng.traineddata.gz`, copied/downloaded from the `tesseract.js`/
`tesseract.js-core` packages and the `tessdata` distribution respectively.
`echoScanner.worker.ts`'s `createWorker` points at these paths instead of
the default CDN, so scanning doesn't depend on a third party being up. These
are only fetched lazily when a scan session actually starts (not on normal
app load), so they don't affect the app's regular load time.

## Extending / debugging

- `src/echoes/parsedEchoMapping.ts` (`mapParsedEchoes`, `getSubstatType`,
  `getSubstatValue`) is shared between the Discord-bot importer and this
  scanner — fix a mapping bug once, both flows benefit. Don't re-duplicate
  it back into a component.
- Unit tests: `tests/scanner/*` (fingerprint/stability with synthetic
  frames, layout at the three measured real resolutions, parse against real
  transcripts read off the provided screenshots) and
  `tests/echoes/parsedEchoMapping.test.ts`. There is deliberately no
  end-to-end tesseract-in-CI test — OCR accuracy against real captures is a
  manual verification step (upload the reviewer's own recorded clip through
  the "Upload a video" path in `npm run dev`), not a unit test.
- See `src/workers/DEBUGGING.md` for general worker debugging tips.
