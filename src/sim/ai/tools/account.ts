// Wuthering Tools+ AI tools — the account at a glance, and the /rankings deep link.
import { accountStateOf, rankingsMineHash, type AccountState } from "../../account/accountState";
import type { ExportFile } from "../../cli/exportShape";
import { characterName, compactJson, defineTool, investmentLabel, resolveAnyCharacter } from "./shared";

/** The compact account view both the tool and the prompt's snapshot block use (deterministic order). */
export function accountView(exp: ExportFile): {
  state: AccountState;
  setUp: Array<{ name: string; investment: string; build: string | null; builds: number; savedRotations: number }>;
  notSetUp: string[];
  teams: Array<{ name: string; members: string[]; actions: number; fieldable: boolean }>;
} {
  const state = accountStateOf(exp.characters, exp.inventory, exp.teams);
  const chars = Object.values(state.characters);
  const setUp = chars
    .filter((c) => c.owned)
    .sort((a, b) => b.sequence - a.sequence || characterName(a.key).localeCompare(characterName(b.key)))
    .map((c) => ({
      name: characterName(c.key),
      investment: investmentLabel(c.sequence, c.weapon, c.refinement),
      build: c.build?.name || null,
      builds: c.builds.length,
      savedRotations: c.rotations,
    }));
  const notSetUp = chars
    .filter((c) => !c.owned)
    .map((c) => characterName(c.key))
    .sort((a, b) => a.localeCompare(b));
  const teams = state.teams.map((t) => ({
    name: t.name || "(unnamed team)",
    members: t.characterIds.map((id) => characterName(id)),
    actions: t.actions,
    fieldable: t.fieldable,
  }));
  return { state, setUp, notSetUp, teams };
}

export const getAccountSummary = defineTool<Record<string, never>>({
  name: "get_account_summary",
  description:
    "The player's account as the app holds it right now: every character set up (owned = a weapon equipped) with sequence (S0–S6), " +
    "weapon and refinement (R1–R5), active build name and saved rotation count; characters opened in the app but not set up; the " +
    "saved teams (fieldable = all three members set up); echo totals. Use it when the account may have changed since the snapshot " +
    "in the system prompt, or to list teams before calc_team. No damage numbers here.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  provenance: "Your account (live data)",
  async run(_input, ctx) {
    const v = accountView(ctx.exp);
    const s = v.state.summary;
    return compactJson({
      totals: {
        charactersInApp: s.characters,
        setUp: s.owned,
        atS6: s.s6,
        echoes: v.state.echoes.total,
        equippedEchoes: v.state.echoes.equipped,
        teams: s.teams,
        fieldableTeams: s.teamsFieldable,
        savedRotations: s.rotations,
      },
      activeCharacter: ctx.exp.activeCharacter ? characterName(ctx.exp.activeCharacter) : null,
      setUp: v.setUp,
      notSetUp: v.notSetUp,
      teams: v.teams,
    });
  },
});

export const rankingsLink = defineTool<{ characters?: string[] }>({
  name: "rankings_link",
  description:
    "A link to Team rankings (/rankings, Riley31415's wuwa_calc table inside the app) at the 'My account' tier: every team solved at " +
    "the player's own sequences, weapons and refinements, optionally filtered to teams containing the given characters. Returns a " +
    "URL path; the app shows it as a button — this tool does not navigate. Offer it when the player wants to compare teams " +
    "beyond what rank_roster covers (Riley's engine plays the timeline; this app's engine is static; his table shows DPS).",
  input_schema: {
    type: "object",
    properties: {
      characters: { type: "array", description: "Character names to filter the table to (teams containing any of them). Omit for every team.", items: { type: "string" } },
    },
    required: [],
    additionalProperties: false,
  },
  provenance: "Team rankings (wuwa_calc) · My account",
  async run(input, ctx) {
    const keys = (input.characters ?? []).map((name) => resolveAnyCharacter(name, ctx.exp));
    const names = keys.map((k) => characterName(k));
    return compactJson({
      path: `/rankings${rankingsMineHash(keys)}`,
      label: names.length ? `Team rankings at your account · ${names.join(", ")}` : "Team rankings at your account",
      note: "Riley's engine solves these rows in the browser; the first open can take a few seconds.",
    });
  },
});
