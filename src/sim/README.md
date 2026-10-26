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
| `TeamRotationSummaryHeader.vue`, `TeamRotations.vue`, `TeamRotationDamageChart.vue` (upstream) | Team totals, leaderboard cards and the per-character legend under the damage doughnut print `displayDamage(x).toLocaleString()`, as the Summary page and the editor's per-action values already did. The editor header's DPS is now "DPS (avg)", in both its full and its scrolled (stuck) form, the basis the list sorts by (it used to show Normal). `displayDamage()` itself is unchanged, because the calculator goldens assert raw digits. The damages drawer is also unchanged: its action table is the calculator's `CalculatorDamage` |
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
| `nav/PlusNavMenu.vue` + `Nav.vue` (upstream, one hook line + import) | the bar-chart icon is now the **rankings hub**: a menu of `PLUS_PAGES` (`shell/plusPages.ts`, read-only) with icon, title and description; `curPage` marks the page (`MyRankingsView` passes `my-rankings`), the summary keeps `data-test-nav-rankings` and its 40 px basis; a full-width sheet under the bar below `sm`. Since the 2026-10-26 rebase Nav.vue is Ryan's new nav (his focus-driven utility menu, whose "Switch to classic UI" works) with only the `<PlusNavMenu :cur-page>` hook and its import; the hub still fits the pinned 80 px bar and phone.css § 11 (sheet at `top: 80px`, `phoneLayout.cy.ts` nav check) |
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
