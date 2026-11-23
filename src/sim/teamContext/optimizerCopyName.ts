// Wuthering Tools+ — what Ryan's "Optimize a copy without them" (ADR 0061) names its copy on plus (batch 5).
//
// His copy is "<name> (optimizer)": the team with the hand-set echo buffs taken out of its actions, made so the search
// may decide them. On plus a name marked "(wuwa_calc …)" is a generated team (`isGeneratedTeamName`): Sync my teams
// rewrites it in place from Riley's data, which would put the actions back as his rotation has them and undo what the
// copy is for. The stock form "(wuwa_calc t307)" matched anywhere in the name and "wuwa_calc …" at its start, so the
// copy of such a team was still generated; only the "… (wuwa_calc)" form lost the mark by accident. The copy is the
// player's own team: the generated mark comes off, whichever form it had, and nothing else changes.

const MARKS = [/\s*\(wuwa_calc t\d+\)/g, /\s*\(wuwa_calc\)\s*$/, /^wuwa_calc\s+/];

export function optimizerCopyName(name: string | null | undefined): string {
  let base = String(name ?? "").trim() || "Team";
  for (const mark of MARKS) base = base.replace(mark, "");
  return `${base.trim() || "Team"} (optimizer)`;
}
