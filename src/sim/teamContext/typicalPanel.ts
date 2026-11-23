// Wuthering Tools+ — a Team Buffs panel that Ryan's Recommended teams wrote is a default, not the player's choice
// (batch 5, lane post-merge).
//
// The resolver keeps a panel that names exactly a team's teammates as the player's own and stops deriving that member's
// team buffs from the real builds (resolveTeam.ts). His "Use team" (lab `recommendedTeams`, #663) names the two
// teammates and turns on their *typical* buffs at S0 without the signature weapon, which is a guess, not a curation: a
// saved team of those three would freeze on it. So the panel is stamped as his "Use team" left it, and while it still
// reads exactly so the resolver derives as before. Any change by hand afterwards (a buff, its stacks, a teammate) makes
// it the player's panel again. The stamp lives in the panel itself (`plusTypical`), so it travels with builds and backups
// and needs no storage of its own.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The parts of a panel a player can change: the two teammates (either order) and every buff that is on. */
function panelPrint(panel: Record<string, any> | null | undefined): string {
  const picks = [panel?.selectedCharacter1 ?? null, panel?.selectedCharacter2 ?? null].filter(Boolean).sort();
  const on = Object.entries((panel?.buffs ?? {}) as Record<string, any>)
    .filter(([, entry]) => entry?.isEnabled)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => [key, entry.stacks ?? null, entry.refinement ?? null, entry.baseAttrValue ?? null]);
  return JSON.stringify([picks, on]);
}

/** Stamp a character's panel as Recommended teams just wrote it. Call right after his "Use team" with buffs. */
export function markTypicalPanel(record: Record<string, any> | null | undefined): void {
  if (!record?.teamBuffs) return;
  record.teamBuffs.plusTypical = panelPrint(record.teamBuffs);
}

/** True while the panel still reads exactly as Recommended teams wrote it: a default, so the resolver derives. */
export function isTypicalPanel(panel: Record<string, any> | null | undefined): boolean {
  return typeof panel?.plusTypical === "string" && panel.plusTypical === panelPrint(panel);
}
