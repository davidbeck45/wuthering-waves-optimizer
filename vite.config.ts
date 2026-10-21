import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { buildScannerDataFile } from "./src/scanner/scannerData";
import { buildScannerAssetsFile } from "./src/scanner/scannerAssets";
import { SCANNER_ASSETS_FILE_NAME, signScannerData, type ScannerDataSigner } from "./src/scanner/scannerSignature";
import { SIGNING_KEY_ENV, signerFromPrivateKey } from "./scripts/scannerDataKey";
import { handleAlbumRequest, handleImageRequest } from "./api/_lib/googlePhotos";

/**
 * Publishes /scanner-data.json (game data for the Wavescan desktop scanner, ADR 0035) and
 * /scanner-assets.json (its set-icon references and echo pictures, ADR 0041): emitted into
 * every production build and served by the dev server. Generated from the app's own tables
 * at build time, so they are never committed and can't go stale.
 *
 * scanner-data.json is signed with the key in SCANNER_DATA_SIGNING_KEY (ADR 0041). Only
 * Vercel production has it; a production deploy without it fails, so an unsigned file never
 * replaces a signed one. Other builds publish it unsigned, and Wavescan ignores those.
 */
function scannerDataPlugin(): Plugin {
  const fileName = "scanner-data.json";
  const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
  const render = (signer: ScannerDataSigner | null) => {
    const assets = JSON.stringify(buildScannerAssetsFile(sha256));
    const data = signScannerData(buildScannerDataFile(sha256), {
      publishedAt: new Date().toISOString(),
      assetsHash: (JSON.parse(assets) as { hash: string }).hash,
      signer,
    });
    return { data: JSON.stringify(data), assets };
  };
  const serve = (body: () => string) => (_req: unknown, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json");
    res.end(body());
  };
  return {
    name: "wutheringtools:scanner-data",
    configureServer(server) {
      server.middlewares.use(`/${fileName}`, serve(() => render(null).data));
      server.middlewares.use(`/${SCANNER_ASSETS_FILE_NAME}`, serve(() => render(null).assets));
    },
    generateBundle() {
      const key = process.env[SIGNING_KEY_ENV];
      // Wuthering Tools+: only Ryan's production holds the key (Wavescan reads his site); ours publishes unsigned.
      if (!key && process.env.VERCEL_ENV === "production" && process.env.VERCEL_GIT_REPO_OWNER === "ryanbenson") {
        this.error(`${SIGNING_KEY_ENV} is not set: production must publish a signed scanner-data.json (ADR 0041)`);
      }
      const { data, assets } = render(key ? signerFromPrivateKey(key) : null);
      this.emitFile({ type: "asset", fileName, source: data });
      this.emitFile({ type: "asset", fileName: SCANNER_ASSETS_FILE_NAME, source: assets });
    },
  };
}

// Wuthering Tools+: the Vercel functions under api/ (Google Photos album import), served by the dev server
// at the same paths so `vite dev` behaves like production.
const wtPlusApi: Plugin = {
  name: "wt-plus-api",
  configureServer(server) {
    server.middlewares.use("/api/photos-album", (req, res) => void handleAlbumRequest(req, res));
    server.middlewares.use("/api/photos-image", (req, res) => void handleImageRequest(req, res));
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), scannerDataPlugin(), wtPlusApi],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Shared scanner logic (ADR 0034); resolved from source here, published to npm.
      "@wutheringtools/scanner-core": path.resolve(__dirname, "packages/scanner-core/src"),
      // Damage/heal/shield formulas (ADR 0036); resolved from source here, published to npm.
      "@wutheringtools/formulas": path.resolve(__dirname, "packages/formulas/src"),
      // Build card (Discord bot image) parser (ADR 0037); resolved from source here, published to npm.
      "@wutheringtools/build-card-scanner": path.resolve(__dirname, "packages/build-card-scanner/src"),
      // Riley31415/wuwa_calc (git submodule): the team-ranking engine + its page modules, bundled
      // straight from his TypeScript. Type-checked by his own tsconfig, not ours - see
      // src/sim/skittle-modules.d.ts.
      "@skittle": path.resolve(__dirname, "vendor/wuwa_calc/src"),
    },
  },
});
