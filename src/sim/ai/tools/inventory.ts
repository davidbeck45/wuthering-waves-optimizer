// Wuthering Tools+ AI tools — search the echo inventory: compact rows the model can reason over (and the
// player can find in Inventory), filtered by set / cost / main stat / substat / echo / who wears it.
import { echoSetLabelMap, getEchoCritValue, getEchoSubStatEntries, statsTable, subStatLabelMap } from "../../../echoes/stats";
import { mainEchoesData } from "../../../echoes/index";
import { SUBSTAT_ABBR } from "../../substats/substatWeights";
import { characterName, clampInt, compactJson, defineTool, echoName, resolveOwnCharacter, round, setName, statLabel, topN } from "./shared";

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const STAT_ALIASES: Record<string, string[]> = {
  CritRate: ["crit", "critrate", "cr"],
  CritDMG: ["critdamage", "critdmg", "cd", "cdmg"],
  ATK: ["atkpercent", "attack", "attackpercent"],
  ATK_FLAT: ["flatatk", "atkflat", "flatattack"],
  HP: ["hppercent"],
  HP_FLAT: ["flathp", "hpflat"],
  DEF: ["defpercent"],
  DEF_FLAT: ["flatdef", "defflat"],
  EnergyRegen: ["er", "energy", "energyregen", "energyrecharge"],
  BasicAttackDMGBonus: ["basic", "basicattack", "basicdmg"],
  HeavyAttackDMGBonus: ["heavy", "heavyattack", "heavydmg"],
  ResonanceSkillDMGBonus: ["skill", "skilldmg", "resonanceskill"],
  ResonanceLiberationDMGBonus: ["lib", "liberation", "liberationdmg", "resonanceliberation"],
  HealingBonus: ["healing", "heal"],
};

/** A stat key from a loose name ("crit dmg", "CR", "flat atk", "Fusion DMG Bonus"); exact key first, then abbreviations, labels, aliases. */
export function resolveStatKey(input: string): string {
  const needle = squash(input);
  const keys = [...new Set([...Object.keys(subStatLabelMap), ...Object.keys(STAT_ALIASES)])];
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  const tiers: Array<(k: string) => boolean> = [
    (k) => squash(k) === needle,
    (k) => squash(SUBSTAT_ABBR[k] ?? "") === needle,
    (k) => (STAT_ALIASES[k] ?? []).includes(needle),
    (k) => squash(subStatLabelMap[k] ?? "") === needle,
    (k) => squash(subStatLabelMap[k] ?? "").startsWith(needle) && needle.length >= 3,
  ];
  for (const test of tiers) {
    const hits = keys.filter(test);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1 && test === tiers[0]) return hits[0];
  }
  throw new Error(`No stat "${input}". Known: ${keys.map((k) => subStatLabelMap[k] ?? k).join(", ")}`);
}

function resolveSetKey(input: string): string {
  const needle = squash(input);
  const keys = Object.keys(echoSetLabelMap);
  const exact = keys.filter((k) => squash(k) === needle || squash(echoSetLabelMap[k]) === needle);
  if (exact.length) return exact[0];
  const partial = keys.filter((k) => squash(echoSetLabelMap[k]).includes(needle) || squash(k).includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`Ambiguous sonata set "${input}": ${partial.map((k) => echoSetLabelMap[k]).join(", ")}`);
  throw new Error(`No sonata set "${input}"`);
}

function echoMatches(key: string | null | undefined, input: string): boolean {
  if (!key) return false;
  const needle = squash(input);
  return squash(key).includes(needle) || squash(mainEchoesData[key]?.name ?? "").includes(needle);
}

export const searchInventoryTool = defineTool<{
  set?: string;
  cost?: number;
  main?: string;
  substat?: string;
  echo?: string;
  equipped?: "any" | "equipped" | "unequipped";
  equipped_by?: string;
  sort?: "crit_value" | "crit_value_asc" | "substat_value";
  limit?: number;
}>({
  name: "search_inventory",
  description:
    "Search the player's echo inventory. Filters combine (AND): sonata set, cost (4 / 3 / 1), main stat, a substat the echo has, " +
    "the echo's name, equipped or not, who wears it. Each row: echo, set, cost, rarity, main stat with its max-level value, the " +
    "substat lines (CR = Crit Rate, CD = Crit DMG, ATK% vs flat ATK…), crit value (CV = 2 × Crit Rate + Crit DMG, a quick quality " +
    "measure that ignores every non-crit stat) and who has it equipped in which slot. Sorted by CV (high first) unless asked " +
    "otherwise. CV is not damage: for 'is this echo good on X' use substat_weights. For echoes to feed / fodder: equipped = " +
    "unequipped, sort = crit_value_asc.",
  input_schema: {
    type: "object",
    properties: {
      set: { type: "string", description: "Sonata set, loose (e.g. \"Trailblazing Star\", \"halo\")." },
      cost: { type: "integer", enum: [1, 3, 4], description: "Echo cost." },
      main: { type: "string", description: "Main stat, loose (e.g. \"crit rate\", \"Fusion DMG\", \"ER\")." },
      substat: { type: "string", description: "Only echoes with this substat line, loose (e.g. \"crit dmg\", \"flat atk\")." },
      echo: { type: "string", description: "Echo name, loose (e.g. \"Fleurdelys\")." },
      equipped: { type: "string", enum: ["any", "equipped", "unequipped"], description: "Default any." },
      equipped_by: { type: "string", description: "Only echoes this character has equipped (loose name)." },
      sort: { type: "string", enum: ["crit_value", "crit_value_asc", "substat_value"], description: "crit_value (default, high first), crit_value_asc, or substat_value (the `substat` filter's value, high first)." },
      limit: { type: "integer", description: "Rows to return, 1–30. Default 15." },
    },
    required: [],
    additionalProperties: false,
  },
  provenance: "Your echo inventory",
  async run(input, ctx) {
    const exp = ctx.exp;
    const setKey = input.set ? resolveSetKey(input.set) : null;
    const mainKey = input.main ? resolveStatKey(input.main) : null;
    const subKey = input.substat ? resolveStatKey(input.substat) : null;
    const wearer = input.equipped_by ? resolveOwnCharacter(input.equipped_by, exp) : null;
    if (input.sort === "substat_value" && !subKey) throw new Error("sort = substat_value needs the substat filter");
    const equippedMode = input.equipped ?? "any";
    const limit = clampInt(input.limit, 1, 30, 15);

    const rows = [];
    for (const e of exp.inventory.echoes as Array<Record<string, any>>) {
      const wornBy = Object.entries((exp.inventory.equipped?.[e.echoId] ?? {}) as Record<string, number>);
      if (equippedMode === "equipped" && !wornBy.length) continue;
      if (equippedMode === "unequipped" && wornBy.length) continue;
      if (wearer && !wornBy.some(([c]) => c === wearer)) continue;
      if (setKey && e.echoSet !== setKey) continue;
      if (input.cost != null && Number(e.type) !== input.cost) continue;
      if (mainKey && e.stat !== mainKey) continue;
      if (input.echo && !echoMatches(e.echo, input.echo)) continue;
      const subs = getEchoSubStatEntries(e);
      const subValue = subKey ? subs.find(([k]) => k === subKey)?.[1] : undefined;
      if (subKey && subValue === undefined) continue;
      const cost = Number(e.type) || null;
      const rarity = Number(e.rank) || null;
      const mainValue = cost && rarity && e.stat ? statsTable[cost]?.[e.stat]?.[rarity] : undefined;
      rows.push({
        sortCv: getEchoCritValue(e),
        sortSub: subValue ?? 0,
        row: {
          id: e.echoId ?? null,
          echo: echoName(e.echo),
          set: setName(e.echoSet),
          cost,
          rarity,
          main: e.stat ? `${statLabel(e.stat)}${mainValue != null ? ` ${mainValue}%` : ""}` : null,
          substats: subs.map(([k, v]) => `${SUBSTAT_ABBR[k] ?? k} ${v}`).join(" · ") || "(none)",
          lines: subs.length,
          cv: round(getEchoCritValue(e), 1),
          equippedBy: wornBy.map(([c, slot]) => `${characterName(c)} (slot ${Number(slot) + 1})`),
          ...(e.locked ? { locked: true } : {}),
          ...(e.trash ? { markedTrash: true } : {}),
        },
      });
    }
    const sort = input.sort ?? "crit_value";
    rows.sort((a, b) => (sort === "crit_value_asc" ? a.sortCv - b.sortCv : sort === "substat_value" ? b.sortSub - a.sortSub || b.sortCv - a.sortCv : b.sortCv - a.sortCv));
    const shown = topN(rows, limit);
    return compactJson({
      matching: rows.length,
      ofEchoes: exp.inventory.echoes.length,
      filters: {
        ...(setKey ? { set: setName(setKey) } : {}),
        ...(input.cost != null ? { cost: input.cost } : {}),
        ...(mainKey ? { main: statLabel(mainKey) } : {}),
        ...(subKey ? { substat: statLabel(subKey) } : {}),
        ...(input.echo ? { echo: input.echo } : {}),
        equipped: equippedMode,
        ...(wearer ? { equippedBy: characterName(wearer) } : {}),
        sort,
      },
      echoes: shown.items.map((r) => r.row),
      omitted: shown.omitted,
      note: "Main-stat values are the max-level value for the echo's rarity (the app stores no echo level). Fewer than 5 lines = not fully levelled.",
    });
  },
});
