// Wuthering Tools+ Echo Lab — what the line model (lineModel.ts) does and how close it was measured, in the words the
// pages' notes use. No imports, so a page can read it without loading the engine. The figures are in the README.
export const LINE_MODEL_NOTE =
  "The damage engine scores each new line on its own, and each pair of stats that matter together, so lines combine as they do in its formula (Crit Rate with Crit DMG, ATK % with flat ATK). On one account, whole echoes run through the engine on the same tries landed within 0.01 percentage points of these gains and 1 percentage point of these chances. The tries are a sample, so a gain shown here can still sit about 0.05 points from its long-run figure, and a chance about 1 point.";
