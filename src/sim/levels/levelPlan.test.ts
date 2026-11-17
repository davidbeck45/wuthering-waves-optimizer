// "What each level is worth", the gains: on a small synthetic account (four armed characters with levels below the
// top and no echoes; nobody's export). A step's gain must be the engine's own figure at the new level against the
// starting one, through the path the roster ranking uses (`scoreRotation` / `scoreTeamCandidate`), and the path's
// running total must be the damage with all its steps applied.
import { beforeAll, describe, expect, it } from "vitest";
import table from "../materials/data/materials.json";
import { savedProgressOf, type MaterialsData } from "../materials/costToMax";
import { RANKING_ENEMY, rankRoster, rotationCandidates, scoreRotation, scoreTeamCandidate, teamCandidatesOf, type RosterRanking } from "../myRankings/rankRoster";
import { bestFieldableTeam } from "../account/investPlan";
import { assumedWords, basisGain, basisOf, compareWorth, inertText, levelPlan, pathHeadline, type LevelPlan, type LevelPlanOptions, type LevelRow } from "./levelPlan";
import { levelsToday, nextStep, sumCosts, topState, TRACKS, withLevels } from "./levelSteps";

const materials = table as unknown as MaterialsData;

const characters: Record<string, any> = {
  // a main DPS partway up: level 70 ascended, weapon at 80, skills mixed, one at the top, one not saved
  Camellya: { weapon: "RedSpring", characterLevel: "70+", talents: { basic: 6, skill: 8, forte: 6, liberation: 10 }, weapons: { RedSpring: { weaponLevel: "80", refinement: "1" } } },
  // her two teammates, at the calculator's defaults (nothing saved)
  Mornye: { weapon: "StarfieldCalibrator" },
  Lynae: { weapon: "SpectrumBlaster" },
  // a healer whose rotation heals more than it hits
  Verina: { weapon: "Variation", characterLevel: "60", talents: { basic: 4, skill: 4, forte: 4, liberation: 4, intro: 4 }, weapons: { Variation: { weaponLevel: "60" } } },
  // opened in the calculator, no weapon
  Jiyan: { characterLevel: "40", talents: { basic: 2 } },
};
const echoes: any[] = [];

let ranking: RosterRanking;
const rankOf = (id: string) => ranking.characters.find((c) => c.id === id) ?? null;
const run = (id: string, options: LevelPlanOptions = {}, data: Record<string, any> = characters, teams: any[] = []): Promise<LevelPlan> =>
  levelPlan({ characterId: id, characters: data, inventoryEchoes: echoes, teams, rank: rankOf(id), rankingTeams: ranking.teams, materials }, { yieldToUi: false, ...options });
const row = (plan: LevelPlan, track: string): LevelRow => plan.rows.find((r) => r.track === track)!;

let camellya: LevelPlan;

beforeAll(async () => {
  ranking = await rankRoster(characters, echoes, [], { yieldToUi: false });
  camellya = await run("Camellya");
}, 120_000);

describe("each track on its own", () => {
  it("lists the tracks with something left, from the saved levels, with what each costs", () => {
    expect(camellya.from).toBe("saved");
    expect(camellya.startText).toBe("Level 70+ · weapon level 80 · Forte skills 6 / 8 / 6 / 10 / 10");
    expect(camellya.done).toBe(false);
    expect(camellya.noGain).toBeNull();
    expect(camellya.errors).toEqual([]);
    expect(camellya.rows.map((r) => r.label).sort()).toEqual(["Forte Circuit 6 → 10", "Level 70+ → 90", "Normal Attack 6 → 10", "Resonance Skill 8 → 10", "Weapon level 80 → 90"]);
    expect(row(camellya, "skill").cost.credits).toBe(70_000 + 100_000);
    expect(row(camellya, "level").cost.ascensions).toBe(1);
    expect(camellya.rotation!.name).toBe(rankOf("Camellya")!.best!.name);
    expect(assumedWords(camellya.today!)).toBe("Intro Skill level"); // the one value the calculator has not saved
    const some = levelsToday(materials, savedProgressOf({ weapon: "RedSpring", characterLevel: "80", talents: { basic: 6, forte: 6, liberation: 6 } }));
    expect(assumedWords(some)).toBe("weapon level or Resonance Skill and Intro Skill levels");
  });

  it("a row's own gain is the engine's damage at the new level against today's, on the ranking's best rotation", async () => {
    const rank = rankOf("Camellya")!;
    // today's figure is the ranking's own
    expect(camellya.base!.damage).toBe(rank.best!.avgDamage);
    for (const r of camellya.rows) {
      const hypo = { ...characters, Camellya: withLevels(characters.Camellya, r.next, 90) };
      const after = (await scoreRotation(rank.bestRotation!, "Camellya", hypo, RANKING_ENEMY, echoes)).avgDamage;
      expect(r.own, r.label).toEqual({ base: rank.best!.avgDamage, after, gain: after / rank.best!.avgDamage - 1 });
      expect(r.own!.gain, r.label).toBeGreaterThan(0);
    }
    // and one by hand: the weapon's last ten levels are the record with only `weaponLevel` changed
    const byHand = { ...characters, Camellya: { ...characters.Camellya, weapons: { RedSpring: { weaponLevel: "90", refinement: "1" } } } };
    expect(row(camellya, "weapon").own!.after).toBe((await scoreRotation(rank.bestRotation!, "Camellya", byHand, RANKING_ENEMY, echoes)).avgDamage);
  }, 60_000);

  it("a row's team gain is the ranking's team scorer on the strongest team she can field, with her levelled", async () => {
    const best = bestFieldableTeam(ranking.teams, "Camellya")!;
    expect(camellya.team).toMatchObject({ id: best.id, name: best.name, base: best.avgDamage });
    expect(camellya.team!.characterIds).toContain("Camellya");
    const candidate = (await teamCandidatesOf(characters, [])).candidates.find((c) => c.id === best.id)!;
    for (const r of camellya.rows) {
      const hypo = { ...characters, Camellya: withLevels(characters.Camellya, r.next, 90) };
      const after = (await scoreTeamCandidate(candidate, hypo, echoes)).avgDamage;
      expect(r.team, r.label).toMatchObject({ teamId: best.id, base: best.avgDamage, avgDamage: after, gain: after / best.avgDamage - 1 });
      expect(r.teamNote).toBeNull();
    }
    expect(camellya.basis).toBe("team");
    // the biggest team gain first
    const gains = camellya.rows.filter((r) => !r.inert).map((r) => r.team!.gain);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  }, 60_000);

  it("everything together is the build at the top, and costs what the rows cost", async () => {
    const rank = rankOf("Camellya")!;
    const today = levelsToday(materials, savedProgressOf(characters.Camellya));
    const top = { ...characters, Camellya: withLevels(characters.Camellya, topState(today, today.state), 90) };
    const after = (await scoreRotation(rank.bestRotation!, "Camellya", top, RANKING_ENEMY, echoes)).avgDamage;
    expect(camellya.everything!.own!.after).toBe(after);
    expect(camellya.everything!.cost.credits).toBe(camellya.rows.reduce((n, r) => n + r.cost.credits, 0));
    // level-ups multiply: together they are worth more than the sum of each alone
    expect(camellya.everything!.own!.gain).toBeGreaterThan(camellya.rows.reduce((n, r) => n + r.own!.gain, 0));
  });
});

describe("level in this order", () => {
  it("walks every step to the top, each scored from the one before it", () => {
    expect(camellya.pathState).toBe("complete");
    expect(camellya.pathOrder).toBe("value");
    // 2 level caps (70+ → 80 → 90) + 1 weapon cap + Normal Attack 4 + Resonance Skill 2 + Forte Circuit 4
    expect(camellya.path).toHaveLength(13);
    expect(camellya.path.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(camellya.path.filter((s) => s.track === "level").map((s) => s.label)).toEqual(["Level 70+ → 80", "Level 80 → 90"]);
    expect(camellya.path[0]!.own!.base).toBe(camellya.base!.damage);
    for (let i = 1; i < camellya.path.length; i++) {
      expect(camellya.path[i]!.own!.base).toBe(camellya.path[i - 1]!.own!.after);
      expect(camellya.path[i]!.team!.base).toBe(camellya.path[i - 1]!.team!.avgDamage);
    }
    const today = levelsToday(materials, savedProgressOf(characters.Camellya));
    expect(camellya.path.at(-1)!.next).toEqual(topState(today, today.state));
  });

  it("the running total is the damage with all the steps so far applied, and the cost of those steps", async () => {
    const rank = rankOf("Camellya")!;
    const best = bestFieldableTeam(ranking.teams, "Camellya")!;
    const candidate = (await teamCandidatesOf(characters, [])).candidates.find((c) => c.id === best.id)!;
    for (const step of camellya.path) {
      const hypo = { ...characters, Camellya: withLevels(characters.Camellya, step.next, 90) };
      const own = (await scoreRotation(rank.bestRotation!, "Camellya", hypo, RANKING_ENEMY, echoes)).avgDamage;
      const team = (await scoreTeamCandidate(candidate, hypo, echoes)).avgDamage;
      expect(step.running.gain, step.label).toBe(own / camellya.base!.damage - 1);
      expect(step.running.teamGain, step.label).toBe(team / best.avgDamage - 1);
      expect(step.running.cost).toEqual(sumCosts(materials, camellya.path.slice(0, step.index).map((s) => s.cost)));
    }
    // the last running total is "everything"
    const last = camellya.path.at(-1)!;
    expect(last.running.gain).toBe(camellya.everything!.own!.gain);
    expect(last.running.teamGain).toBe(camellya.everything!.team!.gain);
    expect(last.running.cost.credits).toBe(camellya.everything!.cost.credits);
  }, 60_000);

  it("takes at each point the step that adds the most team damage per Shell Credit", async () => {
    const today = levelsToday(materials, savedProgressOf(characters.Camellya));
    const best = bestFieldableTeam(ranking.teams, "Camellya")!;
    const candidate = (await teamCandidatesOf(characters, [])).candidates.find((c) => c.id === best.id)!;
    let state = today.state;
    let teamBase = best.avgDamage;
    for (const taken of camellya.path.slice(0, 4)) {
      const values: Array<{ label: string; value: number }> = [];
      for (const { key } of TRACKS) {
        const step = nextStep(materials, "Camellya", today, state, key);
        if (!step) continue;
        const after = (await scoreTeamCandidate(candidate, { ...characters, Camellya: withLevels(characters.Camellya, step.next, 90) }, echoes)).avgDamage;
        values.push({ label: step.label, value: (after / teamBase - 1) / step.cost.credits });
      }
      values.sort((a, b) => b.value - a.value);
      expect(taken.label).toBe(values[0]!.label);
      state = taken.next;
      teamBase = taken.team!.avgDamage;
    }
    // a cheap Forte level comes before the ten-level weapon step that adds more in one go
    expect(camellya.path[0]!.track).not.toBe("weapon");
    expect(camellya.path[0]!.cost.credits).toBeLessThan(row(camellya, "weapon").cost.credits);
  }, 60_000);

  it("ordered by the biggest gain instead, the first step is the row with the most to give at its next step", async () => {
    const byGain = await run("Camellya", { pathOrder: "gain" });
    expect(byGain.pathOrder).toBe("gain");
    expect(byGain.path).toHaveLength(13);
    const first = byGain.path[0]!;
    // whatever the order, the end is the same build and the same bill
    expect(byGain.path.at(-1)!.running.gain).toBeCloseTo(camellya.path.at(-1)!.running.gain!, 12);
    expect(byGain.path.at(-1)!.running.cost.credits).toBe(camellya.path.at(-1)!.running.cost.credits);
    // the biggest single team gain among the seven tracks' next steps
    const today = levelsToday(materials, savedProgressOf(characters.Camellya));
    const best = bestFieldableTeam(ranking.teams, "Camellya")!;
    const candidate = (await teamCandidatesOf(characters, [])).candidates.find((c) => c.id === best.id)!;
    let top = { label: "", gain: -1 };
    for (const { key } of TRACKS) {
      const step = nextStep(materials, "Camellya", today, today.state, key);
      if (!step) continue;
      const after = (await scoreTeamCandidate(candidate, { ...characters, Camellya: withLevels(characters.Camellya, step.next, 90) }, echoes)).avgDamage;
      if (after / best.avgDamage - 1 > top.gain) top = { label: step.label, gain: after / best.avgDamage - 1 };
    }
    expect(first.label).toBe(top.label);
  }, 60_000);

  it("headlines the first steps on the basis the list is ordered by", () => {
    const head = pathHeadline(camellya)!;
    expect(head).toEqual({ steps: 3, gain: camellya.path[2]!.running.teamGain, basis: "team", credits: camellya.path[2]!.running.cost.credits });
    expect(pathHeadline({ path: [], basis: "team" })).toBeNull();
    expect(pathHeadline({ path: camellya.path.slice(0, 2), basis: "own" })).toMatchObject({ steps: 2, gain: camellya.path[1]!.running.gain });
  });

  it("stops when told to, and says so", async () => {
    const signal = { cancelled: false };
    const plan = await run("Camellya", { signal, onProgress: (p) => (signal.cancelled = p.path.length >= 2) });
    expect(plan.pathState).toBe("cancelled");
    expect(plan.path).toHaveLength(2);
    expect(plan.rows).toHaveLength(5); // the list was already in
    const capped = await run("Camellya", { maxPathSteps: 3 });
    expect(capped.pathState).toBe("capped");
    expect(capped.path).toHaveLength(3);
    const none = await run("Camellya", { path: false });
    expect(none.pathState).toBe("none");
    expect(none.rows).toHaveLength(5);
  }, 60_000);
});

describe("the edges", () => {
  it("everything at the top: nothing left to level, and nothing is scored", async () => {
    const plan = await run("Mornye");
    expect(plan.done).toBe(true);
    expect(plan.rows).toEqual([]);
    expect(plan.path).toEqual([]);
    expect(plan.everything).toBeNull();
    expect(plan.startText).toBe("Level 90 · weapon level 90 · all five Forte skills at 10");
    // none of it is saved: the calculator's defaults stand in, and the words say which
    expect(assumedWords(plan.today!)).toBe("level, weapon level or Forte levels");
  });

  it("from level 1 the same character has every step ahead, measured from level 1", async () => {
    const plan = await run("Mornye", { from: "scratch", path: false });
    expect(plan.from).toBe("scratch");
    expect(plan.done).toBe(false);
    expect(plan.rows).toHaveLength(7);
    expect(plan.startText).toBe("Level 1 · weapon level 1 · all five Forte skills at 1");
    expect(plan.base!.damage).toBeLessThan(rankOf("Mornye")!.best!.avgDamage);
    expect(plan.everything!.own!.after).toBeCloseTo(rankOf("Mornye")!.best!.avgDamage, 6); // the top is today's build
  });

  it("starting levels given by hand are a what-if on the same build", async () => {
    const plan = await run("Mornye", { from: { level: "80", liberation: 6 }, path: false });
    expect(plan.from).toBe("custom");
    expect(plan.rows.map((r) => r.label).sort()).toEqual(["Level 80 → 90", "Resonance Liberation 6 → 10"]);
    await expect(run("Mornye", { from: { level: "81" } })).rejects.toThrow(/Level must be one of/);
  });

  it("no weapon: says what is missing and lists the steps with their costs only", async () => {
    const plan = await run("Jiyan");
    expect(plan.noGain).toBe("Jiyan has no weapon equipped, so nothing can be scored yet");
    expect(plan.base).toBeNull();
    expect(plan.path).toEqual([]);
    expect(plan.rows.map((r) => r.label)).toEqual(["Level 40 → 90", "Normal Attack 2 → 10"]); // no weapon row; the tracks' own order
    expect(plan.rows.every((r) => r.own === null && r.team === null && !r.inert)).toBe(true);
    expect(plan.rows[0]!.cost.credits).toBeGreaterThan(0);
    expect(plan.everything!.cost.credits).toBe(plan.rows[0]!.cost.credits + plan.rows[1]!.cost.credits);
    expect(plan.today!.weaponKey).toBeNull();
  });

  it("no rotation to score on: says so and keeps the costs", async () => {
    const plan = await levelPlan({ characterId: "Camellya", characters, inventoryEchoes: echoes, teams: [], rank: { best: null, bestRotation: null }, rankingTeams: ranking.teams, materials }, { yieldToUi: false });
    expect(plan.noGain).toMatch(/^there is no rotation to score Camellya on/);
    expect(plan.rows).toHaveLength(5);
    expect(plan.rows.every((r) => r.own === null)).toBe(true);
    expect(plan.rotation).toBeNull();
  });

  it("a rotation that scores no damage on the build: says so, and keeps the costs", async () => {
    // actions the kit does not have (a rotation written for another version of the character): nothing resolves
    const rank = rankOf("Camellya")!;
    const empty = { ...rank.bestRotation!, actions: [{ id: "x1", key: "NoSuchAttackDMG", type: "basic", count: 1, buffs: [] }] };
    const plan = await levelPlan({ characterId: "Camellya", characters, inventoryEchoes: echoes, teams: [], rank: { best: { ...rank.best!, name: "Old loop" }, bestRotation: empty }, rankingTeams: ranking.teams, materials }, { yieldToUi: false });
    expect(plan.noGain).toBe("Camellya's best rotation scores no damage on this build");
    expect(plan.base).toBeNull();
    expect(plan.rows).toHaveLength(5);
    expect(plan.rows.every((r) => r.own === null && r.cost.credits > 0)).toBe(true);
    expect(plan.path).toEqual([]);
    expect(plan.team).toBeNull();
  });

  it("a skill the rotation never uses is called that, with the rotation's name, and is left out of the path", async () => {
    const rank = rankOf("Camellya")!;
    // the same rotation without its Forte Circuit actions
    const trimmed = { ...rank.bestRotation!, actions: rank.bestRotation!.actions.filter((a) => a.type !== "forteCircuit") };
    expect(trimmed.actions.length).toBeLessThan(rank.bestRotation!.actions.length);
    const plan = await levelPlan(
      { characterId: "Camellya", characters, inventoryEchoes: echoes, teams: [], rank: { best: { ...rank.best!, name: "No Forte loop" }, bestRotation: trimmed }, rankingTeams: [], materials },
      { yieldToUi: false },
    );
    const forte = row(plan, "forte");
    expect(forte.inert).toBe(true);
    expect(forte.own).toMatchObject({ gain: 0 });
    expect(plan.rows.at(-1)).toBe(forte); // inert rows last
    expect(plan.inert.map((r) => r.label)).toEqual(["Forte Circuit 6 → 10"]);
    expect(inertText(forte, plan.rotation!.name)).toBe("not used in this rotation (No Forte loop)");
    expect(inertText(row(plan, "level"), null)).toBe("changes nothing on this rotation");
    expect(plan.path.some((s) => s.track === "forte")).toBe(false);
    expect(plan.path).toHaveLength(13 - 4);
    // the path's bill plus the skipped track's is everything's
    expect(plan.path.at(-1)!.running.cost.credits + forte.cost.credits).toBe(plan.everything!.cost.credits);
    // no team was passed: says why, and orders by own damage
    expect(plan.team).toBeNull();
    expect(plan.basis).toBe("own");
    expect(plan.teamNote).toBeTruthy();
    expect(plan.rows.every((r) => r.team === null)).toBe(true);
  }, 60_000);

  it("a healer: the rows carry what each step adds to healing, and healing is what they are ordered by", async () => {
    // her curated rotation, the one with her heals in it (a wuwa_calc loop of hits alone can outscore it on damage)
    const healer = (await rotationCandidates("Verina", characters.Verina)).find((c) => c.name === "Healer Rotation")!;
    const score = await scoreRotation(healer.rotation, "Verina", characters, RANKING_ENEMY, echoes);
    const plan = await levelPlan(
      { characterId: "Verina", characters, inventoryEchoes: echoes, teams: [], rank: { best: { name: healer.name, source: healer.source, ...score }, bestRotation: healer.rotation }, rankingTeams: ranking.teams, materials },
      { yieldToUi: false },
    );
    expect(plan.rotation!.name).toBe("Healer Rotation");
    expect(plan.base!.healing).toBeGreaterThan(plan.base!.damage);
    expect(plan.basis).toBe("healing");
    const healing = plan.rows.map((r) => r.healing!.gain);
    expect(healing).toEqual([...healing].sort((a, b) => b - a));
    expect(healing[0]).toBeGreaterThan(0);
    // Resonance Liberation carries most of her healing; her own damage would have put another row first
    expect(plan.rows[0]!.track).toBe("liberation");
    const byOwn = [...plan.rows].sort(compareWorth("own"));
    expect(byOwn[0]!.track).not.toBe("liberation");
    expect(pathHeadline(plan)).toMatchObject({ basis: "healing", gain: plan.path[2]!.running.healingGain });
    // a step that heals nothing but hits is not inert
    expect(row(plan, "skill")).toMatchObject({ inert: false });
    expect(row(plan, "skill").healing!.gain).toBe(0);
  }, 60_000);

  it("no team to field: says which kind of none, and the figures are the character's own", async () => {
    const plan = await run("Verina", { path: false });
    expect(plan.team).toBeNull();
    expect(plan.teamNote).toMatch(/not in a team you can field|the app has no team rotation with Verina/);
    expect(plan.rows.every((r) => r.team === null && r.teamNote === plan.teamNote)).toBe(true);
  });

  it("the team pins another build: level and Forte keep an exact team figure, the weapon step has none and says why", async () => {
    const preset = (await teamCandidatesOf(characters, [])).candidates.find((c) => c.id === bestFieldableTeam(ranking.teams, "Camellya")!.id)!;
    const slot = preset.team.characterIds.indexOf("Camellya");
    // her active build, and a second saved build the team is pinned to: the same weapon at its last level, so the
    // saved team outscores the preset and is the strongest team she can field (the one the drawer measures on)
    const built = {
      ...characters.Camellya,
      activeBuildId: "active",
      builds: [
        { id: "active", name: "Default build", weapon: "RedSpring", weapons: { RedSpring: { weaponLevel: "80", refinement: "1" } } },
        { id: "other", name: "Team build", weapon: "RedSpring", weapons: { RedSpring: { weaponLevel: "90", refinement: "1" } } },
      ],
    };
    const data = { ...characters, Camellya: built };
    const team = { id: "mine", name: "My Camellya team", characterIds: preset.team.characterIds, buildIds: preset.team.characterIds.map((_, i) => (i === slot ? "other" : null)), actions: preset.team.actions, duration: preset.team.duration, handoffs: preset.team.handoffs ?? null };
    const pinnedRanking = await rankRoster(data, echoes, [team], { yieldToUi: false });
    expect(bestFieldableTeam(pinnedRanking.teams, "Camellya")!.id).toBe("mine");
    const input = { characterId: "Camellya", characters: data, inventoryEchoes: echoes, teams: [team], rank: pinnedRanking.characters.find((c) => c.id === "Camellya")!, rankingTeams: pinnedRanking.teams, materials };
    const plan = await levelPlan(input, { yieldToUi: false });
    // asked for by name, the same team gives the same plan
    const named = await levelPlan(input, { yieldToUi: false, teamId: "mine", path: false });
    expect(named.rows.map((r) => [r.label, r.team?.gain ?? null])).toEqual(plan.rows.map((r) => [r.label, r.team?.gain ?? null]));
    expect(plan.team).toMatchObject({ id: "mine", name: "My Camellya team" });
    expect(plan.buildNote).toMatch(/^the team runs Camellya's "Team build" build\. Level and Forte levels are shared by every build/);
    const weapon = row(plan, "weapon");
    expect(weapon.team).toBeNull();
    expect(weapon.teamNote).toBe('the team runs Camellya\'s "Team build" build');
    expect(weapon.own!.gain).toBeGreaterThan(0); // her own figure is the active build's
    // level and Forte: the team figure is the pinned team re-scored with the shared fields changed
    const mine = (await teamCandidatesOf(data, [team])).candidates.find((c) => c.id === "mine")!;
    const base = (await scoreTeamCandidate(mine, data, echoes)).avgDamage;
    expect(plan.team!.base).toBe(base);
    for (const r of plan.rows.filter((x) => x.track !== "weapon")) {
      const after = (await scoreTeamCandidate(mine, { ...data, Camellya: withLevels(built, r.next, 90) }, echoes)).avgDamage;
      expect(r.team, r.label).toMatchObject({ teamId: "mine", base, avgDamage: after });
      expect(after).toBeGreaterThanOrEqual(base); // a skill the team's rotation never uses moves the team by nothing
    }
    expect(row(plan, "level").team!.gain).toBeGreaterThan(0);
    // rows with a team figure come before the one without
    expect(plan.rows.at(-1)!.track).toBe("weapon");
    // "everything" for the team leaves the weapon step out, since the team's build does not carry it
    const today = levelsToday(materials, savedProgressOf(built));
    const top = topState(today, today.state);
    const everything = (await scoreTeamCandidate(mine, { ...data, Camellya: withLevels(built, { ...top, weapon: today.state.weapon }, 90) }, echoes)).avgDamage;
    expect(plan.everything!.team!.avgDamage).toBe(everything);
  }, 120_000);

  it("a team the character is not in, or one that cannot be fielded, gives no team figure and the reason", async () => {
    const plan = await run("Camellya", { teamId: "curated:nope", path: false });
    expect(plan.team).toBeNull();
    expect(plan.teamNote).toBe("Camellya is not in that team");
    expect(plan.rows.every((r) => r.own !== null && r.team === null)).toBe(true);
  });

  it("a character the cost table has no entry for is left unfilled", async () => {
    const without = { ...materials, characters: { ...materials.characters } };
    delete (without.characters as Record<string, unknown>).Camellya;
    const plan = await levelPlan({ characterId: "Camellya", characters, inventoryEchoes: echoes, teams: [], rank: rankOf("Camellya"), rankingTeams: ranking.teams, materials: without }, { yieldToUi: false });
    expect(plan.today).toBeNull();
    expect(plan.rows).toEqual([]);
    expect(plan.table.gameVersion).toBe(materials.gameVersion);
  });
});

describe("the ordering", () => {
  const fake = (track: LevelRow["track"], own: number | null, team: number | null, healing: number | null, credits: number, inert = false): LevelRow =>
    ({
      track,
      from: "",
      to: "",
      label: track,
      next: {} as never,
      cost: { credits, resonatorExp: 0, weaponExp: 0, expItems: [], ascensions: 0, materials: [] },
      own: own == null ? null : { base: 100, after: 100 * (1 + own), gain: own },
      healing: healing == null ? null : { base: 100, after: 100 * (1 + healing), gain: healing },
      shield: null,
      team: team == null ? null : ({ gain: team } as never),
      teamNote: null,
      inert,
    }) as LevelRow;

  it("picks the basis from what the rotation does and whether a team could be scored", () => {
    expect(basisOf({ damage: 1000, healing: 0, shield: 0 }, true)).toBe("team");
    expect(basisOf({ damage: 1000, healing: 0, shield: 0 }, false)).toBe("own");
    expect(basisOf({ damage: 1000, healing: 900, shield: 0 }, true)).toBe("team"); // a DPS with a self-heal
    expect(basisOf({ damage: 1000, healing: 3000, shield: 0 }, true)).toBe("healing");
    expect(basisOf({ damage: 1000, healing: 500, shield: 3000 }, false)).toBe("shield");
    expect(basisOf(null, true)).toBe("team");
  });

  it("orders by the basis, rows with no figure there after rows with one, inert rows last", () => {
    const rows = [fake("basic", 0.2, null, null, 100), fake("skill", 0.01, 0.05, null, 100), fake("forte", 0.3, 0.02, null, 100), fake("intro", 0, 0, null, 100, true)];
    expect([...rows].sort(compareWorth("team")).map((r) => r.track)).toEqual(["skill", "forte", "basic", "intro"]);
    expect([...rows].sort(compareWorth("own")).map((r) => r.track)).toEqual(["forte", "basic", "skill", "intro"]);
    expect(basisGain(rows[0]!, "team")).toBeNull();
    expect(basisGain(rows[1]!, "healing")).toBe(0);
  });

  it("per Shell Credit, a small cheap step outranks a big dear one", () => {
    const rows = [fake("weapon", 0.08, 0.06, null, 496_480), fake("skill", 0.04, 0.035, null, 30_000)];
    expect([...rows].sort(compareWorth("team")).map((r) => r.track)).toEqual(["weapon", "skill"]);
    expect([...rows].sort(compareWorth("team", true)).map((r) => r.track)).toEqual(["skill", "weapon"]);
  });
});
