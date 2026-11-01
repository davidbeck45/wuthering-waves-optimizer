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

/** Scroll to an element once it is on the page (a palette command's `?team=` / `?focus=` target), centred so the fixed
 *  nav never covers it, and outline it for a moment. Polls on a timer (no requestAnimationFrame: it never fires in a
 *  background tab or headless Electron). Resolves with the element, or null after `timeoutMs`. */
export function scrollToWhenPresent(selector: string, options: { timeoutMs?: number; doc?: Document } = {}): Promise<Element | null> {
  const doc = options.doc ?? document;
  const until = Date.now() + (options.timeoutMs ?? 15000);
  return new Promise((resolve) => {
    const tick = (): void => {
      const el = doc.querySelector(selector);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.setAttribute("data-wt-focused", "");
        const html = el as HTMLElement;
        const before = html.style.outline;
        html.style.outline = "2px solid oklch(var(--p))";
        html.style.outlineOffset = "2px";
        setTimeout(() => {
          html.style.outline = before;
          html.style.outlineOffset = "";
        }, 2500);
        resolve(el);
        return;
      }
      if (Date.now() > until) resolve(null);
      else setTimeout(tick, 150);
    };
    tick();
  });
}
