import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { handleAlbumRequest, handleImageRequest } from "./api/_lib/googlePhotos";

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
  plugins: [vue(), wtPlusApi],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Riley31415/wuwa_calc (git submodule): the team-ranking engine + its page modules, bundled
      // straight from his TypeScript. Type-checked by his own tsconfig, not ours - see
      // src/sim/skittle-modules.d.ts.
      "@skittle": path.resolve(__dirname, "vendor/wuwa_calc/src"),
    },
  },
});
