// The theme tokens in a11y.css, measured against DaisyUI's own colours for every theme the app offers (useTheme.ts
// THEME_OPTIONS): DaisyUI's convertColorFormat turns each theme into the --bc / --b1 … oklch triplets the page uses.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS } from "../../composables/useTheme";
import { contrast, oklabToRgb, oklchToOklab, oklchToRgb, over, parseOklch, type Rgb } from "./contrast";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const daisyThemes = require("daisyui/src/theming/themes.js") as Record<string, Record<string, string>>;
const daisyFunctions = require("daisyui/src/theming/functions.js") as { convertColorFormat: (t: Record<string, string>) => Record<string, string> };
// tailwind.config.js is CommonJS in a "type": "module" package (Tailwind loads it with its own loader): evaluate it
const tailwind = (() => {
  const mod = { exports: {} as { daisyui: { themes: Array<string | Record<string, Record<string, string>>> } } };
  new Function("module", "exports", "require", readFileSync(resolve(here, "../../../tailwind.config.js"), "utf8"))(mod, mod.exports, require);
  return mod.exports;
})();
const css = readFileSync(resolve(here, "a11y.css"), "utf8");

const customThemes: Record<string, Record<string, string>> = {};
for (const t of tailwind.daisyui.themes) if (typeof t === "object") Object.assign(customThemes, t);
const varsOf = (theme: string): Record<string, string> => daisyFunctions.convertColorFormat(customThemes[theme] ?? daisyThemes[theme]!); // a method: it calls this.…

/** The custom properties a11y.css sets for `[data-theme="<theme>"]`. */
function tokensOf(theme: string): Record<string, string> {
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) return {};
  return Object.fromEntries([...block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const STATUS = ["p", "s", "a", "in", "su", "wa", "er"] as const;
/** --wt-text-X: the theme's colour with its oklch lightness set to --wt-l-X (relative colour syntax), else as is. */
function statusText(vars: Record<string, string>, tokens: Record<string, string>, k: string): Rgb {
  const [L, C, H] = parseOklch(vars[`--${k}`]!);
  const l = tokens[`--wt-l-${k}`] ? parseFloat(tokens[`--wt-l-${k}`]!) : L;
  const [x, a, b] = oklchToOklab([l, C, H]);
  return oklabToRgb(x, a, b);
}

describe("contrast arithmetic", () => {
  it("measures the WCAG reference pairs", () => {
    expect(contrast([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 5);
    expect(contrast([0.4667, 0.4667, 0.4667], [1, 1, 1])).toBeCloseTo(4.48, 1); // #777 on white
    expect(oklchToRgb("100% 0 0").map((x) => Math.round(x * 255))).toEqual([255, 255, 255]);
  });
  it("matches what the audit measured in the browser for dark base-content at 0.6 (3.46 : 1)", () => {
    const v = varsOf("dark");
    const bg = oklchToRgb(v["--b1"]!);
    expect(contrast(over(oklchToRgb(v["--bc"]!), 0.6, bg), bg)).toBeCloseTo(3.46, 1);
  });
});

describe("a dim that is the information", () => {
  it("keeps ToA's unearned crest stars off the text floor: at 0.8 in dark, 1 of 3 crests read as three stars", () => {
    const floored = new Set([...css.matchAll(/\.opacity-(\d+)\b/g)].map((m) => m[1]!));
    expect(floored.has("25") && floored.has("30"), "the utilities a11y.css floors").toBe(true);
    for (const file of ["../endgame/ToaFloorCard.vue", "../endgame/ToaPlan.vue"]) {
      const template = readFileSync(resolve(here, file), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      const stars = template.split("\n").filter((line) => line.includes("★") && line.includes("opacity-"));
      expect(stars.length, `${file}: the dimmed star line`).toBeGreaterThan(0);
      for (const line of stars) {
        for (const m of line.matchAll(/\bopacity-(\d+)\b/g)) expect(floored.has(m[1]!), `${file}: ${line.trim()}`).toBe(false);
      }
    }
  });
});

describe("a11y.css theme tokens", () => {
  it("has a block for every theme the app offers", () => {
    for (const theme of THEME_OPTIONS) expect(tokensOf(theme)["--wt-muted"], theme).toBeTruthy();
  });

  it.each(THEME_OPTIONS)("%s: muted text reads at 4.5 : 1 on base-100/200/300 and on a 5 % base-content tint", (theme) => {
    const v = varsOf(theme);
    const t = tokensOf(theme);
    const bc = oklchToRgb(v["--bc"]!);
    const b1 = oklchToRgb(v["--b1"]!);
    const backgrounds = [b1, oklchToRgb(v["--b2"]!), oklchToRgb(v["--b3"]!), over(bc, 0.05, b1)];
    const alpha = parseFloat(t["--wt-muted"]!);
    for (const bg of backgrounds) expect(contrast(over(bc, alpha, bg), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEME_OPTIONS)("%s: on a tinted surface (chips, cards) the raised floor reads on a 10 %% base-content tint", (theme) => {
    const v = varsOf(theme);
    const t = tokensOf(theme);
    const bc = oklchToRgb(v["--bc"]!);
    const tinted = over(bc, 0.1, oklchToRgb(v["--b1"]!));
    const tint = parseFloat(t["--wt-muted-tint"]!);
    expect(tint).toBeGreaterThanOrEqual(parseFloat(t["--wt-muted"]!));
    expect(contrast(over(bc, tint, tinted), tinted)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEME_OPTIONS)("%s: form-field borders reach 3 : 1 on base-100 and base-200", (theme) => {
    const v = varsOf(theme);
    const bc = oklchToRgb(v["--bc"]!);
    const alpha = parseFloat(tokensOf(theme)["--wt-edge"]!);
    for (const k of ["--b1", "--b2"]) {
      const bg = oklchToRgb(v[k]!);
      expect(contrast(over(bc, alpha, bg), bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(THEME_OPTIONS)("%s: status colours as text (and the focus ring) read at 4.5 : 1, also on their own 15 % tint", (theme) => {
    const v = varsOf(theme);
    const t = tokensOf(theme);
    const bases = ["--b1", "--b2", "--b3"].map((k) => oklchToRgb(v[k]!));
    for (const k of STATUS) {
      const own = oklchToRgb(v[`--${k}`]!);
      const text = statusText(v, t, k);
      for (const bg of [...bases, over(own, 0.15, bases[0]!), over(own, 0.15, bases[1]!)]) {
        expect(contrast(text, bg), `${theme} --wt-text-${k}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("declares the text tokens on every [data-theme] element, so a share card in its own theme reads its own colours", () => {
    // a custom property's var()s resolve where it is declared: on :root alone, a light card on a dark page got the page's primary
    const defaults = /:root,\s*\[data-theme\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const k of STATUS) {
      expect(defaults, `--wt-text-${k}`).toMatch(new RegExp(`--wt-text-${k}:\\s*oklch\\(from oklch\\(var\\(--${k}\\)\\)`));
      expect(defaults, `--wt-l-${k} reset`).toMatch(new RegExp(`--wt-l-${k}:\\s*initial;`));
    }
  });

  it("leaves a theme's colour alone where it already reads (no lightness override in synthwave or night)", () => {
    expect(Object.keys(tokensOf("synthwave")).filter((k) => k.startsWith("--wt-l-"))).toEqual([]);
    expect(Object.keys(tokensOf("night")).filter((k) => k.startsWith("--wt-l-"))).toEqual([]);
  });
});
