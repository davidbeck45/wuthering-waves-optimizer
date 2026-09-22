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
  → on settle: grab header + main-stat + fixed-secondary + up to 5
    individually-cropped substat-row bitmaps, plus a full-frame bitmap
      → echoScanner.worker.ts: OCR each crop separately (tesseract.js, self-hosted)
      → echoParser.worker.ts: matchSetFirst (existing set-icon matcher, reused)
  → parse.ts: raw per-row OCR text + matched set → ParsedEchoSlot candidate
    (echo identity: narrow mainEchoesData by the matched set + cost first,
    same as CalculatorEchoParser.vue's filteredEchoKeys, then Levenshtein
    name-text match only to break a tie within that narrowed pool — not
    image matching, since the name is printed as text in the panel)
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

### Video upload: open → trim → scan

Uploading a video is an explicit three-step flow (`capture.ts`'s
`openVideoFile` / `seekPreview` / `createVideoFileSource`,
`useEchoScanner.ts`'s `openVideo` / `previewSeek` / `startVideoScan`,
`EchoScannerCapture.vue`'s "trimming" status), matching the reference
project [Tacet-Lab](https://github.com/DJ12421/Tacet-Lab)'s actual
`ScannerView.tsx` (`openVideo`/`scanVideo`, backed by a `LocalVideoSource`)
rather than scanning a whole file blind:

1. **Open**: load metadata and a scrubbable preview frame, no scanning yet.
2. **Trim**: the user picks a start/end range (skip past menu navigation
   before reaching the Echo screen) and a sample rate — 1/2/4/8 frames/sec,
   default 2fps (matching Tacet-Lab's default). Scrubbing the range calls
   `seekPreview` so the mounted `<video>` preview updates live.
3. **Scan**: `createVideoFileSource` runs the seek-and-capture loop only
   over the chosen window at the chosen rate.

(An earlier pass at this doc/ADR incorrectly concluded, from a README-only
check, that Tacet-Lab didn't support video upload at all — it does, and
this flow was built to match its actual approach once that was corrected.)

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
  to a second line, shifting everything after it unpredictably. `layout.ts`
  therefore defines `MAIN_STAT_ROW`, `SECONDARY_STAT_ROW`, and 5
  `SUBSTAT_ROWS` as individually-positioned crops at fixed Y fractions
  (0.384 first row, ~0.0373 pitch), not one big block — see "Substat OCR"
  below for why.
- `SET_ICON_BOX` is now also pixel-measured (threshold two real screenshots'
  header regions for bright ring/glyph pixels, take the bounding box — both
  landed at x0≈0.728-0.729, y0≈0.161-0.166). Its first version was an
  unmeasured guess, and a bad enough one to consistently miss the icon
  entirely and land on background/portrait art instead — every scan
  confidently returned whatever set icon happened to be closest to that
  background blur (reported as every echo coming back "Dream of the Lost").
  See `SET_ICON_BOX`'s own doc comment in `layout.ts`.
- Only 16:10 has been measured. A very different aspect ratio is rejected
  up front (`isSupportedAspect`) rather than silently producing garbage; a
  calibration UI for non-16:10/ultrawide is a known follow-up, not built here.

If a future WuWa UI update moves the panel, re-run the same measurement
against a fresh screenshot before touching the fractions by feel.

## Substat OCR: individually-cropped rows, not one block

The first version of this scanner OCR'd the whole stats area as one
multi-line block and asked tesseract to segment it into rows itself. Real
usage surfaced this as the cause of missing substats: block-level line
segmentation can silently merge two rows together or drop a row's text
entirely when line spacing is tight, with no way to recover it from the
block's recognized text afterward.

This now mirrors `CalculatorEchoParser.vue`'s proven approach instead — 5
separate, individually-cropped substat regions there too, one OCR call
each. `layout.ts`'s `SUBSTAT_ROWS` crops are deliberately taller than a
single line (tall enough to also catch a wrapped label's continuation
line, which lands in the next row's space); `parse.ts`'s `parseStatRow`
takes only the *first* complete "label value" match it finds in a crop and
ignores anything after, so that overlap can never leak a neighboring row's
text into the wrong slot. `MAIN_STAT_ROW`/`SECONDARY_STAT_ROW` stay
single-line height — the labels eligible there (HP/ATK/DEF/element/Crit/
Healing Bonus/Energy Regen) never wrap, unlike the 4 attack-type DMG bonus
substat labels.

This costs more OCR calls per candidate (up to 8, vs. 2 for the old header
+ stats-block design) — a deliberate accuracy-over-speed tradeoff per
`CLAUDE.md`'s priority order, offset by giving `echoScanner.worker.ts` a
3-worker pool (up from 2) so a candidate's row crops OCR in parallel.

## Echo identification: narrow by set+cost first, name text breaks ties

The first version matched the echo purely by OCR'ing its name and
Levenshtein-fuzzy-matching against all ~150 echoes (narrowed only by
cost). That missed the technique `CalculatorEchoParser.vue`'s Discord-bot
flow actually relies on for its accuracy: match the set icon first
(`matchSetFirst`), filter `mainEchoesData` down to echoes in that set *and*
at that cost (`filteredEchoKeys`), and only then resolve the specific echo
— often down to exactly one candidate, since most sets have a single echo
at a given cost tier.

`parse.ts`'s `resolveEcho` now does the same narrowing (`matchedSet` was
already being computed via the existing `matchSetFirst` reuse — it just
wasn't being used to narrow the name match):

1. **Narrow** `mainEchoesData` by `matchedSet` membership and cost.
2. **Pool of exactly one**: trust it directly — this is the common case for
   cost-3/cost-4 "boss" echoes, and sidesteps OCR'ing the name at all for
   an echo whose name is short or accented and therefore hard to read
   reliably (confirmed cause of a real "Jué" (4-cost) mismatch — see
   `normalize`'s doc comment). Still sanity-checked against any name text
   that *was* read (`NAME_SANITY_THRESHOLD`), so a set icon that was
   clearly misread doesn't get silently trusted.
3. **Pool of several**: cost-1 "trash" echoes commonly share both a set and
   a cost with a handful of siblings — Levenshtein name matching breaks
   the tie, but only within that narrowed pool instead of against the
   full list, which is both faster and more accurate.
4. **Empty pool**: the set (or set+cost combination) matched nothing — the
   set read was probably wrong. Falls back to `matchEchoName`, matching by
   name against the full cost tier, same as the very first version's
   behavior.

The fixed secondary-stat row is also now OCR'd (previously skipped as
"not persisted") and used for a second cost fallback: its flat value is
unique per cost tier at rank 5 (`flatBonusesByRankByType`; e.g. 150 only
ever appears at cost 4) — `inferCostFromSecondaryValue` uses this when the
small "COST n" text itself fails to OCR, since the secondary row is a much
larger, easier crop to read reliably.

## Accuracy

Per `docs/accuracy-verification.md` and the project's priority order,
nothing here auto-saves silently:

- Every candidate carries per-field confidence (name, cost, main stat, set,
  each substat) computed in `parse.ts`; low-confidence fields are flagged in
  `EchoScannerCapture.vue`'s review list.
- Echo identity is narrowed by matched set + cost first (mirroring the
  Discord-bot flow's `filteredEchoKeys`), with Levenshtein name-text
  matching only breaking ties within that pool or serving as a fallback —
  see "Echo identification" above. A name below threshold with no
  narrowing to fall back on is left unresolved (`echo: null`) rather than
  guessed.
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

**The paths must be fully-qualified absolute URLs** (`${self.location.origin}/tesseract/...`),
not path-absolute strings (`/tesseract/...`). tesseract.js spawns its own
nested worker by wrapping `workerPath` in a `Blob` and calling
`importScripts()` from *inside* that blob's own `blob:` context
(`workerBlobURL`, default `true`) — a path-absolute URL fails to resolve
against a `blob:` base there ("Failed to execute 'importScripts' ... URL is
invalid"), even though the exact same string resolves fine as a normal
fetch from this worker itself. The Discord-bot importer's tesseract.js
usage never hits this because it uses tesseract's default CDN path, which
is already a full `https://` URL — self-hosting is what exposes it.

## Debug view

`EchoScannerCapture.vue` has a "Debug mode" checkbox on the start screen
(binds to `useEchoScanner`'s `debugMode` ref). When on, two things become
visible that are otherwise invisible even when something's clearly wrong:

- **Live preview overlay**: every `DEBUG_REGIONS` entry (`layout.ts`) drawn
  as a labeled dashed box over the live/trimming preview, positioned by
  simple percentage CSS (`region.x * 100%`, etc. — the crop fractions
  double as overlay positions for free, no separate pixel math). Confirms
  at a glance whether a region actually lands on what it's supposed to.
- **Per-candidate crop grid**: once debug mode was on for the session,
  every captured candidate carries `debugCrops` — a labeled `data:` URL
  thumbnail of exactly what was cropped for each region, plus that
  region's own OCR text (or "(image-matched, not OCR'd)" for `panel`/
  `setIcon`, which go through `matchSetFirst` instead), shown in the
  review list. `capture.ts`'s `grabRegionWithPreview` produces both the
  bitmap sent to the worker and the thumbnail from one canvas draw, so
  what's shown is provably the same pixels that were actually OCR'd/
  matched, not a re-derived approximation.

This is what caught `SET_ICON_BOX` being badly mispositioned (see its doc
comment) — every scan confidently returning the same wrong set is exactly
what a fixed-but-wrong crop landing on background art looks like. If
substat/set accuracy regresses again, debug mode first: screenshot the
overlay to check the boxes actually sit on the right UI elements, and check
a few candidates' crop grids to see whether OCR is misreading text it *did*
capture correctly, versus not capturing the right pixels at all — those
need different fixes.

Debug mode costs an extra canvas encode per region per candidate (not
free), so it's opt-in and off by default — leave it off for normal scanning.

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
