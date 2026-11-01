# src/sim — Riley31415/wuwa_calc inside Wuthering Tools+

`/rankings` hosts Riley's team comparison table and rotation detail pages (his GitHub Pages site)
inside this app's layout. His code is **not copied**: it is the git submodule `vendor/wuwa_calc`,
imported through the Vite alias `@skittle/*` and compiled by Vite straight from his TypeScript.

| Piece | Role |
|---|---|
| `vendor/wuwa_calc` | the submodule (pinned commit); `git -C vendor/wuwa_calc pull` to update, then `node scripts/skittle-sync.mjs` |
| `skittle-modules.d.ts` | `declare module "@skittle/*"` — vue-tsc never type-checks his sources (his tsconfig differs) |
| `skittle.css` | GENERATED: his `resources/index.css` with every selector scoped under `.skittle-root` (`.pop`, `.ctxmenu`, `.barpop`, `.pickbox`, `body.coldrag` stay global because he appends those to `document.body`) |
| `rankings/controller.ts` | port of his `src/page/index.ts` (`src/index.ts` before Oct 2026): builds the DOM his page modules cache at import time (`#app`, `#topbar`, `#backLink`, `#loading`) inside a persistent `.skittle-root`, imports his modules lazily, runs his solve/run passes, routes detail views through vue-router |
| `rankings/solver.worker.ts` | worker entry: importing his `solve/solver.ts` registers `onmessage` |
| `public/dist/solves/*.json` | GENERATED: his precomputed solves; his page fetches `./dist/solves/…` relative to `/rankings` (`tests/solves/` before his d5a147e); `.gitignore` un-ignores `public/dist/` against Vite's bare `dist` |
| `public/sim/loading.gif` | GENERATED: the overlay sticker |
| `skittle-theme.css` | hand-written theme bridge (phase B2): re-derives his `--bg/--surface/--ink/--accent…` variables from DaisyUI's tokens (`oklch(var(--b1))` etc.) on `.skittle-root`, `.pop` and `.ctxmenu`, sets the app font, and darkens kit colours / hard-coded whites on `[data-theme-style="light"]` — so the page follows every app theme |
| `src/pages/RankingsView.vue` | the page: `<Nav>` + host div + credit line; a fixed-height column (`100dvh` on phones) that Riley's `#app` scrolls inside |

Things learned the hard way:
- Vue's root is `#wt-app` (index.html / main.ts) so that `#app` is free for his container.
- His `loadSolves()` probes `/__livereload`; any SPA host answers 200 with index.html, which would skip the
  shipped solves and re-solve 625 teams in the browser. The controller answers that one fetch with a 404.
- His `paint()` awaits two `requestAnimationFrame`s; rAF never fires in a background tab or headless
  Electron, so the port races it against an 80 ms timeout.
- His `body`/`html` rules become `.skittle-root { height: 100vh }` after scoping — the page's `!important`
  overrides size it to the host instead.
- The `#app` → `#wt-app` rename silently dropped upstream's `#app { width: 100% }` (style.css): `body` is a flex
  row, so the Vue root shrank to its content — the rankings page used to claim `100vw` to compensate, and on a
  phone `/settings` and `/my-rankings` grew past the viewport. `style.css` now names `#wt-app` too; nothing
  under it should size itself to the viewport.
- Visual checks: `node ~/Projects/wuwa-tools/scripts/shot.mjs http://localhost:5173/rankings --theme light --out x.png`
  (headless-Chromium DevTools screenshot; Cypress's `cy.screenshot()` hangs in this sandbox unless Electron runs with
  `ELECTRON_EXTRA_LAUNCH_ARGS=--ozone-platform=headless` — see "E2E gates" at the end).
- Cypress smoke spec: `cypress/e2e/rankings.cy.ts` (CI shard `plus` = every root-level `cypress/e2e/*.cy.ts`).
  CI must check out submodules (`.github/workflows/e2e.yml`): without `vendor/wuwa_calc` the lazy `/rankings`
  chunk fails to resolve `@skittle/*`, the page (and its Nav) never mounts, and the spec times out.
- Updating Riley: `~/Projects/wuwa-tools/scripts/sync-skittle.sh [--push]`. Sept 2026 (his "huge update" / "substat
  updates"): `index.css` and `loading.gif` moved to his repo root (`skittle-sync.mjs` looks there first), `teamWanted(key,
  members)` takes the team key, his error page is gone (errors go into the overlay's `.loading-error` box — the controller's
  `showBootError`), and a first-visit `tutorial.ts` exists that the port deliberately never shows. His substat pieces are now
  ER-tiered `ErSpread`s (`Loadout.spread(highSubs, erRolls, mySubs)`); the fork's `plus` keeps `mySubstat` as a fixed third
  piece the ER climb skips (`teamrun.ts` guard), rebased on top.
- Oct 2026 (his `ux` branch merged, ff9ab64 "big moves", 9dbffa1): `solver.ts` / `teamrun.ts` / `precompute.ts` moved to
  `src/solve/`, `display.ts` and `index.ts` to `src/page/`, `teams.ts` to `src/resonators/` — the controller's lazy imports,
  the worker and `syncTeamsHeadless.ts` follow. New in his controller and ported here: the detail page's pick menus
  (`page/pickmenu.ts` — `onSwitch` / `onSolve` hooks; the controller's `switchTo` re-opens the new row through vue-router,
  not his `reopenDetail()`'s raw `pushState`), a `tableStale` flag, and team codes (`#team=<code>`, `page/teamcode.ts`):
  read the team with `hashTeam()`, never `hashParams().get("team")`; a code leaving gear to the solver is read back after
  `solveQuiet`. A team code has no place for a "My build" spread, so such a row keeps its plain key (fork `teamTag`).
  Echo pieces became real echoes (`shared/echoes.ts`): a substat spread is a `Spread` of rolls dealt over five echoes, so
  the fork's `customSubstats` builds one with his `rolledPiece`; `comboOf` caches combos per pick id, which carries the
  My-build bit, and `setMySubstat` drops a loadout's cache. Two more elements he appends to `<body>` — the damage chart's
  `.barpop` and the pick menu's `.pickbox` outline — are global in `skittle-sync.mjs` and themed in `skittle-theme.css`.

Credit: engine, kits, rotations and solves by Riley31415 (wuwa_calc, ISC).

## Phones (2026-09-15)

Upstream's layout is already responsive (768 px breakpoint, hamburger sub-navs); the plus additions are what
broke on a phone. Rules and pieces:

| Piece | Role |
|---|---|
| `src/style.css` `#app, #wt-app { width: 100% }` | the root-width fix above — the one change that touched every page |
| `Nav.vue` below `sm` (640 px) | five icon links + hamburger + theme + `…` never fit DaisyUI's 50 %/50 % navbar halves: `navbar-start` becomes `flex-1`, `navbar-end` content-sized, icons 40 px with a 4 px gap, the `…` summary `px-2`. Fits 360 px with a desktop scrollbar (Cypress) — the gate in `phoneLayout.cy.ts` measures the Rankings icon against the theme button |
| `phone-tables.css` (`table--cards`) | a DaisyUI `table` that reflows into flex cards below 768 px: `thead` hidden, each `tr` a wrapping flex card, `td[data-label]` captions itself; the component picks the card order with `.cell--*` classes. Used by `MyRankingsView.vue` (rank · name · damage on the first line, weapon / rotation / bar / deltas / buttons below; the what-if row stays a full-width panel) and `PhoneEchoBatchParser.vue` (screenshot + cost first, the echo / set / main / substat selects below). Same markup as the desktop table, so the E2E hooks and colspan rows are unchanged |
| `Settings.vue` / `SettingsView.vue` (upstream files, two-line diffs) | the classic tab strip wraps below `sm`, page padding 1 rem — upstream's own page grows to 545 px on a phone once the root is 100 % (PR candidate, parked) |
| `RankingsView.vue` | `100dvh` height so the credit line and the bottom of Riley's table clear Android's URL bar; below 768 px the credit line is hidden and lives in the bar's ⋯ menu and "How to read" (2026-10-31). Riley's aside is a sheet docked under its header, opened from the bar's Search button (2026-10-31, below) |
| `index.html` + `public/manifest.webmanifest` + `public/icons/` | `theme-color`, standalone manifest and 192/512/apple-touch icons (rendered from `icons/icon.svg` with `rsvg-convert`) so the site installs to an Android/iOS home screen; `viewport-fit=cover` |
| **`src/sim/phone.css`** (global, imported in `main.ts`; second pass, 2026-09-15 from David's phone screenshots) | phone-only overrides keyed by upstream's own class names, so Ryan's `.vue` files stay untouched: the `.calculator__damages` / `.calculator-optimizer__damages` attack tables become two-line cards (name, then Normal · Average · Crit with `::before` captions from `nth-child`); the classic echo cards (`CalculatorEcho.vue`, `CalculatorEchoCard.vue`) reflow below `lg` into picture-beside-name + full-width stat table + one row of actions (CSS grid over `display: contents`, no markup change); DaisyUI `.collapse` tracks `minmax(0, 1fr)` so long titles wrap; `AppRichSelect` min-width capped at its container (upstream's own 480 px override never applied — the component sets the variable on itself); the pick-one browsers (characters / weapons / main echoes) two per row; modals as full-width bottom sheets; optimizer results stacked (stat tables) with loadout tiles two per row; team list / editor rows wrap; v3 strips wrap; the navbar pinned to 80 px (the old `.contain.mt-20` px fix went with Ryan's #668: AppLayout offsets by the measured `--nav-h`) |

**The budget is 360–412 px at a 130 % font size.** David's S26 Ultra renders type ~30 % larger (Samsung's font-size
setting); the four screenshots he sent (optimizer result stats, a rotation damage table, the character browser, an
inventory echo card) all fit at 100 % and broke at 130 %. `shot.mjs --font-scale 1.3` emulates it (`html { font-size:
130% }`, which is what Android's text scaling does to rem-based layout); a rule that only holds at 100 % is not done.

Gates: `cypress/e2e/phoneLayout.cy.ts` at 360 × 800 — every route inside the viewport width, the nav clear of the
utility menu, the two card tables reflowed (and back to tables at 1440), the calculator's damage tables and echo cards
reflowed with the character browser at two per row, real OCR review inside the importer; `themes.cy.ts` for the
Gruvbox dark theme (`tailwind.config.js` `gruvbox`, listed in `useTheme.ts`; morhetz's medium palette — orange / blue
/ aqua as primary / secondary / accent, bg0 page, bg0_s / bg1 cards and nav).
**v3 is the default UI since Ryan #602 (2026-10-10, ADR 0038; classic is an opt-in).** `cypress/support/e2e.ts` seeds
classic for every spec without its own settings, so all the plus specs above run classic, and `cy.importCharacterData`
only works there (it clicks the classic Settings import). The v3 gate is `phoneLayout.cy.ts`'s own v3 test: it seeds
the fixture and `useClassicUi: false` through `onBeforeLoad`, 130 % text, a wuwa_calc-length rotation name as the live
result bar's headline, at 412 × 915 (at 360 px the nav fits a real phone by 0.2 px, less than Electron's scrollbar).
`phone.css` § 12–13 came from that pass: `/updates` padding, bare URLs and the search row (both UIs), and the v3 bar's
`whitespace-nowrap` headline, which had grown the calculator page to 592 px.
`phone.css` § 14 came with Ryan #681/#682 (2026-10-31 sync; his rotation charts, behind the Labs "frame timing" flag):
RotationShareBars' % labels hide when their segment is narrower than the label (a cut-off "14%" read as "1"), and
the team lanes chart's turns-on-field table becomes two-line cards (it was 463 px wide in a 329 px scroller).
`phone.css` § 15 (2026-10-31, WaveScan "add only new echoes" and build history both hit it): DaisyUI's toast is
`nowrap` and pinned right, so a sentence-long toast ran off the left edge of a phone at 130 %; below 768 px it now
spans the screen less a margin and wraps; see that section below.
`phone.css` § 16–21 came from the 2026-10-31 shell audit (the Ask button and plus bars, Settings › Backup & Restore,
the tuning planner, the What's new pictures, the v3 calculator header, Wavescan loadout cards, light-theme Forte icons;
"Shell refinements" below).
`phone.css` § 22–23 came from the 2026-10-31 fight-pages audit (compact rotation action cards, tap targets on /endgame,
/rotation and /energy; "Fight pages, refined" below), with its edits to § 2, § 8, § 9 and § 13.
`phone.css` § 25–27 came with the 2026-10-31 echoes pass (section "Echoes pages on a phone" below): the v3 inventory
tile and its sticky pager, the calculator's Set Bonuses header and rating guide, and the importer sheet's sticky ✕.
Visual checks: `shot.mjs … --width 384 --height 854 --mobile` (touch + DPR 3), `--files "<selector>=a.jpg,b.jpg"`
for the importer, `--eval-file` with an overflow probe (the session scratchpad has one: innermost visible elements
whose right edge passes `clientWidth`).

Known, left alone: the inventory at 250 echoes is still one column of cards on a phone, but readable and pageable from
anywhere since 2026-10-31 (§ 25 and `inventoryPager.ts`; Ryan's Density › Compact setting gives a two-column tile
grid); the rotation log on Riley's detail page still scrolls sideways (Member / Action stay stuck). Fixed 2026-10-31:
the account bar is two rows of 40 px controls, and the detail's Equipment table shows one member at a time (the
section "Account and rankings refinements" at the end).


## Stock presets from wuwa_calc (phase C) — `src/sim/presets/`

| File | Role |
|---|---|
| `index.ts` | loaders: `loadWuwaCalcRotationPresets(key)` (one lazy JSON chunk per character via `import.meta.glob`; appended to the curated list by `CalculatorRotations.vue` for the Rotation presets modal and by `TeamRotationTeamEditor.vue` for the team-slot import dialog — the calculator engine and `getCharByName` never touch them), `loadWuwaCalcTeamPresets()` (lazy `data/teams.json`, joined to the curated list the first time Teams > List Presets opens) |
| `data/rotations/<Key>.json` | GENERATED — `CharacterRotationPreset[]` per character: the top steady-state loops Riley's engine ran for that resonator in each solver state (see below), team-dependent variants included (e.g. Xuanling's 3 vs 5 "Still as Withered Wood" shadows), mapped onto this app's attack keys; identical action lists across states are emitted once |
| `data/teams.json` | GENERATED — `TeamRotationPreset[]`: per solver state, for every main DPS the app knows, the best 3 distinct compositions, the three rotations interleaved in execution order, main DPS in slot 0, enemy = level 100 / 20% RES (Riley's target) |
| `data/manifest.json` | GENERATED — provenance (`wuwaCalcCommit`, `appCommit`, state, timestamp) and counts |
| `data/breakpoints.json` | GENERATED — the **sequence-breakpoints table** (`wuwa-tools/rotation-port/export_breakpoints.mjs`, kept with its prose twin in `wuwa-tools/knowledge/`): per resonator, each of Riley's loadouts with the sequence levels at which its declared loop switches (`Loadout.rotationAt` over the kit's `rotation: { 0: …, 3: … }` map) and what the switch adds/drops, plus the Sequence pieces with his own note on each. `loadSequenceBreakpoints(key)` (keyed by Riley's name, so both Rover forms match) feeds the Rotation presets modal's "Sequence breakpoints" block (`CalculatorRotationsPresetsModal.vue`, `describeBreakpoints()`). Each switch carries a `kind`: `loop` (different casts), `order` (same casts reordered) or `chain` (only an opener / first-visit / start-of-combat chain differs — Aemeath S1, Xuanling S1, Hiyuki S2, Phrolova S2); two identical Rotation objects (Jiyan's S6) are no breakpoint. 12 of 47 resonators have one, 8 of them a real loop change (2026-09-15). The import/sync hint `nextLoopChange` fires only for a real loop change |
| `wuwaCalcPresets.test.ts` | gate: every generated action resolves on its character through `resolveRotationActionToAttackData`, names unique and disjoint from the curated presets, every team a complete 3-slot team |

Generator: `~/Projects/wuwa-tools/rotation-port/emit_app_presets.py --states s6r5,s6r5mdps,s6r1mdps` (after
`export_rotations.mjs <state>` → `dump_app_tables.ts` → `map_rotations.py --state <state>` per state, see that README).
**Negative-status ticks are actions (2026-09-14):** a tick Riley's engine fires ("Aero Erosion - 9 Stacks", "Fusion Burst -
10 Stacks", "Glacio Chafe - 13 Stacks", Electro Flare, Spectro Frazzle) becomes the app's own per-tick negative-status
action (`type: "negativeStatus"`, key `ElementalEffect<Status>`, `negativeStatusStacks` = the tick's count, capped at the
stack tables' 13 / Aero Erosion 12; an Electro Flare tick also carries the Electro Rage held) — Hiyuki's converted ticks
use her own `ElementalEffectGlacioBite` forte row. Every team preset's `enemyConfig` carries the **enemy settings the run
held**: each tick status at its ceiling in the loop, Electro Rage, and Havoc Bane / Tune Strain at the count in force on
most damage casts (`enemyConfigOf` here, `enemy_config_of` in the Python mapper; 76 of 130 team presets set one).
Solver states shipped: **S6R5** (everyone S6, R5 signatures), **S6R5 DPS · S0R1 team** and **S6R1 DPS · S0R1 team**
(only the main DPS S6, everyone else S0 with R1 weapons — the realistic case when supports aren't S6/R5); names
carry the state tag, and each character preset's name states that character's own sequence and weapon. Never hand-edit `data/`. Casts the app has no action for are listed in each
preset's description as "Not ported" (as of 2026-09-11: the echoes Oblivion / Core of Collapse / Hecate, Cantarella's
"Beneath the Sea", one forte heavy). Kit multipliers Riley folds into his motion values (Hiyuki, Cantarella, Brant,
Galbrena, …) are mapped by ratio — the app applies them through the kit's buffs, so keep those enabled.
E2E: `cypress/e2e/wuwaCalcPresets.cy.ts`. Credit: author field `Riley31415 (wuwa_calc)` on every preset.


## Endstate Matrix planner (track F) — pulled out 2026-09-14

`/matrix` (phase data, roster + ticked extras, Riley's engine scoring every composition in a worker pool, the
Vigor-aware plan, saved plans) lived in `src/sim/matrix/` with `cypress/e2e/matrix.cy.ts` and a nav button. David
had it removed from the app for now (feature work first; the worker pool is a performance worry); the offline twin
`wuwa-tools/matrix-plan/` stays. To bring it back, revert the commit that deleted the folder (`git log --diff-filter=D
-- src/sim/matrix`), re-add the route in `main.ts` and the nav button, and re-point `myBuilds.ts` at
`planMatrix.ts` if the name map ever moves again (`rileyNameOf` now lives in `rankings/castMapper.ts`). Saved plans
in browsers stay under localStorage `wuthering-tools-plus.matrix.*`.

## Phone-screenshot echo import (phase D) — `src/sim/echoScan/`

Batch import of echoes from phone screenshots of the in-game Echo inventory (an echo selected, its detail
panel on the right; one screenshot per echo). Lives in the Inventory › **Import echoes** modal under the PC
parser as "Phone screenshots (batch)"; emits the same `echoes-parsed` event as `CalculatorEchoParser`, so
`CalculatorEchoImporter`'s duplicate review + save flow is reused unchanged.

| File | Role |
|---|---|
| `phoneEchoScan.ts` | pure logic, **geometry first** (2026-09-12): `PHONE_LAYOUTS` (crop boxes + the stat table's geometry measured on a Galaxy S26 Ultra, 3120×1440; same-aspect sizes are scaled), `clusterRows` (the block pass's word boxes → rows: label words left, value column right), `labelKey` (whitespace/punctuation-insensitive stat aliases), `valueCandidates` / `legalValues` / `pickLegal` (a value is accepted only as a legal roll for its label — `subStatsTable`, `statsTable`, the fixed secondary row; "108%" is repaired to 10.8), `scanEcho` (walks the table from the known first-row position: observed rows are re-read from the raw pixels of their own row through a `BoxReader`, a row the block pass dropped is synthesized at its expected position — rows are 60 px apart, +46 after a wrapped label — and read the same way; stops at "Echo Skill"; everything doubtful lands in `flags`), `bestEcho` (drops the "Phantom:" skin prefix, scores every word-prefix of the name strip and the panel's first row, the COST breaks ties) / `bestSet`, `toParsedEcho` (the importer's shape with verbose labels). Twin of `wuwa-tools/echo-import/extract.py`, which reads the 198-shot "Wuwa Echos" album 198/198 |
| `ocr.ts` | tesseract.js worker wrapper: crop → scale → threshold / invert / plain grey / untouched colour → recognise; `recognizeWords` returns word boxes (the block pass), per-call whitelists (digits only for value re-reads) |
| `imageMatch.ts` | promise wrapper over the app's `echoParser.worker` (portrait pixel matching), used only as fallback when the name isn't readable; since 2026-10-31 the worker starts on that first need instead of before every scan, and the set comes from `setGlyph.ts` (see "Set from the icon next to +25" below) |
| `PhoneEchoBatchParser.vue` | the UI: multi-file input, sequential scan with progress, editable results table (echo / set / main / substats), flags per row, "Add N echoes to inventory" |
| `phoneEchoScan.test.ts` + `__fixtures__/s26UltraScanSamples.json` | replay of the word boxes and row re-reads recorded from 75 real screenshots (`wuwa-tools/echo-import/dump_scan_fixture.py`; the Python walk they come from is verified 198/198 by hand-checked records), incl. every shot whose rows had to be synthesized |
| `api/photos-album.ts`, `api/photos-image.ts`, `api/_lib/googlePhotos.ts` (+ `src/server/googlePhotos.test.ts`) | **album import (2026-09-12)**: Vercel functions (served by a Vite middleware in dev, see `vite.config.ts`) that fetch a shared Google Photos album's page and its photos same-origin — the browser cannot read either directly (HTML from another origin; no CORS header on Google's image host). Only `photos.app.goo.gl` / `photos.google.com` links and lh3 `/pw/` ids are accepted. The panel remembers per album (localStorage `wuthering-tools-plus.echoScan.albums`) which photos were added, so a later run fetches and scans only the tail; "Mark all as imported" seeds that for an album whose echoes are already in |
| `cypress/e2e/echoScanAlbum.cy.ts` | the album flow with the API stubbed (real OCR on the fixture photo): load → "1 new" → fetch & scan → add → reload shows "1 already imported · 0 new"; plus the error path |
| `skittle-theme.css` + `controller.ts` — phones (2026-09-12, B2b first cut) | below 768 px Riley's aside (README, standards, team cost, resonator search) becomes a bottom sheet behind a "Filters & options" toolbar button (backdrop / ✕ / Escape close it; the detail page hides the toolbar); desktop unchanged. E2E: `rankings.cy.ts` at 390 × 844. Still his DOM: native Vue table + detail remain the rest of B2b |
| `castMapper.ts` (2026-09-12) | every wuwa_calc cast now maps (was 10 unmatched): casts named after an echo's passive alias to their echo (Core of Collapse → Threnodian Leviathan), a resonator's own cast that wuwa_calc types as an Echo cast falls through to the kit's rows (Lucilla's Forte Echo - Oblivion), an echo with a single damage row matches per-hit without a name resemblance (Hecate = 6 × Crescent Servants — the registry's rank-5 value was corrected to the 45.59 % its own text states), and hand overrides carry kit-folded multipliers into the preset description (Cantarella's Beneath the Sea = Flowing Suffocation × 4.7 from S3; Qingxiao's Heaven's Reckoning × 2.75). Fixture `__fixtures__/wuwaCalcLoops.json` = 43 loops of 16 resonators, regenerated by `wuwa-tools/rotation-port/emit_ts_fixture.py` |
| `cypress/e2e/echoScanBatch.cy.ts` + `cypress/fixtures/echoScan/*.jpg` | real OCR end-to-end on three screenshots — two of one echo plus a Sabercat Prowler whose "8.6%" row block-only OCR used to lose (tesseract language data comes from its CDN, reference portraits from the assets CDN) |

Reading order per screenshot: name (PSM 7) → panel (PSM 6, two passes: binarised ×1.5 and greyscale ×2, rows only
the second pass saw are added and flagged) → Sonata chip (PSM 7, inverted) → if the name is still unknown, the worker
matches the portrait (cost-filtered) → for an echo with more than one set, the set icon next to +25 (`setGlyph.ts`,
among the echo's allowed sets). A Sonata filter is optional since 2026-10-31: with one on, the chip names the set and the
icon cross-checks it.


## Import any rotation from the Rankings page (C4) — `src/sim/rankings/`

Every team the `/rankings` detail page can show — any composition, solver state and pick, including the
compare axes — carries **"Import team into Wuthering Tools+"** in Riley's topbar (next to Back), with a
checkbox to also save each member's steady-state loop to that character's rotations.

| File | Role |
|---|---|
| `castMapper.ts` | TypeScript port of `wuwa-tools/rotation-port/map_rotations.py`: `appRowsOf(getCharByName(...))` / `echoRowsOf(mainEchoesData)` build the app's attack rows with level-10 motion values; `toActions()` maps executed casts through the cascade override → exact MV → aggregate → per-hit → kit ratio → tick → name-only, with `knownRatios()` pooling a kit's folded multipliers; a negative-status tick becomes a `negativeStatus` action at the tick's stack count; Tune Breaks, 0-MV utility casts and cancelled echo forms are skipped and reported. `enemyStacksOf(heldEnemy)` reads the debuff stacks a traced hit ran under and `enemyConfigOf(casts)` the team enemy settings a loop held (both mirrored in Python; the replay fixture checks both) |
| `importFromRankings.ts` | `prepareTeamImport(engine, tracedRun)` — the store-free half: turns a traced run (`runTeam(..., true)`, `hitsOf(line)` casts named through `CAST_NAME` / `NODE_NAME`) into plain data: the last section (the steady-state loop) mapped per member and interleaved in execution order with the main DPS in slot 0, the enemy settings the run held (`enemyConfigOf` over Riley's level 100 / 20 % RES target), each member's own loop, and per member `loopChangesAt` / `nextLoopChange` (`Loadout.rotationAt`). `importTeamFromRankings(mods, rowKey, { characterRotations, replaceTeamId })` is the browser path: resolves the run from the page model, prepares it, writes the stores (the Pinia stores load lazily inside it — a static import would drag lodash into the CLI). `reslotActions` / `toImportedActions` / `toCharacterRotation` are shared with the headless path |
| `syncTeamsHeadless.ts` | **Node-only** (`npm run cli -- sync-teams`): loads the fork's engine from `vendor/wuwa_calc/src` through a `file:` URL (tsx resolves Riley's `.js` imports to `.ts`; vue-tsc never sees his tree), registers the export's Account State, solves every saved wuwa_calc team's composition at `mine`, runs the best row traced and feeds `prepareTeamImport`; returns the new teams (and characters) for `writeSyncedExport` |
| `controller.ts` | `mountImportControls(key)` after every `renderDetail`; `runImport()` → toast with the outcome (`data-test-rankings-import-done` carries the new team id for tests) |
| `castMapper.test.ts` + `__fixtures__/wuwaCalcLoops.json` | the port must reproduce the Python mapper on 33 of Riley's loops (930 casts, 12 resonators incl. ratio-, tick-, per-hit- and override-heavy kits) |

The generated stock presets (`src/sim/presets/`) remain the zero-click path for the best teams; this is the
everything-else path.



**Mapping fix 2026-09-14 (David: "the big attack is counted twice"):** `castMapper.ts` and the Python mapper
matched casts on Riley's *run* motion value (`h.mv`, after MulMv effects such as Aemeath's S3 "Finale multiplier
+100%" or S2 "Duet multiplier +100%"), so an integer multiplier read as extra hits — Finale ×2, the Duets ×2, and
17 characters' stock loops likewise (Camellya's Vining Waltz ×17, Phrolova's Scarlet Coda ×7, Cartethyia's
Liberation ×2 …). `Cast.mv` is now the kit's own `action.mv` (the app applies those multipliers through its own
chains and buffs; `mvRun` keeps the run's value for the record), a kit cast named after a status ("Forte - Seraphic
Duet: Tune Rupture") is no longer dropped as an enemy tick, and Aemeath's Mech chain has overrides for its MV ties.
On David's Mornye · Lynae · Aemeath import the app went 13.66M → 9.85M against Riley's 8.20M (the rest is engine
modelling: static buffs, no status stacks written yet — Phase 2). Regenerate after such a change: the three
`export_rotations.mjs` states → `map_rotations.py` → `emit_app_presets.py` → `emit_ts_fixture.py` (the replay test
compares TS to Python on the same loops, so both mappers move together).

**Audit fixes (2026-09-15, seven agents over the imports on David's export — vault Session Log):** the team paths map
one hit at a time, so a row that stands for N ticks was written once *per tick* (Cantarella's Diffusion ×31, Ciaccona's
Tonic ×30) — `toActions` now takes a shared `TickState` per member and `finishTicks` settles it after the loop.
Aemeath's "Forte - Seraphic Duet: Fusion Burst" (a 0-MV cast: the status at the cap rung × Fusion Trail / Stardust /
S2) was dropped — it is now her `ElementalEffectFusionBurst` at the loop's cap (`fusionBurstCapOf`: 10, or 13 beside
Denia) with the run's multiplier as an action-level `talentModifierMultiply` and her two multiplier buffs switched off
per action (`advancedConfig`), on the status's own tick too. An Electro Flare tick's Rage count is read off the
"Electro Rage - N" tick that follows (`attachRage`; Riley revokes Rage in the hook that fires the Flare). Cascade:
the aggregate rule is name-gated (sim ≥ 0.6), per-hit candidates are ranked (Rebecca's enhanced rows, Buling's two
Talismans), the ratio rule never takes a healing/shield row, and a cast the app splits in two rows (Lioness of Glory
Blast + Crash, Feilian Attack + Whirlwind) presses both (`sum2`); overrides for Jingran's swapped hold MVs and
Danjin's Crimson Erosion typo. Every import also records **`handoffs`** (who each member's Outro hands off to: the
first cast another member *presses* after it, `handoffsOf`) on the team — the team-buff derivation reads it (below).
TS and Python agree on all 1,247 loops of the three states (audit harness), 68 sim tests.

**Sync my teams (Track I phase 2, 2026-09-14):** the bar's **Sync my teams** button re-imports every saved team
whose name marks it as wuwa_calc's (`isGeneratedTeamName`: an import "wuwa_calc …" or a stock preset
"… (wuwa_calc tNNN)") at the account's own state and updates it **in place** — `syncTeams.ts` (`runSync(deps)`:
`rileyTeamKeysFor` finds every loadout variant of the composition, `deps.solveBest` solves them at `mine` and the
best-scoring one wins, `deps.importInto` re-imports it; `diffActions` reports per slot/attack/main-echo/stack-count
moves and `diffEnemy` the enemy-settings fields that moved; a team is "updated" when either did), `controller.ts`
`syncMyTeams()` (the browser deps: `ensureBestPicks` + `bestPicks` with `filters.cost` switched to `mine` only
while solving and importing, restored after — the table on screen is untouched), `importFromRankings.ts`
`replaceTeamId` (actions re-slotted to the saved team's own slot order, enemy = Riley's target **plus the stacks the
run held**, the name follows the new state only while it still reads as generated; a row the table solved but never
ran is run traced on the spot). The report lists per team the moved actions (a tick as "Aero Erosion @9 0→13"), the
enemy settings that moved, and **which member's next sequence switches their loop** ("Denia S0 → S3"). Teams the
player named are left alone and listed as such. On David's export (2026-09-14 evening): 33 teams → 30 updated,
1 unchanged, 2 left alone; 17 teams got enemy settings, 8 carry a loop-change hint. Since 2026-10-31 it asks first
(a confirm naming the teams it will rewrite) and keeps an Undo for the last sync (`syncUndo.ts`, below).

**Headless:** `npm run cli -- sync-teams [--out file] [--dry-run] [--subs standard|high|mine] [--rotations]`
(`syncTeamsHeadless.ts` + `writeSyncedExport` in `cli/exportFile.ts`) does the same from the terminal in ~3 s and
writes a new export next to the source (`<name>_synced.json`; a plain export is never overwritten, a `_synced` file
syncs over itself through a temp file, so the bare command keeps working once the synced copy is the newest
download; `--rotations` replaces a member loop already saved under the same name instead of appending it again) —
Settings › Import replaces the whole app database with it. `wuwa-tools/rotation-port/sync_teams.mjs` is the front
door: it runs the command and prints, per team, Riley's DPR beside the app's own engine before and after
(`cli -- team` on both files).
## "My build" in the Substat Investment compare — `src/sim/rankings/myBuilds.ts`

Riley's Substats compare offers two spreads per resonator: his default (ChemX32) and High Invest. The
plus site adds a third row, **My build**: the substat rolls on the five echoes that character has
equipped in this app's calculator, run through his engine like any other pick.

| Piece | Role |
|---|---|
| `myBuilds.ts` | pure: `buildRollsOf(characters, inventoryEchoes)` resolves each character's `echoes[slot].echoId` against the inventory (`resolveCharacterEchoes`) and turns the five echoes' substats into `{ kind, value }` rolls in his `Substat` names (Healing Bonus has no counterpart and is skipped); `rollsKey()` tells one build from the next |
| `controller.ts` | `mountRankings(host, router, builds)` / `updateMyBuilds(builds)`: registers every build on the page's loadouts (`setMySubstat` + `customSubstats("My build", rolls)`) and posts `{ type: "mySubstats" }` to every solver worker — the worker is what builds the rows, so it has to know too |
| `solver.worker.ts` | intercepts that message ahead of Riley's `onmessage` |
| `RankingsView.vue` | computes the builds from the character + inventory stores and re-registers on change |
| fork `davidbeck45/wuwa_calc` branch `plus` | the engine side: `Loadout.mySubstat/mySubstatKey`, `customSubstats()`, `setMySubstat()`, a third entry in `buildsOf` when the axis is open, `.uKEY` in combo keys, "My build" labels, and the table grouping / twin / baseline rules for the new pick (`page/table.ts`, `rowFromKey` in `page/model.ts`) |

Only resonators with a build in the app get the row (`#r=Cartethyia&cb=Cartethyia` after an import
shows it; Mornye without one does not). The row keys carry the build's hash, so a changed build gets fresh
solves, and a `#team=` link to a stale one falls back to the table. E2E: `cypress/e2e/rankings.cy.ts`.

## My roster rankings (phase E) — `src/sim/myRankings/`

`/my-rankings` (linked from the credit line on `/rankings`, and back): the app's own damage engine ranks the
characters and teams YOU have set up — real weapon, echoes, chains and buffs — the way Riley's table ranks his
solved picks.

| File | Role |
|---|---|
| `rankRoster.ts` | pure/async `rankRoster(characters, echoes, teams, { investment, onProgress })`: for every character with a weapon (`isSetUp`) it scores every saved rotation, curated preset and wuwa_calc preset with `calcCharacterRotationDamage` on the active build and keeps the best; `investment` re-scores the best rotation with the next sequence node's chains on (first entry of a node when it has variants — an estimate) and with the weapon at R5; teams = your teams with actions + wuwa_calc / curated team presets whose three members are set up, through `calcTeamRotationDamage`. Enemy fixed at level 100 / 20 % RES (`RANKING_ENEMY`, Riley's target) so the numbers sit beside `/rankings` |
| `MyRankingsView.vue` | the page: auto-computes on first visit, two tables, empty state, wuwa_calc ⇄ My roster switch — rebuilt 2026-10-12 (fingerprint cache, progressive rows, child components): see "/my-rankings at pro level" at the end |
| `rankRoster.test.ts` + `__fixtures__/cartethyiaAccount.json` | a real exported account (the Cartethyia optimizer fixture) ranks her own, curated and wuwa_calc rotations on her build; unknown ids and weaponless characters are skipped |
| `cypress/e2e/myRankings.cy.ts` | empty state + links, then an imported account ranked in-page |

Metric: average damage per rotation (DPR). DPS appears only when a rotation carries a duration.


## Account State and the "My account" tier — `src/sim/account/` + `/rankings` (Track I, 2026-09-14)

The account-first spine: `accountState.ts` derives one snapshot of the player's account from the
stores (or the export file, on the CLI) — per character `owned` (= a weapon equipped, the bar
my-rankings and Riley's loadouts set), `sequence` (the highest enabled `SequenceNode<N>`, never the
toggle count: a node's sub-toggles once printed Aemeath at "S10"), `weapon` + `refinement`, the active
build, plus teams (`fieldable` = every member set up) and totals. `rileyAccountEntries()` turns it
into what the engine takes; `accountKeyOf()` fingerprints it so a changed account never reads a
stale solve; `rankingsMineHash()` writes the `/rankings` link at the account's own state.

**The `mine` Team Cost** lives on the wuwa_calc fork's `plus` branch (`vendor/wuwa_calc`, beside the
"My build" row): `TEAM_COSTS` gained `"mine"`, `setAccountState(entries, key)` registers the account,
and under `mine` the cost rules read it per member — `costGrant` returns the account's sequence and
weapon rank, `weaponOptions` pins the worn weapon where the loadout lists it (`accountWeapon`; no
weapon set or a resonator the account lacks reads as `s0r1`, a worn weapon the loadout never lists
runs the best standard — `weaponApproximated` says so; **a 4-star or Rover form (`Tier.Free`) counts
as owned even when the account never set it up** — Riley runs them S6 on standard/4-star weapons
throughout, so `accountOf()` synthesises S6 / default weapon at R1 for them, and a set-up one runs
the account's weapon; David's Shorekeeper · Sanhua · Camellya was hidden until this rule, Sanhua
not being in his app data), and `costTag()` suffixes row keys and
shipped-solve signatures with the account key. `precompute.ts` never ships it; the page solves it in
its workers (31 fieldable intended teams in well under a minute on David's export; the same solve is
1.3 s in Node, see `wuwa-tools/rotation-port/solve_mine.mjs`). `page/model.ts` adds `ownedOnly`
(hash `own=0` lifts it): under `mine`, `teamWanted()` drops teams with a resonator the account
lacks, so fewer teams are solved and the table reads as "teams I can field". Riley's Team Cost box
lists "My account" only while an account is registered (`hasAccountState()`).

**App side:** `RankingsView.vue` computes the Account State from the stores and hands it to
`mountRankings(host, router, builds, { entries, key })` / `updateAccountState()` (controller.ts),
which register it on the page and post `{ type: "accountState" }` to every solver worker
(`solver.worker.ts`). `RankingsAccountBar.vue` sits above his page: My account / Riley's tiers (hash
`tc=mine`), the "Teams I can field" box (`own=0`), and **saved views** — named copies of the current
hash in `localStorage["wtplus:rankings:views"]`; every control is a `router.replace` on the hash, so
his page re-reads it through `onLocationChange` like a Back button would. `/my-rankings` shows the
account card and links each character and team row to `/rankings#tc=mine&r=…`.

**One substat spread for every row (David's ask, 2026-09-14 evening):** Riley's Substats compare
opens one resonator's rows side by side (ChemX32 / High Invest / My build). The bar's **Substats**
box instead runs *every* row in one spread — `Filters.subs` (`SUBS_MODES`: `standard` / `high` /
`mine`, hash `sb=h|m`, fork `solver.ts` + `page/model.ts`): a shut Substats box's row takes the
mode's spread in `buildsOf()` (High Invest for everyone; the registered "My build" spread where a
character has echoes in the app and ChemX32 where none), `bestKey()` gains a fourth segment and
`filterSignature()` a suffix on the non-default modes so shipped solves still load for the default
and the rows re-run (never re-search: the best picks come from `picksKey`, which the mode leaves
alone — the same rule as his compare rows). The detail page names the spread per member. On David's
export the top team reads 8.20M (ChemX32) → 9.74M (High Invest) → 9.50M (his own echoes).

Gates: `accountState.test.ts`, the "My account tier" and "one substat spread" describes in
`cypress/e2e/rankings.cy.ts`, `npx tsc -p vendor/wuwa_calc --noEmit` for the engine. CLI:
`npm run cli -- state [--pretty|--riley]` (`--riley` also carries the "My build" rolls, so
`wuwa-tools/rotation-port/solve_mine.mjs --subs high|mine` reproduces the page's three spreads).

## Headless CLI — `src/sim/cli/` (`npm run cli -- <command>`)

The app's own engine from a terminal, for agents and for checking numbers across upstream syncs. The
commands hang off the repo's `ww` program (`cli/index.ts`, two-line hook) and read an **export file** as
their database (`--export <file>`, else `$WUWA_EXPORT`, else the newest `~/Downloads/character_data_*.json`);
nothing is ever written back. Output is JSON when piped, a table on a terminal (`--json` / `--pretty` force).

| Command | What it computes |
|---|---|
| `inspect` | data version, roster (sequence, weapon, builds, rotations), echoes, teams |
| `state` | the Account State (`src/sim/account/`): every character's owned / sequence / weapon / refinement / active build, teams with `fieldable`, totals; `--riley` prints it as wuwa_calc's solver takes it (`{ key, entries }`) |
| `calc <character>` | the calculator page for one character: the 17 stat cards, every attack row (normal / average / crit, healing and shield amounts), each saved rotation with its per-action rows; `--no-attacks`, `--no-rotations`; the name matches loosely (`xuanling`) |
| `team [name\|id\|index]` | `calcTeamRotationDamage` for one team or all of them: totals, per-member, DPS when the team has a duration |
| `rank [--investment]` | `rankRoster` — the `/my-rankings` page headless (best rotation per character, teams, next-S / R5 estimates) |
| `weights <character> [--rotation name] [--team t] [--echoes]` | substat weights (§ below): what one more roll of each substat is worth on the build, scored on the best rotation as `/my-rankings` picks it (or a named one, or a team's rotation with the buffs derived from its real members — the character's share drives the weights, the team total rides along); `--echoes` adds what each equipped echo's substats are worth |
| `sync-teams [-o file] [--dry-run] [--subs mode] [--rotations]` | "Sync my teams" headless (§ C4): every wuwa_calc team re-imported at the account's own state — actions, per-tick negative-status stacks, enemy settings and handoffs from the run — written to a new export (`<source>_synced.json` by default; a plain export is never overwritten), with the per-team report; `--rotations` also saves each member's loop to that character's rotations (replacing one of the same name) |
| `team <one> --json` | also lists `actionRows`: every action's own normal / average / crit damage in execution order (what the audit compared against Riley's per-cast averages) |
| `snapshot [-o file]` | every character's stats + saved rotations and every team, as JSON (stamps the app commit) |
| `diff <before> <after> [--tolerance pct]` | every number that moved between two snapshots; exit code 2 when something did |

| File | Role |
|---|---|
| `engine.ts` | pure wrappers over `buildCharacterCalculationContext` + `calcDamages`, `calcCharacterRotationDamage`, `calcTeamRotationDamage`, `rankRoster`; `STAT_ROWS` = the page's stat cards with their Cypress selectors; snapshot + diff |
| `exportFile.ts` | newest-export discovery and the double-encoded export parse (v1 bare payload through v9); `readExport` runs `migrateExport` first — every migration newer than the file's `meta.version` over each store (`applyMigrationTransforms`, as Settings › Import does), since the pages read migrated localStorage (2026-10-31: a v9 file lost Cartethyia's and Rover Aero's renamed buffs, `rank` read 2–3.5 % low); `exportMigrate.test.ts` checks the engine end to end on the public Cartethyia fixture (the enabled Bell-Borne buff counts) |
| `index.ts` | the Commander commands and printers; engine calls run under `quiet()` because `attacks.ts` still has a stray `console.log` in a hot path (`WUWA_CLI_DEBUG=1` routes it to stderr) |
| `parity.test.ts` | **the gate**: replays every Cypress golden fixture (`cypress/e2e/calculator/data/<Name>/data.ts`, 11 characters) through `calcCharacter` and demands the page's exact formatted stats and attack rows — same semantics as the E2E specs (a class shared by several rows passes when any row carries the numbers) |
| `cli.test.ts` | export parsing, newest-file pick, name resolution, snapshot diff |

`src/sim/presets/index.ts` gained a Node fallback for `import.meta.glob` (reads the generated JSON from disk)
so `rank` works under plain tsx. Regression routine: `~/Projects/wuwa-tools/scripts/sync-plus.sh` snapshots
before the upstream merge and diffs after the gates (`snapshots/<sha>.json` in wuwa-tools); moved numbers
withhold `--push`. Not built: `optimize` (the workers expose nothing but `onmessage`) — only if a need appears.


## Substat weights — `src/sim/substats/` (2026-09-15)

"Which substat should I be looking for as I roll echoes, and how much is it worth?" — answered by the
engine on the build as it is: the rotation is scored once, then once more with a single extra roll of
each of the 13 substats, and the relative gain is the weight. Four sizes of "one roll" per substat since
2026-09-18: the expected roll, the median tier, the best tier and one tier step (David: "44 flat ATK is
not a roll the game can give, and what is one tier more of Crit Rate worth?"). `substatWeights.ts` is pure (no Vue, no
stores; the app's own `calcCharacterRotationDamage` path) and reused by the `/my-rankings` **substats**
panel (beside "what if…", scored on the same best rotation, runs on open) and by `ww weights`.

| Piece | What it does |
|---|---|
| `withSubstat(id, characters, echoes, key, value)` | a clone with `value` more of `key` **on an equipped echo**, so the roll goes through `getEchoStats` like a real one (per-action `excludeEchoes`, HP/DEF scalers, the crit cap all behave) — no engine change. Placement: an existing line of the same kind is bumped → a free substat field takes it → an empty slot gets an inline substat-only record → every field held another kind, so a duplicated kind gives up one line and its value moves onto its twin (`placement.moved`; 25 lines over 13 kinds always hold a twin). The store record is never touched: inventory echoes are cloned in the inventory, legacy inline slots on a cloned character record |
| `expectedRoll` / `medianRoll` / `maxRoll` / `tierStep` | the tiers are the app's `subStatsTable`; the expectation weights each tier by how often it lands — Kuro's KR product info as `vendor/wuwa_calc/src/shared/substats.ts` carries it (`[7, 8, 21, 25, 18, 15, 6, 3]` for the percent-shaped stats and flat HP, `[70, 70, 70, 24, 24, 24, 9, 9]` for crit, the flat ATK/DEF pairs); copied here because he does not export them. Crit Rate expects 7.5, Crit DMG 15.1, ATK % 8.8, flat ATK 44. The median is the first tier where the cumulative odds reach one half — always a real tier: crit's third (7.5 / 15.0), the spread's fourth (ATK % 8.6, flat HP 430), the flat pairs' second (ATK 40, DEF 50). The step is `(max − min) / (tiers − 1)`: Crit Rate 0.6, Crit DMG 1.2, flat ATK/DEF 10, the unevenly spaced ATK % table 0.74 |
| `substatWeights(id, characters, echoes, scorer)` | four rolls per substat — expected (`roll`/`gain`), median (`medianRoll`/`medianGain`), best (`maxRoll`/`maxGain`), one tier step (`step`/`stepGain`), each with its `…AvgDamage` — against a pluggable `BuildScorer` (`{ avg, extra? }` — the CLI's team scorer puts the team total in `extra.team`, reported as `extraGain.team` for the expected roll); sorted by the expected gain best first, `weight` = expected gain ÷ the best one, `perPoint` = gain per 1 % / 1 flat point. 4 × 13 + 1 scorings, half a second on a rotation |
| `equippedSubstatWorth(...)` | each equipped echo scored with its five substats blanked (main stat and set kept): `worth` = what they add — the lowest is the echo to re-roll first |
| `substatWeights.test.ts` | on the Cartethyia fixture: every roll moves the combined echo stats by exactly that roll and nothing else (all four placements), inputs untouched, an HP scaler weights crit and HP and not ATK, the four gains ordered step ≤ median ≤ expected ≤ best, sorted; every median is in the table; gates on the page: `myRankings.cy.ts` + `phoneLayout.cy.ts` |

What the numbers mean: a **weight** of 100 is the substat to look for; the **expected roll** column is
what a random line of that kind pays on average, the **median roll** what the middle tier pays (a tier
the game can show, where the expectation of a skewed table need not be), the **best roll** its ceiling,
and **+1 tier** what an existing line gains from rolling one tier higher (the gap between two echoes whose
lines differ by one tier; two decimals on the page, the gains sit an order below a whole roll's). The
panel carries a collapsed "How to read these numbers" list saying the same, with the examples computed
from the tables. Diminishing returns are real, not modelled: Xuanling at 96 % Crit Rate gets the same +2.5 % from a 7.5 and a 10.5 roll (the cap),
so Crit DMG outranks it there while at 76 % Crit Rate leads. Known limits: the engine is static, so
**Energy Regen reads 0** unless a buff scales with it (Brant, Sigrika show it) — keep the ER a rotation
needs; a buff is on for the whole rotation or off (no uptime); healing/shield scalers are scored on damage
only. The panel switches to short labels below 768 px and lays each substat out as a wrapping line (name ·
expected → gain · bar; median, best and +1 tier underneath in small print, prefixed) — the grid's rows and
the `.subs__more` group are `display: contents` wrappers.

## Team-aware buffs and builds — `src/sim/teamContext/`

**Three rules added 2026-09-15 (the audit found every one over-buffing a support):** a provider with Resonance Modes
(Aemeath, Denia, Lucilla, Lynae) brings only the mode they are in — a buff bound to another mode by its `stance` or its
key suffix (`…FusionBurst`, `…TuneStrain2`, `…Shifting`) is skipped; a buff worded for "the incoming Resonator" / "the
next character" (41 of 183 definitions, `INCOMING_RE`) is an Outro handoff and reaches only the character who follows
the provider — read off the team's recorded `handoffs` (a wuwa_calc import writes them; the block order of the actions
stands in for a hand-built team, and a team with no actions keeps the old everyone-gets-it rule); a sequence-node buff
is recognised by "Sequence Node N:" or "SN:" in its name (Suisui's "S2: Clouds Pour…" +50 % Crit DMG leaked at S0).
`slots[].skipped` says which rule dropped what. On David's 31 synced teams the median app/Riley ratio went to 0.96.


Upstream computes each team slot from that character's stored build **including the Team Buffs panel
saved on the Calculator page** — two teammates picked there, which need not be the team's real members
(David's Aemeath panel named Mornye + Lynae; every Aemeath team inherited those buffs). `resolveTeam.ts`
rewrites the members for the team they are actually in, before the engine runs:

| Rule | Detail |
|---|---|
| Build per slot | explicit pin → a saved build whose name mentions both teammates in any order (`"Moonlit (Lupa + Galbrena)"`, `"Moonlit Chisa (Yangyang Suisui)"`: the key, the roster name, or any 4+-letter word of the key; case and punctuation ignored; only when the character has more than one build) → the active build. Pins are baked into the returned `characters`, so pass the returned `buildIds` (all null) to the engine |
| Panel kept | a member whose own panel already names exactly the team's other members keeps it verbatim (the user curated it) |
| Otherwise derived | from what each teammate's build really provides: outro / inherent / skill team buffs; **sequence-node buffs only when that node is on their build** (key match on their `resonanceChains`, else "Sequence Node N" ≤ their node count); the weapon's team buff only if they hold that weapon (matched by the buff's image basename); 5-piece set buffs only with 5 of that set equipped; main-echo buffs only with that main echo; stacks at `realisticMaxStacks` under the chain-adjusted cap; `inputBase` buffs (Shorekeeper's Energy Regen, Crit-Rate-scaled ones) fed from the teammate's **real** `finalStats` instead of a typed guess |
| Teammate with no build | still a teammate: outro / inherent buffs provided, sequence nodes assumed **S6 for a 4-star, S0 for a 5-star**, nothing gear-based, `realisticBaseAttrValue` for stat-scaled buffs |
| Still yours | per-action advanced overrides and the exclude-team-buffs flags apply on top inside the engine; `auto: false` is a strict passthrough of upstream behaviour |

Switch: `autoTeamBuffs.ts` (`localStorage["wtplus:teamBuffs:auto"]`, default on, **off under Cypress** so
upstream's E2E numbers hold) with `AutoTeamBuffsToggle.vue` in the Team Rotations editor header and on
`/my-rankings`. Hooks: `TeamRotations.vue` (list totals + fingerprint), `TeamRotationTeamEditor.vue`
(`recompute()`, the per-slot snapshot the action editor shows), `TeamRotationSummary.vue` (`recompute()`, the team's
Summary page — its totals, slot stats and weapon cards; added 2026-10-31, see "Wiring the pages together"),
`rankRoster.ts` (`autoTeamBuffs` option),
CLI `team` / `rank` / `snapshot` (`--no-auto-buffs`; `team <one>` prints each slot's build and buff source,
plus the buffs a teammate does *not* own yet). Still static: the engine has no uptime — a buff is on for the
whole rotation or off; Riley's engine is the one that plays the timeline. Tests: `resolveTeam.test.ts`
(real Augusta / Iuno / Shorekeeper / Sanhua data).

## Accuracy fixes and write-path tests — track "fixes" (2026-10-12)

Seven small items from the audit, each checked against a second source before any number moved. Snapshot gate on both
exports (`cli snapshot` before / after, `cli diff`): only the four teams with Aemeath moved, all downwards, and only
through the Silent Protection rule below. Re-run on 2026-10-26 after the rebase onto the synced `plus` (Ryan #615–#672,
Riley 7bcbb24): the same team totals moved by the same amounts (nine values on 9-14, three on 9-16), and nothing else.

| Piece | Change |
|---|---|
| `teamContext/resolveTeam.ts` `addOnStatus()` | A mode's add-on tier is a buff key ending in the mode's name plus `Appliers` / `Shifting` (Aemeath's `SilentProtectionTuneRuptureShifting`, `SilentProtectionFusionBurstAppliers`: "increased to 20% for Resonators who inflict Tune Rupture - Shifting / Fusion Burst"). It now goes only to a receiver who is in that status mode themselves. Everyone else gets the base 10%, and `slots[].skipped` says why. Tests: the last `describe` in `resolveTeam.test.ts` |
| `weapons/ownedWeaponCandidate.ts` + one hook in `WorkspaceWeaponPanel.vue` (upstream) | "Recommended for <character>" scores a weapon the character has saved settings for at the saved refinement and level, not R1. The equipped row is not scored at all: it shows a ghost **Baseline** badge, because every delta is measured against it. David's R5 Everbright Polestar used to read −23.4 % against itself |
| `WorkspaceBuildMeta.vue` (upstream, v3 header chip) | Shows the registry display name ("Everbright Polestar R5"), not the key |
| `src/echoes/index.ts` Capitaneus ×2 (upstream data) | The rank-5 MV was `118.00% + 59.50%*4` and is now `118.80% + 59.40%*4`. Three sources agree: the entry's own description, Riley's `ACTION_CAPITANEUS` (`mv: 11880 + 5940 * 4`), and the tier progression (+13.2 / +6.6 per rank). Rank 3 also lost a stray `%%`. The Zani golden fixture (`cypress/e2e/calculator/data/Zani/data.ts`) moved with it: Capitaneus 28055 → 28086 and the optimizer totals 1761718 → 1761746 / 5905278 → 5905371. Those values were generated by the app, so they were regressions of the typo, not in-game measurements |
| `src/calculator/attacks.ts` | Removed the hot-path `console.log` on Glacio Chafe rows |
| `TeamRotationSummaryHeader.vue`, `TeamRotations.vue`, `TeamRotationDamageChart.vue` (upstream) | Team totals, leaderboard cards and the per-character legend under the damage doughnut print `displayDamage(x).toLocaleString()`, as the Summary page and the editor's per-action values already did. The editor header's DPS is now "DPS (avg)", in both its full and its scrolled (stuck) form, the basis the list sorts by (it used to show Normal); since Ryan #681 it reads his `headline` (typed duration, else frame data while the Labs frame-timing flag is on, suffixed " (frame data)") and plus only swaps `.normal` for `.avg` plus the separators. `displayDamage()` itself is unchanged, because the calculator goldens assert raw digits. The damages drawer is also unchanged: its action table is the calculator's `CalculatorDamage` |
| `phone.css` § 9 (verify pass, 2026-10-26) | Two phone overflows on the Team Rotations editor at 412 px / 130 %. The stuck header's "Normal / Average / Crit" run is `shrink-0`, about 520 px wide: it may now wrap. The "Damage by action" strip (upstream, in the editor and in `CalculatorRotation.vue`) gave each bar a 0.5 rem minimum plus a 0.375 rem gap: 40 actions came to about 720 px and stretched the page to 761 px, which pushed the nav's utility menu off screen. On a phone the bars and gaps go down to 2 px, and a longer rotation scrolls inside the strip |
| `rankings/syncWritePath.test.ts`, `cli/exportFile.test.ts` | First tests of the Sync-my-teams write path. `runSync` (stubbed `solveBest` / `importInto`) covers the best variant, the deltas, every status, and one deduplicated solve. `prepareTeamImport` runs on a traced run rebuilt from `__fixtures__/wuwaCalcLoops.json`; its per-member rows equal the Python-verified `expected`, along with the enemy settings, handoffs, rotation time, name, hidden characters and `reslotActions`. `writeSyncedExport` refuses to overwrite its source however the path is spelled, uses `allowSelf` through a temp file that leaves nothing behind, keeps double-encoded stores double-encoded and object stores as objects, and round-trips through `parseExport` |

Things learned:
- **Who inflicts a status is a kit fact, not a rotation fact here.** The task suggested reading inflictors off a wuwa_calc
  team's `negativeStatus` rows. They can't say it: Riley calculates a Fusion Burst tick on whoever is on field
  (`queueOn(team.slot.resonator, …)`), and a Tune Rupture - Shifting is no damage row at all. None of David's Aemeath
  teams has such a row anyway. A status is laid by the kits whose Resonance Mode carries its name: Shifting by Aemeath and
  Lynae in Tune Rupture (`applyRupture()`), Fusion Burst by Aemeath and Denia in Fusion Burst (`applyEnemy(FUSION_BURST)`).
  The app's kit text says the same. So a hand-built team gets exactly Riley's rule, and a team with neither kit keeps the
  base tier.
- Aemeath's mode is still per character, not per team. Her stored stance is Tune Rupture, so in the Denia teams the app
  runs her Rupture Outro and Denia gets the base 10%. Riley's t307 / t311 are `[[SUISUI, CHISA], [DENIA_BURST],
  AEMEATH_BURST]` (vendor/wuwa_calc `src/teams.ts`): Aemeath in Fusion Burst, so he gives Denia 20% and Chisa / Suisui
  10%. Before this fix the app gave all three 20%. Denia's total matched Riley's, but only because she got the wrong tier.
  Now Chisa and Suisui match him and Denia is 10% short. Aemeath's own damage in those two teams is also computed in Tune
  Rupture, which is the larger gap. A per-team mode would close both: an Aemeath build saved in Fusion Burst and pinned to
  the slot already does it by hand, and the wuwa_calc import could pin one.
- The rail's other weapons stay at R1 unless the character has settings saved for them. `characters[id].weapons` is the
  only "owned" signal the app has.
- Moved numbers (auto team buffs; per slot avg, the snapshot's team totals in brackets). Each moved slot lost exactly the
  10% add-on: ×(1+A+0.1)/(1+A+0.2), where A is the slot's other amplification.
  9-14: t307 Chisa / Denia −8.33 % each (team avg 7,318,029 → 7,268,360); t311 Suisui / Denia −6.90 % (8,952,179 →
  8,921,955); Aemeath + Mornye + Lynae: Mornye −4.42 % (13,277,127 → 13,268,722). 9-16 synced: Mornye −6.04 %
  (9,466,750 → 9,458,277). Aemeath and Lynae unchanged in every team: Aemeath never receives her own Outro, and Lynae lays
  Shifting.
- The team **Summary** page (`TeamRotationSummary.vue`, upstream) still calls `calcTeamRotationDamage` on the stored
  team buffs, without `resolveTeamCharacters`. Its totals are not the editor's or the list's: on the 9-16 Aemeath team it
  shows 9,487,580 average against 9,458,278, and none of the Silent Protection fix reaches it. This was already so
  before this track. The fix is a hook like the editor's (`TeamRotationTeamEditor.vue` `recompute()`).
- `syncWritePath.test.ts` reads its expected status names off the fixture rather than listing them. The fixture is
  regenerated whenever Riley's engine moves (cbe1795d added an "Aero Erosion - 8 Stacks" tick to the Cartethyia loop).
  The team description says "team DPS", since Riley's totals are DPS from 7bcbb24 onwards.

## /my-rankings at pro level, the rankings hub and shared names (Track "account" stage 1, 2026-10-12)

The UI audit (2026-10-12) found the most useful plus data in the plainest page: 110 px rows of wrapped wuwa_calc
names, registry keys for weapons ("EverbrightPolestar") and Rover ("RoverAeroFemale"), three stacked text buttons per
row, a paragraph and a text strip before any data on a phone, and a cache that served stale numbers after an echo
edit. This pass rebuilt the page on shared pieces stage 2 (`/account`) reuses.

| Piece | Role |
|---|---|
| `presets/presetName.ts` | `parsePresetName(name, { owned })` — one reader for every name the generators write (stock presets "Aemeath S6 Everbright Polestar R5 · Mornye + Lynae · S6R5 (wuwa_calc)", imports "Sigrika S6R2 Solsworn Ciphers R2 · Mornye + Lucilla · S6R2 DPS · S1R1/S0R1 team (wuwa_calc)", imported teams "wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae", old stock teams "Chisa + Denia + Aemeath · S6R5 (wuwa_calc t307)", "… @ my account (…)") into `{ title, chips, main/mainKey, teammates/teammateKeys, teamLabel, weapon, full }`. Chips: `own` (the rotation's own S/R), `dps` / `team` (only when the tiers differ), `tier`, `mode` ("My account"), `extra` ("Moonlit Clouds 5pc"), `preset` (t307). A name the player typed comes back as its own title, `generated: false`. Riley names map through castMapper's `appKeyOf`; a Rover form resolves to the gender the account holds (`owned`) |
| `presets/presetName.test.ts` | every rotation and team name in `data/` (no crash, short title without state tags, members = the preset's own `characterIds`), the import / sync / old-stock / "@ my account" shapes, the player's own names |
| `display/names.ts` | `characterDisplayName` (the roster label, Rover forms written alike — "Rover Electro (Female)", not the roster's "RoverElectroFemale"), `characterShortName`, `characterMeta` (element, rarity), `isRosterCharacter` (portraits only for keys the pickers offer — stock presets name Lily, a wuwa_calc kit the app has no folder for; until Ryan's #655 Suoming was the case, her folder loaded but her roster entry commented out), `weaponDisplayName` / `weaponMeta` / `weaponIconUrl` (the asset host upstream's pickers inline as `WEAPON_IMAGE_BASE`; there is no exported helper upstream), `ELEMENT_COLORS`, `rarityColor` |
| `display/CharacterAvatar.vue`, `WeaponIcon.vue`, `PresetNameLabel.vue` | the atoms: round portrait with element dot / colour ring (initials for unknown keys), weapon art on a rarity tile, a generated name as title + chips (`hide-main` draws "with A + B" and the teammates' mini portraits; the full stored name is the tooltip) |
| `myRankings/rankingCache.ts` | **the accuracy fix**: `rankingFingerprint()` = cyrb53 over the key-sorted JSON (`stableStringify`) of characters + inventory echoes + teams, plus the two options; the last ranking is kept in module memory and in sessionStorage `wtplus:myRankings:last` keyed by it, so a reload is instant and any edit (one substat digit, same JSON length — what the old length fingerprint missed) re-scores. `RANKING_CACHE_VERSION` invalidates old entries when the shape or scoring changes |
| `myRankings/rankRoster.ts` | `onProgress(done, total, label, finished?)` hands over each finished `CharacterRank` / `TeamRank` (`RankProgressItem`) — the same objects as the final result's; names via `characterDisplayName`; what-if labels name the weapon. Numbers unchanged (CLI `snapshot` diff empty, `rank --investment` identical bar the Rover label) |
| `myRankings/rows.ts` | pure row models: `upgradeOf` (the larger of next-S / R5, the other for a second line, `maxed` at S6 R5), `sortCharacters` / `damageRanks` (the # column stays the damage rank whatever the sort), `dedupeTeams` (same members + same damage to the unit → one row, your own team in front, "+1 identical preset"), `memberShares` (contribution order, the team editor's `utils/chartColors` palette) |
| `myRankings/MyRankingsView.vue` | orchestrator: cache → else score; progressive run into a `shallowRef` of live rows; options persisted in `localStorage["wtplus:myRankings:prefs"]` (upgrade estimates, sort); toggling an option re-reads the cache or re-scores (a toggle mid-run queues one more run) |
| `MyRankingsKpis.vue` · `MyRankingsToolbar.vue` · `MyRankingsInfo.vue` · `MyRankingsEmpty.vue` | KPI tiles from the Account State (set up, S6, echoes equipped, teams fieldable with the `#tc=mine` link, Data: Live / Scoring n / N); the controls inline on desktop, one **Options** bottom sheet on a phone (sort, both switches, the mine link, Recompute); the methodology behind an (i) popover; three CTA cards when nothing is set up (Settings import, Inventory phone-screenshot import, calculator) |
| `MyRankingsCharacters.vue` | ~56 px rows (40 px portrait + element dot, S/R pills gold when maxed, weapon art + name, best rotation as `PresetNameLabel`, damage + bar, Best upgrade or a "maxed" seal), sortable Character / Avg DMG / Best upgrade headers (`aria-sort`), skeleton rows while scoring; a row (or its chevron) opens tabs **What if · Substats · Rotations · Rankings ↗** |
| `MyRankingsWhatIf.vue` · `MyRankingsSubstats.vue` · `MyRankingsRotations.vue` · `panelState.ts` | the tab panels (what-if with quick "S+1 / R5 / S6 R5" buttons; the substat weights panel moved verbatim; every rotation tried with its share of the best); their state lives in a WeakMap per `CharacterRank` object, so closing a row keeps its result and a new ranking starts clean |
| `MyRankingsTeams.vue` | three portraits side by side ringed in their bar colour, title + chips, one bar split by member share on a full-width track, All / Yours / Presets filter, top 10 then "Show all" |
| `nav/PlusNavMenu.vue` + `Nav.vue` (upstream, one hook line + import) | the bar-chart icon is now the **rankings hub**: a menu of `PLUS_PAGES` (`shell/plusPages.ts`, read-only) with icon, title and description; `curPage` marks the page (`MyRankingsView` passes `my-rankings`), the summary keeps `data-test-nav-rankings` and its 40 px basis; a full-width sheet under the bar below `sm`. Since the 2026-10-26 rebase Nav.vue is Ryan's new nav (his focus-driven utility menu, whose "Switch to classic UI" works) with only the `<PlusNavMenu :cur-page>` hook and its import; the hub still fits the pinned 80 px bar and phone.css § 11 (sheet at `top: 80px`, `phoneLayout.cy.ts` nav check). **v3 nav (Ryan #668, 2026-10-29):** the default UI is his side rail (desktop) / header + bottom bar (phones, < 1024 px), so `PlusNavMenu` takes a `variant` — `bar` (classic), `rail` (a "Tools+" rail item, the menu opens beside the rail in two columns) or `header` (the bar-chart icon at the right end of his phone header, the menu a sheet under it; his bottom bar keeps its five columns, which already truncate at 130 % text); one mount line each in `NavRail.vue` / `NavPhoneHeader.vue`, the Ask button sits `--nav-bottom-h` higher, and `navSections.ts pageLabel()` falls back to the `PLUS_PAGES` title for the phone header. Every offset reads `--nav-h` / `--nav-rail-w` / `--nav-bottom-h`, never 80 px; the menu caps at the viewport and scrolls inside |
| `main.ts` (upstream) | the plus `/optimizer` redirect was dropped on the 2026-10-26 rebase: upstream redirects it to `/` itself |

Things learned:
- Vue scoped CSS: `:global(X) .y` compiles to a **global `X` rule** and drops `.y` — `:global([data-theme-style="dark"]) .pill { color }`
  turned every text on the page gold. Prefix with `:root[data-theme-style="dark"] .pill` instead (the scope attribute lands on `.pill`).
- `style.css` paints every `.navbar svg path` black with `!important` on light themes (upstream's filled nav icons); an outline icon
  inside the nav needs a more specific `!important` override (`PlusNavMenu.vue`).
- Phone card rows (`phone-tables.css`): a cell with `flex-basis: 0` lets the next line's cells climb onto the first line. Give the
  first line's growing cell a real basis and the second line's first cell a basis too wide to share the first line
  (`calc(100% - …)`); raise specificity over `.mr-row > td { padding: 0 }` when a phone cell needs padding.
- The old stock team names list Riley's slot order ("Hiyuki + Carlotta + Lucilla"), which does not mark the main DPS — the parser
  gives no `main` for that shape rather than guess.
- shot.mjs `--theme` is overwritten by a seed file's `settings` key: make a light copy of the seed for light shots.
- At 360 px / 130 % every route scrolls to 376 px (hidden subnav / modal backdrops, upstream `/teams` alike) — not this page's.

Gates: `presetName.test.ts`, `rankingCache.test.ts`, `rows.test.ts`, `display/names.test.ts`, `rankRoster.test.ts` (progressive
hand-over, Rover label); `cypress/e2e/myRankings.cy.ts` (empty CTAs + hub, tabs, reload served from the cache, a substat
edit re-scores), `phoneLayout.cy.ts` (rows open before their tabs), `rankings.cy.ts` (the hub replaces the direct link),
`themes.cy.ts`.

## "My account" — the account dashboard, `/account` (Track "account" stage 2, 2026-10-26)

The plus landing page (first entry of the nav hub, `shell/plusPages.ts`): an Akasha / Enka-style profile of the account
in this browser, built from the pieces stage 1 made shared (presetName, the display atoms, the ranking cache). Lazy route
in `main.ts`; v3 and classic alike; the tab title through `useDocumentTitle`.

| Piece | Role |
|---|---|
| `account/AccountView.vue` | orchestrator: header (title, "Live · this browser" data chip, Account / Roster rankings / Team rankings switch, Recompute), hero, then a grid — roster beside a 25 rem rail (invest, teams) from 1280 px, one column (invest, roster, teams) below; the character drawer; prefs in `localStorage["wtplus:account:prefs"]` (filters, sort, invest order); empty state = `MyRankingsEmpty` (now with `title` / `text` props) |
| `account/useAccountData.ts` | the data: Account State from the stores; the roster ranking from the **same cache entry as /my-rankings** (`rankingFingerprint` with `investment: true`, the my-rankings default), else a progressive `rankRoster` run; then the investment plan (its own cache, same fingerprint). Generation counter: a late callback of an older run is ignored; the plan is cancelled on unmount / a new run |
| `account/accountView.ts` | pure view model: `rosterCards` (one per character the calculator knows — status built / echoes missing / no echoes / no weapon, upstream's Build Score, best rotation + damage rank, headline investment, fieldable teams), `filterCards` (element, built / needs work, set up / everyone), `sortCards` (damage, sequence, Build Score, name; set-up characters first), `accountKpis`, `fieldableTeams` (every member armed, `dedupeTeams`), `headlineUpgrade`, `readAccountPrefs` |
| `account/buildScore.ts` | upstream's **Build Score** (`composables/useTeamSubstatScoreRollup.ts`: average `getSubstatScoreGrade` over the equipped slots on the character's curated-plus-override weights) over plain data — the same grade as the calculator's echo panel, without a Pinia instance per card |
| `account/investPlan.ts` | **"What to invest in next"**: per set-up character, on the best rotation the ranking picked — next sequence (`withNextSequence`, the build my-rankings' "Next S" scores), the worn weapon one refinement up and at R5, the best weapon of their type that **someone on the account wears** (no weapon inventory exists) at that copy's refinement, one more expected roll of the substat that pays most (substatWeights' best line, expected roll only). Each is also re-scored on the character's **strongest fieldable team** through the rankings' own scorer (`scoreTeamCandidate`: `resolveTeamCharacters` → `calcTeamRotationDamage`), so a support's new node or a weapon's team buff counts — unless a teammate's own team-buff panel already names this team (resolveTeam keeps a matching panel's ticked buffs as set: a newly unlocked buff counts once ticked; the help says so). Time-sliced (a frame every ~12 ms of engine work), cancellable, progressive |
| `account/investCache.ts` | the plan by ranking fingerprint: module memory + `sessionStorage["wtplus:account:invest"]`; a cancelled plan is never kept |
| `AccountHero.vue` | the strongest fieldable team as the page's one hero figure (portraits ringed in their share colour, damage per rotation and DPS, a share bar with direct labels, the team on `/rankings` at the account via `rankingsMineHash`), six KPI tiles (set up, S6, R5, echoes, teams you can field, average Build Score) |
| `AccountRoster.vue` · `AccountCharacterCard.vue` | the grid (auto-fill 15 rem cards; two a row on a phone, one below 380 px) with element / build / owned filters (counts per choice) and a sort; a card = portrait (rarity ring, element dot), element · weapon type, S/R pills + weapon art, Build Score grade, best rotation damage with a bar against the roster's strongest, the headline investment (team gain when the character can field a team) and the teams they are in |
| `AccountInvest.vue` | the list, by **team** gain (default — a support's own damage says little) or own; kind chips; the rows without a team figure fold under a divider in team mode; a row opens the drawer; "How these are scored" disclosure |
| `AccountTeams.vue` | teams you can field: three portraits, damage / DPS, a bar split by member share, "+n identical", the team at my account |
| `AccountCharacterDrawer.vue` | a native modal `<dialog>` (focus kept inside, Escape / backdrop close; right sheet on desktop, bottom sheet on a phone): numbers, best rotation, the character's investments with own and team gains (or why there is no team figure), teams, and **Open in calculator** (`setActiveCharacter` + `/`), **Substats & what-if** (`/my-rankings?focus=<id>&tab=substats` — `MyRankingsView` reads the query, `MyRankingsCharacters` opens that row's tab once scored and scrolls to it), **Rankings at my account** |
| `myRankings/rankRoster.ts` | refactor only: `teamCandidatesOf` / `scoreTeamCandidate` exported (rankRoster runs through them), `withNextSequence` / `withRefineFive` exported. `rank --investment` output byte-identical, snapshot diff empty |

Rules:
- **Team figures are exact or absent.** The upgrade is scored on the active build; when the strongest team picks another
  saved build of the character (a pin, or a build named after the teammates), the team figure is left out with that reason,
  and a weapon swap taking the weapon off a teammate in the same team says so.
- Numbers are this app's engine, average damage per rotation at enemy level 100 / 20 % RES (my-rankings' target) — never
  Riley's DPS. A team's DPS shows only when its rotation carries a duration.
- A gain is not a price: the list mixes a character copy, a weapon copy and a tuner roll on purpose and says so in the help.

Things learned:
- DaisyUI owns `.hero` (a one-cell grid that stacks every child): a scoped `.hero` class put the hero card on top of the KPI
  tiles. Prefix plus classes (`acc-hero`) when the name could be a DaisyUI component (`hero`, `stat`, `drawer`, `card`…).
- On David's account a healer's weapon swap reads +58 % on her own rotation and +0.3 % on her team, and a support's swap can
  be +9 % own and −10 % team (losing Variation's team buff) — why the default order and the card headline are by team gain.
- Cypress's Electron reports an animating top-layer `<dialog>` at opacity 0: assert `open` and the content's geometry.
- Upstream tints the element set icons with `.<element>--active` (style.css filters); the raw images are white and vanish on
  light themes.
- First visit with no cache, dev build, David's export: ranking ≈ 1 s after load, the full plan ≈ 4.5 s more, longest main-thread
  stall 47 ms.

Gates: `account/accountView.test.ts` (cards, filters, sorts, KPIs, prefs, Build Score = upstream's rollup), `account/investPlan.test.ts`
(the Cartethyia fixture + armed teammates: sequence and R5 gains equal rankRoster's, the roll equals substatWeights' top line,
weapons only when worn by someone, team re-score exact, another-build skip, cancel, cache); `cypress/e2e/account.cy.ts` (empty
state + hub, KPIs, card, invest rows best first, filters, drawer → Substats tab → back from the cache → calculator, phone 412 / 360
at 130 %); `phoneLayout.cy.ts` checks `/account` with the other routes.

Verify pass (2026-10-26, fresh eyes before the merge):
- The wip commit carried the 2026-10-12 `vendor/wuwa_calc` pointer (e1181a9) and its `skittle.css` header back over plus's
  653fee7 (Riley 7bcbb24): the worktree's submodule now sits at plus's commit and `skittle.css` is plus's file again, so the
  track's diff no longer touches either. Every gate below ran on 653fee7.
- `/my-rankings?focus=<id>` on a tab with no cached ranking scrolled to the row as soon as it was scored (ids are scored A–Z,
  shown by damage), and rows scored later pushed it down, under the fixed 80 px navbar. The row's tab still opens at once;
  the scroll waits for the last character (`pending === 0`) and stops 96 px short of the row.
- The drawer's actions are pinned to the bottom of the sheet (the dialog scrolls), in two rows: the calculator full width,
  then Substats and Team rankings side by side. Its team rows carry source / tier chips, because two teams of the same three
  (yours vs a preset, S6R5 vs S0R1) had identical titles. The card headline names an echo step "Crit DMG roll +2.9 %", so the
  figure is not read as the roll's size.
- A ranking run that outlives the page (rankRoster cannot be stopped) still writes its result to the shared cache: it scored
  exactly that fingerprint's data.
- Measured: a forced Recompute on David's export (24 characters, 96 team rotations, 72 investments) takes 5.4 s in the dev build
  with no long task (> 50 ms) on the main thread. The CLI `snapshot` diff against plus is empty, and `rank --investment` differs
  only in the Rover label ("Rover Aero (Male)" for the kit's "RoverAeroFemale").

## `/rankings` re-skin and the account bar's chips (2026-10-12)

Riley's page dressed as part of the app (the UI audit's "/rankings" list): one typeface, readable kit colours,
no empty gutter, one state control, the Compare column as a share of the top row, Main DPS / With / Without
chips, a neutral "Beta · how to read" chip, sticky Member / Action columns in the rotation log, and a bar that
fits a phone in two rows. Nothing inside `vendor/wuwa_calc` changed; everything is CSS over his class names,
a hash edit, or a pass over the DOM he drew.

| Piece | Role |
|---|---|
| `skittle-theme.css` | `--mono: var(--sans)` (his tables were set in mono; `tabular-nums` keeps the figure columns, and his detail-log tracks are character counts × 7.7 px of mono, which the sans always fits); dark themes clamp every kit colour to `oklch(from var(--mem) max(l, 0.78) min(c, 0.15) h)` (Chisa's / Phrolova's crimson, Lupa's red, Xuanling's indigo were below a readable contrast on their tinted cells), light themes keep the old darkening and, where relative colour syntax exists, a `min(l, 0.47)` ceiling; the `.tclayout::before` band that centred the table (≈195 px empty gutter at 1440 px) is gone beside the aside; his README box and Team Cost box (`.tcopt:has(#cost)`) are hidden, `#cost` stays in the DOM; his "Shown / Hidden" resonator bubbles are hidden (the bar's chips show the same `r=` / `x=`), his gear / level / compare / Matrix bubbles stay; the Compare cells' heat colours (`.c.baseline.wt-pct`) |
| `compareColumn.ts` (+ test) | pure: `teamFigureOf(run, mode)` (his table's private `teamFigure()`: DPR = the four rotations' average, DPS = over their seconds), `compareScale(totals, pinned)`, `shareText` (one decimal truncated, his `pctTrunc` rule: never rounded up), `strengthOf` (0 neutral at the weakest row → 1 accent at the top, cubed so the accent gathers at the top of a 250-team table) |
| `filterChips.ts` (+ test) | pure: `rosterOf(TEAMS)` (name, kit colour, leads a team, `Tier.Free`), `readResonatorFilters` / `chipGroups` / `withResonatorFilter` over the hash, `pickerOptions` (Main DPS lists only leaders; the account's S6 resonators first, then the rest it owns, then the ones it lacks; a free resonator the account never set up is owned at S6, his `accountOf()` rule), `RILEY_TIERS` (his `TEAM_COSTS` minus `mine`, with his `COST_CODE` hash codes) |
| `controller.ts` — post-render passes | a `MutationObserver` on `#app` runs after each of his draws (scroll window, filter change, detail visit) — a microtask, so before paint; the observer is off while the passes write, and each pass writes only what differs. `comparePass`: every drawn `.c.baseline` becomes the team's share of the top row (`data-total` / the best figure over `model.visibleRows`, drawn or not) or of the pinned row, with `--wt-k` for the colour; the ghost row is resized to the widest share, the heading reads "% of top" / "% of pinned". His `baselineTeam` is module-private, so the pin is mirrored from the same click (capture phase) and re-synced from `.isbaseline` whenever that row is drawn. `stickyLogPass`: whichever of Member / Action lead the log (his columns are dragged into any order by a generated `order` stylesheet, nothing re-rendered) get `position: sticky` at their offset through one `<style id="wt-log-sticky">`. `rankingsRoster` (a `shallowRef`) hands his roster to the bar once his modules load |
| `RankingsAccountBar.vue` | **one state control**: My account \| Riley's tiers, and in Riley's mode a tier select (`tc=`; his own box is hidden — both wrote the same parameter); "Riley's tiers" returns to the tier last picked. **Main DPS / With / Without** chips: a picker per group (search, the account's resonators first with their S badge, "Picked" on top), chips that come off on a click, Clear; Main DPS and With both write `r=` (his `teamWanted()` reads an added leader as "the teams they lead", a support as "teams fielding them"), Without writes `x=`; which group an `r=` name shows under is where the player put it this visit, else whether that resonator leads a team. **Views** is one menu (list, Save current view…, Forget); a view matches the current hash in canonical parameter order, since his `syncHash()` rewrites the URL in his own order. **Beta · how to read**: the README's notes (beta, DPR ignores rotation time, the target, Riley's credit and Discord) plus what the plus columns mean. Popovers: one at a time, a press outside the panel and its own trigger closes it, Escape too |
| phones (< 768 px, `matchMedia`) | two rows at 412 px and 130 % text: state control + ⓘ account popover (summary, Teams I can field) or tier select + ⋯ menu (Substats, Sync my teams, Saved views, How to read) on the first, the chip strip on the second — a group's button shows what it holds ("Main DPS Cartethyia", "With 2"), the strip scrolls sideways with a fade at its end. Riley's toolbar button reads "Search & compare" (his aside holds the search and the gear / compare bubbles now) |

Rules: never edit `vendor/wuwa_calc` for looks — a class name he renames breaks a rule silently, so the
E2E checks the visible result (the `% of top` heading, hidden boxes, the chips' hash). The Compare text is the
plus reading; his own figure (vs the weakest row) is gone from the cell, his pin still works. Kit colours are
only ever clamped, never replaced, so a resonator keeps its hue everywhere.

Things learned:
- His `tclayout.stack` grid keeps a 360 px column for the boxes beside the search; with the README and Team
  Cost hidden that column was empty — the stacked grid is one column now.
- `getComputedStyle(cell).order` is the reliable visual column order of the log (bounding boxes move once a
  column is stuck); `getComputedStyle(cell).width` is in layout px whatever the page zoom.
- A native `<select>` is as wide as its widest option: on a phone the tier select has to be `w-0 flex-1` or
  it pushes the bar past the viewport.
- 250 rows of "% of top" mostly sit between 80 and 100 %: data bars that long all read as full, so the column
  is a heat scale (`--wt-share` is still written if a bar is ever wanted).

Gates: `filterChips.test.ts`, `compareColumn.test.ts`; `cypress/e2e/rankings.cy.ts` (the tier select with his
box hidden, the Compare column top / pinned, the chips' `r=` / `x=` and the owned-first picker, the phone bar's
two rows at 412 px / 130 %, the Views menu); `phoneLayout.cy.ts`.

## `/rankings` on a phone (team cards) and the detail page's member strip (2026-10-12, finished 2026-10-26)

Below 768 px Riley's comparison grid scrolled sideways inside its own box (Slot 1 and the team's figure off-screen):
a phone now reads the same rows as cards. His rotation detail gains a member strip over his Equipment table — who is
in the team, against the player's own account. Nothing inside `vendor/wuwa_calc` changed; the cards are another face
of his model's `visibleRows` / `results`, the strip reads the run his detail page draws.

| Piece | Role |
|---|---|
| `phoneCards.ts` (+ test) | pure: `tableOrder` (his `table.ts` row order — one row per team best first; a compare's rows nested inside their team by substat spread, chain, weapon, rank, sonata, each group where its best row would stand, ties to the deeper chain then the higher rank), `cardMemberOf` (slot numbered from the end, a Resonance Mode as "(Unison)", the weapon without its rank, `free` = his `Tier.Free`), `rankToken` / `investmentToken` (his `rankToken`: a standard or 4★ weapon at R1 reads R0 = no signature, unless refines are compared), `mainFirst` (the main DPS first — his slots are support-first), `teamCards` (rank, figure, last loop's seconds in DPR mode, share / width / strength off `compareColumn.ts`), `ownStatus` (the member against the account: under My account only a missing resonator says anything; under Riley's tiers ✓ / ✓ S6R3 / "you S2" / "no sig" / "not owned", with `weaponGap`; a free resonator never set up is owned at S6, his `accountOf()`), `buildStatus` (five echoes on the build the calculator runs = "build"), `ownByRileyName` (both Rover genders are his one form: the owned one wins) |
| `controller.ts` — `cardsPass` | a post-render pass (with `comparePass` / `stickyLogPass`): when `RankingsCards.vue` has claimed the list (`claimCards`) and `(max-width: 767px)` matches, it re-attaches one host element inside his `.tcbody` after each of his draws (he rewrites `#app` wholesale; the host and the Vue DOM in it survive the move), puts `wt-cards` on the root (his grid and "N teams" label hidden) and publishes `rankingsCards` — memoised on his `visibleRows` array, the DPR / DPS mode, the run count, the pin and the tier, so his scroll redraws cost nothing. `openRankingsTeam` = his "view rotation" navigation (`goToDetail`, vue-router), remembering the list's scroll for the way back; `setRankingsTeamMode` clicks his own (hidden) DPR / DPS heading. `cardsHeadHost()` sits in the phone toolbar beside the Filters button |
| `RankingsCards.vue` | teleports into the host: one card per row — rank, the share pill on the Compare column's heat, the figure big (and the loop's seconds in DPR), three portraits main DPS first with each member's S/R token and badge (Riley's tiers: where the account stands; My account: "no build" / "3/5" when a set-up member lacks echoes, "not owned" with Teams I can field off), a hairline bar of the share. **50 at a time**: "Show 50 more" plus an `IntersectionObserver` that loads the next 50 as the end nears; the count resets when the listed rows change. Each card is a real link (`#…&team=<key>`) whose click goes through the router. The toolbar heading: "N teams", "% of top" / "% of pinned", a DPR · DPS switch. Empty states for no match and for an account with nothing set up |
| `RankingsMemberStrip.vue` | teleports into a host the controller keeps in his `#topbar` right after Back (`mountImportControls` → `mountMemberStrip`, publishing `rankingsDetail`): per member, main DPS first — portrait (DPS tag on it), the weapon's icon and name, "runs S6R1" under Riley's tiers, the account's own S/R chip ("Own S2R1", amber with "· no sig" when it wears another weapon than the row's signature, "4★ · S6", "not owned") and the build chip ("✓ build", "3/5 echoes", "no build"; none for a resonator not set up). The Import controls stay beside it; on a phone Back and Import share the first line and the strip takes its own, each member stacked (portrait over its lines) |
| `RankingsPortrait.vue` | the app's portrait (`characterPortraitUrl`) ringed in his kit colour (the primary for the main DPS), initials if it fails (Lily has no app character) |
| `weaponIcon.ts` | his weapon name → this app's weapon registry (`getWeaponsByType`, names compared like his `normWeapon()`), the module's own `info.image` loaded lazily and cached; a weapon the app lacks gets the asset host's `<Key>.png` guess, and the strip shows a neutral glyph when the image fails |
| `accountState.ts` | an active build's slots are read off the character's live top-level record (its `builds[]` entry only catches up on a switch — David's export has every active build's cached `echoes` null while five are worn), so "build" is right |
| `filterChips.ts` `RILEY_TIERS` | Riley's two new tiers (`s6ms2` S6R1 DPS · S2R1 supports, `s6r5m` S6R5 DPS · S0R1 supports); a test reads his `model.ts` `COST_CODE` so a tier he adds cannot go missing behind the hidden Team Cost box |

Rules: the cards never compute a figure of their own that the grid would not show — the figure is his `teamFigure()`
(`compareColumn.ts` copy, DPR or DPS by his own switch), the order his table's, the share the Compare column's. The
grid stays the desktop face (and the phone face when `RankingsCards.vue` is not mounted). A Rover's portrait follows
the gender the account set up. Light themes darken DaisyUI's success / warning for the chips' text.

Things learned:
- In a scoped `<style>`, `:global(html[data-theme-style="light"]) .chip` compiles to `html[data-theme-style="light"]`
  alone — the rest of the selector is swallowed, and the rule recoloured the whole page in light themes. An ancestor
  needs no `:global`: write `html[data-theme-style="light"] .chip` and the scope attribute lands on `.chip`.
- Never hide his grid with `display: none`: his `drawWindow()` measures the row pitch once per visit off the rows it
  draws (his rows are `display: contents`), and under `display: none` that read 0 — after a page that started below
  768 px was widened, the desktop grid drew every row with no spacers. Under the cards `.tcwrap` is clipped to zero
  height and `visibility: hidden` instead, still laid out. Read the cards' order off `visibleRows`, never off his DOM
  (only a scroll window of it is drawn). His heading is still clickable while hidden.
- Headless Electron (Cypress) never reports a media-query `change` after `cy.viewport()`: a spec that needs the phone
  layout sets the viewport first and visits (or `cy.reload()`s); Chromium (shot.mjs) does fire it.
- His list scrolls inside `#app > main`, not the window: the card list's scroll is saved / restored on that element,
  and an `IntersectionObserver` with the default root still sees the sentinel clipped by it.

**Verify-and-harden pass (2026-10-26):**
- Rows the player pinned (his `pinnedRows`, hash `pin=`) stand first on the cards as in his grid (`tableOrder`'s
  `isPinned`), with a pin mark.
- The rank token asks both of his solver's questions (`rankShown`: a compared refine, or that weapon's ranks shown at
  this sequence, `shownRanks`), so a card never reads R0 where his grid reads R1.
- A desktop gets the empty state his grid lacks: `cardsPass` lends the host to an empty table (`wt-cards-empty`), with
  "No team you can field yet" + **Open the calculator** at My account with nothing set up, else "No team matches".
  `refresh()` counts itself (`refreshing`), so "no match" never shows while his rows are still being solved.
- Phone → desktop: `onPhoneChange` redraws his scroll window once the grid shows (his own resize handler ran while the
  cards still hid it); see the `display: none` lesson above.
- The account bar's summary truncates between 768 px and a wide desktop (it ran under Beta / Sync / Views at 800 px).
- Below 1280 px the detail's member strip takes its own line under Back and Import (weapon names were cut to "Bloo…");
  on a phone the Import button reads "Import team", so Back and Import share the first line at 130 %.
- Below 390 px the phone toolbar's Filters button is its icon (the word stays for screen readers), so "279 teams" fits.
- `accountState.ts`: with no `activeBuildId`, the first saved build keeps its own snapshot (only the entry that IS the
  live build takes the live slots).

Gates: `phoneCards.test.ts` (16), `filterChips.test.ts` (the `COST_CODE` drift guard), `accountState.test.ts`;
`cypress/e2e/rankings.cy.ts` "phone cards and the detail's member strip" (412 × 915 at 130 %: 50 cards, best first,
main DPS first, "Show more" → 100, DPR / DPS through his switch, the Filters sheet over the cards, a tap → the detail
with its strip, Back and the short Import on one line, Back → the cards; a pinned row first on the cards; the desktop
empty state at My account with nothing set up, gone under Riley's tiers; desktop: the grid and no cards, the strip's
Own S2R1 / build / weapon at My account and "runs S6R5" at S6R5); `phoneLayout.cy.ts`, `themes.cy.ts`.

## Echo Lab engine — `src/sim/echoLab/` (stage 1: engine, worker, tests; 2026-10-12)

Engine-backed echo decisions — every number is the app's own damage engine on the character's best rotation
(`rotationCandidates` + `scoreRotation`, the /my-rankings pick at Riley's level-100 / 20 % RES target), never a
stat weight. Every hypothetical build is a clone scored through `calcCharacterRotationDamage`; a swap goes through
upstream's `resolveCandidateEchoPointersConfig` (echoImpact.ts, exported for this with a one-line hook), so set
bonuses that break or complete, newly active set passives and the main-echo buff recompute exactly as the v3 swap
badges do (a test pins our swap gain to `estimateEchoSwapImpact`'s on the same rotation). The page and the calculator
panel are the next section.

| Piece | Role |
|---|---|
| `core.ts` | `createLabSession(account)` (plain `{ characters, echoes, equipped, teams }`; caches prepared characters, their best rotation, per-point prices and set deltas), `prepareCharacter`, `scoreBuild`, `swapInto`, `withSlotRecord`, the slot rules (`slotChecks` / `legalSlots`), `wornByIndex` (inventory `equipped` ∪ slot pointers, stale map entries flagged), the pacer (progress, cancel, yielding) |
| `prescore.ts` | the cheap linear pre-score: the set-bonus change at that slot scored exactly once per distinct outcome + the stat change at the build's per-point values (finite differences through the engine; element / Healing main stats priced the same way). Partial echoes count their missing lines at expectation |
| `bestOwner.ts` | `bestOwners(session, options)`: every inventory echo × every built character with five echoes; the top K (4) characters by pre-score are scored exactly in every slot the echo may go into. Per echo: owners best first (`gain`, `damageGain`, `erChange`, replaced echo), `upgradeFor`, `wornBy`, `blocked` counts, Tune-or-Feed for partial echoes, verdict + reason. Per character: upgrades available, the best one |
| `echoPotential.ts` | "Tune or Feed?": the 5 − n lines still to roll, types uniform over the ones the echo lacks (stated in `assumptions`), values by Kuro's tier odds; exact enumeration up to the sample count (a 4-line echo: ≤ 72 outcomes), else seeded Monte Carlo (≥ 1000, memoised per distinct outcome). Output: current gain, P(beats the slot's echo), expected gain, p10/p50/p90, verdict tune / gamble / feed / done, cost labelled approx. |
| `rerollAdvice.ts` | Transducer advice for an equipped 5-line echo: each line's worth (build without it) vs a fresh random line in its place (every open type × tier, exact) → lock / re-roll per line, ranked; one plan per lock count with P(improve), expected gain keeping the better lines, Transducers per success. One re-rolled line is exact; two or more add the new lines' exact single-line values (MC over that, no engine per sample). Lock costs default 1/1/1/2/3, "verify in game". With `erNeed` (the character's need in their saved teams) every line set scores damage × (1 − ER deficit), and an Energy Regen line the build can't lose without falling under the need is locked (`erFloor`), ranked last and never in the recommended plan (2026-10-31) |
| `benchmarkScore.ts` | Fribbels-style damage benchmark: B = substats blanked (mains, sets, main echo kept), R = ChemX32 (5/5/2/2/2 median rolls over Crit Rate, Crit DMG and the three stats the engine values most **on B**, one median roll of each other stat — 24 of 25, as Riley's `shared/substats.ts` spends them), P = 25 best-tier rolls placed greedily where the engine gains most (≤ 5 per stat, one line per echo); score = (D−B)/(R−B) below R, 1 + (D−R)/(P−R) above, clamped 0–200 %. Returns all three spreads and yours |
| `rolls.ts`, `fingerprint.ts` | the roll model (tier odds from `substatWeights.ts`'s `TIER_WEIGHTS`, now exported; subsets, exact outcomes, sampling) · cyrb53 account fingerprint, stable option keys, mulberry32 PRNG |
| `pass.ts` | `runEchoLabPass` (best owner + Tune or Feed, optional benchmarks) and `runJob` — the job kinds `pass`, `bestOwner`, `benchmark`, `potential`, `reroll` |
| `workerHost.ts` + `echoLab.worker.ts` | the message host: jobs one at a time, progress, cancel, a session per account fingerprint and a result per (fingerprint, job) |
| `echoLabClient.ts` | `getEchoLabClient().run(job, labAccountOf(stores), { onProgress, signal, onInfo, extraEchoes })` → typed result; runs the same host inline where no Worker exists. `extraEchoes` judges fresh scans before they are saved |
| `echoLab.test.ts` + `__fixtures__/echoLabAccount.json` | public data only: Cartethyia (my-rankings fixture), Galbrena and Zani (upstream's Cypress golden fixtures), synthesised `lab*` echoes |

Rules (and why):
- **Slots:** same cost; slot 0 (the main echo) only takes another copy of the same echo — a different main echo is
  a different build, the optimizer's job; a species once per build (the optimizer's rule). Characters need five
  echoes to be owners (Zhezhi with a weapon and no echoes would otherwise "gain" from every echo).
- **Swap rules (`SwapRules`, defaults on):** keep every active set bonus, lose at most 12.4 Energy Regen (one
  best ER roll), and never lower the build's Healing Bonus (`keepHealingBonus`). Without them every support
  "gained" 10–30 % by trading their ER main stat and their team-buff 5-piece (Moonlit Clouds, Rejuvenating Glow)
  for ATK, and every healer by trading their Healing Bonus main echo for a Crit DMG copy of it — the static engine
  values none of the three. A pinned `setOverride` skips the set rule. `blocked` counts each closed character once,
  under the first of set → er → heal its slots name.
- **Verdicts:** keep = upgrade for someone (exact gain > 0), worn (stale map entries included), or a partial echo
  whose potential says tune; spare = no upgrade but within 2 % of its best owner's current echo, a gamble to tune,
  or no slot today with substats at least as good as the median echo some build wears; feed = the rest
  (`no-gain` / `no-slot`).
- **Costs and odds:** tier odds are Kuro's (published); substat *type* odds and tuner / EXP / Transducer costs are
  not — the outputs say so (`assumptions`, `approx.`, "verify in game").

Things learned:
- Per-point prices mislead near the crit cap and on set changes (mean |pre − exact| 0.7 %, 18 of 248 signs flipped
  on David's export), so the pre-score only picks candidates; verdicts read exact numbers only, every slot exact.
- Supports read ~0 for ER and team sets; rank owners by `damageGain` when a carry's +2 % should beat a healer's +30 %.
- Vite builds workers as IIFE (`worker.format` default), which inlines every `getCharByName` character module: the
  worker is 3.3 MB / 504 kB gzip. `worker.format: "es"` (all app workers are `{ type: "module" }` already) makes it
  468 kB / 93 kB gzip with character data loaded per character — a shared `vite.config.ts` call, not made here.

Measured on David's export (258 echoes, 24 built characters): the pass (best owner + Tune or Feed) 1.4–1.5 s in Node,
928 engine scorings, 128 keep / 59 spare / 71 feed (2026-10-26, Healing Bonus rule in); the pass plus all 23
benchmarks 3.7–4.1 s (4899 scorings). In headless
Chromium through the worker: pass 2.1 s with the main thread never blocked over 11 ms, cached re-ask 5 ms, all
benchmarks 3.3 s on the warm session, one re-roll advice 0.7 s, cancel honoured within ms. Gates: `echoLab.test.ts`
(16), `vue-tsc`, the CLI snapshot diff (no number moved).

## Echo Lab page and the calculator's engine panel — `/echo-lab` (stage 2, 2026-10-26)

`/echo-lab` (lazy route in `main.ts`, no nav entry yet — `plusPages.ts` gets it at integration) puts the engine above
in four tabs, every number from the worker; the v3 calculator's Echo Insights shows a small "Engine view for this
build" panel that links into it. Works in v3 (default) and classic; tab title through `useDocumentTitle`.

| Piece | Role |
|---|---|
| `EchoLabView.vue` | the page: header (engine runs, time or "cached", Re-run, an (i) on how it decides), six KPIs (Keep / Spare / Feed jump to that verdict filter), a three-segment progress bar with Cancel, error and cancelled states, the tab strip (`?tab=` and `?character=` in the URL so links land on a tab), empty state with Import / Scan / Build CTAs — also shown when the pass found no character with a weapon *and* five echoes, where every unworn echo would otherwise read Feed. Phones: short KPI and tab labels, 3 × 2 KPIs, one-line subtitle |
| `useEchoLab.ts` | page state at module level (switching tabs or pages never recomputes): the pass, the benchmarks, re-roll advice per (fingerprint, character, slot), progress, cancel; results for another account fingerprint are dropped, never shown (re-roll advice included); the last pass + benchmarks also in `sessionStorage["wtplus:echoLab:cache"]` (`{ v, fingerprint, pass, benchmarks }` — a cache of another `v` is ignored) so a reload of the same account is instant |
| `EchoLabVerdicts.vue` | **Inventory verdicts**: a dense CSS-grid table (echo picture with rarity ring, set icon, cost, main, substat chips coloured by worth on the reference build, best owner portrait + gain, "+N more", worn-by portraits with stale ones greyed, Keep / Spare / Feed chip + reason), sortable headers, verdict segment, cost segment, set / main / owner / worn selects, search, 60 rows a page; a row opens the exact per-owner scores and how many characters the slot rules blocked. The **feed list** groups the feed verdicts by Sonata · Cost · Main Stat (the game's own echo filter) with Copy list and "Show" per group. Below 1024 px the same markup becomes cards (two columns from 640 px); on a phone the owner and worn cells share the footer row (one grid area, start / end) so neither widens the verdict column |
| `EchoLabTune.vue` | **Tune or Feed**: partly levelled echoes with their most promising owner and slot, chance to upgrade, expected gain, a p10–p90 band with median tick and the echo-as-is diamond on one shared axis, verdict, "to +25" tuner / EXP cost marked approx.; echoes nobody can slot listed apart |
| `EchoLabReroll.vue` | **Re-roll advisor**: a character rail (a swipe strip below `lg`, the picked portrait kept in view), the five echoes with worth / fresh / Lock or Re-roll #n per line (icon-only chips on a phone), the recommended plan, all lock plans, "Transducer costs: verify in game"; one `reroll` job per echo, cancelled when another character is picked. **Re-roll first** marks the echo `pickRerollFirst` names, once every echo's advice is in |
| `EchoLabBenchmark.vue` | **Build benchmark**: 0–200 % bars with the 100 % mark and B / R / P axis, score bands (low < 60, fair < 90, good < 120, great), a row opens yours / reference / perfect rolls per substat (every stat any of the three holds); the (i) explains B, R (Riley31415's ChemX32), P and the formula |
| `EchoLabEcho.vue`, `EchoLabPopover.vue`, `echoLabView.ts`, `echoLab.css` | the echo cell; an (i) button whose panel is a bottom sheet below 640 px; the pure view model (names, pictures, filters, sort, feed groups and their clipboard text, line colours, formatters); the shared chips, bars and table grid — DaisyUI tokens only, light themes darken state text |
| `EchoLabEngineHook.vue` → `EchoLabEngineView.vue` | the calculator panel: upstream's `CalculatorEchoInsightsPanel.vue` renders the hook (one template line + its import) at the end of the Echo Insights details; the hook lazy-loads the panel: benchmark score + bar, the three substats one more roll is worth most on the best rotation, and the echo / line to re-roll first with its plan, "Echo Lab ›" to `/echo-lab?tab=reroll&character=<id>` |
| `engineView.ts` | the panel's engine job: benchmark, `substatWeights`, `equippedSubstatWorth`, and (unless `reroll: false`) every full echo's advice picked with `pickRerollFirst`; `erNeeds` reaches the benchmark and the advice, so the panel and the tabs show one score (they read 140 % and 132 % for one build before 2026-10-31) |
| `rerollPick.ts` | `MIN_PLAN_GAIN` (0.05 %) and `pickRerollFirst` (best recommended plan per Transducer; ties → bigger gain → lower slot), and `rerollOptionsFor(erNeeds, id)` — the one `reroll` job options shape the tab, the panel and `engineView` send, so the worker's cache answers each from the others. No engine imports, so the page and the panel share the engine's exact rule |
| `echoLabView.test.ts` | the pick rule; the engine view naming the same echo as the tab's rule over every full echo (Galbrena); filters, sort, feed groups and their text, line tiers, score bands on the fixture's real best-owner result |
| `cypress/e2e/echoLab.cy.ts` | v3 seeded through `onBeforeLoad` with the unit-test fixture: verdict chips and the no-slot echo fed, KPI → filter, feed groups, search / clear, row detail, Tune / Re-roll / Benchmark render with their (i) panels, every tab inside 412 px at 130 % text, the empty state's CTAs, the empty state (no KPIs, no feed list) for weapons without five echoes, the calculator panel's numbers, its link landing on the re-roll tab with the same echo marked "Re-roll first" |

Rules:
- **One "re-roll first" everywhere.** The panel and the tab both pick with `pickRerollFirst` over every full echo's
  advice (they disagreed before: the panel took the echo whose substats add least, the tab the best gain per
  Transducer). The panel runs `engineView` with `reroll: false` first (numbers in ~0.75 s on the fixture), then the
  same `{ kind: "reroll", characterId, slot }` jobs the tab runs, so the worker's result cache answers the tab at once.
- **The panel runs only where it is displayed.** Upstream renders two Echo Insights panels (desktop sidebar, phone
  bar; CSS hides one) and mounts the calculator's screens hidden (`v-show`). An IntersectionObserver answers at once in
  a browser; a 1 s `getClientRects()` check backs it up — the observer never fires in Cypress's headless Electron
  (like rAF, see the first section). Edits re-run it 0.9 s after they settle; the old numbers dim meanwhile.
- **Single-column grids are `grid-cols-1`.** A grid with no column template sizes its implicit `auto` track to the
  min-content of a `truncate` (nowrap) child, so the panel ran 40 px past its card on a phone (clipped, not
  scrolled — the overflow probe of the page saw nothing). Every one-column state in these components names its track.
- Labels: the app's damage per rotation (`avg per rotation`, `vs R …`), never Riley's DPS; tuning costs approx.,
  Transducer costs "verify in game", tier odds Kuro's.

Things learned:
- With Ryan's larger v3 fonts the echo column needs ~14 rem before "Bell-Borne Geochelone" fits at 1440 px; the
  substat column gives it up (19 rem holds five chips).
- A shared `auto` column in a phone card is a trap: the reason text under the verdict chip sized that column and
  squeezed the echo's set name to "M.". Overlapping two cells in one grid area (start / end) keeps the card's columns
  independent.
- Upstream spec `calculator/echoInsights.cy.ts` "pins the Build Score panel above the strip on a mobile viewport"
  fails on this branch with and without the hook (checked by removing the two hook lines) — inherited.
- Verify pass (2026-10-26): 5 of the 32 "upgrades" on David's export were Crit DMG / ATK copies of Verina's and
  Shorekeeper's Healing Bonus main echo (+2.8 to +17.4 % "damage" for a healer). `keepHealingBonus` closes those
  slots; exactly those five verdicts moved (two Fallacy of No Return → spare, good subs; the Bell-Borne Geochelones →
  worn, a +1.4 % upgrade for Rover, a backup). No damage number moved.

Measured (David's export, Vite dev, headless Chromium): the pass 1.4–2.0 s with 935 engine runs, all 23 benchmarks
3.0–3.4 s, the re-roll tab opened on a character done 3.3 s after load (pass included); the calculator panel (Aemeath)
shows its first numbers after 0.75–1.3 s and its re-roll pick after 3.3–4.0 s. Gates: `vue-tsc`, full vitest, `echoLab.cy.ts` (6) + `phoneLayout.cy.ts` (6),
`vite build` (the `echoLab.worker` chunk emitted, no `import.meta.glob` in `dist/`).

## Echo Lab pass 2: the Tuner plan and "How good is this roll" (track "tuner", 2026-10-31)

Two follow-ups the Echo Lab sections above deferred. Both run as jobs on the same `echoLab.worker` (no new worker
entry: `pass.ts` gained the job kinds `tunerPlan` and `rollQuality`) and use Ryan's levelling table
(`src/echoes/levelingCost.ts`: EXP per level, 10 Tuners and 2,000 Shell Credits a tune) for every cost.

| Piece | Role |
|---|---|
| `tunerPlan.ts` | `tunerCandidates(session)`: every unfinished 5★ echo a Tuner could go into. **Worn** (a built character's slot points at it): every outcome of the lines still to come scored with the echo where it sits (exact up to 1000 outcomes, else seeded Monte Carlo); every line counts. **Spare**: the pass's Tune or Feed target (same pick rule: best pre-score of the expected full echo over the five-echo builds) and its `echoPotential`, counted only when it ends up beating the slot's echo (`expectedUpside` = E[max(0, gain)], new on `EchoPotentialResult`; potentials are now memoised per session, so the pass's answer is reused). Per candidate: cost to +25 (`tuneToMaxResources`, the echo taken at +5 per line), expected gain (relative and damage per rotation), chance it ends up worth keeping (spare: P(beats the slot's echo); worn: null, "it stays on"), p10/p50/p90, and **expected damage per rotation per Tuner**, the plan's order. **Fresh**: every 5★ slot of every five-echo build pre-screened linearly (the pass's per-point prices, 2,000 samples), the top `freshSlots + 3` worked out with the re-roll advisor's 0-lock model (`additivePlan`, now exported: each line's exact value on the blanked echo, summed over 20,000 seeded samples; `draw: 5` makes a fresh echo roll all five lines even when the one in the slot is unfinished), the best `freshSlots` (5) kept. Non-5★ and unslottable unfinished echoes go to `leftOut` with the reason |
| `tunerBudget.ts` | pure, page side: the budget (`TUNER_BUDGET_KEY` = `wtplus:echoLab:tunerBudget`, `{ v: 1, tuners, exp, weeklyTuners, weeklyExp }`, whole non-negative numbers or null = not typed) and `planTuners`: steps in damage-per-Tuner order; with a Tuner budget each step is "now" when what is left still covers it (Tuners, and EXP when typed), so a cheaper one further down can still fit after a dear one did not; waiting steps get "Week N" from the typed weekly income, strictly in order, for `WEEKS_AHEAD` (12) weeks, else "later"; candidates adding under 0.5 damage are "not worth a Tuner". Fresh-echo tries the leftover and the weekly income cover |
| `rollQuality.ts` | `rollQuality(session, echoId, target)`: the echo's percentile among every echo of its kind it could have been at its level (its set, cost and main stat; n lines from the thirteen substats, types uniform, values by Kuro's tier odds), scored on the owner's best rotation: where it sits when a built character wears it, else in the given slot (swap recompute as everywhere else). Exact for one line (96 outcomes), else 1,000 seeded samples; ties count half. p10/p50/p90 of the outcomes relative to yours. **Hope for** (fewer than five lines): each substat it can still roll at every tier on top of its lines (`tierScores`'s dead-stat shortcut), averaged by tier odds; lines whose top tier adds under 0.05 % counted as adding nothing. Memoised per session |
| `EchoLabPlan.vue` | the **Tuner plan** tab (`/echo-lab?tab=plan`, third of five): a one-line "what this is", the budget card (Tuners, Echo EXP, an optional weekly income behind a toggle, "Saved in this browser only", Clear), three KPIs (echoes to tune now, Tuners left after, EXP left after), the ordered step cards (echo, owner and slot, +level → +25, then **Expected gain** / **Cost** / **Chance it ends up worth keeping**, each captioned; a Now / Week N / Later chip; "Needs N more Tuners"), "Not worth a Tuner", "Left out", then **Then farm: where a new echo pays most** (owner · slot, the set / cost / main stat to farm, chance a new one beats it, expected gain per try, one try's cost). Phones: the stats become caption-left / number-right rows with their small print on a line of its own |
| `EchoLabRollQuality.vue` | **How good is this roll** at the bottom of an inventory row's detail: "As a +25 echo on X's best rotation, slot n", "Better than N %" (top / bottom 1 % named so: a simulation can't say 100 %) with a rating chip (`ratingOf`: Excellent ≥ 90, Good ≥ 70, Average ≥ 40, Below average ≥ 15, else Poor), a bar with the middle-outcome tick, what a typical one does against yours, and the top three lines to hope for. Rated for the built wearer, else the best owner, else Tune or Feed's target; says so plainly when no build can slot it |
| `useEchoLab.ts` | `runTunerPlan` (module state, cancelled with the rest, kept in the sessionStorage cache next to the pass: an older cache without it reads as none), `runRollQuality` / `qualityOf` per (fingerprint, echo, target) |
| `tunerPlan.test.ts` | costs against Ryan's table; spare candidates = the pass's target and potential; a worn echo (Galbrena wearing `labtune0004`) never loses damage and its expectation equals the hope-for lines' (two code paths); left-out reasons; fresh slots against the re-roll advisor's 0-lock plan (same model, other seed: within 2 points / 6 %), deterministic; the worker job and its cache; roll quality: deterministic, dead lines < 10th percentile, top crit lines > 95th, a one-line echo enumerated exactly with sorted hope-for lines and no flat DEF; the budget planner (storage, order, skip-and-fit, EXP, weeks, horizon) |
| `cypress/e2e/echoLabTuner.cy.ts` | seeded fixture, v3: the plan before and after a budget, Now / Later / Week, remembered after a reload, Clear, the (i); the roll quality block on a worn echo, an unfinished one (hope for) and one nobody can slot; 412 px at 130 % text with the fifth tab spanning the tab grid's last row |

Decisions (made without David, 2026-10-31):
- **Order by damage per rotation, not %.** "Most expected damage per Tuner" ranks by the owner's damage per rotation gained per Tuner, so a carry's +0.3 % beats a support's +2 % when it is more damage; the % is shown beside it. Rotation lengths differ between characters, so this is damage per rotation, not DPS (the Echo Lab's unit everywhere).
- **Whole echoes, to +25.** A step is "finish this echo", costed from its assumed level (+5 per line: echo levels are not imported) to +25. Stopping early when a bad line shows would spend less; the plan does not model that, nor the 75 % EXP / 30 % Tuner refund of feeding a failure.
- **Fresh echoes are a separate list**, not plan steps: they need a drop first. "What is left covers N full tunes" uses the leftover after the plan.
- **No income guessed.** The weekly view only appears when the player types a weekly income.
- **4★ echoes left out** (other Tuners, other EXP table), said so on the page.

Measured on David's export (258 echoes, 23 five-echo builds; only 2 unfinished echoes, which is why the fresh-echo
list exists): the `tunerPlan` job 0.87 s in Node (536 engine runs, on the pass's warm session), 1.07 s in headless
Chromium through the worker after the pass; `rollQuality` 0.8–1.25 s per echo in Node, 1.0–1.2 s in the browser
(1,000 samples + up to ~80 hope-for scorings). Nothing else moved: the pass's numbers are unchanged (`echoPotential`
only gained `expectedUpside` and a session memo). Gates: `vue-tsc`, vitest `src/sim` (72 files, 734 tests) with
`tunerPlan.test.ts` (16), `echoLabTuner.cy.ts` (3) + `echoLab.cy.ts` (6) + `phoneLayout.cy.ts` (12), `vite build`
with `ROLLDOWN_WORKER_THREADS=4` (no new worker chunk, no `import.meta.glob` in `dist/`).

## Convene history, pity and the banner calendar (track "convene", stage 1: data layer) — `src/sim/convene/`

Import the player's Convene (gacha) history straight from Kuro, keep it past the game's six-month window, read pity /
50-50 / luck off it, hand the state to upstream's odds simulator (`src/convene/simulateConvene.ts`, driven by
`ConveneView.vue`), and list every released banner from Kuro's own news feed. The UI and the pull advisor are stage 2
(next section). Every request detail was checked against public importers first — the URLs are in the file headers
(wuwatracker `import.ps1` / `import.sh`, juliy819 `fetcher.rs` / `parser.rs`, GoneTone `gacha_fetcher.dart` /
`record_merge.dart` / `gacha_types.dart`, ningnao `gacha.rs`, lyndon0na `wuwa_gacha.py`).

| File | Role |
|---|---|
| `pools.ts` | the 13 `cardPoolType`s (1 Featured Resonator — Anniversary banners share it — 2 Featured Weapon, 3/4 Standard, 5 Beginner (pity 50), 6/7 Beginner's Choice, 8/9 New Voyage, 10/11 Collab, 12/13 Reverb), hard pity 80 / 10 (Kuro's article 758), which pools flip a 50/50 (1, 8, 10, 12) or always give the featured item (weapon pools); the five standard 5★ resonators by `resourceId` (1104 Lingyang, 1203 Encore, 1301 Calcharo, 1405 Jianxin, 1503 Verina) and name |
| `gachaImport.ts` | `parseConveneLink` (all four `aki-gm-resources(-oversea).aki-game.(net\|com)` hosts, a link buried in text — the last wins, a cloud link's top-level query — the fragment wins, JSON escapes, a bare `player_id=…` query; region from `-oversea` → `svr_area` → TLD → CN ids start with 1), `manualConveneQuery` (console players), `extractConveneLinkFromLog` (Client.log plain or XOR-obfuscated — odd byte ^ 0xA5, even ^ 0xEF — and the KRSDK debug.log; bytes or pasted text), `fetchConvenePool` / `fetchConveneHistory` (POST JSON `{playerId, cardPoolId, cardPoolType, languageCode: "en", recordId, serverId}` to `gmserver-api.aki-game2.net` / `.com`, `credentials: omit`, `referrerPolicy: no-referrer`; one pool at a time, 350 ms apart; stops after code -1 expired or -4 unknown server), `mergePoolRecords` / `mergeIntoHistory` / `importConveneHistory`, the compact storage codec, `parseConveneFile` (WuWa Tracker exports — UTC → CST — and our own backups) + `exportConveneBackup`, `CONVENE_LINK_ERRORS` / `CONVENE_IMPORT_ERRORS` (user-facing lines) |
| `pity.ts` | `poolPity` / `historyPity`: 5★ pity (0–79) and 4★ pity (0–9, reset by a 4★ or 5★), each 5★'s pity and outcome (won / lost / guaranteed / unknown / featured / standard), the guarantee, 50/50 win rate, averages over complete intervals, luck percentiles from upstream's own pity curve (`luckPercentile`: exact convolution ≤ 60 intervals, normal beyond; `coinFlipPercentile`), a cross-pool 5★ timeline, Astrite value; `isLikelyTruncated`; `simulatorPrefill(pools, mode)` → `{ startingPity, guaranteedNextFeatured, clamped, certain }` for the simulator's Advanced panel |
| `banners.ts` | Kuro's news feed (`…/json/G152/en/ArticleMenu.json` + `article/<id>.json`): `parseConveneArticle` (every notice format since 2024-06), `buildBannerList` (fold duplicates, resolve starts, version / phase labels, released only, newest first, on a chosen server clock — `SERVER_REGIONS`), `versionReleases` / `releasedVersionOf` (each version's go-live time from its patch-notes entry in the menu), `liveBanners`, `featuredRuns` (rerun gaps), `linkRecordsToBanners` (pull → banner), `loadBanners` (seed ∪ localStorage cache, 24 h stale-while-revalidate — 1 h while a version-update banner waits for its release (`awaitingRelease`); offline → cached or empty list + message; `listAll` for a caller that filters on its own live clock), `unreleasedArticleIds` |
| `items.ts` | Kuro's English names → the app's character / weapon keys (case / spacing / punctuation-insensitive over `characters.ts` and `weapons.ts`; Rover forms skipped) |
| `data/bannerSeed.json` + `tools/emitBannerSeed.ts` | GENERATED — every Convene notice parsed (132 notices, 160 notice banners folding to 158 on 2026-10-12, 60 KB) so a first visit fetches only the menu; regenerate with `npx tsx src/sim/convene/tools/emitBannerSeed.ts [--update \| --from <dir>]` (`--update` starts from the current seed: one menu request plus the notices it lacks); a notice still announcing an unstarted banner is held back (the app fetches it once live); also carries `releases` (version → patch-notes time, 1.1–3.7) |
| `*.test.ts` + `__fixtures__/kuroNotices.json`, `kuroArticleMenu.json` | 60 tests, no live network: link parsing on every host variant, plain + XOR logs, the API mocked (body, endpoints, -1 / -4 / HTTP / malformed / offline / abort), merge / dedupe / idempotence / an empty answer never deletes, storage refusals, files; pity on synthetic histories; banner parsing on trimmed REAL notices (four with their full HTML), SWR with a mocked feed; the shipped seed decodes, is all released, and every featured item resolves to an app key |

Storage: `wtplus:convene:history` (`{ v: 1, active, players: { <playerId>: { region, updatedAt, imports[≤30], pools:
{ "<type>": [[time, resourceId, quality, name], …] } } } }`, oldest first, a multi-pull's records in pull order) and
`wtplus:convene:banners` (`{ v: 1, fetchedAt, articles, releases }` — only the notices and release times the seed
lacks; `releases` is optional, so a cache written before 2026-10-26 still decodes).

Rules:
- **The record link is a bearer token.** It never goes into the app's route, hash or query (`vercel.json` forwards page
  views to analytics), is never logged, never persisted; error messages never echo it. Only the player id is stored
  (`maskPlayerId` for display). The UI must keep the link in component state and send it nowhere but Kuro's API.
- **Merge, never replace.** An expired or bogus token can answer `code: 0, data: []`; an empty pool changes nothing.
  Records match per timestamp batch: pool + time + item (id when both sides have one, else the name) + position among
  that batch's identical items; a batch only one side has is taken whole. Re-imports add nothing.
- **Never overwrite what can't be read.** A corrupt or newer-version history makes the import refuse before any request;
  the history is re-read after the (slow) fetch so a second tab's import isn't lost.
- **Released content only.** A banner is listed once its start has passed on the chosen server clock; the seed tool holds
  back notices that still announce an unstarted banner. A banner that opens "with the version update" starts at that
  version's patch-notes entry; until the menu has one it is not started (48 h after its notice the publish-time
  estimate stands in, so a renamed title can't hide a running banner for long).
- **Pity numbers:** Kuro's are 80 / 10 (50 on the Beginner banner); upstream's empirical curve reaches 100 % on pull 79,
  so `simulatorPrefill` caps a counter of 79 at 78 and says so (`clamped`).

Things learned:
- Kuro answers `code: -4, "当前serverId查询不到区服信息!"` for an unknown `svr_id` (probed with made-up ids): the server id is
  validated, so the manual path needs it. The POST response carries `access-control-allow-origin: *` like the preflight;
  so do both news endpoints. Verified from headless Chromium through the dev server (seeded loader: one request).
- Record times are the CST (UTC+8) wall clock on every server (GoneTone converts WuWa Tracker's UTC instants with a fixed
  +8); banner times are "server time" (America UTC-5, Europe UTC+1, Asia / HMT / SEA / CN UTC+8). Linking uses both.
- The API lists newest first, inside a 10-pull too — every importer reverses the whole list. A pool's history is a
  6-month window, so the first 5★ of an old account is a lower bound (`isLikelyTruncated`: oldest pull more than 150
  days before the first API import) and kept out of averages; its 50/50 is "unknown".
- Notices: "Version 3.7 update - <end>" has no start minute. Kuro posts that notice the DAY BEFORE release (16–25 h
  early on every version 1.1–3.7; 3.7's at 11:15 CST on Sep 29, servers open Sep 30 11:00 after a 04:00–11:00
  maintenance), so the notice's publish time read 22 h early — the verify pass (2026-10-26) moved the start to the
  version's patch notes (menu titles "Version 1.1: … Patch Notes", "Patch Notes for Version 2.1: …", "Patch Notes for
  Wuthering Waves Version 3.7: …", 3.5's "… Content Overview"; posted at 10:00 CST since 2.1). The publish-time estimate
  (never before the end of the phase it replaces; every such banner of one version shares the earliest start — 3.6's
  Qingxiao notice went up three hours after Denia's) is now only the fallback. Per-phase notices (3.1+) sometimes drop a banner's header line or prefix it with
  an NBSP; single-banner notices are posted beside them and fold into one banner. 1.0's Jiyan banner was never in the
  feed. Kuro posts some notices the evening before release (2.3's at 18:16 CST), so those starts read a few hours early.
- Collab pity is shared per collab campaign, not across campaigns — not modelled (one campaign so far).

Stage 2 (UI) hooks: `/convene` gets an import panel (paste link / drop Client.log / manual ids / WuWa Tracker file),
per-pool pity cards, the 5★ timeline and the banner calendar; "use in simulator" needs a one-line hook in upstream's
`ConveneView.vue` that reads `simulatorPrefill(...)` into its `startingPity` / `guaranteedNextFeatured` refs.


## Convene UI and the pull advisor (track "convene", stage 2) — `src/sim/convene/ui/`, `advisor*.ts`

`/convene` gains four tabs above upstream's page: **Simulator** (upstream's odds page, untouched) · **My pulls** ·
**Banners** · **Pull advisor**. Upstream's `ConveneView.vue` carries two lines: the import, and
`<ConvenePlus v-model:mode v-model:pity v-model:guaranteed v-model:owned v-model:target />` bound to its own
simulator refs, which is how "use my pity" and the advisor's "odds for S3" fill the Advanced panel. While another tab
is open, one global rule (`[data-wtplus-convene-tab]:not(…simulator) + .page-convene { display: none }`) hides
upstream's page, so its markup and state stay as they are and come back as they were.

| Piece | Role |
|---|---|
| `ui/ConvenePlus.vue` | the tab strip (`?tab=pulls\|banners\|advisor`, `router.replace`, remembered in prefs), the live-banner chip, the Simulator strip ("Featured Resonator 58/80 → simulator" per imported pool), the prefill hand-off (sets the five models, switches to Simulator, opens and scrolls to upstream's `<details>`), and a per-tab title through `useDocumentTitle` (Simulator keeps "Convene odds"). The three tabs are `defineAsyncComponent` chunks |
| `ui/ConvenePullsTab.vue` | headline tiles (pulls, 5★ and mean pity vs the model's 54.1, 50/50 record, featured pity), the 5★ timeline (portrait, pull it landed on, won / lost / guaranteed, the banner it came from via `linkRecordsToBanners` — a lost 50/50 gets the phase label its candidates share), one `ConvenePoolCard` per pool, the player switcher, export backup / delete (confirm dialog), and the unreadable-history state (download the raw copy, reset only on request) |
| `ui/ConveneImportPanel.vue` | PC / Android-iOS / PlayStation-Xbox steps. PC gives the real `Client.log` path (wuwatracker's `import.ps1`: `…\Wuthering Waves Game\Client\Saved\Logs\Client.log`) and says Convene › History must be opened first. Phones and consoles say plainly that the link has to be captured another way and link to wuwatracker's public guide (`https://wuwatracker.com/import`) instead of steps we can't verify. Also: drop/choose the log (scanned in `logScan.worker.ts`), paste the link, type the ids (consoles), and import a WuWa Tracker export or backup. Progress per pool with Cancel. The link is cleared after every attempt |
| `ui/ConvenePoolCard.vue` | 5★ pity with a soft-pity track (66+), pulls left to the hard pity, 4★ pity, the guarantee badge, average pity, 50/50, "luckier than N % of players" (the model's percentile), every 5★ chip, and "Use my pity in the simulator" on the pools the simulator models (1, 2, 8–13) |
| `ui/ConveneBannersTab.vue` | the server clock select, "Running now" cards (portraits, 4★s, dates, countdown, elapsed bar, "Rerun · last ran 3.4 Phase II, 3 months before this one", a link to Kuro's notice `…/en/main/news/detail/<id>`), the rerun watch (limited 5★s by days since their last run ended, resonators / weapons), and the history grouped by version, with search and a kind filter. Revalidates Kuro's feed when it opens |
| `ui/ConveneAdvisorTab.vue` | pity per pool (from the history, editable, "use my history" to undo), an optional Astrite budget, the ranked rows (gain, expected Astrite, % per 1k, a bar, p50 / p90 pulls, the budget chance), the ladder to S6 / R5 (cumulative and per-step rates), "odds for S3 in the simulator", plain-language rows for not owned (→ `/rankings`), not set up (→ the calculator with that character active), maxed, no owner, not in app, and "How this is worked out" |
| `advisor.ts` | pure arithmetic: `featuredCost` convolves upstream's `fiveStarChance` exactly (first copy from the current pity and guarantee, then fresh copies with a 50/50 or straight for weapons), `chanceWithin`, `advisorTargets` (every featured 5★ on the live banners with its pool), `priceAdvice` (ranks on the next copy's % per 1,000 Astrite), `stepTitle`, and `adviceSummary` (one sentence, numbers only). `advisor.test.ts` checks it against `runMonteCarlo` |
| `advisorEngine.ts` | the damage side: the character's best rotation (`rotationCandidates` + `scoreRotation`, as on `/my-rankings`; enemy `RANKING_ENEMY`), then `withSequence` for S+1…S6 and `withWeapon` for refinements on that same rotation. A signature the owner doesn't use yet is bracketed like `weaponImpact.ts`: passives `all-max` is the headline, `all-off` is "stats only". The owner comes from `basic.signatureWeapon`, featured / owned characters first. Main thread, yielding between scorings |
| `prefs.ts` | `wtplus:convene:prefs` v1: tab, server clock (null = guessed from the time zone), budget, typed pity per pool |
| `ui/useConvene.ts` | one shared history (kept in sync with other tabs through the `storage` event), the banner feed (seed ∪ cache; network only on Banners / Advisor), the prefs, and a 30 s clock |
| `cypress/e2e/conveneTracker.cy.ts` + `cypress/fixtures/convene/` | the import from a pasted link (13 intercepted pools, `languageCode: "en"`, the token never in the URL or storage, a re-import adds nothing, prefill into upstream's input), an expired link (code -1: one request, nothing stored), a non-link that never leaves the page, Banners from an intercepted menu + notice 5668 (4 live, countdown, rerun, search, server pref), the advisor on the Cartethyia fixture with the clock pinned in 3.4 Phase II (Cartethyia S3 and Defier's Thorn R2 scored, Lucilla not owned → `/rankings`, the ladder, odds hand-off with S2 → S3 at pity 70), and every tab at 412 px / 130 % with no horizontal scroll and the layout viewport still 412. `gachaRecords.json` is **synthetic** (made-up pulls in the API's shape); `article5668.json` is Kuro's real 3.7 Phase II notice |

Rules:
- **Engine numbers only.** The advisor shows what `scoreRotation` returns and what the convolution gives, nothing
  else. A resonator the account doesn't own isn't scored (that would need a made-up S0 build): the row says so and
  links to `/rankings`. The damage is one character's rotation damage from the app's engine, never Riley's team DPS.
  If a Riley number is ever shown beside it, label it DPS and compare it only with damage ÷ the rotation's duration.
- **The record link is a bearer token** (stage 1's rule). The input has no `name`, isn't in a `<form>`, and is cleared
  after every attempt, including the log path. The tab state is the only thing in the query string.
- **One hook in upstream.** Logic stays in `src/sim/convene/`. The prefill writes upstream's own refs through
  `v-model`, and the hidden-page rule is the only CSS reaching into `.page-convene`.
- Phones: every grid is `grid-cols-1` (`minmax(0,1fr)`) below its breakpoint. An implicit `auto` track grows to a
  `truncate` child's full text width.

Things learned:
- `emit()` from a component that has already unmounted is dropped silently (Vue checks `isUnmounted`). The first
  import used to unmount its own panel mid-import, because the history appearing flipped the panel's `v-if`, so its
  "Added N pulls" line never arrived. The panel now stays open (`importOpen`) until it reports back, and the outcome
  moves up to the page.
- In a wrapping flex row, `flex: 1 1 0` items fit on the first line at width 0 and get crushed to 1 px; their text
  then overflows. On Chrome mobile that widens the layout viewport, so every `position: fixed` element grows with it
  (the nav's `…` slid off-screen) while `scrollWidth` looks fine. Give such items a real basis or a full-width
  wrapper. The spec checks `innerWidth` as well as `scrollWidth`.
- `cy.clock(now, ["Date"])` pins the banner phase without faking timers: the importer's 350 ms gaps, the advisor's
  yields and the debounces keep running.
- Regenerate the seed after a phase starts: `npx tsx src/sim/convene/tools/emitBannerSeed.ts --update` (2026-10-26:
  notice 5668, 3.7 Phase II — Lucilla, Lynae, Freeze Frame, Spectrum Blaster; 133 notices, 164 banners, 21 releases).

Verify-and-harden pass (2026-10-26):
- **Version-update starts** come from the patch notes (above). 80 of 162 banners moved, every one by 16–25 h; no explicit
  start and no label changed.
- **The banner list follows the clock.** The feed is loaded with `listAll` and `useBannerFeed().banners` keeps
  `startMs <= now` on the shared 30 s clock (same array while nothing new has started), so a phase that starts while the
  page is open appears without a reload. Revalidation may run again after 5 minutes (it used to be once per page life);
  `loadBanners` still goes to the network only when the cache is stale.
- **Pity in a cut-off history.** With no 5★ inside the six-month window the counter is a minimum: `pity5LowerBound` /
  `pity4LowerBound` show as "30+", "at most 50 to a sure 5★", and the simulator hand-off and the advisor say so
  (`ui/prefill.ts` is the one prefill sentence for the Simulator strip and the pool cards). `firstApiImportAt` counts
  only imports that brought pulls: an empty answer (bogus or expired token, `code: 0`) says nothing about the window.
- **The advisor yields** between rotation candidates and steps too. Measured on David's export: four targets in about
  200 ms, no task over 50 ms. Its cache key (stringify of both stores) costs about 3 ms.
- The wip commit carried `vendor/wuwa_calc` at e1181a9 and skittle.css's header from it, a rebase artifact one commit
  behind `plus` (653fee7). The worktree is back on 653fee7; this track touches neither.

## Performance: exact optimizer speedups, asset caching, bundle diet — `src/sim/optimizer/`, `src/sim/perf/` (2026-10-12, re-checked 2026-10-26)

Three changes and none of them moves a number: the CLI snapshot gate shows 0 changes on both exports, and an
equivalence harness (below) ran plus's optimizer pipeline and the new one side by side on 39 configs.

| Piece | Role |
|---|---|
| `optimizer/optimizerPool.ts` | pure (no Vue, no stores): `prepareOptimizerEchoPool` (one echo per optimizer signature, first copy kept), `optimizerLoadoutStream` (the generator's loop: upstream's normalise + hash + skip-repeats by default, the deduped-pool fast path when asked), `hasLoadoutExtensions`, `canSkipDominatedPartials` (the preconditions), `planOptimizerGeneration` (one call per run), `normalizeOptimizerLoadoutCached` (upstream's slot sort with each echo's signature memoised) |
| hooks (upstream files) | `Calculator.vue` `optimizeWithWorkers`: one `planOptimizerGeneration` call, the generator's start message carries the plan's pool plus `uniquePool` / `skipDominatedPartials`, the main-thread cross-shard hash runs only when the pool is not unique. `generator.worker.ts` walks `optimizerLoadoutStream`. `processor.worker.ts` imports `normalizeOptimizerLoadoutCached` under upstream's name. `optimizer.ts` is untouched |
| `optimizer/optimizerPool.test.ts` | the deduped stream is upstream's stream (same loadouts, echo ids, order; all three formats; two main species; sharded); the skip drops exactly the partials with ≥ topN extensions; the cached sort equals upstream's on 2000 random loadouts; every guard; and the game-data preconditions of the monotonicity argument: every `AdditionalBase` / `CritOverflow` modifier has a positive step and non-negative values, no set bonus has a negative modifier, and adding an echo never removes an active set bonus (`getSetBonusEffects`, every pair of sets at every split plus 4000 random multisets) |
| `perf/chunkReload.ts` | `vite:preloadError` → one reload (guarded by `sessionStorage["wtplus:chunkReloadAt"]`, once a minute): a tab opened before a deploy asks for chunk names that no longer exist; the reload fetches the new no-store `index.html`. No reload when offline (the import failed for want of a network; a reload would only show the browser's offline page) or when sessionStorage is blocked (nothing could stop a reload loop): the error then surfaces as before. Installed in `main.ts` |
| `vercel.json` | `/assets/*` (Vite's hashed output) → `Cache-Control: public, max-age=31536000, immutable`; everything else stays `no-store`. The SPA fallback no longer answers `/assets/*`, so a missing chunk 404s instead of returning `index.html` under a year-long cache header. The api and umami rewrites are unchanged |
| bundle (upstream files, one or two lines each) | `main.ts`: every page but the calculator home is `() => import(...)` (the info children too, `/info/tuning-odds` included). `CalculatorDamages.vue` / `CalculatorLiveResultRotations.vue`: `CalculatorDamageChart` through `defineAsyncComponent` (chart.js and its datalabels plugin leave the entry). `CalculatorEchoImporter.vue`: both parsers async (tesseract.js, the build-card scanner, `sim/echoScan` load when the importer opens). `utils/exportCardImage.ts`: `html-to-image` imported on the first export. `stores/{settings,inventory,character}.js`: `import merge from "lodash/merge"` (the whole CJS lodash was in a preloaded chunk; same function, same lodash 4.18.1 — a 20 000-case differential run against `_.merge`, result and mutated target, found no difference). `sim/rankings/rileyNames.ts`: `ALIAS` / `appKeyOf` / `rileyNameOf` moved out of `castMapper.ts` (re-exported there), so presets / account code no longer pull the cast mapper into the entry |

**Pool dedup (exact).** Two echoes with the same signature are the same species (the signature's first field), and
`generateLoadouts` never puts a species in a loadout twice, so a loadout holds at most one copy of any signature.
Swapping every echo for the first copy of its signature gives a valid loadout with the same key that the walk reaches
earlier (its sorted index tuple is element-wise smaller), and upstream's hash keeps exactly that first loadout of each
key. So the deduped pool yields the same loadouts, the same echo objects (owned echoes — nothing is synthesised, no id
mapping needed) in the same order, and the generator hashes nothing. `prepareOptimizerEchoPool` falls back to the
untouched pool (upstream's dedup still runs) when that argument does not hold: no main echo (slot 0 is then the
lowest-index echo, which a swap can change), a species that is not a plain string or contains ":", a signature with
"|" in it, or two kept echoes sharing an `echoId`.

**Dominated partial loadouts (exact top-N scores).** Under "Any" with a main echo and a deduped pool, a loadout with
fewer than five echoes is not scored when at least topN (5) single echoes could still be added to it. Each extension is
generated and, by monotonicity, matches or beats it on the score and on every min-stat floor; by induction every
skipped loadout is matched by ≥ topN distinct scored ones, so the top-N score list cannot change. Monotonicity — every
final stat and every score is non-decreasing in an added echo — was checked in the code for all three target types:

- stats: an echo adds non-negative main/sub stats; `combineBuffObjects` / `addEchoBuffs` add them as one more term of
  a sum; `totalAtk/Hp/Def` = base × (1 + % / 100) + flat; set bonuses only grow (at most two non-1-piece bonuses fit in
  five echoes and `getSetBonusEffects` has two slots for them — pinned by the test); `AdditionalBase` is
  `floor((stat − min) / step) × value` capped and clamped ≥ 0, `CritOverflow` likewise; Rebecca's ×1.4 edge case is a
  positive factor; the main echo is slot 0 and never changes;
- `Attack:` / `Rotation:` damage: a product of non-negative factors, each non-decreasing in the echo-side inputs
  (ATK/HP/DEF/ER value, the bonus sum, deepen, `(800+8L) / (… × (1 − defIgnore))`, the piecewise resistance, crit
  average `1 + min(CR, 1) × (CD − 1)` with CD ≥ 1.5); heal / shield / tune break / negative status / fixed hits are the
  same shape or constant; a rotation sums its actions in a fixed order; the `a || b` fallbacks in `attacks.ts` read the
  same loadout's `finalStats` on both sides in the optimizer path; attack unlocks (`enabledAttacks.ts`, Ryan's #622)
  come from resonance-chain and self buffs, which are loadout-independent in a run, and a set's own `EnableAttack`
  (Midnight Veil 5) only switches on with the set; IEEE rounding is monotone, so the computed values keep the order (an
  echo that adds nothing to a stat leaves it bit-identical);
- preconditions checked per run by `canSkipDominatedPartials` (else nothing is skipped): no negative substat value,
  set-passive stat, custom buff, per-action rotation buff or hit count (the editor clamps counts to ≥ 1, an imported
  rotation might not), enemy resistance ≤ 100 %, and a `Stat:` / `Attack:` / `Rotation:` target. Game data (talent
  maps, modifiers) is pinned by the test.

**Ties.** When several loadouts share the 5th score, which of them fills the last places — and the display order
inside a group of equal scores — can differ from before. Upstream does not define it either: which tied loadout lands
first depends on batch size, worker count and worker timing. Scores never differ.

Equivalence harness (outside the repo, `/tmp/perf-harness/`: `prep.mjs` writes importable copies of plus's
`generator.worker.ts` / `processor.worker.ts` (from `git show plus:…`) and of the worktree's, one copy per simulated
worker; `equiv.mts` drives each pipeline through a port of `optimizeWithWorkers` — FIFO message delivery, every message
structured-cloned, the generator's continue back-pressure honoured — in one thread; run from the worktree with
`npx tsx`). The context, set-passive and main-echo stats are built from the export, close to what the panel emits (both pipelines
get the same inputs). 39 configs:
every saved optimizer config in both exports (stale rotation targets swapped for the character's longest rotation, or
`Stat:totalAtk` where it has none), plus Stat / Attack / Crit / Normal targets, min-stat floors, 43311 / 44111, batch
500, 16 and 32 workers (2 and 4 generator shards), two main species (Cartethyia's Fleurdelys + Kelpie, four and three
copies; Galbrena's Corrosaurus + Leviathan), injected stat-identical copies (with shards), no main echo, and a negative
custom buff (skip off). Result (2026-10-26, on plus 5fc8af7b): 39/39 equal score lists, 33 identical result lists,
6 differing only in the order or the pick inside equal-score groups; every reported echo is an owned inventory echo,
field for field; 8,709,188 domination checks on the 27 configs where the skip applies (each of the 417,560 skipped
loadouts against every one-echo extension, scored by plus's own processor), 0 violations.

| Measured (Node, one thread, simulated workers) | plus | now |
|---|---|---|
| generation, Galbrena (54 echoes, 3 sets, Any; 469,462 loadouts) | 8.8 s | 0.22 s |
| generation, Aemeath / Xuanling (43311) | 279 ms / 688 ms | 10 ms / 26 ms |
| generation, Aemeath pool with 13 stat-identical copies | 1.5 s | 10 ms |
| loadouts scored, Galbrena / Aemeath / Sigrika (Any) | 469,462 / 19,152 / 2,124 | 390,824 / 13,240 / 1,266 |
| whole pipeline, Galbrena rotation / Galbrena `Stat:totalAtk` | 96.9 s / 20.0 s | 78.0 s / 8.0 s |
| whole pipeline, Aemeath rotation / Xuanling 43311 rotation | 4.8 s / 15.3 s | 3.2 s / 14.1 s |
| **browser**, dev server (8 workers, David's data), Galbrena `Stat:totalAtk` / Aemeath rotation | 7.9 s / 2.5 s | 1.5 s / 2.4 s |
| **browser**, production build (`vite preview`), same two runs | 7.8 s / 2.1 s | 1.2 s / 1.6 s |

The browser's "Evaluated N loadouts" now counts the loadouts scored (13,240 for Aemeath, was 19,152); the top five
are the same numbers in both builds.

| Bundle (`npx vite build`, 2026-10-26) | plus 5fc8af7b | now |
|---|---|---|
| entry chunk `index-*.js` (Vite's figures) | 2,456.57 kB, 630.25 kB gzip | 1,390.35 kB, 344.02 kB gzip |
| JS on first load (entry + every modulepreload, gzip -9) | 2,631 kB, 686 kB gzip | 1,848 kB, 452 kB gzip |
| JS + CSS on first load | 2,912 kB, 731 kB gzip | 2,116 kB, 495 kB gzip |

Things learned:
- Vercel turns each `headers` entry into a route with `continue: true` (`convertHeaders` in `@vercel/routing-utils`),
  and the router assigns the headers of every matching route in order into one object, so a later entry that sets the
  same key wins (Next.js documents the same rule: "the last header key will override the first"). So the catch-all
  `no-store` comes first and the `/assets/` rule last; it excludes `/assets/init.js`, which is the umami script behind
  a rewrite, not a hashed file. If the order rule ever flipped, the result is today's no-store.
- `content/updates.ts` (95 kB, the whole changelog) stays in the entry: `AppUpdateBanner` reads `currentAnnouncement`
  from the same module. Splitting that constant into its own file is an upstream PR candidate.
- Still in the entry and left alone: `buffs/index.ts` (97 kB), `enemies/index.ts` (66 kB), the v3 workspaces, and
  `calcDamage` building three HTML breakdown strings per attack for every scored loadout (a scoring-time cost inside
  the published formulas package).
- The first harness lived in /tmp and was wiped between sessions; `prep.mjs` + `equiv.mts` rebuild the comparison from
  `git show plus:` in a few minutes, so keep the recipe above rather than a copy of the old code.

## Riley run seam (Wave 0) — `src/sim/engine/` (2026-10-26)

One shared seam over Riley's engine for the batch-2 pages (energy check, rotation view, ToA clear check): his
traced team run **at the player's own account** (the fork's `mine` Team Cost, their echoes as the "My build"
spread) as plain, serialisable data — `RunLite`. Nothing built on it touches his engine; a layout change on his
side touches `toRunLite` alone.

| Piece | Role |
|---|---|
| `rileyRun.ts` | the core, pure over the engine modules handed in (`RileyEngine` = his `solver` / `teamrun` / `stats` / `model` / `substats` + the commit): `registerAccount` (`setAccountState` + every `setMySubstat(customSubstats("My build", …))`, builds that went away cleared; idempotent per account key + builds key), `solveMine(keys)` → `MineSolve[]` (the table's top row per key at `cost: "mine"`: picks, row key, DPS, `bySlot`, per member weapon/rank, echo label, sets, main echo, main-stat layout, spread, ER rolls of the tier worn — null on the player's own spread — owned, share), `tracedRun(key, picks \| null)` → `RunLite`, `traceLive` (the live `TeamRun`, for an import), `listTeams`, `blockedKeysOf`, `bestOf`, `memoKey`, `heldOf`. **`toRunLite` is the one function that reads his run / `ChainGroup` / snapshot fields** |
| `RunLite` | `members` (as above + `maxEnergy` ×100, `minEr`, `minCritRate`, `pick`), `total` (DPS) / `bySlot` / `seconds` / `sectionSeconds` / `sectionTotals`, `slots` (members, then "Tune Break"), `rows` (one per report line, field-summary lines dropped: member, slot where it differs, action, label, cast kind, cancel tag, section, `frame` / `frames` at 60 fps, `active`, `triggered` / `spill` / `endsLoop`, energy + concerto ×100 as his Energy column shows them, damage, `critRate` / `critDmg` as the damage formula read them — damage-weighted over a folded group — and `critOver`, the damage dealt at ≥ 100 % Crit Rate; held buffs as `[index into buffs, frames left]` for local / global / enemy), `buffs` (the interned `[name, source]` table), `hits` (`[frame, slot, member, damage]` in landing order: Σ damage × 60 / frames = `total`), `needs` (`detailFor(run).needs` verbatim: `{ bar, minEr, constant, gen: { hit, flat, spend, shared } }`), `engine` (commit, account key, builds key, spread), `units` |
| `rileyWorker.ts` | the worker protocol: `createRileyHandler(engine, post)` answers `{ type: "wtplus:riley", id, op: "teams" \| "solveMine" \| "trace" }` (+ `wtplus:riley:cancel`), one unit per macrotask (a solve's next team, a whole run) so a cancel lands between; progress per team |
| `rankings/solver.worker.ts` | the existing worker entry answers those messages too (statically imports `page/model.ts` now, for `TEAMS` / `rowFromKey` / `detailFor`) — no second worker entry; Riley's own messages and the `mySubstats` / `accountState` ones are untouched |
| `rileyClient.ts` | the browser side: `rileyClient()` (one worker for the app) → `teams` / `blocked` / `teamKeysFor(characterIds)` / `solveMine(keys, { account, subs, signal, onProgress })` / `bestFor(characterIds)` / `tracedRun(key, picks, …)`; request ids, AbortSignal cancellation, an LRU memo keyed by `memoKey` (op + engine commit + account + builds + spread + team key + picks); failures and cancels are never memoised. **The release guard runs here**: `blockedKeysOf(teams, notInApp)` on the main thread, the worker only receives the blocked keys |
| `rileyAccount.ts` / `useRileyAccount.ts` | `rileyAccountOf(characters, inventory, teams)` → `RileyAccount` (`accountStateOf` → `rileyAccountEntries` → `accountKeyOf`, `buildRollsOf` for the builds, one `rollsKey` over every roll); the composable is the same over the stores (what RankingsView.vue registers) |
| `rileyNode.ts` | Node: `loadRileyEngine()` (the fork's sources through a `file:` URL, as `syncTeamsHeadless.ts`; commit from `git rev-parse` in the submodule), `rileyHeadless(export \| account \| null)` → the same surface, synchronous |
| `traceCli.ts` + `cli/index.ts` | `npm run cli -- trace <t404 \| saved team \| "Shorekeeper,Lynae,Iuno"> [--subs mine\|standard\|high] [--full] [--pretty]`: members, DPS, seconds, ER need per member (max of the loop's bar and the kit floor) beside the gear's ER; `--full` prints the whole RunLite |
| `engineCommit.ts` | GENERATED by `scripts/skittle-sync.mjs`: the submodule commit for the browser (no git there) |
| `__fixtures__/runLite.json` + `syntheticAccount.ts` | one RunLite (63 KB) for consumers' unit tests: t404 Shorekeeper · Lynae · Iuno on a **made-up** account — Shorekeeper S2 Variation R5 (kit floor 240 % over a ~188 % loop), Lynae S0 on ChemX32 with 2 ER rolls, Iuno S0 on a crit-heavy "My build" past 100 % Crit Rate, a Tune Break slot |
| `rileyRun.test.ts` | on the real engine (node environment, ~3 s): the commit constant = the submodule's, Lily blocked; solve rows and skips (unreleased / unknown, never thrown); solve DPS = traced DPS; RunLite JSON round trip, two runs identical, `needs` = `detailFor`'s, hits add up to the DPS, rows / slots / buffs consistent, crit-overcap share in (0, 1]; refusals (unreleased, stale picks, unknown key); the committed fixture's shape (and, on its commit, the fixture itself); `registerAccount` clears builds; `memoKey`; the worker handler's answers = the Node path's (parity) and cancel; the client over an in-process worker (structured-cloned): memo, progress, `bestFor`, abort |

Rules:
- **Released content only.** A team with a member the app does not list (`notInApp`, Lily since 7bcbb24) comes back
  from `solveMine` as `skipped` / `notInApp`; `tracedRun` refuses it (`RunError.reason = "notInApp"`). Keep it so.
- **DPS.** `total` / `bySlot` are damage per second (since his 7bcbb24); label them DPS and compare them only with the
  app's DPS (damage ÷ the rotation's duration). The fight is opener + 3 loops (~100 s): nothing lands after it.
- **Units.** Energy and concerto are ×100 (`units`), ER figures in `needs` are % (the app's `finalStats.energyRegen` is a
  decimal: 1.184 = 118.4 %). Need = `max(bar ?? 0, minEr)`; no gate where `maxEnergy` is 0 and `minEr` is 0.
- **Defaults.** `subs: "mine"` (the account's own echoes where the app has them, ChemX32 where not); the picks are his
  search's (weapon, sets, main stats) with the main stats settled in that spread — `subs: "standard"` for his table.
- **Team keys are slots in his list**: they move with his commits. Persist nothing keyed on a team key without the
  engine commit (`memoKey` carries it); map saved teams with `teamKeysFor(characterIds)` (`rileyTeamKeysFor`).
- **Cost.** One solve + trace is ~110 ms warm headless (median of David's 28 Riley teams: solve 54 ms per key,
  trace 54 ms incl. `detailFor` ~20–50 ms; the first of a process ~0.5 s cold). Scope account features to saved /
  synced teams; a "scan everything" stays opt-in.

Things learned:
- `stats[Stat.CritRate]` already contains the Negative-Status-scoped crit (context.ts `writeSplits` writes the scoped
  part beside it): a dot / tune hit reads `subtypeCritRate` **instead of**, never on top of, the plain one. The batch-2
  spec's "`stats[CritRate] + subtypeCritRate`" would double-count; `critOf` follows `damageFactors`.
- A folded group line can mix crit rates (12 of 25 groups on one run): `critOver` is summed per folded cast, so an
  overcap share is exact.
- `collapseFields` numbers its field windows with a global counter (`fieldKey`), and snapshots carry a global
  evaluation `seq`: neither is in RunLite, which is what keeps two runs byte-identical.
- Vite builds workers as IIFE by default (`worker.format`), which does not code-split: `page/model.ts` is a static import
  of `solver.worker.ts` rather than a lazy one (the /rankings pool loads it too; a few ms per worker).
- vitest loads his sources through the same `file:` URL as tsx (his `.js` imports resolve to `.ts`); the engine tests
  pin `// @vitest-environment node`.

Capture the fixture again after a submodule bump (the test compares it field for field while its commit matches):
`npx tsx scripts/capture-runlite.mts --write` — the script is `rileyHeadless(SYNTHETIC_ACCOUNT)` → `bestFor(SYNTHETIC_TEAM)`
→ `tracedRun(best.teamKey, best.best.picks)` → `JSON.stringify` into `__fixtures__/runLite.json`; recreate it from
those four lines if /tmp was cleared.

## Echo plan — the in-game Echo Management grid from the roster (batch 2, 2026-10-26) — `src/sim/echoPlan/`

`/echo-plan` builds the plan the game applies since 3.2 (Kuro's notes, article 4447): per Sonata Effect, every new
echo is locked or marked for discard by the main stat of its COST 4 / 3 / 1 row. WT+ works out which main stats the
roster wants, shows one card per Sonata in the in-game shape, and tracks what the player has tapped in. Plan Codes are
server-side IDs, so WT+ never makes or reads one: the grid is tapped in by hand once, and only the player's own code
text is kept per server.

| Piece | Role |
|---|---|
| `catalog.ts` | pure: the Sonatas the app ships (`echoSetLabelMap` order = release order), the cost rows each one has (read off `mainEchoesData` classes — Shadow of Shattered Dreams is a lone 4-cost, so its card has one row), `COST_MAINS` (4: HP ATK DEF Crit. Rate Crit. DMG Healing Bonus · 3: HP ATK DEF Energy Regen + six elements · 1: HP ATK DEF), in-game labels, `normaliseMain` (store keys, older exports' `AeroDMGBonus`, in-game text, wuwa_calc's `CR`/`ER`/`atk`), `costOfEcho` (the echo's own class), `IN_GAME_SET_NAME` |
| `wants.ts` | pure: who wants which (Sonata, cost, main stat), with the source of each want — `equipped` (what the character wears: `characters[key].echoes`, inventory echo by `echoId` first, the `resolveCharacterEchoes` rule), `build` (every other saved build), `preset` (Ryan's curated `presets.ts` `echoes[].data.echoes`), `engine` (Riley's loadouts as the generated stock rotations describe them — `parseEngineLoadout` reads "…, Thread of Severed Fate 3pc + Havoc Eclipse 2pc + …, main stats 44111 CD CD atk atk atk"), `default` (nothing else: from the kit's element and role — `kitFactsOf` reads the character's own data: a healer gets Rejuvenating Glow with Healing Bonus / scaling-stat / Energy Regen main stats, anyone else their element's 1.0 set with crit 4-costs, the element 3-cost and their scaling stat). `collectWants` = owned characters (a weapon — the Account State's rule) + planned ones (switch), minus `notInApp` and excluded ones; a Rover form with no loadouts of its own reads his wuwa_calc twin's |
| `plan.ts` | pure: wants + switches + overrides → `EchoPlan` (cards → rows → chips with verdict, reason — `wanted` / `critPair` / `keepAll4` / `override` / `unwanted` / `thrown` / `off` — and who wants it), `planText` (the "Copy as text" lock list) |
| `diff.ts` | pure: `snapshotOf` a card, `planProgress` against the saved ticks — `done` / `changed` (the chips that flipped since the tick) / `todo` / `idle` (no plan, nothing to do) — and `newSets` (Sonatas the page had never shown: a patch's new sets) |
| `storage.ts` | localStorage `wtplus:echoPlan:v1` = `{v, savedAt, appVersion, sets, grid, done, codes, server, planned, excluded, overrides, options}`; `parseState` never throws and keeps only well-formed fields |
| `sources.ts` | lazy loaders: `import.meta.glob("../../characters/*/presets.ts", { import: "echoes" })` and `loadWuwaCalcRotationPresets` (src/sim/presets) — only for the characters on the plan; for a character with neither, upstream's `getCharByName` (the calculator's own per-character chunk) for the kit facts |
| `useEchoPlan.ts` | the page state: stores in, sources loaded once per character, plan + progress computed, state written back on every change |
| `EchoPlanView.vue`, `SonataCard.vue`, `EchoPlanChipSheet.vue`, `EchoPlanRoster.vue`, `EchoPlanCodes.vue`, `echoPlan.css` | the page: header + "How it works", KPIs, plan rules and sources, the Plan Code per server (America / Europe / Asia / SEA / TW-HK-MO), the characters panel (owned + planned, include / exclude, kit-default flag), the diff banner, filters (All / To set / Changed / Done) and search (Sonata or character), then three sections — cards to set (full grid), "Set in game" (ticked, folded to tiles) and "No plan" (tiles). Each chip opens a tap sheet (bottom sheet on a phone): why, who wants it from which source, and Auto / Lock / Discard |
| `echoPlan.test.ts` | the Cartethyia fixture's equipped echoes become KEEP chips; every curated preset reads legal main stats only (a 4-cost and 1-costs in every build); every generated wuwa_calc loadout parses; kit facts from real character data (Baizhi / Shorekeeper / Youhu heal, Taoqi / Yuanwu scale on DEF, Brant's self-heals don't make him a healer) and the kit default that follows; `loadSources` reads the role only where nothing else exists; Rover twin; `notInApp` and unarmed characters ignored; planned / excluded; off vs thrown; the crit pair (and its switch); keep-all-4; overrides; determinism; the diff (new set, changed chips); the saved state survives garbage and round-trips |

Rules:
- A chip somebody on the roster wants is **Lock**; every other chip of a planned card is **Discard**. A split build
  (3pc + 2pc) is wanted in both Sonatas — which echo sits where isn't stated, so the plan errs towards keeping.
- **Pair the crit 4-costs** (on by default): a wanted COST 4 Crit. Rate keeps COST 4 Crit. DMG too, and the other way
  round — a build takes whichever its substats balance (Ryan's presets ship "Standard CR" and "Standard CD" builds side
  by side), so the exact one alone would discard a usable 4-cost of a set the roster wears.
- **Keep every 4-cost** locks a planned card's whole 4-cost row (Batch Mainstat Modification can re-roll it since 3.1).
- A Sonata nobody wants has **no plan** (the game leaves its echoes alone); **Throw unused Sonatas** makes it discard
  everything instead. A thrown set is thrown whole — keep-all-4 doesn't reach it.
- The player's per-chip override beats everything; an override on an unused Sonata gives it a plan.
- Done ticks store the card's snapshot; a card whose verdicts move afterwards (patch, roster, switch, override) comes
  back up as Changed with the flipped chips outlined. A first visit takes the current Sonatas as the baseline, so
  only a later patch's sets read as New.
- Released content only: the set list is the app's; characters go through `notInApp`; planned characters can only be
  picked from `allCharactersList`.

Things learned:
- The calculator calls Havoc's 1.0 set "Havoc Eclipse"; the game says **Sun-sinking Eclipse** (the old
  `SunSinkingEclipse` key was removed upstream on 2026-07-18). The card shows the in-game name and notes the app's.
- Ryan's curated presets carry slot errors the app never noticed: Suoming's SubDPS builds swap their slots' `type`s
  (the echo's own class fixes them), Denia's and Lucilla's "Standard" builds put Crit Rate / Crit DMG on a 3-cost
  (VoidwingMoth / Glommoth are Elite) — those slots are skipped, never kept — and Cartethyia's preset has a 1-cost with
  no main stat. Upstream data, left alone (solo phase).
- The glob over `presets.ts` makes Rollup split each character's presets into its own chunk (it was inlined into the
  character chunk): loading a character in the calculator now fetches one more small chunk, preloaded in parallel.
  The alternative — `getCharByName` per owned character — would pull ~1 MB of attack/buff data into this page.
- The crit pair matters: on David's export 7 of the 26 planned cards wanted only one of Crit. Rate / Crit. DMG at COST 4
  (Carlotta's Frosty Resolve would have discarded every Crit. DMG 4-cost). With the pair on: 132 chips to lock.
- Kit role from the app's data, two signals: the attack entries' `attribute` (`"hp"` / `"defense"`, none = ATK —
  Yuanwu's say `defense`) and the live result bar's first stat (`basic.liveResultBarStats`: `totalHp` for Shorekeeper,
  whose attacks carry no attribute). Neither is enough alone. Healer = four or more `type: "Healing"` entries (Brant
  and Aero Rover have three self-heals). 12 released characters have no preset and no loadout today (Aalto, Baizhi,
  Calcharo, Chixia, Lingyang, Lumi, both Havoc Rovers, Taoqi, Yangyang, Youhu, Yuanwu); the role is only read for them.
- The plan is a few milliseconds for a 24-character account (David's export: 26 of 37 Sonatas planned, 132 chips to
  lock), so it runs on the main thread; only the preset chunks are awaited, behind a skeleton.

Gates: `echoPlan.test.ts`, `cypress/e2e/echoPlan.cy.ts` (v3 seeded via onBeforeLoad: grid from the account, switches,
done ticks across a reload, the changed state and banner, the tap sheet and an override, the Plan Code, the empty state
→ planned characters, classic UI), `phoneLayout.cy.ts` ("keeps the echo plan inside the viewport…": 360 px at 100 %
and 412 px at 130 % — no horizontal scroll, the rules folded, the 3-cost row wrapping, the phone bar, the bottom sheet).
Not done: Riley's per-team `mine` picks (Wave 0 `solveMine`) as a source, and an ER-aware 3-cost choice (er-check).

## Share cards — `src/sim/share/` (batch 2, 2026-10-26)

`/share` and a share sheet: a build or a team becomes a **PNG that carries the build itself** (a 1200 × 630 post card,
a 1080 × 1350 team card in Fribbels' "Team Showcase" layout) or a **compact link**; dropping the card (or opening the
link) on any WT+ restores it exactly — no OCR — as a *new* build after a merge preview. Desktop ↔ phone with no server.

| Piece | Role |
|---|---|
| `pngMeta.ts` | PNG `iTXt` write / read: chunk walk, table CRC-32, 16 KB cap on the stored data (512 KB once inflated), the chunk goes just before IEND and replaces an earlier one under the same keyword; compressed iTXt (flag 1, zlib through `CompressionStream("deflate")`) on write, both forms on read; a chunk with a bad CRC, over the cap or malformed is **skipped**, never thrown, so one bad chunk can't hide a good one. Port of Tacet Lab's `src/scanner/card-metadata.ts` (DJ12421/Tacet-Lab, **GPL-3.0**, commit 5386bfa — attribution in the file header) |
| `buildCodec.ts` | **the share format** (below): `buildPayload` / `teamPayload` from the store records (echoes inlined from the inventory through `resolveCharacterEchoes`), `withDetail` (full → lean → gear), `parseSharePayload` (validation, `sanitize` drops `__proto__`/`constructor` keys and non-JSON values, `cleanReceivedConfig` drops every never-shared key from a received config and any engine-read field in the wrong shape (`rotations` not a list, `buffs` not an object …), non-object actions are dropped, **version gate**: a newer `v` comes back read-only), `buildFieldsFromMember` (back to store fields; a gear-only member gets its set bonuses from `getSetBonusEffects` and its main echo from slot 1), the "is it in this app" checks (`isKnownCharacter` = `allCharactersList`, released only; `isKnownWeapon` per weapon type; `echoProblem`: known echo and set, cost 1/3/4, a main stat with a `statsTable` value at that rarity, substats in `subStatsTable`'s range — a received `mainEcho` the app lacks and non-plain team enemy settings are dropped too), and `fromTacetCard` (a `TacetLabCard` chunk → a gear payload, with a warning per thing that can't come across) |
| `tacetIds.ts` + `scripts/share-tacet-ids.ts` | GENERATED: Tacet Lab's in-game catalogue ids → app keys (64 characters, 124 weapons, all matched by name; Rover by element + gender). Only ids that land on something the app lists are written. Echo and set names map at runtime through `mainEchoesData` / `echoSetLabelMap` (the "Phantom:" skin prefix dropped) |
| `link.ts` | `/share#b=<base64url(deflate-raw(JSON))>` — the data is in the fragment, which browsers never send to a server; the Umami tracker would (it reports `location.href`), so `src/utils/analytics.ts` sets `data-exclude-hash` (one upstream hook line). `shareLink` walks the tiers until the URL is ≤ 1,900 characters (Discord's 2,000 less a sentence) or returns null ("share the card") |
| `mergePreview.ts` | `planImport` (pure): per member "adds build *Shared · <date>*, active build unchanged" / "new character" / "skip: not in this app"; each echo **owned** (matched by `echoFingerprint` — name, set, cost, rarity, main stat, substats order-free to 0.01, so "5" vs 5 and slot order don't matter) / **new** / **skipped** (with the reason); notes when talents or level differ (those belong to the character, so the user's stay). `applyImport` returns the records to write: an existing character gets one more entry in `builds` and nothing else; a missing one is created with the build as its only (active) build; new echoes get fresh ids; a team becomes a new saved team pinned (`buildIds`) to the new builds |
| `headline.ts` | the engine number: the build's best rotation (`rotationCandidates` + `scoreRotation` — the /my-rankings pick, on a non-active build through `charactersWithBuild`) or the team's own rotation (`resolveTeamCharacters` + `calcTeamRotationDamage`, pinned builds, the auto team-buffs switch), both at `RANKING_ENEMY`; **DPS only when the rotation has a duration**, else "avg DMG / rotation". `verifyBuildHeadline` re-scores a received card's own rotation on its own build in THIS app ("Checked here: … the same as the card") |
| `cardView.ts` | what a card shows, from the payload alone (no stores): character / weapon modules, stat list from `buildCharacterCalculationContext(…, { alwaysEnabledOnly: true })` on the card's inline echoes (upstream's build-card semantics, issue #383) formatted with upstream's `displayInt` / `displayPercentage` (flat stats floored, so the card reads exactly what the build card reads), echo tiles with roll-quality buckets (upstream's ≤ 40 / 60 / 80 thresholds), CV. The sheet and the import preview render the same view from the same data |
| `PostCard.vue` / `TeamCard.vue` | the templates — **fixed px, not rem** (a phone's 130 % text must not reflow an image) and their **own `data-theme`** (dark / light toggle), so an export looks the same in every app theme; accent = the element colour (darkened for text on the light card) |
| `CardPreview.vue` | the card at design size inside a frame scaled to the box (height-capped for the tall team card); the capture takes the unscaled card node |
| `capture.ts` | html-to-image `toBlob` at the card's size × 2 (upstream's `exportCardImage.ts` is fixed at 1920 × 1080 and left alone), `data-export-hide` filter, a transparent placeholder for a failed image, then `embedPayload` (the tier that fits the chunk cap); html-to-image is imported on the first export; download, clipboard (picture only — see below), Web Share Level 2 with a file where `navigator.canShare({ files })` (a `NotAllowedError` comes back as "needs-tap") |
| `readCard.ts` | what a dropped / picked / pasted file is: WT+ card → `WTPlusBuild`; Tacet Lab card → `TacetLabCard`; a JPEG / WebP / AVIF → "re-compressed, no data"; a PNG without either → "no data (screenshot or re-saved)" plus the pointer to upstream's OCR importer (Echoes › Import) |
| `ShareSheet.vue` | the share dialog (DaisyUI `modal`, so `phone.css` § 6 makes it a bottom sheet): live preview, engine numbers on/off, name & UID (off every time it opens; the values are upstream's `settings.config.buildCard.username/uid`), dark / light card, Download PNG, Share… (only where file sharing exists), Copy link (length shown, `data-test-share-link-url` carries it), Copy picture only; the last card rendered with its data is kept (keyed by everything on it), so Download then Share — or the second tap Share sometimes needs — doesn't capture again; remembered choices in `localStorage["wtplus:share:prefs"]` |
| `ShareView.vue` | route `/share` (lazy, `main.ts`): the whole page is a drop target (plus file input and Ctrl+V paste of an image or a link), `#b=` links open on arrival, the import preview (the card rendered from the data, the plan, warnings, read-only banner) and **Add to my account** → store writes in one `$patch` per store, then the fragment is cleared; "Share from your account" pickers (character + build, team) |
| `ShareButton.vue` | one button → the sheet (`:source="{ kind: 'build', charId, buildId? }"` or `{ kind: 'team', teamId }`); the sheet mounts on first click, so a table full of them costs nothing. Used on /my-rankings (an opened character row's "Share build", a saved team row's "Share"; 2026-10-31). `phoneLabel` shows the label below `md` only (an icon button the size of its neighbours on desktop, words on a phone) |
| `shareRequest.ts` + `ShareSheetHost.vue` | "share this" from outside a page (the command palette's Share commands, 2026-10-31): `requestShare(source)` sets a module-level request; `PlusShell.vue` mounts the host (`defineAsyncComponent`, so the sheet's code loads on the first request) and it opens the sheet over whatever page is showing |
| `ShareBuildStrip.vue` | the bar over upstream's build card: `<WtPlusShareStrip>` is one tag in `Calculator.vue`'s build-card screen, registered globally (async, so the share code loads on first use) by one line in `main.ts` — `CalculatorBuildCard.vue` is not edited |
| `share.test.ts` | chunk round trip (CRC valid, corrupt chunk skipped, a good chunk after a bad one found, truncated file, > 16 KB refused on write and skipped on read), a Tacet Lab card built byte-for-byte like its embed (bitwise CRC), format round trip on the Cartethyia fixture (substats exact), version gate, prototype keys, never-shared / mis-shaped keys dropped on read (and the imported build keeps its own id), notes never shared, the rAF fallback (overlapping captures restore the browser's functions, a cancelled frame never runs), link ≤ 1,900 (lean 1,399 chars on the fixture, full 2,940, gear 684), the plan (5 owned by fingerprint; active build, live fields and other builds untouched; inputs not mutated), **an empty account restores identical `finalStats` and identical rotation damage**, skips with reasons, gear-only sequence + set bonuses; the verify pass added: local card dates (time-zone proof), `echoProblem` refusing impossible echoes, a received unknown `mainEcho` / non-plain enemy settings dropped, a team import (new team pinned to the new builds, active builds untouched, empty slots' actions dropped) |
| `cypress/e2e/share.cy.ts` | v3, seeded through `onBeforeLoad`: export through the real Download button → the PNG back through the file input → 5 echoes "owned", "Checked here … the same", confirm → one more build, active build and weapon unchanged, no duplicate echoes; a link (≤ 1,900) into an empty account → new character with the build active and 5 new echoes, fragment cleared; a JPEG → the "no data" explanation; a link whose only character the app lacks → the "nothing to show" note and a disabled import (no endless spinner); the strip over the calculator's build card. `phoneLayout.cy.ts` covers `/share`, the sheet and an import preview at 360 px |

**Share format v1** (`format: "wtplus-build"`; PNG keyword `WTPlusBuild`, compressed iTXt):

```
{ format: "wtplus-build", v: 1, kind: "build" | "team", app: "wtplus@<commit>", createdAt: "YYYY-MM-DD",
  detail: "full" | "lean" | "gear",
  members: [{ charId, buildName, level|null, sequence, talents|null, weapon: { id, level|null, rank } | null,
              mainEcho|null, echoes: [{ key, set, cost, rarity, main, subs: [[stat, value] ×≤5] } | null ×5],
              config?: { …every other build field verbatim } }],
  team?: { name, characterIds[3], actions?, duration?, enemyConfig?, handoffs?, description? },
  rotation?: { name, duration, actions },            // the headline's rotation (full, builds only)
  headline?: { metric: "dps"|"dpr", value, avgDamage, dps|null, rotationName, source, enemy, perSlot?,
               benchmarkPct?, erNeedMet? },          // the last two reserved for batch-1's benchmark / ER check
  owner?: { name?, uid? } }                          // only when the sharer switched it on
```

Rules:
- **Imports only add.** Never `activeBuildId`, never the live fields, never another build; a team is a new team. A
  character, weapon or echo the app doesn't list is skipped and named (released content only — `allCharactersList`,
  the same list as the `notInApp` guard).
- **Inventory integrity:** an echo goes into the inventory only if the game could drop it (`echoProblem`); a
  hand-made card's 500 % Crit Rate roll is skipped and named, never stored.
- **Never shared:** inventory ids (echoes travel inline), `echoPresetId`, the custom portrait (a data URL), the
  build-card colour, personal `notes` and `progressOverrides` (private text and checkmarks the card never shows),
  account keys; the UID only on request. The **reader drops the same keys** from a received config, and the
  imported build's `id` / `name` / timestamps are written after its fields — a hand-made card can't plant a build
  id, a `builds` list, a portrait URL or a character level. `characterLevel` / `talents` travel but are the
  character's, so an existing character keeps its own.
- **Detail tiers:** full (everything; the card) → lean (no member rotations, optimizer settings, Team Buffs panel or
  headline rotation; most single-build links) → gear (what a Tacet Lab card holds; team links). On David's export every
  build fits a link at full or lean; teams (~5 KB compressed in a card) go gear in a link. Biggest build chunk 2.4 KB.
- A received card that is a newer `v` shows read-only; bump `SHARE_VERSION` only for a breaking change, and keep the
  reader accepting every older version.

Things learned:
- **html-to-image 1.11 waits for a `requestAnimationFrame` after decoding every image** (`util.js createImage`). rAF
  never fires in a background tab or headless Electron, so a capture there hangs forever — upstream's own
  `buildCard.cy.ts` "downloads the build card as a PNG" times out in this sandbox for that reason. `captureCard` races
  rAF against a 50 ms timer for the length of a capture (`withFrameFallback`); with it the export works in Cypress and
  when a phone user switches apps mid-export.
- **Copying an image never carries the data:** browsers decode and re-encode clipboard images. The sheet says so;
  Download and Share keep the file. Reddit, X and Imgur re-encode uploads too; Discord attachments, mail and drives keep
  them. The fallback for a stripped card is the link.
- `source.value === src` is never true for an object kept in a `ref` (the ref returns a reactive proxy) — the first cut
  of the sheet kept "scoring…" forever that way; a load token decides which load is current.
- The CRC sample PNG in Tacet Lab's own test has a bad IDAT CRC (its reader never checks other chunks); the tests use
  a clean 1 × 1 PNG.
- DaisyUI's dialog reports opacity 0 to Cypress while it fades in: assert `exist` and click with `force` inside it.
- The rAF patch is shared by overlapping captures (a depth count; the last one out restores the browser's functions)
  and keeps each request's fallback timer in a closure, with `cancelAnimationFrame` patched alongside. The first cut
  saved and restored `window.requestAnimationFrame` per capture, so two overlapping captures left the patch on for
  good, and keying timers by frame id lost callbacks when ids repeated.
- `navigator.share` must start within a few seconds of the tap; a 2× team card can take longer than that on a
  phone, so the sheet keeps the rendered file and asks for one more tap. Safari also refuses a clipboard write that
  starts after an await — the `ClipboardItem` gets the PNG as a promise.
- Upstream's build card floors HP / ATK / DEF (`displayInt`); `Math.round` put the share card 1 above it.
- Vercel exposes the commit to Vite as `VITE_VERCEL_GIT_COMMIT_SHA`; locally a card says `wtplus@dev`.

Verify pass (2026-10-26):
- **Umami reports `location.href`, fragment included**, unless the script tag carries `data-exclude-hash="true"`
  (checked in cloud.umami.is/script.js: the first pageview, every route change and the referrer all go through the
  same URL filter). Without it every opened share link would have sent the whole build — and a UID the sharer chose to
  show — to the analytics. `analytics.ts` sets it; Ryan's app has no hash routes, so his numbers don't change.
- **Read one env variable by its full name.** `appStamp` first read `import.meta.env` as an object, which makes Vite
  inline every `VITE_*` variable into the share chunk (on Vercel: the commit message, author and branch URLs). It now
  spells out `import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA` inside a `try` (plain tsx has no `import.meta.env`);
  checked with a build that set dummy `VITE_*` values: only the SHA lands in the chunk.
- **Card dates are local** (`localDate`): `toISOString()` is UTC, so a card made at 9 pm in the Americas was dated
  tomorrow and imported as "Shared · <tomorrow>". Tests pin `NOW` to local noon so they pass in every time zone.
- The sheet holds Download / Share / Copy link while the engine number is still being scored (an early export left it
  off the card and out of the link). Web Share sends a one-line caption, not the 1,700-character link: most apps paste
  the text beside the picture, and the picture already carries the build.
- A card with no character this app has used to leave the import preview on "Rendering the card…" forever; it says so
  now. A team card keeps three columns in slot order, with an "Empty slot" tile for a missing member.

Credit: Tacet Lab (DJ12421, GPL-3.0) for the card-in-a-PNG idea and the `TacetLabCard` format; Fribbels' HSR optimizer
for the Team Showcase layout.

## In-app AI, stage 1: the foundation and the engine tool registry — `src/sim/ai/` + `src/sim/live/` (Track "ai", 2026-10-12)

David's ask (2026-10-12): "more AI integration into the app itself". Claude is the interface, **the app's engine is
the source of truth**: every number Claude states must come from a tool result in the conversation. Stage 1 is the pure,
tested layer — bring-your-own key, client, pricing, a read-only tool registry over the engine, the prompt, the agent
loop, the conversation store, a CLI twin. Stage 2 builds the drawer UI on it; stage 3 the vision echo reader. Nothing
here is imported by the app yet, so the main bundle is unchanged; the drawer imports these modules lazily.

| Piece | What it does |
|---|---|
| `cli/exportShape.ts` | the pure half of `exportFile.ts` (which imports `node:fs`): `ExportFile`, `parseStore`, `parseExport`. `exportFile.ts` re-exports them, so the CLI and its tests are unchanged |
| `live/liveExport.ts` | `exportFromStores()` — the three persisted Pinia stores (character, inventory, teamRotations) as an `ExportFile`, JSON-cloned (Pinia proxies can't be structuredCloned and a tool must never mutate a store). `exportFromState()` is the pure core. Call it per question: a snapshot, not a view |
| `ai/models.ts` | the three model ids (never date-suffixed) — `claude-opus-5-5` default, `claude-sonnet-5-5`, `claude-haiku-5-5` — effort levels, which models take the server-side refusal fallback |
| `ai/aiSettings.ts` | the key: sessionStorage `wtplus:ai:key` by default, localStorage (same name) when "remember on this device" — one place at a time. Model / per-feature effort (chat medium, explain low, vision low, critique high) / soft budget per conversation (default $0.50) / remember flag in localStorage `wtplus:ai:settings`. Storage functions pure over a `StorageLike`; `useAiSettings()` is the reactive wrapper (module-level `ref`s, not Pinia) exposing `key.present` + a masked hint and `getApiKey()` on demand — the key never sits in reactive state. `redactKeys()` masks anything key-shaped in error text |
| `ai/client.ts` | `loadAnthropicSdk()` (dynamic `import("@anthropic-ai/sdk")`, once), `createAnthropicClient({ apiKey, browser })` (`dangerouslyAllowBrowser` in the browser, credential resolution under Node), `fallbackFields(model)` (`betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"` for Opus / Sonnet, nothing for Haiku), `describeError(err, sdk)` — the SDK's typed classes most specific first (abort → timeout → connection → 401 → 403 → 404 → 429 → 5xx / overloaded → 402 billing → 413 → 400 / 422) to one friendly sentence + `retryable` + request id, `refusalMessage()` |
| `ai/pricing.ts` | USD per request from `usage` (input, output, cache read, cache write at 1.25 × input; Haiku's >100K-prompt rates; a refusal fallback's `fallback_message` iterations at that model's price), running `UsageTotals`, `cacheHitRate`, `formatUsd` (four decimals under a cent) |
| `ai/schema.ts` | the flat schema type the tools use and `validateInput()` — run on every tool input before the tool (with `eager_input_streaming` the API no longer validates and the SDK's tolerant parser returns `{"team": 1}` for `{"team": 1x}` and `{}` for a cut-off `{"te`). String enums match case-insensitively (Claude may change the case). `strictSchemaProblems()` / `optionalParamCount()` keep the schemas inside what strict tool use accepts |
| `ai/tools/*.ts` + `index.ts` | twelve read-only tools (twenty since 2026-10-31: see "In-app AI: tools for the batch-2 pages") in a FIXED order (`AI_TOOLS`; tools render first in the cache prefix): `get_account_summary`, `calc_character`, `calc_team`, `rank_roster`, `substat_weights`, `what_if`, `list_rotations`, `list_team_presets`, `sequence_breakpoints`, `get_kit`, `search_inventory`, `rankings_link`. Each = `{ name, description (what the numbers mean and where they stop), input_schema (strict), provenance, run(input, ctx) → compact JSON }`, `ctx = { exp, now, autoBuffs }`. `toolDefinitions({ eager })` adds `strict: true` (+ `eager_input_streaming`); `runTool()` validates, runs, catches — unknown tool / invalid input / a throw all come back as an error result with a one-line `preview` for the timeline |
| `ai/tools/shared.ts` | display names (characters, weapons, echoes, sets, stats — Claude and the player read "Everbright Polestar"), rounding, loose name resolution (`resolveOwnCharacter` over the account, `resolveAnyCharacter` over the whole roster for kit / breakpoint questions), `compactJson()` — ≈2K tokens (8000 chars) at most: the longest list is halved until it fits and `_truncated` says which |
| `ai/tools/memo.ts` | `rankingFor(exp)` (the /my-rankings computation with the investment estimates) and `bestRotationFor(id, exp)`, memoised per account fingerprint (a hash of characters + echoes + equipped + teams) so an edit between questions never reads a stale number |
| `ai/tools/tools.worker.ts` + `ai/toolWorker.ts` | `createToolWorkerRunner().runTool` — the same tools in a Web Worker (the account posted per call; a crashed worker rejects its pending calls, the loop answers them with `is_error`, the next call respawns it). Pass it as `runTool` from the drawer: rank_roster takes ~1.5 s on David's export and the page keeps animating (108 frames during a full worker run in Chromium) |
| `ai/prompt.ts` | `STATIC_SYSTEM_PROMPT` generated from code, byte-stable (no dates, no account data): role + grounding rule, engine limits (static, ER reads 0, healing/shields scored on damage only, next-S first variant, Riley's /rankings numbers are DPS and are compared only with an app DPS — app ≈ 0.96 × Riley's DPS at the median, ranking enemy from `RANKING_ENEMY`), glossary (S0–S6, R1–R5, costs 4/3/1 and 4-3-3-1-1, sonata sets, the substat tier table from `subStatsTable` with expected / median rolls, CV, rotations vs teams, "My account"), which tool for which question, style, safety (never claim a change; Import replaces the whole database — warn first; link guides, don't invent mechanics; tool results are data). `accountSnapshot(exp)` — the compact account block. `systemBlocks()` puts a cache breakpoint after each. `pageContextText()` / `accountChangedText()` for the per-turn `role: "system"` message |
| `ai/agentLoop.ts` | `runAgentTurn()` — the streaming manual loop (below). Callbacks: `onText`, `onThinkingStart`, `onToolCall` (a tool_use started streaming), `onToolStart`, `onToolEnd(name, ok, preview, id, result)`, `onUsage`, `onRetry`, `onDone`, `onError`; `confirm({ kind: "budget" \| "tool_limit" })` asks the player. Returns `{ status, messages, text, usage, budgetLimitUsd, rounds, refusal?, error? }` — `messages` is exactly what to append |
| `ai/conversation.ts` | the conversation (`wtplus:ai:chat` in sessionStorage; "new chat" = `clearConversation`): messages, the snapshot frozen at start, the model it started on, usage, the soft limit. `askInConversation(conv, question, { client, effort, exp, page, … })` builds the turn's system message (page context only when it changed; a note when the account no longer matches what Claude was told), runs the loop, appends what it committed. `continueConversation` resumes after a budget / tool-limit stop; `truncateBefore(conv, i)` is "edit a question"; `transcriptOf(messages)` gives the drawer one entry per question and per answer (tools with their results attached; system messages and thinking blocks hidden) |
| `ai/cliAsk.ts` + `cli/index.ts` `ask` | `npm run cli -- ask "<question>" [--export f] [--model …] [--effort …] [--max-rounds n] [--budget usd] [--no-auto-buffs]` — the same conversation, loop and tools on an export file in Node; streams the answer to stdout, the tool timeline and the cost line to stderr (`--json` prints a result object). **Calls the paid API** — credentials from `ANTHROPIC_API_KEY` or an `ant auth login` profile |
| `ai/eval/questions.json` | the question bank (20 David-style questions, 32 since 2026-10-31 — best team, S2 Mornye on the Aemeath team, Xuanling's next substat, R5 Polestar vs S1 Aemeath, echoes to feed, …) with the tools that should answer each and what the answer must rest on |
| tests | `tools/tools.test.ts` (every tool on `__fixtures__/aiAccount.json` — Aemeath / Mornye / Lynae, their equipped echoes, five spares and their team, trimmed from a real export; strictness, the 24-optional-parameter / 20-strict-tool limits, byte-stable definitions), `schema`, `pricing`, `aiSettings`, `client` (typed errors from real SDK classes), `agentLoop` (`__fixtures__/fakeClaude.ts`: tool round, request shape, parallel tools, a throwing runner, pause_turn, max_tokens ×3 cases, refusal ×2, abort ×3, unparseable JSON, the round cap yes/no, the budget yes/no/start), `conversation` (store, turn context, a simulated prompt cache that only hits byte-identical prefixes), `sdkIntegration` (the loop on the **real** SDK client with `fetch` replaced by scripted SSE: headers, body, thinking signature and parsed tool input sent back unchanged, a 401), `prompt`, `cliAsk`, `toolWorker`, `live/liveExport`, `eval/questions` (tool names valid; no `node:` import anywhere under `ai/` or `live/`) |

**The loop's rules.** Streaming (`client.beta.messages.stream` + `finalMessage()`); `thinking` omitted (Opus 5.5
always thinks — depth is `output_config.effort`, set per feature); tools `strict` + `eager_input_streaming`;
`tool_choice` stays auto (forced choice is a 400 on Opus / Sonnet 5.5) except `none` for the one answer after the
player declined more tool rounds; every assistant turn goes back unchanged (JSON-cloned: thinking blocks with their
signatures, `fallback` blocks), history append-only. `tool_use` → all tools in parallel, every result in ONE user
message (`is_error` on failures, none dropped); `end_turn` → done; `pause_turn` → append, continue; `max_tokens` with a
tool_use → never run the cut-off input, re-send once with twice the room (cap 64000), then stop; `max_tokens` on text →
keep it; `refusal` → no tools, nothing kept, a polite line; `model_context_window_exceeded` → "start a new chat". Max
6 tool rounds per answer, then `confirm("tool_limit")`: yes resets the count, no answers the pending calls with
`is_error` and asks once more with `tool_choice: none`. Before every request, past the conversation's soft limit,
`confirm("budget")`: yes raises the limit by one budget step, no stops (the conversation then ends on a user turn and
`continueConversation` picks it up). An unparseable streamed tool input (the SDK raises a bare `AnthropicError`, not an
`APIError`) is re-issued twice at most; API errors are never retried by the loop (the SDK retries 429 / 5xx twice
itself). Abort: the request's `AbortSignal`; a tool round is committed only with its results.

**Prompt caching.** Prefix = tools (fixed order, byte-identical every request, ≈3.1K tokens) → static system block (≈1.5K tokens, breakpoint — together above 4,096 tokens, the largest per-model minimum for a cacheable prefix) →
the account snapshot frozen into the conversation (breakpoint) → messages (top-level automatic `cache_control`, the
third breakpoint). Per-turn context is a mid-conversation `{ role: "system" }` message placed right after the user's
question (it must follow a user message and be last or followed by an assistant turn). When nothing is committed
(refusal, abort or error before Claude's first complete turn) the loop returns `messages: []` — appending a dangling
question + system note would leave a system message followed by the next user message, which the API rejects — and
the drawer puts the question back in the input box. `sdkIntegration.test.ts` and `conversation.test.ts` check that turn
two re-sends turn one byte for byte.

**Gates.** `npx vue-tsc --noEmit`; `npx vitest run src/sim/ai src/sim/live` (97 tests, no network); the snapshot
gate (`npm run cli -- snapshot` before / after → `diff`: 0 changes — stage 1 moves no number); a browser probe (Vite
dev + `shot.mjs --eval-file`) ran all twelve tools on David's seeded stores on the main thread and in the worker with
the same outputs as the Node CLI. Never call the real API from tests or CI: script `fetch` or the client.

Things learned:
- `@anthropic-ai/sdk` 0.133 (and 1.3, see stage 2) already types `fallbacks: "default"`, `output_config.effort`, `eager_input_streaming`,
  `strict` and `role: "system"` messages on the beta namespace — no casts. It sends `betas` as the `anthropic-beta`
  header (never in the body) and the real `Anthropic` client satisfies the loop's small `ClientLike` structurally.
- Strict tool schemas reject `minimum` / `maximum` / `minLength`: bounded integers are enums (`sequence: [0…6]`,
  `refinement: [1…5]`, `cost: [1, 3, 4]`), open ones are clamped inside the tool (`top`, `limit`). The request-wide caps
  are 20 strict tools, 24 optional parameters (we use 21), 16 union-typed parameters (we use none).
- The tolerant partial-JSON parser rarely throws: `{"team": 1x}` → `{team: 1}`, a cut-off `{"te` → `{}`. Validation,
  not the exception, is what catches a bad input.
- The streamed `params.messages` array is the loop's working array; pass a copy per request (`[...working]`) or later
  appends show up in anything that kept a reference (the tests' first draft did).
- The SDK chunk carries a guarded `import("node:buffer")` (its Node file helpers); Vite builds it fine and the browser
  path never runs it.
- `@anthropic-ai/sdk` is installed in the main clone's node_modules but **not listed in package.json / package-lock**
  — the integrator adds it (`npm install @anthropic-ai/sdk@1.3.0` in the main clone, which updates both; stage 2 moved to 1.3).

## In-app AI, stage 2: the assistant panel and the command palette — `src/sim/ai/ui/` + `src/sim/shell/` (Track "ai", 2026-10-26)

David's asks (2026-10-12, 2026-10-26): AI inside the app and a pro-level UI. Stage 2 puts stage 1's loop and tools behind
a floating **Ask** button, a Claude panel (a right-side panel on desktop, a bottom sheet on phones), AI settings, and a
**Ctrl/Cmd+K command palette** with an "Ask Claude" row. Mounted once from `App.vue` (two lines); everything else is
plus code. No real Anthropic request is made by the app's tests or the Cypress spec.

| Piece | What it does |
|---|---|
| `src/App.vue` (upstream, 2 lines) | `import PlusShell` + `<PlusShell />` after `<AppLayout>` — inside the app, so Pinia, the router, toasts and `useConfirm` all work |
| `shell/PlusShell.vue` | eager and small: the Ask button (bottom-right, `z-[55]`; hidden while the panel or any modal `<dialog>` / `aria-modal` bottom sheet is open — a `MutationObserver` on `open` attributes and `<body>`'s children, throttled with a timer), the window-level shortcuts (capture phase: Ctrl/Cmd+K palette, Ctrl/Cmd+J panel, Esc closes the panel from inside it or from `<body>` only), the page provider (route, page title, the calculator's active character, the team open on /teams from `teamRotationsActiveTeamId`). The panel, the palette and the settings dialog are `defineAsyncComponent` chunks loaded on first open |
| `ai/useAssistant.ts` | **the public API** — `useAssistant()`: `open()`, `close()`, `toggle()`, `ask(question, { context?, title? })`, `explain({ title, data, question? })` (the data goes as a fenced JSON attachment in the same user turn, at the Explain effort — low by default). Module-level state (one assistant per tab): open / collapsed / busy, the pending question, the live answer (streamed text, tool rows with status and timing, thinking, retrying), the turn's usage, the notice (error / refusal / stopped / budget / max_tokens / context_full / tool_limit), the budget or tool-round confirm, the composer draft with an optional attachment. Light: everything heavy loads through one `import("./assistantRuntime")` on the first question; `setAssistantRuntimeLoader()` is the test seam |
| `ai/conversationStore.ts` | the light half of `conversation.ts` (split out so the eager state and the panel stay out of the engine's import graph): `Conversation`, load / save / clear (`wtplus:ai:chat`, sessionStorage), `canContinue`, `transcriptOf`. `conversation.ts` re-exports it, so stage 1's callers and tests are unchanged |
| `ai/assistantRuntime.ts` | the one lazy chunk with the conversation + loop + tools + engine, `exportFromStores`, the worker tool runner (falls back to the main thread when the worker can't start or crashes) |
| `ai/ui/AssistantPanel.vue` | the panel. Desktop: fixed under the nav (its top measured from `#navbar-container`), 420 px, `z-[60]`, non-modal; a collapse button shrinks it to a tab on the right edge so the v3 result bar and the Full breakdown dock are free. Phones (< 768 px): a full-width bottom sheet, `min(85dvh, 760px)`, over a tap-to-close backdrop. Header: model chip (opens settings; a tooltip says when the chat runs on another model than the setting), the conversation's live cost (tooltip: requests, tokens, cache hit rate, soft budget), settings, new chat, collapse, close. Body: onboarding without a key; otherwise the empty state with per-page suggestions, the transcript (questions with attachment chips and Edit; answers), the inline budget / tool-round confirm, the notice with Retry / Continue / Open AI settings / New chat. Composer: auto-growing textarea (16 px on phones so iOS doesn't zoom), Enter sends, Shift+Enter breaks, Send turns into Stop while an answer runs. Its keydown handler stops propagation: Riley's document-level handlers on /rankings would otherwise take Enter and the arrows |
| `ai/ui/AssistantAnswer.vue` + `AssistantToolRow.vue` | one answer: the tool timeline ("Used 2 engine tools · 1.4 s", collapsible; each row `Team damage · Aemeath · Mornye · Lynae → 9.47M · 379K DPS` with a spinner / check / cross and its time, expandable to the tool name, provenance, input and result JSON), "thinking…" with elapsed seconds, the markdown, the **Sources** chips (`provenanceOf`), deep-link buttons (`deepLinksOf`: a route, "Aemeath in the calculator", `Open "<team>"`), Copy |
| `ai/ui/AssistantOnboarding.vue` | BYOK explained, console.anthropic.com, the dedicated-key-with-a-monthly-spend-limit advice, the key field (format check `sk-ant-…`) with "Remember on this device", the privacy note (questions + an account summary go from the browser straight to Anthropic, only when you ask; nothing to our servers; Claude reads through the engine and can't change data), the typical cost per question per model (`typicalQuestionCost`) |
| `ai/ui/AiSettingsDialog.vue` | native `<dialog class="modal">` (toasts re-teleport into it; `modal-bottom` on phones): the masked key and where it lives, Test key (`client.ts testApiKey` — `GET /v1/models/{model}`, free, only on click), Forget key (confirm), paste a new key, remember toggle (reflects where the key really is), model radio cards with list prices and ≈ cost per question, effort for chat and Explain, the soft budget per conversation |
| `ai/ui/markdown.ts` + `MarkdownView.ts` | (stage 1 draft, now tested) the markdown subset → VNodes; every piece of model text is a text node, no `v-html` anywhere. Links: http(s) in a new tab with `noopener noreferrer nofollow`, or a path the router resolves (bare `/my-rankings` in prose too) through `router.push` |
| `ai/ui/toolSummary.ts` | timeline rows, deep links, provenance, `toolViewsOf` (transcript tools → rows with this tab's timings), `prettyJson` |
| `ai/ui/suggestions.ts` | three or four questions per route (/ about the active character, /my-rankings "What should I invest in next?", /rankings "Which of these teams can I field best?", /teams "Why is my team lower than Riley's?", /inventory "Which echoes can I feed?", /convene "Who should I pull for?") |
| `shell/CommandPalette.vue` + `paletteItems.ts` | native `<dialog>` at the top of the screen (on phones too — the keyboard can't cover it). Pages (`CORE_PAGES` + the shared `PLUS_PAGES`, each only when the router resolves it), actions (Rank my roster, open the assistant, new chat when one exists, AI settings, theme light/dark via `useTheme`, classic / v3 via `useClassicUi`), characters (portrait, rarity · element · weapon, `S<n>` badge when set up — `characterRowsOf`; Enter makes it active and goes to the calculator), saved teams (→ /teams with that team open), **commands** (`paletteCommands.ts`, 2026-10-31: "On this page" first for the character / team the page shows, and per set-up character / saved team once you type — see "Wiring the pages together"), and "Ask Claude: <text>" (first for a question or a weak match, last otherwise). `rankPalette`: word-prefix / initials / substring / subsequence scoring, groups in the order of their best item, scattered-letter noise dropped next to a real match. Focus stays in the input; ↑/↓ move `aria-activedescendant` (`useSuggestNavigation`), Enter runs, Esc closes |
| `shell/navigation.ts`, `shell/shellDom.ts` | shared jumps (`openCharacter`, `openTeam`, `isAppRoute`, `characterKeyByName`) and DOM helpers (`anyModalOpen`, `isTypingTarget`, `modKeyLabel`) |
| tests | `useAssistant.test.ts` (the real conversation + loop + tools with a scripted client: ask, explain with attachment + low effort, no key → onboarding with the question parked, stop, budget confirm no → Continue → yes, a second question while busy, an overloaded error → Retry, Edit), `ui/markdown.test.ts` (subset, unsafe links, raw HTML stays text, MarkdownView mounted under a router renders no `<img>`), `ui/toolSummary.test.ts`, `ui/suggestions.test.ts`, `attachments.test.ts`, `shell/paletteItems.test.ts`; Cypress `cypress/e2e/assistant.cy.ts` |

Rules:
- **The SDK never lands in the main bundle.** `client.ts` (`import("@anthropic-ai/sdk")`), `assistantRuntime.ts`, the panel,
  the palette and the dialog are all lazy; the entry chunk only holds PlusShell, `useAssistant`, `conversationStore`,
  `attachments`, `aiSettings`, `paletteItems` / `plusPages` (for page titles) and the shell helpers. `paletteCommands.ts`
  (2026-10-31) is imported by the palette only, through `paletteWithCommands`: in `paletteItems.ts` it added 9.3 kB to the
  entry chunk. Gate: `npx vite build`, then
  `grep -c "api.anthropic.com" dist/assets/index-*.js` → 0 (the one "anthropic" there is a palette keyword).
- **Append-only, one answer at a time.** A second `ask` / `explain` while an answer runs goes into the composer; Edit
  rewinds with `truncateBefore` (a confirm when later questions would go) and puts the text back; nothing rewrites history.
- **When nothing was kept** (stopped, refused, failed before Claude's first complete turn) a typed question goes back in
  the box; Retry re-sends the last question, or continues when the conversation ends on a user turn (a declined budget
  confirm, a stop after a tool round).
- **The key** is read from storage for each request (`getApiKey()`), never held in component state; the settings show
  only `sk-ant-…AbCd`.
- **Every plus `<dialog>` emits its close itself** as well as on the native `close` event (queued — a palette run that
  navigates must not wait for it).
- **phone.css § 6 pads every phone `.modal-box`** (`.modal .modal-box.modal-box`, 1 rem, bottom-sheet corners): the palette
  and the settings dialog override it with a higher-specificity selector of their own.
- **The nav's dropdowns open over the panel.** The panel is `z-[60]` under the nav (`#navbar-container`, fixed, `z-50`), so
  the utility menu and the theme chooser (focus-driven DaisyUI dropdowns) used to open behind it. AssistantPanel's global
  style lifts the nav to 61 only while one of its dropdowns (or the phone hamburger `<details>`) is open:
  `#navbar-container:has(.dropdown:focus-within, details[open])`. Any nav dropdown another track adds is covered.

Gates (2026-10-26): `npx vue-tsc --noEmit` clean; `npx vitest run` — 192 files / 1879 tests (131 under `src/sim/ai` +
`src/sim/live` + `src/sim/shell`); Cypress `assistant.cy.ts` 5/5 (onboarding → stubbed key → Test key; ask → tool row →
safe markdown → route link → reload keeps the chat → Esc; Stop; Ctrl+K → /my-rankings and a question → Claude; 412 × 915
at 130 % text with no sideways scroll), `phoneLayout.cy.ts`, `themes.cy.ts`; `npx vite build` (no `import.meta.glob` left,
SDK in `sdk-*.js`). The whole Cypress suite in this sandbox: 22 of 67 specs red with the shell mounted, the same 21 red with the `App.vue`
hook taken out (frozen frames: DaisyUI / Vue transitions stuck at `opacity: 0`, `cy.screenshot` timeouts); the 22nd
(`calculator/optimizer/workspaceFlagged`) was a flake and passes twice on a rerun with the shell — no failure mentions the Ask button. Screenshots: `/tmp/wtplus-shots/ai/` (desktop dark + light, phone 412 at 130 %: closed, onboarding,
conversation, palette, empty state, settings); the conversation shots seed `wtplus:ai:chat` in sessionStorage with a chat
built by the real loop and tools on David's data and a scripted client (`--pre`), then click Ask.

Things learned:
- **Nothing may depend on animation frames in Cypress.** Headless Electron never advances frames: Vue's `<Transition>` waits
  on `requestAnimationFrame` (a leave never finished, the panel stayed visible after Esc), and a CSS animation from
  `opacity: 0` stays at 0 (Cypress reports the element hidden). The panel, sheet and Ask button use transform-only
  keyframes (a small offset that never completes still leaves them usable) and the modal watcher a 30 ms timer.
- **The dialog `close` event is queued** and in headless Electron it may not arrive before the next command: the palette
  and settings emit their close directly as well.
- **SDK 1.x** (API version `2026-10-21`): the key goes out as `Authorization: Bearer …` (no `x-api-key`), beta routes have
  no `?beta=true`, and `BetaMessageParam` is a union with one type per role — build an assistant turn's content as
  `BetaMessageContentParam`, not `BetaMessageParam["content"]` (the system-message variant allows `undefined`). The
  Cypress stubs answer the CORS preflight with the requested headers echoed (`Authorization` isn't covered by `*`).
- The Ask button covers the bottom-right corner of the page (on /rankings phones, the end of Riley's credit line); the
  panel's collapse tab is the answer on desktop, closing the sheet on phones.
  *(2026-10-31: no longer true at a page's end or over a plus bar — see "Shell refinements" below.)*

## In-app AI, stage 3: "Read with Claude" in the echo importer — `src/sim/echoScan/` (Track "ai", 2026-10-26)

The phone-screenshot importer's OCR (phase D) reads one layout: a 3120 × 1440 S26 Ultra shot (a Sonata filter on was best
until 2026-10-31; the set icon next to +25 now does without). Stage 3 adds **Read with Claude** to the same panel (Inventory › Import echoes › Phone screenshots): Claude reads
any screenshot with an echo's stat list (PC frames, other phones, no Sonata filter, a resonator's echo page with
several echoes), the app checks every line with the OCR path's rules, and the rows land in the same review table, so
upstream's duplicate review and save take them unchanged. The OCR flow is untouched unless the player presses the
button. No test or spec sends a real request.

| Piece | What it does |
|---|---|
| `claudeVision.ts` | pure (no DOM / Vue). **Pass 1**, one request per screenshot: the downscaled image first, then a one-line instruction (`2576×1189 px (scaled down from 3120×1440)`); structured output (`output_config.format` json_schema, strict: every object closed, every property required, no numeric constraints) whose enums are the app's own vocabulary: echo names from `mainEchoesData`, set names from `echoSetLabelMap`, stat labels from `KEY_TO_LABEL`. Per echo: printed name, echo, cost, level, rarity, set + `setSource` (printed / glyph_only / not_visible) + the glyph's box, main stat, the fixed second row, substats, `equippedBy`, confidence, notes. **Pass 2**, only for echoes whose set isn't printed and whose registry entry allows more than one set: the glyph cut from the full-resolution shot and enlarged (or the whole shot when Claude gave no box) next to the candidate sets' icons as labelled URL images (`echoSetImageMap` — `https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/sets/<Set>.webp`), one closed answer per echo with its enum limited to that echo's sets + "none of these". `mapClaudeEcho` → the importer's `ScanRecord` with the checks below; `compareWithOcr` lists where an OCR record of the same shot disagrees. `readEchoesWithClaude(images, opts)`: concurrency 2, results in order and through `onImageDone` as they arrive, abort cancels the requests in flight and skips the rest. Lazy: only `useClaudeEchoRead`'s first run imports it (with `client.ts`) |
| `claudeVisionCost.ts` | the light part the importer needs up front: `VISION_LONG_EDGE` (2576), `VISION_MAX_PIXELS` (3.75 MP, the API's other image limit), `visionSize` (the size sent: both limits, never upscaled), `imageTokens` (≈ w × h / 784 after `visionSize`, ≤ 4784), `estimateVisionCost` (+ 2.7K prompt tokens in, 1.5K out, +10 % for the glyph pass, at the chosen model's list price); re-exported by `claudeVision.ts` |
| `visionImage.ts` | the canvas half: `prepareVisionImage` (decode → `visionSize` (long edge ≤ 2576 px, ≤ 3.75 MP) → JPEG 0.92 base64, a 96-px thumbnail, `crop(box)` from the full-resolution bitmap until `dispose`), `probeImage` (size + thumbnail when a file is added, for the estimate), `glyphCropRegion` (the box padded 4× around its centre, at least 6 % of the short side, clamped) |
| `batchItems.ts` | the review table's row (`ScanItem`), shared by the OCR scan and Claude: `source` (ocr / claude), `claudeState` (none / reading / done / error), `claude` (confidence, notes, printed name, who wears it, echoes on the shot), `ocrRecord` (the OCR record a Claude read replaced), `parentId` (extra echoes of one shot), `size`. `needsALook` (failed, unsupported, no echo, or flags) and `claudeCandidates(items, "flagged" \| "all")` |
| `useClaudeEchoRead.ts` | the importer's controller: scope (flagged & failed first when there are any, else all unread), the estimate and the soft-budget warning (`wtplus:ai:settings` budget) — a run whose estimate is above it asks first (`confirmOverBudget`, upstream's `useConfirm` in the importer; no way to ask → no run), run / Stop / progress / spent so far / the summary line, no key → `useAssistant().openSettings()`. A result takes its row (Claude's record replaces the OCR one, which is kept for the cross-check); a shot with several echoes becomes several rows; a failed read leaves the row's OCR result alone and can be retried; a row starts **checked only when** the echo is known, no check blocked it and the OCR (if any) agrees — stricter than the OCR path. Closing the importer mid-run aborts (`onScopeDispose`). Effort = AI settings › "Reading screenshots" (low by default) |
| `PhoneEchoBatchParser.vue` (plus) | the "Read with Claude" strip under Scan / Clear: model chip (opens AI settings), what it's for, the BYOK note, the scope switch with counts, "≈ $0.19 for 3 screenshots" (tooltip: the token assumptions), Read N with Claude → Stop + progress + spent; rows get a spinner while read and a "Claude" badge with its confidence after; the Notes column became a full-width row under each row (flags, errors, Claude's notes, "worn by …") and Echo + Set share a column, so the table fits the modal and phones |
| tests | `claudeVision.test.ts` (vocabulary + schema, request shape — image first, json_schema, effort, no `thinking` / sampling fields, the refusal fallback on Opus / Sonnet only, the icon URLs; parsing a refusal / cut-off / bad JSON / wrong shape; mapping a clean read into the OCR's shape; impossible values flagged and kept as read; unknown echo names rejected; a printed set outside the echo's sets; the glyph pass's pick, a "none of these", a pick outside the candidates; the two-pass run, a page with two echoes, the glyph pass failing, typed API errors, concurrency 2, abort; the estimate; crops; candidates) and `useClaudeEchoRead.test.ts` (no key, estimate per model, rows filled / split / unchecked, the OCR disagreement, a failed read kept retryable, the importer closing mid-run), both on `__fixtures__/claudeVisionResponses.json` — recorded-style beta Messages responses (an empty thinking block, then the JSON) whose stat lines are the Cypress fixture screenshots'. Cypress `cypress/e2e/echoScanClaude.cy.ts`: api.anthropic.com intercepted (CORS preflight too) — no key → the key from the importer → read → glyph pass with the two candidate icons and a PNG crop → impossible values flagged → "Add 2 echoes" saves through upstream's flow; 412 × 915 at 130 % with no sideways scroll |

The checks (the OCR path's tables, strict parsing — nothing is repaired, unlike OCR's "108%" → 10.8):
- echo: a name from the enum, else the printed name fuzzily (`bestEcho` ≥ 0.85, flagged), else blocking; cost from the
  registry (Claude's read is a cross-check flag).
- main stat: a legal one for the cost (`statsTable`), at the max-level value for the rarity (HealingBonus 26.4 % allowed, as
  in `legalValues`); without a printed rarity, the rank whose max-level value it shows, else 5★ (flagged).
- the second row: the fixed flat stat for cost + rank (`flatBonusesByRankByType`; at 5★ the OCR's 2280 / 100 / 150).
- substats: every value a legal roll in `subStatsTable` (a % sign decides ATK vs ATK (flat)), no type twice, at most 5, no
  more than one per `LEVELS_PER_TUNE` levels; fewer than 5 at +25 is a soft flag.
- a value that fails stays exactly as read in the row with a flag; blocking flags (unknown echo, illegal or unreadable
  value, impossible count) start the row unchecked. Claude's confidence < 0.6 is a flag.

Rules:
- Requests follow the 2026-10-21 API: `beta.messages.create` (non-streaming, `max_tokens` 16000 / 4000), no `thinking`, no
  sampling fields, `output_config.effort` set explicitly, `fallbacks: "default"` + `server-side-fallback-2026-07-01` on Opus /
  Sonnet (not Haiku), typed SDK errors through `describeError`. A refusal is not retried (the same image refuses again).
- No prompt-cache breakpoint: the only static prefix (system prompt ≈ 450 tokens) is under the minimum cacheable length;
  the schema is byte-stable so the compiled grammar is reused.
- **Nothing of the reader is in the entry chunk.** The importer is eager (upstream's inventory modal imports it), so
  `useClaudeEchoRead` imports only `claudeVisionCost.ts`, `batchItems.ts`, `visionImage.ts` (canvas) and the light AI
  modules statically; `claudeVision.ts` and `client.ts` load together on the first run (`claudeVision-*.js` ≈ 18 KB,
  `client-*.js`, then the SDK chunk). Gate: after `npx vite build`, `grep -c "api.anthropic.com\|dangerouslyAllowBrowser"
  dist/assets/index-*.js` → 0.

Gates (2026-10-26): `npx vue-tsc --noEmit` clean; `npx vitest run` — 194 files / 1911 tests (32 of them this stage's:
`claudeVision.test.ts` + `useClaudeEchoRead.test.ts`); Cypress `echoScanClaude.cy.ts` 2/2, `echoScanBatch.cy.ts` (real OCR,
untouched flow; run it alone — beside other browser work its CDN reference-image load stalled past the 400 s timeout once),
`echoScanAlbum.cy.ts`, `phoneLayout.cy.ts`, `assistant.cy.ts`; `npx vite build` (no `import.meta.glob`, nothing of the reader
in `index-*.js`). Screenshots: `/tmp/wtplus-shots/ai/importer-*.png` (v3 desktop dark + light, phone 412 at 130 %; the
read shots stub `window.fetch` for api.anthropic.com with the fixture responses through `shot.mjs --pre`).

Things learned:
- **Strict structured outputs take no numeric or length constraints**, so a level outside +0…+25, a sixth substat or a
  confidence of 3 can still come back: every bound is a check in `mapClaudeEcho` / `readPayloadOf`, not in the schema.
- Ask for boxes as **fractions** of the image and reject anything above 1: a box in pixels of the downscaled image would
  crop the wrong place of the full-resolution one.
- "Phantom: X" and "X" are different registry entries (skins), but the same echo for the OCR cross-check.
- Cypress's webpack build hands a JSON import over as the module namespace without a `default` export
  (`(recorded.default ?? recorded)` in the spec).

## In-app AI: verify-and-harden pass — fixes after stages 1–3 (Track "ai", 2026-10-26)

A second pass over the whole track before the merge. It reviewed the code, ran every gate and took new screenshots.
No real Anthropic request was made.

| Fix | Where | Why |
|---|---|---|
| `vendor/wuwa_calc` back at plus's `653fee7`, `skittle.css` header too | submodule, `skittle.css` | the rebased wip commit pinned the submodule one commit back (`e1181a9`); merging it would have undone Riley's "a support group stands for the first team the account can field" |
| Riley's numbers are **DPS** | `prompt.ts`, `tools/rank.ts`, `tools/account.ts`, `eval/questions.json` | since his 7bcbb24 a team's `total` is damage per second. Claude is told to compare it only with an app DPS, never with a rotation's total damage (app ≈ 0.96 × Riley's DPS at the median) |
| New chat while an answer runs | `useAssistant.ts` (`chatGeneration`) | the stopped answer used to finish into the cleared chat and save it again: the old conversation came back |
| A cut-short response still costs | `agentLoop.ts` | a Stop or an unparseable tool input after the stream started was billed but never reached the meter or the budget. `message_start` / `message_delta` usage is now added when the stream throws |
| A chunk that fails to load | `useAssistant.ts` | it now reads "Couldn't load the assistant. Check your connection" (retryable), not "Something went wrong talking to Anthropic" |
| The nav's menus over the panel | `AssistantPanel.vue` (global style) | with the panel open, the utility menu and the theme chooser opened behind it (see stage 2's rules) |
| Read with Claude asks above the budget | `useClaudeEchoRead.ts` `confirmOverBudget`, `PhoneEchoBatchParser.vue` | it only showed a warning; now upstream's ConfirmDialog asks ("Read anyway") before a run whose estimate is above the soft budget, as the assistant does |
| 3.75 MP cap on the image sent | `claudeVisionCost.ts` `visionSize`, `visionImage.ts` | the API's second image limit. A near-square tablet shot was sent at 2576 × 2576 and resized server-side, so the "scaled down from" line and the estimate were wrong |
| Palette: Echo tuning odds, CV and echo rating | `paletteItems.ts` | Ryan's new `/info` subpages |
| Lint | `navigation.ts` (`CharacterStoreLike`), `paletteItems.ts`, `assistant.cy.ts` | `npx eslint` is clean on every track file. The one error left in `cli/index.ts:60` is plus's |

Tests added: `agentLoop.test.ts` (an abort after `message_start` counts its usage), `useAssistant.test.ts` (new chat
mid-answer, a chunk that fails to load), `useClaudeEchoRead.test.ts` (over-budget: no → no request, yes → read, no
confirm → no run), `claudeVision.test.ts` (`visionSize`). Cypress: `assistant.cy.ts` "lets the nav's own menus open
over the open panel", and `echoScanClaude.cy.ts`'s phone test now goes through the over-budget confirm (Cancel → no
request, Read anyway → one). It checks `.confirm-dialog[open]` rather than visibility, because DaisyUI's modal fades in
from opacity 0 and headless Electron never runs that transition.

Gates (2026-10-26, after the fixes):
- `npx vue-tsc --noEmit`: clean.
- `npx vitest run`: 194 files / 1915 tests.
- `npx vite build`: no `import.meta.glob` left; `index-*.js` has 0 × `api.anthropic.com` and 0 × `dangerouslyAllowBrowser`; the SDK, client, assistantRuntime and claudeVision are separate chunks.
- CLI snapshot on the 2026-9-16 export, plus (git archive) vs this tree: `diff` → 0 changes.
- Cypress: `assistant.cy.ts`, `echoScanClaude.cy.ts`, `phoneLayout.cy.ts`, `themes.cy.ts`.

Screenshots: `/tmp/wtplus-shots/ai/v-*.png`.

Things learned:
- A panel above the nav's z-index hides the nav's dropdowns: they render inside the nav's own stacking context. A
  `:has(.dropdown:focus-within)` lift on the nav container fixes it without touching Nav.vue.
- Very saturated DaisyUI primaries at low alpha (`border-primary/25`) look yellow in a downscaled screenshot. Check at
  `--dpr 2 --clip` before calling it a bug.

## In-app AI: tools for the batch-2 pages — `src/sim/ai/tools/` (track "assistant", 2026-10-31)

The assistant could not see the pages batch 2 added. Eight read-only tools now answer from them: "what ER does Aemeath
need in this team", "which echoes should I feed", "can my teams clear ToA floor 4 this season", "should I pull for X",
"what's the rotation for this team". Every result carries `path` + `label`, so the answer offers that page as a button
(`deepLinksOf` already turned any `path` into one). No real Anthropic request is made by any test or spec.

| Tool | Page / module | Runs | What it returns |
|---|---|---|---|
| `energy_check` | `/energy`, `energy/energyCheck.ts` | main thread (Riley) | a team (saved or three names): each member's ER have vs need (need rounded up, as printed), short by points and median rolls, set by the loop or the kit's floor, DPS share, damage at 100 % Crit Rate; `team: null` = every saved team + each character's ER floor. A team his list lacks is "not measured", never a formula |
| `team_rotation` | `/rotation`, `rotation/extract.ts` + `cueModel.ts` + `exportText.ts` | main thread (Riley) | the cue card as text: opener and loop blocks (folded ×N), one line per swap (`Mornye: Intro › R › BA×3 › … · 5.2 s (Outro ready)`), team DPS, gear; the path is `rotationPath` of that exact row |
| `toa_check` | `/endgame`, `endgame/toaRun.ts` | main thread (Riley) | one timed floor (`"Hazard 4"`, `"4"`, `"Resonant 4"`) or `null` = every timed floor (top 3) + the Vigor plan; kill time, crests, the best saved team, effect fidelity; "sim, perfect execution". Reuses `wtplus:endgame:check` when its `checkKey` matches (same key the page builds), else runs the check (~10 s on David's account) |
| `build_team_plan` | `/build-team`, `buildTeam/plans.ts` + `constraints.ts` | main thread (Riley) | the plan per member (sets with pieces, main echo, layout, main stat per slot, ER need), how many inventory echoes fit it alone and which cost slots can't be filled, Riley's DPS today / High Invest. A dry run: it never runs the optimizer or writes a build (`/build-team?team=<id>` does, with its confirm) |
| `echo_lab` | `/echo-lab`, `echoLab/pass.ts` | tool worker | `show: feed` (groups as the game filters: Sonata · Cost · Main Stat), `keep` / `spare` (best owner, slot, gain, the echo it replaces), `reroll` (lock / re-roll per line, the plan, re-roll first via `pickRerollFirst`); `character` narrows. The pass is memoised per account fingerprint (`memo.ts echoLabFor`) |
| `weapon_value` | `/weapons`, `weaponValue/weaponValue.ts` | tool worker | one character: signature steps to R5 (own, stats-only floor, team gain), standard 5★, best 4★, the next refinement; `null` = every character's signature next copy, best first |
| `pull_advice` | `/convene` advisor, `convene/advisor*.ts` | tool worker, reads `wtplus:convene:{history,banners,prefs}` | every featured 5★ running now: damage per copy to S6 / R5, expected Astrite from pity (history, else the typed pity, else 0 — said so), pulls for half / nine in ten players, % per 1,000 Astrite, the budget's chance; an item not on a banner says so |
| `today` | `/today`, `today/*.ts` | tool worker, reads `wtplus:today:{news:v1,v1}` + convene's prefs and banners | next daily / weekly reset (device clock + countdown), the logged Waveplates projected, events ending / running / starting from the notices cache (or "open /today once"), double drops, endgame cycles, banners running |

Plumbing:
- **`ctx.riley`** (`tools/riley.ts`): one small surface over the Riley run seam (`teams`, `teamKeysFor`, `solveMine`,
  `tracedRun`, `curves`, `account`). The browser fills it from `rileyClient()` (`ai/rileyBrowser.ts`: the app's one
  solver worker, its memo shared with the pages), the CLI from `rileyHeadless()` (`cli/aiRiley.ts`, Node only). A tool
  with `riley: true` runs on the **main thread** in the browser (`assistantRuntime.ts` routes by `toolNeeds(name)`): only
  the main thread can reach the solver worker, and the engine work happens there anyway. No new worker entry point.
- **`ctx.storage`**: a read-only view (`readOnlyStorage`: writes are dropped) of the localStorage keys a tool lists in
  `reads`. The worker has no localStorage, so `toolWorker.ts` snapshots exactly those keys into the request (the AI key
  is never among them; a test checks it).
- **Team arguments** (`teamTarget`): a saved team by loose name / id / index, else three names split on `, + · / & and`;
  three names that match a saved team use that team (its name, builds and pins).
- **Nullable parameters**: strict tool use allows 20 strict tools, 24 optional parameters and 16 union-typed ones per
  request (the structured-outputs limits, checked 2026-10-31). Stage 1 used 21 optional, so the new "or everything"
  arguments are `type: ["string", "null"]` and **required** (`nullableString`): 5 of the 16, still 21 optional, 20 tools.
  `validateInput` treats an explicit `null` as absent and still rejects a missing key (a cut-off stream).
- **Cache prefix**: the eight tools are appended; `tools.test.ts` pins a hash of the first twelve definitions (`1o4di9`,
  the same bytes as before), so a stage-1 tool's cached prefix survives.
- `npm run cli -- tool <name> '<json>' [--export f]` runs one tool on an export without Claude (free), printing what Claude
  would read; `ask` now hands the tools the headless Riley engine too.

Rules:
- **The registry is full: 20 strict tools.** A new tool must replace or merge one (or go non-strict, which the request
  cap doesn't count, at the price of grammar-checked input).
- Riley figures are labelled DPS in every result and compared only with DPS; the app engine's gains are % of rotation
  damage. Each result says which (`notes`).
- Tools never write: storage writes are dropped, `build_team_plan` doesn't build, `toa_check` doesn't store its check.
- No datamine-site names in results (the ToA note cites the page's Calibrate tab, not a site).
- **Nothing the tool worker imports may hold a `new Worker(new URL(...))` site** (echoLabClient, rileyClient, the
  build-team worker backend, …): Vite would build that worker again, nested inside the tool worker's own build — the
  kind of nested build Vercel's one-core VM deadlocked on. Copy the small helper instead (`memo.ts` copies the account
  as `labAccountOf` does). `eval/questions.test.ts` walks the tool worker's import graph and fails on one (verify
  pass 2026-10-31: the first cut imported `labAccountOf` from echoLabClient and nested an Echo Lab worker build).

Gates (2026-10-31): `vue-tsc --noEmit` clean; vitest `src/sim/ai` 19 files / 144 tests (new: `tools/pageTools.test.ts`
on the fixture with synthetic page caches, `tools/rileyTools.test.ts` on the real engine headless (node env) plus fakes
for the refusals, the nullable schema, the worker's storage snapshot, the timeline rows); Cypress
`assistantPages.cy.ts` 2/2 (an ER question on /energy through the real solver worker; /today's caches through the tool
worker on a 412 px phone at 130 %), `assistant.cy.ts` 6/6, `phoneLayout.cy.ts` 12/12; the Vercel-style build (no
`import.meta.glob`, entry 1,511 kB as before, no `api.anthropic.com` in it). The tool worker grew 4.74 → 5.03 MB raw:
it is an IIFE, which inlines every module the registry imports, the Riley tools' too, though they never run there.

Measured on David's 9-16 export (`cli -- tool`, Node): energy_check one team 0.9 s, every team 1.0 s; team_rotation
0.6 s; build_team_plan 0.6 s; toa_check 10 s fresh (223 teams solved, 30 timed); echo_lab feed 2.0 s, reroll 3.6 s;
weapon_value 2.6 s (all) / 1.1 s (one); pull_advice 0.1 s; today 10 ms. Largest result 7.1 K characters (echo_lab feed).
In the browser on his seeded stores every tool answered "ok" from the panel at 412 px / 130 %, dark and light.

Things learned:
- Workers have no localStorage: a tool that reads page caches has to be handed them. Snapshotting only the listed keys
  keeps the key and the history of other features out of the worker.
- His `const enum`s, `import.meta.glob` (ToA season files) and the seed JSONs all bundle fine into the IIFE tool worker,
  so a tool that only needs the app engine and page data can stay off the main thread.
- The Cypress Cartethyia fixture wears 100 % ER: the energy check reads her 8.6 points short of t500's 108.6 % loop
  need, as the energy track's own README says.

## ToA clear check — `src/sim/endgame/` + `/endgame` (batch 2, 2026-10-26)

The current Tower of Adversity season's Hazard Zone, floor by floor, against the teams the account can field: each
floor's real HP, enemy level, RES and effects; Riley's engine fights it with every candidate team at the account's
own state (the Wave 0 seam, `mine` cost, the player's echoes as "My build"); the kill time off the damage curve gives
the crests, and a branch-and-bound gives a Vigor-legal plan for all 12 stages. A Calibrate tab sets the sim beside
the player's real clears.

| Piece | Role |
|---|---|
| `data/toa/s<NN>.json`, `index.json` | GENERATED by `~/Projects/wuwa-tools/endgame/toa_sync.mjs` (see its README): per tower and floor the Vigor cost, level (side 70 / 75 / 80 / 90, Hazard 100), crest goals as **seconds left**, enemies (class, element, HP and count from the sheet), `hp` (the sheet's figure: each group of identical enemies once — "adjusted", AoE assumed — on a multi-enemy floor) / `hpRaw` (every enemy) / `hpType`, and each floor effect's game wording with its hand-translated `model`. Never hand-edit; only seasons whose start date has passed are written |
| `effects.ts` | the effect DSL (`res` / `dmgBonus` / `buff` on intro, negativeStatus, electroFlare, unisonResponse, echoCast / `ramp` / `unmodelled`, each with a chip `label`, a tooltip `note` and a `fidelity` exact / approx / none) and its translation into Riley Gear: `engineProfileOf(E, spec)` (memoised per signature — the engine caches constant stats by Gear id), `withFloorProfile(E, spec, fn)` (set, run, always reset). Pure over the engine modules handed in, so it runs in the worker |
| `toaData.ts` | season files + the **date-only release guard** (`releasedSeasons` / `seasonStatus` on the player's server clock — `SERVER_REGIONS`, the Convene tracker's ids and offsets), `countdown`, `hpSegments` (each enemy group's HP with that enemy's RES from `src/enemies/index.ts` plus the floor's RES rows; neighbours that resist alike merge — Hazard 4's two bosses stay two), `segmentProfiles`, `floorChips`. Season files load through `import.meta.glob` under Vite, `node:fs` under tsx (the presets pattern) |
| `killTime.ts` | pure: the crossing on a `FightCurve`, each HP segment on its own curve from the moment the last fell; past Riley's run (opener + 3 loops, ~100 s) it extrapolates at the last loop's DPS with the floor's time factor (a DMG-taken ramp) divided out and back in, so a ramp still climbing keeps climbing |
| `crests.ts` | `crestsFor` (300 − elapsed ≥ goal), `crestBoundaries`, `nextCrest`; the clear log (`wtplus:endgame:clears`, per team signature, always seconds **used**), `paceOf` = your time ÷ the sim's, `defaultPace` (median), `parseClock` / `clockText`, `clearSecondsUsed` (what the player typed — the time left on the game's countdown, or the time used — as seconds used) |
| `vigorPlan.ts` | pure, deterministic: `planVigor` — 10 Vigor per resonator for the whole zone (Rover's forms one pool), the six timed stages by branch-and-bound (crests, then summed kill time; a tie-aware time bound keeps it ~20 k nodes / ~20 ms on David's 30 candidates), the six low side floors seated greedily at each leaf from spare resonators (assumed 3 crests); `planAlternatives` (the best plan without each pick), `nearMisses` (within 20 s of a crest) |
| `toaRun.ts` | orchestration over a `ToaRunner` (`rileyClient()` as is, or the headless seam): `fieldableKeys` (every member owned, a 4-star / Rover form always — his `accountOf` rule, via `RileyTeamInfo.free`) → `solveMine` (unprofiled) → `pickCandidates` (best variant per composition; saved teams always; the best team of every main DPS before the rest by DPS; 30) → one `curves` request per team with every distinct floor profile (6 for S41) → `floorResults`; `rankFloor`, `planInputOf` |
| `useToa.ts` | the page state: prefs (`wtplus:endgame:prefs`: server region, plan at my pace, which clock the Calibrate tab is typed in — `reading` left / used, default left), the season and countdown, the check (module cache + `wtplus:endgame:check`, reused while its key — engine commit, account key, builds key, season data, saved teams — matches; auto-runs otherwise, cancellable; a key that moves mid-run cancels and restarts it, a second request for the same key joins the run in flight), plan / alternatives / near misses, the clear log |
| `ToaView.vue`, `ToaFloorCard.vue`, `ToaPlan.vue`, `ToaCalibrate.vue`, `ToaTimeBar.vue`, `ToaPortraits.vue` | the page: header (season, reset countdown on the chosen server clock), tabs Floors / Plan / Calibrate; floor cards (enemies with the app's portraits, HP, a RES line per segment weakest first, effect chips solid = modelled / ≈ approximated / dashed = not, crest goals, top 3 teams with kill time, crest stars and a 300 s time bar with the crest zones, the extrapolated part hatched, your logged pace as a tick; "All N teams"); low side floors folded; credits |
| `toaCli.ts` + `cli/index.ts` | `npm run cli -- toa [--limit 30] [--pretty]`: the page's numbers headless (~10 s on David's export: 223 fieldable teams solved, 30 timed) |
| `toa.test.ts`, `profile.test.ts` | pure pieces (guard, segments, kill time, crests, plan rules incl. Rover, candidates, an end-to-end run on a fake engine); the fork's profile on the real engine (pinned totals of the unpatched engine for three teams, the Wave 0 fixture byte-identical after profiled runs, Electro RES / level / ramp / Intro buff each move what they should), the `curves` op through the worker protocol, the whole check on the synthetic account |
| `cypress/e2e/toa.cy.ts` + `phoneLayout.cy.ts` | v3 seeded through `onBeforeLoad`, the clock pinned (Date only) inside S41: floor cards, the real worker timing the fixture's one fieldable team (Aero Rover · Sanhua · Cartethyia), a crest badge, 12 plan stages, a logged clear kept; the no-account state; an ended season greyed with no run started; 360 px / 100 % and 412 px / 130 % without horizontal scroll (team rows drop the rank and put the time bar full width, plan rows put the names on their own line) |

**Seam additions (additive, `src/sim/engine/`):** `RileyEngine.floor?` (`gear`, `context`, `status`, `unison`, the
fork's `profile` — loaded by `rileyNode.ts` and `rankings/solver.worker.ts`), `FightCurve` + `toFightCurve` (beside
`toRunLite`, the same fields) + `fightCurve(E, key, picks, opts)` (untraced, **~6 ms** a run against 55 ms traced),
the worker op `curves` (one profile per macrotask, progress, cancel), `rileyClient().curves(...)` (memo per profile
signature), `RileyTeamInfo.members[].free`.

**Fork patch (`vendor/wuwa_calc`, uncommitted for the integrator):** `src/shared/profile.ts` (new:
`setEnemyProfile({ level?, res?, enemyGear?, teamGear? } | null)`; `res` becomes one memoised "Enemy Resistance" Gear
on top of the Base Resistance — the Base Resistance itself is untouched, because the engine's `ROSTERS` cache keeps a
slot's constant stats across runs keyed by Gear id), `engine/state.ts` (`setEnemyLevel`, `enemyDef()` reads it),
`solve/teamrun.ts` (equips `profileTeamGear()` onto every member and `profileEnemyGear()` onto the enemy). Unset it
is byte-identical: pinned totals, the Wave 0 fixture, and every saved team of David's 9-14 export that solves (26 on
2026-10-26: best `mine` row, then the traced RunLite, sha256 of the whole JSON) against a pristine `git archive e1181a9`
of the submodule loaded side by side — recreate that check from those words after a Riley sync (both engines through `rileyRun.ts`'s
`solveMine` / `tracedRun`, the patched one from `vendor/wuwa_calc/src/`). After a sync, re-pin `profile.test.ts`'s
`PINNED` totals the same way (an unpatched archive of the new commit).

Rules:
- **Released content only.** A season ships once its start date has passed (generator and app both); `solveMine` /
  `curves` keep refusing a team with a member the app hasn't released (Lily). Never cite or link encore in the UI —
  the generator reads the game's floor data from it offline. Credit "Floor HP: ChemX32's DPR Calc sheet (data from
  Sleep)" (linked).
- **Solves run unprofiled.** The solver's caches (`trialCache`, `bases`) don't key on the profile: the best row comes
  from the plain `mine` solve, and only that fixed combo fights each floor. A floor whose element would change the
  best echo set or main stats is not re-searched (the player wears their own echoes anyway under `mine`).
- **Label the sim.** "Sim, perfect execution": one target, no dodging, phases or invulnerable windows; waves summed as
  one HP pool ("estimate · waves summed" badge); kill times past the ~100 s run say "extrapolated"; Vigor rules say
  "check in game". The calibration scales by pace (multiplicative) — one clear can't separate a fixed overhead.
- **DPS** labels are Riley's team DPS against his standard enemy; "on this floor" is the floor's HP over the kill time.

Things learned:
- Untraced `runTeam` keeps `state.hits` (with `at` and `avg`), so a damage curve needs no trace and no `detailFor`:
  ~6 ms against ~55 ms. Six profiles × 30 teams time in about a second in the worker; the solve of the fieldable
  teams (223 on David's account, ~9 s) is the cost, which is why the check persists.
- His `const enum`s survive as runtime objects in both tsx and Vite builds (esbuild emits exported const enums), so
  `E.stats.Attribute.Electro`, `Type.Skill`, `Cast.Intro`, `BuffTarget.Team` work in the worker — verified on
  `vite build` + `vite preview` (the production worker timed David's 30 teams to the same results as the CLI).
- A DMG-taken stat (`Stat.DamageTaken`) is read by non-dot hits only (`damage.ts` uses the subtype figure for
  dots), so the ramp leaves Negative Status ticks alone, as his other DMG-taken debuffs do.
- Hazard 3's Impermanence Heron and Hazard 4's Crownless resist alike (Havoc 55, the rest 25, Electro / Spectro 10):
  the season's 7 HP segments are 6 distinct fights.
- A grid item's `min-width: auto` takes a `truncate`d child's full text width: the floor cards need `min-w-0` (and
  the grid `grid-cols-1`) or the page grows to ~530 px on a phone.
- Element glyphs from the asset host are white: on light themes they sit on a dark disc.
- A `title` tooltip never shows on a touch screen, so the effect chips are buttons: a tap (or click) opens the note and
  the game's wording under the chips; the `title` stays for mouse hover.
- Which clock a player reads off the game is ambiguous (the crest goals and the in-fight countdown say time *left*), so
  the Calibrate tab asks — "I type the time left / time used", kept in the prefs — and previews the conversion
  ("= 1:40 used · ×2.4 the sim") before anything is logged. "87.5" reads as seconds, not 87 minutes.
- On David's account every timed floor reads 3 crests in 16–41 s (sim): his teams sit at 236–372 k DPS against
  floors of 3.1–10 M HP. The crest goals only bite once real clears are logged (lumenastrum measured a 35–65 s fixed
  overhead on hard floors) — which is what the Calibrate tab and "plan at my pace" are for.

## Rotation view — `src/sim/rotation/` + `/rotation` (batch 2, 2026-10-26)

A wuwa_calc rotation as something to follow in game: Riley's traced run of a team **at the player's own account**
(Wave 0's `tracedRun`, `mine` Team Cost, their echoes as the spread) on one page with two tabs. **Cue card:** one line
per swap (`Shorekeeper: Intro › BA×3 [jump] › Plunge › HA › E › R › Echo [swap] › Outro · 4.4 s`) with the moments a
gauge fills (R ready, Outro ready, Tune Break), the opener and the loop (identical loops folded, "Loop ×3"), the loop
target, a play-along mode (big text, tap / Space, Screen Wake Lock, optional beep, a lap stopwatch against the engine's
time, auto-advance at 100 / 85 / 70 % pace), a desktop pop-out (Document Picture-in-Picture, popup fallback) and a
Discord export. **Fight timeline:** member lanes (on-field bars in the kit's hue, press ticks and labels, energy and
concerto step lines with their checkpoints), the cumulative damage curve with kill-time chips (1.5M / 3M / 4M + the
player's own HP line; extrapolated past the fight at the last loop's DPS), and every buff as windows with uptime and
"share of damage dealt while held", grouped Team / Self · member / Enemy. Whole fight, opener or loop, drag to zoom,
a hover read-out (who is on field, the press, each member's gauges, damage so far). On a phone time flows down:
three columns, buffs as a list by uptime, the curve as a sparkline. The app's own team timeline spreads actions
evenly (`teamRotation.ts`: "exact per-action timing isn't tracked"); this one is his frame clock.

| Piece | Role |
|---|---|
| `extract.ts` | **the only reader of RunLite's rows / hits / held buffs** — `extractRotation(run)` → `visits` (one per swap: start / end frames, chips, checkpoints, entry Intro / swap, exit Outro / swap, damage while on field, `wrap` for the fight's last swap-in), `sections`, `lanes`, `buffs` (`BuffTrack`: windows, `permanent`, `maxStacks`), `gauges`, `cumulative`, `fightTotal`, `loopDps`, `killAt(hp)`; `uptime` / `damageCovered` / `union` / `covered` / `clockOf` |
| `tokens.ts` | a row → the press: BA / HA / E / R / Intro / Outro / Echo / Plunge / Air / Jump / Wait / Tune Break, read off the action's own prefix ("Heavy - …" is a heavy input even where his cast kind files it as Basic), then his cast kind, then a short display name (never blank); folded chain digits ("Moonbow 123" → ×3, "23" → 2–3), groups ("+1"), repeats ("x4"), the cancel it ends on (dodge / jump / swap / hold) and the Forte state |
| `cueModel.ts` | `cuePlan(model)` → blocks (opener, loops; back-to-back loops pressing the same buttons fold, `varies` when only a cancel / wait differs), `loopTarget`, `passSeconds`, the play order (`steps`, wrapping to `loopStart`) |
| `player.ts` + `usePlayer.ts` | the play clock as pure state transitions over `performance.now()` (start on first tap, advance / back / pause / jump, a lap per section, `isDue` at a pace) + the live composable (ticks on the animation frames of whichever window shows the cue — the pop-out's own while open — and only redraws; Web Audio beep) |
| `exportText.ts` | `discordText` / `discordMessage` (drops the cancel marks to fit 2,000 characters). **No FloatRotationBoard exporter**: its README shows the DSL's steps only by example and reads character names from a Chinese alias table the player maintains |
| `hash.ts` + `teamCode.ts` | `/rotation#team=<t404 \| row key \| /rankings team code>` or `#chars=A,B,C`, `&subs=mine\|standard\|high` (`tier=` accepted), `&tab=timeline`; `rotationPath(target)` for links. A team code is read to its team by `teamOfCode` (the 72-bit team part, mirrored from his `teamcode.ts`; the test pins it to his `tagTeam()` on every team) and runs at the account — the code's own S / R are not used, and a notice says so |
| `useRotationRun.ts` | target → team list + blocked keys → every loadout variant solved at `mine` (the Loadout picker) → the chosen row traced → model + plan; a stale row falls back to the team's best row with a notice; problems: `code`, `notInApp`, `noBuild`, `unknownTeam`, `error` (retry) |
| `RotationView.vue` (route `/rotation`, lazy in `main.ts`) | page shell: tabs, loading skeleton, problem states, not-fieldable notice (a member the account lacks, with the sequence and weapon rank the run gave them — Wave 0's stand-in under a solve, the row's own on a /rankings row), `useDocumentTitle` per team; `RotationPicker.vue` (no target: the player's saved teams wuwa_calc can run, synced ones badged, and the stock-preset compositions, filterable; "Continue" from `prefs.last`); `RotationHeader.vue` (members with weapon / sets / DPS share, DPS, spread switch, loadout variant) |
| `CueCard.vue`, `CueChips.vue`, `CuePlay.vue`, `CueStage.vue`, `MemberAvatar.vue` | the cue tab, a visit's chips + checkpoint badges, the full-screen play overlay (`100dvh`, safe-area insets, settings: beep / pace / text size / full screen), the stage shared by the overlay and the pop-out (`compact`) |
| `RotationTimeline.vue`, `GanttSvg.vue`, `CumulativeStrip.vue`, `BuffUptimeTable.vue`, `TimelinePhone.vue`, `timelineScale.ts` | the timeline tab (hand-written SVG, no chart library): range / zoom / hover, lanes, curve + kills, buff rows; the phone layout (one or the other renders, `matchMedia(max-width: 767px)`); ranges, x scale, ruler steps, step lookups, HP parsing |
| `useWakeLock.ts`, `usePip.ts` | Screen Wake Lock (re-taken when the page is visible again; "unsupported" / "refused" states shown); Document PiP or `window.open` popup, the page's stylesheets and theme attributes copied in, the theme followed while open, content teleported in |
| `prefs.ts` | localStorage **`wtplus:rotation:v1`**: beep, play text size, pace, custom HP line, last rotation (a broken value reads as defaults) |
| `rotation.css` | global (the pop-out copies it): kit-hue helpers (darkened on light themes), chips, checkpoint badges, the play overlay, SVG fills |
| `rankingsLink.ts` + `rankings/controller.ts` (one line) | the **Rotation** button in Riley's detail topbar, inside the import box `mountImportControls` re-points at every detail render: `/rotation#team=<row key>` (that exact row; plain click routes in-app, a modified click opens a tab). It lets that box wrap, right-aligned (inline styles, so his topbar CSS is untouched): a third control in a box sized for two pushed Import off a 412 px screen |
| `engine/rileyRun.ts` `listTeams` | each member now carries `hue` (his `resonator.color`) and `loadout` (his `LoadoutDef.id`, what a team code names) — additive |
| `rotation.test.ts` | on Wave 0's fixture + hand-made runs + the real engine: visits split exactly at member changes and tile the fight; pass seconds = his section seconds within a frame; R ready where energy reaches `maxEnergy`; Tune Break / Outro-ready filing; lanes never overlap; uptime ∈ [0, 1], "xN" grouped, permanent buffs; curve monotonic and ending on `fightTotal`; `killAt(2 × fightTotal)` at loop-3 DPS; tokens (unknown actions fall back to the display name); loop folding; the Discord snapshot (engine commit pinned); hash round trips; team codes vs `tagTeam()` on 200+ teams; the play clock; parity: rows = his `rotationLines.flat()` minus field summaries |
| `cypress/e2e/rotation.cy.ts` + `phoneLayout.cy.ts` case | v3 seeded through `onBeforeLoad`, the real worker: cue blocks and checkpoints, spread switch, play mode by Space / tap with a stubbed Wake Lock, the pop-out into a stubbed window, the timeline (lanes, kill chips, buffs, loop range, custom HP), the /rankings Rotation button → that row, problems (Lily, unknown code, a real code), the picker; phone: both tabs and the play mode at 412 and 360 px, 130 % text, no sideways scroll |

Rules:
- **Released content only.** `notInApp` teams are refused before anything is solved (the page says which member);
  the picker never lists them. The /rankings button shows on every row; the page explains the refusal.
- **Timing is his frame clock, never Σ `frames`.** A line starts at its own `frame`, a folded line where the press
  before it ended; a visit runs to the next visit's start. Expected seconds are frame-tight (every cancel and swap on
  its earliest frame): the stopwatch shows a gap, never a failure.
- **DPS only**, labelled DPS, from the run (`run.total`); a block's damage is damage dealt while it runs, every member.
- **Buffs are sampled at presses**: a timed buff covers `[frame, frame + left)`, an untimed one runs to the next
  sample of its kind (every line for Team / Enemy, the owner's lines for Self); the page says so.
- Hash reading: a `team=` value is a team key, a row key or a team code read by `teamCode.ts` — never used unread.
- **What a member wore is read off the run**, never assumed: a /rankings row keeps its own sequences and ranks (an
  S6R5 row runs a member the account lacks at S6R5, not Wave 0's S0R1 stand-in), and the notice, the "not yours"
  tooltip and the Discord header's spread ("Team rankings row, ChemX32 substats") follow the run.

Things learned:
- A folded chain line ("Basic - Origin Calculus 123") carries the `frame` / `frames` of the press it shows, its last
  stage: summing `frames` loses every earlier stage — the fixture's 28.9 s opener sums to 21.0 s.
- His loops open across a section boundary: the opener's last line is the first member's Intro and the loop carries
  on with their presses. A visit is filed under the section holding most of it, so a loop block starts with that
  swap-in and the fight's very last swap-in (cut by the end of the fight) is the `wrap`, not a fourth pass.
- `teamcode.ts` imports `mainstats` → `gear` → `context` / `runtime`: his decoder would put the engine core on the main
  thread, hence the mirrored team part. The worker protocol was left alone (another track adds ops to it).
- The Wave 0 fixture is recaptured on every submodule bump (plus-next stamped 653fee7 the same day, rows unchanged):
  tests on it assert structure, and the snapshot pins the commit string.
- Cypress on Riley's table: an alias re-queries the chain against a table he re-renders — pick the row in one `.then`.
  Play mode: the stage has no key handler of its own (the window's handles Space / Enter once), Next / Back keep
  focus off themselves (`mousedown.prevent`), or a focused control would advance twice.
- Where the batch-2 spec and the code differ: segment seconds are not Σ frames / 60 (above); "Outro ready" is concerto
  ≥ 100 % of the bar (10,000 in his ×100 units); the cumulative strip is SVG, not a lazy Chart.js; the
  `rotationLines.flat()` parity excludes his field-summary lines (`aggregate`), which RunLite drops.
- Not built: links from the synced team rows and the stock-preset modal (both live in Ryan's `TeamRotations.vue`; the
  picker lists both sets instead). Palette commands came later (2026-10-31): "Rotation cue card" for a saved team, and
  "On this page" on `/rotation#chars=` (a `#team=` key or code isn't read on the main thread — see "Wiring the pages
  together").

## Energy check — `src/sim/energy/` + `/energy` (batch 2, 2026-10-26)

"How much Energy Regen does this character need **in this team**?" — answered by Riley's engine, not a rule of thumb:
his solver raises ER until every Liberation of the team's loop is paid on time and records each member's worst
charge (`detailFor(run).needs`). The check runs that traced run at the player's own account (the Wave 0 seam:
`solveMine` → best `mine` row across every loadout variant of the composition → `tracedRun`) for every saved team,
and sets it beside the ER the build has in this app. ER stops reading as dead weight in every score built on a
`BuildScorer`: below the need an ER roll is worth the share of the deficit it closes, at or above it nothing.

| Piece | Role |
|---|---|
| `energyNeed.ts` | pure: `needOf` (need = `max(bar ?? 0, minEr)`, `setBy` loop / kit, null = no energy gate), `bandOf` (short · tight within `TIGHT_MARGIN` 5 points · ok · noGate · unknown = no build), `shortBy` / `rollsShort` (`ceil(gap / medianRoll("EnergyRegen"))`, 9.2 % = Riley's `ER_ROLL`), `deficitFactor` (`1 − max(0, need − have)/100`), `erWeight`, `breakdownOf` (own hits and each ally's half share × bar/100, flat gains, the remainder = ER buffs on own hits), `overcapOf` (share of a member's damage at ≥ 100 % Crit Rate from `RunRow.critOver`, the top casts, the rest's Crit Rate), `teamEnergyOf(RunLite)` → `TeamEnergy` (~1.7 KB, what the cache keeps), `compositionKey` |
| `energyHave.ts` | the "have": `menuEnergyRegen` = the character screen's ER of a build (`buildCharacterCalculationContext(…, { alwaysEnabledOnly: true })` — base, weapon, echoes, sets, always-on passives, permanent nodes; never a toggled conditional / team buff, which Riley's `bar` already contains) + `KIT_CONSTANT_ER` (Mornye's unconditional +10 % inherent, a toggle in the app, constant in wuwa_calc; a test recomputes the table from his `menuStats`); `erSignature` / `memoMenuEr` (a clone that only moves non-ER lines shares its ER) |
| `energyCheck.ts` | `measureComposition(engine, ids)` / `measureKeys` → `ok` + `TeamEnergy`, or `notMeasured` with a reason (`incomplete`, `notRiley`, `notInApp`, `noBuild`, `error`) — never a fallback formula; `teamHaves` (the build the team really runs: `resolveTeamCharacters` — a pin, a build named after the teammates, else the active one); `memberChecks`, `characterFloors` (worst need per character across saved teams = the floor), `energySummary`, `scanCandidates` (his list grouped by composition, every member owned or free — 4-stars, Rovers — unreleased ones out) |
| `energyCache.ts` | localStorage `wtplus:energy:v1`: one entry per composition keyed `energy \| engine commit \| accountKeyOf \| buildsKey \| composition`; other commits dropped on save, failures never kept, the 220 most recent, halves itself over quota |
| `useEnergyNeeds.ts` | the app's one shared check (detached effect scope): pages `activate()` / `release()` it; measures saved teams on the seam's `rileyClient()` worker, reads haves from the stores in ~12 ms slices (one calculator build per character — 40 in one task held a phone's main thread for half a second), watches the stores only while a page is active (debounced 500 ms), `viewOf(ids)` for any composition ("Check ER" on a preset), `ready()` for one-shot readers (follows a haves job a data change superseded), the opt-in `scanAll` on a pool of up to three extra solver workers with progress, cancel and a count of compositions that failed |
| `erAwareScorer.ts` | `erAwareScorer(score, id, floor)` wraps a `BuildScorer`: `avg × deficitFactor(need, have(clone))`, `extra.raw` / `extra.er` keep the undiscounted damage and the ER. Hooks for direct engine callers (batch 1): `erFactorFor`, `erAdjustedGain`, `erReferenceCounts` (ChemX32 with ER promoted to third — 2 rolls on 5/5/2/2/2, 3 on 5/4/3/2/2, his `PROMOTIONS`, capped at three), `erRollsToFloor`, `erBenchmarkNote` |
| `energySubstats.ts` | `erFloorScorer(energy, id, score)` → the scorer with the character's floor, or the plain one with a reason (`noTeam`, `noGate`, `notMeasured`, `failed`); `erNeedsOf(energy)` → `{ id: need }` for a worker job / cache key, `erNeedsKey` |
| `EnergyView.vue` (`/energy`) | KPIs (teams checked, short, tight, crit past 100 %), saved teams worst first (order frozen while measuring) with filters and a show-more past eight, the ER floor per character, the opt-in scan ("Other teams you can field": ~170 compositions in ~9 s on David's account), how to read it, the credit line. `?team=<saved team id>` (the palette's "Energy check" command, 2026-10-31) lists every team and, once they are measured and sorted, scrolls to that card and outlines it (`shellDom.scrollToWhenPresent`) |
| `EnergyTeamCard.vue` / `EnergyMeter.vue` / `EnergyBreakdown.vue` / `EnergySheet.vue` | a team's members as meters (fill = have from 100 %, tick = need) + chips; a member opens the breakdown inline (stacked bar against the spend in a validated three-slot palette, legend with energy and share, crit overcap, what being short costs a score); the chips elsewhere open it in a native `<dialog>` — centred on desktop, a bottom sheet under 768 px (phone.css § 6) |
| `EnergyChip.vue` / `EnergyStatusIcon.vue` | "110.8% / 115.2% short 4.4% · 1 roll": icon (✓ △ ! – ◌ ×) + numbers + word, colour never alone; `compact`, `small`, `mini` (a pill beside S/R badges — icon + "ER" on a phone, the numbers in its label) |
| `EnergyTeamChips.vue` / `EnergyCharacterFloor.vue` / `EnergySubstatNote.vue` / `EnergySummaryTile.vue` | self-contained hooks: chips per team row, a character's floor (the `mini` pill and, as a block, a wrapping "needs 115.2% with Mornye + Lynae" / "kit floor 240.0%" line — a full chip there widened today's roster table and squeezed its Best rotation column), the line under substat weights, the "2 characters short on ER · 1 overcapping crit" tile (`tile` for /account, `inline` for a header link) |
| `energyCli.ts` + `cli/index.ts` | `npm run cli -- er [--team <t>] [--all] [--no-auto-buffs] [--pretty]`: every saved team's members (have, need, set by, status, rolls short, crit ≥ 100 %, DPS), the floor per character, the summary; `--all` adds every fieldable composition. David's 9-14 export: 33 teams in ~4 s |
| `energy.test.ts` | the pure reading (bands, rounding as printed, deficit factor, ER weight); the synthetic run fixture (Shorekeeper's 240 % kit floor over her ~187 % loop, the breakdown identity, overcap in [0, 1]); the cache (keys, commit, failures); ER as a floor inside `substatWeights` on the Cartethyia fixture (ER > 0 one roll short, 0 at 20 % over, Crit Rate's gain untouched); the batch-1 hooks; `KIT_CONSTANT_ER` against his engine; on the real engine: t0 at S0 R1 (Shorekeeper 240 over a ~212 loop), determinism and equality with the seam fixture, Phrolova no gate, every not-measured reason; the oracle soft report |
| `cypress/e2e/energyCheck.cy.ts` | v3, seeded through `onBeforeLoad`: a wuwa_calc composition measured (breakdown opens, kept in `wtplus:energy:v1`) and a hand-built one "not measured"; the floor and sheet on /my-rankings, ER as a floor in the substat weights; empty states; a dead engine worker (error + retry, nothing kept, weights fall back); 360 / 412 px at 130 % with no horizontal scroll and the sheet on the bottom edge. `phoneLayout.cy.ts` lists `/energy` |

Rules:
- **The need belongs to the loop.** It is the constant ER at which every Liberation of *that team's* wuwa_calc rotation
  is paid on time, from each kit's own steady state (not from a full bar, as wudamage starts). Say "for this team's
  wuwa_calc loop"; a team that is not one of his compositions is **not measured** — no formula stands in (the
  community outro rule is licence-encumbered, and a guess is worse than none).
- **Compare constant with constant.** The have is the character screen's ER; never add a conditional ER buff the
  fight grants (it is inside the bar). The app's `finalStats.energyRegen` is a decimal: `erPercent(1.184) = 118.4`.
- **Printed rounding.** Have rounds to one decimal, the need rounds **up** (113.04 % asks for 113.1 %); bands compare
  the printed figures, so "short" never shows two equal numbers.
- **Released content only.** Teams with a member the app does not list (`notInApp`, Lily) are "not measured" with the
  seam's message; the scan leaves them out.
- **Cost.** Saved teams measure on open (~0.1 s each warm, kept per account + engine commit, so a revisit paints from
  localStorage); the full scan is a button. A support whose ER turns into buffs (Shorekeeper, Mornye) reads its
  kit floor, labelled "kit floor".
- **Scores.** With a floor every weight is read on `damage × (1 − deficit)`: other stats' relative gains are unchanged
  (the factor multiplies both sides) unless the roll also moves ER. Without one (no saved team, no gate, engine
  failure) the scorer is the plain one and the note says why.

Things learned:
- Riley's `minEr` is a loadout floor, not a loop result: Shorekeeper's 240 % and Mornye's 260 % sit far above their
  loops (~187 % / ~179 %), so `setBy: "kit"` matters for the words ("the kit's own floor") and the breakdown (which
  explains the loop's bar, not the floor).
- `(hit + Σ shared) × bar/100 + flat = spend` holds to ~0.6 % on members without ER buffs on their own hits; with them
  (Shorekeeper's Stellarealm) the remainder is those buffs, shown as a striped "ER buffs on own hits" part rather than
  forced into the identity.
- The app's build card leaves Mornye's unconditional inherent +10 % as a toggle; his engine counts it as kit-constant.
  `KIT_CONSTANT_ER` is the only correction, and the test fails if his kits gain another.
- Phrolova-style kits (Liberation costs no energy) have `maxEnergy = 0`: the bar is null and the chip says "no energy
  gate" rather than a 100 % need.
- A saved team synced on an older engine commit carries an old key in its name ("wuwa_calc t307"); the check maps the
  composition fresh (`teamKeysFor`) and shows the key it measured, so the two can differ — never key anything on the
  name. A composition can also leave his list (David's "Phrolova + Lucilla + Galbrena (wuwa_calc t365)": at e1181a9
  t365 is Shorekeeper + Phrolova + Galbrena and no team has those three), so the words are "not one of wuwa_calc's
  **current** compositions".
- A kit floor is not a loop result and no team sets it: the meter tick, the chip's label, the floor table's "Set by"
  and the substat note all say "kit floor" / "the kit's own floor" rather than "needs … with <team>".
- The fixture-derived numbers the tests pin (Shorekeeper 240 over a 187.47 loop, Lynae 113.85, Iuno 99.10) are the
  same at 653fee7 / e95d4e6 (plus-next's recaptured `runLite.json`), and the real-engine tests pass there.

Hooks into batch 1's pages (written and tested against `plus-next` at merge time; each is a line or two):
- `MyRankingsTeams.vue`: `<EnergyTeamChips :character-ids="t.characterIds" :name="t.name" class="mt-1" />` under the name.
- `MyRankingsCharacters.vue`: `<EnergyCharacterFloor :character-id="c.id" inline />` inside `.mr-who__pills` (the
  `mini` pill keeps the 56 px rows).
- `MyRankingsSubstats.vue` + `panelState.ts`: `er: ErFloorScorer | null` in the state; score with
  `(await erFloorScorer(useEnergyNeeds(), id, rotationScorer(…))).score`; `<EnergySubstatNote>` replaces the
  "Energy Regen reads 0" line, a `floor` badge on the ER row, the baseline text reads `baselineExtra.raw`.
- `AccountView.vue`: `<EnergySummaryTile />` under the hero.
- `echoLab/benchmarkScore.ts`: `BenchmarkOptions.erNeeds` → `erFactorFor` on every scoring and on D, the reference
  from `erReferenceCounts(priority, erRollsToFloor(need, ER of B))`, `EnergyRegen` among the perfect spread's
  candidates, `erBenchmarkNote` as the last note, `erNeed` / `erHave` on the result; `useEchoLab.runBenchmarks`
  passes `erNeedsOf(useEnergyNeeds())`; `EchoLabBenchmark.vue` shows a `mini` "ER" chip per row.
- `account/investPlan.ts`: `InvestOptions.erNeeds` → own gains through `erAdjustedGain(gain, factor(base),
  factor(hypo))`; `useAccountData.ts` passes `erNeedsOf(…)` and appends `erNeedsKey` to the plan cache key.
- Their test, `src/sim/energy/energyHooks.batch1.test.ts`, lands with them (Galbrena's benchmark 12 points short:
  D × 0.88, ≥ 2 reference ER rolls, ER third; Cartethyia 8 short: an Energy Regen roll tops the invest plan at
  1/0.92 − 1; a met need leaves both unchanged).


## Today — `/today`, resets, Waveplates and events from Kuro's own text (batch 2, track "today", 2026-10-26)

A phone-first daily page: "what do I need to do before the reset?". The player's server clock with the daily (04:00)
and weekly (Monday 04:00) countdowns, a Waveplate "full at" clock, events ending soon / running / starting soon read from
Kuro's patch notes, the endgame cycles, the live Convene banners, a caps checklist that clears itself at each item's own
reset, a double-drop banner stated as numbers, `.ics` files for the phone's calendar and an opt-in browser notification.
One column of cards on a phone; two from 768 px with a 14-day timeline below them, three from 1280 px. A compact strip
of it sits on top of `/account` (`TodayCard.vue`, cache only, no network).

| File | Role |
|---|---|
| `durations.ts` | pure: `parseDuration` (the three `✦Duration:` forms — a range with "(server time)" or "(UTC+8)", "Version 3.7 Update - <end>", "Permanently available…" → dropped; slashed dates and "~" too; any other clock such as "(PT)" → null), `parseNewsArticle` (each Duration line paired with the nearest bracketed heading above it inside its section — "[Special Events] [Cubie Wars] Leisure Event" → "Cubie Wars" / "Leisure Event"; stand-alone notices use the "✦Duration✦ + next line" form and name the event from their title), `buildEventList` (resolved on the player's clock — "server" rows move with the region, "utc+8" rows don't; a version-update start = that version's patch-notes time from convene's `versionReleases`; unreleased versions dropped; upcoming rows only inside the live version; hand-entered rows give way to Kuro's text and appear only once their post's publish time has passed; ids carry the end wall clock, so one notice may list a name twice), `bucketEvents` (ending ≤ 3 days / live / starting ≤ 14 days), `doubleDropsAt` + `doubleDropMath` |
| `news.ts` | which notices to read (`pickTodayNotices`: the two newest released patch notes + double-drop and "Event Preview" notices of the last 60 days — only notices whose publish time has passed), `refreshNewsCache` (keeps notices whose publish time didn't change, retries failures next time), `loadNews` (24 h stale-while-revalidate; offline → the cache + a message), `shareMenuFetch` (one ArticleMenu.json read serves this refresh and convene's `loadBanners` in the same page load) |
| `resets.ts` | pure: `lastDailyReset` / `nextDailyReset`, `lastWeeklyReset` / `nextWeeklyReset`, `cycleWindow` (28-day cycles from a Monday 04:00 anchor, with the community season number), `progressOf`, `utcLabel` |
| `waveplates.ts` | pure: `projectWaveplates` (1 per 6 min to 240, then crystals 1 per 12 min to 480; a typed count is taken as just ticked, so ± one tick; above 240 no regeneration), `normalizeEntry`, `dailyRegen` |
| `checklist.ts` | pure: `periodOf` (daily / weekly / `cycle:<id>` / the Matrix phase = the live version), `itemState` (a tick made before its period began reads 0 — nothing is rewritten on a timer), `setCount`, `visibleItems` (hidden items out; the doubled-claims counter only while a double drop runs) |
| `ics.ts` | pure RFC 5545: `buildIcs` (UTC `…Z` stamps, stable UIDs + a growing `SEQUENCE` (`icsSequence`: minutes since 2026-01-01) so a re-import updates in calendars that honour it, a display alarm, CRLF, 75-octet folding that never splits a UTF-8 character, TEXT escaping) |
| `state.ts` | `wtplus:today:v1` = `{ v: 1, waveplates: { value, crystals, atMs } \| null, ticks: { <id>: { n, at } }, hidden, timeMode: "local" \| "server", notify, showLive }`; decoded field by field, defaults on anything unreadable |
| `format.ts` | "21:34 today", "Thu 14:00", "Nov 9, 03:59", "in 3h 10m" — on the device's zone or the server's |
| `rules.ts` + `data/rules.json` | the static rules, each with its source: Waveplate constants (wiki "Waveplate"), the reset hour (Kuro 4188), the ToA / Whimpering Wastes anchors (community — "check in game"), the Endstate Matrix cycle (Kuro 5150, an image post), version ends (3.7 → 2026-11-12, Kuro 5529), hand-entered rows for image-only posts (Chord Cleansing Nov 4–11, Kuro 5653), the double-drop rules (Kuro 4368 / 4466) and the checklist caps (Kuro 3920 / 4188 / 4819, wiki Weekly Challenge / Data Bank / Guidebook) |
| `useToday.ts` | the shared state for the page and the card: the region (convene's `server` preference — one setting for both pages; `useBannerFeed().serverId`), a 1 s clock while mounted and visible (everything else on minute resolution), the news feed + the banner cache refresh (on mount and whenever the tab becomes visible again — a no-op while both caches are fresh), the derived view model, the `.ics` downloads (an event's description states its end as an absolute date on Kuro's clock, never "tomorrow"), `useWaveplateReminder` (Notification API, only after a click, only while a tab is open, desktop browsers only — phones notify only through a service worker, which the site doesn't have, so they get the calendar file) |
| `TodayView.vue` + `ui/*.vue` | the page (`useDocumentTitle`), cards injected with the model: `TodayNowCard` (clock, region, resets), `TodayWaveplatesCard`, `TodayEndingCard`, `TodayLiveCard` (collapsible), `TodayEndgameCard`, `TodayBannersCard` (convene's live banners + `ConveneItemIcon`), `TodayChecklistCard`, `TodayDoubleDrop`, `TodayTimeline` (≥ 768 px), `TodayEventRow` |
| `TodayCard.vue` | the `/account` strip (one import + one tag in `AccountView.vue`) |
| `today.test.ts` + `__fixtures__/` | 37 tests, no live network: `patch37.json` = article 5571 (the 3.7 patch notes, cut after the events), `eventNotices.json` = 4368 / 4466 / 5365 whole, `kuroMenu.json` = a trimmed real menu (fetched 2026-10-26) |
| `cypress/e2e/today.cy.ts` | the feed from the same fixtures (Date pinned on the Asia clock): buckets, an event's `.ics` (absolute UTC+8 date, `SEQUENCE`), the Waveplate clock and its `.ics`, ticks surviving a reload and the weekly reset, the double-drop banner, the region guess, the feed down, a phone at 130 % and the `/account` strip; `phoneLayout.cy.ts` covers `/today` at 360 (classic) and 412 (v3, 130 %) |

Rules:
- **Kuro's text wins.** Dates come from the official notices; a hand-entered row exists only for a post Kuro made as an
  image, carries its article id, and gives way to a parsed row of the same event. wuwatracker's timeline had Artisan's
  Search ending 11-26 and Cubie Wars 11-12 03:59; the patch notes say 10-26 03:59 and 11-11 11:59.
- **Released content only.** Only released versions' patch notes and notices already posted are read; an event of a
  version that hasn't gone live is never listed, and an upcoming event is listed only while it starts before the live
  version's end (`rules.versionEnds`, else its release + 40 days) — the day-before "Event Preview" of the next version's
  event stays hidden.
- **Every rule row carries a source.** The ToA and Whimpering Wastes calendars are community-sourced (the wiki's dated
  Hazard Zone floors keep a 28-day Monday cadence — 2025-09-15, 2025-10-13, 2026-01-05 — and agree with wuwatracker), so
  they say "check in game". Re-check caps and anchors at every version (`rules.json` `checked`).
- **Each event keeps its clock.** Server-time rows are drawn on the region's offset; UTC+8 rows (web events) are one
  global moment, and in "server time" mode they still print in UTC+8 with the label.
- **No push, no service worker.** The calendar file is the reminder that works with the browser closed; the
  notification is an explicit opt-in that fires only while a tab is open.

Things learned:
- **The spec's "Fantasies 2 free claims" is out of date.** 3.0 (article 3920) added 2 Waveplate-free Remnant Crystal
  claims a week; 3.4 (4819) removed the Remnant Crystal claim and folded those rewards into **Weekly Activity**, whose
  points and rewards reset every Monday 04:00. The checklist tracks "Weekly Activity milestones" instead; the 160-Astrite
  figure isn't stated in Kuro's text, so it isn't shown.
- Endstate Matrix cycle 2 "lasts from Version 3.5 to Version 3.8" and its phases "reset with version updates" (5150, an
  image post); 3.7 runs to "2026-11-12, before maintenance" (5529, image). So 3.7 is Phase 3 of 4 and resets with the
  3.8 update; the page shows that date as "≈" (04:00 UTC+8, when 3.7's own maintenance began).
- The 3.7 double drops were announced only in images (5529, 5653); the stand-alone "[Chord Cleansing] … Double Drop
  Event" text notices stopped after 4368 / 4466 (early 2026). Both rules are the same: 3 doubled claims a day, refreshed
  04:00 server time; Simulation and Forgery share Bountiful Crescendo's. Purification & Separation stacks since 3.0 (2
  claims for 4×) — the same +1 run per claim. 3 × 60 = 180 Waveplates a day for Tacet, below the 240 a day regenerates,
  so banking for the event gains nothing.
- Patch-notes headings are `<strong>` lines; `articleLines` drops the tags, so the parser keys on the brackets. Reward
  lines like "[Log in for 1 day in total]: …" also start with a bracket — a heading never continues with ":".
- `wallClockMs` + the region offset is all the time-zone handling needed: Kuro's servers have no daylight saving; the
  device's zone (which does) only matters for "your time" display, which `Date`'s local fields handle (the America
  server's 04:00 is 04:00 CDT until Nov 1 and 03:00 CST after — both shown right).

- Verified against Kuro's own posts on 2026-10-26 (verify pass): the hand-entered Chord Cleansing row matches the
  image in 5653 ("2026-11-04 04:00 - 2026-11-11 03:59 (server time)"), and every other event in that image is also in
  the 5571 patch notes with the same dates; 5529's image says "2026-09-30, after update - 2026-11-12, before
  maintenance"; the 3.7 maintenance notice (5476) ran 04:00–11:00 UTC+8, which is why the version end is drawn at
  04:00 UTC+8 with "≈". The next version's maintenance notice (posted about a week ahead) states that end exactly — a
  candidate for a parsed row instead of `rules.versionEnds`.
- Don't use "ⓘ" (U+24D8) as an icon: the app's font has no glyph for it and it falls back to a box. The checklist's
  source link is an inline SVG.

Hooks for later (not wired here): the command palette can open `/today` from `PLUS_PAGES` and could add "Waveplates
full at…" / "What ends today?" commands that read `useToday()`; "Explain" could quote `doubleDropMath`; the ToA row
links to `/endgame` as soon as that route exists (`router.resolve` check — the toa-clear track adds it); an ER check
(er-check track) has no place on this page.

## Weapon value — `/weapons`, `src/sim/weaponValue/` (batch 2, track "weapon-value", 2026-10-26)

"How much does X's signature add?" across the whole roster, on the player's own builds and teams: one bar per set-up
character for the signature's next copy (R1 of a signature they don't hold, the next refinement of one they do) with
every further refinement to R5, the standard 5★ and best 4★ alternatives behind each row, and a **Selector** tab that
ranks the options of a standard 5★ / Moonlit Path / custom selector for this account. The weapon maths is batch 1's
(the pull advisor's ladder, /account's team scorer), moved out once rather than written a third time. Lazy route in
`main.ts`, the last entry of `PLUS_PAGES`, the tab title through `useDocumentTitle`; v3 and classic alike.

| Piece | Role |
|---|---|
| `weapons/weaponLadder.ts` | **moved out of `convene/advisorEngine.ts`** (which now calls it): `scoreWeaponCopy` (the held weapon refined = one number on the player's own passive toggles; another weapon = headline at full stacks, `weaponPassiveMode: "all-max"`, plus the stats-only `low`, `"all-off"`), `weaponLadder` (R(n+1)…R5 or R1…R5), `signatureWeaponOf`, `weaponName`, and `withWeaponAtFullStacks` — every passive of the new weapon written into the character's own `weaponPassives` at max stacks, the stored-toggle twin of "all-max", so a team run (which has no passive-mode option) carries the headline's weapon. `advisorEngine.test.ts` unchanged and green |
| `account/investPlan.ts` | refactor only: the plan's team half is `createTeamScorer(characters, echoes, teams, ranking.teams, { autoTeamBuffs, enemy, errors })` → `teamFor(id)` (`bestFieldableTeam`, scored as it is) / `buildBlock` / `impact(ctx, block, hypoCharacters, hypoEchoes)`, and `slicer` is exported; `investPlan` runs through both, numbers unchanged (its tests green) |
| `weaponValue.ts` | pure / async, time-sliced (a frame every ~12 ms), cancellable: per set-up character, on the ranking's best rotation — `signature` (status `swap` / `held` / `maxed` / `none` / `not-in-app`, steps through `weaponLadder`), `standard` (each Standard Weapon Convene 5★ of their type at R1), `four` (every 4★ of the type at R5 on the headline, the winner bracketed), `refine` (the held non-signature weapon +1). Every option also carries the strongest fieldable team re-run through `createTeamScorer` with the weapon in hand. Rows with an unknown equipped weapon (`unknown-weapon`), no rotation or an engine throw come back with a status and no number; characters without a weapon are listed in `notSetUp` |
| `teamPanels.ts` | **the hand-set panel rule** (see Things learned): for the hypothetical only, a teammate whose own Team Buffs panel resolveTeam keeps verbatim follows the provider's weapon — old weapon's team buffs off, the new weapon's on, each entry exactly as resolveTeam derives it for that member (one resolve with their picks cleared: stacks, refinement, Outro handoffs), a refinement step written onto the entries the panel has. The base is never touched. `option.panels` says which panel moved; the detail shows "panel follows" |
| `pools.ts` + `data/pools.json` | hand-entered selector pools per game version, each with `source`, `sourceUrl`, `version`, `verified`: the **standard 5★ resonators** (Beginner's Choice targets in Kuro's Convene Details, news 758; patch notes 1.1–3.7 add no 5★ to the Standard Resonator Convene), the **standard 5★ weapons** (758's Standard Weapon Convene list — an image, read — plus the 3.0 patch notes, news 3920: the Synth Armament series joined it; two per weapon type, and Riley's `weapons/standard.ts` names the same ten), the **Moonlit Path pick** (Shorekeeper / Carlotta / Phoebe, player reports only — Kuro's 3.7 notes list Moonlit Path cosmetics — `verified: false`, the page says "check in game"). `releasedItems` filters to what the app lists. Refresh at each upstream sync |
| `selector.ts` | `rankWeaponPool(items, weaponValueResult, characters)` — read off the chart, nothing scored twice: per weapon every set-up user of its type (a new copy at R1, or R+1 for a wearer = the dupe), ranked on team gain where there is one, plus the best own gain. `rankResonatorPool(input, SelectorRiley)` — Riley's engine at the account: `candidateAccount` registers an unowned candidate `{ owned, S0, weapon: STANDARD_PICK, R1 }` (a name no loadout lists, so `accountWeapon` runs `standardWeapon(l)` — his best non-signature pick — instead of index 0, the signature, which `mine` hands a resonator with no weapon) and an owned one at S+1; one batch at the account as it is (every fieldable team of each main DPS the candidates' teams serve), then one batch per candidate; **team uplift** = the largest rise of some main DPS's best `mine` team, **new teams** = compositions only the pick makes fieldable with their best DPS, **dupe** = the app engine's next sequence through `createTeamScorer` (the /account plan's S+1). `notInApp` candidates and teams with an unreleased member are never registered or solved |
| `selectorRiley.ts` | the browser adapter over the shared `rileyClient()` worker, with a page-session solve cache keyed by the seam's `memoKey` (a run's base batch can outgrow the client's 200-entry LRU), bounded at `MAX_SOLVES` = 1200 with the least recently used dropped first; a failed or aborted batch is never kept (`selectorRiley.test.ts`, a fake client) |
| `valueCache.ts` | `createValueCache(storageKey, version)`: module memory + sessionStorage (the investCache pattern); `wtplus:weapons:value` keyed by the ranking fingerprint, `wtplus:weapons:selector` by fingerprint + account + builds keys + the options picked |
| `useWeaponValueData.ts` | the ranking from the cache entry /my-rankings and /account share (`investment: true`), else a progressive `rankRoster`; then `weaponValue` (own cache, same fingerprint), rows handed over as they finish, a generation counter, cancelled on unmount |
| `weaponValueView.ts` | pure view model: `barModel(row, scope)` (head = next copy, `low` in own scope only, ladder ticks, R5, best alternative), `sortBars` / `filterBars` / `filterCounts`, `axisOf` / `axisTicks` / `at`, `kpisOf`, `unscored` (the footer's "could not be scored"), `prydwenUrl` (link out only; Rover forms and compound names go to the list), `pctFine` ("+0.04%" rather than "+0.0%"), prefs `wtplus:weapons:prefs` |
| `WeaponValueView.vue` | header (Live chip, Signatures / Selector tabs mirrored in `?tab=`, Recompute), four KPI tiles, the toolbar (Team / Own, filters with counts, sort, not set up) inline on desktop and one **Options** bottom sheet on a phone, a legend, progress, the chart (shared axis with gridlines), skeleton rows, greyed not-set-up rows, the method notes, a footer that says how many characters or teams could not be scored (the messages in its tooltip); `?focus=<id>` opens and scrolls to that row once scored (the /my-rankings link). `SelectorChooser` is a `defineAsyncComponent` chunk (it carries the wuwa_calc client) |
| `WeaponValueBar.vue` · `WeaponValueDetail.vue` | a row: who (S pill, held weapon), the signature, the bar (solid = next copy, hatched run with ticks = every refinement to R5, whisker = stats-only floor in own scope), the figure; a phone card with the steps as chips. The detail: now / signature R1…R5 / your weapon +1 / standard 5★ / best 4★ with own and team damage and change, "measured on" rotation and team, Open in calculator, What if (`/my-rankings?focus=&tab=whatif`), Prydwen guide ↗ |
| `SelectorChooser.vue` | pool cards (the unverified one badged), the source line ("Selector list for 3.7, last checked …"), option chips to leave out what your copy of the selector lacks, a custom pick with an in-page suggestion list (released roster only), Rank / Cancel with progress, ranked rows with three metrics each and a detail (uplift team vs today's best, the best new teams, the dupe, Open on Team rankings — `own=0` for a pick you don't own) |
| `myRankings/MyRankingsCharacters.vue` | a **Weapons ↗** tab link beside Rankings ↗ on every opened row → `/weapons?focus=<id>` |
| `weaponValue.test.ts` · `selector.test.ts` | Cartethyia fixture + Ciaccona (Cadenza) + Chisa (Kumokiri): ladder monotonic, R5 ≥ R1, equal to `scoreAdvisorTargets` for the same featured weapon (held and swap), stored full stacks = all-max, a team-buff signature lifts the carry's own slot (with and without a hand-set panel), the panel rule (on / off / refinement), standard / 4★ / refine options, unknown weapons and signatures skipped with a status, cancel, the weapon pool (deterministic, dupes), the pools.json schema, the cache; stubbed Riley for the resonator ranking (order, the release guard, one base batch, cancel) and the real engine for the standard pick (`pick.weapon ≠ 0`, `weaponApproximated`, the same team without registration runs index 0) |
| `cypress/e2e/weaponValue.cy.ts` + `phoneLayout.cy.ts` | empty state + hub entry; rows, KPIs, scope / filter / sort / not set up, an opened row's options, the cached reload; `?focus=`; weapon pool + leaving an option out, resonator pool solved in the worker, the unverified badge, custom suggestions (Lily never offered); phone 412 / 130 % and 360 (cards, open row, sheet, selector, no horizontal scroll). `phoneLayout.cy.ts` gained its own `/weapons` test at 360 / 100 % and 412 / 130 % |

Rules:
- **Engine numbers only, never mixed.** % of damage are this app's engine (best rotation, RANKING_ENEMY); the
  selector's team uplift and new teams are wuwa_calc DPS at the account, labelled as such; the dupe is the app's.
- **A weapon the character doesn't hold is a bracket**; its team figure runs the headline (full stacks). The held
  weapon refined is one number on their own toggles.
- **Released content only**: pools filter through `releasedItems`, the resonator ranking through `notInApp` / the
  client's blocked keys; the custom pick offers the roster pickers' characters only.
- **The cache key is the ranking fingerprint**, not `accountKeyOf` as the spec suggested: that key covers sequences,
  weapons and ranks only, so an echo edit would have served stale figures.
- Pools are hand-entered with their source; a pool only players report stays `verified: false` with "check in game".

Things learned:
- **resolveTeam keeps a hand-set panel verbatim**, so a support's new weapon never reached the carry: on David's 9-16
  export Sigrika's panel names Shorekeeper + Qiuyuan, and Stellar Symphony read +0.2 % team (Qiuyuan, derived, got the
  +14 % ATK; Sigrika didn't). With `teamPanels.ts` it reads +4.0 % (R5 +8.0 %); Lynae's Spectrum Blaster R2 0.7 → 2.0 %,
  Ciaccona's Woodland Aria R2 0.3 → 1.8 %, and swapping a support *off* a team-buff weapon now shows the real loss
  (Lynae → Solar Flame −4.0 → −9.4 %). /account's plan still keeps panels verbatim — a one-line `panelsFollowWeapon`
  call in its `push` would align the two, but moves /account's numbers, so it is left for David to decide.
- The Cartethyia fixture's panel ticks Woodland Aria's shred (Ciaccona wore it in that export); with Ciaccona on
  Cadenza that tick is stale and hid the effect — the test drops it.
- Riley has **no team at all** for Encore, Calcharo or Lingyang (671 teams at 653fee7): the standard selector can only
  say so ("No wuwa_calc team"). Jianxin runs at his kit baseline S2 even registered at S0 (`baseSequence`).
- A native `<datalist>` popup segfaults Cypress's headless Electron (exit 139) — and is clumsy on Android anyway; the
  custom pick uses an in-page suggestion list.
- Cypress counts an element below the fold inside a scroll container as hidden (`scrollIntoView()` first), and a
  spec looping over viewports must clear `wtplus:weapons:prefs` — the remembered tab (now mirrored in `?tab=`) carries.
- Measured, dev server, David's 9-16 export: Node `weaponValue` 1.1–1.4 s for 24 characters (≈ 34 scorings each);
  browser first visit 4.3 s cold (app boot, ranking and the run), a forced recompute 2.4 s with no long task; the
  Moonlit Path selector 11 s in the worker on a first run (291 solves, most of them the base batch), the standard
  resonator pool ~2.5 s.

Gates: `weaponValue.test.ts`, `selector.test.ts`, `selectorRiley.test.ts`, `advisorEngine.test.ts`, `investPlan.test.ts`;
`cypress/e2e/weaponValue.cy.ts`, `phoneLayout.cy.ts`, `themes.cy.ts`. The CLI `snapshot` diff is empty (nothing on the
calc / team / rank paths moved).

## Build my team — re-gear a team from the echo inventory, `/build-team` (batch 2, Roadmap Phase 4, 2026-10-26)

David's own Phase 4 spec ("create my builds for me … echoes cannot be reused"). A team — a saved one (`?team=<id>`) or
three characters (`?members=A,B,C`, optionally `&key=<wuwa_calc team key>`) — gets one new build per member from the
player's real echo inventory, never one echo twice, from wuwa_calc's best `mine` pick per member (the Riley run seam,
Wave 0). Entry points: the `/rankings` detail topbar ("Build from my echoes" beside Import), a wrench button on every
`/my-rankings` team row, the plus hub (`PLUS_PAGES`). Lazy route in `main.ts`; v3 and classic alike; the tab title
through `useDocumentTitle`.

| Piece | Role |
|---|---|
| `buildTeam/rileyPlan.ts` | Riley's `RunMember` → a `MemberPlan` in app keys: sets with piece counts (`setKeyOf` over `echoSetLabelMap`), the main-slot echo and its Phantom skin (`echoKeysOf` over `mainEchoesData`, 4 name overrides: False Sovereign, Nightmare: Adam Smasher, Reminiscence: Suhsin, Reminiscence: Threnodian - Voidborne), the layout and main stat per slot (`parseMainStats("43311 CD ATK Fusion atk atk")` — his labels, lowercase = 1-cost), the ER need `max(bar ?? 0, minEr)` from the traced run's `needs` (er-check's rule). `planFromPreset` reads Ryan's first curated echo preset, `planFromCurrent` the member's own build; `priorityOrder` = Riley's `bySlot` share, highest first |
| `buildTeam/plans.ts` | `plansForTeam(ids, RileySource)`: his keys for the composition → `solveMine(keys, "mine")` → best row → `tracedRun` (ER needs) → `solveMine([key], "high")` (High Invest DPS); a team he does not list, one with an unreleased member (Lily) or one he cannot solve falls back to presets, then to the member's current build, and says why. `RileySource` = `rileyClient` in the browser, `rileyHeadless` on Node |
| `buildTeam/constraints.ts` | a plan + the options → `MemberConstraints`: allowed sets, main-echo species, the format (43311 / 44111 as themselves; **41111 runs as "Any"** with every 3-cost and every 4-cost but the main echo dropped — slot 0 is the main echo and a species never repeats, so only 4+1+1+1+1 is left), main stats per cost as a **pool pre-filter** (upstream's optimizer has none; the main echo's own copies keep any main stat), the ER floor. `filterPool` (why each echo is out: ignored / set / cost / main stat / taken by a teammate / worn outside the team), `mainEchoCandidates` (the plan's echo if the pool holds a copy, else every species of that slot's cost), `shortfallOf` (per cost: need vs distinct species held), `relaxLevels` (plan → any main stat → any layout; **sets are never relaxed automatically**), `legalInSlot` (the swap pass) |
| `buildTeam/headlessOptimizer.ts` | upstream's optimizer without the Calculator page. `prepareMemberJob`: the context from `buildCharacterCalculationContext` laid out field for field like Calculator.vue's `handleOptimize` (`optimizerContextOf`), the rotation through `buildOptimizerRotationData`, set-bonus buffs per label through `resolveSetBonusStats`, main-echo buffs through `applyMainEchoBuffEffects` + `mergeMainEchoBuffStats` — from the **exact settings the saved build will carry** (`buffConfigOf`: the optimizer's own setting, else the calculator's, else on at max stacks). `erOffset` = full ER − character-screen ER of today's build, so a floor on the screen ER becomes a min-stat row on the optimizer's `energyRegen` (`erMinStat`). `inlineBackend()`: perf's `planOptimizerGeneration` + `optimizerLoadoutStream` and the processor's scoring (`computeLoadoutFinalStats`, `scoreOptimizerRotation`) in one thread — upstream's inline `optimize()` ignores the cost format |
| `buildTeam/workerBackend.ts` | the browser backend: upstream's `generator.worker.ts` / `processor.worker.ts` driven from the main thread exactly as `optimizeWithWorkers` drives them (init → ready → start, pull-based `continue`, slim `process` batches, merged top-N), one generator shard, processors per Settings › Preferences (`splitOptimizerWorkerCount`); `score()` reuses a processor initialised with a top-N above any batch as the swap pass's batch scorer. Calculator.vue's private `serializeEchoes` / `createSerializableContext` are re-stated (`serializeOptimizerEchoes`, a JSON round trip) |
| `buildTeam/allocate.ts` | pure, the optimizer comes in as `AllocationApi`: greedy in priority order with an exclusion set; every order (≤ 4 members) when the members' pools overlap; a swap pass (a member takes one echo from a teammate, who backfills with the echo given up or one of the 16 likeliest free echoes, scored exactly) kept only when the allocation is better — more members on a loadout, then more ER floors met, then a higher team value — and no floor that held is lost |
| `buildTeam/buildTeam.ts` | the store-free orchestrator `buildMyTeam(input, backend, hooks)`: team context through `resolveTeamCharacters` (pins, builds named for the team, auto team buffs — the Team Rotations switch), objective = **the team's own slot actions** (one unit: the team's damage) or each member's best rotation (`rotationCandidates` + `scoreRotation`, the /my-rankings pick, weighted by Riley's share over today's damage); per member the relax levels in two passes (floor met, then the most ER); **today's build competes** (when it keeps the plan's sets and nobody before took its echoes), so the result is never worse than what they wear for no reason. Then every number is the calculator's: `calcCharacterRotationDamage` on the draft build, the character-screen ER (`alwaysEnabledOnly`), the team total with every draft pinned (`calcTeamRotationDamage`), the source of every echo (already worn / unworn / a teammate's / worn outside the team). `draftBuildFields` = the slot's build with the echoes as inventory pointers (`buildEchoLoadoutFromIds`), slot 0 as `mainEcho` with the run's buff settings, `echoSetBonus` from `getSetBonusEffects` (what the echoes panel writes), the run's set-passive settings |
| `buildTeam/apply.ts` | after the player confirms: a **new** build per member named for the team ("Built for Mornye + Lynae", " (2)" … never an existing name — resolveTeam's by-name rule reads it too), pinned through upstream's `setTeamCharacterBuild` (`team.buildIds`); "Also make active" = upstream's `equipBuild`. Undo (`wtplus:buildTeam:undo:v1`, the last apply): created ids, previous pins, members whose builds list was synthesized, and with make-active their records and the `equipped` / `equippedPresets` maps; restored verbatim while the touched records still fingerprint as right after the apply, else only what is still unused is removed and the page says what it kept. Storage refused → the undo lives in page memory and the page says so |
| `buildTeam/useBuildTeam.ts`, `BuildTeamView.vue`, `BuildTeamPlanCard.vue`, `BuildTeamResultCard.vue`, `BuildTeamEchoTile.vue`, `BuildTeamPicker.vue`, `BuildTeamSwitch.vue`, `buildTeamView.ts`, `buildTeam.css` | the page: picker (saved teams, set-up first) → **Plan** (per member: priority with up/down, plan source, sets, main echo, layout chips, an editable ER floor with today's ER, the objective; options in `localStorage["wtplus:buildTeam:options:v1"]`, known booleans only) → **Build** (progress per member, combinations checked, Cancel) → **Review & save** (team rotation before → after, Riley's DPS at the account before → after with the new echoes, the gap to his High Invest, per member now → built with Δ, ER vs need, why it changed — an ER trade, a relaxed plan, buffs switched on, same echoes — five echo tiles with their source, a Save tick per member, the save bar with "Also make active", Undo). Phone: one member card at a time behind a portrait switcher, tiles two a row, the Build / Save bars fixed at the bottom |
| `buildTeam/buildTeamCli.ts` + `cli/index.ts` | `npm run cli -- build-team <team \| "A,B,C"> [--any-set] [--any-main-stat] [--keep-main-echo] [--take-from-others] [--one-order] [--er "Mornye=260,Lynae=none"] [--order a,b,c] [--no-auto-buffs] [--pretty]` — read-only, prints the plan and the result |
| hooks | `main.ts` (upstream, one route line), `shell/plusPages.ts`, `myRankings/MyRankingsTeams.vue` (a wrench link per row: the saved team, or `?members=` for a preset row — the page uses a saved team of the same three when there is one), `rankings/controller.ts` (`BUILD_TEAM_LINK` + `pointBuildTeamLink` in the Import box: the row's three, main DPS first, and its team key; an icon on a phone), `skittle-theme.css` (two rules) |

Rules:
- **Nothing is written without a preview and a confirm.** New builds only; the active build changes only with "Also make
  active"; echoes are never taken off anyone (a pinned build points at inventory echoes, and upstream lets builds share
  one); by default echoes worn by characters outside the team are left out of the search entirely.
- **No echo twice in the team.** A member who gets no new build (skipped, no echoes of their sets, no rotation) keeps
  the build they wear here, and its echoes stay out of every other member's search — the current build of a member
  that shares one with them cannot compete either. Every pick carries `sharedWith`: the teammates whose build in this
  team (pin, named, active) wears it today. The Save ticks open on `defaultSaveSlots` (`buildTeamView.ts`): builds
  that score at least as much, or less only to meet an ER floor today's build misses, plus any teammate a ticked build
  takes echoes from; unticking one names the echoes the team would wear twice in the save bar and the confirm dialog
  (`shareConflicts`).
- **Every number shown is the calculator's** on the produced build (parity below); the optimizer only ranks. Riley's
  figures are labelled DPS and only ever compared with his own (before / after / High Invest).
- **Released content only:** the seam's `blocked` keys (Lily) skip a team, and the plan falls back to presets; the
  `/rankings` link hides itself and `?members=` refuses a composition with a key `notInApp` lists.
- **Supports** are scored on their own part of the rotation with their teammates' current gear providing the team buffs;
  the team total after the run re-resolves the team with every new build pinned, so a support's new 5-piece reaches its
  teammates there. Team-objective scoring (a support optimised for the carry's damage) is a follow-up.
- Set passives and main-echo buffs **nobody had set are switched on at max stacks** (Riley's run plays them) and listed
  per member; the saved build carries exactly those settings, which is what keeps the calculator's number equal to the
  optimizer's.

Things learned:
- Headless contexts read `mainEcho.echo` and `echoSetBonus` off the record — the calculator only derives them from the
  slots while it is mounted (`CalculatorEchoTile`'s slot-0 watch, `updateEchoSets`). A build that only swaps the echo
  pointers keeps the old main echo and set bonus in every team calculation; the draft writes both.
- Riley's main slot can be an Elite (Suisui's Forbidden Bastion in a 43311): the fallback main echo's cost is the plan
  echo's own (`speciesCost`), not the layout's first cost.
- On David's 9-16 export 100 of 258 echoes are worn by characters outside a three-member team, and supports often lack
  a full set of Riley's 3-cost element pieces (Chisa / Lucilla one Havoc / Glacio 3-cost short, Suisui no 4-cost HP of
  Song of Feathered Trace that Xuanling doesn't wear) — hence the relax levels, each said in words on the card.
- A member with no plan at all (no pick, no preset, no build) used to mean an "Any" search over ~160 echoes: millions
  of loadouts. The member is skipped with a sentence instead; turning "The plan's sets" off is the explicit way in.
- Upstream's `combineBuffObjects` (optimizer.ts) folds a main-echo buff that is talent-specific (`specificTalentBuffs`,
  `modifySpecificTalents`) to 0 while the calculator applies it: for such echoes the optimizer ranks without the buff.
  Every common main echo's buff is plain numbers (parity holds); not changed here (upstream code).
- Upstream's processor keeps its heap across batches and never answers a batch it crashed on: the swap-pass scorer
  (`workerBackend.ts` `score()`) drops the worker on an error or a cancel mid-batch, so a late reply can never answer
  the next batch and a crash rejects instead of hanging the run.
- Two echo tiles a row on a 360 px phone at 130 % text leave ~60 px for the name: a container query (`bttile`, content
  box under 6.5rem — 360 / 375 px phones, not 412 px or desktop) moves the main stat under the name and shrinks the
  picture, so names break between words.
- Measured (David's export): CLI inline backend 0.3–5 s per team (Xuanling's, 6 orders, 15 s single-threaded); the
  page through the workers 0.9–8.8 s. `cli -- build-team 1` on 9-16: Aemeath −1.5 % (today's build is 4.4 points short
  of the 115.2 % ER her loop needs, the new one meets it), team −1.2 %; the Xuanling team +1.8 % (Suisui +9.5 % from
  shedding ER she did not need, Xuanling +3.2 % from Song of Feathered Trace 5pc's buff, which she had not set).

Gates: `allocate.test.ts` (fake scorer, 20 echoes: no reuse in any order, priority, floors before value, the swap pass
never lowers the value and finds the swap greedy misses, all orders, deterministic, cancel), `buildTeam.test.ts` (names
and layouts, ER need, preset plans, 41111 → Any + the 4-cost rule, main-stat filter, shortfall, relax levels, swap
legality; **parity**: the headless job ranks exactly as upstream's `optimize()` on the same pool, and the produced build
reads in the calculator the optimizer's score to 6 decimals; her own build competes; the floor out of reach keeps the
most ER; apply / undo on real Pinia stores — new build, pin, active untouched, make-active and its `equipped` map, a
synthesized builds list, exact undo, partial undo after an edit; a teammate who gets no new build keeps their echoes),
`workerBackend.test.ts` (fake workers: results matched to the loadouts asked for, a crash and a cancel mid-batch
reject), `rileyPlan.test.ts` (node: every set piece, main echo
and layout of his whole loadout list maps — 0 unmapped; plans for the Wave 0 synthetic account), `buildTeamView.test.ts` (default Save ticks, conflicts, notes);
`cypress/e2e/buildTeam.cy.ts` (picker + hub, empty, /my-rankings → plan → build → confirm → saved and pinned → the Teams
editor's slot reads "Built for …" → undo, cancel, phone 412 px / 130 %), `phoneLayout.cy.ts` (`/build-team` in the
route loop, plan and result at 360 px), `themes.cy.ts`; the CLI snapshot diff against the base commit is empty on both
exports.

## Set from the icon next to +25: echo screenshots without the Sonata filter — `src/sim/echoScan/setGlyph.ts` (track "glyph", 2026-10-31)

The phone importer (phase D) and `wuwa-tools/echo-import/extract.py` used to read an echo's set from the Sonata-filter chip
bottom-left, so every screenshot had to be taken with a set filter on. The detail panel prints no set name, only a small
icon right of "+25": a coloured ring around a white symbol, drawn from the same art as the app's own set icons
(`echoSetImageMap`, 76 × 76 webp on the assets CDN). Those icons are the templates — nothing is cropped from screenshots,
so all 37 sets (and new ones Ryan adds) are covered.

| Piece | What it does |
|---|---|
| `setGlyph.ts` | pure pixel maths over `Pixels` (RGB or RGBA arrays). `locateBadge`: in the layout's `glyphSearch` window (150 × 90 at x 2280, y 240 — right of the level text, room for "+0" to "+25"), the circle (radius 16–20 px × scale) whose brightness (max of R, G, B) just inside its rim beats just outside it the most. `refineBadge`: the rim's steepest drop along left / right / up / down, searched only r − 2.5 … r + 3 around the found radius, gives a sub-pixel centre and radius (18.0 px on the S26 Ultra). `sampleCircle`: 24 × 24 bilinear samples over the circle's square (RGBA premultiplied = drawn on black). `iconFeature`: an icon's circle is its alpha ≥ 128 box. `glyphScore`: zero-mean normalised cross-correlation per colour channel inside 0.97 R, averaged. `matchGlyph`: ranks the candidates; **confident** = score ≥ 0.70, ≥ 0.08 ahead of the runner-up, and the ring's chromaticity (0.86–0.97 R) within 0.10 of the icon's |
| `setGlyphCanvas.ts` | the canvas half: `setTemplates(sets)` fetches each icon once per session (a failed one retries next time), `matchSetIcon(bitmap, window, scale, candidates)` reads the window 1:1 and matches. Main thread, a few ms; no worker entry |
| `phoneEchoScan.ts` | `glyphSearch` region in `PHONE_LAYOUTS` (scaled like the rest); `RecordHints.glyph` replaces `setFromGlyph`; `ScanRecord.setSource` = chip / icon / only set. Order: the chip (if it names a set the echo can roll) → the echo's only set → the icon. A sure icon that disagrees with the chip adds "The Sonata filter says X, but the set icon next to +25 looks like Y. Check the set."; an unsure icon fills the set with its best guess and adds "Set read from the icon next to +25, but not sure: X (next best: Y). Check the set." An icon match the echo can't roll is ignored |
| `PhoneEchoBatchParser.vue` | reads the icon for every echo with more than one set (so the chip gets cross-checked too), before the bitmap is closed; the portrait worker starts only when a name is unreadable (it loads ~230 portraits, which every scan used to wait for). The intro's "turn a Sonata filter on first" became a tip under it: "No Sonata filter needed … With a filter on (optional), the set's name also shows bottom-left and is checked against the icon." The Claude strip no longer lists "no Sonata filter" as a reason to use Claude. Set selects carry `data-set-source`. Below 768 px the review list drops its 50vh box (it held about one card and cut the notes off mid-line); the modal scrolls instead |
| `imageMatch.ts` | `matchSet` removed: the worker's set match squeezed the 52 × 48 crop and the whole icon to 32 × 32 without lining the circles up |
| tests | `setGlyph.test.ts` (node env, `sharp` decodes): six real 150 × 90 search windows (`__fixtures__/setGlyph/*.png`: Pact of Neonlight Leap, Halo of Starry Radiance, Moonlit Clouds, Flamewing's Shadow, Havoc Eclipse on a light backdrop, Song of Feathered Trace) and the 13 app icons they need (`icons/*.webp`, the CDN's bytes). Held to the Python twin case by case (`twin.json` from `wuwa-tools/echo-import/dump_glyph_fixture.py`: same set, same confidence, scores within 0.003); ring found at R 17–19; no icon in a flat window; a 0.75-scale screenshot; Pact vs Halo; a missing true set is flagged (ring colour / low score). `phoneEchoScan.test.ts`: all 75 recorded shots replayed with the chip blanked and an icon hint (same records, no new flags), a sure / unsure icon, chip vs icon, an icon the echo can't roll, an echo's only set. Cypress `echoScanNoFilter.cy.ts`: the committed Sabercat Prowler screenshot with its chip painted over in the browser, real OCR + the CDN icons → Sound of True Name with `data-set-source="icon"`, no set note, saved. `echoScanBatch.cy.ts` now also checks the three chip shots come out `chip` with no disagreement note |

Accuracy (`python3 set_glyph.py bench`, 203 labelled S26 Ultra shots of 17 sets, no OCR): **203/203 among the echo's own
sets and 203/203 among all 37, 0 confident wrong**; every right answer scores 0.86–0.96. Per set (shots): Song of Feathered
Trace 40, Trailblazing Star 28, Rejuvenating Glow 24, Sound of True Name 18, Moonlit Clouds 17, Havoc Eclipse 13, Flaming
Clawprint 9, Flamewing's Shadow 8, Chromatic Foam 7, and 5 or 4 each of Gusts of Welkin, Halo of Starry Radiance, Pact of
Neonlight Leap, Dream of the Lost, Tidebreaking Courage, Midnight Veil, Eternal Radiance, Law of Harmony — all right. Closest
pairs (margin over the runner-up among all 37): Pact of Neonlight Leap vs Halo of Starry Radiance 0.10 (same shield, yellow
vs green ring), Moonlit Clouds vs Midnight Veil 0.13, Halo vs Pact 0.13. Stress with the true set removed: from the echo's
own sets 173/173 flagged; from all 37, 181/203 flagged — the 22 confident ones are Moonlit Clouds ↔ Midnight Veil (only
possible when the echo's name is unreadable *and* the registry lacks the set). End to end, `extract.py --no-chip`: 203/203
records exact (173 sets from the icon, 30 one-set echoes); with the chip, the 198-shot regression stays 198/198 with no row
flagged, so the icon never disagreed with a chip.

Things learned:
- A wide rim search (⅔ r … 4⁄3 r) found the white symbol's edge on Flamewing's Shadow and Law of Harmony and halved their
  score (0.44 / 0.53, still right); around the found radius they score 0.92 / 0.93. It looked like "the game draws it
  differently" — it was the radius.
- Python's `round()` rounds halves to even, JavaScript's `Math.round` up; the twins share round-half-up so the locator
  samples the same pixels (one score moved by 0.01).
- Only 17 of 37 sets have labelled shots; the other 20 rest on their icons. A set whose in-game icon fits worse is
  flagged (the 0.70 bar), not guessed.

## Build history — versions per character, compare and restore, `/build-history` (track "build-history", 2026-10-31)

Builds change through the optimizer, Build my team, a Settings import (which replaces the whole account) and by hand, and
nothing showed what a build was yesterday or could undo it. `/build-history` keeps **versions of each character's build in
this browser**: the build as it is now with its damage and a Save button, the versions newest first, a comparison of any
two in plain words, and Restore behind a confirm that lists every change. Lazy route in `main.ts`; v3 and classic alike;
the tab title through `useDocumentTitle`; an entry in `shell/plusPages.ts` (Plus menu and palette: "history", "undo",
"restore" …).

**Where it lives — the /account character drawer, not a panel beside the calculator.** The drawer is the plus
per-character home and already a phone bottom sheet, and Build my team / imports are account-level; a diff with five echo
slots and a stat table needs a full-width page on a phone, which a calculator side panel cannot give without editing
Ryan's layout. So the drawer gets a "Build history" section (count, newest version, one button to the page), and the page
does the work. The calculator gets a "Build history" link in the plus share strip over its build card (one `RouterLink`, plus
file), so the page is one tap from where builds are edited too.

| Piece | Role |
|---|---|
| `history.ts` | store-free core. **A version is the share format**: `buildPayload(…, { detail: "full" })` from `share/buildCodec.ts`, one member with every build field and the five echoes **inlined** — no second format, and a version still says exactly what the build was after its echoes were re-imported under new ids or deleted. Read back through `parseSharePayload` (validation, sanitising, version gate) like a received card. `localStorage["wtplus:buildHistory:v1:<id>"]`, newest first; **20 per character** (oldest drops); **1.5 M characters for all histories together** (the oldest version of the longest history goes first; a character's last version only when nothing else is left); **deduped**: a version whose fingerprint (`versionFingerprint`: the member without build name, level and talents) equals the newest one is not stored again; a refused write (quota, private mode) keeps the history in page memory and says so. `recordVersion`, `snapshotCharacters` (never throws: a snapshot must not stop the write it guards), `readHistory`, `deleteVersion`, labels `manual` / `before-build-team` / `before-build-team-undo` / `before-restore` / `before-import` |
| `diff.ts` | `gearDiff` (pure): weapon + refinement + level, sequence, the **five slots** side by side (same / changed / moved — "moved here from slot 3" when the same echo by `echoFingerprint` sat elsewhere — added / taken off; for a changed slot the echo, set, main stat and every substat as "Crit Rate: 7.5% → 8.1%", "New substat", "Substat gone"), the other build fields in words ("buff toggles", "the Team Buffs panel", "saved rotations" …; set bonus and main echo follow from the echoes), level / talents as character notes; `lines` (every change) and `summary` (one line per slot, for the confirm). Through the engine: `characterScreenStats` (`buildCharacterCalculationContext(…, { alwaysEnabledOnly: true })` — the character screen, upstream's build-card semantics) and `statRows` (HP, ATK, DEF, Crit, ER always; other bonuses when non-zero; of the six element bonuses only the character's own and any that changed); `bestRotationOf` (`share/headline.ts` `buildHeadline` — the /my-rankings pick over their own, curated and wuwa_calc rotations — on the live build, else on the newest version that scores) and `damageOf` (`scoreRotation` at `RANKING_ENEMY`, the version's record with its echoes inline, teammates from today's account) |
| `restore.ts` | `planRestore` (pure): each slot's echo → an inventory echo with exactly those stats (the one worn there now first, then one nobody else wears), else **added back to the inventory** (`echoProblem` guards it, as the share import does), with who else wears it; the summary of changes now → version; notes (target build, echoes added back or shared, level / talents stay, "saved first"). `applyRestore`: **first `recordVersion(…, "before-restore")`**, then the stores' own API — `saveEcho` for added echoes, `ensureCharacterBuilds`, one `$patch` of the record built with upstream's `applyBuildFields` (the split `equipBuild` makes: level, talents, substat weights, `builds`, `activeBuildId` kept), the active build's stored entry refreshed like `equipBuild`'s commit, then `applyEchoLoadout` for the pointers and the `equipped` map. **Writes into the build worn now**; other builds untouched; per-weapon settings of other weapons, notes, portrait, build-card colour, checklist and build status kept (`KEEP_FIELDS`, never in a version) |
| `importGuard.ts` | the Settings import / backup restore (upstream `applyImportedDatabase` → `characterStore.hardSetState`, then a page reload 1.5 s later). Pinia `$onAction` runs before the action: `pendingFrom` copies the characters whose record the import changes or drops, with only the echoes they wear, into `localStorage["wtplus:buildHistory:pendingImport"]` **synchronously**; `flushPendingImport` turns it into "Before a Settings import" versions as soon as the history chunk loads, else on the next start (the guard flushes on install). Light on purpose: installed from `shell/PlusShell.vue` (main bundle), the codec stays lazy |
| `useBuildHistory.ts` | the page state: versions, `now` (the live build as a version, reactive), the best rotation once per character, damage per version scored one at a time and cached by fingerprint + rotation, the comparison (opens on the newest version → now; after a restore, the build from just before it → now), save / restore / delete |
| `BuildHistoryView.vue`, `BuildHistoryDiff.vue`, `view.ts`, `buildHistory.css` | the page: one-line intro (shorter on a phone), character picker (characters with a build or versions, by name, "· n versions"; `?char=`, else the calculator's, else the first with versions), the now card (portrait, build worn, weapon · S · echoes, **damage now** "average per rotation on <rotation>" with DPS when the rotation has a duration, Save this version + a status line), the versions (time "Today 14:02" / "Yesterday" / "Oct 29", why it was saved as a chip, build name and gear, damage on the same rotation and "−8.5 % vs now", Compare with now / Restore / delete), the comparison (From / To pickers; damage before → after with the change, the rotation and enemy named; weapon and sequence; five slot cards; the stat table — two-line rows on a phone; other settings; Restore). One column on a phone; from 1024 px the comparison sits beside the now card and the list |
| hooks | `main.ts` (one route line), `shell/plusPages.ts`, `shell/PlusShell.vue` (installs the import guard), `buildTeam/useBuildTeam.ts` (`save` snapshots the members being saved, `undo` the members it touches), `account/AccountCharacterDrawer.vue` (the Build history section), `share/ShareBuildStrip.vue` (the Build history link; the buttons wrap) |

Write paths in `src/sim/` that change builds, and what each does here:
- **Build my team's save** — snapshot "Before Build my team" of every member being saved (also without "Also make active": the
  dedupe makes it free when nothing changed later). **Its undo** — "Before undoing Build my team".
- **Restore** — "Before a restore" first.
- **Settings import / backup restore** (upstream's, through the guard) — "Before a Settings import" of each changed character.
- **Share import** (`share/ShareView.vue`) — not snapshotted: it only ever adds a build, never touches the active build or the
  live fields ("Imports only add", above).
- **Rankings rotation import** (`rankings/importFromRankings.ts`, `characterRotations`) — not snapshotted: it appends a
  rotation to the live build and changes no gear.
- Hand edits in the calculator and the optimizer's Equip are Ryan's code paths: they are what **Save this version** is for.

Rules:
- **Every number is the app's engine**, at the roster rankings' enemy (level 100, 20 % RES); both sides of a comparison are
  scored on **one rotation** (the character's best today), so the change is the build's, not the rotation's.
- A restore never changes the character's level or talents, never another build, and never takes an echo off anyone
  (a shared echo is named in the confirm). An echo the inventory lost comes back as a new inventory echo, named first.
- A history under a character id this app does not know (and the account does not hold) is not offered in the picker: a
  restore would write a record for them, which the share import refuses too.
- Ryan's named builds per character (his builds modal) are a different thing — alternatives side by side; this is one
  build over time. His builds feature is not touched.

Gates: `buildHistory.test.ts` (the version equals the share card's member and reads back through the share reader; a
damaged entry and a newer format are dropped; **a version reads the same character-screen stats and the same rotation damage
as the live build**, and `bestRotationOf` is `buildHeadline`'s pick; dedupe incl. a rename; 25 saves keep the newest 20; the
size budget; snapshots skip a character with no build; the diff: refinement and slot 3 in words, a reorder reads moved, every
substat change; both versions through the engine on one rotation, equal to `scoreRotation` through the inventory; restore on
real Pinia stores: plan in words, every echo found, written back with the `equipped` map, notes / talents / other builds kept,
the engine reads what the version read, a lost echo added back, other weapons' settings kept), `view.test.ts` (times, summary,
character list and pick, the import guard: only changed characters, stash before the write, versions after, a stash left by
the reload flushed on start, a damaged stash dropped); `cypress/e2e/buildHistory.cy.ts` (v3, 412 px / 130 %: save, dedupe,
change the build, the comparison's weapon / slot / stats / damage, 360 px, restore through the confirm → refinement and echoes
back, no echo added, the swapped echo off her, "before-restore" first, delete; a Settings import keeps "before-import"; the
account drawer's link), `buildTeam.cy.ts` (the save leaves "before-build-team"), `phoneLayout.cy.ts` (`/build-history` in the
route loop at 360 px).

Left out: a per-version note / name, history across devices (it is this browser's, like the rest of the account), a
snapshot before hand edits in Ryan's calculator (his code paths; Save covers them), and compression of the stored versions
(0.3–8 KB each on David's export; the 1.5 M budget holds several hundred).

## Vercel build — rolldown thread pools pinned in `vercel.json` (2026-10-27)

Both production builds after the batch (6a27ea71, 480c3db4) hung at `transforming...` until Vercel's 45-minute limit,
while every local build passed in seconds. The cause is a deadlock inside rolldown, not in our code. Vite bundles
every `new Worker(new URL(…))` target in a nested `rolldown()` build started from the main build's transform hook.
The batch took that from 2 sites to 7 (`rankings/controller.ts`, `engine/rileyClient.ts`, `buildTeam/workerBackend.ts`,
`echoLab/echoLabClient.ts`, `Calculator.vue`, `ai/toolWorker.ts`, `convene/ui/scanLog.ts`), and the nested builds all
run at once. Rolldown sizes its tokio runtime from the *physical* core count. Vercel's build VM reports
`cpu cores: 1` (2 hyperthreads), which gives rolldown one worker thread, and the 7 nested builds starve on it. The
main build waits on 7 pending transforms that never return.

- **Reproduce locally:** `ROLLDOWN_WORKER_THREADS=1 ROLLDOWN_MAX_BLOCKING_THREADS=1 npx vite build` hangs. `taskset`
  does not reproduce it, because the physical-core count ignores CPU affinity.
- **What does not help:** queuing the worker builds one at a time doesn't fix it either.
- **What does:** 2 worker threads, or 1 worker thread with 16 blocking threads, build normally.
- **The fix:** `vercel.json` sets `buildCommand` to
  `ROLLDOWN_WORKER_THREADS=4 ROLLDOWN_MAX_BLOCKING_THREADS=32 npm run build`, so the build no longer depends on the
  machine's core count. Verified on Vercel with a no-cache preview build of 480c3db4.
- **When Vite or rolldown is bumped:** re-check with the 1/1 command above, and drop the override once it builds.

## WaveScan: add only new echoes — `src/sim/wavescan/` (2026-10-31, track "wavescan")

David scans his whole echo bag on PC with Wavescan (Ryan's desktop scanner, format v1, `docs/wavescan-import.md`) and
wants the echoes he doesn't have yet, nothing else. Ryan's import can't do that cleanly for an older inventory: its
identity key (`getEchoIdentityKey`) compares exact echo names, and since Ryan #594 the app lists Phantom skins
("Phantom: Sigillum") as their own echoes while older inventories store them under the base echo. David's 2026-10-30
scan (274 echoes, 141 worn) against the 09-16 inventory (258): Ryan's Add would put in **91**, of which only 44 are new.
This panel puts in the 44.

Where: Settings › Wavescan (v3: the "Your Data" group; classic: the Wavescan tab; `/settings?section=wavescan`, which
the Scanners page links). After a file is uploaded or pasted, an **"Add only new echoes"** card sits between Ryan's
"Wavescan data" card and his "Echoes" card. His Add / Replace and the equipped-loadout review are unchanged below it.

| Piece | Role |
|---|---|
| `wavescan/newEchoes.ts` | pure. `skinBaseOf(key)`: a Phantom skin → the echo it plays as (`Phantom<X>` → `<X>` with the same class, else the one same-class echo whose name minus a "Word:" prefix is the skin's name: "Phantom: Kronaclaw" → "Reminiscence: Kronaclaw"; all 42 skins in the registry map). `planNewEchoes(scanned, inventory)` → `toAdd` / `owned` (each with the inventory echo it matched, `kind` and `skinDiffers`) / `notInScan`. Three passes, strictest first, each over what the earlier ones left on both sides: **exact** = the app's duplicate rule with the echo read as its base, both ways; **order** = the same five substat pairs in another order; **rarity** = the same rolls with another rarity. The two loose passes only pair fully rolled echoes (five substats): fewer equal rolls can be another copy, and a 4★ never has five substats, so an unleveled 5★ is not a 4★ typo. Copies are counted per pass (a multiset in file / inventory order, like `planWavescanEchoImport`). Display helpers: `groupByBaseEcho` (cost, then name), `substatsOf` (labelled values, `%` on percent stats), `statName` (four long bonus names shortened: "Liberation DMG"), `matchNote`, `secondCopiesUpstreamWouldAdd` |
| `wavescan/WavescanNewEchoes.vue` | the card: what it is, three count tiles (New · will be added / Already in your inventory · skipped / Only in your inventory · kept, never deleted), the note that who wears what doesn't change and how many new echoes the scan saw worn, how many second copies Ryan's import below would add, "Add N echoes to my inventory", then three lists (new open; the other two render only when opened) |
| `wavescan/WavescanEchoGroups.vue` | one list: echoes under their base echo with cost and count; each card has the set, a "Phantom skin" badge, "Main stat …" and the substats with labels, a note for a loose match, "Worn by X in game. Added unequipped." (new) or "Equipped on X here. Stays equipped." (only in the inventory) |
| hook: `components/SettingsWavescan.vue` (Ryan's: 2 comment lines, 2 code lines, a blank, `defineAsyncComponent` added to his vue import) | `defineAsyncComponent` of the card and `<WavescanNewEchoes v-if="mapped" :mapped="mapped" />`: it reads his `mapWavescanEchoes` result (his validation and skipped list), so the chunk loads only after a file is read |
| `phone.css` § 15 | toasts wrap inside the screen below 768 px (DaisyUI's `.toast` is `nowrap` + `min-width: fit-content`, and the top-right toast grew off the left edge with this card's message and with Ryan's own Wavescan import message) |

Rules:
- **Asks first.** "Add N echoes to my inventory" opens the app's confirm (`useConfirm`: what is added, skipped and kept);
  the add has no undo. Cancel writes nothing.
- **Adds only.** New echoes go in through `inventoryStore.saveEcho`, the call Ryan's import makes, unequipped. Nothing is
  removed, no existing echo is changed (an id the scan row carries that the inventory already has is re-rolled, since
  `saveEcho` overwrites by id), `equipped` / builds / presets are never touched, including for echoes the scan saw worn.
- The plan is a `computed` over the inventory store, so after the add the card reads 0 new and a second pass over the
  same file adds nothing.
- Close matches (order, rarity) count as owned and say why on their card. Two copies of one echo, set and main stat
  with the same five values are the same echo in practice; adding a second copy would let the optimizer equip one
  echo on two characters.

Measured (local only, not committed: David's 2026-10-30 scan against the seeds of the 09-16 export, 258 echoes):
**44 new, 230 owned, 28 only in the inventory** — of the 230, 215 exact (34 of them across a Phantom skin), 14 with
the substats in another order, 1 stored as 4★ with 5★ rolls (Phantom: Cuddle Wuddle); all 15 loose matches are fully
rolled, so the five-substat rule (verify round 1) leaves these counts as they are. The strict rule alone (exact
pass only) gives 59 / 215 / 43. 25 of the 44 new were worn in game; 6 are skins. Ryan's Add on the same file: 91 (the
44 + 47 second copies).

Gates: `newEchoes.test.ts` (synthetic fixture `__fixtures__/newEchoes.json`: skins both ways, three copies against
two, one changed substat = new + the old one only in the inventory, a reordered and a 4★-typo close match, exact beats
loose for one owned echo, loosely typed rows, every registry skin maps to a same-class echo, labels and notes,
grouping, no loose match below five substats), `WavescanNewEchoes.test.ts` (counts with labels, the confirm and its
cancel, the add: only the 3, unequipped, existing rows and
`equipped` unchanged, then 0 new; an id collision never overwrites; mounted inside Ryan's `SettingsWavescan`); Ryan's
`tests/components/SettingsWavescan.test.ts` and `tests/wavescan/` unchanged and green; Cypress
`cypress/e2e/wavescanNewEchoes.cy.ts` (v3 at 412 × 915 and 130 % text: upload, counts, skins under their base, notes,
no sideways scroll with every list open, add → cancel writes nothing → confirm → localStorage has exactly the 3 more and the same `equipped`, reload and
re-upload → 0 new; classic tab at 1440).

## Wiring the pages together — Explain, share on /my-rankings, palette commands, the team Summary (track "wiring", 2026-10-31)

The 10-26 verify passes left four follow-ups between pages that each work alone: no Explain button used
`useAssistant().explain()`, `/my-rankings` rows had no share button, the palette had no command for anything you do
*with* a character or a team, and the Teams page's Summary computed its members without the plus team context.

| Piece | Role |
|---|---|
| `ai/explain/explainPayloads.ts` | pure: what each Explain button sends — a chip title, the question, the numbers on screen as labelled JSON. Every key says what the number is and what it was measured against ("average damage per rotation", "team DPS in wuwa_calc", "Energy Regen the loop needs (%)", "kill time (m:ss used)", "crest goals (seconds left)"), and a `measured` line names the engine (`APP_ENGINE_NOTE`: this app's damage per rotation at RANKING_ENEMY; `RILEY_ENGINE_NOTE`: wuwa_calc DPS at the account — never compared with the app's figure). Generated names go as `parsePresetName` titles with the stored name beside them. `explainCharacterRank`, `explainTeamRank` (`/my-rankings` rows and the `/account` hero), `explainEnergyTeam` (null until measured), `explainToaFloor`, `explainWeaponValue` |
| `ai/explain/ExplainButton.vue` | one button → `explain({ title, data, question })`; the request is a value or a function built on click (a table of them costs nothing), `null` hides it. `outline` / `ghost`, `xs` / `sm`, `iconOnly`, `phoneLabel` (words below `md`, a 2 rem icon button on desktop). No key: the panel shows its setup and keeps the question and the data in the composer (the existing `parkInDraft`); with a key it sends at once |
| where the buttons are | `/account` hero ("Explain this team", beside "This team in wuwa_calc"); `/my-rankings` an opened character row ("Explain" + "Share build" above the tabs) and every team row (Explain, and Share on saved teams — a preset row has no saved team to share; desktop icons with tooltips, words on a phone's third line); `/energy` a measured team card's footer ("Explain these needs"); `/endgame` each floor card under its teams ("Explain this floor", once timed); `/weapons` an opened row's actions ("Explain", ok rows only) |
| `shell/paletteCommands.ts` | pure: `contextTargetOf(context, sources)` — the character / team the page is about: the calculator's active character (set up), `/weapons` / `/my-rankings` `?focus=`, the team open in the Teams editor (`teamRotationsActiveTeamId`, only on `/teams`), `/energy?team=`, `/build-team?team=` / `?members=` (a saved team of the same three when there is one), `/rotation#chars=` (parsed with `rotation/hash.ts`; a `#team=` key or code needs Riley's list in the worker and is left alone). `commandItems` — per character: Share <name>'s build (the sheet), Weapon value (`/weapons?focus=`), Substats & what-if (`/my-rankings?focus=&tab=substats`), and on its own page Ask Claude how to raise their damage; per three-member team: Rotation cue card (`rotationPath({ kind: "chars" })`), Build from my echoes (`/build-team?team=` or `?members=`), and for a saved team Energy check (`/energy?team=`), Share team, Open in Team rotations (off its own page). Plus ToA clear check (`/endgame`), "Which selector pick is best for me?" (`/weapons?tab=selector`) and Turn team-aware buffs on / off (`autoTeamBuffs`, with a toast). "On this page" rows head the empty list (group `context`, titled "… for this team" with the members first in the line below, since a phone cuts the end off); the rest are `queryOnly`. A command that would reopen this page is left out, and one listed on this page isn't repeated under Commands. `paletteWithCommands` = `paletteItems` + these |
| `shell/paletteItems.ts` | groups `context` ("On this page", weight 0.07) and `command` ("Commands", 0.04); `PaletteItem.queryOnly` (left out of the empty list) and `order` (a tie-break before the title: a character's own commands before its teams'); `PaletteRun` `share`; action `toggle-team-buffs`; `PaletteSources.context`, `.autoTeamBuffs`, `teams[].memberKeys` |
| `shell/CommandPalette.vue` | builds the context from `useRoute()`, the character store and sessionStorage; runs `share` through `requestShare` and `toggle-team-buffs` |
| `shell/shellDom.ts` `scrollToWhenPresent` | polls (timer, no rAF) until a selector is on the page, centres it, outlines it for 2.5 s, sets `data-wt-focused` |
| `src/components/TeamRotationSummary.vue` (upstream, +11 −5 lines) | the Summary page's `recompute()` runs `resolveTeamCharacters(t, characters, echoes, { auto: autoTeamBuffs, enemyConfig })` first, as the editor does, and computes the slots and the team total on its `characters` / `buildIds`; a second `watch(autoTeamBuffs, …)`. `auto: false` is upstream's path unchanged (Cypress) |

The Summary page disagreed with the editor, the team list and `/my-rankings` — measured on David's 9-16 export before the
fix (Summary vs editor, Average per rotation, team enemy): Aemeath + Mornye + Lynae 9,487,580 vs 9,458,278 (+0.3 %),
Xuanling + Suisui + Chisa 7,356,616 vs 7,660,012 (−4.0 %), Sigrika + Mornye + Lucilla 6,702,838 vs 7,234,657 (−7.4 %).
The Summary matched `cli team --no-auto-buffs` to the unit: it ran upstream's own team buffs. After the hook all three
read the editor's figure (and `cli team`). `/my-rankings` agrees with them where the team's own enemy is RANKING_ENEMY
(Aemeath, Sigrika); David's Xuanling team has a different enemy set, so `/my-rankings` (5,556,247 at level 100 / 20 %)
differs from the Teams page by design.

Rules:
- **Never call the API from an Explain test.** The unit tests set a runtime loader that throws; `wiring.cy.ts` answers
  every api.anthropic.com request with a 500 and asserts none arrived. With a key stored, Explain sends at once — the spec
  saves its key only after the click (the question waits in the composer) and re-visits to clear it.
- **Label every number.** A key without its unit ("gain", "value") is a bug in a payload: Claude reads the keys.
- **The entry chunk stays light.** `paletteItems.ts` is in it (PlusShell's page titles); anything only the palette
  uses goes in `paletteCommands.ts`. Entry chunk 1,511.73 kB / 379.70 kB gzip against 1,510.53 / 379.17 on plus-night.
- **No template comment at a component's root** (`ExplainButton.vue`, `ShareSheetHost.vue`): dev builds keep it, which
  makes the root a fragment, so a parent's scoped styles reach the button in production but not in dev.

Things learned:
- `git stash` in a worktree uses the repository's one stash list: a `stash` with nothing to save followed by `stash
  pop` pops someone else's entry into your tree (here David's 2026-09-13 Drive-backup stash; the pop conflicted, so git
  kept the entry, and the tree was reset). Don't stash in these worktrees; compare builds by checking out the base's
  files and back.

Gates (2026-10-31): `vue-tsc --noEmit` clean; vitest `src/sim` 72 files / 730 tests (+ `tests/components` 52 / 340);
`explain.test.ts` 8, `paletteItems.test.ts` 12; Cypress `wiring.cy.ts` 4/4, `phoneLayout.cy.ts` 12/12, `myRankings`,
`account`, `assistant`, `share`, `energyCheck`, `toa`, `weaponValue`, Ryan's `teamRotationSummary` /
`teamRotationsSummaryAndStatus` all green (`teamRotationBuildOverride.cy.ts` 0/2 here and on plus 8fc83311 alike:
DaisyUI's modal stuck at opacity 0 in headless Electron). Vercel-style build 7.9 s, no `import.meta.glob` left, no new
Worker entry point (7 `worker-import-meta-url` transforms, as before). Phone shots 412 / 130 %, dark and light:
`/home/doeszen/Projects/wto-wt/night/shots/wiring/`.

Left for later: palette commands that read a page's state rather than its URL (`/rotation#team=<key>`, the team a
`/build-team` run produced); an Explain on `/endgame`'s Plan tab (another track was editing `ToaPlan.vue`); Explain on
`/today` (`doubleDropMath`) and "Waveplates full at…" commands (`useToday()`), as the Today section suggests.

Verify pass (2026-10-31): a saved team's row on `/my-rankings` carries four buttons on a phone (Explain, Share, build,
↗); at their content width they ran 21 px past a 360 px screen at 130 % text (the page scrolled sideways). The action
line now takes the whole row and wraps (`MyRankingsTeams.vue`, `wiring.cy.ts` checks 412 and 360). `/energy?team=` and
`/weapons?focus=` are read from the route rather than once at mount: the palette's "Energy check" / "Weapon value"
run on that same page only changes the query, and used to do nothing. The ToA payload's clock is the card's (59.6 s →
"1:00", not "0:60").

## Shell refinements — page not found, the Ask button, phone fixes (2026-10-31 shell audit, track "fix-shell")

The overnight audit of the shell (`night/reports/audit-shell.md`: /today, /convene, the Ask panel, the palette, the
Tools+ menu, the calculator's first load, Settings, themes, titles, an unknown route, cold load, the PWA files) found 2
high, 10 medium and 13 low items. This pass fixed both highs, every medium and most lows. Re-checked on the branch
first: all of them still reproduced after the Ryan #681–#684 sync.

| Piece | What it does |
|---|---|
| `shell/NotFoundView.vue` + `main.ts` (one line, the last route: `/:pathMatch(.*)*`, name `NotFoundView`) | any address the router doesn't know. It used to be a blank white page (no Nav, so not even the theme). Now: Nav and the saved theme, "Page not found" with the address asked for, a "Did you mean" link, the calculator / My account / Today, a search row that opens the palette, and every `PLUS_PAGES` entry. Title "Page not found — …". Not in `PLUS_PAGES`: nobody navigates to it |
| `shell/notFound.ts` | `closestPage(path, pages)`: letters-only edit distance (adjacent swaps count once) against each page's path and title, first segment too: `/acount` → My account, `/calculator` → the calculator, `/echolab` → Echo Lab. `NOT_FOUND_ROUTE`: `isAppRoute` (navigation.ts) and /today's endgame links skip the catch-all, since it matches every path |
| `shell/plusBar.ts` `usePlusBar(el, { pinned? })` | a plus page's own bar pinned to the bottom of a phone (Echo plan's "Sonatas to set · Show", Build my team's run / save bars, the welcome card) publishes its height as `--plus-bar-h` (the tallest when two are up; 0 when the bar isn't `position: fixed`, e.g. Build my team's bars on a desktop). `{ pinned: true }` counts a line that ends a fixed-height page: the /rankings credit, so Ask no longer covers "My roster rankings ▸" |
| `PlusShell.vue` (`.wt-ask-button`) | Ask sits at `1rem + --nav-bottom-h + --plus-bar-h`: above the Echo plan bar, no longer on its "Show" button (an 8 px strip of it was tappable) |
| `phone.css` § 16 | every page's `.content` keeps Ask's height (plus any plus bar) free below its last line, so the end of a page always scrolls clear of Ask (the /inventory pagination, /share's summary, /teams' Total DMG, every footer); not on /rankings (a fixed-height column). On a v3 phone, when Ryan's bottom bar slides away on a scroll down (`.nav-bottom-bar--tucked`), Ask slides off with it and a `.wt-plus-bar` drops to the screen's bottom edge instead of floating over an empty band |
| `phone.css` § 17 | Settings › Backup & Restore (a column-less `grid` grew to the file input's min-content: 456 px at 412; the two export buttons wrap at 360) and /info/tuning-odds (InfoView's v3 `2rem 3rem` padding and a column-less results grid: 428 px) fit a phone |
| `phone.css` § 18 | `dialog[data-test-whats-new-v3-modal]:not([open]) { display: none }`: the closed v3 "What's new" dialog laid out at opacity 0 inside the viewport, so its `loading="lazy"` pictures (~5 MB, a 3.7 MB GIF) downloaded on every cold load. 0 requests now until it opens; `showModal()` still shows it |
| `phone.css` § 19 + `CalculatorCommandBar.vue` (one attribute: `:data-damage-type` on the hero) | the v3 calculator header on a phone: the target button over the number is narrower, the number a touch smaller, so the name reads in full ("Aemeath" was "A…" at 412 and gone at 360); a caption under the number says "avg damage" / "non-crit damage" / "crit damage" |
| `phone.css` § 20 | Settings › Wavescan loadout cards on a phone: picture beside the text, the arrows on their own row, no drag handle on a touch screen ("Reminis/cence" broke mid-word, the arrows sat on the set name) |
| `phone.css` § 21 | light themes: the v3 Forte card's white skill icons inverted (style.css already does the chain nodes) |
| `nav/PlusNavMenu.vue` | a "Search pages, characters, teams…" row at the top of the Tools+ menu opens the palette — the only way on a phone (Ctrl K shown on desktop, hidden on touch). The menu's tooltip / screen-reader name is "Tools+ pages" |
| `shell/paletteItems.ts` `SECTION_PAGES` | palette rows for Convene's My pulls / Banners / Pull advisor and the Settings sections (Backup & restore, Wavescan, Preferences, Labs): found by search ("pull advisor", "pity", "wavescan", "backup"), not listed in an empty palette (`queryOnly`, the flag the palette commands use). "Echo tuning odds" is now "Tuning planner", the page's own name |
| `pages/SettingsView.vue` (upstream, ~5 lines) | `?section=` reads every `SETTINGS_SECTIONS` key, also while the page is open (was `wavescan` only) |
| `shell/WelcomeCard.vue` + `welcome.ts` | "New here? Bring your account in" on the calculator for a browser with no character set up and no echoes: Get started (/account, whose empty state lists the ways in) or Restore a backup; × or either link hides it for good (`wtplus:welcome:dismissed`). Off under Cypress unless a spec sets `wtplus:welcome:e2e` (it would sit on every empty-browser spec's click targets — the precedent is `teamContext/autoTeamBuffs.ts`) |
| Convene | Banners: the Server select can shrink (it pushed a 360 px page to 398 px), the history search gets its own row on a phone, rerun and history sub-lines wrap instead of cutting the date. My pulls: the link field keeps its height on a phone (`flex-1` in a `flex-col` made it 22 px), plain words ("older pulls not in history", "typical player: 54.1", "from 3 complete 5★ counts", a "soft pity 66" tick), the import message's × on the same line, and the tab, heading and title all say "My pulls". Pull advisor: "+10.5% **of Lucilla's own damage**", "That is +21.5K damage per rotation for Lucilla (now 205K on Lucilla · Suisui + Hiyuki)", and when a character's own damage is under a quarter of the strongest one scored beside it, a line saying what they add as a support isn't counted (`advisor.ts` `supportNote`, `shortRotation`, `gainDamageText`); the summary uses the short rotation name |
| Today | event rows' notice / calendar buttons are 2.5 rem on a phone (31 px, 6 px apart before); the endgame links 2.25 rem tall. Past a stated version end with no newer version known, the Matrix row reads "3.8 is out · check in game" instead of a stuck "≈ 0m to reset" (`useToday` `matrix.overdue`) |
| /account | "Strongest character: Aemeath 8.10M per rotation, on Basic Rotation (Tune Break) · enemy Lv 100", with a tooltip on why the calculator's number differs (its own enemy and saved rotation) |
| `public/manifest.webmanifest` + `public/icons/icon-maskable*.png` | an `id`, a description that matches the product, shortcuts (Today, My account, Convene › My pulls; Android long-press), and a real maskable icon: `icon-maskable.svg` puts the glyph inside the 0.4 × 512 safe circle on a full-bleed base (the old entry reused the rounded "any" icon, so circle masks cut the plus) |

Left alone, with the reason:
- index.html's two `apple-touch-icon` links: iOS takes the last one (ours); dropping Ryan's is an upstream edit that
  conflicts on every sync for no visible change.
- /rankings' Lily portrait: the request fails (not on Ryan's asset host) but the card already shows an "Li" placeholder.
- Palette rows for each theme (L1): only the light / dark toggle; another track owns palette wiring tonight.
- The inventory's three names (palette "Inventory", title "Echo inventory", header "Echoes") are Ryan's.
- The entry chunk (L7): nothing was moved out tonight; this pass adds `welcome.ts`, `plusBar.ts` and the menu's search
  row to it (a few kB). The 10-26 bundle measurement should be re-run on its own.

Gates: `cypress/e2e/notFound.cy.ts`, `shell.cy.ts` (palette from the menu on a phone, Settings sections, no What's new
request on a cold load, the welcome card), `phoneLayout.cy.ts` (Settings backup / tuning planner / calculator caption at
412 @ 130 % and 360, the page end clear of Ask, Ask clear of the Echo plan bar), `today.cy.ts` (Matrix rollover, tap
size), `conveneTracker.cy.ts` (link field height, Banners at a 360 px page and 130 %, the advisor's "own damage"
wording); unit tests `shell/notFound.test.ts`, `plusBar.test.ts`, `welcome.test.ts`, `paletteItems.test.ts`,
`convene/advisor.test.ts`.

Things learned:
- A catch-all route makes `router.resolve(path).matched` non-empty for every path: any "is this a page?" check has to
  look at the route's name too.
- Esc closes a native `<dialog>` through its `cancel` event, which a Cypress `{esc}` doesn't fire; run a row instead.
- Lazy images wait on rendering frames, so headless Electron never fetches them even in an open dialog. Check "loads
  when open" in Chromium (shot.mjs), and only "doesn't load while closed" in Cypress.
- At 360 px and 130 % text Ryan's v3 header fits by 0.2 px; in Electron a 375 px window gives a 360 px page after the
  scrollbar, which is the honest way to test that width at 130 %.

## Fight pages, refined — `/energy`, `/endgame`, `/rotation`, Teams, the calculator's Rotations panel (night audit "fight", 2026-10-31)

A pass over the fight pages from the 2026-10-31 night audit (findings F1–F20, report
`wto-wt/night/reports/audit-fight.md`), phones first (412 px / 130 % text, and 360 px). Most of it is CSS in
`phone.css`, keyed by Ryan's class names and `data-test` attributes, so his files only carry two one-line hooks.

| Piece | Role |
|---|---|
| `EnergyView.vue` / `RotationView.vue` `<Nav cur-page>` | `energy` / `rotation` (was `rankings`): the v3 phone header and the Tools+ menu name the right page |
| `phone.css` § 8 | team names in the Teams summary tiles and cards (every synced one starts "wuwa_calc …") clamp to 3 / 2 lines instead of one; the calculator's Rotations summary tiles the same |
| `phone.css` § 9 | the Teams editor: the full header's team name gets its own line (it had 0 px beside the two `shrink-0` buttons, which pushed a 360 px page to 377 px); the stuck header becomes avatars + DPS and the two buttons (~85 px, was 270–350 px); member cards caption each stat (HP … Energy Regen, `::before` from the stat's `data-test`) and go two columns below 400 px; the build button grows instead of drawing over Configure / Import; less padding |
| `phone.css` § 2 | the v3 rotation detail's name input on its own full-width line (it shrank to "Aem"); the Teams editor's name input full width |
| `phone.css` § 13 + § 19 | the live result bar collapsed on scroll keeps § 19's "avg damage" / "non-crit damage" / "crit damage" caption under the number, so the number is never bare. An earlier rule here re-showed Ryan's headline label instead; it broke his `commandSheet.cy.ts` (the collapsed bar must hide that button) and was removed after the night's critic pass, along with § 19's line that hid the caption when collapsed. The stance chip the collapsed bar keeps is the character's mode, not the damage type. This track's own width rules were dropped at the merge |
| `phone.css` § 22 | action cards (`CalculatorRotationAction.vue`, calculator and Teams editor): the name on its own line under drag · # · x, Delete in the card's corner, smaller chips and buttons sharing rows, "⚙ Buffs" / "Enemy" / "✓ Synced" short labels (`content: "…" / ""`, so screen readers still read his full words), the "▮▮ 0" counter captioned "stat bonuses". 337–460 px a card → 235–300 px; the calculator's 19-action rotation 8,252 → 6,434 px |
| `phone.css` § 23 | tap targets on the plus fight pages to ~40 px: ToA effect chips, Calibrate's select / time box / clock switch / Log, the picker's Cue card / Timeline, /energy's filters; the play-mode dots keep their look and get a taller transparent hit area |
| (Ask button room) | pages end with room for the floating Ask button: § 16 from "Shell refinements" does it (this track's own `.content::after` spacer was dropped at the merge, so page ends don't get the room twice) |
| `presets/RotationsEmptyState.vue` (one line in `CalculatorRotations.vue`) | the v3 Rotations panel with no rotation: what a rotation is, and List presets (with the count) / Import / Create on screen instead of behind ⋯ |
| `teamLinks/teamLinks.ts` + `TeamPlusLinks.vue` (one line in `TeamRotationTeamEditor.vue`, beside `AutoTeamBuffsToggle`) | a saved team in the Teams editor: its **wuwa_calc** DPS at the account, labelled as that engine's against the editor's own (the app's calculator over the action list), and Cue card / Fight timeline (`rotationPath({ kind: "chars" })`) / Energy check / ToA check. It reads the energy check's measurement of the composition (`useEnergyNeeds().measure` + `viewOf`, cached per account and engine commit — no `activate()`, so no store watchers or builds' ER pass); shown only once wuwa_calc ran it, hidden for a composition that is not his; members wuwa_calc ran without a build of the player's are named (`notSetUpText`, /rotation's wording), so "at your account" is not read as theirs |
| `toaRun.ts` `runToaCheck(… onPartial)` + `useToa.ts` | the saved teams first: solved and timed on their own and painted as a `partial` check (never stored; its key never matches), then every other fieldable team; the final check equals the one-pass run (test). First team rows on David's export: **1.5 s** (was 10.6 s); the full check 10 s as before |
| `display/names.ts` `teamLabel` | one team label: main DPS first, short names ("Xuanling", "Rover Aero") — ToA rows, plan and Calibrate, the /rotation title; `energyFormat.nameOf` uses the short names too |
| words | /endgame: "Enemy RES · lower takes more damage" over the RES chips, "≥90 s left" on the low floors, "m:ss left" in Calibrate, darker crest stars on light themes, "· your saved teams only" on a partial check; /rotation: "% of DPS" (phones: one "share of team DPS" caption), a visible "Substats" caption, "Move to the next swap by itself, at this share of wuwa_calc's speed", "Damage dealt · whole fight" on the phone timeline, "Not a team link" for a hash that is no team code (a decodable but retired code keeps its message and its Team rankings button); /energy: "has 110.8% needs 115.2%" on full chips and a has / needs legend over the scan list, "Tap or click", "367,567 DPS in wuwa_calc · team t269" instead of a bare key, "that team's wuwa_calc loop", legend headers From / Energy / Share in the breakdown, the deficit sentence from the printed figures (4.4 %, not 4.3 %), the floor table's team cell at its row's size |
| `rotation/extract.ts` `splitBuffName` | a held buff named only " x6030" is "Unnamed buff", not 6,030 stacks of nothing; a count past 200 stays in the name |

Gates: `cypress/e2e/fightPages.cy.ts` (the Teams editor's links and engine DPS for a wuwa_calc composition and nothing
for a hand-built one, the empty Rotations panel and its presets, the phone header on /energy and /rotation, has / needs
on a chip, a bad /rotation link); `phoneLayout.cy.ts` (/endgame at 360 px / 130 % too, every ToA tab on one line inside
its pill; the v3 calculator's name width, rotation name input and action cards; the v3 Teams editor at 360 and 412 px:
team name width, stat captions inside their columns, build button above the join, action card heights);
`toa.test.ts` (saved teams first, each team solved and timed once, the final check equal to the plain run),
`rotation.test.ts` (`splitBuffName`), `teamLinks.test.ts`, `names.test.ts` (`teamLabel`).

Not changed, and why: the stuck Teams header isn't measured in Cypress (its IntersectionObserver never fires there —
Ryan's own sticky test is red the same way; phone shots stand in); `TeamRotationSummary.vue` still computes without
plus's team context (sync report); the "wuwalab" credit in Ryan's frame-data note is his text.

## Account and rankings refinements (track "fix-account-rankings", 2026-10-31)

The 2026-10-31 audit of /account, /my-rankings, /rankings, /build-team and /weapons (the night's
`audit-account-rankings.md`) found one wrong number, a sync that could not be undone, and a /rankings phone screen
that gave the list half the screen. Every high and medium finding is fixed here; the lows that were cheap too.

| Piece | Role |
|---|---|
| `cli/exportFile.ts` `migrateExport` | the CLI reads an export at the app's schema (Headless CLI above). `rank` on David's 9-16 export now matches /my-rankings for all 24 (Cartethyia 6,154,081, Rover Aero 101,653) |
| `myRankings/rankRoster.ts` `namesTeammateOutsideApp` | wuwa_calc loops whose name lists a teammate the app has no character for (Lily: 8 stock loops) are no longer scored, so she never shows as a teammate on /account, /my-rankings or /weapons. Galbrena's best moves to her curated rotation (6,566,772 → 6,162,238); nothing else moves. `RANKING_CACHE_VERSION` 2 |
| `rankings/RankingsPortrait.vue` | a kit the app lacks draws initials at once (Lily's portrait request failed on every /rankings visit) |
| `rankings/filterChips.ts` `namesNotInApp` / `importableOnly` / `withImportableOnly` | **Only teams I can import** (opt-in, default off; desktop beside the chips, phone in the ⋯ menu): every resonator of Riley's roster the app lacks (`notInApp`) goes into his own Without list (`x=`), so a saved view and a shared link carry it; unticking lifts only those names |
| `rankings/syncUndo.ts` + `RankingsAccountBar.vue` `sync()` | Sync my teams asks first (useConfirm: how many wuwa_calc teams, their titles, "teams you named are left alone"), snapshots the teams it rewrote (`wtplus:rankings:sync:undo:v1`, the last sync only) and offers **Undo** in the report (and as "Undo sync" / "Undo the last sync" after a reload). Undo asks first too (the record outlives a reload) and puts a team back verbatim while it reads as the sync left it; a team edited or deleted since is named and left alone |
| `RankingsAccountBar.vue` — the report | capped at 45 % of the screen and scrolling inside, a sticky header with Undo / Show details / Close, a one-line summary by default, names through `PresetNameLabel`, both units ("8,188,277 DPR · 315,591 DPS", `SolvedBest.dpr` from the solve's rotation totals). The success toast is gone (it covered Close for 7 s) |
| `RankingsAccountBar.vue` — phones | the chip row starts with **Search** (opens Riley's aside, `controller.ts toggleRankingsSearch`); every control 40 px tall; the info chip reads "24 set up"; the ⋯ menu holds Substats, Only teams I can import, Sync / Undo, Saved views, How to read, My roster rankings and the engine credit. Riley's Main DPS picker tags a free resonator the account never set up "free · S6" |
| `RankingsCards.vue` | a phone list heads itself (it was a toolbar row): "104 teams · % of top", "Team avg DMG per rotation · wuwa_calc at your account · ChemX32 substats" (the spread the bar picked), the DPR / DPS switch; it scrolls away with the cards. The empty My account state offers the calculator, Settings import and phone-screenshot echoes |
| `controller.ts` `setSide` + `skittle-theme.css` | over the cards Riley's toolbar is hidden until the sheet opens; open, it is the sheet's header with ✕ and the sheet drops from it (`--wt-sheet-top`, measured) instead of rising from the bottom edge over the v3 bottom bar. The toolbar button reads "Search & compare" with a magnifier |
| `RankingsMemberStrip.vue` + `skittle-theme.css` | phones: the strip is the switch for the Equipment table, which shows the chosen member's column only (`data-wt-col` on his root hides the other `.c` cells of his `display: contents` rows), label : value, as wide as the screen; main DPS first. Back, "+ rotations", Import and the build link are 40 px tall |
| `tierMemory.ts` | a hashless /rankings opens on the tier last picked in the bar, else **My account** once anything is set up (it opened on Riley's S0R1, a table led by Lily). Specs that read Riley's default seed `wtplus:rankings:tier:v1 = ""` |
| `shell/plusBar.ts` (the shell track's `usePlusBar`) | /build-team's Build and Save bars and the Echo plan's phone bar lift the Ask button through `--plus-bar-h` (Shell audit fixes above). This track built the same lift as a `v-fab-clear` directive; at the merge onto plus-night the directive was dropped for `usePlusBar`, which kept this track's rule: `<html>`'s variable is written only when the height moves (a write per measure restarted a dialog's opening transition). The extra phone page-end padding this track gave /account, /my-rankings, /weapons (4.5 rem) and /build-team (9 rem) went too: phone.css § 16 already keeps every page's end clear of Ask and any plus bar, and the two stacked left a ~270 px empty band under /account's footer |
| `account/AccountHero.vue`, `AccountView.vue`, `myRankings/MyRankingsKpis.vue`, `MyRankingsView.vue`, `weaponValue/WeaponValueView.vue` | phones keep a short line under every KPI ("of 24 set up", "weapons at R5", "equipped", "teams you can field") and a one-line intro; the hero names its engine ("this app's engine · your builds"), its link "This team in wuwa_calc", adds "wuwa_calc's best teams at my account" and "Strongest character: … per rotation"; /my-rankings' teams KPI is "Saved teams you can field"; /weapons reads "24 · 15 more have no weapon yet" and keeps 2 × 2 tiles at 360 px |
| `myRankings/MyRankingsCharacters.vue`, `MyRankingsTeams.vue` | the phone figure says "avg DMG / rotation" ("team avg DMG / rotation" on teams); below 380 px the weapon takes its own line (it read "Ever… / Pole…") |
| `energy/EnergyChip.vue` `spelled` | the /my-rankings team chips read "Aemeath ER 110.8% · need 115.2% · 4.4 short" (they never said Energy Regen); two wrap-able pieces, so 360 px never scrolls sideways |
| `account/investPlan.ts` `erGapOf` / `erGainNote` | an ER roll's own gain is the shortfall it closes (`damage × (1 − ER deficit)`); the drawer and the invest list now say so ("closes a 4.4-pt ER gap · team ignores ER"; the drawer says "the whole" gap when the roll is at least its size). `INVEST_CACHE_VERSION` 2 |
| `presets/presetName.ts` | chips in words: "main DPS S6R5", "supports S1R1 / S6R1" (were "DPS S6R5", "team S1R1/S6R1") |
| `buildTeam/` | the header chip reads "wuwa_calc · your echoes · 367,567 DPS" (no "t269"); the CLI builds against and prints the page's ER floor (`showNeed`, one rounding rule); the save bar's controls are 40 px |
| `phone.css` § 24 | under Ryan's v3 phone header (which names the page) the plus pages' H1 is visually hidden, kept for screen readers; /my-rankings' ⓘ beside it moves onto the switch / Options row (it sat alone on a row) |

Rules: nothing in `vendor/wuwa_calc` changed; every /rankings change is CSS over his class names, a hash edit
(`x=`, `tc=`), or plus DOM beside his. Lily is never filtered from Riley's own table by default — "Only teams I can
import" is opt-in (David's open question).

Things learned:
- Cypress's headless Electron leaves classic's page-enter scale at 95 %: measure tap targets with `offsetHeight`
  (layout px), never `getBoundingClientRect()`.
- A custom property written on `<html>` on every re-render restarted a `<dialog>`'s opening transition in Electron
  (the Echo plan sheet read 40 px low); write only on change.
- After a check box in a popover changes the hash the popover stays open: a second click on its trigger closes it.

Gates: `cli/cli.test.ts` (v9 export with "BellBorne eochelone"), `rankRoster.test.ts` (no Lily loop),
`filterChips.test.ts`, `syncUndo.test.ts`, `tierMemory.test.ts`, `shell/plusBar.test.ts` (writes only on change), `investPlan.test.ts`
(ER note), `presetName.test.ts`; `cypress/e2e/accountRankingsPhone.cy.ts` (v3, 412 × 915 at 130 %: My account by
default, list ≥ 60 % of the screen, the importable chip's `x=`, the docked sheet, one member's gear on the detail
page, Ask clear of /build-team's bar at 360 px, KPI lines and the hidden H1, the 360 px weapon line),
`rankings.cy.ts` (Search sheet, Sync's confirm / Undo, 40 px bar), `phoneLayout.cy.ts`.

## Echoes pages on a phone, and two Echo Lab numbers made honest — track "fix-echoes" (2026-10-31)

From the night's read-only audit of `/echo-lab`, `/echo-plan`, `/share`, the inventory and its importer, and the
calculator's echo slots (`night/reports/audit-echoes.md`). Every finding was re-checked on the synced branch first;
all reproduced.

Numbers:
- **The re-roll advice respects the Energy Regen need** (`rerollAdvice.ts`, `erNeed` option). The static engine
  priced an ER line at 0, so the tab told Aemeath (110.8 % ER against a 115.2 % need) to re-roll Shadow Stepper's
  ER 10.8 % first, which would have left her about 15 points short. Each line set now scores damage × (1 − ER
  deficit) (`erFactorFor`, as the benchmark already did), so that line is worth +12.7 %, and the hard rule locks any
  ER line whose loss would drop the build under its need (marked "ER" on the Lock chip, with a sentence under the
  table). The tab resolves the needs once per account state (`echoLabErNeeds` in `useEchoLab.ts`).
- **One benchmark score** for a build: the calculator's engine panel resolves `erNeedsOf(useEnergyNeeds())` and
  sends it through `engineView` and its `reroll` jobs (Aemeath 132 % in both places, was 140 % in the panel). The
  panel and the re-roll tab print the ER state as one sentence (`erFloorLine`: "Energy Regen 110.8 % of the 115.2 %
  its team needs: 4.4 short, so its damage counts about 4.4 % lower."); the benchmark tab marks its damage figures
  "ER-adjusted" when the build is short.
- **The CLI runs the app's store migrations.** The track built `cli/exportMigrate.ts`; the account-rankings track had
  landed the same fix first (`migrateExport` in `cli/exportFile.ts`, the CLI section above), so the merge kept that
  one and moved this track's engine-level test onto it (`cli/exportMigrate.test.ts`).

Phone layout and wording (every rule phone-only, desktop unchanged):

| Where | What changed |
|---|---|
| Re-roll tab | `table-fixed` line table, the line truncates, Fresh under Worth below `sm`, icon chips; a one-line "Worth = … · Fresh = …" legend under the character; "All lock plans" headers in words with Transducers named (below `lg` one short word each, "Locks / Cost / Odds / Gain / Per win", spelled out in a line under the table: the long ones broke "Transducers" mid-word in a phone-width card); the ER-floor note says how short the build is and would be |
| Benchmark tab | the row detail reflows below `sm` (`.el-spread`: the substat across the card, then yours · reference · perfect under one header row); the damage line moves under the bar in words ("Your build 7.75M vs reference 6.86M per rotation (ER-adjusted)"); the name wraps the ER chip instead of truncating; progress counts only the characters the pass scored |
| Verdicts tab | the substat colour legend; cards caption the owner ("Best for Qiuyuan · +11.69 % damage") and "worn by"; the reason wraps to two lines; the echo's set never truncates to "T…" (the main stat wraps under it, `EchoLabEcho.vue`); the row detail says "per rotation"; feed groups are two lines ("Song of Feathered Tracks" / "Cost 3 · Fusion DMG"); KPI tiles are pressed buttons and scroll the list into view |
| Set names | Echo Lab shows the in-game Sonata name (`IN_GAME_SET_NAME`, "Sun-sinking Eclipse") and its search matches either name (`setNames`) |
| Tune tab | "Expected damage change"; the bar legend shows on phones |
| Tap targets | `.echo-lab .btn-xs` and summaries ≥ 2.5 rem below 768; Echo plan's toolbar buttons (`ep-tap`) |
| Ask button | the track lifted Ask over the Echo plan bar with its own `--plus-page-bar-h`, a `data-plus-page` spacer and a tuck class; the shell track's `usePlusBar` (`--plus-bar-h`, phone.css § 16) had already landed the same three things for every page, so the merge kept that one and dropped this track's copy |
| Echo plan | "No plan" / "Set in game" headings never wrap; the compact tile's button says "Show grid" |
| Inventory (v3) | § 25: 0.75 rem page padding, the tile's actions as a row under the substats (Duplicate / Odds icon-only), so 73 of 100 cut labels became 8; the top pager sticks under the nav (the inventory page only: the classic calculator's echo browser modal shares the pager classes); a page change scrolls back to the first echo and the Filters panel starts folded on a phone's first visit (`shell/inventoryPager.ts`, a delegated listener and a settings default — no change to Ryan's files) |
| Calculator echoes (v3) | § 26: the Set Bonuses header wraps, the rating guide table lays out fixed; the engine panel's title is "Engine view" on a phone, and its benchmark tile says how it differs from Ryan's Build Score |
| Importer | a big "Pick screenshots" button right under the intro (the album box follows as "Or from a Google Photos album"); the review cards scroll with the sheet (no 50 vh box), full-width selects, "Add N echoes" sticks to the sheet's bottom and the ✕ to its top (§ 27); Read with Claude shows the cost before a key is added |
| Share import | each echo chip names the echo ("Sigillum ✓", "… ! reason") with a one-line legend |
| Empty Echo Lab | "Scan or add echoes" opens the importer (`/inventory?open=import`) |

Gates: `echoLab.cy.ts` checks every tab at 412 and 360 px with 130 % text with the re-roll table, the lock plans and a
benchmark detail open, and the KPI tap on a phone; `phoneLayout.cy.ts` checks the Ask button against the Echo plan
bar and the v3 inventory tile (labels, actions under the substats, sticky pager, folded filters). Unit tests:
`echoLab.test.ts` (ER floor on the advice), `echoLabView.test.ts` (panel = tab under a need, set names, the ER
sentence), `cli/exportMigrate.test.ts`, `shell/inventoryPager.test.ts`.

Left for later: one stat-label table across the plus pages ("CD" chips vs "Crit DMG" vs "Crit. DMG"); a "Tune or
Feed in Echo Lab ›" link beside Ryan's "Finish these first" (needs a hook in his file); streaming benchmark rows as
they finish (a result channel the worker protocol does not have yet).

## E2E gates you can trust — Cypress's Electron, on CI and on this machine (track "ci", 2026-10-31)

The GitHub E2E run on plus had gone red on most pushes since the 2026-10-27 batch, and the local runs every track
does had a list of "inherited reds" nobody trusted. Both came mostly from the test harness, not from the app.

| Piece | Role |
|---|---|
| `cypress/support/plusElectronRendering.ts` (one import line in Ryan's `cypress/support/e2e.ts`) | after every screenshot, restarts an idle screencast (8 px JPEG, never acknowledged) so the hidden Electron window keeps drawing 60 frames a second. Electron only, never while a video records |
| `cypress/support/plusCommands.ts` | `cy.myRankingsRow(id)`: on `/my-rankings`, wait for the row, or for a run that ended without it (status "live", the empty state, the error alert), then assert the row with the page's status and error in the message. Used by `myRankings.cy.ts`, `energyCheck.cy.ts`, `phoneLayout.cy.ts` instead of a bare 120 s `cy.get` |
| `.github/workflows/e2e.yml` (Ryan's file, one plus step) | a failed shard uploads `cypress/screenshots` as `cypress-screenshots-<shard>` (14 days). Before this, a CI flake left nothing to look at |

**1. One frame a second after a screenshot (CI and local).** Cypress takes each Electron screenshot (`cy.screenshot` and
the failure screenshot of a CI run) between `Page.startScreencast` and `Page.stopScreencast`. Once the screencast stops,
the window draws about one frame a second for the rest of that spec: measured 60 fps before a `cy.screenshot`, 1 after
it, on any page (`/info` too), in the same test and every later test of the spec. The next spec starts at 60 again.
`requestAnimationFrame`, smooth scrolls and transitions crawl, and each forced layout waits about a second (Cypress's
own `elementFromPoint` took 1.3 s in a profile). Ryan's `workspaceReadiness.cy.ts` screenshots in its first test, so
"clicking the buffs warning opens the section" got about four frames inside its 4 s assertion: the smooth
`scrollIntoView` never moved (section top 804 on CI and here). It passed only when those frames came early enough,
which is why it looked like a regression from the batch: plus's scroll container, nav offsets and the calculator page
were not the cause (the same failure reproduced at b143c030, and a copy of the spec without the first screenshot
passed every time). With the idle screencast the spec passed 6 runs of 6 under `taskset -c 0,1`.

**2. No frames at all in local runs, unless Electron is told how to draw.** On this machine (Wayland), Cypress's
hidden Electron window gets no frame callbacks: `requestAnimationFrame` never fires and `cy.screenshot` hangs. That is
where the plus comments "rAF never fires in headless Electron" come from. It is true only here: CI runs under Xvfb and
draws frames. Add `ELECTRON_EXTRA_LAUNCH_ARGS=--ozone-platform=headless` to every local Cypress run:

    ELECTRON_EXTRA_LAUNCH_ARGS=--ozone-platform=headless env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/cypress run \
      --config baseUrl=http://127.0.0.1:<PORT>,screenshotOnRunFailure=false,video=false --spec <spec>

With it, the "inherited reds" pass: `settingsWorkspaceFlagged` 5/6 → 6/6, `toastOverModal` 0 passing → 3/3,
`teamRotations/teamRotations` 17/19 → 19/19, `calculator/builds` 10/10, `workspaceReadiness` 0/3 → 3/3 (with point 1).
`navUtilityMenuFlagged` goes 0/3 → 2/3; its last red ("shows no badge, dot, or count anywhere in the menu") is Ryan's
own: his #668 added a "New" badge on Scanners (`SCANNERS_NEW_UNTIL = "2026-12-01"`) that his spec forbids, so it
fails on his master too, and on plus's CI from the first push with #668 until that date. The spec stays his. The plus
workarounds written for the frameless harness (timers instead of rAF, the Echo Lab panel's 1 s visibility poll) are
harmless on CI and stay. (`--ozone-platform=x11`, through Xwayland, also draws frames.)

Two phoneLayout checks written the same night for the frameless harness went red once frames were on (final gate,
2026-10-31): the Teams editor test now scrolls to the top before it measures the full summary header (the editor opens
at the list's scroll position, so the header's IntersectionObserver shows the compact stuck strip), and
`expectAskClearOf` retries until Ask has settled (Ask and a plus bar slide down together when the bottom bar tucks,
and Ask passes over the bar on its way off the screen). Both pass with and without frames.

**3. The /my-rankings first row (not solved).** Twice in the post-batch runs a spec waited 120 s for
`[data-test-my-rankings-row="Cartethyia"]` and never saw it (energyCheck's 412 px test, phoneLayout's card reflow).
On the green runs that row lands 3–8 s after the visit. Locally (2 pinned cores, cold and warm dev server, after
`/energy` and after the Settings import) it landed in 2–8 s in 23 tries of 23. So it is a rare hang, not a slow row,
and making the row cheaper would not have helped. CI kept nothing to look at, so the specs now name the state
(`cy.myRankingsRow`) and the shard keeps its screenshots: the next one will say whether the run was still scoring,
finished without her, or showed an error.

Things learned:
- `pkill -f "vite --port 5205 "` run from the Bash tool also matches the tool's own shell (its command line holds the
  pattern) and kills it (exit 144). Use `pkill -f "[v]ite --port 5205 "`.
- Cypress's runner and the page under test share one renderer thread (same origin through its proxy), so a busy page
  slows Cypress's own retries, and timers on both sides fire in order.
- The repo is public, so GitHub's runner has 4 vCPUs, not 2. `taskset -c 0,1` is a stricter test than CI.
- `Cypress.automation("remote:debugger:protocol", { command, params })` reaches the page's DevTools protocol from a
  spec or a support file (Electron and Chrome). `Performance.getMetrics` and `Profiler.start/stop` through it are how the
  frame-rate drop was found.
