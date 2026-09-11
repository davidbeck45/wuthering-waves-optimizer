import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
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
