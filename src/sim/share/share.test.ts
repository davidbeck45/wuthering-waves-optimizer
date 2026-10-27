// Wuthering Tools+ share cards: the PNG chunk, the share format, the link, the merge plan — on the Cartethyia
// account fixture (one full build, 17 inventory echoes, one saved rotation).
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { buildCharacterCalculationContext, resolveCharacterEchoes } from "../../calculator/buildCharacterContext";
import { crc32, iTxtKeywords, MAX_CHUNK_BYTES, pngChunks, readITxt, writeITxt } from "./pngMeta";
import {
  buildPayload,
  echoProblem,
  fromTacetCard,
  localDate,
  parseSharePayload,
  SHARE_KEYWORD,
  shareEchoOf,
  TACET_KEYWORD,
  teamPayload,
  withDetail,
  type SharePayload,
} from "./buildCodec";
import { decodeFragment, encodeFragment, fragmentOf, LINK_LIMIT, readShareLink, shareLink } from "./link";
import { applyImport, echoFingerprint, planImport, sharedBuildName } from "./mergePreview";
import { buildHeadline, charactersWithBuild } from "./headline";
import { withFrameFallback } from "./capture";
import { RANKING_ENEMY, scoreRotation } from "../myRankings/rankRoster";

// a 1×1 PNG with valid CRCs (the sample in Tacet Lab's own test has a bad IDAT CRC, which its reader never checks)
const ONE_PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwzv79HwAFZwKxi3Sr1AAAAABJRU5ErkJggg==";
const png = (): Uint8Array => Uint8Array.from(atob(ONE_PX), (c) => c.charCodeAt(0));

const characters = account.characters as Record<string, any>;
const echoes = account.echoes as any[];
const cart = characters.Cartethyia;
const NOW = new Date(2026, 9, 26, 12, 0); // local noon: card dates are local (localDate)
let seq = 0;
const newId = (n: number) => `id${(seq++).toString(36)}`.padEnd(n, "x").slice(0, n);

describe("PNG iTXt chunk", () => {
  it("round-trips text before IEND with a valid CRC, compressed or not", async () => {
    for (const compress of [true, false]) {
      const out = await writeITxt(png(), "WTPlusBuild", '{"hello":"wörld"}', { compress });
      const chunks = pngChunks(out);
      expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "iTXt", "IEND"]);
      expect(chunks.every((c) => c.crcOk)).toBe(true);
      const read = await readITxt(out, "WTPlusBuild");
      expect(read?.text).toBe('{"hello":"wörld"}');
      expect(read?.compressed).toBe(compress);
      expect(iTxtKeywords(out)).toEqual(["WTPlusBuild"]);
    }
  });

  it("replaces an earlier chunk under the same keyword and leaves the image bytes alone", async () => {
    const once = await writeITxt(png(), "WTPlusBuild", "one");
    const twice = await writeITxt(once, "WTPlusBuild", "two");
    expect(iTxtKeywords(twice)).toEqual(["WTPlusBuild"]);
    expect((await readITxt(twice, "WTPlusBuild"))?.text).toBe("two");
    const idat = (b: Uint8Array) => pngChunks(b).find((c) => c.type === "IDAT")!.data.join(",");
    expect(idat(twice)).toBe(idat(png()));
  });

  it("ignores a corrupt chunk and still finds a good one after it", async () => {
    const good = await writeITxt(png(), "WTPlusBuild", "good", { compress: false });
    const chunk = pngChunks(good).find((c) => c.type === "iTXt")!;
    const corrupt = good.slice();
    corrupt[chunk.end - 6] ^= 0xff; // a text byte: the CRC no longer matches
    expect(pngChunks(corrupt).find((c) => c.type === "iTXt")!.crcOk).toBe(false);
    expect(await readITxt(corrupt, "WTPlusBuild")).toBeNull();
    // corrupt chunk first, then an intact one with the same keyword
    const both = new Uint8Array([...corrupt.subarray(0, chunk.end), ...good.subarray(chunk.start, chunk.end), ...good.subarray(chunk.end)]);
    expect((await readITxt(both, "WTPlusBuild"))?.text).toBe("good");
    // a truncated file reads as "no data", never throws
    expect(await readITxt(good.subarray(0, chunk.start + 20), "WTPlusBuild")).toBeNull();
  });

  it("refuses to write more than 16 KB and skips an oversized chunk on read", async () => {
    const big = "x".repeat(MAX_CHUNK_BYTES + 1);
    await expect(writeITxt(png(), "WTPlusBuild", big, { compress: false })).rejects.toThrow(/cap/);
    // compressed, the same text fits easily
    expect((await readITxt(await writeITxt(png(), "WTPlusBuild", big), "WTPlusBuild"))?.text).toBe(big);
    // hand-build an oversized uncompressed chunk: the reader must not take it
    const data = new TextEncoder().encode(`WTPlusBuild\0\0\0\0\0${big}`);
    const chunk = new Uint8Array(data.length + 12);
    new DataView(chunk.buffer).setUint32(0, data.length);
    chunk.set(new TextEncoder().encode("iTXt"), 4);
    chunk.set(data, 8);
    new DataView(chunk.buffer).setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
    const base = png();
    const iend = pngChunks(base).find((c) => c.type === "IEND")!;
    const oversized = new Uint8Array([...base.subarray(0, iend.start), ...chunk, ...base.subarray(iend.start)]);
    expect(pngChunks(oversized).find((c) => c.type === "iTXt")!.crcOk).toBe(true);
    expect(await readITxt(oversized, "WTPlusBuild")).toBeNull();
  });
});

/** Tacet Lab's own embed (card-metadata.ts embedCardMetadata), re-done byte for byte with its bitwise CRC. */
function tacetEmbed(card: unknown): Uint8Array {
  const crc = (bytes: Uint8Array) => {
    let c = -1;
    for (const byte of bytes) {
      c ^= byte;
      for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ -1) >>> 0;
  };
  const base = png();
  const end = pngChunks(base).find((c) => c.type === "IEND")!.start;
  const payload = new TextEncoder().encode("TacetLabCard\0\0\0\0\0" + JSON.stringify(card));
  const chunk = new Uint8Array(payload.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set(new TextEncoder().encode("iTXt"), 4);
  chunk.set(payload, 8);
  view.setUint32(chunk.length - 4, crc(chunk.subarray(4, chunk.length - 4)));
  return new Uint8Array([...base.subarray(0, end), ...chunk, ...base.subarray(end)]);
}

describe("Tacet Lab cards", () => {
  const card = {
    format: "tacet-lab-card",
    version: 1,
    characterCatalogId: "1409",
    characterLevel: 90,
    sequence: 2,
    skillLevels: [10, 9, 8, 7, 6],
    weaponCatalogId: "21020056",
    weaponLevel: 90,
    weaponRank: 1,
    echoes: [
      { name: "Reminiscence: Fleurdelys", cost: 4, rarity: 5, level: 25, sonata: "Windward Pilgrimage", mainStat: { key: "critRate", value: 22 }, subStats: [{ key: "critDamage", value: 21 }, { key: "atk", value: 40 }] },
      { name: "Not An Echo", cost: 1, rarity: 5, level: 25, sonata: "Windward Pilgrimage", mainStat: { key: "hpPercent", value: 22.8 }, subStats: [] },
      { name: "Phantom: Reminiscence: Fleurdelys", cost: 4, rarity: 5, level: 15, sonata: "Windward Pilgrimage", mainStat: { key: "critDamage", value: 30 }, subStats: [{ key: "energyRegen", value: 9.2 }] },
    ],
  };

  it("reads the TacetLabCard chunk and maps ids, names and stat keys onto the app's", async () => {
    const bytes = tacetEmbed(card);
    const read = await readITxt(bytes, TACET_KEYWORD);
    expect(read?.compressed).toBe(false);
    const { payload, warnings, error } = fromTacetCard(JSON.parse(read!.text));
    expect(error).toBeUndefined();
    const m = payload!.members[0];
    expect(payload!.origin).toBe("tacet-lab");
    expect(payload!.detail).toBe("gear");
    expect(m.charId).toBe("Cartethyia");
    expect(m.weapon).toEqual({ id: "DefiersThorn", level: 90, rank: 1 });
    expect(m.sequence).toBe(2);
    expect(m.talents).toEqual({ basic: 10, skill: 9, forte: 8, liberation: 7, intro: 6 });
    expect(m.echoes[0]).toEqual({ key: "ReminiscenceFleurdelys", set: "WindwardPilgrimage", cost: 4, rarity: 5, main: "CritRate", subs: [["CritDMG", 21], ["ATK_FLAT", 40]] });
    expect(m.echoes[1]).toBeNull(); // unknown echo → empty slot, with a warning
    expect(m.echoes[2]?.key).toBe("ReminiscenceFleurdelys"); // the "Phantom:" skin prefix is dropped
    expect(m.echoes[2]?.main).toBe("CritDMG");
    expect(warnings.some((w) => w.includes("Not An Echo"))).toBe(true);
    expect(warnings.some((w) => w.includes("+15"))).toBe(true);
  });

  it("refuses a character the app does not have and an unknown version", () => {
    expect(fromTacetCard({ ...card, characterCatalogId: "9999" }).error).toMatch(/isn't in this app/);
    expect(fromTacetCard({ ...card, version: 2 }).error).toMatch(/version 2/);
    expect(fromTacetCard({ format: "something-else" }).error).toBeTruthy();
  });
});

describe("share format", () => {
  it("inlines the five equipped echoes with their exact substats", () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW, app: "wtplus@test" });
    const resolved = resolveCharacterEchoes(cart.echoes, echoes);
    const m = payload.members[0];
    expect(m.echoes).toHaveLength(5);
    resolved.forEach((e, i) => expect(m.echoes[i]).toEqual(shareEchoOf(e)));
    // substats exact, in slot order
    expect(m.echoes[0]?.subs).toEqual([["HP", 8.6], ["CritRate", 10.5], ["HP_FLAT", 470], ["ResonanceLiberationDMGBonus", 9.4], ["CritDMG", 18.6]]);
    expect(m.weapon).toEqual({ id: "DefiersThorn", level: null, rank: 1 });
    expect(m.sequence).toBe(2);
    expect(m.mainEcho).toBe("ReminiscenceFleurdelys");
    // the config is every build field except the inventory pointers and bookkeeping
    expect(Object.keys(m.config!).sort()).toEqual(
      ["buffs", "echoSetBonus", "echoSetPassives", "mainEcho", "optimizer", "resonanceChains", "rotations", "teamBuffs", "weaponPassives"].sort(),
    );
  });

  it("round-trips through JSON and the validator unchanged", () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW, app: "wtplus@test" });
    const parsed = parseSharePayload(JSON.parse(JSON.stringify(payload)));
    expect(parsed.ok && !parsed.readOnly).toBe(true);
    if (!parsed.ok) return;
    const { origin, ...rest } = parsed.payload;
    expect(origin).toBe("wtplus");
    expect(rest).toEqual(payload);
  });

  it("gates on the version: a newer card is read-only, a broken one is refused", () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW });
    const newer = parseSharePayload({ ...payload, v: 2 });
    expect(newer.ok && newer.readOnly).toBe(true);
    if (newer.ok && newer.readOnly) {
      expect(newer.newerVersion).toBe(2);
      const plan = planImport(newer.payload, { characters: {}, echoes: [] }, { readOnly: true });
      expect(plan.canApply).toBe(false);
      expect(plan.blockers[0]).toMatch(/newer/);
    }
    expect(parseSharePayload({ ...payload, v: 0 }).ok).toBe(false);
    expect(parseSharePayload({ ...payload, format: "other" }).ok).toBe(false);
    expect(parseSharePayload({ ...payload, members: [] }).ok).toBe(false);
    expect(parseSharePayload({ ...payload, members: [{ ...payload.members[0], echoes: [{ key: "X" }] }] }).ok).toBe(false);
  });

  it("drops prototype keys from a hostile config", () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW });
    const raw = JSON.parse(JSON.stringify(payload));
    raw.members[0].config = JSON.parse('{"buffs":{"__proto__":{"polluted":true},"ok":{"isEnabled":true}}}');
    const parsed = parseSharePayload(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.prototype.hasOwnProperty.call(parsed.payload.members[0].config!.buffs, "__proto__")).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("drops never-shared and mis-shaped fields from a received config; the imported build keeps its own id", async () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW, app: "wtplus@test" });
    const raw = JSON.parse(JSON.stringify(payload));
    raw.members[0].config = {
      ...raw.members[0].config,
      id: "evil",
      name: "evil",
      createdAt: 1,
      builds: [{ id: "x" }],
      activeBuildId: "evil",
      characterLevel: "1",
      talents: { basic: "1" },
      customPortrait: "https://tracker.example/p.png",
      notes: "someone else's note",
      buffs: [1, 2],
      rotations: [{ name: "ok", actions: [{ key: "a" }, 5, null] }, "junk"],
    };
    const parsed = parseSharePayload(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const cfg = parsed.payload.members[0].config!;
    for (const k of ["id", "name", "createdAt", "builds", "activeBuildId", "characterLevel", "talents", "customPortrait", "notes", "buffs"]) expect(cfg).not.toHaveProperty(k);
    expect(cfg.rotations).toEqual([{ name: "ok", actions: [{ key: "a" }] }]);
    expect(cfg.resonanceChains).toEqual(payload.members[0].config!.resonanceChains);
    const empty = { characters: {}, echoes: [] as any[] };
    const result = await applyImport(parsed.payload, planImport(parsed.payload, empty, { now: NOW }), empty, { now: NOW, newId });
    const rec = result.characters.Cartethyia;
    expect(rec.builds).toHaveLength(1);
    expect(rec.builds[0].id).toBe(rec.activeBuildId);
    expect(rec.builds[0].id).not.toBe("evil");
    expect(rec.builds[0].name).toMatch(/^Shared · /);
    expect(rec.customPortrait).toBeUndefined();
  });

  it("never shares personal notes or progress checkmarks", () => {
    const record = { ...cart, notes: "my private note", progressOverrides: { ascension: true } };
    const payload = buildPayload("Cartethyia", record, null, echoes, { now: NOW });
    expect(payload.members[0].config).not.toHaveProperty("notes");
    expect(payload.members[0].config).not.toHaveProperty("progressOverrides");
    expect(JSON.stringify(payload)).not.toContain("my private note");
  });

  it("rides a full build inside a PNG chunk under the cap", async () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW, app: "wtplus@test" });
    const out = await writeITxt(png(), SHARE_KEYWORD, JSON.stringify(payload));
    const read = await readITxt(out, SHARE_KEYWORD);
    const parsed = parseSharePayload(JSON.parse(read!.text));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.payload.members[0].config).toEqual(payload.members[0].config);
  });

  it("carries a team: each member's build and the team's actions", () => {
    const team = { id: "t1", name: "Solo", characterIds: ["Cartethyia", null, null], buildIds: [null, null, null], actions: [{ slot: 0, order: 1, key: "X" }], duration: 20 };
    const payload = teamPayload(team, characters, echoes, { now: NOW });
    expect(payload.kind).toBe("team");
    expect(payload.members.map((m) => m.charId)).toEqual(["Cartethyia"]);
    expect(payload.team).toMatchObject({ name: "Solo", characterIds: ["Cartethyia", null, null], duration: 20 });
    expect(withDetail(payload, "gear").team).toEqual({ name: "Solo", characterIds: ["Cartethyia", null, null] });
  });
});

describe("share link", () => {
  it("fits one build in a chat message (deflate-raw + base64url in the fragment)", async () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW, app: "wtplus@test" });
    const link = await shareLink(payload, "https://wuthering-tools-plus.vercel.app");
    expect(link).not.toBeNull();
    expect(link!.length).toBeLessThanOrEqual(LINK_LIMIT);
    expect(link!.url.startsWith("https://wuthering-tools-plus.vercel.app/share#b=")).toBe(true);
    // the gear-only tier — what the spec measured at ~670 characters
    const gear = await shareLink(withDetail(payload, "gear"), "https://wuthering-tools-plus.vercel.app");
    expect(gear!.length).toBeLessThan(900);
    console.info(`share link: ${link!.detail} ${link!.length} chars (full would be ${link!.fullLength}); gear ${gear!.length}`);
    const back = await readShareLink(link!.url);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.payload.members[0].echoes).toEqual(payload.members[0].echoes);
  });

  it("finds the fragment in a link, a bare #b= or the value alone, and reports a cut-off link", async () => {
    const payload = buildPayload("Cartethyia", cart, null, echoes, { now: NOW, detail: "gear" });
    const frag = await encodeFragment(payload);
    expect(fragmentOf(`https://x.app/share#b=${frag}`)).toBe(frag);
    expect(fragmentOf(`#b=${frag}`)).toBe(frag);
    expect(fragmentOf(frag)).toBe(frag);
    expect(fragmentOf("hello")).toBeNull();
    expect(await decodeFragment(frag)).toEqual(JSON.parse(JSON.stringify(payload)));
    const cut = await readShareLink(`#b=${frag.slice(0, frag.length - 40)}`);
    expect(cut.ok).toBe(false);
  });
});

describe("merge preview", () => {
  const payload = (): SharePayload => buildPayload("Cartethyia", cart, null, echoes, { now: NOW, app: "wtplus@test" });

  it("matches echoes the account already owns by fingerprint", () => {
    const plan = planImport(payload(), { characters, echoes }, { now: NOW });
    expect(plan.canApply).toBe(true);
    expect(plan.owned).toBe(5);
    expect(plan.added).toBe(0);
    const m = plan.members[0];
    expect(m.status).toBe("add-build");
    expect(m.buildName).toBe("Shared · 2026-10-26");
    expect(m.echoes.map((e) => e.echoId)).toEqual(resolveCharacterEchoes(cart.echoes, echoes).map((e) => e.echoId));
    // the fingerprint ignores substat order and the "5" vs 5 rank spelling
    const e = { ...echoes[0], rank: String(echoes[0].rank), echoSubStatsType1: echoes[0].echoSubStatsType2, echoSubStatsValue1: echoes[0].echoSubStatsValue2, echoSubStatsType2: echoes[0].echoSubStatsType1, echoSubStatsValue2: echoes[0].echoSubStatsValue1 };
    expect(echoFingerprint(e)).toBe(echoFingerprint(echoes[0]));
    expect(echoFingerprint(shareEchoOf(echoes[0]))).toBe(echoFingerprint(echoes[0]));
  });

  it("adds a build without touching the active build, the live fields or the other builds", async () => {
    const withBuilds = { ...cart, builds: [{ id: "b0", name: "Default build", ...cart }], activeBuildId: "b0" };
    delete (withBuilds.builds[0] as any).builds;
    const before = JSON.parse(JSON.stringify(withBuilds));
    const acct = { characters: { Cartethyia: withBuilds }, echoes };
    const p = payload();
    const plan = planImport(p, acct, { now: NOW });
    expect(plan.members[0].activeBuildName).toBe("Default build");
    const result = await applyImport(p, plan, acct, { now: NOW, newId });
    const rec = result.characters.Cartethyia;
    expect(rec.activeBuildId).toBe("b0");
    expect(rec.builds).toHaveLength(2);
    expect(rec.builds[0]).toEqual(before.builds[0]);
    const { builds: _b, ...liveAfter } = rec;
    const { builds: _b2, ...liveBefore } = before;
    void _b;
    void _b2;
    expect(liveAfter).toEqual(liveBefore);
    expect(result.newEchoes).toEqual([]); // every echo already owned
    expect(rec.builds[1].echoes["0"].echoId).toBe(cart.echoes["0"].echoId);
    expect(withBuilds).toEqual(before); // inputs are never mutated
    expect(sharedBuildName(["Shared · 2026-10-26"], "2026-10-26")).toBe("Shared · 2026-10-26 2");
  });

  it("restores the build exactly in an empty account: same stats, same rotation damage", async () => {
    const p = payload();
    const empty = { characters: {}, echoes: [] as any[] };
    const plan = planImport(p, empty, { now: NOW });
    expect(plan.members[0].status).toBe("new-character");
    expect(plan.added).toBe(5);
    const result = await applyImport(p, plan, empty, { now: NOW, newId });
    const rec = result.characters.Cartethyia;
    expect(rec.activeBuildId).toBe(rec.builds[0].id);
    expect(result.newEchoes).toHaveLength(5);
    expect(Object.keys(result.equipped)).toHaveLength(5);
    const enemy = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };
    const original = await buildCharacterCalculationContext("Cartethyia", characters, enemy, echoes);
    const restored = await buildCharacterCalculationContext("Cartethyia", result.characters, enemy, result.newEchoes);
    expect(restored.finalStats).toEqual(original.finalStats);
    const rotation = { ...cart.rotations[0], actions: cart.rotations[0].actions };
    const a = await scoreRotation(rotation, "Cartethyia", characters, RANKING_ENEMY, echoes);
    const b = await scoreRotation(rotation, "Cartethyia", result.characters, RANKING_ENEMY, result.newEchoes);
    expect(b.avgDamage).toBe(a.avgDamage);
  });

  it("skips what the app lacks and says why", async () => {
    const p = payload();
    p.members[0] = { ...p.members[0], weapon: { id: "NoSuchWeapon", level: null, rank: 1 }, echoes: [{ key: "NoSuchEcho", set: null, cost: 4, rarity: 5, main: "CritRate", subs: [] }, ...p.members[0].echoes.slice(1)] };
    const plan = planImport(p, { characters: {}, echoes: [] }, { now: NOW });
    const m = plan.members[0];
    expect(m.weapon?.ok).toBe(false);
    expect(m.echoes[0].status).toBe("skipped");
    expect(m.notes.join(" ")).toMatch(/NoSuchWeapon/);
    const result = await applyImport(p, plan, { characters: {}, echoes: [] }, { now: NOW, newId });
    expect(result.characters.Cartethyia.weapon).toBeNull();
    expect(result.newEchoes).toHaveLength(4);
    const ghost = planImport({ ...p, members: [{ ...p.members[0], charId: "Lily" }] }, { characters: {}, echoes: [] });
    expect(ghost.members[0].status).toBe("skip");
    expect(ghost.canApply).toBe(false);
  });

  it("imports a gear-only card with its sequence switched on and its set bonuses derived", async () => {
    const p = withDetail(payload(), "gear");
    const plan = planImport(p, { characters: {}, echoes: [] }, { now: NOW });
    const result = await applyImport(p, plan, { characters: {}, echoes: [] }, { now: NOW, newId });
    const rec = result.characters.Cartethyia;
    expect(Object.entries(rec.resonanceChains).filter(([, v]: any) => v.isEnabled).map(([k]) => k).sort()).toEqual(
      ["SequenceNode1CrownDestinedbyFate", "SequenceNode2BladeBrokenbyTempest"],
    );
    expect(rec.echoSetBonus.setBonusTwo).toBe("Windward Pilgrimage 5 Set");
    expect(rec.mainEcho.echo).toBe("ReminiscenceFleurdelys");
  });
});

describe("capture", () => {
  it("fires a frame callback without rAF and restores the browser's functions after overlapping captures", async () => {
    const raf = window.requestAnimationFrame;
    const caf = window.cancelAnimationFrame;
    // a background tab: rAF never fires
    const stalled = (() => 1) as unknown as typeof window.requestAnimationFrame;
    window.requestAnimationFrame = stalled;
    try {
      let inner: Promise<void> | null = null;
      const fired: string[] = [];
      await withFrameFallback(async () => {
        inner = withFrameFallback(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => (fired.push("inner"), resolve()))));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => (fired.push("outer"), resolve())));
      });
      await inner;
      expect(fired.sort()).toEqual(["inner", "outer"]);
      expect(window.requestAnimationFrame).toBe(stalled);
      // a cancelled frame never runs
      let ran = false;
      await withFrameFallback(async () => {
        const id = window.requestAnimationFrame(() => (ran = true));
        window.cancelAnimationFrame(id);
        await new Promise((resolve) => setTimeout(resolve, 80));
      });
      expect(ran).toBe(false);
    } finally {
      window.requestAnimationFrame = raf;
      window.cancelAnimationFrame = caf;
    }
  });
});

describe("headline", () => {
  it("scores the build's best rotation at /my-rankings' enemy", async () => {
    const h = await buildHeadline("Cartethyia", characters, echoes);
    expect(h).not.toBeNull();
    expect(h!.headline.metric).toBe("dpr"); // no rotation here carries a duration
    expect(h!.headline.avgDamage).toBeGreaterThan(100000);
    expect(h!.headline.enemy).toBe("Lv 100 · 20 % RES");
    expect(h!.rotation.actions.length).toBeGreaterThan(0);
    expect(charactersWithBuild(characters, "Cartethyia", null)).toBe(characters);
  });
});

describe("hardening (verify pass)", () => {
  const base = (): SharePayload => buildPayload("Cartethyia", cart, null, echoes, { now: NOW, app: "wtplus@test" });

  it("dates a card in the player's own time zone, not UTC", () => {
    // 23:30 local on Oct 26: toISOString() would read Oct 27 anywhere west of UTC
    const late = new Date(2026, 9, 26, 23, 30);
    expect(buildPayload("Cartethyia", cart, null, echoes, { now: late }).createdAt).toBe("2026-10-26");
    expect(localDate(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });

  it("refuses an echo the game can't drop: bad rarity, a main stat with no value, an impossible roll", () => {
    const good = base().members[0].echoes[0]!;
    expect(echoProblem(good)).toBeNull();
    expect(echoProblem({ ...good, rarity: 9 })).toMatch(/rarity/);
    expect(echoProblem({ ...good, rarity: 1 })).toMatch(/main stat/); // statsTable has no 1★ main stat values
    expect(echoProblem({ ...good, subs: [["CritRate", 50]] })).toMatch(/isn't a roll/);
    expect(echoProblem({ ...good, subs: [["CritDMG", -3]] })).toMatch(/isn't a roll/);
    expect(echoProblem({ ...good, subs: [["CritRate", 10.5], ["ATK_FLAT", 60]] })).toBeNull(); // the top rolls are fine
    const p = base();
    p.members[0] = { ...p.members[0], echoes: [{ ...good, subs: [["CritRate", 500]] }, ...p.members[0].echoes.slice(1)] };
    const plan = planImport(p, { characters: {}, echoes: [] }, { now: NOW });
    expect(plan.members[0].echoes[0].status).toBe("skipped");
    expect(plan.added).toBe(4);
  });

  it("drops a received main echo the app doesn't have and keeps only plain enemy settings on a team", () => {
    const raw = JSON.parse(JSON.stringify(base()));
    raw.members[0].config.mainEcho = { echo: "NoSuchEcho", rank: 5 };
    const parsed = parseSharePayload(raw);
    expect(parsed.ok && parsed.payload.members[0].config).not.toHaveProperty("mainEcho");
    const team = { id: "t", name: "T", characterIds: ["Cartethyia", null, null], buildIds: [null, null, null], actions: [], duration: 20 };
    const t = JSON.parse(JSON.stringify(teamPayload(team, characters, echoes, { now: NOW })));
    t.team.enemyConfig = { enemyLevel: 100, enemyType: "Calamity", enemyResistByElement: { Aero: 0.2, junk: "x" }, evil: { nested: { deep: 1 } }, list: [1, 2] };
    const pt = parseSharePayload(t);
    expect(pt.ok && pt.payload.team?.enemyConfig).toEqual({ enemyLevel: 100, enemyType: "Calamity", enemyResistByElement: { Aero: 0.2 }, evil: {} });
  });

  it("imports a team as a new team pinned to the new builds; active builds stay; empty slots' actions are dropped", async () => {
    const withBuilds = { ...cart, builds: [{ id: "b0", name: "Default build" }], activeBuildId: "b0" };
    const acct = { characters: { Cartethyia: withBuilds }, echoes };
    const team = {
      id: "t1",
      name: "Solo",
      characterIds: ["Cartethyia", null, null],
      buildIds: [null, null, null],
      actions: [{ slot: 0, order: 1, key: "A" }, { slot: 1, order: 2, key: "B" }],
      duration: 20,
      enemyConfig: { enemyLevel: 100, enemyResist: 0.2, enemyType: "Calamity" },
    };
    const parsed = parseSharePayload(JSON.parse(JSON.stringify(teamPayload(team, characters, echoes, { now: NOW }))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planImport(parsed.payload, acct, { now: NOW });
    expect(plan.team).toEqual({ name: "Solo", slots: ["Cartethyia", null, null] });
    const result = await applyImport(parsed.payload, plan, acct, { now: NOW, newId });
    const rec = result.characters.Cartethyia;
    expect(rec.activeBuildId).toBe("b0");
    expect(rec.builds).toHaveLength(2);
    const newBuild = rec.builds[1];
    expect(result.team).toMatchObject({ name: "Solo (shared)", characterIds: ["Cartethyia", null, null], buildIds: [newBuild.id, null, null], duration: 20 });
    expect((result.team!.actions as any[]).map((a) => a.key)).toEqual(["A"]);
    expect(result.equipped).toEqual({}); // the active build is unchanged, so nothing is re-equipped
  });
});
