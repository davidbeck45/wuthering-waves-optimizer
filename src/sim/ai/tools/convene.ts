// Wuthering Tools+ AI tools — the /convene page's pull advisor headless (src/sim/convene/advisor*.ts): every featured 5★
// on the banners running now, what its next copies add to the player's own build (the app's engine, best rotation),
// what they cost in Astrite from the player's pity (their imported Convene history, or the pity typed on the page),
// and the chance their Astrite budget gets there. Reads the page's stored history, banner cache and preferences.
import seedFile from "../../convene/data/bannerSeed.json";
import { MAX_PULLS_SINCE_LAST_FIVE } from "../../../convene/simulateConvene";
import { adviceSummary, advisorTargets, priceAdvice, pullsForAstrite, stepTitle, type AdviceRow, type PoolPityInput } from "../../convene/advisor";
import { scoreAdvisorTargets } from "../../convene/advisorEngine";
import { BANNER_CACHE_KEY, loadBanners, type BannerCache } from "../../convene/banners";
import { CONVENE_HISTORY_KEY, readConveneHistory } from "../../convene/gachaImport";
import { historyPity } from "../../convene/pity";
import { poolOf } from "../../convene/pools";
import { CONVENE_PREFS_KEY, guessServerRegion, readConvenePrefs, serverOffsetHours } from "../../convene/prefs";
import { characterName, compactJson, defineTool, nullableString, pct, round, type ToolContext } from "./shared";

const seed = ((seedFile as { default?: unknown }).default ?? seedFile) as unknown as BannerCache;
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const STATUS_TEXT: Record<AdviceRow["status"], string> = {
  ok: "scored",
  "not-owned": "not on your account: the engine has no build to score (Team rankings can show their teams)",
  "not-set-up": "in the app without a weapon: set them up in the calculator to score it",
  maxed: "already S6 / R5: another copy adds nothing",
  "no-owner": "no character in the app names this weapon as their signature",
  "not-in-app": "not in this app yet",
  error: "the engine could not score it",
};

function pityState(ctx: ToolContext): { pools: Array<Record<string, unknown>>; byPool: Record<number, PoolPityInput>; budget: number | null; history: boolean } {
  const storage = ctx.storage ?? null;
  const prefs = readConvenePrefs(storage);
  const read = readConveneHistory(storage);
  const player = read.ok ? (read.history.players[read.history.activePlayerId ?? ""] ?? Object.values(read.history.players)[0] ?? null) : null;
  const pity = player ? historyPity(player) : null;
  const byPool: Record<number, PoolPityInput> = {};
  const pools: Array<Record<string, unknown>> = [];
  for (const type of [1, 2]) {
    const hist = pity?.pools.find((p) => p.poolType === type) ?? null;
    const typed = prefs.manualPity[String(type)] ?? null;
    const state = typed ?? (hist ? { pity: hist.pity5, guaranteed: hist.guaranteed === true } : null);
    byPool[type] = { pity: Math.min(MAX_PULLS_SINCE_LAST_FIVE, state?.pity ?? 0), guaranteed: state?.guaranteed ?? false };
    pools.push({
      pool: poolOf(type)?.short ?? `Pool ${type}`,
      pity: byPool[type]!.pity,
      // unknown pity: the odds assume a 50/50, which is not the same as knowing it is one
      ...(type === 1 ? { nextFiveStarIsFeatured: state ? byPool[type]!.guaranteed : "unknown (counted as a 50/50)" } : {}),
      source: typed ? "typed on the advisor tab" : hist ? "your imported Convene history" : "unknown (counted as 0)",
      ...(!typed && hist?.pity5LowerBound ? { note: "a minimum: the six-month history has no 5★ on this pool yet" } : {}),
      ...(!typed && hist && type === 1 && !hist.guaranteeKnown ? { fiftyFifty: "unknown" } : {}),
    });
  }
  return { pools, byPool, budget: prefs.budgetAstrite, history: !!pity && pity.pulls > 0 };
}

export const pullAdviceTool = defineTool<{ item?: string }>({
  name: "pull_advice",
  description:
    "The /convene page's pull advisor: every featured 5★ on the banners running now (resonators and weapons), what its next " +
    "copy and each copy after it (to S6 / R5) adds to the player's own build — the app's engine on that character's best " +
    "rotation at the ranking enemy, a weapon on its signature owner with passives at full stacks (stats-only floor beside it) " +
    "— and what it costs from their current pity: expected Astrite, the pulls half / nine in ten players need, % damage per " +
    "1,000 Astrite (the ranking), and the chance their Astrite budget reaches it when one is set on the page. Pity comes from " +
    "the player's imported Convene history or the pity they typed on the advisor tab (else 0). Characters they don't own are " +
    "not scored. item narrows it to one featured resonator or weapon (loose name); null = every running banner, best value " +
    "first. Banners the player hasn't seen yet in this browser may be missing until /convene refreshes Kuro's feed.",
  input_schema: {
    type: "object",
    properties: {
      item: nullableString("One featured resonator or weapon (loose name). null = everything on the running banners."),
    },
    required: ["item"],
    additionalProperties: false,
  },
  provenance: "App engine + Convene odds · /convene pull advisor",
  reads: [CONVENE_HISTORY_KEY, BANNER_CACHE_KEY, CONVENE_PREFS_KEY],
  async run(input, ctx) {
    const now = ctx.now.getTime();
    const prefs = readConvenePrefs(ctx.storage ?? null);
    const server = prefs.server ?? guessServerRegion(-ctx.now.getTimezoneOffset());
    const feed = loadBanners({ seed, storage: ctx.storage ?? null, serverOffsetHours: serverOffsetHours(server), revalidate: false, listAll: true, now }).feed;
    const banners = feed.banners.filter((b) => b.startMs <= now);
    let targets = advisorTargets(banners, now);
    const live = targets.map((t) => t.item.name);
    if (input.item) {
      const needle = squash(input.item);
      const hit = targets.filter((t) => squash(t.item.name).includes(needle) || (t.item.key != null && squash(characterName(t.item.key)).includes(needle)));
      if (!hit.length) {
        return compactJson({
          item: input.item,
          onABannerNow: false,
          runningNow: live,
          note: "Not featured on a banner running now, so the advisor can't price it. what_if scores a sequence or weapon on the account without the Astrite side.",
          path: "/convene?tab=advisor",
          label: "Pull advisor",
        });
      }
      targets = hit;
    }
    const pity = pityState(ctx);
    const damage = await scoreAdvisorTargets({ targets, characters: ctx.exp.characters, echoes: ctx.exp.inventory.echoes }, { yieldToUi: false });
    const rows = priceAdvice(targets, damage, { pity: pity.byPool, budgetAstrite: pity.budget });
    const budgetPulls = pity.budget ? pullsForAstrite(pity.budget) : null;
    return compactJson({
      summary: adviceSummary(rows),
      pity: pity.pools,
      ...(pity.budget ? { budget: `${pity.budget} Astrite = ${budgetPulls} pulls` } : {}),
      // one row per phase (its resonator and weapon banners share a label and an end)
      banners: [...new Map(targets.map((t) => [`${t.bannerLabel ?? t.bannerTitle}|${t.endMs}`, t])).values()].map((t) => ({ banner: t.bannerLabel ?? t.bannerTitle, endsInDays: round((t.endMs - now) / 86_400_000, 1) })),
      items: rows.map((r) => ({
        item: r.target.item.name,
        kind: r.target.kind,
        ...(r.rank != null ? { rank: r.rank } : {}),
        ...(r.characterName && r.target.kind === "weapon" ? { onCharacter: r.characterName } : {}),
        status: STATUS_TEXT[r.status],
        ...(r.current ? { youHave: r.current } : {}),
        ...(r.rotation ? { scoredOn: r.rotation } : {}),
        steps: r.steps.slice(0, 4).map((s) => ({
          step: stepTitle(r, s),
          damageGainPct: pct(s.gain),
          ...(s.low ? { statsOnlyGainPct: pct(s.low.gain) } : {}),
          expectedAstrite: Math.round(s.cost.meanAstrite),
          pullsHalfOfPlayers: s.cost.p50Pulls,
          pullsNineInTen: s.cost.p90Pulls,
          gainPctPer1000Astrite: round(s.perThousand, 2),
          ...(s.chance != null ? { chanceWithBudgetPct: round(s.chance * 100, 0) } : {}),
        })),
        ...(r.steps.length > 4 ? { moreSteps: r.steps.length - 4 } : {}),
        ...(r.note ? { note: r.note } : {}),
      })),
      notes: [
        "Each step counts from today: damageGainPct is the total gain with every copy up to that step, expectedAstrite and the pulls the total to get there. damageGainPct is one character's rotation damage (the app's engine), not team DPS. Odds: Kuro's 80-pull hard pity and the 50/50 on resonator banners.",
        ...(pity.history ? [] : ["No Convene history imported in this browser: pity counts as 0 unless typed on the advisor tab."]),
      ],
      path: "/convene?tab=advisor",
      label: "Pull advisor",
    });
  },
});
