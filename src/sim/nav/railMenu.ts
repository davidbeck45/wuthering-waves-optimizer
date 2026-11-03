// Wuthering Tools+ — where the v3 desktop rail's Tools+ menu opens (PlusNavMenu.vue, variant "rail"). It used to open at
// the top of the window (y 12) while its rail item sits half way down (y ≈ 376 at 1440 × 900), over the calculator's
// section tabs and far from the button that opened it (2026-11-02 core audit L9). Now its top lines up with the item,
// moved up only as far as it must to fit the window, never above the margin. The menu scrolls inside itself when the
// window is shorter than it (its max-height in PlusNavMenu.vue).

/** The menu's top (px from the top of the window): beside its item, as low as fits. */
export function railMenuTop(itemTop: number, menuHeight: number, viewportHeight: number, margin = 12): number {
  const lowestFit = viewportHeight - menuHeight - margin;
  return Math.round(Math.max(margin, Math.min(itemTop, lowestFit)));
}
