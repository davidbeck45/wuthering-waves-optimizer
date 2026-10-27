// @vitest-environment node
// "Build it for me" against Riley's real engine (vendor/wuwa_calc, loaded the way the CLI loads it): every set, main
// echo and main-stat layout any of his loadouts can pick maps onto this app's keys — 0 unmapped — and the plans for the
// Wave 0 synthetic account (no player's data) come from his `mine` row with the traced run's ER needs.
import { beforeAll, describe, expect, it } from "vitest";
import { SYNTHETIC_ACCOUNT, SYNTHETIC_TEAM } from "../engine/__fixtures__/syntheticAccount";
import { rileyHeadless, type HeadlessRiley } from "../engine/rileyNode";
import { echoKeysOf, parseMainStats, planFromRiley, setKeyOf } from "./rileyPlan";
import { plansForTeam, type RileySource } from "./plans";
import { constraintsOf, DEFAULT_OPTIONS } from "./constraints";

/* eslint-disable @typescript-eslint/no-explicit-any */
let h: HeadlessRiley;

beforeAll(async () => {
  h = await rileyHeadless(SYNTHETIC_ACCOUNT);
}, 60_000);

const source = (): RileySource => ({
  teamKeysFor: async (ids) => h.teamKeysFor(ids),
  solveMine: async (keys, subs) => h.solveMine(keys, { subs: subs ?? "mine" }),
  tracedRun: async (key, picks) => h.tracedRun(key, picks),
});

describe("Riley's whole loadout list maps onto the app", () => {
  it("every set piece, main-slot echo and layout his loadouts offer has an app key (0 unmapped)", () => {
    const sets = new Set<string>();
    const mains = new Set<string>();
    const layouts = new Set<string>();
    const seen = new Set<unknown>();
    for (const members of Object.values(h.engine.model.TEAMS as Record<string, any[]>)) {
      for (const m of members) {
        if (seen.has(m.loadout)) continue;
        seen.add(m.loadout);
        for (const el of m.loadout.echoLoadouts) {
          for (const g of el.sets) sets.add(String(g.name));
          mains.add(String(el.mainslot.name));
        }
        for (const ms of m.loadout.mainstats) layouts.add(String(ms.name));
      }
    }
    expect(sets.size).toBeGreaterThan(30);
    expect([...sets].filter((s) => !setKeyOf(s))).toEqual([]);
    expect([...mains].filter((s) => !echoKeysOf(s).length)).toEqual([]);
    expect([...layouts].filter((s) => !parseMainStats(s))).toEqual([]);
    // his three layouts all occur, 41111 included
    expect([...layouts].some((l) => l.startsWith("41111"))).toBe(true);
  });
});

describe("plans from his `mine` row", () => {
  it("reads sets, main echo, layout and the traced run's ER need per member; the priority is his DPS share", async () => {
    const out = await plansForTeam(SYNTHETIC_TEAM, source());
    expect(out.riley?.status).toBe("ok");
    expect(out.dpsMine).toBeGreaterThan(0);
    expect(out.dpsHigh).toBeGreaterThan(0);
    for (const plan of out.plans) {
      expect(plan.source).toBe("riley");
      expect(plan.unmapped).toEqual([]);
      expect(plan.sets.length).toBeGreaterThan(0);
      expect(plan.mainEcho?.keys.length).toBeGreaterThan(0);
      expect(plan.mainStats).not.toBeNull();
      expect(plan.share).toBeGreaterThan(0);
    }
    // Shorekeeper's kit floor (240 %) is above her loop's bar: the need is the kit's
    const sk = out.plans[SYNTHETIC_TEAM.indexOf("Shorekeeper")]!;
    expect(sk.erNeed).toBe(240);
    expect(sk.erSetBy).toBe("kit");
    // the run's need is the energy check's: max(bar, kit floor)
    const run = h.tracedRun(out.riley!.teamKey, out.riley!.best!.picks);
    for (const m of run.members) {
      const n = run.needs[m.name]!;
      const plan = planFromRiley(m, n);
      const need = Math.max(n.bar ?? 0, n.minEr);
      expect(plan.erNeed).toBe(need > 0 ? Math.round(need * 100) / 100 : null);
    }
    // 43311 / 44111 reach the optimizer as themselves
    for (const plan of out.plans) {
      const c = constraintsOf(plan, DEFAULT_OPTIONS);
      expect(c.loadoutFormat).toBe(plan.mainStats!.layout === "41111" ? "Any" : plan.mainStats!.layout);
    }
  }, 60_000);

  it("a team that is not his composition falls back to Ryan's presets and says why", async () => {
    const out = await plansForTeam(["Shorekeeper", "Lynae", "Sanhua"], source());
    if (out.riley) return; // he may list it one day; the fallback is what this checks
    expect(out.rileyNote).toMatch(/presets/);
    expect(out.plans.every((p) => p.source !== "riley")).toBe(true);
  }, 60_000);
});
