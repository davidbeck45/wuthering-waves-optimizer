// Wuthering Tools+: /account's "Check my echoes" (echoCheck.ts) and its cache (echoCheckCache.ts) on public data:
// upstream's Cartethyia golden fixture (her build + 17 echoes) with two of her five echoes taken off (they sit unworn
// in the inventory), and two armed teammates (Ciaccona, Chisa) so a team preset of the three is fieldable. Chisa wears
// one spare echo: the check must never hand it to Cartethyia.
import { beforeAll, describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import teamPresets from "../presets/data/teams.json";
import { rankRoster, type RosterRanking } from "../myRankings/rankRoster";
import { applyBuildFields } from "../../characters/buildFields";
import { buildEchoLoadoutFromIds } from "../../echoes/echoLoadout";
import { buildMyTeam, teamSpecOf } from "../buildTeam/buildTeam";
import { DEFAULT_OPTIONS } from "../buildTeam/constraints";
import { inlineBackend } from "../buildTeam/headlessOptimizer";
import { plansForTeam } from "../buildTeam/plans";
import type { MemberPlan } from "../buildTeam/rileyPlan";
import { createTeamScorer, rankedTeamImpact } from "./investPlan";
import { buffsWorn, checkOwnEchoes, echoCheckRequest, sortEchoUpgrades, type EchoCheck, type EchoUpgrade } from "./echoCheck";
import { buildTeamRoute } from "./ownUpgrades";
import { clearEchoCheckMemory, ECHO_CHECK_CACHE_KEY, ECHO_CHECK_CACHE_VERSION, echoCheckKey, inventoryFingerprint, readCachedEchoCheck, writeCachedEchoCheck } from "./echoCheckCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

const echoes: any[] = JSON.parse(JSON.stringify(account.echoes));
const cartSlots = Object.values((account.characters as any).Cartethyia.echoes as Record<string, { echoId: string }>).map((s) => s.echoId);
// she keeps slots 0–2; slots 3 and 4 go back to the inventory
const kept = cartSlots.slice(0, 3);
const wornIds = new Set(cartSlots);
const spare = echoes.map((e) => String(e.echoId)).filter((id) => !wornIds.has(id));
const chisaEcho = spare[0]!;

const characters: Record<string, any> = {
  Cartethyia: { ...JSON.parse(JSON.stringify((account.characters as any).Cartethyia)), echoes: buildEchoLoadoutFromIds(kept, { fillSlots: 5 }) },
  Ciaccona: { weapon: "WoodlandAria" },
  Chisa: { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } }, echoes: buildEchoLoadoutFromIds([chisaEcho], { fillSlots: 5 }) },
};
const equipped: Record<string, Record<string, number>> = {
  ...Object.fromEntries(kept.map((id, i) => [id, { Cartethyia: i }])),
  [chisaEcho]: { Chisa: 0 },
};

let ranking: RosterRanking;
let check: EchoCheck;
let cart: EchoUpgrade | undefined;

beforeAll(async () => {
  ranking = await rankRoster(characters, echoes, [], { investment: false, yieldToUi: false });
  check = await checkOwnEchoes({ characters, inventory: { echoes, equipped }, teams: [], ranking, only: ["Cartethyia"] }, { backend: inlineBackend(), riley: null }, { yieldToUi: false });
  cart = check.items.find((i) => i.characterId === "Cartethyia");
}, 240000);

describe("check my echoes", () => {
  it("finds the better build the inventory holds, on the strongest team she can field", () => {
    expect(check.errors).toEqual([]);
    expect(check.total).toBe(1);
    expect(check.done).toBe(1);
    expect(check.cancelled).toBe(false);
    expect(cart, JSON.stringify(check.skipped)).toBeTruthy();
    expect(cart!.gain).toBeGreaterThan(0.01);
    expect(cart!.after).toBeGreaterThan(cart!.before);
    expect(cart!.changed).toBeGreaterThanOrEqual(2);
    expect(cart!.unworn).toBeGreaterThanOrEqual(1);
    expect(cart!.sets).toMatch(/\dpc/);
    // the strongest fieldable team is a preset of the three: /build-team opens on them, only she is re-geared
    expect(cart!.request.members).toEqual(expect.arrayContaining(["Cartethyia", "Ciaccona", "Chisa"]));
    expect(buildTeamRoute(cart!.request, "Cartethyia")).toEqual({ path: "/build-team", query: { members: cart!.request.members!.join(","), only: "Cartethyia", rankedTeam: cart!.team!.teamId } });
  });

  it("equals Build my team's own run on the same team with only her planned, and never takes a teammate's echo", async () => {
    const spec = teamSpecOf(cart!.request, [])!;
    const slot = spec.characterIds.indexOf("Cartethyia");
    const plans = await plansForTeam(spec.characterIds, null, { high: false });
    const masked: MemberPlan[] = [];
    masked[slot] = plans.plans[slot]!;
    const run = await buildMyTeam({ characters, inventory: { echoes, equipped }, team: spec, plans: masked, order: [slot], options: DEFAULT_OPTIONS, erFloors: spec.characterIds.map(() => null) }, inlineBackend());
    const m = run.members[slot]!;
    expect(m.after!.value).toBeCloseTo(cart!.after, 6);
    expect(m.before!.value).toBeCloseTo(cart!.before, 6);
    const ids = m.after!.picks.map((p) => String(p.echo.echoId));
    expect(ids).not.toContain(chisaEcho);
    // the teammates got no plan: they keep what they wear
    for (const other of run.members.filter((x) => x.slot !== slot)) expect(other.draft).toBeNull();
  }, 240000);

  it("counts her two empty slots and names the echoes the new build takes, none of them a teammate's", () => {
    expect(cart!.empty).toBe(2);
    expect(cart!.echoIds).toHaveLength(cart!.changed);
    expect(new Set(cart!.echoIds).size).toBe(cart!.changed);
    expect(cart!.echoIds).not.toContain(chisaEcho);
    for (const id of cart!.echoIds) expect(kept).not.toContain(id);
  });

  it("counts no empty slots when the team pins another build: the gaps it can read are the active build's", async () => {
    const preset = (teamPresets as any[]).find((p) => ["Cartethyia", "Ciaccona", "Chisa"].every((k) => p.data.characterIds.includes(k)));
    const team = {
      id: "pins",
      name: "Pinned",
      characterIds: preset.data.characterIds,
      buildIds: preset.data.characterIds.map((k: string) => (k === "Cartethyia" ? "pinned" : null)),
      actions: preset.data.actions.map((a: any, i: number) => ({ ...a, id: `a${i}` })),
      duration: preset.data.duration,
      enemyConfig: preset.data.enemyConfig ?? {},
      handoffs: preset.data.handoffs ?? null,
    };
    const cartethyia = characters.Cartethyia;
    const pinned = { ...characters, Cartethyia: { ...cartethyia, activeBuildId: "worn", builds: [{ id: "worn", name: "Worn" }, { id: "pinned", name: "For the team", echoes: cartethyia.echoes }] } };
    const out = await checkOwnEchoes(
      { characters: pinned, inventory: { echoes, equipped }, teams: [team], ranking: await rankRoster(pinned, echoes, [team], { investment: false, yieldToUi: false }), only: ["Cartethyia"] },
      { backend: inlineBackend(), riley: null },
      { yieldToUi: false },
    );
    const row = out.items.find((i) => i.characterId === "Cartethyia");
    expect(row?.teamNote, JSON.stringify({ skipped: out.skipped, best: out.best, errors: out.errors })).toContain("not the active one");
    expect(row!.empty).toBe(0);
  }, 240000);

  it("scores the team figure exactly as the rankings would, with the new build worn", async () => {
    expect(cart!.team, cart!.teamNote ?? "").toBeTruthy();
    const scorer = await createTeamScorer(characters, echoes, [], ranking.teams);
    const ctx = await scorer.teamFor("Cartethyia");
    expect(ctx!.rank.id).toBe(cart!.team!.teamId);
    expect(cart!.team!.base).toBeCloseTo(ctx!.base, 6);
    // re-run the same draft through the scorer: the same figure
    const spec = teamSpecOf(cart!.request, [])!;
    const slot = spec.characterIds.indexOf("Cartethyia");
    const plans = await plansForTeam(spec.characterIds, null, { high: false });
    const masked: MemberPlan[] = [];
    masked[slot] = plans.plans[slot]!;
    const run = await buildMyTeam({ characters, inventory: { echoes, equipped }, team: spec, plans: masked, order: [slot], options: DEFAULT_OPTIONS, erFloors: spec.characterIds.map(() => null) }, inlineBackend());
    const hypo = { ...characters, Cartethyia: applyBuildFields(characters.Cartethyia, run.members[slot]!.draft!) };
    const { team } = await scorer.impact(ctx, null, hypo, echoes);
    expect(team!.avgDamage).toBeCloseTo(cart!.team!.avgDamage, 4);
    expect(cart!.team!.gain).toBeGreaterThan(0);
    // the page the row opens prints that figure from the team's id alone: same team, same base, same gain
    const onPage = await rankedTeamImpact(cart!.team!.teamId, characters, echoes, [], hypo);
    expect(onPage!.teamId).toBe(cart!.team!.teamId);
    expect(onPage!.base).toBeCloseTo(cart!.team!.base, 4);
    expect(onPage!.avgDamage).toBeCloseTo(cart!.team!.avgDamage, 4);
    expect(onPage!.gain).toBeCloseTo(cart!.team!.gain, 8);
    // a team that isn't a candidate any more has no figure, and no invented one
    expect(await rankedTeamImpact("wuwa_calc:gone", characters, echoes, [], hypo)).toBeNull();
  }, 240000);

  it("asks /build-team for the saved team by id, a preset by its three, and the character alone without a team", () => {
    expect(echoCheckRequest({ rank: { id: "t1", source: "yours", characterIds: ["A", "B", "C"] } as any }, "A")).toEqual({ teamId: "t1" });
    expect(echoCheckRequest({ rank: { id: "wuwa_calc:x", source: "wuwa_calc", characterIds: ["A", "B", "C"] } as any }, "B")).toEqual({ members: ["A", "B", "C"], rankedTeam: "wuwa_calc:x" });
    expect(echoCheckRequest(null, "A")).toEqual({ members: ["A"] });
    expect(buildTeamRoute({ teamId: "t1" }, "A")).toEqual({ path: "/build-team", query: { team: "t1", only: "A" } });
    // a preset has no saved rotation to total: the link names the team the row was scored on, for the review to print
    expect(buildTeamRoute({ members: ["A", "B", "C"], rankedTeam: "wuwa_calc:x" }, "B")).toEqual({ path: "/build-team", query: { members: "A,B,C", only: "B", rankedTeam: "wuwa_calc:x" } });
    expect(buildTeamRoute({ members: ["A", "B", "C"], rankedTeam: "wuwa_calc:x" }, null).query).toEqual({ members: "A,B,C" });
  });

  it("orders by own gain, then team gain, then id", () => {
    const item = (id: string, gain: number, team: number | null): EchoUpgrade => ({ id, gain, team: team == null ? null : ({ gain: team } as any) }) as EchoUpgrade;
    expect(sortEchoUpgrades([item("a", 0.01, null), item("b", 0.02, 0.01), item("c", 0.02, 0.03)]).map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("names only the switched-on buffs the new build wears: its main echo's, and set passives with their pieces on", () => {
    const keys = ["HavocEclipse5SetHavoc", "HavocEclipse2SetHavoc", "DreamoftheLostCritRateEchoSkill", "FallacyofNoReturn:FallacyofNoReturn", "PhantomFallacyofNoReturn:PhantomFallacyofNoReturn", "SomethingUnknown"];
    // Dream of the Lost 3pc + Havoc Eclipse 2pc, Fallacy of No Return in the main slot
    expect(buffsWorn(keys, { DreamoftheLost: 3, HavocEclipse: 2 }, "FallacyofNoReturn")).toEqual(["HavocEclipse2SetHavoc", "DreamoftheLostCritRateEchoSkill", "FallacyofNoReturn:FallacyofNoReturn", "SomethingUnknown"]);
    expect(buffsWorn(keys, { HavocEclipse: 5 }, null)).toEqual(["HavocEclipse5SetHavoc", "HavocEclipse2SetHavoc", "SomethingUnknown"]);
  });

  it("stops between characters when cancelled, and says so", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await checkOwnEchoes({ characters, inventory: { echoes, equipped }, teams: [], ranking }, { backend: inlineBackend(), riley: null }, { signal: ctrl.signal, yieldToUi: false });
    expect(out.cancelled).toBe(true);
    expect(out.done).toBe(0);
    expect(out.items).toEqual([]);
  });
});

describe("the echo check cache", () => {
  const store = (): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  };

  it("keys on the ranking, the inventory (who wears what too) and the run's settings", () => {
    const inv = inventoryFingerprint(echoes, equipped);
    expect(inventoryFingerprint(JSON.parse(JSON.stringify(echoes)), { ...equipped })).toBe(inv);
    // moving one echo to another wearer moves the key, though the ranking's own hash would not see it
    expect(inventoryFingerprint(echoes, { ...equipped, [chisaEcho]: { Ciaccona: 0 } })).not.toBe(inv);
    const key = echoCheckKey("v2:abc", inv, { options: DEFAULT_OPTIONS, engine: "e95d4e6" });
    expect(echoCheckKey("v2:abd", inv, { options: DEFAULT_OPTIONS, engine: "e95d4e6" })).not.toBe(key);
    expect(echoCheckKey("v2:abc", inv, { options: { ...DEFAULT_OPTIONS, useSets: false }, engine: "e95d4e6" })).not.toBe(key);
    expect(echoCheckKey("v2:abc", inv, { options: DEFAULT_OPTIONS, engine: "e95d4e7" })).not.toBe(key);
  });

  it("ignores a stored entry for this key with a part missing (the drawer reads every list)", () => {
    clearEchoCheckMemory();
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    store.set(ECHO_CHECK_CACHE_KEY, JSON.stringify({ key: "k", check: { items: [] } }));
    expect(readCachedEchoCheck("k", storage)).toBeNull();
  });

  it("serves a finished check for the same key from memory and sessionStorage, never a cancelled one", () => {
    const s = store();
    const key = echoCheckKey("v2:abc", "inv", null);
    clearEchoCheckMemory();
    expect(readCachedEchoCheck(key, s)).toBeNull();
    expect(writeCachedEchoCheck(key, { ...check, cancelled: true }, s)).toBe(false);
    expect(readCachedEchoCheck(key, s)).toBeNull();
    expect(writeCachedEchoCheck(key, check, s)).toBe(true);
    clearEchoCheckMemory();
    expect(readCachedEchoCheck(key, s)!.items.map((i) => i.id)).toEqual(check.items.map((i) => i.id));
    expect(readCachedEchoCheck(echoCheckKey("v2:abc", "other", null), s)).toBeNull();
  });

  it("a tab's check from before the tied-ER rule is not read: its rows name another build than /build-team gives", () => {
    const s = store();
    const key = echoCheckKey("v2:abc", "inv", null);
    expect(ECHO_CHECK_CACHE_VERSION).toBeGreaterThanOrEqual(4);
    expect(key.startsWith(`e${ECHO_CHECK_CACHE_VERSION}:`)).toBe(true);
    clearEchoCheckMemory();
    s.setItem(ECHO_CHECK_CACHE_KEY, JSON.stringify({ key: key.replace(/^e\d+:/, "e3:"), check }));
    expect(readCachedEchoCheck(key, s)).toBeNull();
  });
});
