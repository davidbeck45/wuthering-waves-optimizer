// Wuthering Tools+ shell — small DOM helpers for PlusShell and the palette. Browser-only, no Vue.

/** A modal is up: an open modal <dialog> (every chooser, ConfirmDialog, the palette, AI settings) or an aria-modal
 *  bottom sheet (the v3 phone command sheet, CalculatorCommandSheet.vue). The Ask button steps aside for both,
 *  and Esc then belongs to the modal, not the panel. */
export function anyModalOpen(doc: Document): boolean {
  for (const dialog of Array.from(doc.querySelectorAll("dialog[open]"))) {
    let modal = true;
    try {
      modal = dialog.matches(":modal");
    } catch {
      /* an engine without :modal — treat every open dialog as modal */
    }
    if (modal) return true;
  }
  return Array.from(doc.querySelectorAll('[aria-modal="true"]')).some((el) => (el as HTMLElement).getClientRects().length > 0);
}

/** The event comes from somewhere the player types (an input, a textarea, a select, an editor). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
}
