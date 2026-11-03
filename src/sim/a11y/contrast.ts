// Wuthering Tools+ — WCAG contrast arithmetic for the theme tokens in a11y.css (src/sim/README.md, "Contrast,
// focus and keyboard"). DaisyUI 4 stores every theme colour as an "L% C H" oklch triplet in a CSS variable
// (--bc, --b1, --p …); these helpers turn one into sRGB, lay a translucent colour over a background the way a
// browser composites it (in gamma-encoded sRGB), and measure the WCAG 2 contrast ratio. Pure: no DOM.

export type Rgb = readonly [number, number, number]; // 0–1 per channel, gamma-encoded sRGB

/** "65.69% 0.196 275.75" (or "0.6569 0.196 275.75") → [L 0–1, C, H degrees]. */
export function parseOklch(triplet: string): [number, number, number] {
  const [l, c, h] = triplet.trim().split(/\s+/);
  const L = l!.endsWith("%") ? parseFloat(l!) / 100 : parseFloat(l!);
  return [L, parseFloat(c ?? "0") || 0, parseFloat(h ?? "0") || 0];
}

const gamma = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const linear = (x: number): number => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** oklab → gamma-encoded sRGB, clipped to the gamut (what a browser paints for an out-of-gamut colour, near enough). */
export function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    clamp01(gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

export function oklchToOklab([L, C, H]: readonly [number, number, number]): [number, number, number] {
  const h = (H * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

export const oklchToRgb = (triplet: string): Rgb => {
  const [L, a, b] = oklchToOklab(parseOklch(triplet));
  return oklabToRgb(L, a, b);
};

/** `color-mix(in oklab, A p%, B)` of two oklch triplets, as sRGB. */
export function mixOklab(a: string, p: number, b: string): Rgb {
  const A = oklchToOklab(parseOklch(a));
  const B = oklchToOklab(parseOklch(b));
  return oklabToRgb(A[0] * p + B[0] * (1 - p), A[1] * p + B[1] * (1 - p), A[2] * p + B[2] * (1 - p));
}

/** `fg` at `alpha` laid over an opaque `bg` (normal blending, in gamma-encoded sRGB like a browser). */
export const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb =>
  [fg[0] * alpha + bg[0] * (1 - alpha), fg[1] * alpha + bg[1] * (1 - alpha), fg[2] * alpha + bg[2] * (1 - alpha)] as const;

export const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG 2 contrast ratio, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The lowest alpha (to 0.01) at which `fg` over `bg` reaches `target`; 1 when even full strength falls short. */
export function minAlpha(fg: Rgb, bg: Rgb, target: number): number {
  for (let a = 0; a <= 100; a++) if (contrast(over(fg, a / 100, bg), bg) >= target) return a / 100;
  return 1;
}

export const toHex = ([r, g, b]: Rgb): string =>
  "#" + [r, g, b].map((x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0")).join("");
