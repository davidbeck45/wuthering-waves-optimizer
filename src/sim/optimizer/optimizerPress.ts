// Wuthering Tools+ — when a press of the calculator's Optimize button may start a run (harvest-leftovers, 2026-11-05).
//
// The optimizer panel is on screen while the character's module and then its weapon are still loading (a slow chunk, a
// character just picked). A run reads what the page holds at that moment, so one started then scored a half-loaded
// character, and the rows came back wrong under a normal "Processed 100 of 100 loadouts": with no module
// `buildOptimizerRotationData` drops every action it cannot resolve and the base stats are zero (Zani's top row read 3436
// instead of 1761746); with the module but no weapon yet, her top row read 780811. The weapon comes last because only the
// module says which kind it is (`weaponType`), and the panels fetch it after that and report through `update-weapon`.
//
// So a press too early is held and runs once both are in, on what the page holds by then. A later press replaces it (the
// panel's latest settings win, and one press is one run). A weapon that can never come (none chosen, or one this build
// does not have) holds nothing back: the run then matches the page, which reads that character with no weapon too. Pure:
// Calculator.vue hands in what these mean and calls `settle` when one of them may have changed.

export interface OptimizerPressHooks<Args extends unknown[]> {
  /** the character's module is in, and the page has read it */
  characterIn: () => boolean;
  /** the weapon panel has reported the weapon this character and build hold */
  weaponIn: () => boolean;
  /** a weapon is chosen and its module can be had (the panel's report is then on its way) */
  weaponCanLoad: () => Promise<boolean>;
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  run: (...args: Args) => void;
}

export interface OptimizerPress<Args extends unknown[]> {
  /** Optimize was pressed: run now, or hold until the page has what a run reads. */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  press: (...args: Args) => void;
  /** Something a held press waits on may have arrived. */
  settle: () => void;
  /** Forget a held press: the player cancelled, or picked another character (those settings were for the old one). */
  drop: () => void;
}

export function optimizerPress<Args extends unknown[]>(hooks: OptimizerPressHooks<Args>): OptimizerPress<Args> {
  let held: Args | null = null;
  const start = (): void => {
    const args = held!;
    held = null;
    hooks.run(...args);
  };
  const settle = (): void => {
    if (!held || !hooks.characterIn()) return;
    if (hooks.weaponIn()) {
      start();
      return;
    }
    const asked = held;
    void hooks.weaponCanLoad().catch(() => false).then((canLoad) => {
      // still the same press, and the page has not moved on to loading another character since
      if (!canLoad && held === asked && hooks.characterIn()) start();
    });
  };
  return {
    press: (...args) => {
      held = args;
      settle();
    },
    settle,
    drop: () => {
      held = null;
    },
  };
}
