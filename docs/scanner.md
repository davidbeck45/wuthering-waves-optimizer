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
  → on settle: grab name + main-stat + fixed-secondary + up to 5
    individually-cropped substat-row bitmaps, plus a full-frame bitmap
      → echoScanner.worker.ts: OCR each crop separately (tesseract.js, self-hosted)
      → echoParser.worker.ts: matchSetFirst (existing set-icon matcher, reused)
  → if the 5 per-row substat crops don't add up to all 5 substats: one more
    OCR call against a wider SUBSTAT_BLOCK crop, parsed as a fallback pass
  → parse.ts: raw OCR text + matched set → ParsedEchoSlot candidate (echo
    identity: narrow mainEchoesData by the matched set first, same as
    CalculatorEchoParser.vue's filteredEchoKeys minus its cost half —
    this scanner doesn't read cost — then Levenshtein name-text match to
    break a tie within that narrowed pool; cost is then derived from the
    resolved echo's own class, not read as text at all; level isn't read
    either — every scanned echo is assumed max-level, since the app
    doesn't persist echo level today)
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
fractions in `layout.ts` are **measured, not guessed**, off real
screenshots and a real gameplay video the user provided, using simple
Python/PIL luma-variance and brightness-threshold scans (row/column bands,
bounding boxes) rather than eyeballing crops — every constant's doc
comment says what was actually measured.

- Row bands: the main-stat row starts at a fixed fraction of frame height
  (~0.384) with a consistent ~0.0373 pitch between single-line rows,
  **regardless of capture resolution** — checked against three real
  resolutions that share WuWa's fixed 16:10 UI aspect: 2880x1800,
  2304x1440, and 2800x1752.
- **No cost or level OCR.** The app doesn't persist echo level (every
  scanned echo is assumed max-level), and cost is derived from the
  resolved echo's own class once name+set narrow it down — the same
  fallback `CalculatorEchoParser.vue` already has for when its own cost
  OCR misses, just always taken here. That means the old multi-purpose
  header crop shrank to `NAME_BLOCK`: the name line only, single-line,
  fixed height — WuWa shrinks the font for a long name rather than
  wrapping it, checked against both a short name ("Thousand-Puppet
  Pavilion") and a long one ("Reminiscence - Nightmare: Adam Smasher").
- **Stat-row crops exclude the leading stat-type icon glyph** (the small
  icon matching `subStatIconMap`, e.g. a sword for ATK, that sits before
  every row's label). A real debug-crop capture showed tesseract reading
  that icon as garbage text ahead of the real label ("QQ HP 957", "% DEF")
  — measured the icon/text gap directly (a column-variance scan across a
  real row) and shifted every stat row's left edge past it, rather than
  relying only on `parseStatRow`'s noise-tolerance to work around it.
- `SET_ICON_BOX` has had three revisions, all from real usage — see "Set
  icon matching" below for the geometry history and the (larger) separate
  fix to how the crop is matched, not just how tightly it's cropped.
- `SUBSTAT_BLOCK` — a fallback, not primary, region — spans all 5 substat
  rows plus wrap allowance; see "Substat OCR" below.
- Only 16:10 has been measured. A very different aspect ratio is rejected
  up front (`isSupportedAspect`) rather than silently producing garbage; a
  calibration UI for non-16:10/ultrawide is a known follow-up, not built here.

If a future WuWa UI update moves the panel, re-run the same kind of
measurement against a fresh screenshot before touching the fractions by feel.

## Substat OCR: per-row crops first, a wider block as fallback

The first version of this scanner OCR'd the whole stats area as one
multi-line block and asked tesseract to segment it into rows itself. Real
usage surfaced this as a cause of missing substats: block-level line
segmentation can silently merge two rows together or drop a row's text
entirely when line spacing is tight, with no way to recover it from the
block's recognized text afterward. That was replaced with 5 separate,
individually-cropped substat regions — mirroring `CalculatorEchoParser.vue`'s
proven approach for the Discord-bot image (5 separate crops there too) —
which fixed that failure mode but introduced a different one: `SUBSTAT_ROWS`
crops are taller than one line (to still catch a wrapped label's
continuation, which lands in the next row's space), and real debug-crop
captures showed that overlap regularly catching a *neighboring* row's
actual text too, not just blank margin — visible as two consecutive
substat crops both containing the same line. A wrapped label earlier in
the panel is the root cause either way: WuWa doesn't reserve consistent
spacing for a wrap, so it shifts every row below it down by an amount
that varies echo to echo, which no *fixed*-position crop's height alone
can fully account for.

The current design is two passes, per the user's own suggestion after
seeing the debug-crop bleed-over directly:

1. **Per-row pass** (primary): the 5 individually-cropped `SUBSTAT_ROWS`,
   as before. `parse.ts`'s `parseStatRow` only accepts a candidate row
   whose label actually looks like a real stat name
   (`isPlausibleLabel`) — keeps scanning past noise (including a
   neighboring row's leaked-in text, or the excluded icon's OCR garbage
   if any still gets through) rather than grabbing the first thing that
   merely *shaped* like "label value".
2. **Block fallback**: if the per-row pass doesn't add up to all 5
   substats — expected every time now that level is assumed max, so
   anything less is treated as a miss to recover, not a legitimately
   partial echo — one more OCR call goes out against `SUBSTAT_BLOCK` (all
   5 rows + wrap allowance, in one wider crop), parsed by `splitStatBlock`
   (the same per-row plausibility gate, generalized to keep finding more
   rows instead of stopping at the first). If that recovers more than the
   per-row pass did, its result *replaces* the per-row one outright,
   rather than trying to merge two different partial views position by
   position — `usedSubstatBlockFallback` on both the parse result and the
   saved `ScanCandidate` records when this happened, shown in the debug view.

This costs more OCR calls per candidate than the original single-block
design (up to 8 baseline, +1 only when the fallback triggers) — a
deliberate accuracy-over-speed tradeoff per `CLAUDE.md`'s priority order,
offset by giving `echoScanner.worker.ts` a 3-worker pool (up from 2) so a
candidate's row crops OCR in parallel.

### Row parsing: what a wrapped/split row's text actually looks like

`parse.ts`'s `scanStatRows` (shared by `parseStatRow` and `splitStatBlock`)
has to reassemble a row's label from however tesseract split it across
lines. Real debug-crop footage confirmed three distinct shapes, not just
the one originally assumed:

- **Normal**: label and value on one line — `"Healing Bonus 26.4%"`.
- **Value-only continuation**: the label is alone on its own line, and the
  value lands alone on the *next* line — `"% DEF"` / `"11.3%"`.
- **Wrapped label, value on its first line**: `"Resonance Liberation
  10.9%"` / `"DMG Bonus"` — the value is right-aligned to the label's
  *first* visual line, and the rest of the label continues below it with
  no value of its own. This is the game's actual layout (confirmed by
  comparing two real debug-crop screenshots side by side), and it's the
  *opposite* of what an original version assumed (value after the label's
  *last* line) — that version could never recover a wrapped row at all: a
  crop that was clearly legible in the debug view still came back with 0
  substats, because the value was already sitting correctly on line 1, but
  the partial label without the word(s) pushed to line 2 didn't look
  plausible, and the code was looking *behind* itself for more label text
  instead of *ahead*.

`scanStatRows` accumulates label text from both directions around
whichever line the value turns up on, and only settles a row once it hits
a real boundary (a new value line starting a different row, or the end of
input) or an *exact* known label. That last part matters on its own:
`verboseStatLabelMap` deliberately carries multiple aliases per stat for
fuzzy-matching elsewhere ("Resonance Liberation DMG Bonus", "Resonance
Liberation DMG", and "Resonance Liberation" all resolve to the same stat)
— treating *any* registered key as "this label is complete, stop
extending" was a second real bug, since "Resonance Liberation" alone is
already a registered alias and kept committing the truncated label before
ever reading the next line. `CANONICAL_COMPLETE_LABELS` picks out only the
*longest* alias per stat — the one WuWa actually displays in full — as
the signal that a label is really finished.

## Echo identification: narrow by set first, name text breaks ties, cost is derived

The first version matched the echo purely by OCR'ing its name and
Levenshtein-fuzzy-matching against all ~150 echoes (narrowed only by a
cost read from text). That missed the technique `CalculatorEchoParser.vue`'s
Discord-bot flow actually relies on for its accuracy: match the set icon
first (`matchSetFirst`), filter `mainEchoesData` down to echoes in that set,
and only then resolve the specific echo.

`parse.ts`'s `resolveEcho` does this narrowing by **set only** — this
scanner doesn't read cost as text at all (see the ROI layout section
above), so unlike `CalculatorEchoParser.vue`'s own `filteredEchoKeys` this
can't also narrow by cost:

1. **Narrow** `mainEchoesData` by `matchedSet` membership.
2. **Pool of exactly one** (only when a set actually narrowed to a single
   echo across *every* cost tier — checked: most sets still have several,
   e.g. `SongofFeatheredTrace` has 8 across costs 1/3/4, but some, e.g.
   `ShadowofShatteredDreams`, really do have just one): trust it directly,
   sidestepping OCR'ing the name at all for an echo whose name is short or
   accented and therefore hard to read reliably (confirmed cause of a real
   "Jué" (4-cost) mismatch — see `normalize`'s doc comment). Still
   sanity-checked against any name text that *was* read
   (`NAME_SANITY_THRESHOLD`), so a set icon that was clearly misread
   doesn't get silently trusted.
3. **Pool of several** (the common case now that cost doesn't also
   narrow): Levenshtein name matching breaks the tie within that pool
   instead of against the full list — `NAME_BLOCK`'s single-line, no-wrap
   crop (see above) exists specifically to make this name read reliable,
   since it now carries more of the identification burden than it used to.
4. **Empty pool**: the set match itself was probably wrong. Falls back to
   `matchEchoName`, matching by name against every echo, same as the very
   first version's behavior.

Once the echo is resolved, **cost is derived from its class**
(`getCostByClass`) — never read as OCR text. The fixed secondary-stat row
is still OCR'd (useful context, shown in the debug view) but no longer
feeds cost detection at all; an earlier version tried inferring cost from
its flat value, but only checked the rank-5 table (a real bug — echoes
aren't all 5-star, confirmed from a real rank-4 cost-1 echo whose
secondary crop was perfectly legible but didn't match rank 5's value).
Deriving cost from the resolved echo instead sidesteps that whole class of
problem.

## Set icon matching: shape-mask the background, not just crop tighter

`SET_ICON_BOX`'s geometry alone (see "ROI layout" above) wasn't the whole
accuracy problem — a tight crop still fed `echoParser.worker.ts`'s
`matchSetFirst` a wrong result most of the time. The actual cause: that
worker's background handling (`extractImageRegion`'s masking, and
`matchSetFirst`'s own second pass) only clears pixels close to *black*.
That's correct for the Discord-bot flow, whose source image is rendered
onto a black canvas specifically so that convention works — but wrong for
a live capture, where the icon sits on the game's own reddish panel
background, nowhere near black. None of that background was ever being
masked, so `getDominantColors` (which `matchSetFirst` leans on most
heavily, ahead of shape detection and a small-weight pixel diff) picked up
the *background's* color as one of the crop's "dominant colors" alongside
or instead of the icon's own — corrupting the color-family comparison the
whole match is built on. Confirmed by comparing a captured crop against a
reference icon image (transparent background) side by side.

`capture.ts`'s `grabCircularMaskedBitmap` fixes this by masking by *shape*
instead of *color*: since the icon is circular and (now cropped tight)
fills nearly the whole crop, everything outside a centered circle is made
fully transparent before the crop is ever sent to `matchSetFirst` —
removing the background regardless of what color it actually is.
`useEchoScanner.ts`'s `matchSetIcon` grabs and masks this crop itself,
then sends *that* (not the full frame + pixel coordinates, the earlier
approach) as `sourceImageBitmap`, with `setCoords` covering the whole
already-cropped, already-masked bitmap — so `echoParser.worker.ts`'s own
black-only masking pass, still used unmodified by the Discord-bot flow
too, is never relied on here and stays untouched. The debug view's
`setIcon` crop thumbnail shows this exact masked bitmap (on a gray
backdrop so the transparent corners are visible), not a plain rectangle,
so the mask being applied is something you can actually see, not just
take on faith.

### Second bug, same symptom: a scale mismatch, not just a color one

Fixing the background color didn't fully fix match accuracy either — a
side-by-side debug-view screenshot (the captured crop next to the
reference icon it was being compared against) showed the captured icon
reading visibly *smaller* than the reference, even after masking. Cause:
`matchSetFirst` stretches both images onto the same 32x32 comparison
canvas before comparing, and the reference set images (e.g.
`CelestialLight.webp`) are cropped with essentially no margin around their
content. `SET_ICON_BOX`'s own bounds, however tightly hand-measured, still
leave *some* slack around the icon's real edge — and the original circular
mask was inscribed in the *box's* dimensions, not the icon's, so that
slack became a ring of true background color sitting just inside the
mask. Stretched to 32x32 alongside a reference with no such ring, the
real icon content ends up occupying a smaller fraction of the comparison
canvas than the reference's does — a scale mismatch that throws off both
the color-family signal and the pixel-diff one.

`capture.ts`'s `detectIconBounds` fixes this at capture time rather than
by chasing an ever-tighter fixed fraction in `layout.ts`: it samples the
crop's four corners (guaranteed background, since a crop with any margin
has plain background in its corners) as a reference color, thresholds
every pixel in the crop by distance from that color, and returns the
tight bounding box of whatever doesn't match — i.e. the icon's own real
edge, not the configured box's edge. `grabCircularMaskedBitmap` re-crops
to that detected box before inscribing the circular mask, so the result
matches the reference convention (icon fills the bitmap, no ring) however
loose `SET_ICON_BOX` actually is. It falls back to the full configured
crop (previous behavior) if nothing in the crop is distinguishable from
its own corners, so a bad detection never makes things worse than before.
Unit-tested directly in `tests/scanner/capture.test.ts` with synthetic
crops (centered icon block, flat crop, icon already filling the whole
box, a too-small noise speck, minor per-pixel color noise) since it's a
plain function over pixel data with no canvas/DOM dependency.

### Third bug: matchSetFirst's own scoring buries the signal that works

Fixing color and scale still left matching inconsistent, and it turned out
the algorithm itself was the remaining cause, not the crop. `matchSetFirst`
combines three signals into one score: a binary color-family match/mismatch,
a crude shape heuristic (`detectShapes`'s `hasShield`/`hasCross`/etc., built
by literally counting edge-pixel patterns), and `compareSetIcons`'s
per-pixel diff — the same comparison the Discord-bot flow relies on and
that reliably works well there. But the *combining weights* treat a
color-family mismatch as a flat **100000** penalty (an absolute veto —
nothing else can outweigh it) and give `compareSetIcons` only **0.1x**
("just for fine-tuning"), with the shape heuristic at 5000x in between.
One misclassified dominant color — far more likely from a
chroma-subsampled, video-compressed live capture (which bleeds/shifts hue
at edges) than from the Discord-bot flow's clean, uncompressed rendered
source images — silently disqualifies the correct set regardless of how
well `compareSetIcons` would have scored it. That's why the same shared
algorithm can be reliable for one input and inconsistent for the other:
it's the same code and the same weights, but a live capture trips the
harsh veto far more often than a bot-rendered image does.

Rather than change those weights globally (which would also change the
Discord-bot flow's results — the flow this scanner explicitly avoids
touching), `matchSetFirst` now takes an optional `weights` parameter
(`SetMatchWeights`) defaulting to the exact original hardcoded values, so
every caller that doesn't pass it — every existing Discord-bot call site —
sees byte-identical scoring. `useEchoScanner.ts` defines its own
`SCANNER_SET_MATCH_WEIGHTS` and passes it on the scanner's `matchSetFirst`
message only: the color-family penalty drops from a 100000 veto to a 3000
nudge, the shape weight drops from 5000 to 1500 (crude heuristics tuned
against clean renders, likely noisier here too), and `compareSetIcons`'s
weight rises from 0.1 to 1 — making it the primary signal now that its
input (thanks to the shape/scale fixes above) actually matches the
reference convention it needs to compare well.

The debug view's crop grid also now shows the *matched reference icon*
directly beside the captured `setIcon` crop (`echoSetImageMap[candidate.slot.set]`),
not just a "Matched: <name>" label — a literal side-by-side, so a bad
match (or a still-off scale/crop) is visible without a separate lookup.
These weights are a reasoned starting point from the scoring math, not
something validated against a large batch of real captures yet — the
debug view is exactly the tool to tune them further from here if matches
are still inconsistent.

## Accuracy

Per `docs/accuracy-verification.md` and the project's priority order,
nothing here auto-saves silently:

- Every candidate carries per-field confidence (name, cost, main stat, set,
  each substat) computed in `parse.ts`; low-confidence fields are flagged in
  `EchoScannerCapture.vue`'s review list.
- Echo identity is narrowed by the matched set first (mirroring the
  Discord-bot flow's `filteredEchoKeys`, minus its cost half — this
  scanner doesn't read cost), with Levenshtein name-text matching only
  breaking ties within that pool or serving as a fallback — see "Echo
  identification" above. A name below threshold with no narrowing to fall
  back on is left unresolved (`echo: null`) rather than guessed. Cost is
  then derived from the resolved echo's own class, never guessed from text.
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

**Preprocessing is scoped to text OCR only, never to set-icon matching.**
`echoScanner.worker.ts`'s `preprocess` (grayscale, contrast stretch, 3x
upscale — the same recipe `CalculatorEchoParser.vue` already uses for the
Discord-bot flow) runs on every crop that goes to that worker (name, main,
secondary, substat rows, the substat-block fallback) — text OCR genuinely
benefits from it. The set icon never goes through that worker or that
preprocessing at all: it's matched by `echoParser.worker.ts`'s
`matchSetFirst`, a color-based pixelmatch against the *raw* captured
bitmap, in a completely separate worker. Grayscaling would destroy the
color signal that comparison depends on, so the two pipelines are kept
architecturally apart rather than relying on a preprocessing flag to skip
it correctly in one path.

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
(binds to `useEchoScanner`'s `debugMode` ref). When on, three things
become visible that are otherwise invisible even when something's clearly
wrong:

- **Live preview overlay**: every `DEBUG_REGIONS` entry (`layout.ts`) drawn
  as a labeled dashed box over the live/trimming preview, positioned by
  simple percentage CSS (`region.x * 100%`, etc. — the crop fractions
  double as overlay positions for free, no separate pixel math). Confirms
  at a glance whether a region actually lands on what it's supposed to.
- **Per-candidate full-frame snapshot with boxes**: a downscaled
  (`capture.ts`'s `grabFullFrameSnapshot`, ~960px wide — kept small so a
  long debug session's candidate list doesn't hold a full-res PNG per
  echo) whole-frame image with every ROI box overlaid the same way as the
  live preview, one per captured candidate, sitting in the review list
  where it can be inspected at your own pace rather than only during the
  live/moving scan.
- **Per-candidate crop grid**: every captured candidate also carries
  `debugCrops` — a labeled `data:` URL thumbnail of exactly what was
  cropped for each region (including `substatBlock`, the fallback region),
  plus that region's own OCR text. The `setIcon` entry shows the actual
  matched set ("Matched: <Set Name>" or "No set match") instead of a
  generic placeholder, so you can directly compare the crop against what
  it was matched to; `panel` (fingerprint-only, not OCR'd or matched)
  keeps a placeholder. `capture.ts`'s `grabRegionWithPreview` produces
  both the bitmap sent to the worker and the thumbnail from one canvas
  draw, so what's shown is provably the same pixels that were actually
  OCR'd/matched, not a re-derived approximation. A candidate whose substat
  block fallback pass actually fired shows a small "Used substat fallback
  pass" note (`usedSubstatBlockFallback`).

This is what caught `SET_ICON_BOX` being badly mispositioned (see its doc
comment) — every scan confidently returning the same wrong set is exactly
what a fixed-but-wrong crop landing on background art looks like — and led
directly to several fixes from real debug-crop text a user reported: an
earlier cost-inference helper only checking the rank-5 flat value (fixed
by deriving cost from the resolved echo instead, see "Echo identification"
above); `parseStatRow`/`splitStatBlock` greedily accepting the *first*
line that happened to end in a number, including obvious OCR garbage,
instead of continuing to look for a line that actually resembled a real
stat label further down; the set-icon crop being too loose around the
actual icon; and the stat-type icon glyph itself being read as text noise
(see "ROI layout" and "Substat OCR" above for all of these). If
substat/set accuracy regresses again, debug mode first: check the
full-frame snapshot to confirm the boxes actually sit on the right UI
elements, and check a few candidates' crop grids and raw text to see
whether OCR is misreading text it *did* capture correctly, versus not
capturing the right pixels at all, versus capturing the right pixels but
the parser rejecting real content — those each need a different kind of fix.

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
