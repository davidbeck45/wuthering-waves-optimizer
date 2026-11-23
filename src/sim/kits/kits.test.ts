// Wuthering Tools+: gates the GENERATED kit tables under ./data (wuwa-tools rotation-port/export_kits.mjs) the way
// presets/wuwaCalcPresets.test.ts gates the stock presets: every kit resolves to an app character or is left out by
// the registry rule, and every team, weapon-less member and breakpoint it names resolves. Then the model's readings.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import kitsFile from "./data/kits.json";
import indexFile from "./data/kitIndex.json";
import { allCharactersList } from "../../characters/characters";
import { isRosterCharacter } from "../display/names";
import { RILEY_TIERS } from "../rankings/filterChips";
import { appKeyOf, rileyNameOf } from "../rankings/rileyNames";
import { loadSequenceBreakpoints } from "../presets";
import {
  differsText,
  weaponKindLabel,
  unmetText,
  COST_CODE,
  changeScope,
  costLabel,
  dpsText,
  fieldableTeams,
  filterKits,
  findKit,
  kitPath,
  kitPathOfCharacter,
  kitSlug,
  kitsInApp,
  ladderSteps,
  lateLoadouts,
  loadoutTitles,
  loopAt,
  loopChanges,
  loopSentence,
  nearestCost,
  mainstatText,
  mixText,
  rankingsPath,
  roleText,
  rolesOf,
  signedPercent,
  teamOf,
  teamsWith,
  teamsByCost,
  weaponSteps,
  type Kit,
  type KitIndexFile,
  type KitsFile,
  type KitTeamFact,
  buildTeamsText,
} from "./kits";

const file = kitsFile as unknown as KitsFile;
const index = (indexFile as KitIndexFile).kits;
const characterKeys = new Set(allCharactersList.map((c) => c.key));
const kits = Object.values(file.kits);

describe("kit briefs (generated data)", () => {
  it("is stamped with both commits, the basis and the unit, like every generated table", () => {
    expect(file._meta.generatedBy).toContain("export_kits.mjs");
    expect(file._meta.wuwaCalcCommit).toMatch(/^[0-9a-f]{7,}$/);
    expect(file._meta.appCommit).toMatch(/^[0-9a-f]{7,}$/);
    expect(file._meta.basis).toContain("Lv100");
    expect(file._meta.unit).toContain("per second");
    expect(indexFile._meta.wuwaCalcCommit).toBe(file._meta.wuwaCalcCommit);
  });

  it("a kit whose stock loops list motion values that differ from the game carries them, and no other kit does (none since Lily's released kit)", () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../presets/data/rotations") + "/";
    const differsIn = (key: string): Set<string> => {
      const f = `${dir}${key}.json`;
      if (!existsSync(f)) return new Set();
      const text = JSON.stringify(JSON.parse(readFileSync(f, "utf8")));
      return new Set([...text.matchAll(/(?:: |; )([^;:]+?) [\d.]+% \u2192 (\w+) [\d.]+%/g)].map((m) => m[1]!));
    };
    for (const kit of kits) {
      const casts = differsIn(kit.appKey);
      expect(new Set(kit.differs?.rows.map((r) => r.cast) ?? []), kit.name).toEqual(casts);
    }
    // Lily's four Basic Attack stages were the 3.8 beta's until Riley's 7b4acd0 (2026-11-21); his kit is the released
    // game's now, so no stock loop lists a value that differs and no brief carries the warning
    expect(kits.filter((k) => k.differs?.rows.length).map((k) => k.name)).toEqual([]);
  });

  it("names a weapon's kind by its rarity: signature, standard 5★ or 4★", () => {
    // Riley's table tags every non-signature weapon alike since his e7a10a9 (2026-11-22), the craftable 4★ too; the
    // export reads the star rarity off the weapon's Lv90 base ATK, so Cadenza reads 4★ and Static Mist standard 5★
    expect(file.kits.Lily!.loadouts[0]!.weapons.map((w) => [w.name, w.kind, weaponKindLabel(w.kind)])).toEqual([
      ["Lullaby", "Limited", "signature"],
      ["Cadenza", "Free", "4★"],
      ["Static Mist", "Standard", "standard 5★"],
    ]);
    const kinds = new Map(kits.flatMap((k) => k.loadouts.flatMap((l) => l.weapons.map((w) => [w.name, w.kind] as const))));
    for (const name of ["Variation", "Lumingloss", "Augment", "Marcato", "Overture", "Discord"]) expect(kinds.get(name), name).toBe("Free");
    for (const name of ["Emerald of Genesis", "Cosmic Ripples", "Abyss Surges"]) expect(kinds.get(name), name).toBe("Standard");
  });

  it("the index and the briefs name the same resonators, with the same facts", () => {
    expect(index.map((k) => k.name)).toEqual(Object.keys(file.kits));
    expect(index.length).toBeGreaterThan(40);
    for (const row of index) {
      const kit = file.kits[row.name]!;
      expect({ appKey: kit.appKey, element: kit.element, weapon: kit.weapon, tier: kit.tier, main: kit.teams.main, support: kit.teams.support, sustain: Boolean(kit.sustain) }, row.name).toEqual({
        appKey: row.appKey,
        element: row.element,
        weapon: row.weapon,
        tier: row.tier,
        main: row.main,
        support: row.support,
        sustain: Boolean(row.sustain),
      });
    }
  });

  it("every kit resolves to an app character, or is left out by the registry rule", () => {
    const shown = kitsInApp(index, isRosterCharacter);
    const hidden = index.filter((k) => !shown.includes(k));
    expect(shown.length).toBeGreaterThan(40);
    for (const kit of shown) {
      expect(characterKeys.has(kit.appKey), `${kit.name} -> ${kit.appKey}`).toBe(true);
      expect(appKeyOf(kit.name), kit.name).toBe(kit.appKey);
      expect(rileyNameOf(kit.appKey), kit.name).toBe(kit.name);
      // the app's own registry agrees on element and weapon type (its weapon names are singular too)
      const meta = allCharactersList.find((c) => c.key === kit.appKey)!;
      expect(meta.element, `${kit.name} element`).toBe(kit.element);
    }
    // whoever is hidden is hidden because the app's list lacks them: nothing else
    for (const kit of hidden) expect(isRosterCharacter(kit.appKey), kit.name).toBe(false);
  });

  it("every team, alternate, pick and ladder row names builds the table holds, and every member has a brief", () => {
    const names = new Set(index.map((k) => k.name));
    const check = (fact: KitTeamFact, where: string): void => {
      const team = teamOf(file, fact);
      expect(team, where).not.toBeNull();
      expect(team!.members, where).toHaveLength(3);
      for (const m of team!.members) expect(names.has(m.name), `${where}: ${m.name}`).toBe(true);
      for (const a of team!.alts) expect(names.has(a.member.name), `${where}: alt ${a.member.name}`).toBe(true);
      expect(fact.dps, where).toBeGreaterThan(0);
      expect(fact.share, where).toBeLessThanOrEqual(fact.dps);
      for (const slot of fact.mains) expect(slot, where).toBeLessThan(3);
      if (fact.alts) expect(fact.flex, where).toBeGreaterThanOrEqual(0);
    };
    for (const kit of kits) {
      expect(Object.keys(kit.best), kit.name).toEqual(file._meta.costs.map((c) => c.key));
      for (const [cost, rows] of Object.entries(kit.best)) {
        expect(rows.length, `${kit.name} ${cost}`).toBeGreaterThan(0);
        rows.forEach((fact, n) => {
          check(fact, `${kit.name} ${cost} #${n}`);
          expect(teamOf(file, fact)!.members.some((m) => m.name === kit.name), `${kit.name} ${cost} #${n} fields them`).toBe(true);
        });
        // best first
        expect(rows.map((r) => r.dps), `${kit.name} ${cost}`).toEqual([...rows.map((r) => r.dps)].sort((a, b) => b - a));
      }
      if (kit.mix) check(kit.mix.team, `${kit.name} mix`);
      expect(kit.ladder, `${kit.name} ladder`).not.toBeNull();
      check(kit.ladder!.team, `${kit.name} ladder`);
      // the ladder's own row is the team it says it runs in
      expect(kit.ladder!.seq.find((s) => s.level === kit.ladder!.held.sequence)?.dps, `${kit.name} ladder base`).toBe(kit.ladder!.team.dps);
      for (const l of kit.loadouts) {
        expect(l.pick, `${kit.name} ${l.id} pick`).not.toBeNull();
        check(l.pick!.team, `${kit.name} ${l.id} pick`);
        expect(l.weapons.map((w) => w.name), `${kit.name} ${l.id}`).toContain(l.pick!.weapon);
        expect(l.pick!.mainstat.reduce((n, [cost]) => n + cost, 0), `${kit.name} ${l.id} echo cost`).toBeLessThanOrEqual(12);
        expect(l.pick!.mainstat, `${kit.name} ${l.id}`).toHaveLength(5);
        expect(l.substats, `${kit.name} ${l.id}`).toHaveLength(6);
      }
    }
  });

  it("every Team Cost has a /rankings code and a label the rankings bar knows", () => {
    for (const c of file._meta.costs) {
      expect(COST_CODE[c.key], c.key).toBeDefined();
      expect(RILEY_TIERS.some((t) => t.code === COST_CODE[c.key]), c.key).toBe(true);
      expect(costLabel(c.key), c.key).not.toBe(c.key);
      expect(c.means.length, c.key).toBeGreaterThan(10);
    }
    expect(rankingsPath("s6r5", ["Aemeath", "Luuk Herssen"])).toBe("/rankings#tc=s6r5&r=Aemeath,LuukHerssen");
    expect(rankingsPath("s0r1", ["Aemeath"])).toBe("/rankings#r=Aemeath"); // his default view writes no tc=
    expect(rankingsPath("s0r1", [])).toBe("/rankings");
  });

  it("every breakpoint the briefs name is one the app's breakpoints table holds, at the same level and kind", async () => {
    let changes = 0;
    for (const kit of kitsInApp(kits, isRosterCharacter)) {
      const table = await loadSequenceBreakpoints(kit.appKey);
      expect(table, kit.name).not.toBeNull();
      for (const l of kit.loadouts) {
        for (const c of l.changes) {
          const match = table!.loadouts.some((t) => t.loopChangesAt.includes(c.level) && t.changes[String(c.level)]?.kind === c.kind);
          expect(match, `${kit.name} ${l.id} S${c.level} ${c.kind}`).toBe(true);
          changes += 1;
        }
        expect(Object.keys(l.loops).length, `${kit.name} ${l.id} has a loop`).toBeGreaterThan(0);
        expect(loopAt(l, 6)?.casts.length, `${kit.name} ${l.id} loop at S6`).toBeGreaterThan(0);
      }
      // the sequences are the table's, S1 to S6
      expect(kit.sequences.map((s) => s.level), kit.name).toEqual(table!.sequences.map((s) => s.level));
      for (const s of kit.sequences) {
        const kinds = kit.loadouts.flatMap((l) => l.changes.filter((c) => c.level === s.level).map((c) => c.kind));
        expect(s.kind, `${kit.name} S${s.level}`).toBe(kinds.includes("loop") ? "loop" : kinds.includes("order") ? "order" : kinds.length ? "chain" : null);
      }
    }
    expect(changes).toBeGreaterThan(8);
  });

  it("no text on the pages names a datamine site", () => {
    const text = JSON.stringify(file);
    expect(/nanoka|hakush|encore\.moe/i.test(text)).toBe(false);
  });
});

describe("who the app shows (the registry rule)", () => {
  // a made-up file: "Zzyzx" is a resonator the engine has and the app does not
  const builds: KitsFile["builds"] = [
    ["Aemeath", "Aemeath", 0, "Everbright Polestar", 1],
    ["Lynae", "Lynae", 0, "Spectrum Blaster", 1],
    ["Zzyzx", "Zzyzx", 0, "Made Up", 1],
    ["Mornye", "Mornye", 0, "Starfield Calibrator", 1],
    ["Shorekeeper", "Shorekeeper", 0, "Stellar Symphony", 1],
  ];
  const made = { builds };
  const inApp = (key: string): boolean => key !== "Zzyzx";
  const rows: KitTeamFact[] = [
    { m: [2, 1, 0], mains: [2], dps: 100, share: 60, flex: 0, alts: [[3, 90, 55], [4, 80, 50]] }, // Zzyzx in the flex slot
    { m: [3, 2, 0], mains: [2], dps: 95, share: 50 }, // Zzyzx in a fixed slot
    { m: [4, 1, 0], mains: [2], dps: 70, share: 40 },
  ];

  it("leaves a resonator the app has no character for out of the list, by the app's list alone", () => {
    const list = [
      { name: "Aemeath", appKey: "Aemeath", element: "Fusion", weapon: "Sword", tier: "Limited", main: 1, support: 0 },
      { name: "Zzyzx", appKey: "Zzyzx", element: "Aero", weapon: "Sword", tier: "Limited", main: 0, support: 3 },
    ];
    expect(kitsInApp(list, inApp).map((k) => k.name)).toEqual(["Aemeath"]);
    expect(kitsInApp(list, () => true).map((k) => k.name)).toEqual(["Aemeath", "Zzyzx"]); // the day the app has them
    expect(kitPathOfCharacter("Zzyzx", list, inApp)).toBeNull();
    expect(kitPathOfCharacter("Zzyzx", list, () => true)).toBe("/kit/zzyzx");
    expect(isRosterCharacter("Zzyzx")).toBe(false);
  });

  it("a team with them in the flex slot falls to the best alternate the app has; any other team with them is left out", () => {
    const teams = fieldableTeams(made, rows, inApp);
    expect(teams.map((t) => t.members.map((m) => m.name).join("+"))).toEqual(["Mornye+Lynae+Aemeath", "Shorekeeper+Lynae+Aemeath"]);
    expect(teams[0]).toMatchObject({ dps: 90, share: 55, insteadOf: "Zzyzx", seconds: null });
    expect(teams[0]!.alts.map((a) => a.member.name)).toEqual(["Shorekeeper"]); // the pick itself is not its own alternate
    expect(teams[0]!.members[2]!.main).toBe(true);
    expect(teams[1]).toMatchObject({ dps: 70, insteadOf: null });
  });

  it("with the character in the app, the same rows stand as generated", () => {
    const teams = fieldableTeams(made, rows, () => true);
    expect(teams.map((t) => t.dps)).toEqual([100, 95, 70]);
    expect(teams[0]!.members[0]!.name).toBe("Zzyzx");
    expect(teams[0]!.insteadOf).toBeNull();
    expect(teams[0]!.alts.map((a) => a.member.name)).toEqual(["Mornye", "Shorekeeper"]);
  });

  it("teams with a resonator are read from every brief's rows, alternates included, never one the app lacks", () => {
    const table = {
      builds,
      kits: {
        Aemeath: { name: "Aemeath", best: { s0r1: rows } },
        Mornye: { name: "Mornye", best: { s0r1: [{ m: [3, 1, 0], mains: [2], dps: 90, share: 4, flex: 0, alts: [[4, 80, 5]] }] } },
      },
    } as unknown as KitsFile;
    // Mornye's own row, and nothing else: Aemeath's rows field her only as an alternate of a row that is the same team
    const mornye = teamsWith(table, "s0r1", "Mornye", inApp);
    expect(mornye.map((t) => [t.members.map((m) => m.name).join("+"), t.dps, t.share])).toEqual([["Mornye+Lynae+Aemeath", 90, 4]]);
    // Shorekeeper has no brief here: her teams come from the others' rows and alternates, without her part of them
    const shorekeeper = teamsWith(table, "s0r1", "Shorekeeper", inApp);
    expect(shorekeeper.map((t) => [t.members.map((m) => m.name).join("+"), t.dps, t.share])).toEqual([
      ["Shorekeeper+Lynae+Aemeath", 80, null],
    ]);
    // Aemeath: her own rows keep her part; the team with the absent resonator is out, its alternates stand as teams
    const aemeath = teamsWith(table, "s0r1", "Aemeath", inApp);
    expect(aemeath.map((t) => [t.members.map((m) => m.name).join("+"), t.dps, t.share])).toEqual([
      ["Mornye+Lynae+Aemeath", 90, 55],
      ["Shorekeeper+Lynae+Aemeath", 80, 50],
    ]);
    expect(teamsWith(table, "s0r1", "Zzyzx", inApp)).toEqual([]);
    expect(teamsWith(table, "s0r1", "Zzyzx", () => true).map((t) => t.dps)).toEqual([100, 95]);
    expect(teamsWith(table, "s6r5", "Aemeath", inApp)).toEqual([]); // a Team Cost the table lacks
  });

  it("on the shipped file, a support's teams reach past her own three rows, each once, best first", () => {
    const own = fieldableTeams(file, file.kits.Mornye!.best.s0r1, isRosterCharacter);
    const all = teamsWith(file, "s0r1", "Mornye", isRosterCharacter);
    expect(all.length).toBeGreaterThan(own.length + 5);
    for (const t of all) {
      expect(t.members.some((m) => m.name === "Mornye")).toBe(true);
      for (const m of t.members) expect(isRosterCharacter(m.appKey), m.name).toBe(true);
    }
    expect(all.map((t) => t.dps)).toEqual([...all.map((t) => t.dps)].sort((a, b) => b - a));
    const ids = all.map((t) => t.members.map((m) => m.label).sort().join("+"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(all[0]!.share).not.toBeNull(); // her best row is her own
    expect(all.some((t) => t.share === null)).toBe(true); // and others come from another brief
  });

  it("on the shipped file, no shown team fields a resonator the app lacks, and every kit keeps a team at every cost", () => {
    for (const kit of kitsInApp(kits, isRosterCharacter)) {
      for (const row of teamsByCost(file, kit as Kit, isRosterCharacter)) {
        expect(row.teams.length, `${kit.name} ${row.cost}`).toBeGreaterThan(0);
        for (const t of row.teams) {
          for (const m of t.members) expect(isRosterCharacter(m.appKey), `${kit.name} ${row.cost}: ${m.name}`).toBe(true);
          for (const a of t.alts) expect(isRosterCharacter(a.member.appKey), `${kit.name} ${row.cost}: alt ${a.member.name}`).toBe(true);
        }
      }
    }
  });
});

describe("the model's readings", () => {
  it("a press the engine lets through short of its gauge is said in a player's words (Lily's Outro); none, nothing", () => {
    expect(unmetText({}, "Aemeath")).toBeNull();
    const lily = file.kits.Lily!;
    // her Woven heavies ran without their 300 Forte gauge on the 3.8 beta's kit (17 teams each); her released kit fills
    // it (Riley's 7b4acd0), so what is left is her Outro short of Concerto in one team
    expect(lily.unmet?.map((u) => u.cast)).toEqual(["Outro - Blooming Fragrance"]);
    for (const u of lily.unmet!) {
      expect(u.gauge, u.cast).toMatch(/^(concerto|forte\d)$/);
      expect(u.need, u.cast).toBeGreaterThan(0);
      expect(u.teams, u.cast).toBeGreaterThan(0);
    }
    const t = unmetText(lily, "Lily")!;
    expect(t.head).toBe("Riley's engine lets Lily press some attacks without the gauge they need, and counts their damage.");
    expect(t.rows[0]).toMatch(/^Outro - Blooming Fragrance: needs 100 Concerto Energy, pressed short of it in \d+ teams? run for this page$/);
    expect(unmetText({ unmet: [{ cast: "Forte Heavy - Woven Fairytale", gauge: "forte1", need: 300, teams: 17 }] }, "Lily")!.rows).toEqual([
      "Forte Heavy - Woven Fairytale: needs 300 Forte gauge, pressed short of it in 17 teams run for this page",
    ]);
    expect(t.tail).toContain("can be higher than the game allows");
    // the only resonator the engine warns about tonight; a new one shows up here and gets its note by itself
    expect(kits.filter((k) => k.unmet?.length).map((k) => k.name)).toEqual(["Lily"]);
  });

  it("a brief whose engine kit is not the released game's opens with a plain warning; one that is says nothing", () => {
    expect(differsText({}, "Aemeath")).toBeNull();
    expect(differsText({ differs: { why: "x", rows: [] } }, "Aemeath")).toBeNull();
    // Lily's brief as it was on the 3.8 beta's kit (batch 4's data): no kit carries one since her released kit
    const beta = { differs: { why: "wuwa_calc's Lily is the 3.8 beta's kit, the app's rows are the released game's", source: "3.8 beta", rows: [{ cast: "Basic - Mend and Cleanse 1", calc: 74.28, row: "BasicAttackStage1DMG", app: 63.62 }] } };
    expect(differsText(file.kits.Lily!, "Lily")).toBeNull();
    const t = differsText(beta, "Lily")!;
    expect(t.head).toBe("Riley's engine still has Lily's kit from the 3.8 beta, not the released game's.");
    expect(t.rows[0]).toBe("Basic - Mend and Cleanse 1: hits for 74.28 % in his engine, 63.62 % in the released game");
    expect(t.tail).toContain("uses the 3.8 beta numbers");
    expect(differsText({ differs: { why: "other data", rows: [{ cast: "A", calc: 10, row: "R", app: 12 }] } }, "X")!.head).toBe("Riley's engine holds other numbers for X than the released game.");
  });

  it("finds a brief by slug, by Riley's name and by either Rover key", () => {
    expect(kitSlug("Luuk Herssen")).toBe("luuk-herssen");
    expect(kitPath("Aero Rover")).toBe("/kit/aero-rover");
    expect(findKit(index, "luuk-herssen")?.name).toBe("Luuk Herssen");
    expect(findKit(index, "Luuk Herssen")?.name).toBe("Luuk Herssen");
    expect(findKit(index, "LuukHerssen")?.name).toBe("Luuk Herssen");
    expect(findKit(index, "RoverAeroMale")?.name).toBe("Aero Rover");
    expect(findKit(index, "RoverAeroFemale")?.name).toBe("Aero Rover");
    expect(findKit(index, "YangyangXuanling")?.name).toBe("Xuanling");
    expect(findKit(index, "nobody")).toBeNull();
    expect(findKit(index, "")).toBeNull();
    // every brief's address is its own
    expect(new Set(index.map((k) => kitSlug(k.name))).size).toBe(index.length);
    for (const k of index) expect(findKit(index, kitSlug(k.name))?.name, k.name).toBe(k.name);
  });

  it("filters the list by element, role and search", () => {
    const names = (f: Parameters<typeof filterKits>[1]): string[] => filterKits(index, f).map((k) => k.name);
    expect(names({ element: "Fusion" }).every((n) => file.kits[n]!.element === "Fusion")).toBe(true);
    expect(names({ element: "Fusion" })).toContain("Aemeath");
    expect(names({ role: "sustain" })).toEqual(expect.arrayContaining(["Shorekeeper", "Verina"]));
    expect(names({ role: "sustain" })).not.toContain("Aemeath");
    expect(names({ role: "main" })).toContain("Aemeath");
    expect(names({ role: "support" })).not.toContain("Aemeath");
    expect(names({ query: "aem" })).toEqual(["Aemeath"]);
    expect(names({ query: "rover aero" })).toEqual(["Aero Rover"]);
    expect(names({ query: "zzz" })).toEqual([]);
    expect(names({})).toHaveLength(index.length);
    expect(rolesOf({ main: 2, support: 1, sustain: true })).toEqual(["main", "support", "sustain"]);
  });

  it("writes the role, the mix, a loadout and the ladder in words", () => {
    const aemeath = file.kits.Aemeath!;
    expect(roleText(aemeath, "Aemeath", file._meta.sustain)[0]).toMatch(/^Aemeath is a main DPS: the damage dealer in all \d+ teams/);
    const shorekeeper = file.kits.Shorekeeper!;
    expect(roleText(shorekeeper, "Shorekeeper", file._meta.sustain).join(" ")).toMatch(/never the main DPS.*sustain supports \(.*Shorekeeper.*\)/);
    expect(roleText(file.kits.Brant!, "Brant")[0]).toMatch(/plays both ways/);
    expect(mixText(aemeath, "Aemeath").join(" ")).toMatch(/^Where Aemeath's own damage comes from, in their best S6R5 all team: .+ \d+%\. It scales on: .+ Aemeath deals \d+% of that team's damage\.$/);
    expect(mainstatText([[4, "Crit DMG"], [3, "ATK%"], [3, "Fusion DMG"], [1, "ATK%"], [1, "ATK%"]])).toBe("4-cost Crit DMG · 3-cost ATK% + Fusion DMG · 1-cost ATK% ×2");
    expect(mainstatText([[4, "Crit Rate"], [4, "Crit DMG"], [1, "ATK%"], [1, "ATK%"], [1, "ATK%"]])).toBe("4-cost Crit Rate + Crit DMG · 1-cost ATK% ×3");
    expect(loopSentence(["Basic - A ×2", "Liberation - B ×1"])).toBe("Basic - A ×2, then Liberation - B");
    // a build carries one main echo: his loop's one cast per possible main echo is one step, not three presses
    expect(loopSentence(["Basic - A ×1", "Echo - X ×1", "Heavy - B ×1", "Echo - Y ×1", "Echo - Z ×1", "Echo - Other ×1"], ["X", "Y", "Z"])).toBe(
      "Basic - A, then the Echo Skill of the main echo you carry (X, Y or Z), then Heavy - B, then Echo - Other",
    );
    expect(loopSentence(["Echo - X ×1", "Basic - A ×1"], ["X", "Q"])).toBe("Echo - X, then Basic - A");
    const lily = file.kits.Lily!.loadouts[0]!;
    expect(loopSentence(lily.loops["0"]!, lily.echoes.map((e) => e.main))).toMatch(/then the Echo Skill of the main echo you carry \(Fallacy of No Return, Formrender or Spacetrek Explorer\), then Liberation - Into the Dream Cradle$/);
    const steps = ladderSteps(aemeath.ladder);
    expect(steps[0]).toMatchObject({ level: 0, step: null, total: null });
    expect(steps.at(-1)!.level).toBe(6);
    expect(steps.at(-1)!.total).toBeGreaterThan(0.5);
    expect(weaponSteps(aemeath.ladder)[0]!.vsBest).toBe(0);
    expect(weaponSteps(aemeath.ladder).at(-1)!.vsBest).toBeLessThan(0);
    expect(signedPercent(0.0512)).toBe("+5.1%");
    expect(signedPercent(-0.119)).toBe("-11.9%");
    expect(signedPercent(0)).toBe("no change");
    expect(signedPercent(null)).toBe("");
    expect(dpsText(89277)).toBe("89.3K");
    expect(dpsText(552155)).toBe("552K");
    expect(dpsText(99978)).toBe("100K"); // never "100.0K"
    expect(dpsText(999600)).toBe("1.00M");
    expect(dpsText(9500)).toBe("9,500");
    // the Team Cost nearest to an account: a main DPS at S6 reads the S6 tier (R5 with an R5 weapon), a support his default
    expect(nearestCost(aemeath, 0, 1)).toBe("s0r1");
    expect(nearestCost(aemeath, 2, 1)).toBe("s2r1mdps");
    expect(nearestCost(aemeath, 4, 1)).toBe("s3r1mdps");
    expect(nearestCost(aemeath, 6, 1)).toBe("s6r1mdps");
    expect(nearestCost(aemeath, 6, 5)).toBe("s6r5mdps");
    expect(nearestCost(shorekeeper, 6, 5)).toBe("s0r1");
    expect(nearestCost({ teams: aemeath.teams, best: {} }, 6, 5)).toBe("s0r1"); // a tier the table lacks
    expect(dpsText(1204000)).toBe("1.20M");
  });

  it("names the sequences that change how a resonator is played, and what kind of change each is", () => {
    // Camellya's S6 presses other buttons; Aemeath's S1 only changes her start of combat; Jiyan has one loop throughout
    expect(loopChanges(file.kits.Camellya!).some((c) => c.level === 6 && c.kind === "loop" && /switches the loop/.test(c.text))).toBe(true);
    const aemeath = loopChanges(file.kits.Aemeath!);
    expect(aemeath).toHaveLength(1); // both of her loadouts change alike: one line, not two
    expect(aemeath[0]).toMatchObject({ level: 1, kind: "chain" });
    expect(aemeath[0]!.details).toHaveLength(1);
    expect(aemeath[0]!.details[0]!.loadouts).toEqual([]); // every loadout: no name needed
    expect(changeScope(aemeath[0]!)).toBe("");
    expect(aemeath[0]!.text).toMatch(/S1 changes only the opener/);
    expect(loopChanges(file.kits.Jiyan!)).toEqual([]);
    // Denia: both of her loadouts switch at S3, each its own way: one entry, two details, each named (Camellya's two
    // rotations did until Riley's 2026-11-22 table, where her S6 change is the same for every loadout)
    const denia3 = loopChanges(file.kits.Denia!);
    expect(denia3).toHaveLength(1);
    expect(denia3[0]).toMatchObject({ level: 3, kind: "loop" });
    expect(denia3[0]!.details).toHaveLength(2);
    expect(changeScope(denia3[0]!)).toBe("Denia (Burst); Denia (Strain)");
    // every loadout of every kit has a title of its own
    for (const kit of kits) expect(new Set(loadoutTitles(kit.loadouts)).size, kit.name).toBe(kit.loadouts.length);
    expect(loadoutTitles(file.kits.Aemeath!.loadouts)).toEqual(["Aemeath (Burst)", "Aemeath (Rupture)"]);
    expect(loadoutTitles(file.kits.Brant!.loadouts).slice().sort()).toEqual(["Brant, either role", "Brant, main DPS build"]);
    expect(lateLoadouts(file.kits.Roccia!)).toEqual([{ title: "Roccia, main DPS build", minSequence: 6 }]);
    // a loop at a level the table has no entry for is the one below it
    const camellya = file.kits.Camellya!.loadouts.find((l) => l.changes.some((c) => c.level === 6))!;
    expect(loopAt(camellya, 5)!.level).toBe(0);
    expect(loopAt(camellya, 6)!.level).toBe(6);
    expect(loopAt(camellya, 6)!.casts).not.toEqual(loopAt(camellya, 0)!.casts);
  });
});

describe("buildTeamsText", () => {
  it("says a support in all of them, not main DPS in 0 (Lily's 114 teams)", () => {
    expect(buildTeamsText(114, 0, 114)).toBe("114 teams on Riley's table, a support in all of them");
    expect(buildTeamsText(12, 12, 0)).toBe("12 teams on Riley's table, the main DPS in all of them");
    expect(buildTeamsText(1, 0, 1)).toBe("1 team on Riley's table, a support in it");
    expect(buildTeamsText(30, 10, 20)).toBe("30 teams on Riley's table: main DPS in 10, support in 20");
  });
});
