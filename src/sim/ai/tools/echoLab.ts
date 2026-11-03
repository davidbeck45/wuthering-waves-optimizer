// Wuthering Tools+ AI tools — the /echo-lab page headless (src/sim/echoLab/): every inventory echo judged Keep / Spare /
// Feed by the app's engine on each character's best rotation (who it is an upgrade for, by how much), the feed list
// grouped the way the game filters echoes, and Transducer re-roll advice for a character's five echoes.
import type { EchoVerdict } from "../../echoLab/bestOwner";
import { feedGroups, reasonText } from "../../echoLab/echoLabView";
import { runJob } from "../../echoLab/pass";
import type { RerollAdviceResult } from "../../echoLab/rerollAdvice";
import { MIN_PLAN_GAIN, pickRerollFirst, planChips } from "../../echoLab/rerollPick";
import { echoLabFor } from "./memo";
import { characterName, compactJson, defineTool, echoName, nullableString, pct, resolveOwnCharacter, round, setName, statLabel, topN } from "./shared";

/** Each line with the plan's own lock / re-roll / keep, as the Re-roll tab's chips read it (planChips). */
function lineChips(a: RerollAdviceResult): string[] {
  const chips = planChips(a.lines, a.recommended && a.recommended.expectedGain >= MIN_PLAN_GAIN ? a.recommended : null);
  return a.lines.map((l) => {
    const c = chips.get(l.field);
    return `${statLabel(l.key)} ${round(l.value, 1)}: ${c?.chip ?? "lock"}${c?.order ? ` (#${c.order})` : ""}`;
  });
}

const SHOWS = ["feed", "keep", "spare", "reroll"] as const;
type Show = (typeof SHOWS)[number];

const subsText = (subs: EchoVerdict["subs"]): string => subs.map((s) => `${statLabel(s.key)} ${round(s.value, 1)}`).join(", ");

function echoRow(r: EchoVerdict): Record<string, unknown> {
  return {
    echo: echoName(r.echo),
    set: setName(r.set),
    cost: r.cost,
    main: statLabel(r.main),
    substats: subsText(r.subs) || "none yet",
    ...(r.lines < 5 ? { substatLines: r.lines } : {}),
    verdict: r.verdict,
    why: reasonText(r),
    ...(r.wornBy.length ? { wornBy: r.wornBy.map((w) => `${characterName(w.characterId)} (slot ${w.slot + 1})${w.stale ? " · marked only" : ""}`) } : {}),
    ...(r.best && r.best.gain > 0
      ? { bestFor: { character: characterName(r.best.characterId), slot: r.best.slot + 1, replaces: echoName(r.best.replacedEcho), damageGainPct: pct(r.best.gain) } }
      : {}),
    ...(r.potential ? { ifTuned: { chanceToBeatSlotPct: round(r.potential.pBeat * 100, 0), expectedGainPct: pct(r.potential.expectedGain) } } : {}),
  };
}

export const echoLabTool = defineTool<{ show: Show; character?: string }>({
  name: "echo_lab",
  description:
    "The /echo-lab page: every echo in the inventory judged by the app's engine on each character's best rotation (the ranking " +
    "enemy, Lv 100 / 20 % RES). keep = an upgrade for someone (exact damage gain, slot and the echo it replaces), worn, or worth " +
    "tuning; spare = no upgrade but within 2 % of its best owner's echo, a gamble to tune, or good substats nobody can slot; " +
    "feed = the rest. Swap rules: a swap keeps every set bonus and Healing Bonus and loses at most one ER roll. show feed gives " +
    "the feed list grouped as the game filters echoes (Sonata · Cost · Main Stat) with each echo; keep / spare list those " +
    "echoes; reroll gives Transducer advice for one character's equipped five-line echoes (lock or re-roll each line, the " +
    "chance a re-roll improves it, expected gain) and which echo to re-roll first. character narrows keep / spare to " +
    "upgrades for that character and is required for reroll. Damage gains are % of that character's rotation damage; tuning " +
    "and Transducer costs are approximate (verify in game).",
  input_schema: {
    type: "object",
    properties: {
      show: { type: "string", enum: SHOWS, description: "feed (what to feed), keep, spare, or reroll (needs character)." },
      character: nullableString("A set-up character (loose name): keep / spare upgrades for them, or their re-roll advice. null = everyone."),
    },
    required: ["show", "character"],
    additionalProperties: false,
  },
  provenance: "App engine · Echo Lab (your echoes on each character's best rotation)",
  async run(input, ctx) {
    const who = input.character ? resolveOwnCharacter(input.character, ctx.exp) : null;
    const { session, verdicts } = await echoLabFor(ctx.exp);
    const counts = verdicts.counts;
    const base = { counts: { keep: counts.keep, spare: counts.spare, feed: counts.feed }, charactersJudgedOn: verdicts.characters.length };
    const characterLink = who ? `&character=${encodeURIComponent(who)}` : "";
    if (input.show === "reroll") {
      if (!who) throw new Error("show reroll needs a character");
      const lab = verdicts.characters.find((c) => c.id === who);
      if (!lab) throw new Error(`${characterName(who)} needs a weapon, five echoes and a rotation for Echo Lab`);
      const advices: RerollAdviceResult[] = [];
      for (const s of lab.slots) {
        if (!s || s.lines.length < 5) continue;
        advices.push((await runJob(session, { kind: "reroll", characterId: who, slot: s.slot })) as RerollAdviceResult);
      }
      const first = pickRerollFirst(advices);
      return compactJson({
        character: characterName(who),
        rotation: lab.rotationName,
        rerollFirst: first ? `slot ${first.slot + 1} (${echoName(first.echo)})` : "none: no re-roll is expected to pay on these echoes",
        echoes: advices.map((a) => ({
          slot: a.slot + 1,
          echo: echoName(a.echo),
          lines: lineChips(a),
          plan: a.recommended
            ? {
                lock: a.recommended.locks,
                transducersPerTry: a.recommended.cost,
                chanceToImprovePct: round(a.recommended.pImprove * 100, 0),
                expectedGainPct: pct(a.recommended.expectedGain),
                transducersPerSuccess: a.recommended.transducersPerSuccess == null ? null : round(a.recommended.transducersPerSuccess, 0),
              }
            : "keep as is",
        })),
        notSoon: lab.slots.filter((s) => s && s.lines.length < 5).map((s) => `slot ${s!.slot + 1}: not fully tuned yet`),
        notes: ["Gains are % of the character's rotation damage. Lock costs 1/1/1/2/3 Transducers: verify in game."],
        path: `/echo-lab?tab=reroll${characterLink}`,
        label: "Echo Lab re-roll",
      });
    }
    if (input.show === "feed") {
      const byId = new Map(verdicts.echoes.map((e) => [e.echoId, e]));
      const groups = feedGroups(verdicts.echoes);
      const shown = topN(groups, 12);
      return compactJson({
        ...base,
        feedGroups: shown.items.map((g) => ({
          group: `${g.count} × Cost ${g.cost ?? "?"} · ${setName(g.set) ?? "no set"} · ${statLabel(g.main) ?? "?"} main`,
          echoes: g.echoIds.slice(0, 6).map((id) => {
            const e = byId.get(id)!;
            return `${echoName(e.echo)}: ${subsText(e.subs) || "no substats"} (${reasonText(e)})`;
          }),
        })),
        groupsOmitted: shown.omitted,
        notes: ["Filter the game's echo list by Sonata, Cost and Main Stat to find each group."],
        path: "/echo-lab?tab=verdicts",
        label: "Echo Lab",
      });
    }
    const rows = verdicts.echoes.filter((e) => e.verdict === input.show && (!who || e.upgradeFor.includes(who) || e.best?.characterId === who));
    rows.sort((a, b) => (b.best?.gain ?? -1) - (a.best?.gain ?? -1));
    const shown = topN(rows, 15);
    return compactJson({
      ...base,
      ...(who ? { forCharacter: characterName(who) } : {}),
      matching: rows.length,
      echoes: shown.items.map(echoRow),
      omitted: shown.omitted,
      notes: ["damageGainPct: the best owner's rotation damage with this echo in that slot instead of the one there now."],
      path: `/echo-lab?tab=verdicts${characterLink}`,
      label: "Echo Lab",
    });
  },
});
