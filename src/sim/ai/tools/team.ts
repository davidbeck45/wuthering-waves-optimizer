// Wuthering Tools+ AI tools — teams: one saved team's rotation through the engine, and the team presets the
// player could field.
import { calcTeam, findTeam } from "../../cli/engine";
import { loadWuwaCalcTeamPresets } from "../../presets";
import { teamRotationPresets } from "../../../teamRotations/presets";
import { isSetUp } from "../../myRankings/rankRoster";
import { enemyLabel } from "./character";
import { characterName, compactJson, defineTool, int, resolveAnyCharacter, share, topN } from "./shared";

/** "SequenceNode2IntoLightsVanishingPoint" → "Sequence Node 2 Into Lights Vanishing Point" */
export const prettyKey = (key: string): string =>
  key
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

export const calcTeamTool = defineTool<{ team: string }>({
  name: "calc_team",
  description:
    "One saved team's rotation through the app's engine: total average damage, DPS when the team has a duration, each member's " +
    "damage and share of the total, which build each slot used, and where each slot's team buffs came from — derived from what " +
    "the real teammates' builds provide (sequence nodes, weapons, 5-piece sets, main echoes they actually have) or kept from the " +
    "character's own panel when it already names this team — plus buffs left out and why (a teammate lacks the node, wrong " +
    "Resonance Mode, an outro that goes to someone else). Enemy = the team's own enemy settings. Static engine: a buff is on for " +
    "the whole rotation or off (no uptime model).",
  input_schema: {
    type: "object",
    properties: { team: { type: "string", description: "Team name (loose), id or 1-based index from get_account_summary." } },
    required: ["team"],
    additionalProperties: false,
  },
  provenance: "App engine · your team rotation (buffs from the real members)",
  async run(input, ctx) {
    const team = findTeam(input.team, ctx.exp.teams);
    const r = await calcTeam(team, ctx.exp, { autoBuffs: ctx.autoBuffs ?? true });
    const ids = (team.characterIds ?? []) as Array<string | null>;
    return compactJson({
      team: r.name,
      members: ids.map((id) => characterName(id)),
      enemy: enemyLabel(r.enemy),
      actions: r.actions,
      durationS: r.duration == null ? null : Number(r.duration),
      total: { normal: int(r.normal), avg: int(r.avg), crit: int(r.crit), dps: int(r.dps), ...(r.healing > 0 ? { healing: int(r.healing) } : {}), ...(r.shield > 0 ? { shield: int(r.shield) } : {}) },
      buffMode: r.buffMode === "auto" ? "derived from the team's real members" : "each character's own Team Buffs panel",
      slots: r.slots.map((s) => {
        const avg = r.perCharacter[s.characterId]?.avg ?? 0;
        return {
          character: characterName(s.characterId),
          avg: int(avg),
          sharePct: share(avg, r.avg),
          build: s.buildName ?? "(active build)",
          buffs:
            s.buffSource === "panel"
              ? `kept their own panel (it names ${s.teammates.map((t) => characterName(t)).join(" + ")})`
              : s.buffSource === "derived"
                ? `derived from ${s.teammates.map((t) => characterName(t)).join(" + ") || "nobody"}`
                : "as stored",
          enabledBuffs: s.enabled.length,
          buffNames: s.enabled.slice(0, 12).map(prettyKey),
          leftOut: s.skipped.slice(0, 8).map((k) => ({ buff: prettyKey(k.key), from: characterName(k.from), why: k.reason })),
        };
      }),
    });
  },
});

interface PresetRow {
  team: string;
  source: string;
  members: string[];
  durationS: number | null;
  actions: number;
  fieldable: boolean;
  notSetUp: string[];
}

export const listTeamPresetsTool = defineTool<{ character?: string; fieldable_only?: boolean }>({
  name: "list_team_presets",
  description:
    "Ready-made team rotations the app ships — Riley31415's wuwa_calc teams (S6R5 solves mapped onto this app's attacks) and the " +
    "curated presets (WuWaBuilds) — filtered by default to teams whose three members the player has set up (fieldable), optionally " +
    "to teams containing one character. These are rotations, not scores: rank_roster scores every fieldable preset on the " +
    "player's builds, and a preset can be imported from Teams › List Presets.",
  input_schema: {
    type: "object",
    properties: {
      character: { type: "string", description: "Only teams with this character (loose name)." },
      fieldable_only: { type: "boolean", description: "Only teams whose three members are set up. Default true; false also lists who is missing." },
    },
    required: [],
    additionalProperties: false,
  },
  provenance: "wuwa_calc + curated team presets",
  async run(input, ctx) {
    const wanted = input.character ? resolveAnyCharacter(input.character, ctx.exp) : null;
    const fieldableOnly = input.fieldable_only ?? true;
    const wuwa = await loadWuwaCalcTeamPresets();
    const rows: PresetRow[] = [];
    let total = 0;
    for (const [source, list] of [["wuwa_calc", wuwa], ["curated", teamRotationPresets]] as const) {
      for (const p of list) {
        const ids = (p.data.characterIds ?? []).filter(Boolean) as string[];
        if (wanted && !ids.includes(wanted)) continue;
        total += 1;
        const notSetUp = ids.filter((id) => !isSetUp(ctx.exp.characters[id]));
        const fieldable = ids.length === 3 && notSetUp.length === 0;
        if (fieldableOnly && !fieldable) continue;
        const d = Number(p.data.duration);
        rows.push({
          team: p.name,
          source: source === "wuwa_calc" ? "wuwa_calc" : `curated (${p.author || "app"})`,
          members: ids.map((id) => characterName(id)),
          durationS: Number.isFinite(d) && d > 0 ? d : null,
          actions: (p.data.actions ?? []).length,
          fieldable,
          notSetUp: notSetUp.map((id) => characterName(id)),
        });
      }
    }
    rows.sort((a, b) => Number(b.fieldable) - Number(a.fieldable) || a.notSetUp.length - b.notSetUp.length || a.team.localeCompare(b.team));
    const shown = topN(rows, 25);
    return compactJson({
      filter: { character: wanted ? characterName(wanted) : null, fieldableOnly },
      matching: rows.length,
      ofPresets: total,
      teams: shown.items.map((r) => (fieldableOnly ? { ...r, notSetUp: undefined, fieldable: undefined } : r)),
      omitted: shown.omitted,
    });
  },
});
