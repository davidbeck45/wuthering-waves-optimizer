// Wuthering Tools+ — "Build it for me": the page's view model (labels, chips, formatters). Pure.
import { mainEchoesData } from "../../echoes/index";
import { echoSetLabelMap, getEchoSetIconByType } from "../../echoes/stats";
import { characterDisplayName } from "../display/names";
import { shortfallText, type BuildTeamResult, type EchoSource, type MemberOutcome } from "./buildTeam";
import { LAYOUT_COSTS, type MemberPlan } from "./rileyPlan";

export const STAT_SHORT: Record<string, string> = {
  CritRate: "Crit Rate",
  CritDMG: "Crit DMG",
  ATK: "ATK%",
  HP: "HP%",
  DEF: "DEF%",
  EnergyRegen: "ER",
  HealingBonus: "Healing",
  Glacio: "Glacio",
  Fusion: "Fusion",
  Electro: "Electro",
  Aero: "Aero",
  Spectro: "Spectro",
  Havoc: "Havoc",
};
export const statShort = (k: string | null | undefined): string => (k ? STAT_SHORT[k] ?? k : "—");

/** The layout as cost groups: [{ cost: 4, stats: ["Crit DMG"] }, { cost: 3, stats: ["ATK%", "Fusion"] }, …]. */
export function layoutGroups(plan: Pick<MemberPlan, "mainStats">): Array<{ cost: number; stats: string[] }> {
  const ms = plan.mainStats;
  if (!ms) return [];
  const costs = LAYOUT_COSTS[ms.layout];
  const out: Array<{ cost: number; stats: string[] }> = [];
  costs.forEach((cost, i) => {
    const last = out[out.length - 1];
    const stat = statShort(ms.slots[i]);
    if (last && last.cost === cost) last.stats.push(stat);
    else out.push({ cost, stats: [stat] });
  });
  return out;
}

export const setName = (key: string): string => echoSetLabelMap[key] ?? key;
export const setIcon = (key: string | null | undefined): string | null => (key ? getEchoSetIconByType(key) ?? null : null);
export const echoName = (key: string | null | undefined): string => (key ? (mainEchoesData as Record<string, { name: string }>)[key]?.name ?? key : "—");
export const echoImage = (key: string | null | undefined): string | null => (key ? (mainEchoesData as Record<string, { image?: string }>)[key]?.image ?? null : null);

export const PLAN_SOURCE_LABEL: Record<MemberPlan["source"], string> = {
  riley: "wuwa_calc pick",
  preset: "Ryan's preset",
  current: "Your current build",
  none: "No plan",
};

/** "Main DPS · 87 % of team DPS" / "Support · 1.2 %". */
export function roleLine(plan: Pick<MemberPlan, "mainDps" | "share">): string {
  const role = plan.mainDps ? "Main DPS" : "Support";
  if (plan.share == null) return role;
  const pct = plan.share * 100;
  return `${role} · ${pct >= 10 ? Math.round(pct) : pct.toFixed(1)} % of team DPS`;
}

export const fmtInt = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));

/** 1.234M / 482K — headline damage. */
export function compactNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return String(Math.round(n));
}

/** Relative change as text: "+3.2 %", "−1.5 %", "±0 %". */
export function deltaText(before: number | null | undefined, after: number | null | undefined, digits = 1): string {
  if (before == null || after == null || !(before > 0)) return "";
  const d = (after / before - 1) * 100;
  if (Math.abs(d) < 0.05) return "±0 %";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)} %`;
}

export function deltaTone(before: number | null | undefined, after: number | null | undefined): "up" | "down" | "flat" {
  if (before == null || after == null || !(before > 0)) return "flat";
  const d = after / before - 1;
  return d > 0.0005 ? "up" : d < -0.0005 ? "down" : "flat";
}

export const pctText = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)} %`);

/** The ER line's band: met (≥ need), short, or no gate. */
export function erBand(m: Pick<MemberOutcome, "erFloor" | "erMet">): "met" | "short" | "none" {
  if (m.erFloor == null) return "none";
  return m.erMet ? "met" : "short";
}

export const SOURCE_LABEL: Record<EchoSource, string> = { own: "Yours", teammate: "Teammate's", free: "Unworn", other: "Worn by" };

export function sourceText(source: EchoSource, wornBy: readonly string[], characterId: string): string {
  if (source === "own") return "Already worn";
  if (source === "free") return "Unworn";
  const who = wornBy.filter((w) => w !== characterId).map((w) => characterDisplayName(w));
  return source === "teammate" ? `From ${who.join(", ")}` : `Worn by ${who.join(", ")}`;
}

/** The result's change on the objective, relative (0.012 = +1.2 %); null without both numbers. */
const relChange = (m: Pick<MemberOutcome, "before" | "after">): number | null =>
  m.before && m.after ? m.after.value / Math.max(1, m.before.value) - 1 : null;

/** Today's build misses the ER floor and the new one meets it (what a lower number buys). */
const buysErFloor = (m: Pick<MemberOutcome, "before" | "erFloor" | "erMet">): boolean =>
  m.erMet === true && m.erFloor != null && m.before?.menuEr != null && m.before.menuEr + 1e-6 < m.erFloor;

/** Is this result worth a new build on its own: new echoes that score at least as much, or less only to meet an ER
 *  floor today's build misses; the same echoes only when the run's buff settings score more. */
export function worthSaving(m: MemberOutcome): boolean {
  const rel = relChange(m);
  if (m.status !== "ok" || !m.draft || rel == null) return false;
  if (m.sameEchoes) return rel > 0.0005;
  return rel >= -0.0005 || buysErFloor(m);
}

/** The Save ticks the result opens with: every member `worthSaving`, plus any teammate whose echoes a ticked build
 *  takes (leaving them on their old build would put one echo in the team twice). */
export function defaultSaveSlots(members: readonly MemberOutcome[]): boolean[] {
  const ticks = members.map(worthSaving);
  for (let round = 0; round < members.length; round++) {
    let changed = false;
    members.forEach((m, i) => {
      if (!ticks[i]) return;
      for (const p of m.after?.picks ?? []) {
        for (const w of p.sharedWith ?? []) {
          const j = members.findIndex((x) => x.characterId === w);
          if (j >= 0 && !ticks[j] && members[j]!.status === "ok" && members[j]!.draft) {
            ticks[j] = true;
            changed = true;
          }
        }
      }
    });
    if (!changed) break;
  }
  return ticks;
}

export interface ShareConflict {
  /** the member whose new build takes the echo */
  characterId: string;
  echoId: string;
  echo: string;
  /** the teammate whose build in this team keeps wearing it (not being saved) */
  teammate: string;
}

/** Echoes a build being saved takes from a teammate whose build in this team is not being replaced: saved as they
 *  stand, the team would wear those echoes twice. */
export function shareConflicts(members: readonly MemberOutcome[], saving: ReadonlySet<string>): ShareConflict[] {
  const out: ShareConflict[] = [];
  for (const m of members) {
    if (!saving.has(m.characterId)) continue;
    for (const p of m.after?.picks ?? []) {
      for (const w of p.sharedWith ?? []) if (!saving.has(w)) out.push({ characterId: m.characterId, echoId: String(p.echo.echoId), echo: echoName(p.echo.echo), teammate: w });
    }
  }
  return out;
}

/** One sentence for the save bar: "Lucilla's build in this team keeps 2 echoes a new build takes: tick it too, or the
 *  team wears them twice." */
export function conflictText(conflicts: readonly ShareConflict[]): string {
  if (!conflicts.length) return "";
  const byMate = new Map<string, number>();
  for (const c of conflicts) byMate.set(c.teammate, (byMate.get(c.teammate) ?? 0) + 1);
  const names = [...byMate.keys()].map((w) => characterDisplayName(w));
  const n = conflicts.length;
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `${who}'s build${names.length > 1 ? "s" : ""} in this team keep${names.length > 1 ? "" : "s"} ${n === 1 ? "an echo" : `${n} echoes`} a new build takes: tick ${names.length > 1 ? "them" : "it"} too, or the team wears ${n === 1 ? "it" : "them"} twice.`;
}

/** The notes a result card lists under the numbers, most important first. */
export function resultNotes(m: MemberOutcome, plan: MemberPlan | undefined): Array<{ tone: "info" | "warn" | "error"; text: string }> {
  const out: Array<{ tone: "info" | "warn" | "error"; text: string }> = [];
  if (m.status !== "ok") return out;
  const b = m.before;
  const rel = relChange(m);
  const lower = rel != null && rel < -0.0005 && !m.sameEchoes;
  if (b && m.erFloor != null && b.menuEr != null && buysErFloor(m) && lower) {
    out.push({ tone: "info", text: `Today's build is ${(m.erFloor - b.menuEr).toFixed(1)} points short of the ${pctText(m.erFloor)} Energy Regen this loop needs: the new build pays for that ER with a little damage.` });
  }
  if (m.erUnreachable && m.erFloor != null) out.push({ tone: "error", text: `No build of these sets reaches ${pctText(m.erFloor)} Energy Regen: this is the most ER your echoes allow.` });
  else if (lower && !buysErFloor(m)) {
    out.push({ tone: "warn", text: "Scores less than the build worn today: the plan's sets cost damage here, or a teammate earlier in the priority order took echoes it wore." });
  }
  if (m.relaxed === "mainStats" || m.relaxed === "layout") {
    const missing = (m.shortfall ?? []).map(shortfallText).join(" and ");
    const what = m.relaxed === "layout" ? "any cost layout" : "any main stat";
    out.push({ tone: "warn", text: `The ${plan?.source === "riley" ? "wuwa_calc" : "plan's"} main stats were out of reach${missing ? ` (no ${missing} echo left)` : ""}, so ${what} was allowed.` });
  }
  if (m.mainEchoFallback && plan?.mainEcho) out.push({ tone: "warn", text: `No ${plan.mainEcho.name} free: the main slot holds the best echo of that cost instead.` });
  if (m.keptCurrent || m.sameEchoes) {
    const buffsMoved = m.buffDefaults.length > 0 && rel != null && Math.abs(rel) > 0.0005;
    out.push({ tone: "info", text: buffsMoved ? "Same echoes as today: the change is the set or main-echo buffs below, switched on." : "Same echoes as today: this team's best build is the one you wear." });
  }
  if (plan?.sets.length && !m.meetsPlanSets && m.relaxed !== "layout") out.push({ tone: "warn", text: `Wears ${Object.entries(m.setsWorn).map(([k, n]) => `${n} ${setName(k)}`).join(" + ")}, not the plan's ${plan.setsLabel}.` });
  return out;
}

/** "Pact of Neonlight Leap 5pc (Neonlight…)" — the buffs switched on, named. */
export function buffDefaultNames(keys: readonly string[]): string[] {
  const spaced = (x: string): string => x.replace(/([a-z])([A-Z])/g, "$1 $2");
  return keys.map((k) => {
    const [echo, buff] = k.includes(":") ? k.split(":") : [null, k];
    if (echo) return `${echoName(echo)}'s buff`;
    const key = buff ?? k;
    const m = /^(.*?)(\d)Set(.*)$/.exec(key);
    if (m) {
      const label = echoSetLabelMap[m[1]!] ?? spaced(m[1]!);
      return `${label} ${m[2]}pc${m[3] ? ` (${spaced(m[3])})` : ""}`;
    }
    // a passive named after its set alone ("PactofNeonlightLeap") or the set plus a suffix
    const set = Object.keys(echoSetLabelMap).filter((s) => key.startsWith(s)).sort((a, b) => b.length - a.length)[0];
    if (!set) return spaced(key);
    const rest = key.slice(set.length);
    return `${echoSetLabelMap[set]}${rest ? ` (${spaced(rest)})` : ""}`;
  });
}

/** One line for the whole run: what was optimised and how. */
export function runSummary(r: BuildTeamResult): string {
  const obj = r.objectiveKind === "team" ? "the team's own rotation" : "each member's best rotation";
  const orders = r.ordersTried > 1 ? `${r.ordersTried} priority orders tried` : "one priority order";
  const swaps = r.swaps.length ? `${r.swaps.length} swap${r.swaps.length > 1 ? "s" : ""} between members` : "no swap improved it";
  return `Scored on ${obj} · ${orders} · ${swaps} · ${(r.ms / 1000).toFixed(1)} s`;
}
