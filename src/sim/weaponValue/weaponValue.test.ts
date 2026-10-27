// Wuthering Tools+: /weapons on a real exported build — the Cartethyia fixture (S2, Defier's Thorn R1, a full build) —
// with two armed teammates synthesised around her (Ciaccona on the 4★ Cadenza, Chisa on her Kumokiri), so a wuwa_calc
// team preset is fieldable and a support holds something other than her team-buff signature (Woodland Aria).
import { beforeAll, describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { RANKING_ENEMY, rankRoster, scoreRotation, scoreTeamCandidate, teamCandidatesOf, type RosterRanking } from "../myRankings/rankRoster";
import { calcCharacterRotationDamage } from "../../calculator/characterRotation";
import { allCharactersList } from "../../characters/characters";
import { scoreAdvisorTargets } from "../convene/advisorEngine";
import type { AdviceTarget } from "../convene/advisor";
import { weaponMeta } from "../display/names";
import { withWeaponAtFullStacks } from "../weapons/weaponLadder";
import { weaponValue, weaponsOfType, type CharacterWeaponValue, type WeaponValueResult } from "./weaponValue";
import { keptPanelMembers, panelsFollowWeapon, weaponTeamBuffKeys } from "./teamPanels";
import { POOLS, releasedItems, standardWeaponKeys } from "./pools";
import { rankWeaponPool } from "./selector";
import { createValueCache } from "./valueCache";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const echoes = clone(account.echoes) as any[];
const characters: Record<string, any> = {
  ...clone(account.characters),
  Ciaccona: { weapon: "Cadenza" },
  Chisa: { weapon: "Kumokiri" },
};
// Her exported Team Buffs panel names Ciaccona + Chisa (so resolveTeam keeps it) and ticks Woodland Aria's shred, which
// Ciaccona wore in that export; she holds Cadenza here, so that tick would be stale — the panel stays, the tick goes.
delete characters.Cartethyia.teamBuffs.buffs.WoodlandAriaAeroShred;

let ranking: RosterRanking;
let value: WeaponValueResult;
const rowOf = (id: string, v: WeaponValueResult = value): CharacterWeaponValue => v.rows.find((r) => r.id === id)!;

beforeAll(async () => {
  ranking = await rankRoster(characters, echoes, [], { investment: false, yieldToUi: false });
  value = await weaponValue(characters, echoes, [], ranking, { yieldToUi: false });
}, 180_000);

const featured = (name: string, key: string): AdviceTarget => ({
  id: `b|${name}`,
  bannerId: "b",
  bannerLabel: "3.7 Phase II",
  bannerTitle: null,
  endMs: 0,
  poolType: 2,
  kind: "weapon",
  alwaysFeatured: true,
  item: { name, key },
});

describe("weapon value", () => {
  it("scores every set-up character on the ranking's best rotation, strongest first", () => {
    expect(value.errors).toEqual([]);
    expect(value.cancelled).toBe(false);
    expect(value.rows.map((r) => r.id)).toEqual(ranking.characters.map((c) => c.id));
    for (const row of value.rows) {
      const rank = ranking.characters.find((c) => c.id === row.id)!;
      expect(row.status, row.id).toBe("ok");
      expect(row.current.rotation).toBe(rank.best!.name);
      expect(row.current.avgDamage).toBeCloseTo(rank.best!.avgDamage, 6);
    }
  });

  it("walks the signature from where they are: R5 ≥ R1, every step at least the one before", () => {
    const cart = rowOf("Cartethyia");
    expect(cart.signature).toMatchObject({ key: "DefiersThorn", status: "held" });
    expect(cart.signature.steps.map((s) => s.label)).toEqual(["Defier's Thorn R2", "Defier's Thorn R3", "Defier's Thorn R4", "Defier's Thorn R5"]);
    const ciac = rowOf("Ciaccona");
    expect(ciac.signature).toMatchObject({ key: "WoodlandAria", status: "swap" });
    expect(ciac.signature.steps.map((s) => s.refinement)).toEqual([1, 2, 3, 4, 5]);
    for (const row of [cart, ciac, rowOf("Chisa")]) {
      const steps = row.signature.steps;
      expect(steps.length, row.id).toBeGreaterThan(0);
      expect(steps[steps.length - 1]!.gain).toBeGreaterThanOrEqual(steps[0]!.gain);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]!.avgDamage, `${row.id} ${steps[i]!.label}`).toBeGreaterThanOrEqual(steps[i - 1]!.avgDamage - 1e-6);
        if (steps[i]!.low) expect(steps[i]!.low!.avgDamage).toBeGreaterThanOrEqual(steps[i - 1]!.low!.avgDamage - 1e-6);
        if (steps[i]!.team && steps[i - 1]!.team) expect(steps[i]!.team!.avgDamage).toBeGreaterThanOrEqual(steps[i - 1]!.team!.avgDamage - 1e-6);
      }
    }
    // a held weapon is one number (their own toggles); a swap carries the stats-only floor under the headline
    for (const s of cart.signature.steps) expect(s.low).toBeNull();
    for (const s of ciac.signature.steps) expect(s.low!.avgDamage).toBeLessThanOrEqual(s.avgDamage + 1e-6);
  });

  it("prints the pull advisor's numbers for the same featured weapon — one weapon ladder, not a third", async () => {
    // held: Defier's Thorn R1 → R2…R5
    const [thorn] = await scoreAdvisorTargets({ targets: [featured("Defier's Thorn", "DefiersThorn")], characters: clone(characters), echoes: clone(echoes) }, { yieldToUi: false });
    const mine = rowOf("Cartethyia").signature.steps;
    expect(thorn!.steps.map((s) => s.avgDamage)).toHaveLength(mine.length);
    thorn!.steps.forEach((s, i) => {
      expect(mine[i]!.avgDamage).toBeCloseTo(s.avgDamage, 6);
      expect(mine[i]!.gain).toBeCloseTo(s.gain, 10);
    });
    // a swap (she holds Emerald of Genesis): R1…R5 with the bracket
    const solo = { Cartethyia: { ...clone(characters.Cartethyia), weapon: "EmeraldOfGenesis" } };
    const soloRanking = await rankRoster(solo, echoes, [], { yieldToUi: false });
    const soloValue = await weaponValue(solo, echoes, [], soloRanking, { yieldToUi: false });
    const [swap] = await scoreAdvisorTargets({ targets: [featured("Defier's Thorn", "DefiersThorn")], characters: clone(solo), echoes: clone(echoes) }, { yieldToUi: false });
    const steps = rowOf("Cartethyia", soloValue).signature.steps;
    expect(rowOf("Cartethyia", soloValue).signature.status).toBe("swap");
    expect(swap!.steps).toHaveLength(5);
    swap!.steps.forEach((s, i) => {
      expect(steps[i]!.avgDamage).toBeCloseTo(s.avgDamage, 6);
      expect(steps[i]!.low!.avgDamage).toBeCloseTo(s.low!.avgDamage, 6);
    });
  }, 120_000);

  it("runs the team figure on the headline's weapon: full stacks as stored toggles = weaponPassiveMode all-max", async () => {
    const rotation = ranking.characters.find((c) => c.id === "Ciaccona")!.bestRotation!;
    const armed = await withWeaponAtFullStacks("Ciaccona", characters.Ciaccona, "WoodlandAria", 3);
    const stored = await scoreRotation(rotation, "Ciaccona", { ...characters, Ciaccona: armed }, RANKING_ENEMY, echoes);
    const allMax = await calcCharacterRotationDamage(rotation, null, "Ciaccona", { ...characters, Ciaccona: { ...characters.Ciaccona, weapon: "WoodlandAria", weapons: { WoodlandAria: { refinement: "3" } } } }, RANKING_ENEMY, echoes, null, { weaponPassiveMode: "all-max" });
    expect(stored.avgDamage).toBeCloseTo(allMax.damageAggregation.avgDamage ?? 0, 6);
    expect(stored.avgDamage).toBeCloseTo(rowOf("Ciaccona").signature.steps[2]!.avgDamage, 6);
  });

  it("credits a support's team-buff signature to the carry it buffs", async () => {
    expect(weaponTeamBuffKeys("WoodlandAria")).toEqual(["WoodlandAriaAeroShred"]);
    const ciac = rowOf("Ciaccona");
    const r1 = ciac.signature.steps[0]!;
    expect(ciac.team?.characterIds).toEqual(expect.arrayContaining(["Cartethyia", "Ciaccona", "Chisa"]));
    expect(r1.team).not.toBeNull();
    expect(r1.team!.gain).toBeGreaterThan(0);
    // Cartethyia's hand-set panel followed the weapon: the shred ticked for the what-if
    expect(r1.panels).toEqual([{ member: "Cartethyia", on: ["WoodlandAriaAeroShred"], off: [] }]);
    // independently: the same team run, Ciaccona on Woodland Aria — Cartethyia's own slot rises, her gear untouched
    const { candidates } = await teamCandidatesOf(characters, []);
    const team = candidates.find((c) => c.id === ciac.team!.id)!;
    const slot = team.team.characterIds.indexOf("Cartethyia");
    const before = await scoreTeamCandidate(team, characters, echoes);
    const armed = { ...characters, Ciaccona: await withWeaponAtFullStacks("Ciaccona", characters.Ciaccona, "WoodlandAria", 1) };
    const followed = await panelsFollowWeapon(team.team, characters, armed, "Ciaccona", echoes, RANKING_ENEMY);
    const after = await scoreTeamCandidate(team, followed.characters, echoes);
    expect(after.perSlot[slot]!).toBeGreaterThan(before.perSlot[slot]!);
    expect(after.avgDamage).toBeCloseTo(r1.team!.avgDamage, 6);
    // with no hand-set panel (her buffs derived from the real members) the shred reaches her without any adjustment
    const derived = { ...characters, Cartethyia: { ...characters.Cartethyia, teamBuffs: undefined } };
    const plain = await scoreTeamCandidate(team, derived, echoes);
    const plainAfter = await scoreTeamCandidate(team, { ...derived, Ciaccona: armed.Ciaccona }, echoes);
    expect(plainAfter.perSlot[slot]!).toBeGreaterThan(plain.perSlot[slot]!);
    expect((await panelsFollowWeapon(team.team, derived, { ...derived, Ciaccona: armed.Ciaccona }, "Ciaccona", echoes, RANKING_ENEMY)).adjusted).toEqual([]);
  }, 60_000);

  it("lets a hand-set teammate panel follow the weapon: the new buff on, the old one off, a refinement written", async () => {
    const team = { characterIds: ["Cartethyia", "Ciaccona", "Chisa"] };
    const kumokiri = weaponTeamBuffKeys("Kumokiri");
    const aria = weaponTeamBuffKeys("WoodlandAria");
    const panel = { selectedCharacter1: "Ciaccona", selectedCharacter2: "Chisa", buffs: Object.fromEntries(kumokiri.map((k) => [k, { isEnabled: true, refinement: "1" }])) };
    const before: Record<string, any> = { ...characters, Cartethyia: { ...characters.Cartethyia, teamBuffs: panel } };
    expect(keptPanelMembers(team, before)).toEqual(["Cartethyia"]);
    // a swap onto a team-buff weapon: its buffs appear on the kept panel, as resolveTeam derives them
    const swap = await panelsFollowWeapon(team, before, { ...before, Ciaccona: await withWeaponAtFullStacks("Ciaccona", before.Ciaccona, "WoodlandAria", 2) }, "Ciaccona", echoes, RANKING_ENEMY);
    expect(swap.adjusted.map((a) => a.member)).toEqual(["Cartethyia"]);
    expect(swap.adjusted[0]!.on.length).toBeGreaterThan(0);
    for (const k of swap.adjusted[0]!.on) {
      expect(aria).toContain(k);
      expect(swap.characters.Cartethyia.teamBuffs.buffs[k].isEnabled).toBe(true);
    }
    expect(swap.characters.Cartethyia.teamBuffs.selectedCharacter1).toBe("Ciaccona"); // still the player's panel
    // a refinement step of the held weapon: the panel's entries take it
    const step = await panelsFollowWeapon(team, before, { ...before, Chisa: { ...before.Chisa, weapons: { Kumokiri: { refinement: "4" } } } }, "Chisa", echoes, RANKING_ENEMY);
    for (const k of kumokiri) expect(step.characters.Cartethyia.teamBuffs.buffs[k].refinement).toBe("4");
    // a swap away from it: the old weapon's buffs go off
    const away = await panelsFollowWeapon(team, before, { ...before, Chisa: { ...before.Chisa, weapon: "LustrousRazor" } }, "Chisa", echoes, RANKING_ENEMY);
    for (const k of kumokiri) expect(away.characters.Cartethyia.teamBuffs.buffs[k].isEnabled).toBe(false);
    // the base (the team as it is) is never touched
    expect(before.Cartethyia.teamBuffs.buffs[kumokiri[0]!].isEnabled).toBe(true);
  }, 60_000);

  it("adds the standard 5★ options, the best 4★ at R5 and the held weapon's next refinement", async () => {
    const cart = rowOf("Cartethyia");
    expect(cart.standard.map((o) => o.weaponKey).sort()).toEqual(["EmeraldOfGenesis", "LaserShearer"]);
    for (let i = 1; i < cart.standard.length; i++) expect(cart.standard[i - 1]!.gain).toBeGreaterThanOrEqual(cart.standard[i]!.gain);
    for (const o of cart.standard) {
      expect(o.refinement).toBe(1);
      expect(o.low!.avgDamage).toBeLessThanOrEqual(o.avgDamage + 1e-6);
    }
    expect(cart.refine).toBeNull(); // she holds the signature: its own steps cover the refinements
    // the best 4★: no other four-star sword beats it on the headline
    const rotation = ranking.characters.find((c) => c.id === "Cartethyia")!.bestRotation!;
    let best = -Infinity;
    for (const key of weaponsOfType("Swords", 4)) {
      const armed = await withWeaponAtFullStacks("Cartethyia", characters.Cartethyia, key, 5);
      best = Math.max(best, (await scoreRotation(rotation, "Cartethyia", { ...characters, Cartethyia: armed }, RANKING_ENEMY, echoes)).avgDamage);
    }
    expect(cart.four!.refinement).toBe(5);
    expect(weaponMeta(cart.four!.weaponKey)?.rarity).toBe(4);
    expect(cart.four!.avgDamage).toBeCloseTo(best, 6);
    // Ciaccona holds a 4★ (Cadenza R1): its R2 is her `refine`, and the 4★ option is another weapon
    const ciac = rowOf("Ciaccona");
    expect(ciac.refine).toMatchObject({ kind: "refine", weaponKey: "Cadenza", refinement: 2, low: null });
    expect(ciac.four!.weaponKey).not.toBe("Cadenza");
  }, 120_000);

  it("skips what it cannot score with a status, never a made-up number", async () => {
    const odd = { ...characters, Chisa: { weapon: "NotAWeapon" } };
    const oddRanking = { ...ranking, characters: ranking.characters.map((c) => (c.id === "Chisa" ? { ...c } : c)) };
    const r = await weaponValue(odd, echoes, [], oddRanking, {
      yieldToUi: false,
      ids: ["Chisa", "Ciaccona", "Cartethyia"],
      signatureOf: async (id) => (id === "Ciaccona" ? "NotASignature" : id === "Cartethyia" ? null : "Kumokiri"),
    });
    expect(rowOf("Chisa", r)).toMatchObject({ status: "unknown-weapon", standard: [], four: null, refine: null });
    expect(rowOf("Chisa", r).signature.steps).toEqual([]);
    expect(rowOf("Ciaccona", r).signature).toEqual({ key: "NotASignature", status: "not-in-app", steps: [] });
    expect(rowOf("Cartethyia", r).signature).toEqual({ key: null, status: "none", steps: [] });
    expect(rowOf("Cartethyia", r).standard.length).toBeGreaterThan(0); // the alternatives still run
    const pool = rankWeaponPool(["NotAWeapon", "StaticMist"], r, odd);
    expect(pool.find((p) => p.key === "NotAWeapon")).toMatchObject({ status: "not-in-app", best: null });
    expect(releasedItems({ kind: "weapon", items: ["NotAWeapon", "StaticMist"] })).toEqual(["StaticMist"]);
    expect(releasedItems({ kind: "resonator", items: ["Lily", "Verina"] })).toEqual(["Verina"]);
    // characters without a weapon are listed, not scored
    const withEmpty = await weaponValue({ ...characters, Verina: { resonanceChains: {} } }, echoes, [], ranking, { yieldToUi: false, ids: ["Verina"] });
    expect(withEmpty.rows).toEqual([]);
    expect(withEmpty.notSetUp).toEqual(["Verina"]);
  }, 120_000);

  it("stops when cancelled and keeps nothing half-done", async () => {
    const stopped = await weaponValue(characters, echoes, [], ranking, { yieldToUi: false, signal: { cancelled: true } });
    expect(stopped.cancelled).toBe(true);
    expect(stopped.rows).toEqual([]);
  });
});

describe("weapon selector pools", () => {
  it("ranks a weapon pool off the weapon-value run, deterministically, with dupes for the copies worn", async () => {
    const worn = { ...characters, Ciaccona: { weapon: "StaticMist", weapons: { StaticMist: { refinement: "2" } } } };
    const wornRanking = await rankRoster(worn, echoes, [], { yieldToUi: false });
    const wornValue = await weaponValue(worn, echoes, [], wornRanking, { yieldToUi: false });
    const items = standardWeaponKeys();
    const a = rankWeaponPool(items, wornValue, worn);
    const b = rankWeaponPool([...items].reverse(), wornValue, worn);
    expect(a.map((r) => r.key)).toEqual(b.map((r) => r.key));
    const mist = a.find((r) => r.key === "StaticMist")!;
    expect(mist.wornBy).toEqual(["Ciaccona"]);
    expect(mist.dupe).toMatchObject({ characterId: "Ciaccona", kind: "dupe" });
    expect(mist.dupe!.option).toMatchObject({ kind: "refine", weaponKey: "StaticMist", refinement: 3 });
    const emerald = a.find((r) => r.key === "EmeraldOfGenesis")!;
    expect(emerald.uses.map((u) => u.characterId)).toEqual(["Cartethyia"]); // the only sword user
    expect(emerald.best!.option).toBe(rowOf("Cartethyia", wornValue).standard.find((o) => o.weaponKey === "EmeraldOfGenesis"));
    // ranked on team gain where there is one
    const ranked = a.filter((r) => r.best);
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i - 1]!.best!.scope === ranked[i]!.best!.scope) expect(ranked[i - 1]!.best!.value!).toBeGreaterThanOrEqual(ranked[i]!.best!.value!);
    }
    expect(rankWeaponPool(items, null, worn).every((r) => r.status === "pending" || r.status === "not-in-app")).toBe(true);
  }, 180_000);

  it("pools.json: released keys only, two standard 5★ per weapon type, every pool sourced and versioned", () => {
    const characterKeys = new Set(allCharactersList.map((c) => c.key));
    expect(POOLS.v).toBe(1);
    expect(POOLS.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(POOLS.pools.map((p) => p.id)).size).toBe(POOLS.pools.length);
    for (const pool of POOLS.pools) {
      expect(pool.source.length, pool.id).toBeGreaterThan(20);
      expect(pool.sourceUrl).toMatch(/^https:\/\//);
      expect(pool.sourceUrl).not.toMatch(/encore\.moe/);
      expect(pool.version).toMatch(/^\d+\.\d+$/);
      expect(typeof pool.verified).toBe("boolean");
      expect(new Set(pool.items).size).toBe(pool.items.length);
      for (const key of pool.items) {
        if (pool.kind === "weapon") expect(weaponMeta(key)?.rarity, key).toBe(5);
        else {
          expect(characterKeys.has(key), key).toBe(true);
          expect(allCharactersList.find((c) => c.key === key)!.rarity, key).toBe(5);
        }
      }
      expect(releasedItems(pool)).toEqual(pool.items);
    }
    const types: Record<string, number> = {};
    for (const key of standardWeaponKeys()) types[weaponMeta(key)!.type] = (types[weaponMeta(key)!.type] ?? 0) + 1;
    expect(types).toEqual({ Swords: 2, Broadblades: 2, Pistols: 2, Gauntlets: 2, Rectifiers: 2 });
  });

  it("caches a result under its key only, and survives a reload through sessionStorage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const cache = createValueCache<{ n: number }>("wtplus:test", 1, (v) => typeof (v as { n?: unknown }).n === "number");
    expect(cache.write("fp-1", { n: 1 }, storage)).toBe(true);
    cache.clearMemory();
    expect(cache.read("fp-1", storage)).toEqual({ n: 1 });
    expect(cache.read("fp-2", storage)).toBeNull();
    const newer = createValueCache<{ n: number }>("wtplus:test", 2);
    expect(newer.read("fp-1", storage)).toBeNull();
    store.set("wtplus:test", "{junk");
    cache.clearMemory();
    expect(cache.read("fp-1", storage)).toBeNull();
  });
});
