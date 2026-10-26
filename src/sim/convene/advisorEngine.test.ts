// Wuthering Tools+ — the pull advisor's damage side on a real exported account (the Cartethyia fixture: S2, Defier's
// Thorn at R1, a full build): every number comes from the app's engine through rankRoster's pieces.
import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { RANKING_ENEMY, rotationCandidates, scoreRotation, withSequence, withWeapon } from "../myRankings/rankRoster";
import type { AdviceTarget } from "./advisor";
import { scoreAdvisorTargets, signatureOwner, weaponName } from "./advisorEngine";

const target = (name: string, key: string | null, kind: "resonator" | "weapon"): AdviceTarget => ({
  id: `b|${name}`,
  bannerId: "b",
  bannerLabel: "3.4 Phase II",
  bannerTitle: null,
  endMs: 0,
  poolType: kind === "weapon" ? 2 : 1,
  kind,
  alwaysFeatured: kind === "weapon",
  item: { name, key },
});

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("pull advisor engine", () => {
  it("finds a weapon's signature owner from the character data", async () => {
    expect(await signatureOwner("DefiersThorn", ["Cartethyia"])).toBe("Cartethyia");
    expect(await signatureOwner("Kumokiri")).toBe("Chisa");
    expect(await signatureOwner("NotAWeapon", [])).toBeNull();
    expect(weaponName("DefiersThorn")).toBe("Defier's Thorn");
    // the unhinted walks load every character module: slow when the whole suite runs in parallel
  }, 60_000);

  it("scores the next sequences and refinements of an owned resonator on her best rotation", async () => {
    const characters = clone(account.characters) as Record<string, any>;
    const echoes = clone(account.echoes) as any[];
    const [carte, thorn] = await scoreAdvisorTargets(
      { targets: [target("Cartethyia", "Cartethyia", "resonator"), target("Defier's Thorn", "DefiersThorn", "weapon")], characters, echoes },
      { yieldToUi: false },
    );
    // S2 → S3 … S6, each against the same best rotation
    expect(carte!.status).toBe("ok");
    expect(carte!.current).toBe("S2");
    expect(carte!.steps.map((s) => `${s.label}:${s.copies}`)).toEqual(["S3:1", "S4:2", "S5:3", "S6:4"]);
    expect(carte!.steps[3]!.gain).toBeGreaterThan(0);
    // the base is the best rotation /my-rankings would pick, and S3 is that rotation re-scored at S3
    const candidates = await rotationCandidates("Cartethyia", characters.Cartethyia);
    let best = { name: "", avg: 0, rotation: candidates[0]!.rotation };
    for (const c of candidates) {
      const s = await scoreRotation(c.rotation, "Cartethyia", characters, RANKING_ENEMY, echoes);
      if (s.avgDamage > best.avg) best = { name: c.name, avg: s.avgDamage, rotation: c.rotation };
    }
    expect(carte!.rotation).toBe(best.name);
    expect(carte!.baseDamage).toBeCloseTo(best.avg, 6);
    const s3 = await scoreRotation(best.rotation, "Cartethyia", { ...characters, Cartethyia: await withSequence("Cartethyia", characters.Cartethyia, 3) }, RANKING_ENEMY, echoes);
    expect(carte!.steps[0]!.avgDamage).toBeCloseTo(s3.avgDamage, 6);
    // her signature, already wielded at R1: R2 … R5 on her own passive toggles
    expect(thorn!.status).toBe("ok");
    expect(thorn!.characterKey).toBe("Cartethyia");
    expect(thorn!.current).toBe("Defier's Thorn R1");
    expect(thorn!.steps.map((s) => s.label)).toEqual(["R2", "R3", "R4", "R5"]);
    const r2 = await scoreRotation(best.rotation, "Cartethyia", { ...characters, Cartethyia: withWeapon(characters.Cartethyia, "DefiersThorn", 2) }, RANKING_ENEMY, echoes);
    expect(thorn!.steps[0]!.avgDamage).toBeCloseTo(r2.avgDamage, 6);
    expect(thorn!.steps[3]!.gain).toBeGreaterThan(thorn!.steps[0]!.gain);
    expect(thorn!.steps[0]!.low).toBeUndefined();
    // the stores' copies are untouched
    expect(characters).toEqual(account.characters);
  }, 60_000);

  it("brackets a signature the owner doesn't wield yet: stats alone below, passives at full stacks above", async () => {
    const characters = clone(account.characters) as Record<string, any>;
    characters.Cartethyia.weapon = "EmeraldOfGenesis";
    const [thorn] = await scoreAdvisorTargets({ targets: [target("Defier's Thorn", "DefiersThorn", "weapon")], characters, echoes: clone(account.echoes) }, { yieldToUi: false });
    expect(thorn!.status).toBe("ok");
    expect(thorn!.current).toBe("Emerald Of Genesis R1");
    expect(thorn!.steps.map((s) => `${s.label}:${s.copies}`)).toEqual([
      "Defier's Thorn R1:1",
      "Defier's Thorn R2:2",
      "Defier's Thorn R3:3",
      "Defier's Thorn R4:4",
      "Defier's Thorn R5:5",
    ]);
    for (const s of thorn!.steps) expect(s.low!.avgDamage).toBeLessThanOrEqual(s.avgDamage);
    expect(thorn!.note).toMatch(/swaps out Emerald Of Genesis R1/);
  }, 60_000);

  it("never invents a number for what the account can't score", async () => {
    const characters = { ...clone(account.characters), Chisa: { resonanceChains: {} }, Camellya: { weapon: "RedSpring", resonanceChains: { SequenceNode6: { isEnabled: true } } } };
    const out = await scoreAdvisorTargets(
      {
        targets: [
          target("Iuno", "Iuno", "resonator"),
          target("Chisa", "Chisa", "resonator"),
          target("Camellya", "Camellya", "resonator"),
          target("Some Collab Hero", null, "resonator"),
          target("Moongazer's Sigil", "MoongazersSigil", "weapon"),
          target("Kumokiri", "Kumokiri", "weapon"),
        ],
        characters,
        echoes: clone(account.echoes),
      },
      { yieldToUi: false },
    );
    expect(out.map((d) => d.status)).toEqual(["not-owned", "not-set-up", "maxed", "not-in-app", "not-owned", "not-set-up"]);
    expect(out[4]!.characterKey).toBe("Iuno");
    expect(out[5]!.characterKey).toBe("Chisa");
    for (const d of out) expect(d.steps).toEqual([]);
  }, 60_000);
});
