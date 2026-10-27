// Wuthering Tools+ — "Read with Claude" (claudeVision.ts) with a scripted client: no request leaves the test.
// The responses in __fixtures__/claudeVisionResponses.json have the shape the beta Messages endpoint returns for a
// structured-output request on claude-opus-5-5 (an empty thinking block, then the JSON as text); their stat lines
// are the Cypress fixture screenshots' (cypress/fixtures/echoScan), whose values the OCR spec verifies.
import { describe, expect, it, vi } from "vitest";
import * as sdk from "@anthropic-ai/sdk";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import responses from "./__fixtures__/claudeVisionResponses.json";
import { echoSetImageMap } from "../../echoes/stats";
import {
  NONE_OF_THESE,
  VISION_LONG_EDGE,
  VISION_SYSTEM_PROMPT,
  applySetMatch,
  buildReadParams,
  buildSetMatchParams,
  compareWithOcr,
  echoReadSchema,
  estimateVisionCost,
  imageTokens,
  visionSize,
  VISION_MAX_PIXELS,
  mapClaudeEcho,
  parsePrinted,
  parseStructured,
  readEchoesWithClaude,
  readPayloadOf,
  setMatchSchema,
  visionVocab,
  type ClaudeEchoRaw,
  type PreparedImage,
  type VisionClientLike,
  type VisionImage,
} from "./claudeVision";
import { toParsedEcho, type ScanRecord } from "./phoneEchoScan";
import { glyphCropRegion } from "./visionImage";
import { claudeCandidates, needsALook, newScanItem } from "./batchItems";

type Fixture = keyof typeof responses;
const message = (name: Fixture): BetaMessage => JSON.parse(JSON.stringify(responses[name])) as BetaMessage;
const echoesOf = (name: Fixture): ClaudeEchoRaw[] => {
  const parsed = parseStructured(message(name));
  if (!parsed.ok) throw new Error(parsed.message);
  return readPayloadOf(parsed.value)?.echoes ?? [];
};

function image(over: Partial<PreparedImage> = {}): PreparedImage {
  return {
    data: "QUJD",
    mediaType: "image/jpeg",
    width: 2576,
    height: 1189,
    sourceWidth: 3120,
    sourceHeight: 1440,
    crop: vi.fn(async () => ({ data: "R0xZUEg=", mediaType: "image/png" as const, width: 384, height: 384, sourceWidth: 192, sourceHeight: 192 })),
    dispose: vi.fn(),
    ...over,
  };
}
const visionImage = (name: string, prepared: PreparedImage = image()): VisionImage => ({ id: name, name, load: async () => prepared });

interface Call {
  params: MessageCreateParamsNonStreaming;
  signal?: AbortSignal;
}
/** A client whose `beta.messages.create` answers from a script (a fixture name, a message, an error, or a function). */
// eslint-disable-next-line no-unused-vars -- the parameter of a function type
function scripted(steps: Array<Fixture | BetaMessage | Error | ((call: Call) => Promise<BetaMessage>)>) {
  const calls: Call[] = [];
  const client: VisionClientLike = {
    beta: {
      messages: {
        create: async (params, options) => {
          const call = { params: JSON.parse(JSON.stringify(params)) as MessageCreateParamsNonStreaming, signal: options?.signal };
          calls.push(call);
          const step = steps.shift();
          if (step === undefined) throw new Error(`unexpected request #${calls.length}`);
          if (step instanceof Error) throw step;
          if (typeof step === "function") return step(call);
          return typeof step === "string" ? message(step) : step;
        },
      },
    },
  };
  return { client, calls };
}

/** Every object in a strict schema closes and lists every property as required; no unsupported constraints. */
function strictProblems(schema: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as Record<string, unknown>;
  const out: string[] = [];
  for (const banned of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "pattern", "$ref", "$defs"]) {
    if (banned in s) out.push(`${path}: ${banned}`);
  }
  if (s.type === "object") {
    if (s.additionalProperties !== false) out.push(`${path}: additionalProperties`);
    const props = Object.keys((s.properties ?? {}) as object);
    const required = (s.required ?? []) as string[];
    for (const p of props) if (!required.includes(p)) out.push(`${path}.${p}: not required`);
  }
  for (const [k, v] of Object.entries(s)) {
    if (k === "enum") continue;
    if (Array.isArray(v)) v.forEach((x, i) => out.push(...strictProblems(x, `${path}.${k}[${i}]`)));
    else if (v && typeof v === "object") out.push(...strictProblems(v, `${path}.${k}`));
  }
  return out;
}

describe("the app's vocabulary and the schema", () => {
  it("takes echo names, set names and stat labels from the registry and the stat tables", () => {
    const v = visionVocab();
    expect(v.echoLabels.length).toBeGreaterThan(200);
    expect(v.echoLabels).toContain("Sabercat Prowler");
    expect(v.echoLabels).toContain("Phantom: Crownless");
    expect(v.setLabels).toContain("Sound of True Name");
    expect(v.setLabels).toContain("Havoc Eclipse");
    expect(v.statLabels).toEqual(expect.arrayContaining(["ATK", "HP", "DEF", "Crit. Rate", "Crit. DMG", "Energy Regen", "Healing Bonus", "Glacio DMG Bonus", "Resonance Liberation DMG Bonus"]));
    expect(v.statLabels).not.toContain("Echo DMG Bonus");
  });

  it("is a strict structured-output schema, byte-stable between calls", () => {
    expect(strictProblems(echoReadSchema())).toEqual([]);
    expect(strictProblems(setMatchSchema([["SongofFeatheredTrace", "FlowerofTingedYearning"]]))).toEqual([]);
    expect(JSON.stringify(echoReadSchema())).toBe(JSON.stringify(echoReadSchema()));
    const item = (echoReadSchema() as any).properties.echoes.items;
    expect(item.properties.echo.anyOf[0].enum).toContain("Thousand-Puppet Pavilion");
    expect(item.properties.substats.items.properties.type.enum).toContain("Basic Attack DMG Bonus");
  });

  it("limits each echo's set answer to its own candidates", () => {
    const schema = setMatchSchema([["SongofFeatheredTrace", "FlowerofTingedYearning"], ["CelestialLight", "HavocEclipse"]]) as any;
    expect(schema.required).toEqual(["echo_1", "echo_2"]);
    expect(schema.properties.echo_1.properties.set.enum).toEqual(["Song of Feathered Trace", "Flower of Tinged Yearning", NONE_OF_THESE]);
    expect(schema.properties.echo_2.properties.set.enum).toEqual(["Celestial Light", "Havoc Eclipse", NONE_OF_THESE]);
  });
});

describe("requests", () => {
  it("sends the image first, structured output and the vision effort; no thinking or sampling parameters", () => {
    const params = buildReadParams(image(), { model: "claude-opus-5-5", effort: "low" }) as any;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(16000);
    expect(params.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: echoReadSchema() } });
    for (const banned of ["thinking", "temperature", "top_p", "top_k", "tool_choice", "tools"]) expect(params).not.toHaveProperty(banned);
    expect(params.system).toBe(VISION_SYSTEM_PROMPT);
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    const [img, text] = params.messages[0].content;
    expect(img).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
    expect(text.text).toContain("2576×1189 px (scaled down from 3120×1440)");
  });

  it("sends no refusal fallback for Haiku", () => {
    const params = buildReadParams(image(), { model: "claude-haiku-5-5", effort: "medium" }) as any;
    expect(params).not.toHaveProperty("betas");
    expect(params).not.toHaveProperty("fallbacks");
    expect(params.output_config.effort).toBe("medium");
  });

  it("labels each candidate set's icon, by URL from the app's own set-image map", () => {
    const params = buildSetMatchParams(
      [
        { echoName: "Thousand-Puppet Pavilion", candidates: ["SongofFeatheredTrace", "FlowerofTingedYearning"], crop: image({ data: "Q1JPUA==", mediaType: "image/png" }) },
        { echoName: "Havoc Warrior", candidates: ["CelestialLight", "HavocEclipse"], crop: null },
      ],
      image(),
      { model: "claude-opus-5-5", effort: "low" },
    ) as any;
    const content = params.messages[0].content as Array<Record<string, any>>;
    // the whole screenshot once (echo 2 has no crop), then each echo's glyph and candidates
    expect(content[0]).toEqual({ type: "text", text: "The screenshot:" });
    expect(content[1].source).toEqual({ type: "base64", media_type: "image/jpeg", data: "QUJD" });
    const urls = content.filter((b) => b.type === "image" && b.source.type === "url").map((b) => b.source.url);
    expect(urls).toEqual([echoSetImageMap.SongofFeatheredTrace, echoSetImageMap.FlowerofTingedYearning, echoSetImageMap.CelestialLight, echoSetImageMap.HavocEclipse]);
    // Havoc Eclipse's icon file is SunSinkingEclipse.webp: the map, not a guessed <Set>.webp pattern
    expect(urls[3]).toMatch(/SunSinkingEclipse\.webp$/);
    const labels = content.filter((b) => b.type === "text").map((b) => b.text);
    expect(labels).toEqual(expect.arrayContaining(["Song of Feathered Trace:", "Havoc Eclipse:", "Candidate sets for echo 2:"]));
    expect(content.find((b) => b.source?.data === "Q1JPUA==")).toBeTruthy();
    expect(params.output_config.format.schema.properties.echo_2.properties.set.enum).toContain("Havoc Eclipse");
    expect(params.max_tokens).toBe(4000);
  });
});

describe("responses", () => {
  it("reads the structured JSON after the thinking block", () => {
    const parsed = parseStructured(message("sabercat"));
    expect(parsed.ok).toBe(true);
    expect(echoesOf("sabercat")[0].printedName).toBe("Sabercat Prowler");
  });

  it("turns a refusal, a cut-off answer, bad JSON and a wrong shape into failures", () => {
    const refusal = parseStructured(message("refusal"));
    expect(refusal).toMatchObject({ ok: false, kind: "refusal" });
    expect(!refusal.ok && refusal.message).toContain("declined to read this screenshot");
    expect(parseStructured(message("truncated"))).toMatchObject({ ok: false, kind: "truncated" });
    const bad = message("sabercat");
    (bad.content[1] as { text: string }).text = "{not json";
    expect(parseStructured(bad)).toMatchObject({ ok: false, kind: "unreadable" });
    expect(parseStructured({ ...message("sabercat"), content: [] })).toMatchObject({ ok: false, kind: "no_output" });
    expect(readPayloadOf({ screen: "x" })).toBeNull();
    expect(readPayloadOf({ screen: "x", echoes: [{ printedName: 7, setGlyphBox: { x: 2333, y: 260, width: 52, height: 48 }, confidence: 4 }] })?.echoes[0]).toMatchObject({
      printedName: "",
      setGlyphBox: null, // pixels, not fractions: unusable
      confidence: 1,
      setSource: "not_visible",
      substats: [],
    });
  });

  it("parses printed values strictly", () => {
    expect(parsePrinted("8.6%")).toEqual({ num: 8.6, pct: true });
    expect(parsePrinted(" 50 ")).toEqual({ num: 50, pct: false });
    expect(parsePrinted("2,280")).toEqual({ num: 2280, pct: false });
    expect(parsePrinted("10,9%")).toEqual({ num: 10.9, pct: true });
    expect(parsePrinted("1O.9%")).toBeNull();
    expect(parsePrinted("+25")).toBeNull();
  });
});

describe("mapping and the OCR path's checks", () => {
  it("maps a clean read onto the importer's record, in the same shape the OCR emits", () => {
    const read = mapClaudeEcho(echoesOf("sabercat")[0], "shot.jpg");
    expect(read.blocking).toBe(false);
    expect(read.setPending).toBeNull();
    expect(read.record).toMatchObject({ file: "shot.jpg", echo: "SabercatProwler", set: "SoundofTrueName", cost: 3, level: 25, rank: 5, main: ["ATK", "30.0%"], flags: [] });
    expect(read.record.subs).toEqual([
      ["CritRate", "9.3%"],
      ["HP", "10.9%"],
      ["BasicAttackDMGBonus", "8.6%"],
      ["EnergyRegen", "7.6%"],
      ["ResonanceLiberationDMGBonus", "10.9%"],
    ]);
    expect(toParsedEcho(read.record)).toEqual({
      cost: 3,
      rank: 5,
      mainStatLabel: "ATK",
      substats: [
        { subStat: "Crit. Rate", subStatValue: "9.3%" },
        { subStat: "HP", subStatValue: "10.9%" },
        { subStat: "Basic Attack DMG Bonus", subStatValue: "8.6%" },
        { subStat: "Energy Regen", subStatValue: "7.6%" },
        { subStat: "Resonance Liberation DMG Bonus", subStatValue: "10.9%" },
      ],
      echo: "SabercatProwler",
      set: "SoundofTrueName",
    });
  });

  it("flags impossible values and never corrects them", () => {
    const read = mapClaudeEcho(echoesOf("impossible")[0], "blurry.jpg");
    expect(read.blocking).toBe(true);
    const flags = read.record.flags.join("\n");
    expect(flags).toContain("main Crit. DMG 40.0% isn't the max-level value 44.0% for a 5★ cost-4 echo");
    expect(flags).toContain("second row ATK 100 isn't the fixed ATK 150");
    expect(flags).toContain("substat Crit. Rate 8.8% isn't a legal roll");
    expect(flags).toContain("substat ATK (flat) 55 isn't a legal roll (legal: 30 / 40 / 50 / 60)");
    expect(flags).toContain("substat Crit. Rate appears twice");
    expect(flags).toContain('substat HP: value "1O.9%" unreadable');
    expect(flags).toContain("6 substats listed; an echo has at most 5");
    expect(flags).toContain("Claude's confidence is low (0.41): check every value");
    expect(flags).not.toContain("on a +25 echo: one unlocks"); // the count is flagged once
    // exactly as read: nothing snapped to the nearest legal roll
    expect(read.record.subs).toEqual([
      ["CritRate", "8.8%"],
      ["ATK_FLAT", "55"],
      ["CritRate", "6.3%"],
      ["HP", "1O.9%"],
      ["EnergyRegen", "9.2%"],
    ]);
    expect(read.record.main).toEqual(["CritDMG", "40.0%"]);
  });

  it("checks the main stat is legal for the cost and the substat count against the level", () => {
    const base = echoesOf("sabercat")[0];
    const wrongMain = mapClaudeEcho({ ...base, mainStat: { type: "Crit. Rate", value: "22.0%" } }, "x");
    expect(wrongMain.blocking).toBe(true);
    expect(wrongMain.record.flags).toContain("Crit. Rate isn't a legal main stat for a cost-3 echo");
    const young = mapClaudeEcho({ ...base, level: 10 }, "x");
    expect(young.blocking).toBe(true);
    expect(young.record.flags).toContain("5 substats on a +10 echo: one unlocks every 5 levels");
    const flatMain = mapClaudeEcho({ ...base, mainStat: { type: "ATK", value: "30" } }, "x");
    expect(flatMain.record.flags.some((f) => f.includes("has no % sign"))).toBe(true);
    const untuned = mapClaudeEcho({ ...base, substats: base.substats.slice(0, 3) }, "x");
    expect(untuned.blocking).toBe(false);
    expect(untuned.record.flags).toContain("only 3 substats on a +25 echo (untuned slots, or rows missed)");
  });

  it("guesses the rarity from the main stat's max-level value when it isn't shown", () => {
    const base = echoesOf("sabercat")[0];
    expect(mapClaudeEcho({ ...base, rarity: null }, "x").record).toMatchObject({ rank: 5, flags: [] });
    const purple = mapClaudeEcho({ ...base, rarity: null, level: 20, mainStat: { type: "ATK", value: "18.9%" }, secondaryStat: { type: "ATK", value: "63" }, substats: base.substats.slice(0, 4) }, "x");
    expect(purple.record.rank).toBe(4);
    expect(purple.record.flags).toEqual([]);
  });

  it("rejects an echo name the app doesn't know, and fuzzily matches a printed one with a flag", () => {
    const [unknown, fuzzy] = echoesOf("unknownEcho");
    const rejected = mapClaudeEcho(unknown, "x");
    expect(rejected.blocking).toBe(true);
    expect(rejected.record.echo).toBeNull();
    expect(rejected.record.flags[0]).toBe('unknown echo name "Mecha Godzilla" — not in the app\'s echo list');
    const matched = mapClaudeEcho(fuzzy, "y");
    expect(matched.record.echo).toBe("SabercatProwler");
    expect(matched.blocking).toBe(false);
    expect(matched.record.flags[0]).toMatch(/^Claude didn't match "Sabercat Prowlr" to an echo; the closest name is Sabercat Prowler \(0\.9\d\)$/);
    const nothing = mapClaudeEcho({ ...fuzzy, printedName: "Zzzqx" }, "z");
    expect(nothing.blocking).toBe(true);
    expect(nothing.record.flags[0]).toBe('echo not identified (printed "Zzzqx")');
  });

  it("takes a printed set only when the registry allows it, else asks for the glyph", () => {
    const puppet = echoesOf("puppetGlyph")[0];
    const pending = mapClaudeEcho(puppet, "p");
    expect(pending.record.set).toBeNull();
    expect(pending.setPending).toEqual({ candidates: ["SongofFeatheredTrace", "FlowerofTingedYearning"], box: { x: 0.7478, y: 0.1806, width: 0.0167, height: 0.0333 } });
    const wrong = mapClaudeEcho({ ...puppet, set: "Sound of True Name", setSource: "printed" }, "p");
    expect(wrong.record.flags).toContain("set Sound of True Name isn't one of Thousand-Puppet Pavilion's sets (Song of Feathered Trace, Flower of Tinged Yearning)");
    expect(wrong.setPending?.candidates).toEqual(["SongofFeatheredTrace", "FlowerofTingedYearning"]);
    const hidden = mapClaudeEcho({ ...puppet, setSource: "not_visible", setGlyphBox: null }, "p");
    expect(hidden.setPending).toBeNull();
    expect(hidden.record.flags).toContain("set unknown (allowed Song of Feathered Trace, Flower of Tinged Yearning)");
    // a single-set echo needs no glyph
    const [crownless] = echoesOf("pcTwoEchoes");
    expect(mapClaudeEcho(crownless, "c").record).toMatchObject({ echo: "PhantomCrownless", set: "HavocEclipse" });
  });

  it("applies the glyph pass's pick, or flags it", () => {
    const puppet = echoesOf("puppetGlyph")[0];
    const picked = mapClaudeEcho(puppet, "p");
    applySetMatch(picked, { set: "Song of Feathered Trace", confidence: 0.88 });
    expect(picked.record.set).toBe("SongofFeatheredTrace");
    expect(picked.record.flags).toEqual([]);
    const none = mapClaudeEcho(puppet, "p");
    applySetMatch(none, { set: NONE_OF_THESE, confidence: 0.3 });
    expect(none.record.set).toBeNull();
    expect(none.record.flags).toContain("set glyph didn't match any of Song of Feathered Trace, Flower of Tinged Yearning");
    const unsure = mapClaudeEcho(puppet, "p");
    applySetMatch(unsure, { set: "Flower of Tinged Yearning", confidence: 0.4 });
    expect(unsure.record.set).toBe("FlowerofTingedYearning");
    expect(unsure.record.flags).toContain("set Flower of Tinged Yearning matched from the glyph with low confidence (0.40)");
    const outside = mapClaudeEcho(puppet, "p");
    applySetMatch(outside, { set: "Havoc Eclipse", confidence: 0.9 });
    expect(outside.record.set).toBeNull();
    expect(outside.record.flags).toContain("set Havoc Eclipse from the glyph isn't one of Song of Feathered Trace, Flower of Tinged Yearning");
  });

  it("flags where the OCR and Claude disagree (a Phantom skin is the same echo)", () => {
    const claude = mapClaudeEcho(echoesOf("sabercat")[0], "s").record;
    const ocr: ScanRecord = { ...claude, subs: claude.subs.map(([k, v]) => (k === "CritRate" ? [k, "9.9%"] : [k, v])), flags: [] };
    expect(compareWithOcr(claude, ocr)).toEqual(["substats differ — OCR: Crit. Rate 9.9%; Claude: Crit. Rate 9.3%"]);
    expect(compareWithOcr(claude, { ...claude, set: "PactofNeonlightLeap" })).toEqual(["set: OCR read Pact of Neonlight Leap, Claude read Sound of True Name"]);
    const phantom = { ...claude, echo: "PhantomCrownless", echoName: "Phantom: Crownless" };
    expect(compareWithOcr(phantom, { ...claude, echo: "Crownless", echoName: "Crownless" })).toEqual([]);
  });
});

describe("readEchoesWithClaude", () => {
  it("reads a screenshot, then matches its set glyph from a crop in a second request", async () => {
    const shot = image();
    const { client, calls } = scripted(["puppetGlyph", "puppetSetPick"]);
    const [result] = await readEchoesWithClaude([visionImage("puppet.jpg", shot)], { client, model: "claude-opus-5-5", effort: "low" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.echoes).toHaveLength(1);
    const { record, blocking } = result.echoes[0];
    expect(blocking).toBe(false);
    expect(record).toMatchObject({ echo: "ThousandPuppetPavilion", set: "SongofFeatheredTrace", main: ["CritDMG", "44.0%"], flags: [] });
    expect(record.subs).toEqual([
      ["CritDMG", "19.8%"],
      ["HP", "10.9%"],
      ["HeavyAttackDMGBonus", "8.6%"],
      ["ATK", "8.6%"],
      ["EnergyRegen", "9.2%"],
    ]);
    expect(calls).toHaveLength(2);
    expect(shot.crop).toHaveBeenCalledWith({ x: 0.7478, y: 0.1806, width: 0.0167, height: 0.0333 });
    const second = calls[1].params.messages[0].content as Array<Record<string, any>>;
    expect(second.some((b) => b.type === "image" && b.source.type === "base64" && b.source.data === "R0xZUEg=")).toBe(true);
    expect(second.some((b) => b.type === "image" && b.source.data === "QUJD")).toBe(false); // the crop, not the whole shot again
    // both requests priced: 6512 in + 912 out, then 742 + 188, at Opus 5.5's $4 / $20
    expect(result.usage.requests).toBe(2);
    expect(result.usage.costUsd).toBeCloseTo((6512 * 4 + 912 * 20 + 742 * 4 + 188 * 20) / 1e6, 8);
    expect(shot.dispose).toHaveBeenCalled();
  });

  it("splits a page with two echoes; the one without a crop gets the whole screenshot in the glyph pass", async () => {
    const { client, calls } = scripted(["pcTwoEchoes", "pcSetPick"]);
    const [result] = await readEchoesWithClaude([visionImage("pc.png")], { client, model: "claude-sonnet-5-5", effort: "low" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.screen).toContain("PC");
    expect(result.echoes.map((e) => e.record.file)).toEqual(["pc.png · 1/2", "pc.png · 2/2"]);
    expect(result.echoes.map((e) => [e.record.echo, e.record.set, e.equippedBy])).toEqual([
      ["PhantomCrownless", "HavocEclipse", "Rover"],
      ["HavocWarrior", "HavocEclipse", "Rover"],
    ]);
    expect(result.echoes[1].record.subs).toEqual([
      ["CritRate", "8.1%"],
      ["ATK_FLAT", "40"],
      ["HP_FLAT", "390"],
      ["DEF", "11.8%"],
      ["EnergyRegen", "6.8%"],
    ]);
    expect(result.echoes.every((e) => !e.blocking && e.record.flags.length === 0)).toBe(true);
    // only Havoc Warrior needed the glyph pass; it had no box, so the screenshot goes along
    const schema = calls[1].params.output_config?.format?.schema as any;
    expect(schema.required).toEqual(["echo_1"]);
    expect((calls[1].params.messages[0].content as any[])[0]).toEqual({ type: "text", text: "The screenshot:" });
    expect(calls[1].params.model).toBe("claude-sonnet-5-5");
  });

  it("keeps the read when the glyph pass fails, with a flag", async () => {
    const { client } = scripted(["puppetGlyph", new sdk.InternalServerError(500, { type: "error", error: { type: "api_error", message: "boom" } }, "boom", new Headers())]);
    const [result] = await readEchoesWithClaude([visionImage("p")], { client, sdk, model: "claude-opus-5-5", effort: "low" });
    if (!result.ok) throw new Error("expected a read");
    expect(result.echoes[0].record.set).toBeNull();
    expect(result.echoes[0].record.flags).toEqual(["set glyph not matched: Anthropic had a server error. Try again."]);
  });

  it("reports a refusal, a cut-off answer and a typed API error per screenshot", async () => {
    const rateLimited = new sdk.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", new Headers());
    const { client } = scripted(["refusal", "truncated", rateLimited, "noEchoes"]);
    const results = await readEchoesWithClaude([visionImage("a"), visionImage("b"), visionImage("c"), visionImage("d")], { client, sdk, model: "claude-opus-5-5", effort: "low", concurrency: 1 });
    expect(results[0]).toMatchObject({ ok: false, error: { kind: "refusal", retryable: false } });
    expect(results[1]).toMatchObject({ ok: false, error: { kind: "truncated", retryable: true } });
    expect(results[2]).toMatchObject({ ok: false, error: { kind: "api", message: "Rate limited by Anthropic. Wait a moment and try again.", retryable: true } });
    expect(results[3]).toMatchObject({ ok: true, echoes: [] });
    expect(results[0].usage.requests).toBe(1); // a refused request is still billed
  });

  it("keeps at most two screenshots in flight and reports each as it finishes", async () => {
    let inFlight = 0;
    let peak = 0;
    const answer = async (): Promise<BetaMessage> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return message("sabercat");
    };
    const { client } = scripted([answer, answer, answer, answer, answer]);
    const done: number[] = [];
    const results = await readEchoesWithClaude(
      ["1", "2", "3", "4", "5"].map((n) => visionImage(n)),
      { client, model: "claude-opus-5-5", effort: "low", onImageDone: (_i, _r, index) => done.push(index) },
    );
    expect(peak).toBe(2);
    expect(results.every((r) => r.ok)).toBe(true);
    expect([...done].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("stops on abort: requests in flight are cancelled, the rest never start", async () => {
    const controller = new AbortController();
    const hang = (call: Call): Promise<BetaMessage> =>
      new Promise((_, reject) => {
        call.signal?.addEventListener("abort", () => reject(new sdk.APIUserAbortError()));
        if (call.params) setTimeout(() => controller.abort(), 0);
      });
    const { client, calls } = scripted([hang, hang, hang, hang]);
    const started: number[] = [];
    const results = await readEchoesWithClaude(
      ["1", "2", "3", "4"].map((n) => visionImage(n)),
      { client, sdk, model: "claude-opus-5-5", effort: "low", signal: controller.signal, onImageStart: (_i, index) => started.push(index) },
    );
    expect(calls).toHaveLength(2);
    expect(started).toEqual([0, 1]);
    expect(results.map((r) => (r.ok ? "ok" : `${r.error.kind}${r.skipped ? "/skipped" : ""}`))).toEqual(["aborted", "aborted", "aborted/skipped", "aborted/skipped"]);
  });
});

describe("cost estimate", () => {
  it("prices a phone shot at ≈3.9K image tokens once downscaled to 2576 px", () => {
    expect(VISION_LONG_EDGE).toBe(2576);
    expect(imageTokens(3120, 1440)).toBe(Math.ceil((2576 * 1189) / 784));
    expect(imageTokens(1920, 1080)).toBe(Math.ceil((1920 * 1080) / 784));
    expect(imageTokens(8000, 8000)).toBe(Math.ceil((1936 * 1936) / 784)); // 3.75 MP → 1936², just under the 4784 cap
    // the 3.75 MP limit binds before the long edge on a near-square shot (a tablet), never upscales a small one
    expect(visionSize(2560, 2560)).toEqual({ width: 1936, height: 1936 });
    expect(visionSize(3120, 1440)).toEqual({ width: 2576, height: 1189 });
    expect(visionSize(800, 600)).toEqual({ width: 800, height: 600 });
    const square = visionSize(2560, 2560);
    expect(square.width * square.height).toBeLessThanOrEqual(VISION_MAX_PIXELS);
    const opus = estimateVisionCost([{ width: 3120, height: 1440 }, null], "claude-opus-5-5");
    expect(opus.count).toBe(2);
    expect(opus.imageTokens).toBe(imageTokens(3120, 1440)); // an unknown size counts as a phone shot
    expect(opus.perImageUsd).toBeGreaterThan(0.04);
    expect(opus.perImageUsd).toBeLessThan(0.08);
    const haiku = estimateVisionCost([{ width: 3120, height: 1440 }], "claude-haiku-5-5");
    expect(haiku.usd).toBeLessThan(opus.perImageUsd / 20);
    expect(estimateVisionCost([], "claude-opus-5-5")).toMatchObject({ count: 0, usd: 0, perImageUsd: 0 });
  });
});

describe("crops and rows", () => {
  it("pads a glyph box to a square around its centre, inside the image", () => {
    const r = glyphCropRegion({ x: 0.7478, y: 0.1806, width: 0.0167, height: 0.0333 }, 3120, 1440);
    expect(r.width).toBe(r.height);
    expect(r.width).toBeGreaterThan(150);
    expect(r.x).toBeLessThan(2333);
    expect(r.x + r.width).toBeGreaterThan(2385);
    const corner = glyphCropRegion({ x: 0.99, y: 0.99, width: 0.01, height: 0.01 }, 1000, 500);
    expect(corner.x + corner.width).toBeLessThanOrEqual(1000);
    expect(corner.y + corner.height).toBeLessThanOrEqual(500);
  });

  it("offers Claude the rows that need a look, or every unread row", () => {
    const file = new File(["x"], "a.jpg");
    const ok = newScanItem({ file, name: "ok", status: "done", record: { flags: [], echo: "X" } as unknown as ScanRecord });
    const flagged = newScanItem({ file, name: "flagged", status: "done", record: { flags: ["row 3 unreadable"], echo: "X" } as unknown as ScanRecord });
    const unsupported = newScanItem({ file, name: "pc", status: "unsupported" });
    const queued = newScanItem({ file, name: "queued" });
    const read = newScanItem({ file, name: "read", claudeState: "done", source: "claude" });
    const failed = newScanItem({ file, name: "retry", status: "done", record: { flags: [], echo: "X" } as unknown as ScanRecord, claudeState: "error" });
    const noImage = newScanItem({ file: null, name: "gone", status: "error" });
    const items = [ok, flagged, unsupported, queued, read, failed, noImage];
    expect(needsALook(flagged)).toBe(true);
    expect(needsALook(queued)).toBe(false);
    expect(claudeCandidates(items, "flagged").map((i) => i.name)).toEqual(["flagged", "pc", "retry"]);
    expect(claudeCandidates(items, "all").map((i) => i.name)).toEqual(["ok", "flagged", "pc", "queued", "retry"]);
  });
});
