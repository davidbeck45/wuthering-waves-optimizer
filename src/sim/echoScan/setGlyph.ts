// Wuthering Tools+: the echo's Sonata set from the small icon right of "+25" in the detail panel, so a
// screenshot needs no Sonata filter. Pure pixel maths (no DOM): setGlyphCanvas.ts feeds it canvas pixels.
// Twin of wuwa-tools/echo-import/set_glyph.py: same constants, same steps, same rounding.
//
// The in-game icon is a coloured ring around a white symbol, drawn from the same art as the app's set icons
// (`echoSetImageMap`), so those icons are the templates.
//   1. locate: in a window right of the level text, the ring = the circle (radius 16–20 px at 3120 × 1440)
//      whose brightness (max of R, G, B) just inside its rim beats the brightness just outside it the most;
//   2. refine: the rim (steepest drop in brightness, searched r − 2.5 … r + 3 around the located radius) left /
//      right / up / down gives a sub-pixel centre and the outer radius R (18.0 px on the S26 Ultra);
//   3. sample: a 24 × 24 bilinear grid over the circle's bounding square; an icon is sampled the same way over
//      its own circle (alpha bounding box), colour premultiplied by alpha (= drawn on black);
//   4. score: zero-mean normalised cross-correlation per colour channel inside 0.97 R, averaged over R, G, B;
//   5. decide among the candidate sets: confident when the best score ≥ 0.70, ≥ 0.08 ahead of the runner-up,
//      and the ring's colour (chromaticity, 0.86–0.97 R) within 0.10 of the icon's. Anything else is flagged.
// Measured on 203 labelled S26 Ultra screenshots (17 sets): 203/203 right among the echo's own sets and among
// all 37, every right answer scores 0.86–0.96, no confident wrong answer; with the true set taken out of the
// echo's own sets, all 173 answers are flagged (wuwa-tools/echo-import: `python3 set_glyph.py bench`).

/** Interleaved 8-bit pixels: 3 = RGB, 4 = RGBA (canvas ImageData). Coordinates are pixel centres. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels: 3 | 4;
}

export const GLYPH = {
  /** the ring's radius range searched, px at 3120 wide */
  radii: [16, 20] as const,
  /** ring minus outside brightness (0–255) below which there is no icon in the window */
  minContrast: 50,
  grid: 24,
  disk: 0.97,
  ring: [0.86, 0.97] as const,
  minScore: 0.7,
  minMargin: 0.08,
  maxRing: 0.1,
} as const;

/** grid × grid × 3 samples (R, G, B), row-major */
export type GlyphFeature = Float32Array;

export interface GlyphMatch {
  set: string;
  /** 1 = the icon's twin; the real shots score 0.86–0.96 */
  score: number;
  runnerUp: string | null;
  runnerUpScore: number | null;
  /** best − runner-up (1 with a single candidate) */
  margin: number;
  /** chromaticity distance between the ring and the icon's ring */
  ring: number;
  confident: boolean;
  /** the best few, for notes and debugging */
  ranked: Array<[set: string, score: number]>;
}

/** JavaScript's Math.round; the Python twin uses the same round-half-up. */
const rnd = Math.round;

function at(px: Pixels, x: number, y: number, c: number): number {
  const xi = x < 0 ? 0 : x >= px.width ? px.width - 1 : x;
  const yi = y < 0 ? 0 : y >= px.height ? px.height - 1 : y;
  return px.data[(yi * px.width + xi) * px.channels + c];
}

function bilinear(px: Pixels, fx: number, fy: number, out: number[]): number[] {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const ax = fx - x0;
  const ay = fy - y0;
  for (let c = 0; c < px.channels; c++) {
    const top = at(px, x0, y0, c) * (1 - ax) + at(px, x0 + 1, y0, c) * ax;
    const bottom = at(px, x0, y0 + 1, c) * (1 - ax) + at(px, x0 + 1, y0 + 1, c) * ax;
    out[c] = top * (1 - ay) + bottom * ay;
  }
  return out;
}

const brightnessAt = (px: Pixels, fx: number, fy: number, tmp: number[]): number => {
  const p = bilinear(px, fx, fy, tmp);
  return Math.max(p[0], p[1], p[2]);
};

export interface BadgeSpot {
  contrast: number;
  cx: number;
  cy: number;
  r: number;
}

/** The circle whose rim is brightest relative to just outside it (integer centre and radius). */
export function locateBadge(px: Pixels, rMin: number, rMax: number): BadgeSpot {
  const { width: w, height: h, channels: ch, data } = px;
  const V = new Float32Array(w * h);
  for (let i = 0, p = 0; p < V.length; i += ch, p++) V[p] = Math.max(data[i], data[i + 1], data[i + 2]);
  const K = 40;
  let best: BadgeSpot = { contrast: -1e9, cx: 0, cy: 0, r: 0 };
  for (let r = rMin; r <= rMax; r++) {
    const inner: Array<[number, number]> = [];
    const outer: Array<[number, number]> = [];
    for (let k = 0; k < K; k++) {
      const a = Math.cos((2 * Math.PI * k) / K);
      const b = Math.sin((2 * Math.PI * k) / K);
      inner.push([a * (r - 1.5), b * (r - 1.5)]);
      outer.push([a * (r + 2), b * (r + 2)]);
    }
    for (let cy = r + 2; cy < h - r - 2; cy++) {
      for (let cx = r + 2; cx < w - r - 2; cx++) {
        let s = 0;
        for (const [dx, dy] of inner) s += V[rnd(cy + dy) * w + rnd(cx + dx)];
        for (const [dx, dy] of outer) s -= V[rnd(cy + dy) * w + rnd(cx + dx)];
        if (s / K > best.contrast) best = { contrast: s / K, cx, cy, r };
      }
    }
  }
  return best;
}

function edgeAlong(px: Pixels, cx: number, cy: number, angle: number, lo: number, hi: number): number {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const tmp: number[] = [];
  const vals: Array<[number, number]> = [];
  for (let k = 0; lo + k * 0.25 <= hi; k++) {
    const rho = lo + k * 0.25;
    vals.push([rho, brightnessAt(px, cx + ca * rho, cy + sa * rho, tmp)]);
  }
  let edge = vals[1]?.[0] ?? lo;
  let steepest = Infinity;
  for (let i = 1; i < vals.length - 1; i++) {
    const d = vals[i + 1][1] - vals[i - 1][1];
    if (d < steepest) {
      steepest = d;
      edge = vals[i][0];
    }
  }
  return edge;
}

/** Sub-pixel centre and outer radius from the rim left / right / up / down (five rays each). */
export function refineBadge(px: Pixels, cx: number, cy: number, r: number): { cx: number; cy: number; radius: number } {
  // around the located radius only: a wider search finds the edge of the white symbol inside the ring instead
  const lo = r - 2.5;
  const hi = r + 3;
  const sector = (a0: number): number => [-0.3, -0.15, 0, 0.15, 0.3].reduce((sum, da) => sum + edgeAlong(px, cx, cy, a0 + da, lo, hi), 0) / 5;
  const right = sector(0);
  const left = sector(Math.PI);
  const down = sector(Math.PI / 2);
  const up = sector(-Math.PI / 2);
  return { cx: cx + (right - left) / 2, cy: cy + (down - up) / 2, radius: (right + left + down + up) / 4 };
}

/** grid × grid bilinear samples over the circle's bounding square; RGBA is premultiplied (drawn on black). */
export function sampleCircle(px: Pixels, cx: number, cy: number, radius: number): GlyphFeature {
  const n = GLYPH.grid;
  const out = new Float32Array(n * n * 3);
  const tmp: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = bilinear(px, cx + (((i + 0.5) / n) * 2 - 1) * radius, cy + (((j + 0.5) / n) * 2 - 1) * radius, tmp);
      const a = px.channels === 4 ? p[3] / 255 : 1;
      const o = (j * n + i) * 3;
      out[o] = p[0] * a;
      out[o + 1] = p[1] * a;
      out[o + 2] = p[2] * a;
    }
  }
  return out;
}

/** An app set icon (RGBA): its circle is the alpha ≥ 128 bounding box. Null for an empty image. */
export function iconFeature(px: Pixels): GlyphFeature | null {
  if (px.channels !== 4) throw new Error("a set icon needs its alpha channel");
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (px.data[(y * px.width + x) * 4 + 3] >= 128) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x0 === Infinity) return null;
  const left = x0 - 0.5;
  const right = x1 + 0.5;
  const top = y0 - 0.5;
  const bottom = y1 + 0.5;
  return sampleCircle(px, (left + right) / 2, (top + bottom) / 2, (right - left + (bottom - top)) / 4);
}

export interface BadgeFeature {
  feature: GlyphFeature;
  /** centre and radius in the window's pixels */
  cx: number;
  cy: number;
  radius: number;
  contrast: number;
}

/** The icon in a search window of a screenshot (`scale` = screenshot width / 3120), or null when no ring stands out. */
export function badgeFeature(px: Pixels, scale = 1): BadgeFeature | null {
  const spot = locateBadge(px, rnd(GLYPH.radii[0] * scale), rnd(GLYPH.radii[1] * scale));
  if (spot.contrast < GLYPH.minContrast) return null;
  const { cx, cy, radius } = refineBadge(px, spot.cx, spot.cy, spot.r);
  return { feature: sampleCircle(px, cx, cy, radius), cx, cy, radius, contrast: spot.contrast };
}

function indexes(lo: number, hi: number): number[] {
  const n = GLYPH.grid;
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1);
      if (d >= lo && d <= hi) out.push(j * n + i);
    }
  }
  return out;
}
const DISK_IDX = indexes(0, GLYPH.disk);
const RING_IDX = indexes(GLYPH.ring[0], GLYPH.ring[1]);

function zncc(a: GlyphFeature, b: GlyphFeature, channel: number): number {
  let ma = 0;
  let mb = 0;
  for (const i of DISK_IDX) {
    ma += a[i * 3 + channel];
    mb += b[i * 3 + channel];
  }
  ma /= DISK_IDX.length;
  mb /= DISK_IDX.length;
  let num = 0;
  let da2 = 0;
  let db2 = 0;
  for (const i of DISK_IDX) {
    const dx = a[i * 3 + channel] - ma;
    const dy = b[i * 3 + channel] - mb;
    num += dx * dy;
    da2 += dx * dx;
    db2 += dy * dy;
  }
  const den = Math.sqrt(da2 * db2);
  return den ? num / den : 0;
}

/** Per-channel normalised cross-correlation inside 0.97 R, averaged over R, G, B (−1…1). */
export function glyphScore(feature: GlyphFeature, template: GlyphFeature): number {
  return (zncc(feature, template, 0) + zncc(feature, template, 1) + zncc(feature, template, 2)) / 3;
}

export function ringColour(feature: GlyphFeature): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  for (const i of RING_IDX) for (let c = 0; c < 3; c++) sum[c] += feature[i * 3 + c];
  return sum.map((v) => v / RING_IDX.length) as [number, number, number];
}

/** Distance between two colours' chromaticity (r / (r + g + b), g / (r + g + b)): brightness doesn't count. */
export function ringDistance(a: readonly number[], b: readonly number[]): number {
  const sa = a[0] + a[1] + a[2] || 1;
  const sb = b[0] + b[1] + b[2] || 1;
  return Math.hypot(a[0] / sa - b[0] / sb, a[1] / sa - b[1] / sb);
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** The best candidate set for an icon, with the confidence rule; null when no candidate has a template. */
export function matchGlyph(feature: GlyphFeature, templates: Readonly<Record<string, GlyphFeature>>, candidates: readonly string[]): GlyphMatch | null {
  const scored = candidates
    .filter((set) => templates[set])
    .map((set): [string, number] => [set, glyphScore(feature, templates[set])])
    .sort((a, b) => b[1] - a[1]);
  if (!scored.length) return null;
  const [set, score] = scored[0];
  const [runnerUp, runnerUpScore] = scored[1] ?? [null, null];
  const margin = runnerUpScore === null ? 1 : score - runnerUpScore;
  const ring = ringDistance(ringColour(feature), ringColour(templates[set]));
  return {
    set,
    score: round3(score),
    runnerUp,
    runnerUpScore: runnerUpScore === null ? null : round3(runnerUpScore),
    margin: round3(margin),
    ring: round3(ring),
    confident: score >= GLYPH.minScore && margin >= GLYPH.minMargin && ring <= GLYPH.maxRing,
    ranked: scored.slice(0, 4).map(([s, v]) => [s, round3(v)]),
  };
}
