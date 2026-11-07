// Wuthering Tools+ — "Whole account": what the page says, kept out of the component so it is testable. Pure.
import { characterDisplayName } from "../../display/names";
import { teamTitle } from "../../display/teamName";
import { buffDefaultNames, echoName, statShort, setName, teammatesNote, worthSaving } from "../buildTeamView";
import type { AccountMember, BuildAccountResult, EchoMove } from "./buildAccount";
import type { AccountStage } from "./useBuildAccount";

/** "+3.2 %" / "−1.5 %" / "±0 %" of a ratio's change (1.032 → "+3.2 %"). */
export function ratioText(ratio: number, digits = 1): string {
  const d = (ratio - 1) * 100;
  if (!Number.isFinite(d) || Math.abs(d) < 0.05) return "±0 %";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)} %`;
}

export const ratioTone = (ratio: number): "up" | "down" | "flat" => (Math.abs(ratio - 1) < 0.0005 ? "flat" : ratio > 1 ? "up" : "down");

/** The account score as a change against today: Σ weight × team damage ÷ today's, over Σ weight. */
export const accountRatio = (score: { today: number }, value: number): number => (score.today > 0 ? value / score.today : 1);

export const STAGE_TEXT: Record<AccountStage, string> = {
  plans: "Asking wuwa_calc for each team's plan",
  prepare: "Setting up every member",
  greedy: "Best build for each member, in priority order",
  improve: "Improving: trying to hand contested echoes to whoever gains more",
  verify: "Checking every team with the calculator",
};

export const STOPPED_TEXT: Record<BuildAccountResult["search"]["stoppedBy"], string> = {
  converged: "it found nothing more to improve",
  budget: "its time ran out (60 s)",
  stopped: "you stopped it",
  rounds: "it reached its round limit",
};

/** One line on what the improvement pass did, in words. */
export function searchLine(r: Pick<BuildAccountResult, "search" | "score">): string {
  const s = r.search;
  if (s.kept === "greedy") return `The improvement pass moved some echoes, but the calculator's team totals scored the first pass higher, so the plan keeps the first pass (${STOPPED_TEXT[s.stoppedBy]}).`;
  if (!s.moves.length) return s.conflicts ? `The improvement pass checked ${s.conflicts} pair${s.conflicts === 1 ? "" : "s"} of members who could use the same echoes and found no better split (${STOPPED_TEXT[s.stoppedBy]}).` : "No two members can use the same echoes, so the first pass is already the plan.";
  const gain = r.score.today > 0 ? ((r.score.final - r.score.greedy) / r.score.today) * 100 : 0;
  return `The improvement pass kept ${s.moves.length} change${s.moves.length === 1 ? "" : "s"}: ${gain >= 0.05 ? `+${gain.toFixed(1)}` : gain <= -0.05 ? `−${Math.abs(gain).toFixed(1)}` : "±0"} points of weighted team damage over the first pass (${STOPPED_TEXT[s.stoppedBy]}).`;
}

/** ER needs met among the members who got a build: today and with the plan. */
export function erNeedsMet(members: readonly AccountMember[]): { before: number; after: number; of: number } {
  let before = 0;
  let after = 0;
  let of = 0;
  for (const m of members) {
    if (m.status !== "ok" || m.erFloor == null) continue;
    of += 1;
    if (m.before?.menuEr != null && m.before.menuEr + 1e-6 >= m.erFloor) before += 1;
    if (m.erMet) after += 1;
  }
  return { before, after, of };
}

/** "9 new builds, 2 keep today's echoes": the builds the Save button saves (`accountApplyRequest`), and the members it
 *  leaves out because nothing would change for them. */
export function buildCountText(members: ReadonlyArray<Pick<AccountMember, "status">>, saving: number): string {
  const kept = members.filter((m) => m.status === "ok").length - saving;
  const builds = saving ? `${saving} new build${saving === 1 ? "" : "s"}` : "No new builds";
  return kept > 0 ? `${builds}, ${kept} keep${kept === 1 ? "s" : ""} today's echoes` : builds;
}

/** Why the plan scores below today, when it does: meeting Energy Regen needs costs damage, or the teams' builds were
 *  already the best these echoes allow under the plans. Null when it is not below. */
export function whyLower(r: Pick<BuildAccountResult, "score" | "members">): string | null {
  if (!(r.score.final < r.score.today - 0.0005 * r.score.today)) return null;
  const er = erNeedsMet(r.members as AccountMember[]);
  const more = er.after - er.before;
  if (more > 0) return `Below today because ${more} more build${more === 1 ? "" : "s"} now meet${more === 1 ? "s" : ""} the Energy Regen their rotation needs (wuwa_calc's loop), which costs some damage. A build that meets its need comes first, as in Build my team.`;
  return "Below today: under the plans' sets and main stats your echoes cannot match what the teams wear now. Turn off “The plans' sets” or “The plans' main stats” to let the builds move further.";
}

/** Why a member's number moved, in a few words (or null). */
export function memberNote(m: AccountMember): string | null {
  if (m.status !== "ok") return m.message ?? null;
  const notes: string[] = [];
  // `keptCurrent` alone is not enough: a swap can change a build that started as today's
  if (m.sameEchoes && worthSaving(m) && m.buffDefaults.length) notes.push(`same echoes as today: the change is ${buffDefaultNames(m.buffDefaults).join(", ")}, switched on`);
  else if (m.sameEchoes) notes.push("keeps today's echoes");
  if (m.erFloor != null && m.erMet && m.before?.menuEr != null && m.before.menuEr + 1e-6 < m.erFloor) notes.push(`now meets the ${m.erFloor.toFixed(1)} % Energy Regen need (today ${m.before.menuEr.toFixed(1)} %)`);
  else if (m.erUnreachable) notes.push(`${m.erFloor?.toFixed(1)} % Energy Regen is out of reach with these echoes: the most ER found`);
  else if (m.erMet === false) notes.push(`short of ${m.erFloor?.toFixed(1)} % Energy Regen on the character screen: the search counted a buff that isn't always on`);
  if (m.relaxed === "mainStats") notes.push("any main stat (the plan's ones ran out)");
  if (m.relaxed === "layout") notes.push("any cost layout (the plan's ran out)");
  if (m.mainEchoFallback) notes.push("another main echo (the plan's is not free)");
  const worn = m.after?.picks.length ?? 0;
  if (worn && worn < 5) notes.push(`${worn} echo${worn === 1 ? "" : "es"}, not 5: nothing spare fits the empty slot under the 12 cost limit`);
  if (m.otherSetEchoes) notes.push(`${m.otherSetEchoes === 1 ? "one echo" : `${m.otherSetEchoes} echoes`} from outside the plan's sets (too few of them were free)`);
  const teammates = teammatesNote(m);
  if (teammates) notes.push(teammates.replace(/\.$/, ""));
  return notes.length ? notes.join(" · ") : null;
}

/** "Havoc Eclipse 4-cost Crit DMG Dreamless: Camellya → Roccia". */
export function moveText(mv: EchoMove): string {
  const what = `${echoName(mv.echo)} (${mv.cost}-cost ${statShort(mv.stat)}${mv.set ? `, ${setName(mv.set)}` : ""})`;
  return `${what}: ${mv.from.map((c) => characterDisplayName(c)).join(", ")} → ${characterDisplayName(mv.to)}`;
}

/** The confirm dialog's list: each character's new build, where it is pinned, and whether it becomes active. */
export function confirmItems(r: BuildAccountResult, saving: ReadonlyArray<{ characterId: string; pins: Array<{ teamId: string; slot: number }> }>, makeActive: boolean, names: Record<string, string>): string[] {
  const teamName = (id: string): string => teamTitle(r.teams.find((t) => t.spec.id === id)?.spec.name) || "a saved team";
  return saving.map((m) => {
    const pins = m.pins.length ? `, pinned in ${m.pins.map((p) => `“${teamName(p.teamId)}” slot ${p.slot + 1}`).join(" and ")}` : "";
    return `${characterDisplayName(m.characterId)}: new build “${names[m.characterId] ?? "Account plan"}”${pins}${makeActive ? ", made active" : ""}`;
  });
}

/** Seconds as "48 s" / "1 min 12 s". */
export function secondsText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
