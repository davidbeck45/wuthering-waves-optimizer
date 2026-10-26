// Wuthering Tools+: the generated-name reader over every name the shipped generators wrote, plus the
// import / sync / old-stock shapes found in real exports.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeState, parsePresetName } from "./presetName";
import { characterPickerRoster } from "../../characters/characters";

const DATA = join(__dirname, "data");
const rotationNames: string[] = readdirSync(join(DATA, "rotations")).flatMap((f) =>
  (JSON.parse(readFileSync(join(DATA, "rotations", f), "utf8")) as Array<{ name: string }>).map((p) => p.name),
);
const teams = JSON.parse(readFileSync(join(DATA, "teams.json"), "utf8")) as Array<{ name: string; data: { characterIds: string[] } }>;
// the roster plus every character folder: a shipped preset can name a kit the roster still hides (Suoming,
// 2026-10 — the views only draw portraits for roster keys)
const appKeys = new Set([
  ...[...characterPickerRoster.five, ...characterPickerRoster.four].map((c) => c.key),
  ...readdirSync(join(__dirname, "../../characters"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name),
]);
// teammates only wuwa_calc has a kit for: Riley's rotations name them ("Galbrena … · Lily + Qiuyuan", 7bcbb24), the app
// has no folder, so the parser keeps the name and the views draw initials
const RILEY_ONLY = new Set(["Lily"]);

describe("parsePresetName", () => {
  it("reads every generated rotation preset into a short title, chips and known teammates", () => {
    expect(rotationNames.length).toBeGreaterThan(100);
    for (const name of rotationNames) {
      const p = parsePresetName(name);
      expect(p.generated, name).toBe(true);
      expect(p.kind, name).toBe("rotation");
      expect(p.full).toBe(name);
      expect(p.main, name).toBeTruthy();
      expect(p.teammates, name).toHaveLength(2);
      expect(p.title, name).toBe(`${p.main} · ${p.teammates.join(" + ")}`);
      expect(p.title.length, name).toBeLessThan(40);
      expect(p.title, name).not.toMatch(/wuwa_calc|S\dR\d|·.*·/);
      expect(p.chips.length, name).toBeGreaterThan(0);
      expect(p.chips[0].kind, name).toBe("own");
      expect(p.weapon, name).toMatch(/ R\d$/);
      for (const key of [p.mainKey!, ...p.teammateKeys]) expect(appKeys.has(key) || RILEY_ONLY.has(key), `${name}: ${key}`).toBe(true);
    }
  });

  it("reads every stock team preset, its members matching the preset's own character ids", () => {
    expect(teams.length).toBeGreaterThan(100);
    for (const t of teams) {
      const p = parsePresetName(t.name);
      expect(p.generated, t.name).toBe(true);
      expect(p.kind, t.name).toBe("team");
      expect(p.mainKey, t.name).toBe(t.data.characterIds[0]); // the main DPS sits in slot 0
      expect(new Set([p.mainKey, ...p.teammateKeys])).toEqual(new Set(t.data.characterIds));
      expect(p.title, t.name).not.toMatch(/wuwa_calc|S\dR\d/);
      expect(p.chips.length, t.name).toBeGreaterThan(0);
    }
  });

  it("splits an import's own state, the DPS state and the team tier", () => {
    const p = parsePresetName("Sigrika S6R2 Solsworn Ciphers R2 · Mornye + Lucilla · S6R2 DPS · S1R1/S0R1 team (wuwa_calc)");
    expect(p.title).toBe("Sigrika · Mornye + Lucilla");
    expect(p.teamLabel).toBe("Mornye + Lucilla");
    expect(p.teammateKeys).toEqual(["Mornye", "Lucilla"]);
    expect(p.weapon).toBe("Solsworn Ciphers R2");
    // the DPS state equals her own: one chip for both
    expect(p.chips.map((c) => c.label)).toEqual(["S6R2", "team S1R1/S0R1"]);

    const support = parsePresetName("Lynae S6R1 Spectrum Blaster R1 · Mornye + Aemeath · S6R5 DPS · S1R1/S6R1 team (wuwa_calc)");
    expect(support.title).toBe("Lynae · Mornye + Aemeath");
    expect(support.chips.map((c) => c.label)).toEqual(["S6R1", "DPS S6R5", "team S1R1/S6R1"]);
    expect(support.chips[0].title).toContain("Spectrum Blaster R1");
  });

  it("reads a stock preset's state off 'S6 <weapon> R5' and keeps an extra segment as a chip", () => {
    const p = parsePresetName("Aemeath S6 Everbright Polestar R5 · Mornye + Lynae · S6R5 (wuwa_calc)");
    expect(p.chips.map((c) => c.label)).toEqual(["S6R5"]);
    const danjin = parsePresetName("Danjin S6 Emerald Sentence R5 · Phrolova + Mornye · S6R5 · Moonlit Clouds 5pc (wuwa_calc)");
    expect(danjin.title).toBe("Danjin · Phrolova + Mornye");
    expect(danjin.chips.map((c) => c.label)).toEqual(["S6R5", "Moonlit Clouds 5pc"]);
    const chisa = parsePresetName("Chisa S0 Kumokiri R1 · Sanhua + Cartethyia · S6R1 DPS · S0R1 team (wuwa_calc)");
    expect(chisa.chips.map((c) => c.label)).toEqual(["S0R1", "DPS S6R1", "team S0R1"]);
  });

  it("reads the older import and team shapes", () => {
    const old = parsePresetName("Brant S6R5 · Mornye + Lupa (wuwa_calc)");
    expect(old.kind).toBe("rotation");
    expect(old.title).toBe("Brant · Mornye + Lupa");
    expect(old.weapon).toBeNull();
    expect(old.chips.map((c) => c.label)).toEqual(["S6R5"]);

    const team = parsePresetName("wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae");
    expect(team.kind).toBe("team");
    expect(team.title).toBe("Aemeath · Mornye + Lynae");
    expect(team.chips.map((c) => c.label)).toEqual(["DPS S6R5", "team S1R1/S6R1"]);

    const uniform = parsePresetName("wuwa_calc Camellya S6R5 · Shorekeeper + Sanhua");
    expect(uniform.chips.map((c) => c.label)).toEqual(["S6R5"]);

    // an old stock team lists Riley's slot order, which does not mark the main DPS (Carlotta sits in the middle)
    const stock = parsePresetName("Hiyuki + Carlotta + Lucilla · S6R5 (wuwa_calc t226)");
    expect(stock.kind).toBe("team");
    expect(stock.main).toBeNull();
    expect(stock.teammates).toEqual(["Hiyuki", "Carlotta", "Lucilla"]);
    expect(stock.title).toBe("Hiyuki + Carlotta + Lucilla");
    expect(stock.chips.map((c) => c.label)).toEqual(["S6R5", "t226"]);

    const xuanling = parsePresetName("Suisui + Chisa + Xuanling · S6R5 (wuwa_calc t188)");
    expect(xuanling.teammateKeys).toEqual(["Suisui", "Chisa", "YangyangXuanling"]);
  });

  it("reads '@ my account' as a mode chip, with its note in the tooltip", () => {
    const p = parsePresetName("Aemeath S6R5 Everbright Polestar R5 · Mornye + Lynae @ my account (S6R5 · S1R1/S6R1) (wuwa_calc)");
    expect(p.generated).toBe(true);
    expect(p.title).toBe("Aemeath · Mornye + Lynae");
    const mode = p.chips.find((c) => c.kind === "mode")!;
    expect(mode.label).toBe("My account");
    expect(mode.title).toContain("S6R5 · S1R1/S6R1");
    const team = parsePresetName("wuwa_calc Aemeath @ my account · Mornye + Lynae");
    expect(team.kind).toBe("team");
    expect(team.title).toBe("Aemeath · Mornye + Lynae");
    expect(team.chips.map((c) => c.label)).toEqual(["My account"]);
  });

  it("resolves a Rover form to the gender the account holds", () => {
    const name = "Cartethyia S6 Defier's Thorn R1 · Ciaccona + Aero Rover · S6R1 DPS · S0R1 team (wuwa_calc)";
    expect(parsePresetName(name).teammateKeys).toEqual(["Ciaccona", "RoverAeroFemale"]);
    expect(parsePresetName(name, { owned: ["RoverAeroMale", "Ciaccona"] }).teammateKeys).toEqual(["Ciaccona", "RoverAeroMale"]);
    expect(parsePresetName("wuwa_calc Electro Rover S6R5 · Mornye + Lynae", { owned: ["Roverelectromale"] }).mainKey).toBe("Roverelectromale");
  });

  it("leaves the player's own names alone and never throws", () => {
    for (const name of ["Basic Rotation (Tune Break)", "Maygi's Fleurdelys Rotation", "Team 30", "Kushy was here :3", "S6 Rotation", "Untitled Rotation"]) {
      const p = parsePresetName(name);
      expect(p.generated, name).toBe(false);
      expect(p.title).toBe(name);
      expect(p.chips).toEqual([]);
    }
    for (const odd of [null, undefined, "", "   ", "(wuwa_calc)", "wuwa_calc ", "· · ·", "a + b (wuwa_calc)", "wuwa_calc 123", "X S9R9 (wuwa_calc)"]) {
      expect(() => parsePresetName(odd as string)).not.toThrow();
      expect(typeof parsePresetName(odd as string).title).toBe("string");
    }
    expect(parsePresetName("(wuwa_calc)").generated).toBe(true);
  });

  it("describes a state for tooltips", () => {
    expect(describeState("S6R5")).toBe("S6 with an R5 weapon");
    expect(describeState("S0")).toBe("S0");
    expect(describeState("odd")).toBe("odd");
  });
});
