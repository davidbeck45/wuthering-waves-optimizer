// Wuthering Tools+ — "one team, one number" (2026-11-02): one fixture account and its one saved team (Aemeath · Mornye
// + Lynae, the AI fixture trimmed from a real export) through each page's own view model. Figures meant to be equal are
// equal; the ones that legitimately differ say why (numberBasis.ts holds the rules).
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import fixture from "../ai/__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { buildCharacterCalculationContext } from "../../calculator/buildCharacterContext";
import { calcTeamRotationDamage } from "../../calculator/teamRotation";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";
import { KIT_CONSTANT_ER, kitErNote, menuEnergyRegen } from "../energy/energyHave";
import { erPercent } from "../energy/energyNeed";
import { menuErPercent } from "../buildTeam/buildTeam";
import { menuErOf, prepareMemberJob } from "../buildTeam/headlessOptimizer";
import { RANKING_ENEMY, scoreTeamCandidate } from "../myRankings/rankRoster";
import { teamHeadline } from "../share/headline";
import { explainEnergyTeam } from "../ai/explain/explainPayloads";
import type { TeamView } from "../energy/useEnergyNeeds";
import { type PaletteSources } from "../shell/paletteItems";
import { commandItems, paletteWithCommands } from "../shell/paletteCommands";
import { wuwaCalcTeamName } from "../presets/presetName";
import TeamRotationDamageBar from "../../components/TeamRotationDamageBar.vue";
import { teamLabel } from "./names";
import { teamTierLine, teamTitle } from "./teamName";
import { isWuwaCalcPage, rankingsMineNote, spreadLabel, spreadOf, WHY_ENGINES_DIFFER } from "./numberBasis";

/* eslint-disable @typescript-eslint/no-explicit-any */

const exp = parseExport(fixture, "aiAccount.json");
const characters: Record<string, any> = exp.characters;
const echoes: any[] = exp.inventory.echoes;
const team = exp.teams[0];
const OLD_NAME = "wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae";
const NEW_NAME = wuwaCalcTeamName("Aemeath", ["Mornye", "Lynae"], "S6R5 DPS · S1R1/S6R1 team");

beforeEach(() => setActivePinia(createPinia()));

describe("one team, one number", () => {
  it("fixture: the Aemeath · Mornye + Lynae team, 25 s, Mornye with a weapon", () => {
    expect(team.name).toBe(OLD_NAME);
    expect(team.characterIds).toEqual(["Aemeath", "Mornye", "Lynae"]);
    expect(team.duration).toBe(25);
    expect(characters.Mornye?.weapon).toBeTruthy();
  });

  it("Mornye's Energy Regen: Build my team's 'you have', its floor check and the Energy check read one figure (audit D3)", async () => {
    const energy = (await menuEnergyRegen("Mornye", characters, echoes))!; // /energy and `cli er`
    const buildTeamHave = await menuErPercent("Mornye", characters, echoes); // /build-team plan card
    const job = await prepareMemberJob({
      characterId: "Mornye",
      characters,
      inventoryEchoes: echoes,
      enemy: RANKING_ENEMY,
      objective: { rotation: { id: "r", name: "r", actions: [] }, label: "r", source: "yours" },
      setKeys: [],
      mainEchoKeys: [],
    });
    expect(buildTeamHave).toBe(energy);
    expect(job.currentMenuEr).toBeCloseTo(energy, 3); // the result card's "was"
    // the optimizer's own ER (fight toggles in) maps back onto the same basis, so the floor is held where /energy holds it
    const full = Number((await buildCharacterCalculationContext("Mornye", characters, RANKING_ENEMY, echoes)).finalStats.energyRegen);
    expect(menuErOf(job, full)).toBeCloseTo(energy, 3);
    // the legitimate difference: this app's build card (Build history, share cards) leaves her inherent out, and the
    // basis label on the Energy and Build my team figures says so; it says nothing of the game's own screen (not on record)
    const screen = erPercent(Number((await buildCharacterCalculationContext("Mornye", characters, RANKING_ENEMY, echoes, { alwaysEnabledOnly: true })).finalStats.energyRegen));
    expect(energy - screen).toBeCloseTo(KIT_CONSTANT_ER.Mornye!, 6);
    expect(kitErNote("Mornye")!.short).toBe("incl. +10 % inherent");
    expect(kitErNote("Mornye")!.long).toMatch(/build card and Build history leave it out, so they read 10 points lower/);
    expect(kitErNote("Mornye")!.long).not.toMatch(/game|character screen/i);
    expect(kitErNote("Lynae")).toBeNull();
  }, 60_000);

  it("this app's engine: /my-rankings (and the /account hero), the Teams page and the share card give one damage per rotation and one DPS", async () => {
    // /my-rankings and /account's hero: the team ranked as the roster ranks it
    const ranked = await scoreTeamCandidate({ id: team.id, name: team.name, source: "yours", team: { name: team.name, characterIds: team.characterIds, actions: team.actions, duration: team.duration, handoffs: team.handoffs } }, characters, echoes);
    // the Teams page: TeamRotations.vue computeStatsForTeam, on the team's own enemy settings
    const resolution = await resolveTeamCharacters(team, characters, echoes, { auto: true });
    const teams = await calcTeamRotationDamage({ name: team.name, characterIds: team.characterIds, buildIds: team.buildIds, actions: team.actions, duration: team.duration } as any, resolution.characters, team.enemyConfig, echoes);
    // a share card of the team
    const card = (await teamHeadline(team, characters, echoes))!;
    expect(ranked.avgDamage).toBeGreaterThan(0);
    expect(teams.total.avgDamage).toBeCloseTo(ranked.avgDamage, 0);
    expect(card.avgDamage).toBeCloseTo(ranked.avgDamage, 0);
    // DPS = average damage per rotation ÷ the team's 25 s, on every page that prints one
    expect(ranked.dps).toBeCloseTo(ranked.avgDamage / 25, 3);
    expect(teams.dps.avg).toBeCloseTo(ranked.dps!, 3);
    expect(card.dps).toBeCloseTo(ranked.dps!, 3);

    // the Teams editor's share bar splits average damage, as its "DPS (avg)" header and the Summary pie (Average) do,
    // and as /my-rankings' per-member shares (audit core M3)
    const bar = mount(TeamRotationDamageBar, { props: { perCharacter: teams.perCharacter } });
    const shares = Object.fromEntries(
      bar.findAll("[data-test-team-rotation-damage-bar-segment]").map((w) => [w.attributes("data-test-team-rotation-damage-bar-segment"), parseFloat(String(w.attributes("style")).replace(/^.*width:\s*([\d.]+)%.*$/, "$1"))]),
    );
    const pieTotal = Object.values(teams.perCharacter).reduce((n, c) => n + (c.damageAggregation.avgDamage ?? 0), 0);
    const rankedTotal = ranked.perSlot.reduce((a, b) => a + b, 0);
    team.characterIds.forEach((id: string, i: number) => {
      const pie = ((teams.perCharacter[id]!.damageAggregation.avgDamage ?? 0) / pieTotal) * 100;
      expect(shares[id], id).toBeCloseTo(pie, 6);
      expect(shares[id], id).toBeCloseTo((ranked.perSlot[i]! / rankedTotal) * 100, 3);
    });
    bar.unmount();
  }, 60_000);

  it("one name: every plus page titles the team 'Aemeath · Mornye + Lynae', its tier on a second line (audits M4)", () => {
    const one = "Aemeath · Mornye + Lynae";
    expect(teamLabel(team.characterIds, "Aemeath")).toBe(one); // /rotation, /endgame (keys and the main DPS)
    expect(teamTitle(OLD_NAME)).toBe(one); // a team synced before 2026-11-02
    expect(teamTitle(NEW_NAME)).toBe(one); // the name the import and Sync my teams write now
    expect(teamTierLine(OLD_NAME)).toBe("main DPS S6R5 · supports S1R1 / S6R1");
    expect(teamTierLine(NEW_NAME, true)).toBe("main DPS S6R5 · supports S1R1 / S6R1 · wuwa_calc");
    expect(teamTitle("Aemeath hypercarry", team.characterIds)).toBe("Aemeath hypercarry"); // a typed name stays
    expect(teamTitle("", team.characterIds, "Aemeath")).toBe(one);
    // Ryan's Teams page shows the stored name as it is: it now starts with who is in the team
    expect(NEW_NAME.startsWith(one)).toBe(true);

    // the palette: the Saved teams row and the per-team commands
    const sources: PaletteSources = {
      hasRoute: () => true,
      characters: team.characterIds.map((key: string) => ({ key, name: key, rarity: 5, element: null, weapon: null, setUp: true, sequence: 0 })),
      teams: [{ id: team.id, name: OLD_NAME, members: team.characterIds, memberKeys: team.characterIds }],
      themeStyle: "dark",
      classicUi: false,
      aiKeySet: false,
      aiChat: false,
      mod: "Ctrl",
    } as PaletteSources;
    const row = paletteWithCommands(sources).find((i) => i.group === "team")!; // the lazy palette names the rows
    expect(row.title).toBe(one);
    expect(row.subtitle).toBe("main DPS S6R5 · supports S1R1 / S6R1 · wuwa_calc");
    expect(row.keywords).toContain(OLD_NAME);
    const share = commandItems(sources, (k) => k).find((i) => i.key.includes(":team:") && i.key.endsWith(":share"))!;
    expect(share.title).toBe(`Share team: ${one}`);
    expect(share.subtitle).not.toMatch(/wuwa_calc Aemeath/);
    expect(share.subtitle).toContain("main DPS S6R5"); // two tiers of the same three read the same title

    // Explain on /energy quotes the same title
    const view = { key: "k", id: team.id, name: OLD_NAME, source: "saved", characterIds: team.characterIds, state: null, energy: { teamKey: "t269", total: 1, seconds: 1, variants: 1, members: [] }, checks: [] } as unknown as TeamView;
    expect(explainEnergyTeam(view)!.question).toContain(`"${one}"`);
  });

  it("wuwa_calc's figures name their substat spread, and the pages say why they differ (audits D9, new-screens M3, L14)", () => {
    // /energy, /rotation, /endgame and Build my team run the player's own echoes; /rankings and Sync my teams the bar's
    expect(spreadLabel("mine")).toBe("your echoes");
    expect(spreadLabel("")).toBe("ChemX32 substats"); // the bar's default (hash sb unset)
    expect(spreadLabel("standard")).toBe("ChemX32 substats");
    expect(spreadLabel("h")).toBe("High Invest substats");
    expect(spreadOf("m")).toBe("mine");
    expect(rankingsMineNote("")).toMatch(/ChemX32 substats, not your echoes\. Pick My builds/);
    expect(rankingsMineNote("m")).toMatch(/echoes each character wears.*\/account and My roster rankings use this app's engine/);
    expect(rankingsMineNote("", true)).toBe("ChemX32 substats, not your echoes: pick My builds above to match Energy check and Rotation.");
    expect(rankingsMineNote("m", true)).toMatch(/^Your own echoes/);
    expect(WHY_ENGINES_DIFFER).toMatch(/damage per rotation.*damage per second/);
    // the share sheet's note shows over the wuwa_calc pages only
    expect(["/rotation", "/energy", "/endgame", "/rankings"].every(isWuwaCalcPage)).toBe(true);
    expect(["/teams", "/account", "/my-rankings", "/"].some(isWuwaCalcPage)).toBe(false);
  });
});
