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
| `rerollAdvice.ts` | Transducer advice for an equipped 5-line echo: each line's worth (build without it) vs a fresh random line in its place (every open type × tier, exact) → lock / re-roll per line, ranked; one plan per lock count with P(improve), expected gain keeping the better lines, Transducers per success. One re-rolled line is exact; two or more add the new lines' exact single-line values (MC over that, no engine per sample). Lock costs default 1/1/1/2/3, "verify in game" |
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
| `engineView.ts` | the panel's engine job: benchmark, `substatWeights`, `equippedSubstatWorth`, and (unless `reroll: false`) every full echo's advice picked with `pickRerollFirst` |
| `rerollPick.ts` | `MIN_PLAN_GAIN` (0.05 %) and `pickRerollFirst` (best recommended plan per Transducer; ties → bigger gain → lower slot). No engine imports, so the page and the panel share the engine's exact rule |
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
