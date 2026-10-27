// Wuthering Tools+ AI tools — the roster ranking (/my-rankings, headless), memoised per account state.
import { enemyLabel } from "./character";
import { rankingFor } from "./memo";
import { characterName, clampInt, compactJson, defineTool, int, investmentLabel, pct, share } from "./shared";

const SOURCE_LABEL: Record<string, string> = { yours: "yours", curated: "curated preset", wuwa_calc: "wuwa_calc" };

export const rankRosterTool = defineTool<{ top?: number }>({
  name: "rank_roster",
  description:
    "The /my-rankings page: every set-up character and every team the player can put together, scored with the app's engine on " +
    "their real builds at the ranking enemy (Lv 100 / 20 % RES, Riley's target, so numbers sit beside /rankings). Characters: best " +
    "rotation (their saved ones, curated presets, wuwa_calc loops) with average damage and DPS, plus investment estimates — the " +
    "next sequence node and R5 on the same rotation, as % gain (a node with mode variants takes its first variant: an estimate). " +
    "Teams: the player's saved teams plus every wuwa_calc / curated preset whose three members exist in the account, total " +
    "average damage, DPS and each slot's share; 'unarmed' members have no weapon and understate. Best first. App vs Riley's " +
    "wuwa_calc engine: his /rankings numbers are DPS — compare them with this tool's dps, never its avg; at the median the app's DPS is about " +
    "0.96 of his. Takes a few seconds the first time per account state.",
  input_schema: {
    type: "object",
    properties: {
      top: { type: "integer", description: "How many characters and teams to return, 1–15. Default 8." },
    },
    required: [],
    additionalProperties: false,
  },
  provenance: "App engine · /my-rankings (your builds, Lv 100 / 20 % RES)",
  async run(input, ctx) {
    const n = clampInt(input.top, 1, 15, 8);
    const r = await rankingFor(ctx.exp, ctx.autoBuffs ?? true);
    const ranked = r.characters.filter((c) => c.best);
    return compactJson({
      enemy: enemyLabel(r.enemy),
      characters: ranked.slice(0, n).map((c, i) => ({
        rank: i + 1,
        character: c.name,
        investment: investmentLabel(c.sequence, c.weapon, c.refinement),
        bestRotation: c.best ? `${c.best.name} (${SOURCE_LABEL[c.best.source] ?? c.best.source})` : null,
        avg: int(c.best?.avgDamage),
        dps: int(c.best?.dps),
        nextSequence: c.nextSequence ? { label: c.nextSequence.label, gainPct: pct(c.nextSequence.gain) } : null,
        r5GainPct: c.refineFive ? pct(c.refineFive.gain) : null,
      })),
      charactersRanked: ranked.length,
      charactersWithoutRotation: r.characters.filter((c) => !c.best).map((c) => c.name),
      teams: r.teams.slice(0, n).map((t, i) => ({
        rank: i + 1,
        team: t.name,
        source: SOURCE_LABEL[t.source] ?? t.source,
        members: t.characterIds.map((id) => characterName(id)),
        avg: int(t.avgDamage),
        dps: int(t.dps),
        slotSharePct: t.perSlot.map((v) => share(v, t.avgDamage)),
        ...(t.unarmed.length ? { unarmed: t.unarmed.map((id) => characterName(id)) } : {}),
      })),
      teamsRanked: r.teams.length,
      teamsSkipped: r.teamsSkipped,
      notes: [
        "Team totals without a duration have no DPS; teams of different lengths compare fairly on DPS only.",
        "nextSequence / r5GainPct: the same rotation with the next node on / the weapon at R5 (R5 is null when already R5 or unarmed).",
      ],
    });
  },
});
