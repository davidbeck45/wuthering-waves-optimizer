// Wuthering Tools+ — the build step behind a11y.css's theme tokens (src/sim/README.md, "Contrast, focus and keyboard").
//
// Plus CSS dims secondary text with `color: oklch(var(--bc) / 0.35–0.6)` (about 300 declarations in src/sim) or an
// `opacity: 0.4–0.7` on the text, and colours status text with `color: oklch(var(--su))` and friends. In David's dark
// theme base-content needs 0.74 to read at 4.5 : 1, and on light themes warning / success / accent text sat at
// 1.3–3 : 1. Rewriting every declaration by hand would touch every plus page (and the next track to write a page
// would bring the old pattern back), so the dev server and the build rewrite them as they load, in src/sim files
// only — Ryan's and Riley's own CSS is untouched:
//
//   color: oklch(var(--bc) / 0.5)        →  color: oklch(var(--bc) / max(0.5, var(--wt-muted, 0)))
//   --en-ink-3: oklch(var(--bc) / 0.55)  →  the same (custom properties named …ink…, --dim, --faint, --muted)
//   opacity: 0.6                         →  opacity: max(0.6, var(--wt-muted, 0))   (not under :disabled, not in @keyframes)
//   color: oklch(var(--p))               →  color: var(--wt-text-p, oklch(var(--p)))     (p s a in su wa er)
//   outline: 2px solid oklch(var(--p))   →  outline: 2px solid var(--wt-focus, oklch(var(--p)))
//
// `max()` keeps a value that already reads (synthwave and dracula pass at 0.5); the token fallbacks keep the old colour
// where a11y.css isn't loaded. Only the property `color` itself (not border-color, caret-color, fill), only alphas and
// opacities from 0.25 to under 0.9, are touched. Write new plus CSS the plain way: it gets the same treatment.

import type { Plugin } from "vite";

const STATUS = "p|s|a|in|su|wa|er";
// `color:` (or a text-ink custom property) as a whole property name: not border-color / caret-color / accent-color
const MUTED =
  /(?<![\w-])((?:color|--(?:[\w-]*-)?ink(?:-\d)?|--dim|--faint|--(?:[\w-]*-)?muted)\s*:\s*(?:var\(--fallback-bc\s*,\s*)?)oklch\(\s*var\(--bc\)\s*\/\s*(\d*\.?\d+)(%?)\s*\)/g;
const STATUS_TEXT = new RegExp(`(?<![\\w-])(color\\s*:\\s*)oklch\\(\\s*var\\(--(${STATUS})\\)\\s*\\)`, "g");
const FOCUS_RING = /(?<![\w-])(outline(?:-color)?\s*:[^;{}]*?)oklch\(\s*var\(--p\)\s*\)/g;
const OPACITY = /^(\s*opacity\s*:\s*)(\d*\.?\d+)(\s*(?:!important)?\s*)$/;

const LOW = 0.25;
const HIGH = 0.9;
const floor = (a: number): string => `max(${+a.toFixed(3)}, var(--wt-muted, 0))`;

/** `opacity: a` declarations, outside @keyframes and outside rules for a disabled control (a disabled control may stay
 *  dim: WCAG leaves inactive controls out of the contrast rule, and the dimness is what says "you can't"). */
function rewriteOpacity(css: string): string {
  const stack: string[] = [];
  const edits: Array<[number, number, string]> = [];
  let start = 0;
  let i = 0;
  const declaration = (from: number, to: number): void => {
    const m = OPACITY.exec(css.slice(from, to).replace(/\/\*[\s\S]*?\*\//g, ""));
    if (!m) return;
    const a = parseFloat(m[2]!);
    if (!(a >= LOW && a < HIGH)) return;
    if (stack.some((p) => /^@(?:-\w+-)?keyframes\b/.test(p) || /disabled/.test(p))) return;
    edits.push([from, to, `${m[1]}${floor(a)}${m[3]}`]);
  };
  while (i < css.length) {
    const ch = css[i]!;
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = css.indexOf(ch, i + 1);
      i = end < 0 ? css.length : end + 1;
      continue;
    }
    if (ch === "{") {
      stack.push(css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, "").trim());
      start = i + 1;
    } else if (ch === "}") {
      declaration(start, i);
      stack.pop();
      start = i + 1;
    } else if (ch === ";") {
      declaration(start, i);
      start = i + 1;
    }
    i++;
  }
  let out = css;
  for (const [from, to, text] of edits.reverse()) out = out.slice(0, from) + text + out.slice(to);
  return out;
}

/** The rewrite itself: pure, for one stylesheet's text. */
export function rewriteContrast(css: string): string {
  const colours = css
    .replace(MUTED, (whole, head: string, num: string, pct: string) => {
      const alpha = pct ? parseFloat(num) / 100 : parseFloat(num);
      if (!(alpha >= LOW && alpha < HIGH)) return whole;
      return `${head}oklch(var(--bc) / ${floor(alpha)})`;
    })
    .replace(STATUS_TEXT, (_whole, head: string, token: string) => `${head}var(--wt-text-${token}, oklch(var(--${token})))`)
    .replace(FOCUS_RING, (_whole, head: string) => `${head}var(--wt-focus, oklch(var(--p)))`);
  return /opacity\s*:/.test(colours) ? rewriteOpacity(colours) : colours;
}

/** Which module ids get the rewrite: plain .css files and .vue <style> blocks under `simDir`, not `?raw` / `?url`. */
export function isPlusStyle(id: string, simDir: string): boolean {
  const [file = "", query = ""] = id.split("?", 2);
  if (!file.startsWith(simDir)) return false;
  if (/(?:^|&)(raw|url)(?:&|=|$)/.test(query)) return false;
  if (file.endsWith(".css")) return true;
  return file.endsWith(".vue") && /(?:^|&)type=style(?:&|$)/.test(query);
}

/** `simDir`: the absolute path of src/sim with a trailing slash. */
export function wtPlusContrast(simDir: string): Plugin {
  return {
    name: "wt-plus-contrast",
    enforce: "pre",
    transform(code, id) {
      if (!isPlusStyle(id, simDir)) return null;
      const out = rewriteContrast(code);
      return out === code ? null : { code: out, map: null };
    },
  };
}
