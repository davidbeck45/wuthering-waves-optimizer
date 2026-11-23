// Wuthering Tools+ — Optimize team's "Nothing to save" line.
//
// Plus's own check of which picks were already worn (`slotsAlreadyWorn`, batch 4) is retired: Ryan's ADR 0061 Save does
// the same job (`savePlan()` → `saving` / `unchanged`, `buildMatchesResult`), and teamOptimizerOnPlus.test.ts's
// "Optimize team's Save" tests hold it on plus (saved twice it adds no build; a member already wearing the pick gets
// none). What stays is the line the results page shows when nothing would be saved.

export const NOTHING_TO_SAVE = "Nothing to save: these are the builds this team already wears.";
