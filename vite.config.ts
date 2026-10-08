import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { buildScannerDataFile } from "./src/scanner/scannerData";
import { handleAlbumRequest, handleImageRequest } from "./api/_lib/googlePhotos";

/**
 * Publishes /scanner-data.json (game data for the Wavescan desktop scanner, ADR 0035):
 * emitted into every production build and served by the dev server. Generated from the
 * app's own tables at build time, so it is never committed and can't go stale.
 */
function scannerDataPlugin(): Plugin {
  const fileName = "scanner-data.json";
  const render = () =>
    JSON.stringify(buildScannerDataFile((text) => createHash("sha256").update(text).digest("hex")));
  return {
    name: "wutheringtools:scanner-data",
    configureServer(server) {
      server.middlewares.use(`/${fileName}`, (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(render());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName, source: render() });
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
