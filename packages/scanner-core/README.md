# @wutheringtools/scanner-core

Logic for reading the Wuthering Waves **Bag → Echoes** screen from OCR output: screen layouts (as resolution-independent fractions), stability gating, OCR text parsing, fuzzy echo/stat matching, substat validation, review flags and dedupe signatures.

It's shared by [Wuthering Tools](https://wutheringtools.com) (in-browser scanner) and [Wavescan](https://wavescan.app) (desktop scanner). It's plain TypeScript with no DOM, Vue or framework dependencies.

## Usage

The package contains **logic only**. Pass in the game tables once at startup:

```ts
import { setScannerGameData, parseEchoCandidate } from "@wutheringtools/scanner-core";

setScannerGameData({
  echoes,                  // { [key]: { key, name, class, sets? } }
  echoCostByClass,         // { Calamity: 4, Overlord: 4, Elite: 3, Common: 1 }
  statsTable,              // cost → stat → rank → main-stat value
  subStatsTable,           // stat → legal rolls
  verboseStatLabelMap,     // display label / OCR alias → stat key
  flatBonusesByRankByType, // cost → rank → secondary stat value
});
```

Modules can also be imported individually, e.g. `@wutheringtools/scanner-core/layout`.

The published build is standard ESM: it works in Node and in bundlers (Vite, webpack, esbuild). Relative imports in the source use `.js` extensions for that reason; keep that when adding files.

## Development

The source lives in the Wuthering Tools repo, and that repo's test suite (`tests/scanner/`) covers it. To release, bump `version` in `package.json` and merge to `master`. CI tests, builds and **stages** the version on npm via Trusted Publishing, and it goes live once a maintainer approves it on npmjs.com.

License: GPL-3.0-or-later.
