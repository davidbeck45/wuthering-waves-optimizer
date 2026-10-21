---
status: accepted
date: 2026-10-12
tags: [components, optimizer, stores]
---

# 40. Optimizer echo buffs default to the calculator's settings, with a readiness run bar

## Context

Issue #618. In the optimizer, every optional echo set passive and main echo buff is off until turned on, and they sat in a collapsed "Configure buffs" panel. Players who never opened it ranked loadouts without those buffs, which undervalues the sets and echoes they picked, and the results looked complete either way. The Run button was below the fold, and its only warning was one generic sentence.

## Decision

1. **Unset optimizer buffs follow the calculator.** For each buff, the setting comes from the first of: the optimizer's own setting (`optimizer.echoSetPassives[key]`, `optimizer.mainEchoBuffs[echo].buffs[key]`), then the calculator's (`echoSetPassives[key]`, or `mainEcho.buffs[key]` only when `mainEcho.echo` is that echo, since the calculator only stores the equipped echo's buffs), then nothing (off, "Not set").
2. **Live, not copied.** `src/calculator/optimizerBuffStatus.ts` resolves it on read. Until a buff is changed in the optimizer, it tracks the calculator. The first change saves the full setting (enabled and stacks) so untick/retick doesn't lose the inherited stacks. "Use calculator setting" deletes the optimizer entry.
3. **One resolver for display and for the run.** The buff rows' `isEnabled`/`stacks`, and so the stats they emit to the optimizer, come from the same resolution as the badges, the "not set" count and the run bar. What's shown is what's run.
4. **"Not set" means nothing saved anywhere**, or enabled with 0 stacks on a stacking buff (it adds nothing). Explicitly off is a choice, not a warning. Always-enabled buffs never warn.
5. **Warn, never block.** Unset buffs are an amber chip in the run bar; leaving buffs off can be intentional. Only a missing echo set, main echo or target disables Run, as before.
6. **Sticky run bar at the top** of the setup, and a full-width **Echo buffs** section, open by default (not saved), with "Enable all" / "Max all" matching the other buff sections.
7. **v3 only.** The buff row components are shared with classic's optimizer; the fallback and badges are behind a `calculatorFallback` prop that only the v3 setup passes (ADR 0038: classic gets fixes, not features).

## Consequences

- Pros: most players have nothing left to set; results match the setup they actually play; the run bar says exactly what's missing.
- Cons: users who never touched a buff in the optimizer get different results after this ships, if their calculator has that buff on. That's intended: the old result silently left it off. No saved data changes shape, so no migration.

## Guidance

- **Do** read optimizer buff state through `resolveOptimizerBuff` (or the rows that use it) in v3, never `optimizer.echoSetPassives` directly.
- **Don't** copy calculator settings into `optimizer.*`; that breaks "follows the calculator until changed".
- **Don't** switch the buff list to `v-if` when collapsed: unmounting a row emits empty stats for it.

## Related

- `src/calculator/optimizerBuffStatus.ts`, `src/composables/useOptimizerEchoBuffs.ts`
- `src/components/optimizerWorkspace/OptimizerWorkspaceSetup.vue`, `OptimizerWorkspaceRunBar.vue`, `OptimizerWorkspaceBuffStatus.vue`
- `src/components/CalculatorOptimizerEchoSetPassive.vue`, `src/components/CalculatorMainEchoBuff.vue`, `src/stores/character.js`
- `tests/calculator/optimizerBuffStatus.test.ts`, `tests/components/CalculatorOptimizerEchoSetPassive.test.ts`, `tests/components/CalculatorMainEchoBuffOptimizer.test.ts`, `cypress/e2e/calculator/optimizer/workspaceReadiness.cy.ts`
