// Wuthering Tools+ AI tools — the /weapons page headless (src/sim/weaponValue/): what each character's signature weapon
// (its next copy, every refinement to R5), the standard 5★ weapons of their type and the best 4★ add to their own
// rotation and to the strongest team they can field, on their real builds.
import type { CharacterWeaponValue, ValueOption } from "../../weaponValue/weaponValue";
import { weaponValue } from "../../weaponValue/weaponValue";
import { enemyLabel } from "./character";
import { rankingFor } from "./memo";
import { characterName, compactJson, defineTool, nullableString, pct, resolveOwnCharacter, weaponName } from "./shared";

const STATUS_TEXT: Record<CharacterWeaponValue["signature"]["status"], string> = {
  swap: "not held: each step is a copy from R1",
  held: "held: each step is one more refinement",
  maxed: "held at R5",
  none: "the kit names no signature weapon",
  "not-in-app": "the signature is not in this app yet",
};

function optionRow(o: ValueOption): Record<string, unknown> {
  return {
    weapon: o.label,
    ownGainPct: pct(o.gain),
    ...(o.low ? { statsOnlyGainPct: pct(o.low.gain) } : {}),
    ...(o.team ? { teamGainPct: pct(o.team.gain) } : o.teamNote ? { team: o.teamNote } : {}),
    ...(o.panels.length ? { assumes: `you tick it in ${o.panels.map((p) => characterName(p.member)).join(", ")}'s Team Buffs panel` } : {}),
  };
}

export const weaponValueTool = defineTool<{ character?: string }>({
  name: "weapon_value",
  description:
    "The /weapons page: what weapons add on the player's own builds, scored by the app's engine on each character's best " +
    "rotation at the ranking enemy, and re-run on the strongest team they can field. For one character: their signature " +
    "weapon (status, then every step from the next copy to R5 — own damage gain %, the stats-only floor for a weapon they " +
    "don't hold (its passives off; the headline has them at full stacks), team gain %), each Standard Weapon Convene 5★ of " +
    "their type at R1, the best 4★ at R5 and their held weapon one refinement up. character = null gives every set-up " +
    "character's signature next copy (own and team gain), best first. Gains are % of rotation damage, not DPS.",
  input_schema: {
    type: "object",
    properties: {
      character: nullableString("A set-up character (loose name) for the full detail. null = every set-up character's signature, best first."),
    },
    required: ["character"],
    additionalProperties: false,
  },
  provenance: "App engine · /weapons (your builds and best team)",
  async run(input, ctx) {
    const who = input.character ? resolveOwnCharacter(input.character, ctx.exp) : null;
    const auto = ctx.autoBuffs ?? true;
    const ranking = await rankingFor(ctx.exp, auto);
    const result = await weaponValue(ctx.exp.characters, ctx.exp.inventory.echoes, ctx.exp.teams, ranking, { autoTeamBuffs: auto, yieldToUi: false, ids: who ? [who] : undefined });
    const enemy = enemyLabel(ranking.enemy);
    if (who) {
      const row = result.rows.find((r) => r.id === who);
      if (!row) throw new Error(`${characterName(who)} could not be scored: no rotation on their build${result.errors[0] ? ` (${result.errors[0]})` : ""}`);
      if (row.status !== "ok") return compactJson({ character: row.name, status: row.status, why: row.note, path: `/weapons?focus=${encodeURIComponent(who)}`, label: "Weapon value" });
      return compactJson({
        character: row.name,
        enemy,
        now: `${weaponName(row.current.weaponKey) ?? "no weapon"} R${row.current.refinement}`,
        rotation: row.current.rotation,
        measuredOnTeam: row.team ? row.team.name : row.teamNote,
        signature: { weapon: weaponName(row.signature.key), status: STATUS_TEXT[row.signature.status], steps: row.signature.steps.map(optionRow) },
        standard5Star: row.standard.map(optionRow),
        best4Star: row.four ? optionRow(row.four) : null,
        ...(row.refine ? { yourWeaponNextRefinement: optionRow(row.refine) } : {}),
        notes: ["ownGainPct / teamGainPct: rotation damage with that weapon vs today, on the same rotation / team."],
        path: `/weapons?focus=${encodeURIComponent(who)}`,
        label: "Weapon value",
      });
    }
    const rows = result.rows
      .filter((r) => r.status === "ok")
      .map((r) => {
        const next = r.signature.steps[0] ?? null;
        return {
          character: r.name,
          signature: weaponName(r.signature.key),
          status: STATUS_TEXT[r.signature.status],
          next: next ? next.label : null,
          ownGainPct: next ? pct(next.gain) : null,
          teamGainPct: next?.team ? pct(next.team.gain) : null,
          r5OwnGainPct: r.signature.steps.length ? pct(r.signature.steps[r.signature.steps.length - 1]!.gain) : null,
        };
      })
      .sort((a, b) => (b.teamGainPct ?? b.ownGainPct ?? -1) - (a.teamGainPct ?? a.ownGainPct ?? -1));
    return compactJson({
      enemy,
      characters: rows,
      ...(result.notSetUp.length ? { notSetUp: result.notSetUp.map(characterName) } : {}),
      couldNotScore: result.rows.filter((r) => r.status !== "ok").map((r) => `${r.name}: ${r.note ?? r.status}`),
      notes: ["next: the signature's next copy (R1 when not held). r5OwnGainPct: every copy to R5."],
      path: "/weapons",
      label: "Weapon value",
    });
  },
});
