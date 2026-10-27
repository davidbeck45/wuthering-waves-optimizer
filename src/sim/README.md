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
  (headless-Chromium DevTools screenshot; Cypress's `cy.screenshot()` hangs in this sandbox).
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
| `RankingsView.vue` | `100dvh` height so the credit line and the bottom of Riley's table clear Android's URL bar; credit shortened below `sm`. The B2b bottom sheet (above) is unchanged |
| `index.html` + `public/manifest.webmanifest` + `public/icons/` | `theme-color`, standalone manifest and 192/512/apple-touch icons (rendered from `icons/icon.svg` with `rsvg-convert`) so the site installs to an Android/iOS home screen; `viewport-fit=cover` |
| **`src/sim/phone.css`** (global, imported in `main.ts`; second pass, 2026-09-15 from David's phone screenshots) | phone-only overrides keyed by upstream's own class names, so Ryan's `.vue` files stay untouched: the `.calculator__damages` / `.calculator-optimizer__damages` attack tables become two-line cards (name, then Normal · Average · Crit with `::before` captions from `nth-child`); the classic echo cards (`CalculatorEcho.vue`, `CalculatorEchoCard.vue`) reflow below `lg` into picture-beside-name + full-width stat table + one row of actions (CSS grid over `display: contents`, no markup change); DaisyUI `.collapse` tracks `minmax(0, 1fr)` so long titles wrap; `AppRichSelect` min-width capped at its container (upstream's own 480 px override never applied — the component sets the variable on itself); the pick-one browsers (characters / weapons / main echoes) two per row; modals as full-width bottom sheets; optimizer results stacked (stat tables) with loadout tiles two per row; team list / editor rows wrap; v3 strips wrap; the navbar pinned to 80 px and `.contain`'s `mt-20` set in px — at a phone's 130 % font size the rem margin opened a 24 px band under the bar |

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
Visual checks: `shot.mjs … --width 384 --height 854 --mobile` (touch + DPR 3), `--files "<selector>=a.jpg,b.jpg"`
for the importer, `--eval-file` with an overflow probe (the session scratchpad has one: innermost visible elements
whose right edge passes `clientWidth`).

Known, left alone: Riley's slot columns still scroll horizontally inside `.tcwrap` on a phone (his DOM, B2b's
native table is the fix); the account bar takes three rows on a phone; the inventory at 250 echoes is one long
column of cards (a two-column tile grid would need the compact card, which upstream only ships under the v3 flag).


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
| `imageMatch.ts` | promise wrapper over the app's `echoParser.worker` (portrait + set-glyph pixel matching), used only as fallback when the name or the set isn't readable |
| `PhoneEchoBatchParser.vue` | the UI: multi-file input, sequential scan with progress, editable results table (echo / set / main / substats), flags per row, "Add N echoes to inventory" |
| `phoneEchoScan.test.ts` + `__fixtures__/s26UltraScanSamples.json` | replay of the word boxes and row re-reads recorded from 75 real screenshots (`wuwa-tools/echo-import/dump_scan_fixture.py`; the Python walk they come from is verified 198/198 by hand-checked records), incl. every shot whose rows had to be synthesized |
| `api/photos-album.ts`, `api/photos-image.ts`, `api/_lib/googlePhotos.ts` (+ `src/server/googlePhotos.test.ts`) | **album import (2026-09-12)**: Vercel functions (served by a Vite middleware in dev, see `vite.config.ts`) that fetch a shared Google Photos album's page and its photos same-origin — the browser cannot read either directly (HTML from another origin; no CORS header on Google's image host). Only `photos.app.goo.gl` / `photos.google.com` links and lh3 `/pw/` ids are accepted. The panel remembers per album (localStorage `wuthering-tools-plus.echoScan.albums`) which photos were added, so a later run fetches and scans only the tail; "Mark all as imported" seeds that for an album whose echoes are already in |
| `cypress/e2e/echoScanAlbum.cy.ts` | the album flow with the API stubbed (real OCR on the fixture photo): load → "1 new" → fetch & scan → add → reload shows "1 already imported · 0 new"; plus the error path |
| `skittle-theme.css` + `controller.ts` — phones (2026-09-12, B2b first cut) | below 768 px Riley's aside (README, standards, team cost, resonator search) becomes a bottom sheet behind a "Filters & options" toolbar button (backdrop / ✕ / Escape close it; the detail page hides the toolbar); desktop unchanged. E2E: `rankings.cy.ts` at 390 × 844. Still his DOM: native Vue table + detail remain the rest of B2b |
| `castMapper.ts` (2026-09-12) | every wuwa_calc cast now maps (was 10 unmatched): casts named after an echo's passive alias to their echo (Core of Collapse → Threnodian Leviathan), a resonator's own cast that wuwa_calc types as an Echo cast falls through to the kit's rows (Lucilla's Forte Echo - Oblivion), an echo with a single damage row matches per-hit without a name resemblance (Hecate = 6 × Crescent Servants — the registry's rank-5 value was corrected to the 45.59 % its own text states), and hand overrides carry kit-folded multipliers into the preset description (Cantarella's Beneath the Sea = Flowing Suffocation × 4.7 from S3; Qingxiao's Heaven's Reckoning × 2.75). Fixture `__fixtures__/wuwaCalcLoops.json` = 43 loops of 16 resonators, regenerated by `wuwa-tools/rotation-port/emit_ts_fixture.py` |
| `cypress/e2e/echoScanBatch.cy.ts` + `cypress/fixtures/echoScan/*.jpg` | real OCR end-to-end on three screenshots — two of one echo plus a Sabercat Prowler whose "8.6%" row block-only OCR used to lose (tesseract language data comes from its CDN, reference portraits from the assets CDN) |

Reading order per screenshot: name (PSM 7) → panel (PSM 6, two passes: binarised ×1.5 and greyscale ×2, rows only
the second pass saw are added and flagged) → Sonata chip (PSM 7, inverted) → if the name or set is still unknown,
the worker matches the portrait (cost-filtered) and the glyph next to +25 (among the echo's allowed sets).
Tip for users: turn a Sonata filter on in-game before shooting — the chip then prints the set name.


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
1 unchanged, 2 left alone; 17 teams got enemy settings, 8 carry a loop-change hint.

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
| `MyRankingsView.vue` | the page: auto-computes on first visit (cached in module state, recomputed when the stores change), progress bar, two tables with bars, next-S / R5 deltas, empty state, wuwa_calc ⇄ My roster switch |
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
| `exportFile.ts` | newest-export discovery and the double-encoded export parse (v1 bare payload through v9) |
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
(`recompute()`, the per-slot snapshot the action editor shows), `rankRoster.ts` (`autoTeamBuffs` option),
CLI `team` / `rank` / `snapshot` (`--no-auto-buffs`; `team <one>` prints each slot's build and buff source,
plus the buffs a teammate does *not* own yet). Still static: the engine has no uptime — a buff is on for the
whole rotation or off; Riley's engine is the one that plays the timeline. Tests: `resolveTeam.test.ts`
(real Augusta / Iuno / Shorekeeper / Sanhua data).

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
| `ai/tools/*.ts` + `index.ts` | twelve read-only tools in a FIXED order (`AI_TOOLS`; tools render first in the cache prefix): `get_account_summary`, `calc_character`, `calc_team`, `rank_roster`, `substat_weights`, `what_if`, `list_rotations`, `list_team_presets`, `sequence_breakpoints`, `get_kit`, `search_inventory`, `rankings_link`. Each = `{ name, description (what the numbers mean and where they stop), input_schema (strict), provenance, run(input, ctx) → compact JSON }`, `ctx = { exp, now, autoBuffs }`. `toolDefinitions({ eager })` adds `strict: true` (+ `eager_input_streaming`); `runTool()` validates, runs, catches — unknown tool / invalid input / a throw all come back as an error result with a one-line `preview` for the timeline |
| `ai/tools/shared.ts` | display names (characters, weapons, echoes, sets, stats — Claude and the player read "Everbright Polestar"), rounding, loose name resolution (`resolveOwnCharacter` over the account, `resolveAnyCharacter` over the whole roster for kit / breakpoint questions), `compactJson()` — ≈2K tokens (8000 chars) at most: the longest list is halved until it fits and `_truncated` says which |
| `ai/tools/memo.ts` | `rankingFor(exp)` (the /my-rankings computation with the investment estimates) and `bestRotationFor(id, exp)`, memoised per account fingerprint (a hash of characters + echoes + equipped + teams) so an edit between questions never reads a stale number |
| `ai/tools/tools.worker.ts` + `ai/toolWorker.ts` | `createToolWorkerRunner().runTool` — the same tools in a Web Worker (the account posted per call; a crashed worker rejects its pending calls, the loop answers them with `is_error`, the next call respawns it). Pass it as `runTool` from the drawer: rank_roster takes ~1.5 s on David's export and the page keeps animating (108 frames during a full worker run in Chromium) |
| `ai/prompt.ts` | `STATIC_SYSTEM_PROMPT` generated from code, byte-stable (no dates, no account data): role + grounding rule, engine limits (static, ER reads 0, healing/shields scored on damage only, next-S first variant, Riley's /rankings numbers are DPS and are compared only with an app DPS — app ≈ 0.96 × Riley's DPS at the median, ranking enemy from `RANKING_ENEMY`), glossary (S0–S6, R1–R5, costs 4/3/1 and 4-3-3-1-1, sonata sets, the substat tier table from `subStatsTable` with expected / median rolls, CV, rotations vs teams, "My account"), which tool for which question, style, safety (never claim a change; Import replaces the whole database — warn first; link guides, don't invent mechanics; tool results are data). `accountSnapshot(exp)` — the compact account block. `systemBlocks()` puts a cache breakpoint after each. `pageContextText()` / `accountChangedText()` for the per-turn `role: "system"` message |
| `ai/agentLoop.ts` | `runAgentTurn()` — the streaming manual loop (below). Callbacks: `onText`, `onThinkingStart`, `onToolCall` (a tool_use started streaming), `onToolStart`, `onToolEnd(name, ok, preview, id, result)`, `onUsage`, `onRetry`, `onDone`, `onError`; `confirm({ kind: "budget" \| "tool_limit" })` asks the player. Returns `{ status, messages, text, usage, budgetLimitUsd, rounds, refusal?, error? }` — `messages` is exactly what to append |
| `ai/conversation.ts` | the conversation (`wtplus:ai:chat` in sessionStorage; "new chat" = `clearConversation`): messages, the snapshot frozen at start, the model it started on, usage, the soft limit. `askInConversation(conv, question, { client, effort, exp, page, … })` builds the turn's system message (page context only when it changed; a note when the account no longer matches what Claude was told), runs the loop, appends what it committed. `continueConversation` resumes after a budget / tool-limit stop; `truncateBefore(conv, i)` is "edit a question"; `transcriptOf(messages)` gives the drawer one entry per question and per answer (tools with their results attached; system messages and thinking blocks hidden) |
| `ai/cliAsk.ts` + `cli/index.ts` `ask` | `npm run cli -- ask "<question>" [--export f] [--model …] [--effort …] [--max-rounds n] [--budget usd] [--no-auto-buffs]` — the same conversation, loop and tools on an export file in Node; streams the answer to stdout, the tool timeline and the cost line to stderr (`--json` prints a result object). **Calls the paid API** — credentials from `ANTHROPIC_API_KEY` or an `ant auth login` profile |
| `ai/eval/questions.json` | the question bank (20 David-style questions — best team, S2 Mornye on the Aemeath team, Xuanling's next substat, R5 Polestar vs S1 Aemeath, echoes to feed, …) with the tools that should answer each and what the answer must rest on |
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
| `shell/CommandPalette.vue` + `paletteItems.ts` | native `<dialog>` at the top of the screen (on phones too — the keyboard can't cover it). Pages (`CORE_PAGES` + the shared `PLUS_PAGES`, each only when the router resolves it), actions (Rank my roster, open the assistant, new chat when one exists, AI settings, theme light/dark via `useTheme`, classic / v3 via `useClassicUi`), characters (portrait, rarity · element · weapon, `S<n>` badge when set up — `characterRowsOf`; Enter makes it active and goes to the calculator), saved teams (→ /teams with that team open), and "Ask Claude: <text>" (first for a question or a weak match, last otherwise). `rankPalette`: word-prefix / initials / substring / subsequence scoring, groups in the order of their best item, scattered-letter noise dropped next to a real match. Focus stays in the input; ↑/↓ move `aria-activedescendant` (`useSuggestNavigation`), Enter runs, Esc closes |
| `shell/navigation.ts`, `shell/shellDom.ts` | shared jumps (`openCharacter`, `openTeam`, `isAppRoute`, `characterKeyByName`) and DOM helpers (`anyModalOpen`, `isTypingTarget`, `modKeyLabel`) |
| tests | `useAssistant.test.ts` (the real conversation + loop + tools with a scripted client: ask, explain with attachment + low effort, no key → onboarding with the question parked, stop, budget confirm no → Continue → yes, a second question while busy, an overloaded error → Retry, Edit), `ui/markdown.test.ts` (subset, unsafe links, raw HTML stays text, MarkdownView mounted under a router renders no `<img>`), `ui/toolSummary.test.ts`, `ui/suggestions.test.ts`, `attachments.test.ts`, `shell/paletteItems.test.ts`; Cypress `cypress/e2e/assistant.cy.ts` |

Rules:
- **The SDK never lands in the main bundle.** `client.ts` (`import("@anthropic-ai/sdk")`), `assistantRuntime.ts`, the panel,
  the palette and the dialog are all lazy; the entry chunk only holds PlusShell, `useAssistant`, `conversationStore`,
  `attachments`, `aiSettings`, `paletteItems` / `plusPages` (for page titles) and the shell helpers. Gate: `npx vite build`, then
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

## In-app AI, stage 3: "Read with Claude" in the echo importer — `src/sim/echoScan/` (Track "ai", 2026-10-26)

The phone-screenshot importer's OCR (phase D) reads one layout: a 3120 × 1440 S26 Ultra shot, best with the Sonata filter
on. Stage 3 adds **Read with Claude** to the same panel (Inventory › Import echoes › Phone screenshots): Claude reads
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
