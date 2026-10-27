// Wuthering Tools+ AI tools — a character's kit as the app stores it (skill names, resonance-chain text and
// whether the engine models each node), and wuwa_calc's sequence breakpoints (which sequences change the loop).
import { getCharByName } from "../../../characters/characters";
import { nodeOf, sequenceOf, isSetUp } from "../../myRankings/rankRoster";
import { describeBreakpoints, loadSequenceBreakpoints } from "../../presets";
import { characterName, compactJson, defineTool, resolveAnyCharacter } from "./shared";

/** In-game rich text → plain text (tags out, entities decoded, whitespace collapsed). */
export function plainText(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

const SKILL_SLOTS: Array<[string, string]> = [
  ["basicAttacks", "Basic Attack"],
  ["skillAttacks", "Resonance Skill"],
  ["liberationAttacks", "Resonance Liberation"],
  ["forteCircuitAttacks", "Forte Circuit"],
  ["introAttacks", "Intro Skill"],
  ["outroAttacks", "Outro Skill"],
  ["tuneBreakAttacks", "Tune Break"],
];

export const getKitTool = defineTool<{ character: string; sequence?: number }>({
  name: "get_kit",
  description:
    "A character's kit from the app's character data (any character the app knows, owned or not): element, weapon type, the " +
    "name of each skill, and the six resonance-chain (sequence) nodes with their in-game text — clipped unless one `sequence` is " +
    "asked for, then that node in full with its mode variants. `modelled` says whether the engine applies a stat or multiplier " +
    "effect for the node; false means its effect (a kill effect, energy, utility) is text only and no damage number reflects it. " +
    "Use it to explain what a sequence does before quantifying it with what_if.",
  input_schema: {
    type: "object",
    properties: {
      character: { type: "string", description: "Character name, loose." },
      sequence: { type: "integer", enum: [1, 2, 3, 4, 5, 6], description: "One node to read in full (S1–S6). Omit for all six, clipped." },
    },
    required: ["character"],
    additionalProperties: false,
  },
  provenance: "App character data (in-game text)",
  async run(input, ctx) {
    const id = resolveAnyCharacter(input.character, ctx.exp);
    const data = (await getCharByName(id)) as Record<string, any> | null;
    if (!data) throw new Error(`No character data for ${characterName(id)}`);
    const basic = data.basic ?? {};
    const skills: Record<string, string> = {};
    for (const [field, label] of SKILL_SLOTS) if (data[field]?.name) skills[label] = String(data[field].name);
    const nodes = new Map<number, Array<Record<string, any>>>();
    for (const def of (data.resonanceChains ?? []) as Array<Record<string, any>>) {
      const node = nodeOf(String(def.key ?? ""));
      if (!node) continue;
      if (!nodes.has(node)) nodes.set(node, []);
      nodes.get(node)!.push(def);
    }
    const own = ctx.exp.characters[id];
    const current = own && isSetUp(own) ? sequenceOf(own) : null;
    const levels = input.sequence ? [input.sequence] : [1, 2, 3, 4, 5, 6];
    const full = Boolean(input.sequence);
    const sequences = levels
      .filter((n) => nodes.has(n))
      .map((n) => {
        const defs = nodes.get(n)!;
        const [first, ...variants] = defs;
        return {
          level: `S${n}`,
          name: String(first.name ?? "").replace(/^Sequence Node \d+:\s*/i, ""),
          text: clip(plainText(first.details ?? ""), full ? 2400 : 320),
          modelled: defs.some((d) => Array.isArray(d.modifiers) && d.modifiers.length > 0),
          ...(variants.length
            ? { variants: variants.map((v) => ({ mode: v.stance ?? null, text: clip(plainText(v.details ?? ""), full ? 1200 : 160) })) }
            : {}),
          ...(current != null ? { unlocked: current >= n } : {}),
        };
      });
    return compactJson({
      character: String(basic.name ?? characterName(id)),
      element: basic.element ?? null,
      weapon: basic.weapon ?? null,
      rarity: basic.rarity ?? null,
      ...(current != null ? { yourSequence: `S${current}` } : { yourSequence: "not set up" }),
      skills,
      sequences,
      note: full ? null : "Node text clipped; ask for one sequence to read it in full.",
    });
  },
});

export const sequenceBreakpointsTool = defineTool<{ character: string }>({
  name: "sequence_breakpoints",
  description:
    "Which sequences change a character's rotation in Riley31415's wuwa_calc solves (a generated table): for each of his loadouts " +
    "(weapon · echo set · mode), the sequence levels where the steady-state loop switches and what each switch adds or drops, " +
    "plus his one-line note on what each sequence node does in his engine. A level that only changes the opener or start of " +
    "combat is marked as such (the loop the player presses stays the same). Answers 'does S2 change how I play her', not how much " +
    "damage it adds (use what_if for that).",
  input_schema: {
    type: "object",
    properties: { character: { type: "string", description: "Character name, loose (any character the app knows)." } },
    required: ["character"],
    additionalProperties: false,
  },
  provenance: "wuwa_calc sequence breakpoints (generated)",
  async run(input, ctx) {
    const id = resolveAnyCharacter(input.character, ctx.exp);
    const b = await loadSequenceBreakpoints(id);
    const own = ctx.exp.characters[id];
    if (!b) return compactJson({ character: characterName(id), available: false, note: "No wuwa_calc breakpoint data for this character." });
    return compactJson({
      character: characterName(id),
      available: true,
      yourSequence: own && isSetUp(own) ? `S${sequenceOf(own)}` : "not set up",
      loadouts: b.loadouts.slice(0, 6).map((l) => ({ loadout: l.label, summary: describeBreakpoints(l), loopChangesAt: l.loopChangesAt.map((n) => `S${n}`), intendedTeams: l.intendedTeams })),
      loadoutsOmitted: Math.max(0, b.loadouts.length - 6),
      sequences: b.sequences.map((s) => ({ level: `S${s.level}`, name: s.name, rileysNote: clip(s.note, 420) })),
    });
  },
});
