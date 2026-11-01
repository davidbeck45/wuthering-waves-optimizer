// @vitest-environment node
// Wuthering Tools+: the set icon next to +25 (setGlyph.ts) on six real 150 × 90 search windows cut from labelled
// S26 Ultra screenshots, against the app's own set icons (the webp files the app loads from the assets CDN).
// twin.json = what the Python twin (wuwa-tools/echo-import/set_glyph.py, dump_glyph_fixture.py) answered on the
// same pixels; the TypeScript reader is held to it.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import twin from "./__fixtures__/setGlyph/twin.json";
import { GLYPH, badgeFeature, iconFeature, matchGlyph, type BadgeFeature, type GlyphFeature, type Pixels } from "./setGlyph";

const DIR = fileURLToPath(new URL("./__fixtures__/setGlyph/", import.meta.url));
const CROPS = ["PactofNeonlightLeap", "HaloofStarryRadiance", "MoonlitClouds", "FlamewingsShadow", "HavocEclipse", "SongofFeatheredTrace"];

interface TwinCase {
  crop: string;
  candidates: string[];
  set: string;
  score: number;
  runnerUp: string | null;
  runnerUpScore: number | null;
  margin: number;
  ring: number;
  confident: boolean;
}
const TWIN = twin as unknown as { badges: Record<string, { contrast: number; cx: number; cy: number; R: number }>; cases: TwinCase[] };

async function decode(file: string | Buffer, alpha: boolean): Promise<Pixels> {
  const image = alpha ? sharp(file).ensureAlpha() : sharp(file).removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels as 3 | 4 };
}

const templates: Record<string, GlyphFeature> = {};
const badges: Record<string, BadgeFeature> = {};

beforeAll(async () => {
  for (const file of readdirSync(`${DIR}icons`)) {
    const feature = iconFeature(await decode(`${DIR}icons/${file}`, true));
    if (feature) templates[file.replace(/\.webp$/, "")] = feature;
  }
  for (const crop of CROPS) {
    const badge = badgeFeature(await decode(`${DIR}${crop}.png`, false));
    if (badge) badges[crop] = badge;
  }
});

describe("set icon next to +25: finding it", () => {
  it("finds the ring in every search window, where the Python twin found it", () => {
    for (const crop of CROPS) {
      const badge = badges[crop];
      const py = TWIN.badges[crop];
      expect(badge, crop).toBeDefined();
      expect(badge.cx, crop).toBeCloseTo(py.cx, 1);
      expect(badge.cy, crop).toBeCloseTo(py.cy, 1);
      expect(badge.radius, crop).toBeCloseTo(py.R, 1);
      expect(badge.contrast, crop).toBeGreaterThan(100);
      // the S26 Ultra draws it 18 px in radius, right of "+25"
      expect(badge.radius, crop).toBeGreaterThan(17);
      expect(badge.radius, crop).toBeLessThan(19);
    }
  });

  it("reports no icon on a window without one", () => {
    const width = 150;
    const height = 90;
    const flat = new Uint8Array(width * height * 3);
    for (let i = 0; i < flat.length; i += 3) flat.set([22, 26, 34], i);
    expect(badgeFeature({ data: flat, width, height, channels: 3 })).toBeNull();
  });

  it("reads the icon from a smaller screenshot of the same shape (scale 0.75)", async () => {
    const small = await sharp(`${DIR}PactofNeonlightLeap.png`).resize(Math.round(150 * 0.75), Math.round(90 * 0.75)).raw().toBuffer({ resolveWithObject: true });
    const badge = badgeFeature({ data: small.data, width: small.info.width, height: small.info.height, channels: small.info.channels as 3 }, 0.75);
    expect(badge?.radius).toBeCloseTo(18 * 0.75, 0);
    const match = matchGlyph(badge!.feature, templates, ["PactofNeonlightLeap", "RiteofGildedRevelation"]);
    expect(match?.set).toBe("PactofNeonlightLeap");
    expect(match?.confident).toBe(true);
  });
});

describe("set icon next to +25: matching it", () => {
  it("answers what the Python twin answered, case by case", () => {
    for (const c of TWIN.cases) {
      const match = matchGlyph(badges[c.crop].feature, templates, c.candidates);
      const label = `${c.crop} among ${c.candidates.length}`;
      expect(match?.set, label).toBe(c.set);
      expect(match?.confident, label).toBe(c.confident);
      expect(match?.runnerUp ?? null, label).toBe(c.runnerUp);
      expect(Math.abs(match!.score - c.score), label).toBeLessThan(0.003);
      expect(Math.abs(match!.margin - c.margin), label).toBeLessThan(0.003);
      expect(Math.abs(match!.ring - c.ring), label).toBeLessThan(0.003);
    }
  });

  it("gets every crop right and sure among all thirteen icons", () => {
    for (const crop of CROPS) {
      const match = matchGlyph(badges[crop].feature, templates, Object.keys(templates));
      expect(match?.set, crop).toBe(crop);
      expect(match?.confident, crop).toBe(true);
      expect(match!.score, crop).toBeGreaterThan(0.85);
    }
  });

  it("tells Pact of Neonlight Leap from Halo of Starry Radiance (same shield, yellow vs green ring)", () => {
    const pact = matchGlyph(badges.PactofNeonlightLeap.feature, templates, ["HaloofStarryRadiance", "PactofNeonlightLeap"]);
    expect(pact).toMatchObject({ set: "PactofNeonlightLeap", runnerUp: "HaloofStarryRadiance", confident: true });
    expect(pact!.margin).toBeGreaterThanOrEqual(GLYPH.minMargin);
    const halo = matchGlyph(badges.HaloofStarryRadiance.feature, templates, ["PactofNeonlightLeap", "HaloofStarryRadiance"]);
    expect(halo).toMatchObject({ set: "HaloofStarryRadiance", confident: true });
  });

  it("flags instead of guessing when the right set is not among the candidates", () => {
    // Halo's shield is the closest shape to Pact's, but its ring is green: the colour check stops it
    const lone = matchGlyph(badges.PactofNeonlightLeap.feature, templates, ["HaloofStarryRadiance"]);
    expect(lone).toMatchObject({ set: "HaloofStarryRadiance", confident: false, margin: 1 });
    expect(lone!.ring).toBeGreaterThan(GLYPH.maxRing);
    // Flamewing's Shadow's own sets without it: a poor fit
    const flame = matchGlyph(badges.FlamewingsShadow.feature, templates, ["ThreadofSeveredFate"]);
    expect(flame?.confident).toBe(false);
    expect(flame!.score).toBeLessThan(GLYPH.minScore);
  });

  it("returns null when no candidate has an icon", () => {
    expect(matchGlyph(badges.MoonlitClouds.feature, templates, ["NoSuchSet"])).toBeNull();
    expect(matchGlyph(badges.MoonlitClouds.feature, templates, [])).toBeNull();
  });
});
