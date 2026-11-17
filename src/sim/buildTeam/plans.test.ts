// Build my team's plan per member: wuwa_calc's pick, joined to the team's own members.
// 2026-11-16, second check of the male Rover fix: his run names a Rover by the female key, so a male Rover never got
// his pick. On an account that plays Rover Aero (Male), Rover Aero · Suisui + Cartethyia read "Your current build"
// and "no measured need" for him, called him Main DPS and served him echoes first, ahead of Cartethyia, who deals 92 %
// of that team's damage in the same run.
import { describe, expect, it } from "vitest";
import type { MineSolve, RunLite, RunMember } from "../engine/rileyRun";
import { plansForTeam, type RileySource } from "./plans";
import { priorityOrder } from "./rileyPlan";

const member = (over: Partial<RunMember>): RunMember =>
  ({
    name: "",
    appKey: "",
    mainDps: false,
    owned: true,
    sequence: 0,
    weapon: "",
    refinement: 1,
    weaponApproximated: false,
    matrix: false,
    echo: "Windward Pilgrimage",
    sets: ["Windward Pilgrimage 5pc"],
    mainEcho: "",
    mainStats: "43311 CR Aero Aero atk atk",
    spread: "My build",
    minEr: 0,
    share: 0,
    dps: 0,
    ...over,
  }) as RunMember;

/** his best row for Aero Rover + Suisui + Cartethyia: the Rover under the one key his names map to */
const rover = member({ name: "Aero Rover", appKey: "RoverAeroFemale", share: 0.08, dps: 10_587 });
const suisui = member({ name: "Suisui", appKey: "Suisui", share: 0, dps: 0 });
const cartethyia = member({ name: "Cartethyia", appKey: "Cartethyia", mainDps: true, share: 0.92, dps: 123_589 });

const riley: RileySource = {
  teamKeysFor: async () => ["t77"],
  solveMine: async () => [{ teamKey: "t77", names: ["Aero Rover", "Suisui", "Cartethyia"], appKeys: ["RoverAeroFemale", "Suisui", "Cartethyia"], status: "ok", fieldable: true, best: { rowKey: "t77-x", picks: [], total: 134_176, bySlot: {}, seconds: 25, members: [rover, suisui, cartethyia] } } satisfies MineSolve],
  tracedRun: async () => ({ needs: { "Aero Rover": { bar: 128.4, minEr: 0 } } }) as unknown as RunLite,
};

describe("wuwa_calc's pick reaches a Rover in the form the account plays", () => {
  it("a male Rover gets his pick, his ER floor and his place in the order", async () => {
    const his = ["RoverAeroMale", "Suisui", "Cartethyia"];
    const { plans } = await plansForTeam(his, riley, { high: false });
    // each plan is for the member in that slot, under the key the team holds
    expect(plans.map((p) => p.characterId)).toEqual(his);
    expect(plans[0]).toMatchObject({ source: "riley", mainDps: false, share: 0.08, dps: 10_587, erNeed: 128.4, erSetBy: "loop" });
    expect(plans[2]).toMatchObject({ source: "riley", mainDps: true, share: 0.92 });
    // Cartethyia deals the damage, so she is served first; he was first, on "the main DPS when there is no share"
    expect(priorityOrder(plans)[0]).toBe(2);
  });

  it("the female form reads as before, and so does everyone else", async () => {
    const { plans } = await plansForTeam(["Cartethyia", "RoverAeroFemale", "Suisui"], riley, { high: false });
    expect(plans.map((p) => `${p.characterId}:${p.source}`)).toEqual(["Cartethyia:riley", "RoverAeroFemale:riley", "Suisui:riley"]);
  });

  it("another element's Rover is another kit: no pick of the Aero Rover's for him", async () => {
    const { plans } = await plansForTeam(["RoverHavocMale", "Suisui", "Cartethyia"], riley, { high: false, currentEchoes: () => [] });
    expect(plans[0]!.source).not.toBe("riley");
  });
});
